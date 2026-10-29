import { protectIdentification } from "../apps/api/src/identity";
import argon2 from "argon2";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildApp } from "../apps/api/src/app";
import { db, hash, token, decrypt, encrypt } from "../apps/api/src/core";
import { totp } from "../apps/api/src/auth";
import { seed } from "../prisma/seed";
import { roles } from "../packages/shared/src/index";
import { randomUUID, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
let app: FastifyInstance;
const prefix = `test-${randomUUID()}`;
const password = `Aa1!${randomBytes(24).toString("hex")}`;
const created: string[] = [];
type Actor = { id: string; cookie: string; csrf: string };
async function actor(
  role: keyof typeof roles,
  districtId?: string,
): Promise<Actor> {
  const user = await db.user.create({
    data: {
      ...(role === "PEMOHON"
        ? protectIdentification(`UJIAN${randomBytes(6).toString("hex")}`)
        : {}),
      name: `DATA UJIAN ${role}`,
      email: `${prefix.slice(-8)}-${role.slice(0, 10).toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`,
      phone: "0123456789",
      kind: role === "PEMOHON" ? "APPLICANT" : "OFFICER",
      emailVerified: true,
      roles: { create: { roleId: role, districtId, reference: "DATA UJIAN" } },
    },
  });
  created.push(user.id);
  const raw = token(),
    csrf = token();
  await db.session.create({
    data: {
      id: hash(raw),
      userId: user.id,
      activeRole: role,
      mfaVerified: true,
      csrfHash: hash(csrf),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return { id: user.id, cookie: `staylink=${raw}`, csrf };
}
function request(a: Actor, url: string, method: any = "GET", payload?: any) {
  return app.inject({
    url,
    method,
    headers: {
      cookie: a.cookie,
      origin: "http://localhost:5173",
      "x-csrf-token": a.csrf,
    },
    payload,
  });
}
async function emailToken(email: string, type: string) {
  const log = await db.emailDeliveryLog.findFirstOrThrow({
    where: { recipient: email, type },
    orderBy: { createdAt: "desc" },
  });
  if (log.status === "SENT") {
    const msgs: any = await fetch("http://localhost:8025/api/v1/messages").then(
      (r) => r.json(),
    );
    const m = msgs.messages.find((m: any) =>
      m.To?.some((to: any) => to.Address === email),
    );
    const detail: any = await fetch(
      `http://localhost:8025/api/v1/message/${m.ID}`,
    ).then((r) => r.json());
    return new URL(detail.Text.trim()).searchParams.get("token")!;
  }
  return new URL(
    JSON.parse(decrypt(log.encryptedPayload)).text.trim(),
  ).searchParams.get("token")!;
}
let applicant: Actor,
  ict: Actor,
  ops: Actor,
  template: Actor,
  ppsk: Actor,
  pic: Actor;
let companyId: string, areaId: string, templateId: string;
beforeAll(async () => {
  if (
    !process.env.TEST_DATABASE_URL ||
    !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")
  )
    throw Error(
      "TEST_DATABASE_URL mesti pangkalan data khusus berakhir _test.",
    );
  await seed();
  app = await buildApp();
  applicant = await actor("PEMOHON");
  ict = await actor("PENTADBIR_ICT");
  ops = await actor("PENTADBIR_OPERASI", "SPU");
  template = await actor("PENTADBIR_TEMPLAT");
  ppsk = await actor("PPSK", "SPU");
  pic = await actor("PIC_KAWASAN", "SPU");
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});
describe("authentication, real PostgreSQL and test SMTP", () => {
  it("health endpoint is live", async () =>
    expect((await app.inject("/api/health")).statusCode).toBe(200));
  it("rejects unauthenticated dashboard", async () =>
    expect((await app.inject("/api/dashboard")).statusCode).toBe(401));
  it("registers applicant and sends verification email through Mailpit", async () => {
    const email = `${prefix}-register@example.test`;
    const result = await app.inject({
      url: "/api/auth/register",
      method: "POST",
      payload: {
        identificationNumber: `UJIAN${randomBytes(6).toString("hex")}`,
        name: "DATA UJIAN Pemohon",
        email,
        phone: "0123456789",
        password,
        consent: true,
      },
    });
    expect(result.statusCode).toBe(201);
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    created.push(u.id);
    expect(u.passwordHash).toMatch(/^\$argon2id/);
    const delivery = await db.emailDeliveryLog.findFirstOrThrow({
      where: { userId: u.id },
    });
    expect(delivery.status).toBe("SENT");
    const t = await emailToken(email, "VERIFICATION");
    const verify = () =>
      app.inject({
        url: "/api/auth/activate",
        method: "POST",
        payload: { token: t, type: "VERIFY_EMAIL" },
      });
    expect((await verify()).statusCode).toBe(200);
    expect((await verify()).statusCode).toBe(400);
  });
  it("rejects officer self registration input", async () => {
    const email = `${prefix}-public-officer@example.test`;
    await app.inject({
      url: "/api/auth/register",
      method: "POST",
      payload: {
        identificationNumber: `UJIAN${randomBytes(6).toString("hex")}`,
        name: "DATA UJIAN Awam",
        email,
        phone: "0123456789",
        password,
        consent: true,
        kind: "OFFICER",
        roleId: "PENTADBIR_ICT",
      },
    });
    const u = await db.user.findUniqueOrThrow({
      where: { email },
      include: { roles: true },
    });
    created.push(u.id);
    expect(u.kind).toBe("APPLICANT");
    expect(u.roles.map((r) => r.roleId)).toEqual(["PEMOHON"]);
  });
  it("logs in with HTTP-only cookie and rejects wrong password", async () => {
    const email = `${prefix}-register@example.test`;
    const login = await app.inject({
      url: "/api/auth/login",
      method: "POST",
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toContain("HttpOnly");
    expect(login.headers["set-cookie"]).toContain("SameSite=Strict");
    expect(
      (
        await app.inject({
          url: "/api/auth/login",
          method: "POST",
          payload: { email, password: "incorrect" },
        })
      ).statusCode,
    ).toBe(401);
  });
  it("blocks CSRF and foreign origins", async () => {
    expect(
      (
        await app.inject({
          url: "/api/profile",
          method: "PATCH",
          headers: { cookie: applicant.cookie },
          payload: { name: "Malicious", phone: "0123456789" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/profile",
          method: "PATCH",
          headers: {
            cookie: applicant.cookie,
            origin: "https://evil.test",
            "x-csrf-token": applicant.csrf,
          },
          payload: { name: "Malicious", phone: "0123456789" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("denies applicants and operations admin access to officer creation", async () => {
    expect(
      (await request(applicant, "/api/admin/officers", "POST", {})).statusCode,
    ).toBe(403);
    expect(
      (await request(ops, "/api/admin/officers", "POST", {})).statusCode,
    ).toBe(403);
  });
  it("invites, activates and enrolls an officer with real TOTP and recovery codes", async () => {
    const email = `${prefix}-invited@example.test`;
    const invitation = await request(ict, "/api/admin/officers", "POST", {
      name: "DATA UJIAN Pegawai",
      email,
      phone: "0123456789",
      roleId: "PIC_KAWASAN",
      departmentId: "BANGUNAN",
      districtId: "SPU",
      reference: "UJIAN PELANTIKAN",
    });
    expect(invitation.statusCode).toBe(201);
    created.push(invitation.json().id);
    const t = await emailToken(email, "INVITATION");
    expect(
      (
        await app.inject({
          url: "/api/auth/activate",
          method: "POST",
          payload: { token: t, type: "OFFICER_INVITE", password },
        })
      ).statusCode,
    ).toBe(200);
    const login = await app.inject({
      url: "/api/auth/login",
      method: "POST",
      payload: { email, password },
    });
    const a = {
      id: invitation.json().id,
      cookie: String(login.headers["set-cookie"]).split(";")[0],
      csrf: login.json().csrf,
    };
    expect((await request(a, "/api/areas")).statusCode).toBe(403);
    const setup = await request(a, "/api/auth/mfa/setup", "POST");
    expect(setup.statusCode).toBe(200);
    expect(setup.json().qr).toMatch(/^data:image\/png/);
    expect(
      (await request(a, "/api/auth/mfa/verify", "POST", { code: "xxxxxx" }))
        .statusCode,
    ).toBe(400);
    const code = totp(setup.json().secret).generate();
    const verified = await request(a, "/api/auth/mfa/verify", "POST", { code });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().recoveryCodes).toHaveLength(8);
    expect(
      (await request(a, "/api/auth/mfa/verify", "POST", { code })).statusCode,
    ).toBe(400);
    const recovery = verified.json().recoveryCodes[0];
    expect(
      (await request(a, "/api/auth/mfa/recovery", "POST", { code: recovery }))
        .statusCode,
    ).toBe(200);
    expect(
      (await request(a, "/api/auth/mfa/recovery", "POST", { code: recovery }))
        .statusCode,
    ).toBe(400);
    const role = await request(a, "/api/auth/role", "POST", {
      roleId: "PIC_KAWASAN",
    });
    expect(role.statusCode).toBe(200);
    expect((await request(a, "/api/areas")).statusCode).toBe(200);
    expect((await request(a, "/api/auth/mfa/setup", "POST")).statusCode).toBe(
      409,
    );
  });
  it("rejects expired and future appointments on every API request", async () => {
    const expired = await actor("PENTADBIR_TEMPLAT");
    await db.userRoleAssignment.updateMany({
      where: { userId: expired.id },
      data: { endsAt: new Date("2020-01-01") },
    });
    expect((await request(expired, "/api/templates")).statusCode).toBe(403);
    const future = await actor("PENTADBIR_TEMPLAT");
    await db.userRoleAssignment.updateMany({
      where: { userId: future.id },
      data: { startsAt: new Date("2099-01-01") },
    });
    expect((await request(future, "/api/templates")).statusCode).toBe(403);
  });
  it("supports role switching but denies forged roles", async () => {
    expect(
      (
        await request(applicant, "/api/auth/role", "POST", {
          roleId: "PENTADBIR_ICT",
        })
      ).statusCode,
    ).toBe(403);
    await db.userRoleAssignment.create({
      data: { userId: ict.id, roleId: "PPSK", reference: "DATA UJIAN MULTI" },
    });
    expect(
      (await request(ict, "/api/auth/role", "POST", { roleId: "PPSK" }))
        .statusCode,
    ).toBe(200);
    expect((await request(ict, "/api/admin/users")).statusCode).toBe(403);
    await request(ict, "/api/auth/role", "POST", { roleId: "PENTADBIR_ICT" });
  });
  it("protects encrypted factor secrets", () => {
    const encrypted = encrypt("SECRET-TEST");
    expect(encrypted).not.toContain("SECRET");
    expect(decrypt(encrypted)).toBe("SECRET-TEST");
    expect(() => decrypt(encrypted.slice(0, -2) + "ff")).toThrow();
  });
});
describe("companies, IDOR and secure document storage", () => {
  it("creates a company with unverified representative", async () => {
    const r = await request(applicant, "/api/companies", "POST", {
      name: "DATA UJIAN Syarikat",
      registrationNumber: `ssm-${prefix.slice(-16)}`,
      address: "Alamat syarikat untuk data ujian sahaja",
      phone: "0123456789",
      email: "company@example.test",
      authorityType: "PENGARAH",
    });
    expect(r.statusCode).toBe(201);
    companyId = r.json().id;
    expect(r.json().informationStatus).toBe("UNVERIFIED");
  });
  it("prevents duplicate normalized SSM", async () => {
    const r = await request(applicant, "/api/companies", "POST", {
      name: "DATA UJIAN Pendua",
      registrationNumber: `SSM ${prefix.slice(-16).replaceAll("-", " ")}`,
      address: "Alamat syarikat untuk data ujian sahaja",
      phone: "0123456789",
      email: "company@example.test",
      authorityType: "PENGARAH",
    });
    expect(r.statusCode).toBe(409);
  });
  it("denies cross user company access and document upload", async () => {
    const other = await actor("PEMOHON");
    expect(
      (
        await request(other, `/api/companies/${companyId}`, "PATCH", {
          name: "Hijack",
          address: "Alamat akses tidak dibenarkan",
          phone: "0123456789",
          email: "other@example.test",
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request(
          other,
          `/api/companies/${companyId}/documents`,
          "POST",
          {},
        )
      ).statusCode,
    ).toBe(404);
  });
  it("validates PDF signature and isolates private downloads", async () => {
    expect(
      (
        await request(
          applicant,
          `/api/companies/${companyId}/documents`,
          "POST",
          {
            fileName: "not.pdf",
            content: Buffer.from("invalid-file").toString("base64"),
          },
        )
      ).statusCode,
    ).toBe(400);
    const doc = await request(
      applicant,
      `/api/companies/${companyId}/documents`,
      "POST",
      {
        fileName: "surat-ujian.pdf",
        content: Buffer.from("%PDF-1.4\nDATA UJIAN\n%%EOF").toString("base64"),
      },
    );
    expect(doc.statusCode).toBe(200);
    const other = await actor("PEMOHON");
    expect(
      (await request(other, `/api/documents/${doc.json().id}`)).statusCode,
    ).toBe(404);
    const download = await request(
      applicant,
      `/api/documents/${doc.json().id}`,
    );
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-disposition"]).toContain("attachment");
  });
  it("returns genuine empty application state", async () => {
    const d = await request(applicant, "/api/dashboard");
    expect(d.json().applications).toEqual([]);
    expect(d.json().companies).toHaveLength(1);
  });
});
describe("area scopes, templates, notifications and audit", () => {
  it("creates scoped areas and rejects cross district changes", async () => {
    const r = await request(ops, "/api/areas", "POST", {
      name: `DATA UJIAN ${prefix}`,
      districtId: "SPU",
    });
    expect(r.statusCode).toBe(200);
    areaId = r.json().id;
    expect(
      (
        await request(ops, "/api/areas", "POST", {
          name: `DATA UJIAN forbidden ${prefix}`,
          districtId: "SPS",
        })
      ).statusCode,
    ).toBe(403);
  });
  it("leaves unmapped PIC unresolved and assigns with reason", async () => {
    expect(
      (await request(ppsk, `/api/areas/${areaId}/resolve`)).json().status,
    ).toBe("PERLU PENENTUAN PPSK");
    expect(
      (
        await request(ppsk, "/api/areas/assign", "POST", {
          areaId,
          userId: pic.id,
          reason: "short",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request(ppsk, "/api/areas/assign", "POST", {
          areaId,
          userId: pic.id,
          reason: "Pelantikan PIC untuk data ujian",
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request(ppsk, `/api/areas/${areaId}/resolve`)).json().userId,
    ).toBe(pic.id);
  });
  it("serializes concurrent reassignments so only one current PIC remains", async () => {
    const b = {
      areaId,
      userId: pic.id,
      reason: "Penugasan semula untuk ujian serentak",
    };
    const results = await Promise.all([
      request(ppsk, "/api/areas/assign", "POST", b),
      request(ppsk, "/api/areas/assign", "POST", b),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(
      await db.areaAssignment.count({ where: { areaId, endsAt: null } }),
    ).toBe(1);
  });
  it("only template admin can create and activate versions", async () => {
    const b = {
      name: `DATA UJIAN ${prefix}`,
      category: "Surat kelulusan",
      content: "Kandungan draf untuk ujian sahaja.",
    };
    expect((await request(ict, "/api/templates", "POST", b)).statusCode).toBe(
      403,
    );
    const r = await request(template, "/api/templates", "POST", b);
    expect(r.statusCode).toBe(200);
    templateId = r.json().id;
    const v = await db.templateVersion.findFirstOrThrow({
      where: { templateId },
    });
    expect(
      (
        await request(
          template,
          `/api/template-versions/${v.id}/activate`,
          "POST",
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await request(ops, `/api/template-versions/${v.id}/activate`, "POST"))
        .statusCode,
    ).toBe(403);
  });
  it("creates a second immutable template version and archives previous active", async () => {
    const r = await request(
      template,
      `/api/templates/${templateId}/versions`,
      "POST",
      { content: "Versi kedua untuk ujian sahaja." },
    );
    expect(r.json().version).toBe(2);
    await request(
      template,
      `/api/template-versions/${r.json().id}/activate`,
      "POST",
    );
    expect(
      await db.templateVersion.count({
        where: { templateId, status: "ACTIVE" },
      }),
    ).toBe(1);
    expect(
      await db.templateVersion.count({
        where: { templateId, status: "ARCHIVED" },
      }),
    ).toBe(1);
  });
  it("isolates config scopes and stores version history", async () => {
    expect(
      (
        await request(ict, "/api/config/operations", "POST", {
          key: "sla.days",
          value: 7,
          reason: "Data ujian tetapan",
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(ops, "/api/config/operations", "POST", {
          key: `test.${prefix.replaceAll("-", "_")}`,
          value: 7,
          reason: "Data ujian tetapan",
        })
      ).statusCode,
    ).toBe(200);
    expect(
      await db.configurationVersion.count({
        where: { key: `operations.test.${prefix.replaceAll("-", "_")}` },
      }),
    ).toBe(1);
  });
  it("audits access denials and assignment changes without exposing hashes", async () => {
    const log = await request(ict, "/api/audit");
    expect(log.statusCode).toBe(200);
    expect(log.json().some((a: any) => a.action === "AREA_REASSIGNED")).toBe(
      true,
    );
    expect(log.body).not.toContain("$argon2");
    expect((await request(applicant, "/api/audit")).statusCode).toBe(403);
    const users = await request(ict, "/api/admin/users");
    expect(users.body).not.toContain("passwordHash");
    expect(users.body).not.toContain("encryptedSecret");
  });
  it("notification reads are isolated by recipient", async () => {
    const notification = await db.notification.findFirstOrThrow({
      where: { userId: pic.id },
    });
    const result = await request(
      applicant,
      `/api/notifications/${notification.id}/read`,
      "POST",
    );
    expect(result.json().count).toBe(0);
    expect(
      (
        await request(pic, `/api/notifications/${notification.id}/read`, "POST")
      ).json().count,
    ).toBe(1);
  });
  it("suspension revokes sessions immediately", async () => {
    const other = await actor("PEMOHON");
    expect(
      (
        await request(ict, `/api/admin/users/${other.id}/status`, "PATCH", {
          status: "SUSPENDED",
          reason: "DATA UJIAN penggantungan",
        })
      ).statusCode,
    ).toBe(200);
    expect((await request(other, "/api/dashboard")).statusCode).toBe(401);
  });
});

describe("expiry, password recovery and additional isolation checks", () => {
  it("rejects expired activation tokens", async () => {
    const raw = token();
    await db.authenticationIdentity.create({
      data: {
        userId: applicant.id,
        provider: "VERIFY_EMAIL",
        tokenHash: hash(raw),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const result = await app.inject({
      url: "/api/auth/activate",
      method: "POST",
      payload: { token: raw, type: "VERIFY_EMAIL" },
    });
    expect(result.statusCode).toBe(400);
  });
  it("password recovery sends a one-use link and revokes previous sessions", async () => {
    const target = await actor("PEMOHON");
    const user = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    const recovery = await app.inject({
      url: "/api/auth/recover",
      method: "POST",
      payload: { email: user.email },
    });
    expect(recovery.statusCode).toBe(200);
    const raw = await emailToken(user.email, "SECURITY");
    const reset = await app.inject({
      url: "/api/auth/activate",
      method: "POST",
      payload: {
        type: "RESET_PASSWORD",
        token: raw,
        password,
      },
    });
    expect(reset.statusCode).toBe(200);
    expect((await request(target, "/api/dashboard")).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: "/api/auth/activate",
          method: "POST",
          payload: {
            type: "RESET_PASSWORD",
            token: raw,
            password,
          },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("returns the same recovery message for unknown addresses", async () => {
    const result = await app.inject({
      url: "/api/auth/recover",
      method: "POST",
      payload: { email: `unknown-${randomUUID()}@example.test` },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().message).toContain("Jika akaun layak");
  });
  it("denies PIC verification when document geography is not established", async () =>
    expect((await request(pic, "/api/representations")).statusCode).toBe(403));
  it("rejects PIC assignment to a different district", async () => {
    const other = await actor("PIC_KAWASAN", "SPS");
    expect(
      (
        await request(ppsk, "/api/areas/assign", "POST", {
          areaId,
          userId: other.id,
          reason: "DATA UJIAN lintas daerah tidak dibenarkan",
        })
      ).statusCode,
    ).toBe(400);
  });
  it("does not disclose other districts through area listing", async () => {
    const south = await actor("PENTADBIR_OPERASI", "SPS");
    const result = await request(south, "/api/areas");
    expect(result.statusCode).toBe(200);
    expect(result.json().every((a: any) => a.districtId === "SPS")).toBe(true);
    expect(result.json().some((a: any) => a.id === areaId)).toBe(false);
  });
  it("does not let an administrator change their own privileges or MFA", async () => {
    expect(
      (
        await request(ict, `/api/admin/users/${ict.id}/mfa-reset`, "POST", {
          reason: "DATA UJIAN pemulihan sendiri ditolak",
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(ict, `/api/admin/users/${ict.id}/roles`, "POST", {
          roleId: "PENTADBIR_TEMPLAT",
          departmentId: "ICT",
          reference: "DATA UJIAN",
          startsAt: new Date().toISOString(),
        })
      ).statusCode,
    ).toBe(403);
  });
});

describe("authentication rate limiting", () => {
  it("returns 429 after the configured sensitive endpoint limit", async () => {
    let response;
    for (let i = 0; i < 11; i++)
      response = await app.inject({
        url: "/api/auth/mfa/verify",
        method: "POST",
        payload: { code: "000000" },
      });
    expect(response!.statusCode).toBe(429);
  });
});

describe("Phase 2A applicant identity and company representation", () => {
  const registration = (
    identificationNumber: string,
    email = `p2a-${randomUUID()}@example.test`,
  ) =>
    app.inject({
      url: "/api/auth/register",
      method: "POST",
      remoteAddress: `10.40.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200) + 1}`,
      payload: {
        name: "DATA UJIAN Akaun Fasa 2A",
        identificationNumber,
        email,
        phone: "0123456789",
        password,
        consent: true,
      },
    });
  const companyBody = () => ({
    name: "DATA UJIAN Syarikat Fasa 2A",
    registrationNumber: `UJIAN${randomBytes(8).toString("hex")}`,
    address: "Alamat data ujian sahaja, bukan premis sebenar",
    phone: "0000000000",
    email: "syarikat-ujian@example.test",
    authorityType: "PENGARAH",
  });
  async function company(owner: Actor) {
    const r = await request(owner, "/api/companies", "POST", companyBody());
    expect(r.statusCode).toBe(201);
    return r.json().id as string;
  }
  async function invitation(owner: Actor, companyId: string, recipient: Actor) {
    const u = await db.user.findUniqueOrThrow({ where: { id: recipient.id } });
    const r = await request(
      owner,
      `/api/companies/${companyId}/invitations`,
      "POST",
      { email: u.email, authorityType: "PEKERJA" },
    );
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toContain("token");
    const raw = await emailToken(u.email, "COMPANY_INVITATION");
    return { id: r.json().id, token: raw };
  }
  it("requires identification, encrypts it and blocks normalized duplicates across emails", async () => {
    const raw = `UJIAN${randomBytes(6).toString("hex")}`,
      email = `p2a-${randomUUID()}@example.test`;
    const r = await registration(raw, email);
    expect(r.statusCode).toBe(201);
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    expect(u.identificationEncrypted).not.toContain(raw);
    expect(u.identificationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(u.identificationMasked).toBe("••••" + raw.slice(-4).toUpperCase());
    const duplicate = await registration(
      raw.toLowerCase().slice(0, 5) + "-" + raw.slice(5),
    );
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.body).not.toContain(raw);
    expect((await registration("???")).statusCode).toBe(400);
  });
  it("enforces identification uniqueness under concurrent registrations", async () => {
    const raw = `UJIAN${randomBytes(6).toString("hex")}`;
    const responses = await Promise.all([registration(raw), registration(raw)]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
  });
  it("does not expose full identification, ciphertext or lookup hash in account and admin responses", async () => {
    const a = await actor("PEMOHON");
    const user = await db.user.findUniqueOrThrow({ where: { id: a.id } });
    const me = await request(a, "/api/auth/me");
    expect(me.json().user.identificationMasked).toBe(user.identificationMasked);
    expect(me.body).not.toContain(user.identificationEncrypted!);
    expect(me.body).not.toContain(user.identificationHash!);
    const users = await request(ict, "/api/admin/users");
    expect(users.body).not.toContain("identificationEncrypted");
    expect(users.body).not.toContain("identificationHash");
  });
  it("lets a verified legacy applicant attach identification once with password confirmation", async () => {
    const a = await actor("PEMOHON");
    await db.user.update({
      where: { id: a.id },
      data: {
        identificationHash: null,
        identificationEncrypted: null,
        identificationMasked: null,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    const b = {
      identificationNumber: `UJIAN${randomBytes(6).toString("hex")}`,
      currentPassword: password,
    };
    expect(
      (await request(a, "/api/companies", "POST", companyBody())).statusCode,
    ).toBe(409);
    expect(
      (
        await request(a, "/api/profile/identification", "POST", {
          ...b,
          currentPassword: "wrong",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await request(a, "/api/profile/identification", "POST", b)).statusCode,
    ).toBe(200);
    expect(
      (await request(a, "/api/profile/identification", "POST", b)).statusCode,
    ).toBe(409);
    expect(
      (await request(a, "/api/companies", "POST", companyBody())).statusCode,
    ).toBe(201);
  });
  it("supports multiple distinct company profiles under one applicant account without official verification", async () => {
    const owner = await actor("PEMOHON");
    await company(owner);
    await company(owner);
    const list = await request(owner, "/api/companies");
    expect(list.json()).toHaveLength(2);
    expect(
      list
        .json()
        .every(
          (r: any) =>
            r.status === "UNVERIFIED" &&
            r.company.informationStatus === "UNVERIFIED" &&
            r.company.status === "ACTIVE",
        ),
    ).toBe(true);
    expect((await request(owner, "/api/representations")).statusCode).toBe(403);
  });
  it("requires recipient consent and rejects wrong-account, replay and cross-company access", async () => {
    const owner = await actor("PEMOHON"),
      recipient = await actor("PEMOHON"),
      other = await actor("PEMOHON");
    const c = await company(owner),
      invite = await invitation(owner, c, recipient);
    expect(
      await db.companyRepresentative.count({ where: { companyId: c } }),
    ).toBe(1);
    expect(
      (
        await request(other, "/api/company-invitations/preview", "POST", {
          token: invite.token,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request(other, "/api/company-invitations/accept", "POST", {
          token: invite.token,
        })
      ).statusCode,
    ).toBe(400);
    const preview = await request(
      recipient,
      "/api/company-invitations/preview",
      "POST",
      { token: invite.token },
    );
    expect(preview.json().companyName).toBe("DATA UJIAN Syarikat Fasa 2A");
    const accepted = await request(
      recipient,
      "/api/company-invitations/accept",
      "POST",
      { token: invite.token },
    );
    expect(accepted.statusCode).toBe(200);
    expect(
      (
        await request(recipient, "/api/company-invitations/accept", "POST", {
          token: invite.token,
        })
      ).statusCode,
    ).toBe(400);
    const r = await db.companyRepresentative.findUniqueOrThrow({
      where: { userId_companyId: { userId: recipient.id, companyId: c } },
    });
    expect(r.status).toBe("UNVERIFIED");
    expect(r.canManageRepresentatives).toBe(false);
    expect(
      (await request(recipient, `/api/companies/${c}/representatives`)).json(),
    ).toHaveLength(2);
    expect(
      (await request(other, `/api/companies/${c}/representatives`)).statusCode,
    ).toBe(404);
    const target = await db.user.findUniqueOrThrow({ where: { id: other.id } });
    expect(
      (
        await request(recipient, `/api/companies/${c}/invitations`, "POST", {
          email: target.email,
          authorityType: "PEKERJA",
        })
      ).statusCode,
    ).toBe(403);
  });
  it("rejects expired invitations and an inviter whose authority was revoked", async () => {
    const owner = await actor("PEMOHON"),
      recipient = await actor("PEMOHON");
    const c = await company(owner),
      expired = await invitation(owner, c, recipient);
    await db.companyRepresentationInvitation.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (
        await request(recipient, "/api/company-invitations/accept", "POST", {
          token: expired.token,
        })
      ).statusCode,
    ).toBe(400);
    const next = await invitation(owner, c, recipient);
    await db.companyRepresentative.update({
      where: { userId_companyId: { userId: owner.id, companyId: c } },
      data: { status: "REVOKED" },
    });
    expect((await request(owner, "/api/companies")).json()).toHaveLength(0);
    expect(
      (await request(owner, "/api/dashboard")).json().companies,
    ).toHaveLength(0);
    expect(
      (
        await request(recipient, "/api/company-invitations/accept", "POST", {
          token: next.token,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(owner, `/api/companies/${c}`, "PATCH", {
          name: "Data ujian tidak dibenarkan",
          address: "Alamat data ujian sahaja",
          phone: "0000000000",
          email: "ujian@example.test",
        })
      ).statusCode,
    ).toBe(404);
  });
  it("accepts a concurrent invitation only once", async () => {
    const owner = await actor("PEMOHON"),
      recipient = await actor("PEMOHON");
    const c = await company(owner),
      invite = await invitation(owner, c, recipient);
    const responses = await Promise.all([
      request(recipient, "/api/company-invitations/accept", "POST", {
        token: invite.token,
      }),
      request(recipient, "/api/company-invitations/accept", "POST", {
        token: invite.token,
      }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    expect(
      await db.companyRepresentative.count({
        where: { userId: recipient.id, companyId: c },
      }),
    ).toBe(1);
  });
  it("stores delegation PDFs privately with pending verification for all valid representatives", async () => {
    const owner = await actor("PEMOHON"),
      recipient = await actor("PEMOHON");
    const c = await company(owner),
      invite = await invitation(owner, c, recipient);
    await request(recipient, "/api/company-invitations/accept", "POST", {
      token: invite.token,
    });
    const doc = await request(owner, `/api/companies/${c}/documents`, "POST", {
      fileName: "surat-kuasa-data-ujian.pdf",
      content: Buffer.from("%PDF-1.4\nDATA UJIAN\n%%EOF").toString("base64"),
    });
    expect(doc.statusCode).toBe(200);
    expect(doc.json().status).toBe("UNVERIFIED");
    expect(
      (await request(recipient, `/api/documents/${doc.json().id}`)).statusCode,
    ).toBe(200);
    await db.companyRepresentative.update({
      where: { userId_companyId: { userId: recipient.id, companyId: c } },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await request(recipient, `/api/documents/${doc.json().id}`)).statusCode,
    ).toBe(404);
    expect((await request(recipient, "/api/companies")).json()).toHaveLength(0);
    expect(
      (await request(recipient, "/api/dashboard")).json().companies,
    ).toHaveLength(0);
    await db.companyRepresentative.update({
      where: { userId_companyId: { userId: recipient.id, companyId: c } },
      data: { endsAt: null, startsAt: new Date(Date.now() + 86400000) },
    });
    expect((await request(recipient, "/api/companies")).json()).toHaveLength(0);
    expect(
      (await request(recipient, "/api/dashboard")).json().companies,
    ).toHaveLength(0);
  });
});

describe("Phase 2A email gate and missing configuration", () => {
  it("does not grant company access before email verification", async () => {
    const email = `pending-${randomUUID()}@example.test`;
    const response = await app.inject({
      url: "/api/auth/register",
      remoteAddress: "10.41.1.1",
      method: "POST",
      payload: {
        name: "DATA UJIAN Pengesahan Tertangguh",
        email,
        phone: "0000000000",
        identificationNumber: `UJIAN${randomBytes(6).toString("hex")}`,
        password,
        consent: true,
      },
    });
    expect(response.statusCode).toBe(201);
    const login = await app.inject({
      url: "/api/auth/login",
      remoteAddress: "10.41.1.1",
      method: "POST",
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    const a = {
      id: "pending",
      cookie: String(login.headers["set-cookie"]).split(";")[0],
      csrf: login.json().csrf,
    };
    expect((await request(a, "/api/companies")).statusCode).toBe(403);
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    const logs = await db.auditLog.findMany({ where: { actorId: u.id } });
    expect(JSON.stringify(logs)).not.toContain("identificationHash");
    expect(login.body).not.toContain(u.identificationEncrypted!);
  });
  it("fails registration safely when the independent identity key is not configured", async () => {
    const previous = process.env.IDENTITY_DATA_KEY;
    const email = `no-config-${randomUUID()}@example.test`;
    delete process.env.IDENTITY_DATA_KEY;
    try {
      const response = await app.inject({
        url: "/api/auth/register",
        remoteAddress: "10.41.1.2",
        method: "POST",
        payload: {
          name: "DATA UJIAN Konfigurasi",
          email,
          phone: "0000000000",
          identificationNumber: `UJIAN${randomBytes(6).toString("hex")}`,
          password,
          consent: true,
        },
      });
      expect(response.statusCode).toBe(503);
      expect(await db.user.count({ where: { email } })).toBe(0);
    } finally {
      process.env.IDENTITY_DATA_KEY = previous;
    }
  });
});
