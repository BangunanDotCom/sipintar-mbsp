import { scanDelegationDocument } from "../apps/api/src/delegation-scan-worker";
import { syntheticPortalDatabase } from "../apps/api/src/synthetic-portal-gate";
import { emptyPremises } from "../packages/shared/src/premises";
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
    // Each synthetic actor has a distinct client address; rate-limit tests use explicit shared addresses.
    remoteAddress: `fd00:${hash(a.id).slice(0, 4)}:${hash(a.id).slice(4, 8)}::1`,
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
    // SMTP delivery and Mailpit indexing may complete at different times.
    // Bound retries to avoid hiding a broken integration environment.
    for (let attempt = 0; attempt < 15; attempt++) {
      const response = await fetch("http://localhost:8025/api/v1/messages");
      if (!response.ok) throw Error("Mailpit message listing unavailable.");
      const msgs: any = await response.json();
      const message = msgs.messages?.find((item: any) =>
        item.To?.some((to: any) => to.Address === email),
      );
      if (message) {
        const detailResponse = await fetch(
          `http://localhost:8025/api/v1/message/${encodeURIComponent(message.ID)}`,
        );
        if (!detailResponse.ok) throw Error("Mailpit message detail unavailable.");
        const detail: any = await detailResponse.json();
        const value = new URL(detail.Text.trim()).searchParams.get("token");
        if (!value) throw Error("Mailpit verification token missing.");
        return value;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw Error("Expected test email not found in Mailpit within 3 seconds.");
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
  const testUrl = process.env.TEST_DATABASE_URL;
  const databaseUrl = process.env.DATABASE_URL;
  if (!testUrl || !databaseUrl)
    throw Error("TEST_DATABASE_URL dan DATABASE_URL diperlukan untuk ujian integrasi.");
  const testDb = new URL(testUrl);
  const activeDb = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(testDb.protocol) ||
      !testDb.pathname.endsWith("_test") ||
      activeDb.href !== testDb.href)
    throw Error("DATABASE_URL mesti sepadan dengan TEST_DATABASE_URL PostgreSQL khusus berakhir _test.");
  const activeDatabase = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database()::text AS name`;
  if (activeDatabase[0]?.name !== decodeURIComponent(testDb.pathname.slice(1)))
    throw Error("Sambungan Prisma bukan kepada pangkalan data ujian yang dijangka.");
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
  try {
    if (app) await app.close();
  } finally {
    await db.$disconnect();
  }
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
    expect((await request(applicant, `/api/documents/${doc.json().id}`)).statusCode).toBe(404);
    await expect(scanDelegationDocument(db, {
      scan: async () => ({ status: "CLEAN", engine: "synthetic" }),
    }, doc.json().id)).resolves.toBe(true);
    const download = await request(applicant, `/api/documents/${doc.json().id}`);
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

describe("P0 surat kuasa Team 3", () => {
  const pdf = Buffer.from("%PDF-1.4\nDATA P0 SINTETIK\n%%EOF");
  const clean = { scan: async () => ({ status: "CLEAN" as const, engine: "synthetic" }) };
  async function fixture() {
    const owner = await actor("PEMOHON");
    const reviewer = await actor("PIC_KAWASAN");
    const company = await request(owner, "/api/companies", "POST", {
      name: "Syarikat sintetik P0", registrationNumber: `P0${randomBytes(8).toString("hex")}`,
      address: "Alamat sintetik", phone: "0100000000", email: "fixture@example.test",
      authorityType: "PENGARAH",
    });
    expect(company.statusCode).toBe(201);
    const companyId = company.json().id;
    const own = await db.companyRepresentative.findUniqueOrThrow({
      where: { userId_companyId: { userId: owner.id, companyId } },
    });
    const path = `/api/companies/${companyId}/documents`;
    const upload = (actor = owner, input = {}) => request(actor, path, "POST", {
      fileName: "synthetic-p0.pdf", content: pdf.toString("base64"), ...input,
    });
    const uploaded = await upload();
    expect(uploaded.statusCode).toBe(200);
    return { owner, reviewer, own, companyId, path, upload, id: uploaded.json().id as string };
  }
  function review(f: Awaited<ReturnType<typeof fixture>>, documentId = f.id, expectedRevision = 1, reviewer = f.reviewer) {
    return request(reviewer, `/api/representations/${f.own.id}/verify`, "POST", {
      documentId, expectedRevision, status: "VERIFIED", reason: "Semakan sintetik P0",
    });
  }

  async function delegatedInvitation() {
    const f = await fixture();
    await db.companyRepresentative.update({
      where: { id: f.own.id }, data: { canManageRepresentatives: false },
    });
    expect(await scanDelegationDocument(db, clean, f.id)).toBe(true);
    expect((await review(f)).statusCode).toBe(200);
    const recipient = await actor("PEMOHON");
    const { email } = await db.user.findUniqueOrThrow({ where: { id: recipient.id }, select: { email: true } });
    const issued = await request(f.owner, `/api/companies/${f.companyId}/invitations`, "POST", { email, authorityType: "PEKERJA" });
    expect(issued.statusCode, issued.body).toBe(200);
    const raw = await emailToken(email, "COMPANY_INVITATION");
    return { ...f, recipient, raw, invitationId: issued.json().id as string };
  }
  function accept(recipient: Actor, token: string, payload = {}) {
    return request(recipient, "/api/company-invitations/accept", "POST", { token, ...payload });
  }
  async function expectUnclaimed(f: Awaited<ReturnType<typeof delegatedInvitation>>) {
    const invitation = await db.companyRepresentationInvitation.findUniqueOrThrow({ where: { id: f.invitationId } });
    expect(invitation.acceptedAt).toBeNull();
    expect(await db.companyRepresentative.count({ where: { companyId: f.companyId, userId: f.recipient.id } })).toBe(0);
  }

  it("A-N03 metadata isolates company, representative, current version and session on every view", async () => {
    const f = await fixture();
    const unrelated = await fixture();
    const colleague = await actor("PEMOHON");
    const membership = await db.companyRepresentative.create({
      data: { companyId: f.companyId, userId: colleague.id, authorityType: "PEKERJA" },
    });
    const theirDoc = await f.upload(colleague, { fileName: "private-colleague.pdf" });
    expect(theirDoc.statusCode).toBe(200);
    const latest = await f.upload(f.owner, { expectedDocumentId: f.id, fileName: "private-current.pdf" });
    expect(latest.statusCode).toBe(200);
    const latestId = latest.json().id;
    for (const endpoint of ["/api/dashboard", "/api/companies"]) {
      const owner = await request(f.owner, endpoint);
      expect(owner.statusCode).toBe(200);
      expect(owner.headers["cache-control"]).toContain("no-store");
      for (const hidden of [unrelated.companyId, theirDoc.json().id, "private-colleague.pdf", f.id, "verifiedDocumentId"])
        expect(owner.body).not.toContain(hidden);
      if (endpoint === "/api/dashboard") expect(owner.body).not.toContain(latestId);
      else expect(owner.json()[0].company.documents).toMatchObject([{id:latestId, version:2, representativeId:f.own.id}]);
      const other = await request(colleague, endpoint);
      expect(other.statusCode).toBe(200);
      expect(other.body).not.toContain(latestId);
      expect(other.body).not.toContain("private-current.pdf");
      expect(other.body).not.toContain(unrelated.companyId);
    }
    const reviewList = await request(f.reviewer, "/api/representations");
    expect(reviewList.statusCode).toBe(200);
    const visible = reviewList.json();
    expect(visible.find((r: {id:string}) => r.id === f.own.id).company.documents).toMatchObject([{id:latestId}]);
    expect(visible.find((r: {id:string}) => r.id === membership.id).company.documents).toMatchObject([{id:theirDoc.json().id}]);
    expect(reviewList.body).not.toContain(f.id);
    expect((await request(pic, "/api/representations")).statusCode).toBe(403);
    await db.companyRepresentative.update({where:{id:membership.id},data:{status:"REVOKED"}});
    expect((await request(colleague, "/api/companies")).json()).toEqual([]);
    expect((await request(colleague, "/api/dashboard")).json().companies).toEqual([]);
    await db.session.updateMany({where:{userId:f.owner.id},data:{expiresAt:new Date(0)}});
    for (const endpoint of ["/api/dashboard", "/api/companies", `/api/documents/${latestId}`])
      expect((await request(f.owner, endpoint)).statusCode).toBe(401);
  });

  it.each(["expired verdict", "replaced proof", "revoked letter", "revoked authority"])(
    "B-N02/B-N05 refuses invitation acceptance after %s without changing membership",
    async (change) => {
      const f = await delegatedInvitation();
      switch (change) {
        case "expired verdict":
          await db.delegationDocument.update({where:{id:f.id},data:{scanValidUntil:new Date(0)}});
          break;
        case "replaced proof": {
          const replacement = await f.upload(f.owner, {expectedDocumentId:f.id});
          expect(replacement.statusCode).toBe(200);
          const replacementId = replacement.json().id;
          expect(await scanDelegationDocument(db, clean, replacementId)).toBe(true);
          expect((await review(f, replacementId, 3)).statusCode).toBe(200);
          break;
        }
        case "revoked letter":
          expect((await request(f.owner, `${f.path}/${f.id}/revoke`, "POST")).statusCode).toBe(200);
          break;
        case "revoked authority":
          await db.companyRepresentative.update({where:{id:f.own.id},data:{status:"REVOKED"}});
          break;
      }
      expect((await accept(f.recipient, f.raw)).statusCode).toBe(403);
      await expectUnclaimed(f);
    },
  );

  it("B-N01/B-N03 rejects other recipients, company overrides, CSRF and expired sessions for acceptance", async () => {
    const f = await delegatedInvitation();
    const other = await fixture();
    expect((await accept(other.owner, f.raw)).statusCode).toBe(400);
    expect((await accept(f.recipient, f.raw, { companyId: other.companyId })).statusCode).toBe(400);
    expect((await accept({...f.recipient, csrf:token()}, f.raw)).statusCode).toBe(403);
    await db.session.updateMany({where:{userId:f.recipient.id},data:{expiresAt:new Date(0)}});
    expect((await accept(f.recipient, f.raw)).statusCode).toBe(401);
    await expectUnclaimed(f);
  });

  it("B-N04 serializes acceptance behind a revocation and leaves the invitation unclaimed", async () => {
    const f = await delegatedInvitation();
    let accepting!: Promise<Awaited<ReturnType<typeof accept>>>;
    await db.$transaction(async (tx) => {
      const [{pid}] = await tx.$queryRaw<{pid:number}[]>`SELECT pg_backend_pid() AS pid`;
      await tx.$queryRaw`SELECT id FROM company_representatives WHERE id = ${f.own.id} FOR UPDATE`;
      accepting = accept(f.recipient, f.raw);
      let blocked = false;
      for (let attempt = 0; attempt < 75 && !blocked; attempt++) {
        const [row] = await tx.$queryRaw<{blocked:boolean}[]>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pg_stat_activity.pid))) AS blocked`;
        blocked = row.blocked;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      await tx.delegationDocument.update({where:{id:f.id},data:{revokedAt:new Date()}});
    });
    expect((await accepting).statusCode).toBe(403);
    await expectUnclaimed(f);
  });

  it("B-P01 accepts once with a current exact proof", async () => {
    const f = await delegatedInvitation();
    expect((await accept(f.recipient, f.raw)).statusCode).toBe(200);
    expect((await accept(f.recipient, f.raw)).statusCode).toBe(400);
    expect(await db.companyRepresentative.count({where:{companyId:f.companyId,userId:f.recipient.id}})).toBe(1);
  });

  it("B-N03 rejects self-verification even for a global PIC with MFA", async () => {
    const f = await fixture();
    const self = await db.companyRepresentative.create({
      data: {companyId:f.companyId, userId:f.reviewer.id, authorityType:"PEKERJA"},
    });
    const upload = await f.upload(f.owner, { representativeId:self.id });
    expect(upload.statusCode).toBe(200);
    const id = upload.json().id;
    expect(await scanDelegationDocument(db, clean, id)).toBe(true);
    expect((await review({...f, own:self}, id)).statusCode).toBe(403);
    expect((await db.companyRepresentative.findUniqueOrThrow({where:{id:self.id}})).verifiedDocumentId).toBeNull();
  });

  it("A-N01/A-P01/A-N05 gates both routes and audits only successful bytes", async () => {
    const f = await fixture();
    const ownerPath = `/api/documents/${f.id}`;
    const reviewerPath = `/api/representation-documents/${f.id}`;
    for (const scanStatus of ["PENDING", "SCANNING", "INFECTED", "FAILED", "CLEAN"]) {
      await db.delegationDocument.update({ where: { id: f.id }, data: { scanStatus } });
      for (const [who, path] of [[f.owner, ownerPath], [f.reviewer, reviewerPath]] as const) {
        const response = await request(who, path);
        expect(response.statusCode).toBe(404);
        expect(response.body).not.toContain("DATA P0");
        expect(response.headers["cache-control"]).toContain("no-store");
      }
    }
    const legacy = await db.delegationDocument.create({ data: {
      companyId: f.companyId, uploadedBy: f.owner.id, fileName: "legacy.pdf",
      content: pdf, mimeType: "application/pdf", sha256: hash("legacy"),
    } });
    expect((await request(f.owner, `/api/documents/${legacy.id}`)).statusCode).toBe(404);
    const outcome = { target: f.id, outcome: "SUCCESS", action: { in: ["DOCUMENT_READ", "REPRESENTATION_DOCUMENT_READ"] } };
    expect(await db.auditLog.count({where: outcome})).toBe(0);
    await db.delegationDocument.update({ where: { id: f.id }, data: { scanStatus: "PENDING" } });
    expect(await scanDelegationDocument(db, clean, f.id)).toBe(true);
    for (const [who, path] of [[f.owner, ownerPath], [f.reviewer, reviewerPath]] as const) {
      const response = await request(who, path);
      expect(response.statusCode).toBe(200);
      expect(response.rawPayload).toEqual(pdf);
      expect(response.headers).toMatchObject({
        "cache-control": "private, no-store", "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer", "content-security-policy": "sandbox",
      });
    }
    expect(await db.auditLog.count({where: outcome})).toBe(2);
    expect((await request(await actor("PEMOHON"), ownerPath)).statusCode).toBe(404);
  });

  it("A-N02/A-N03/B-N02/B-N03 binds digest, freshness, MFA and officer scope", async () => {
    const f = await fixture();
    expect(await scanDelegationDocument(db, clean, f.id)).toBe(true);
    expect((await review(f, f.id, 1, pic)).statusCode).toBe(403);
    expect((await review(f, f.id, 1, ppsk)).statusCode).toBe(403);
    const reviewerPath = `/api/representation-documents/${f.id}`;
    const scoped = await request(pic, reviewerPath);
    expect(scoped.statusCode).toBe(403);
    await db.session.updateMany({where:{userId:f.reviewer.id}, data:{mfaVerified:false}});
    expect((await request(f.reviewer, reviewerPath)).statusCode).toBe(403);
    expect((await review(f)).statusCode).toBe(403);
    await db.session.updateMany({where:{userId:f.reviewer.id}, data:{mfaVerified:true}});
    expect((await review(f, f.id, 1, {...f.reviewer, csrf: token()})).statusCode).toBe(403);
    await db.delegationDocument.update({where:{id:f.id},data:{scanSha256:"0".repeat(64)}});
    expect((await request(f.owner, `/api/documents/${f.id}`)).statusCode).toBe(404);
    expect((await review(f)).statusCode).toBe(409);
    await db.delegationDocument.update({where:{id:f.id},data:{scanValidUntil:new Date(0)}});
    expect((await request(f.reviewer, reviewerPath)).statusCode).toBe(404);
    await expect(db.delegationDocument.update({where:{id:f.id},data:{content:Buffer.from("changed")}})).rejects.toThrow();
  });

  it("A-N04/B-N04 rejects late scanner answers, duplicate leases and replaced versions", async () => {
    const f = await fixture();
    const now = new Date(Date.now() + 1000);
    const time = () => now;
    let release!: () => void;
    let started!: () => void;
    const start = new Promise<void>((resolve) => { started = resolve; });
    const scan = scanDelegationDocument(db, { scan: async () => {
      started();
      await new Promise<void>((resolve) => { release = resolve; });
      return { status: "CLEAN", engine: "synthetic" };
    } }, f.id, time);
    await start;
    expect(await scanDelegationDocument(db, clean, f.id, time)).toBe(false);
    const replacements = await Promise.all([
      f.upload(f.owner, { expectedDocumentId: f.id }),
      f.upload(f.owner, { expectedDocumentId: f.id }),
    ]);
    release();
    expect(await scan).toBe(false);
    expect(replacements.map((r) => r.statusCode).sort()).toEqual([200,409]);
    expect((await request(f.owner, `/api/documents/${f.id}`)).statusCode).toBe(404);
    expect((await review(f, f.id, 2)).statusCode).toBe(409);
    const next = replacements.find((r)=>r.statusCode===200)!.json().id;
    expect(await scanDelegationDocument(db, { scan: async () => { throw Error("timeout"); } }, next)).toBe(true);
    expect((await db.delegationDocument.findUniqueOrThrow({where:{id:next}})).scanStatus).toBe("FAILED");
  });

  it("A-N04 discards an expired scan when another worker owns the lease", async () => {
    const f = await fixture();
    let instant = Date.now() + 1_000;
    const clock = () => new Date(instant);
    let entered!: () => void;
    let finish!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const stale = scanDelegationDocument(db, { scan: async () => {
      entered();
      await new Promise<void>((resolve) => { finish = resolve; });
      return { status: "CLEAN", engine: "stale" };
    } }, f.id, clock);
    await started;
    instant += 60_001;
    try {
      expect(await scanDelegationDocument(db, {
        scan: async () => ({ status: "INFECTED", engine: "synthetic" }),
      }, f.id, clock)).toBe(true);
    } finally {
      finish();
    }
    expect(await stale).toBe(false);
    expect((await db.delegationDocument.findUniqueOrThrow({where:{id:f.id}})).scanStatus).toBe("INFECTED");
    expect((await request(f.owner, `/api/documents/${f.id}`)).statusCode).toBe(404);
  });

  it("B-N05 rolls back proof, successful audit and notification on either write failure", async () => {
    const f = await fixture();
    expect(await scanDelegationDocument(db, clean, f.id)).toBe(true);
    await db.$executeRaw`CREATE FUNCTION p0_fixture_notify_abort() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.message = 'Semakan sintetik P0' THEN RAISE EXCEPTION 'synthetic notification failure'; END IF;
        RETURN NEW;
      END $$`;
    await db.$executeRaw`CREATE FUNCTION p0_fixture_audit_abort() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.metadata->>'reason' = 'Semakan sintetik P0' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF;
        RETURN NEW;
      END $$`;
    try {
      await db.$executeRaw`CREATE TRIGGER p0_fixture_audit_abort BEFORE INSERT ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION p0_fixture_audit_abort()`;
      try {
        expect((await review(f)).statusCode).toBe(500);
      } finally {
        await db.$executeRaw`DROP TRIGGER p0_fixture_audit_abort ON audit_logs`;
      }
      await db.$executeRaw`CREATE TRIGGER p0_fixture_notify_abort BEFORE INSERT ON notifications
        FOR EACH ROW EXECUTE FUNCTION p0_fixture_notify_abort()`;
      try {
        expect((await review(f)).statusCode).toBe(500);
      } finally {
        await db.$executeRaw`DROP TRIGGER p0_fixture_notify_abort ON notifications`;
      }
      const membership = await db.companyRepresentative.findUniqueOrThrow({where:{id:f.own.id}});
      expect(membership.verifiedDocumentId).toBeNull();
      expect(membership.verificationRevision).toBe(1);
      expect(await db.auditLog.count({where:{
        target:f.own.id, outcome:"SUCCESS", action:"REPRESENTATION_VERIFIED",
      }})).toBe(0);
      expect(await db.notification.count({where:{userId:f.owner.id,message:"Semakan sintetik P0"}})).toBe(0);
      expect((await review(f)).statusCode).toBe(200);
      expect((await review(f)).statusCode).toBe(409);
      expect(await db.notification.count({where:{userId:f.owner.id,message:"Semakan sintetik P0"}})).toBe(1);
    } finally {
      await db.$executeRaw`DROP FUNCTION p0_fixture_audit_abort()`;
      await db.$executeRaw`DROP FUNCTION p0_fixture_notify_abort()`;
    }
  });

  it("B-N01/B-N04/B-N05/B-P01 keeps proof and audit bound to one representative and rejects replays", async () => {
    const f = await fixture();
    const other = await actor("PEMOHON");
    const rep = await db.companyRepresentative.create({
      data: { companyId:f.companyId, userId:other.id, authorityType:"PEKERJA" },
    });
    const otherDoc = await f.upload(other);
    expect(otherDoc.statusCode).toBe(200);
    const otherId = otherDoc.json().id;
    expect(await scanDelegationDocument(db, clean, f.id)).toBe(true);
    expect(await scanDelegationDocument(db, clean, otherId)).toBe(true);
    const another = await fixture();
    expect((await review(f, another.id)).statusCode).toBe(404);
    expect((await review(f, otherId)).statusCode).toBe(404);
    expect((await review(f, randomUUID())).statusCode).toBe(404);
    expect((await request(f.reviewer, `/api/representations/${f.own.id}/verify`, "POST",
      {status:"VERIFIED",reason:"Missing proof"})).statusCode).toBe(400);
    const originMismatch = await app.inject({
      url: `/api/representations/${f.own.id}/verify`, method: "POST",
      headers: { cookie: f.reviewer.cookie, origin: "https://invalid.example.test", "x-csrf-token": f.reviewer.csrf },
      payload: { documentId: f.id, expectedRevision: 1, status: "VERIFIED", reason: "Semakan sintetik P0" },
    });
    expect(originMismatch.statusCode).toBe(403);
    const outcomes = await Promise.all([review(f), review(f)]);
    expect(outcomes.map((r) => r.statusCode).sort()).toEqual([200,409]);
    expect((await db.companyRepresentative.findUniqueOrThrow({where:{id:rep.id}})).verifiedDocumentId).toBeNull();
    expect((await review({...f, own:rep, id:otherId})).statusCode).toBe(200);
    for (const [id, proof] of [[f.own.id,f.id],[rep.id,otherId]]) {
      expect((await db.companyRepresentative.findUniqueOrThrow({where:{id}})).verifiedDocumentId).toBe(proof);
      const decisions = await db.auditLog.findMany({where:{target:id,outcome:"SUCCESS",action:"REPRESENTATION_VERIFIED"}});
      expect(decisions).toHaveLength(1);
      expect(decisions[0].metadata).toMatchObject({documentId:proof,representativeId:id,companyId:f.companyId});
    }
    expect((await request(f.owner, `${f.path}/${f.id}/revoke`, "POST")).statusCode).toBe(200);
    expect((await review(f, f.id, 3)).statusCode).toBe(409);
    expect((await db.companyRepresentative.findUniqueOrThrow({where:{id:f.own.id}})).verifiedDocumentId).toBeNull();
    expect((await db.companyRepresentative.findUniqueOrThrow({where:{id:rep.id}})).verifiedDocumentId).toBe(otherId);
    const candidate = await actor("PEMOHON");
    const { email } = await db.user.findUniqueOrThrow({where:{id:candidate.id},select:{email:true}});
    const invitePath = `/api/companies/${f.companyId}/invitations`;
    expect((await request(other, invitePath, "POST", {email,authorityType:"PEKERJA"})).statusCode).toBe(200);
    await db.delegationDocument.update({where:{id:otherId},data:{scanValidUntil:new Date(0)}});
    expect((await request(other, invitePath, "POST", {email,authorityType:"PEKERJA"})).statusCode).toBe(403);
    expect((await request(other, "/api/companies")).json()[0].status).toBe("DOCUMENT_UPDATE_REQUIRED");

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
  it("isolates a quarantined delegation PDF from another representative", async () => {
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
    ).toBe(404);
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

describe("Phase 2B.1 real applicant draft storage and access", () => {
  async function company(owner: Actor) {
    const r = await request(owner, "/api/companies", "POST", {
      name: "DATA UJIAN Syarikat Fasa 2B",
      registrationNumber: `UJIAN${randomBytes(8).toString("hex")}`,
      address: "Alamat data ujian sahaja, bukan premis sebenar",
      phone: "0000000000",
      email: "syarikat-ujian@example.test",
      authorityType: "PENGARAH",
    });
    expect(r.statusCode).toBe(201);
    return r.json().id as string;
  }
  const draftBody = {
    capacity: "INDIVIDUAL",
    notes: "DATA UJIAN catatan draf PPTT",
  };
  async function draft(a: Actor, body: any = draftBody) {
    const r = await request(a, "/api/application-drafts", "POST", body);
    expect(r.statusCode).toBe(201);
    return r.json();
  }
  it("requires a verified applicant, active permission, completed identity and CSRF", async () => {
    expect(
      (await app.inject("/api/application-drafts/context")).statusCode,
    ).toBe(401);
    expect(
      (await request(ict, "/api/application-drafts/context")).statusCode,
    ).toBe(403);
    const a = await actor("PEMOHON");
    await db.user.update({
      where: { id: a.id },
      data: { emailVerified: false },
    });
    expect(
      (await request(a, "/api/application-drafts/context")).statusCode,
    ).toBe(403);
    await db.user.update({
      where: { id: a.id },
      data: {
        emailVerified: true,
        identificationHash: null,
        identificationEncrypted: null,
        identificationMasked: null,
      },
    });
    expect(
      (await request(a, "/api/application-drafts/context")).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          url: "/api/application-drafts",
          method: "POST",
          headers: {
            cookie: applicant.cookie,
            origin: "http://localhost:5173",
          },
          payload: draftBody,
        })
      ).statusCode,
    ).toBe(403);
    const expired = await actor("PEMOHON");
    await db.userRoleAssignment.updateMany({
      where: { userId: expired.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await request(expired, "/api/application-drafts/context")).statusCode,
    ).toBe(403);
  });
  it("stores an individual draft in PostgreSQL with server-derived applicant and immutable initiator", async () => {
    const a = await actor("PEMOHON"),
      d = await draft(a);
    expect(d.status).toBe("DRAFT");
    expect(d.version).toBe(1);
    expect(d.initiatedByUserId).toBe(a.id);
    expect(d.officialApplicantUserId).toBe(a.id);
    expect(d.companyId).toBeNull();
    const saved = await db.applicationDraft.findUniqueOrThrow({
      where: { id: d.id },
    });
    expect(saved.notes).toBe(draftBody.notes);
    expect(saved.representativeSnapshot).toBeNull();
    const serialized = JSON.stringify(d);
    for (const forbidden of [
      "identificationHash",
      "identificationEncrypted",
      "passwordHash",
    ])
      expect(serialized).not.toContain(forbidden);
    expect(d.applicantSnapshot.identificationMasked).toMatch(/^••••/);
    await db.user.update({
      where: { id: a.id },
      data: { name: "DATA UJIAN Nama Dikemas Kini" },
    });
    const changed = await request(
      a,
      `/api/application-drafts/${d.id}`,
      "PATCH",
      { ...draftBody, version: 1, notes: "DATA UJIAN catatan dikemas kini" },
    );
    expect(changed.statusCode).toBe(200);
    expect(changed.json().applicantSnapshot.name).toBe(
      "DATA UJIAN Nama Dikemas Kini",
    );
    expect(changed.json().initiatorSnapshot).toEqual(d.initiatorSnapshot);
    expect(
      (await request(a, `/api/application-drafts/${d.id}`)).json().notes,
    ).toBe("DATA UJIAN catatan dikemas kini");
    const actions = await db.auditLog.findMany({
      where: { target: d.id },
      orderBy: { createdAt: "asc" },
    });
    expect(actions.map((x) => x.action)).toEqual([
      "APPLICATION_DRAFT_CREATED",
      "APPLICATION_DRAFT_SAVED",
      "APPLICATION_DRAFT_RESUMED",
    ]);
    expect(actions.every((x) => x.actorId === a.id)).toBe(true);
    expect(JSON.stringify(actions)).not.toContain("catatan dikemas kini");
  });
  it("lists only permitted companies and separates the company applicant from its initiating representative", async () => {
    const a = await actor("PEMOHON"),
      other = await actor("PEMOHON"),
      first = await company(a),
      second = await company(a),
      unrelated = await company(other);
    const context = (
      await request(a, "/api/application-drafts/context")
    ).json();
    expect(context.companies.map((c: any) => c.id).sort()).toEqual(
      [first, second].sort(),
    );
    expect(context.submissionEnabled).toBe(false);
    const d = await draft(a, {
      capacity: "COMPANY",
      companyId: first,
      notes: "DATA UJIAN draf syarikat",
    });
    expect(d.initiatedByUserId).toBe(a.id);
    expect(d.officialApplicantUserId).toBeNull();
    expect(d.companyId).toBe(first);
    expect(d.applicantSnapshot.companyId).toBe(first);
    expect(d.representativeSnapshot.userId).toBe(a.id);
    expect(d.applicantSnapshot.informationStatus).toBe("UNVERIFIED");
    expect(
      (
        await request(a, "/api/application-drafts", "POST", {
          capacity: "COMPANY",
          companyId: unrelated,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await request(a, "/api/application-drafts"))
        .json()
        .map((d: any) => d.id),
    ).toContain(d.id);
  });
  it("isolates drafts from other users, even another authorized representative of the same company", async () => {
    const a = await actor("PEMOHON"),
      colleague = await actor("PEMOHON"),
      c = await company(a);
    await db.companyRepresentative.create({
      data: { companyId: c, userId: colleague.id, authorityType: "PEKERJA" },
    });
    const d = await draft(a, { capacity: "COMPANY", companyId: c });
    expect(
      (await request(colleague, "/api/application-drafts")).json(),
    ).toEqual([]);
    expect(
      (await request(colleague, `/api/application-drafts/${d.id}`)).statusCode,
    ).toBe(404);
    expect(
      (
        await request(colleague, `/api/application-drafts/${d.id}`, "PATCH", {
          ...draftBody,
          version: 1,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request(
          colleague,
          `/api/application-drafts/${d.id}/submit`,
          "POST",
          {},
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await request(ict, `/api/application-drafts/${d.id}`)).statusCode,
    ).toBe(403);
  });
  it("rejects identity/status spoofing, malformed capacity, missing company and oversized notes", async () => {
    const a = await actor("PEMOHON");
    for (const body of [
      { ...draftBody, initiatedByUserId: ict.id },
      { ...draftBody, status: "SUBMITTED" },
      { ...draftBody, officialApplicantUserId: ict.id },
      { ...draftBody, applicantSnapshot: { name: "forged" } },
      { capacity: "COMPANY" },
      { capacity: "COMPANY", companyId: "invalid" },
      { ...draftBody, companyId: randomUUID() },
      { capacity: "UNKNOWN" },
      { ...draftBody, notes: "x".repeat(2001) },
    ])
      expect(
        (await request(a, "/api/application-drafts", "POST", body)).statusCode,
      ).toBe(400);
    expect(
      await db.applicationDraft.count({ where: { initiatedByUserId: a.id } }),
    ).toBe(0);
  });
  it.each(["revoked", "expired", "future", "inactive-company"])(
    "denies company draft creation/resume/save when authority becomes %s",
    async (state) => {
      const a = await actor("PEMOHON"),
        c = await company(a),
        d = await draft(a, { capacity: "COMPANY", companyId: c });
      if (state === "inactive-company")
        await db.company.update({
          where: { id: c },
          data: { status: "INACTIVE" },
        });
      else
        await db.companyRepresentative.update({
          where: { userId_companyId: { userId: a.id, companyId: c } },
          data:
            state === "revoked"
              ? { status: "REVOKED" }
              : state === "expired"
                ? { endsAt: new Date(Date.now() - 1000) }
                : { startsAt: new Date(Date.now() + 86400000) },
        });
      expect(
        (await request(a, "/api/application-drafts/context")).json().companies,
      ).toEqual([]);
      expect((await request(a, "/api/application-drafts")).json()).toEqual([]);
      expect(
        (await request(a, `/api/application-drafts/${d.id}`)).statusCode,
      ).toBe(404);
      expect(
        (
          await request(a, `/api/application-drafts/${d.id}`, "PATCH", {
            ...draftBody,
            version: 1,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await request(a, "/api/application-drafts", "POST", {
            capacity: "COMPANY",
            companyId: c,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await db.applicationDraft.findUniqueOrThrow({ where: { id: d.id } }))
          .version,
      ).toBe(1);
    },
  );
  it("can switch capacity safely and rejects stale versions without overwriting saved work", async () => {
    const a = await actor("PEMOHON"),
      c = await company(a),
      d = await draft(a);
    let response = await request(
      a,
      `/api/application-drafts/${d.id}`,
      "PATCH",
      { capacity: "COMPANY", companyId: c, version: 1 },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json().officialApplicantUserId).toBeNull();
    expect(response.json().representativeSnapshot.userId).toBe(a.id);
    response = await request(a, `/api/application-drafts/${d.id}`, "PATCH", {
      ...draftBody,
      version: 2,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().companyId).toBeNull();
    expect(response.json().representativeSnapshot).toBeNull();
    expect(response.json().officialApplicantUserId).toBe(a.id);
    expect(response.json().version).toBe(3);
    expect(
      (
        await request(a, `/api/application-drafts/${d.id}`, "PATCH", {
          ...draftBody,
          version: 2,
          notes: "stale",
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await db.applicationDraft.findUniqueOrThrow({ where: { id: d.id } }))
        .notes,
    ).toBe(draftBody.notes);
  });
  it("allows only one concurrent save against the same draft version", async () => {
    const a = await actor("PEMOHON"),
      d = await draft(a);
    const results = await Promise.all([
      request(a, `/api/application-drafts/${d.id}`, "PATCH", {
        ...draftBody,
        version: 1,
        notes: "DATA UJIAN A",
      }),
      request(a, `/api/application-drafts/${d.id}`, "PATCH", {
        ...draftBody,
        version: 1,
        notes: "DATA UJIAN B",
      }),
    ]);
    expect(results.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    expect(
      (await db.applicationDraft.findUniqueOrThrow({ where: { id: d.id } }))
        .version,
    ).toBe(2);
    expect(
      await db.auditLog.count({
        where: { target: d.id, action: "APPLICATION_DRAFT_SAVED" },
      }),
    ).toBe(1);
  });
  it("blocks official submission at API and database levels", async () => {
    const a = await actor("PEMOHON"),
      d = await draft(a);
    expect(
      (await request(a, `/api/application-drafts/${d.id}/submit`, "POST", {}))
        .statusCode,
    ).toBe(409);
    await expect(
      db.$executeRaw`UPDATE application_drafts SET status = 'SUBMITTED' WHERE id = ${d.id}`,
    ).rejects.toThrow();
    const saved = await db.applicationDraft.findUniqueOrThrow({
      where: { id: d.id },
    });
    expect(saved.status).toBe("DRAFT");
    expect(saved.version).toBe(1);
    expect(
      await db.auditLog.count({
        where: { target: d.id, action: "APPLICATION_SUBMITTED" },
      }),
    ).toBe(0);
  });
});

describe("Phase 2B.2 premises aggregate persistence and access", () => {
  const complete = {
    address: "DATA UJIAN Alamat Premis sahaja",
    postcode: "13000",
    lotNumber: "PT DATA UJIAN 01",
    locality: "Mukim DATA UJIAN",
    districtId: "SPT",
    latitude: 5.38,
    longitude: 100.42,
    buildingType: "Bangunan DATA UJIAN",
    currentUse: "Kegunaan DATA UJIAN",
    involvedFloors: 2,
    accommodationUnits: 4,
    totalRooms: 12,
    floorAreaSqm: 250.75,
    proposedWorkers: 36,
    certificateType: "CCC",
    certificateNumber: "DATA-UJIAN-CCC-01",
    certificateDate: "2025-01-01",
  };
  const blank = {
    address: null,
    postcode: null,
    lotNumber: null,
    locality: null,
    districtId: null,
    latitude: null,
    longitude: null,
    buildingType: null,
    currentUse: null,
    involvedFloors: null,
    accommodationUnits: null,
    totalRooms: null,
    floorAreaSqm: null,
    proposedWorkers: null,
    certificateType: null,
    certificateNumber: null,
    certificateDate: null,
  };
  async function setup(company = false) {
    const a = await actor("PEMOHON");
    let companyId: string | undefined;
    if (company) {
      const c = await request(a, "/api/companies", "POST", {
        name: "DATA UJIAN Premis Syarikat",
        registrationNumber: `UJIAN${randomBytes(7).toString("hex")}`,
        address: "Alamat data ujian sahaja",
        phone: "0000000000",
        email: "ujian@example.test",
        authorityType: "PENGARAH",
      });
      expect(c.statusCode).toBe(201);
      companyId = c.json().id;
    }
    const d = await request(
      a,
      "/api/application-drafts",
      "POST",
      companyId
        ? { capacity: "COMPANY", companyId }
        : { capacity: "INDIVIDUAL" },
    );
    expect(d.statusCode).toBe(201);
    return { a, id: d.json().id as string, companyId };
  }
  const path = (id: string) => `/api/application-drafts/${id}/premises`;
  it("loads an empty section without fabricating a premises record or GIS validation", async () => {
    const { a, id } = await setup();
    const r = await request(a, path(id));
    expect(r.statusCode).toBe(200);
    expect(r.json().premises).toEqual(blank);
    expect(r.json().complete).toBe(false);
    expect(r.json().boundaryStatus).toBe("UNVERIFIED");
    expect(r.json().submissionEnabled).toBe(false);
    expect(await db.applicationPremises.count({ where: { draftId: id } })).toBe(
      0,
    );
  });
  it("saves partial aggregates and resumes them from real PostgreSQL with audit and parent version", async () => {
    const { a, id } = await setup();
    const r = await request(a, path(id), "PUT", {
      version: 1,
      premises: { ...blank, address: complete.address },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().version).toBe(2);
    expect(r.json().complete).toBe(false);
    const stored = await db.applicationPremises.findUniqueOrThrow({
      where: { draftId: id },
    });
    expect(stored.address).toBe(complete.address);
    expect(stored.totalRooms).toBeNull();
    expect((await request(a, path(id))).json().premises.address).toBe(
      complete.address,
    );
    const logs = await db.auditLog.findMany({
      where: { target: id, action: "APPLICATION_PREMISES_SAVED" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(a.id);
    expect(JSON.stringify(logs)).not.toContain(complete.address);
  });
  it("persists complete building totals, certificate and pin without treating district as verified", async () => {
    const { a, id } = await setup();
    const r = await request(a, path(id), "PUT", {
      version: 1,
      action: "CONTINUE",
      premises: { ...complete, latitude: 50.1, longitude: -0.1 },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().complete).toBe(true);
    expect(r.json().premises.districtId).toBe("SPT");
    expect(r.json().locationSource).toBe("USER_PIN");
    expect(r.json().boundaryStatus).toBe("UNVERIFIED");
    const p = await db.applicationPremises.findUniqueOrThrow({
      where: { draftId: id },
    });
    expect(Number(p.floorAreaSqm)).toBe(250.75);
    expect(p.totalRooms).toBe(12);
    expect(p.proposedWorkers).toBe(36);
    expect(p.certificateDate?.toISOString().slice(0, 10)).toBe("2025-01-01");
    expect(
      (await db.applicationDraft.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("DRAFT");
    expect(
      (await request(a, `/api/application-drafts/${id}/submit`, "POST", {}))
        .statusCode,
    ).toBe(409);
  });
  it("blocks incomplete continuation, invalid totals/coordinates and forged GIS status without writing", async () => {
    const { a, id } = await setup();
    expect(
      (
        await request(a, path(id), "PUT", {
          version: 1,
          action: "CONTINUE",
          premises: blank,
        })
      ).statusCode,
    ).toBe(400);
    for (const fields of [
      { postcode: "1234" },
      { districtId: "INVALID" },
      { latitude: null },
      { latitude: 91 },
      { longitude: 181 },
      { involvedFloors: 1.5 },
      { accommodationUnits: 0 },
      { totalRooms: -1 },
      { floorAreaSqm: 12.345 },
      { proposedWorkers: 0 },
      { certificateType: "UNKNOWN" },
      { certificateDate: "2099-01-01" },
      { boundaryStatus: "VERIFIED" },
      { roomRecords: [] },
    ])
      expect(
        (
          await request(a, path(id), "PUT", {
            version: 1,
            premises: { ...complete, ...fields },
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await request(a, path(id), "PUT", {
          version: 1,
          action: "SUBMIT",
          premises: complete,
        })
      ).statusCode,
    ).toBe(400);
    expect(await db.applicationPremises.count({ where: { draftId: id } })).toBe(
      0,
    );
    expect(
      (await db.applicationDraft.findUniqueOrThrow({ where: { id } })).version,
    ).toBe(1);
  });
  it("enforces session, CSRF, owner and role, including same-company colleagues", async () => {
    const { a, id, companyId } = await setup(true),
      other = await actor("PEMOHON");
    await db.companyRepresentative.create({
      data: {
        companyId: companyId!,
        userId: other.id,
        authorityType: "PEKERJA",
      },
    });
    expect((await app.inject(path(id))).statusCode).toBe(401);
    expect((await request(other, path(id))).statusCode).toBe(404);
    expect(
      (
        await request(other, path(id), "PUT", {
          version: 1,
          premises: complete,
        })
      ).statusCode,
    ).toBe(404);
    expect((await request(ict, path(id))).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          url: path(id),
          method: "PUT",
          headers: { cookie: a.cookie, origin: "http://localhost:5173" },
          payload: { version: 1, premises: complete },
        })
      ).statusCode,
    ).toBe(403);
  });
  it.each(["revoked", "expired", "future", "inactive-company"])(
    "blocks premises reads/writes when representation becomes %s",
    async (state) => {
      const { a, id, companyId } = await setup(true);
      expect(
        (await request(a, path(id), "PUT", { version: 1, premises: complete }))
          .statusCode,
      ).toBe(200);
      if (state === "inactive-company")
        await db.company.update({
          where: { id: companyId },
          data: { status: "INACTIVE" },
        });
      else
        await db.companyRepresentative.update({
          where: { userId_companyId: { userId: a.id, companyId: companyId! } },
          data:
            state === "revoked"
              ? { status: "REVOKED" }
              : state === "expired"
                ? { endsAt: new Date(Date.now() - 1000) }
                : { startsAt: new Date(Date.now() + 86400000) },
        });
      expect((await request(a, path(id))).statusCode).toBe(404);
      expect(
        (await request(a, path(id), "PUT", { version: 2, premises: complete }))
          .statusCode,
      ).toBe(404);
      expect(
        (await db.applicationDraft.findUniqueOrThrow({ where: { id } }))
          .version,
      ).toBe(2);
    },
  );
  it("serializes concurrent saves and prevents lost updates between applicant and premises sections", async () => {
    const { a, id } = await setup();
    const results = await Promise.all([
      request(a, path(id), "PUT", { version: 1, premises: complete }),
      request(a, path(id), "PUT", {
        version: 1,
        premises: { ...complete, totalRooms: 20 },
      }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await db.applicationPremises.count({ where: { draftId: id } })).toBe(
      1,
    );
    expect(
      await db.auditLog.count({
        where: { target: id, action: "APPLICATION_PREMISES_SAVED" },
      }),
    ).toBe(1);
    expect(
      (
        await request(a, `/api/application-drafts/${id}`, "PATCH", {
          capacity: "INDIVIDUAL",
          version: 1,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(a, `/api/application-drafts/${id}`, "PATCH", {
          capacity: "INDIVIDUAL",
          version: 2,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request(a, path(id), "PUT", { version: 2, premises: complete }))
        .statusCode,
    ).toBe(409);
  });
  it("enforces one premises per draft, valid foreign keys, paired coordinates and unverified GIS in PostgreSQL", async () => {
    const { a, id } = await setup();
    await request(a, path(id), "PUT", { version: 1, premises: complete });
    await expect(
      db.applicationPremises.create({ data: { draftId: id } }),
    ).rejects.toThrow();
    await expect(
      db.applicationPremises.create({ data: { draftId: randomUUID() } }),
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE application_premises SET "boundaryStatus" = 'VERIFIED' WHERE "draftId" = ${id}`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE application_premises SET longitude = NULL WHERE "draftId" = ${id}`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE application_premises SET "totalRooms" = 0 WHERE "draftId" = ${id}`,
    ).rejects.toThrow();
  });
});

describe("K02 stable floor identity", () => {
  const floor = (floorLabel: string) => ({
    floorLabel, rooms: 1, beds: 2, workers: 2, areaSqm: 50,
    facilities: {
      toilets: 1, bathrooms: 1, sinks: 1,
      diningTables: 0, diningChairs: 0, fireExtinguishers: 1,
    },
  });

  async function draftFor(owner: Actor) {
    const response = await request(owner, "/api/application-drafts", "POST", {
      capacity: "INDIVIDUAL",
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  it("retains IDs and creation dates through legacy saves, swaps, and mixed old/new entries", async () => {
    const owner = await actor("PEMOHON");
    const draft = await draftFor(owner);
    const url = `/api/application-drafts/${draft.id}/floors`;
    const lower = floor("Tingkat Bawah");
    const upper = floor("Tingkat 1");
    const put = (version: number, floors: unknown[]) =>
      request(owner, url, "PUT", { version, floors });

    const created = await put(draft.version, [lower, upper]);
    expect(created.statusCode).toBe(200);
    const initial = created.json();
    const [lowerId, upperId] = initial.floors.map((item: { id: string }) => item.id);
    const before = await db.premiseFloor.findUniqueOrThrow({ where: { id: upperId } });

    const legacy = await put(initial.version, [floor("tingkat  1"), lower]);
    expect(legacy.statusCode).toBe(200);
    expect(legacy.json().floors.map((item: { id: string }) => item.id)).toEqual([upperId, lowerId]);
    const swapped = await put(legacy.json().version, [
      { ...upper, id: lowerId }, { ...lower, id: upperId },
    ]);
    expect(swapped.statusCode).toBe(200);
    expect(swapped.json().floors).toEqual([
      { ...upper, id: lowerId }, { ...lower, id: upperId },
    ]);

    const mixed = await put(swapped.json().version, [
      lower, { ...floor(`__pending_${upperId}`), id: upperId },
    ]);
    expect(mixed.statusCode).toBe(200);
    const read = await request(owner, url);
    expect(read.statusCode).toBe(200);
    expect(read.headers["cache-control"]).toContain("no-store");
    expect(read.json()).toEqual(mixed.json());
    expect(read.json().floors[0].id).not.toBe(upperId);
    expect(read.json().floors[1].id).toBe(upperId);
    const after = await db.premiseFloor.findUniqueOrThrow({ where: { id: upperId } });
    expect(after.createdAt).toEqual(before.createdAt);
    expect(await db.premiseFloor.findUnique({ where: { id: lowerId } })).toBeNull();
  });

  it("rejects invalid IDs and stale writes without changing floors, version, or audit", async () => {
    const owner = await actor("PEMOHON");
    const other = await actor("PEMOHON");
    const draft = await draftFor(owner);
    const foreign = await draftFor(other);
    const url = `/api/application-drafts/${draft.id}/floors`;
    const otherUrl = `/api/application-drafts/${foreign.id}/floors`;
    const put = (version: number, floors: unknown[]) =>
      request(owner, url, "PUT", { version, floors });
    const first = await put(draft.version, [floor("Aras 1")]);
    expect(first.statusCode).toBe(200);
    const before = first.json();
    const otherFloors = await request(other, otherUrl, "PUT", {
      version: foreign.version, floors: [floor("Aras 2")],
    });
    expect(otherFloors.statusCode).toBe(200);
    const id = before.floors[0].id;
    const foreignId = otherFloors.json().floors[0].id;

    for (const floors of [
      [{ ...floor("Aras 2"), id: foreignId }],
      [{ ...floor("Aras 2"), id: randomUUID() }],
      [{ ...floor("Aras 2"), id }, { ...floor("Aras 3"), id }],
    ]) {
      expect((await put(before.version, floors)).statusCode).toBe(400);
    }
    expect((await request(other, url)).statusCode).toBe(404);
    expect((await request(other, url, "PUT", { version: before.version, floors: before.floors })).statusCode).toBe(404);
    expect((await put(draft.version, [floor("Aras 3")])).statusCode).toBe(409);
    expect((await request(owner, url)).json()).toEqual(before);
    expect(await db.auditLog.count({ where: { target: draft.id, action: "APPLICATION_FLOORS_SAVED" } }))
      .toBe(1);
  });
});

describe("K02 physical units and floor links", () => {
  async function fixture(owner: Actor, companyId?: string) {
    const draft = await request(owner, "/api/application-drafts", "POST", companyId
      ? { capacity: "COMPANY", companyId } : { capacity: "INDIVIDUAL" });
    expect(draft.statusCode).toBe(201);
    const { id, version } = draft.json();
    const root = `/api/application-drafts/${id}`;
    const area = await request(owner, root + "/premises", "PUT", {
      version, premises: { ...emptyPremises, accommodationUnits: 5 },
    });
    expect(area.statusCode).toBe(200);
    const floors = await request(owner, root + "/floors", "PUT", {
      version: area.json().version,
      floors: ["Bawah", "Aras 1"].map((floorLabel) => ({
        floorLabel, rooms: 1, beds: 2, workers: 2, areaSqm: 50,
        facilities: { toilets: 1, bathrooms: 1, sinks: 1, diningTables: 0, diningChairs: 0, fireExtinguishers: 1 },
      })),
    });
    expect(floors.statusCode).toBe(200);
    return { id, root, ...floors.json() };
  }

  it("counts a linked unit once and preserves UUID, legacy aggregate and rollback guard", async () => {
    const owner = await actor("PEMOHON");
    const draft = await fixture(owner);
    const url = draft.root + "/units";
    const legacy = await request(owner, url);
    expect(legacy.statusCode).toBe(200);
    expect(legacy.headers["cache-control"]).toContain("no-store");
    expect(legacy.json()).toMatchObject({
      units: [], inventoryStatus: "NOT_RECORDED", totals: { unitCount: 0, declaredCount: 5 },
    });
    const floorIds = draft.floors.map(({ id }: { id: string }) => id);
    const put = (version: number, units: unknown[]) => request(owner, url, "PUT", { version, units });
    const first = await put(draft.version, [{ unitLabel: "Kedai A", floorIds }]);
    expect(first.statusCode).toBe(200);
    const result = first.json();
    expect(result).toMatchObject({ units: [{ unitLabel: "Kedai A", floorIds }], totals: { unitCount: 1, declaredCount: 5 }, inventoryStatus: "MISMATCH" });
    const unitId = result.units[0].unitId;
    const savedAt = (await db.premiseUnit.findUniqueOrThrow({ where: { id: unitId } })).createdAt;
    expect(await db.premiseUnitFloor.count({ where: { unitId } })).toBe(2);

    const floorUrl = draft.root + "/floors";
    expect((await request(owner, floorUrl, "PUT", {
      version: result.version, floors: [draft.floors[0]],
    })).statusCode).toBe(409);
    expect((await put(result.version, [])).statusCode).toBe(409);
    await expect(db.premiseFloor.delete({ where: { id: floorIds[0] } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.premiseUnit.delete({ where: { id: unitId } })).rejects.toMatchObject({ code: "P2003" });
    expect((await request(owner, url)).json()).toEqual(result);
    expect(await db.auditLog.count({ where: { target: draft.id, action: "APPLICATION_UNITS_SAVED" } })).toBe(1);

    const rename = await put(result.version, [{ unitId, unitLabel: "Kedai A Baharu", floorIds }]);
    expect(rename.statusCode).toBe(200);
    expect(rename.json().units[0]).toMatchObject({ unitId, unitLabel: "Kedai A Baharu" });
    expect((await db.premiseUnit.findUniqueOrThrow({ where: { id: unitId } })).createdAt).toEqual(savedAt);
    const unlink = await put(rename.json().version, [{ unitId, unitLabel: "Kedai A Baharu", floorIds: [] }]);
    expect(unlink.statusCode).toBe(200);
    const remove = await put(unlink.json().version, []);
    expect(remove.statusCode).toBe(200);
    expect(remove.json().totals).toEqual({ unitCount: 0, declaredCount: 5 });
    expect((await request(owner, floorUrl, "PUT", {
      version: remove.json().version,
      floors: [{ ...draft.floors[0], id: undefined }],
    })).statusCode).toBe(200);
  });

  it("enforces session, same-draft constraints and one shared-version winner", async () => {
    const owner = await actor("PEMOHON");
    const other = await actor("PEMOHON");
    const draft = await fixture(owner);
    const foreign = await fixture(other);
    const url = draft.root + "/units";
    const payload = {
      version: draft.version, units: [{ unitLabel: "Kedai A", floorIds: [draft.floors[0].id] }],
    };
    expect((await app.inject(url)).statusCode).toBe(401);
    expect((await app.inject({ url, method: "PUT", headers: {
      cookie: owner.cookie, origin: "http://localhost:5173",
    }, payload })).statusCode).toBe(403);
    expect((await request(other, url)).statusCode).toBe(404);
    expect((await request(other, url, "PUT", payload)).statusCode).toBe(404);
    expect((await request(owner, url, "PUT", { ...payload, units: [
      { unitLabel: "A", floorIds: [foreign.floors[0].id] },
    ] })).statusCode).toBe(400);

    const [units, floors] = await Promise.all([
      request(owner, url, "PUT", payload),
      request(owner, draft.root + "/floors", "PUT", {
        version: draft.version, floors: [...draft.floors].reverse(),
      }),
    ]);
    expect([units.statusCode, floors.statusCode].sort()).toEqual([200, 409]);
    let current = (await request(owner, url)).json();
    if (units.statusCode === 409) {
      const retry = await request(owner, url, "PUT", { ...payload, version: current.version });
      expect(retry.statusCode).toBe(200);
      current = retry.json();
    }
    const unitId = current.units[0].unitId;
    const foreignSaved = await request(other, foreign.root + "/units", "PUT", {
      version: foreign.version, units: [{ unitLabel: "Kedai A", floorIds: [] }],
    });
    expect(foreignSaved.statusCode).toBe(200);
    expect((await request(owner, url, "PUT", { version: current.version, units: [
      { unitId: foreignSaved.json().units[0].unitId, unitLabel: "A", floorIds: [] },
    ] })).statusCode).toBe(400);
    expect((await request(owner, url, "PUT", { version: current.version, units: [
      current.units[0], { unitLabel: "ＫＥＤＡＩ  Ａ", floorIds: [] },
    ] })).statusCode).toBe(400);

    await expect(db.premiseUnitFloor.create({
      data: { unitId, floorId: foreign.floors[0].id, draftId: draft.id },
    })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.premiseUnitFloor.create({
      data: { unitId, floorId: foreign.floors[0].id, draftId: foreign.id },
    })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.premiseUnitFloor.create({
      data: { unitId, floorId: current.units[0].floorIds[0], draftId: draft.id },
    })).rejects.toMatchObject({ code: "P2002" });
    expect((await request(owner, url)).json()).toEqual(current);
  });
  it("rechecks company authority and protects units from a same-company colleague", async () => {
    const owner = await actor("PEMOHON");
    const colleague = await actor("PEMOHON");
    const company = await db.company.create({ data: {
      name: "DATA UJIAN K02", registrationNumber: `K02-${randomUUID()}`,
      address: "DATA UJIAN", phone: "0000000000", email: `${randomUUID()}@example.test`,
      representatives: { create: [
        { userId: owner.id, authorityType: "PEKERJA" },
        { userId: colleague.id, authorityType: "PEKERJA" },
      ] },
    } });
    const draft = await fixture(owner, company.id);
    const url = draft.root + "/units";
    const data = { version: draft.version, units: [{ unitLabel: "Kedai A", floorIds: [] }] };
    const saved = await request(owner, url, "PUT", data);
    expect(saved.statusCode).toBe(200);
    expect((await request(colleague, url)).statusCode).toBe(404);
    await db.companyRepresentative.update({
      where: { userId_companyId: { userId: owner.id, companyId: company.id } },
      data: { status: "REVOKED" },
    });
    expect((await request(owner, url)).statusCode).toBe(404);
    expect((await request(owner, url, "PUT", { ...data, version: saved.json().version })).statusCode).toBe(404);
    expect(await db.premiseUnit.count({ where: { draftId: draft.id } })).toBe(1);
  });

});

describe("Issue 24 synthetic document scopes and submissions", () => {
  const scopedDatabase = /\/staylink_issue24_[a-z0-9_]+_test$/.test(
    process.env.TEST_DATABASE_URL ?? "",
  );
  it.runIf(scopedDatabase)(
    "rejects cross-draft evidence, captures exactly once and preserves the previous snapshot",
    async () => {
      const { captureSyntheticSubmission } =
        await import("../apps/api/src/synthetic-submissions");
      const a = await actor("PEMOHON");
      const other = await actor("PEMOHON");
      const makeDraft = async (owner: Actor) => {
        const response = await request(
          owner,
          "/api/application-drafts",
          "POST",
          { capacity: "INDIVIDUAL" },
        );
        expect(response.statusCode).toBe(201);
        return response.json().id as string;
      };
      const id = await makeDraft(a);
      const foreign = await makeDraft(other);
      const floor = (draftId: string) =>
        db.premiseFloor.create({
          data: {
            draftId,
            floorLabel: "Tingkat sintetik",
            position: 0,
            rooms: 1,
            beds: 1,
            workers: 1,
            areaSqm: 12,
            facilities: {},
          },
        });
      const [ownFloor, foreignFloor] = await Promise.all([
        floor(id),
        floor(foreign),
      ]);
      const premises = await db.applicationPremises.create({
        data: { draftId: id, buildingType: "SHOP", accommodationUnits: 1 },
      });
      const unit = await db.premiseUnit.create({
        data: {
          premiseId: premises.id,
          draftId: id,
          unitLabel: "A",
          normalizedLabel: "a",
        },
      });
      await db.premiseUnitFloor.create({
        data: { unitId: unit.id, floorId: ownFloor.id, draftId: id },
      });
      const document = await db.applicationDocument.create({
        data: {
          draftId: id,
          version: 1,
          category: "floor_layout",
          fileName: "synthetic.pdf",
          mimeType: "application/pdf",
          byteSize: 42,
          sha256: "0".repeat(64),
          uploadedBy: a.id,
          storageKey: `synthetic/${id}`,
        },
      });
      await expect(
        db.draftDocumentScope.create({
          data: {
            documentId: document.id,
            draftId: id,
            floorId: foreignFloor.id,
          },
        }),
      ).rejects.toThrow();
      await expect(
        db.draftDocumentScope.create({
          data: {
            documentId: document.id,
            draftId: id,
            floorId: ownFloor.id,
            unitId: unit.id,
          },
        }),
      ).rejects.toThrow();
      await db.draftDocumentScope.create({
        data: { documentId: document.id, draftId: id, floorId: ownFloor.id },
      });

      const path = `/api/application-drafts/${id}/documents`;
      const metadata = await request(a, path);
      expect(metadata.statusCode).toBe(200);
      expect(metadata.json().documents[0].scope).toEqual({
        unitId: null,
        floorId: ownFloor.id,
      });
      expect(metadata.json().documents[0]).not.toHaveProperty("storageKey");
      expect((await request(other, path)).statusCode).toBe(404);

      const policy = {
        declarationVersion: "SYNTHETIC-v1",
        documents: {
          version: "SYNTHETIC-v1",
          rules: [
            {
              requirement: "layout",
              alternatives: ["floor_layout"],
              scope: "FLOOR",
              requireVerified: false,
            },
          ],
        },
      };
      const input = {
        draftId: id,
        version: 1,
        accepted: true,
        declarationVersion: "SYNTHETIC-v1",
        key: randomUUID(),
        previousId: null,
      };
      await expect(
        captureSyntheticSubmission(a.id, input),
      ).rejects.toMatchObject({ statusCode: 409 });
      await expect(
        captureSyntheticSubmission(other.id, input, policy),
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        captureSyntheticSubmission(a.id, input, policy),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(
        await db.syntheticSubmission.count({ where: { draftId: id } }),
      ).toBe(0);
      await db.applicationDocument.update({
        where: { id: document.id },
        data: { scanStatus: "CLEAN" },
      });
      const [first, replay] = await Promise.all([
        captureSyntheticSubmission(a.id, input, policy),
        captureSyntheticSubmission(a.id, input, policy),
      ]);
      expect(replay).toEqual(first);
      await expect(
        captureSyntheticSubmission(a.id, { ...input, version: 2 }, policy),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(
        await db.auditLog.count({
          where: { action: "SYNTHETIC_SUBMISSION_CAPTURED", target: first.id },
        }),
      ).toBe(1);
      const original = await db.syntheticSubmission.findUniqueOrThrow({
        where: { id: first.id },
      });
      await expect(
        db.syntheticSubmission.update({
          where: { id: first.id },
          data: { snapshot: {} },
        }),
      ).rejects.toThrow();

      const edit = await request(a, `/api/application-drafts/${id}`, "PATCH", {
        version: 1,
        notes: "Pembetulan sintetik",
        capacity: "INDIVIDUAL",
      });
      expect(edit.statusCode).toBe(200);
      const next = {
        ...input,
        key: randomUUID(),
        version: 2,
        previousId: first.id,
      };
      await expect(
        captureSyntheticSubmission(a.id, next, policy),
      ).rejects.toMatchObject({ statusCode: 409 });
      const correction = await captureSyntheticSubmission(a.id, next, {
        ...policy,
        correctionFor: first.id,
      });
      expect(correction.id).not.toBe(first.id);
      expect(
        await db.syntheticSubmission.findUnique({ where: { id: first.id } }),
      ).toEqual(original);
      expect(
        (await request(a, `/api/application-drafts/${id}/submit`, "POST", {}))
          .statusCode,
      ).toBe(409);
    },
  );
});

describe("Issue 31 integrated synthetic portal", () => {
  const enabled = Boolean(syntheticPortalDatabase());
  const root = "/api/synthetic-portal";
  const facilities = {
    toilets: 1,
    bathrooms: 1,
    sinks: 1,
    diningTables: 0,
    diningChairs: 0,
    fireExtinguishers: 1,
  };
  const readyPremises = (draftId: string, count: number) => ({
    draftId,
    buildingType: "SHOP",
    accommodationUnits: 1,
    districtId: "SPU",
    address: "Alamat latihan",
    postcode: "13000",
    lotNumber: "LOT-SINTETIK",
    locality: "Mukim latihan",
    locationSource: "USER_PIN",
    latitude: 5.42,
    longitude: 100.4,
    currentUse: "Latihan",
    certificateType: "NOT_APPLICABLE",
    involvedFloors: count,
    totalRooms: count,
    proposedWorkers: count,
    floorAreaSqm: 12 * count,
  });

  it.runIf(enabled)(
    "isolates roles and drafts and persists the correction-to-reconciliation journey",
    async () => {
      const { createHmac } = await import("node:crypto");
      process.env.STAYLINK_SYNTHETIC_PIC_ID = pic.id;
      process.env.STAYLINK_SYNTHETIC_SUPERVISOR_ID = ppsk.id;
      const other = await actor("PEMOHON");
      const outsider = await actor("PIC_KAWASAN", "SPT");
      const newDraft = await request(
        applicant,
        "/api/application-drafts",
        "POST",
        { capacity: "INDIVIDUAL" },
      );
      expect(newDraft.statusCode).toBe(201);
      const id = newDraft.json().id as string;
      const path = `${root}/drafts/${id}`;
      const draftVersion = newDraft.json().version as number;
      const premises = await db.applicationPremises.create({
        data: readyPremises(id, 2),
      });
      const floors = await Promise.all(
        ["G", "1"].map((floorLabel, position) =>
          db.premiseFloor.create({
            data: {
              draftId: id,
              floorLabel,
              position,
              rooms: 1,
              beds: 1,
              workers: 1,
              facilities,
              areaSqm: 12,
            },
          }),
        ),
      );
      const unit = await db.premiseUnit.create({
        data: {
          draftId: id,
          premiseId: premises.id,
          unitLabel: "A",
          normalizedLabel: "a",
        },
      });
      await db.premiseUnitFloor.createMany({
        data: floors.map((floor) => ({
          draftId: id,
          unitId: unit.id,
          floorId: floor.id,
        })),
      });

      expect((await request(other, path)).statusCode).toBe(404);
      for (const section of ["units", "floors", "documents"])
        expect(
          (await request(other, `/api/application-drafts/${id}/${section}`))
            .statusCode,
        ).toBe(404);
      expect(
        (
          await request(other, `${path}/evidence`, "POST", {
            version: draftVersion,
            verdict: "CLEAN",
          })
        ).statusCode,
      ).toBe(404);
      expect((await request(pic, path)).statusCode).toBe(403);
      expect((await request(outsider, `${root}/reviews`)).statusCode).toBe(404);
      expect((await request(applicant, `${root}/reviews`)).statusCode).toBe(
        403,
      );
      expect((await request(applicant, path)).json().ready).toBe(false);
      await db.session.update({
        where: { id: hash(pic.cookie.slice("staylink=".length)) },
        data: { mfaVerified: false },
      });
      expect((await request(pic, `${root}/reviews`)).statusCode).toBe(403);
      await db.session.update({
        where: { id: hash(pic.cookie.slice("staylink=".length)) },
        data: { mfaVerified: true },
      });
      let version = draftVersion;
      for (const verdict of ["PENDING", "FAILED", "INFECTED", "CLEAN"]) {
        const evidence = await request(applicant, `${path}/evidence`, "POST", {
          version,
          verdict,
        });
        expect(evidence.statusCode, evidence.body).toBe(200);
        version = evidence.json().version;
        const state = (await request(applicant, path)).json();
        expect(state.ready).toBe(verdict === "CLEAN");
        expect(state.evidence).toHaveLength(2);
        expect(state.evidence[0]).not.toHaveProperty("storageKey");
      }
      const submit = {
        version,
        accepted: true,
        key: randomUUID(),
        previousId: null,
        declarationVersion: "SYNTHETIC-K05-v1",
      };
      expect(
        (
          await app.inject({
            url: `${path}/submit`,
            method: "POST",
            headers: {
              cookie: applicant.cookie,
              origin: "http://localhost:5173",
            },
            payload: submit,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            url: `${path}/submit`,
            method: "POST",
            headers: {
              cookie: applicant.cookie,
              origin: "https://other.example.test",
              "x-csrf-token": applicant.csrf,
            },
            payload: submit,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await request(applicant, `${path}/submit`, "POST", {
            ...submit,
            version: version - 1,
          })
        ).statusCode,
      ).toBe(409);
      const responses = await Promise.all([
        request(applicant, `${path}/submit`, "POST", submit),
        request(applicant, `${path}/submit`, "POST", submit),
      ]);
      for (const response of responses)
        expect(response.statusCode, response.body).toBe(200);
      const first = responses[0].json().id as string;
      expect(responses[1].json().id).toBe(first);
      const firstPath = `${root}/reviews/${first}`;
      expect(
        (
          await request(ppsk, `${firstPath}/billing`, "POST", {
            action: "ISSUE",
          })
        ).statusCode,
      ).toBe(409);
      const correction = {
        action: "REQUEST_CORRECTION",
        version: 1,
        reason: "Kemaskini latihan.",
      };
      expect(
        (await request(ppsk, firstPath, "POST", correction)).statusCode,
      ).toBe(403);
      const returned = await request(pic, firstPath, "POST", correction);
      expect(returned.statusCode, returned.body).toBe(200);
      expect(
        (await request(pic, firstPath, "POST", correction)).statusCode,
      ).toBe(409);
      expect((await request(applicant, path)).json().correctionReason).toBe(
        correction.reason,
      );
      const reedited = await request(
        applicant,
        `/api/application-drafts/${id}`,
        "PATCH",
        { capacity: "INDIVIDUAL", version, notes: "Pembetulan latihan." },
      );
      expect(reedited.statusCode).toBe(200);
      const next = await request(applicant, `${path}/submit`, "POST", {
        ...submit,
        version: reedited.json().version,
        key: randomUUID(),
        previousId: first,
      });
      expect(next.statusCode, next.body).toBe(200);
      const second = next.json().id as string;
      const secondPath = `${root}/reviews/${second}`;
      const comparison = await request(pic, secondPath + "/comparison");
      expect(comparison.statusCode, comparison.body).toBe(200);
      expect(comparison.json()).toMatchObject({
        previous: { draftVersion: version, floorCount: 2, unitCount: 1 },
        current: {
          draftVersion: reedited.json().version,
          floorCount: 2,
          unitCount: 1,
        },
        unitChanges: [],
      });
      expect(
        (await request(applicant, secondPath + "/comparison")).statusCode,
      ).toBe(403);
      expect((await request(pic, firstPath + "/comparison")).statusCode).toBe(
        404,
      );
      const matched = await request(
        pic,
        `${root}/reviews?view=submitted&search=${second.slice(0, 8)}`,
      );
      expect(matched.statusCode, matched.body).toBe(200);
      expect(
        matched.json().reviews.map((item: { id: string }) => item.id),
      ).toEqual([second]);
      expect(
        (await request(pic, `${root}/reviews?search=%25abcd`)).statusCode,
      ).toBe(400);
      await expect(
        db.syntheticSubmission.update({
          where: { id: first },
          data: { snapshot: {} },
        }),
      ).rejects.toThrow();
      expect(
        (await request(pic, firstPath, "POST", correction)).statusCode,
      ).toBe(404);
      const reviews = (await request(pic, `${root}/reviews`)).json().reviews;
      expect(
        reviews.find((row: { id: string }) => row.id === second),
      ).toMatchObject({
        status: "SUBMITTED",
        advice: { advisoryOnly: true },
        units: [{ label: "A", floorCount: 2 }],
      });
      const complete = {
        action: "CONFIRM_COMPLETE",
        version: 1,
        reason: "Bukti latihan lengkap.",
      };
      expect(
        (await request(pic, secondPath, "POST", complete)).statusCode,
      ).toBe(200);
      const register = {
        action: "REGISTER",
        version: 2,
        reason: "Selesai semakan penyelia.",
      };
      expect(
        (await request(pic, secondPath, "POST", register)).statusCode,
      ).toBe(403);
      const document = await db.applicationDocument.findFirstOrThrow({
        where: { draftId: id, category: "floor_layout", supersededAt: null },
      });
      await db.applicationDocument.update({
        where: { id: document.id },
        data: { scanStatus: "FAILED" },
      });
      const restricted = await request(pic, `${root}/reviews`);
      expect(
        restricted
          .json()
          .reviews.find((row: { id: string }) => row.id === second),
      ).toMatchObject({
        evidenceEligible: false,
        evidence: [expect.objectContaining({ scanStatus: "CLEAN" })],
      });
      expect(
        (await request(ppsk, secondPath, "POST", register)).statusCode,
      ).toBe(409);
      await db.applicationDocument.update({
        where: { id: document.id },
        data: { scanStatus: "CLEAN" },
      });
      expect(
        (await request(ppsk, secondPath, "POST", register)).statusCode,
      ).toBe(200);

      expect(
        (await request(ppsk, secondPath, "POST", register)).statusCode,
      ).toBe(409);
      expect(
        (await request(outsider, secondPath + "/comparison")).statusCode,
      ).toBe(404);
      const billPath = `${secondPath}/billing`;
      expect(
        (await request(pic, billPath, "POST", { action: "ISSUE" })).statusCode,
      ).toBe(403);
      const scope = await db.draftDocumentScope.findUniqueOrThrow({
        where: { documentId: document.id },
      });
      const otherFloor = floors.find((floor) => floor.id !== scope.floorId)!;
      await db.draftDocumentScope.update({
        where: { documentId: document.id },
        data: { floorId: otherFloor.id },
      });
      expect(
        (await request(ppsk, billPath, "POST", { action: "ISSUE" })).statusCode,
      ).toBe(409);
      await db.draftDocumentScope.update({
        where: { documentId: document.id },
        data: { floorId: scope.floorId },
      });
      const billed = await Promise.all(
        [0, 1].map(() => request(ppsk, billPath, "POST", { action: "ISSUE" })),
      );
      const invoice = billed[0].json().invoice;
      expect(invoice).toMatchObject({
        unitCount: 1,
        amountSen: 5000,
        status: "ISSUED",
      });
      expect(billed[1].json().invoice.id).toBe(invoice.id);
      expect((await request(other, `${path}/billing`)).statusCode).toBe(404);
      const applicantDashboard = await request(applicant, "/api/dashboard");
      expect(applicantDashboard.statusCode).toBe(200);
      expect(applicantDashboard.json().notifications.filter(
        (row: { type: string }) => row.type === "SYNTHETIC_REVIEW",
      )).toHaveLength(3);
      const otherDashboard = await request(other, "/api/dashboard");
      expect(otherDashboard.statusCode).toBe(200);
      expect(otherDashboard.json().notifications.filter(
        (row: { type: string }) => row.type === "SYNTHETIC_REVIEW",
      )).toHaveLength(0);
      const message = {
        invoiceId: invoice.id,
        eventId: invoice.id,
        providerReference: `SYNTHETIC-${invoice.id}`,
        currency: "MYR",
        amountSen: 5000,
        outcome: "SETTLED",
      };
      const callback = (amountSen: number, valid: boolean) => {
        const payload = JSON.stringify({ ...message, amountSen });
        const signature = createHmac(
          "sha256",
          Buffer.from(process.env.STAYLINK_SYNTHETIC_CALLBACK_KEY!, "hex"),
        )
          .update(payload)
          .digest("hex");
        return app.inject({
          url: `${root}/callbacks/payment/${second}`,
          method: "POST",
          headers: {
            "x-staylink-synthetic-signature": valid ? signature : "invalid",
          },
          payload: { payload },
        });
      };
      expect((await callback(5000, false)).statusCode).toBe(401);
      expect((await callback(1, true)).statusCode).toBe(409);
      expect((await request(outsider, billPath)).statusCode).toBe(404);
      expect(
        await db.auditLog.count({
          where: { action: "SYNTHETIC_PORTAL_INVOICE_SETTLED", target: second },
        }),
      ).toBe(0);

      const settlements = await Promise.all([
        callback(5000, true),
        callback(5000, true),
      ]);
      for (const response of settlements) {
        expect(response.statusCode).toBe(200);
        expect(response.json().invoice.status).toBe("SETTLED");
      }
      expect(
        settlements.map((response) => response.json().result).sort(),
      ).toEqual(["REPLAY", "SETTLED"]);
      expect(
        (await request(applicant, `${path}/billing`)).json().invoice.status,
      ).toBe("SETTLED");
      expect(
        await db.auditLog.count({
          where: { action: "SYNTHETIC_PORTAL_INVOICE_SETTLED", target: second },
        }),
      ).toBe(1);
      expect(
        (
          await request(
            applicant,
            `/api/application-drafts/${id}/submit`,
            "POST",
            {},
          )
        ).statusCode,
      ).toBe(409);
    },
  );

  it.runIf(enabled)(
    "paginates eligible reviews with tied timestamps and role-specific filtering",
    async () => {
      process.env.STAYLINK_SYNTHETIC_PIC_ID = pic.id;
      process.env.STAYLINK_SYNTHETIC_SUPERVISOR_ID = ppsk.id;
      const sameTime = new Date();
      const floorId = randomUUID();
      const baseSnapshot = {
        capacity: "INDIVIDUAL",
        companyId: null,
        districtId: "SPU",
        units: [
          { id: randomUUID(), unitLabel: "Ujian halaman", floorIds: [floorId] },
        ],
        floors: [{ id: floorId, floorLabel: "G" }],
        evidence: [
          {
            id: randomUUID(),
            version: 1,
            category: "floor_layout",
            scope: "FLOOR",
            targetId: floorId,
            scanStatus: "CLEAN",
            verificationStatus: "UNVERIFIED",
          },
        ],
      };
      const records = Array.from({ length: 25 }, (_, index) => ({
        id: randomUUID(),
        draftId: randomUUID(),
        actorId: applicant.id,
        draftVersion: 1,
        key: randomUUID(),
        declarationVersion: "SYNTHETIC-K05-v1",
        policyVersion: "SYNTHETIC-K04-v1",
        createdAt: sameTime,
        snapshot: {
          ...baseSnapshot,
          ...(index === 23
            ? { districtId: "SPT" }
            : index === 24
              ? { capacity: "COMPANY", companyId: randomUUID() }
              : {}),
        },
      }));
      await db.applicationDraft.createMany({
        data: records.map(({ draftId }) => ({
          id: draftId,
          capacity: "INDIVIDUAL",
          initiatedByUserId: applicant.id,
          officialApplicantUserId: applicant.id,
          initiatorSnapshot: {},
          applicantSnapshot: {},
        })),
      });
      await db.syntheticSubmission.createMany({ data: records });
      const queue = `${root}/reviews?view=action`;
      expect(
        (await request(pic, `${queue}&cursor=bad_cursor`)).statusCode,
      ).toBe(400);
      const first = await request(pic, queue);
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json().reviews).toHaveLength(20);
      const next = await request(
        pic,
        `${queue}&cursor=${first.json().nextCursor}`,
      );
      expect(next.statusCode, next.body).toBe(200);
      const seen = [first, next].flatMap((response) =>
        response.json().reviews.map((row: { id: string }) => row.id),
      );
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual(
        expect.arrayContaining(records.slice(0, 23).map(({ id }) => id)),
      );
      expect(seen).not.toContain(records[23].id);
      expect(seen).not.toContain(records[24].id);
      const hidden = await request(
        pic,
        `${root}/reviews?search=${records[23].id}`,
      );
      expect(hidden.json().reviews).toEqual([]);
      expect(
        (await request(pic, `${root}/reviews/${records[23].id}/comparison`))
          .statusCode,
      ).toBe(404);

      expect(
        (await request(ppsk, queue))
          .json()
          .reviews.map((row: { id: string }) => row.id),
      ).not.toContain(records[0].id);
    },
  );

  it.runIf(enabled)(
    "rejects an invalid owner policy without exposing a route or affecting ordinary drafts",
    async () => {
      const prior = process.env.STAYLINK_SYNTHETIC_POLICY_JSON;
      let candidate: FastifyInstance | undefined;
      try {
        process.env.STAYLINK_SYNTHETIC_POLICY_JSON =
          '{"mode":"PRODUCTION","approved":true}';
        candidate = await buildApp();
        expect(
          candidate.hasRoute({ method: "GET", url: root + "/drafts/:id" }),
        ).toBe(false);
        expect(
          candidate.hasRoute({
            method: "POST",
            url: root + "/callbacks/payment/:id",
          }),
        ).toBe(false);
        expect((await candidate.inject("/api/health")).statusCode).toBe(200);
        expect(
          candidate.hasRoute({
            method: "POST",
            url: "/api/application-drafts/:id/submit",
          }),
        ).toBe(true);
      } finally {
        if (prior === undefined)
          delete process.env.STAYLINK_SYNTHETIC_POLICY_JSON;
        else process.env.STAYLINK_SYNTHETIC_POLICY_JSON = prior;
        await candidate?.close();
      }
    },
  );

  it.runIf(enabled)(
    "uses scoped policy facts and rejects stale or missing confirmation across configuration reloads",
    async () => {
      const { loadSyntheticOwnerPolicy } =
        await import("../apps/api/src/synthetic-owner-policy");
      const baseline = loadSyntheticOwnerPolicy()!.config;
      const owner = await actor("PEMOHON");
      const created = await request(owner, "/api/application-drafts", "POST", {
        capacity: "INDIVIDUAL",
      });
      expect(created.statusCode).toBe(201);
      const id = created.json().id as string;
      const premises = await db.applicationPremises.create({
        data: readyPremises(id, 1),
      });
      const floor = await db.premiseFloor.create({
        data: {
          draftId: id,
          floorLabel: "G",
          position: 0,
          rooms: 1,
          workers: 1,
          beds: 1,
          areaSqm: 12,
          facilities,
        },
      });
      const unit = await db.premiseUnit.create({
        data: {
          draftId: id,
          premiseId: premises.id,
          unitLabel: "U",
          normalizedLabel: "u",
        },
      });
      await db.premiseUnitFloor.create({
        data: { draftId: id, floorId: floor.id, unitId: unit.id },
      });
      const policy = {
        ...baseline,
        version: "SYNTHETIC-OWNER-UAT-v1",
        declaration: {
          version: "SYNTHETIC-OWNER-AKUAN-v1",
          text: "Saya menerima akuan konfigurasi latihan.",
        },
        documents: {
          version: "SYNTHETIC-OWNER-BUKTI-v1",
          rules: [
            ...baseline.documents.rules,
            {
              requirement: "tenancy",
              capacity: "INDIVIDUAL",
              premiseType: "SHOP",
              scope: "UNIT",
              alternatives: ["ownership_or_tenancy"],
              requireVerified: false,
            },
            {
              requirement: "certificate",
              condition: "hasBuildingCertificate",
              scope: "DRAFT",
              alternatives: ["building_certificate"],
              requireVerified: false,
            },
          ],
        },
        review: { ...baseline.review, enabled: false },
        billing: { mode: "DISABLED" },
      };
      const earlier = process.env.STAYLINK_SYNTHETIC_POLICY_JSON;
      const apps: FastifyInstance[] = [];
      const configured = async (config: unknown) => {
        process.env.STAYLINK_SYNTHETIC_POLICY_JSON = JSON.stringify(config);
        const candidate = await buildApp();
        apps.push(candidate);
        return (
          url: string,
          method: "GET" | "POST" = "GET",
          payload?: object,
        ) =>
          candidate.inject({
            method,
            url,
            payload,
            headers: {
              cookie: owner.cookie,
              origin: "http://localhost:5173",
              "x-csrf-token": owner.csrf,
            },
          });
      };
      try {
        const first = await configured(policy);
        const path = `${root}/drafts/${id}`;
        expect((await first(root + "/reviews")).statusCode).toBe(404);
        expect((await first(path + "/billing")).statusCode).toBe(404);
        expect(
          (await first(root + `/callbacks/payment/${randomUUID()}`, "POST", {}))
            .statusCode,
        ).toBe(404);
        const evidence = await first(path + "/evidence", "POST", {
          version: 1,
          verdict: "CLEAN",
        });
        expect(evidence.statusCode, evidence.body).toBe(200);
        expect(
          await db.applicationDocument.count({
            where: { draftId: id, supersededAt: null },
          }),
        ).toBe(2);
        const current = await first(path);
        expect(current.json().requirements).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              requirement: "layout",
              applicability: "REQUIRED",
              eligibleTargets: 1,
            }),
            expect.objectContaining({
              requirement: "tenancy",
              applicability: "REQUIRED",
              eligibleTargets: 1,
            }),
            expect.objectContaining({
              requirement: "certificate",
              applicability: "NOT_APPLICABLE",
              eligibleTargets: 0,
            }),
          ]),
        );
        expect(current.json()).toMatchObject({
          ready: true,
          draftVersion: 2,
          policyVersion: policy.documents.version,
          evidence: expect.arrayContaining([
            expect.objectContaining({
              category: "floor_layout",
              scope: { floorId: floor.id, unitId: null },
            }),
            expect.objectContaining({
              category: "ownership_or_tenancy",
              scope: { unitId: unit.id, floorId: null },
            }),
          ]),
        });
        const input = {
          version: 2,
          accepted: true,
          key: randomUUID(),
          previousId: null,
          declarationVersion: policy.declaration.version,
        };
        expect((await first(path + "/submit", "POST", input)).statusCode).toBe(
          409,
        );
        const submitted = await first(path + "/submit", "POST", {
          ...input,
          policyFingerprint: current.json().policyFingerprint,
        });
        expect(submitted.statusCode, submitted.body).toBe(200);
        const same = await first(path + "/submit", "POST", {
          ...input,
          policyFingerprint: current.json().policyFingerprint,
        });
        expect(same.json()).toEqual(submitted.json());
        const saved = await db.syntheticSubmission.findUniqueOrThrow({
          where: { id: submitted.json().id },
        });
        expect(saved.snapshot).toMatchObject({
          ownerPolicyVersion: policy.version,
          policyFingerprint: current.json().policyFingerprint,
        });

        const updated = await configured({
          ...policy,
          declaration: {
            ...policy.declaration,
            text: "Teks latihan berubah tanpa menaikkan versi.",
          },
        });
        const latest = (await updated(path)).json();
        expect(latest.latest.id).toBe(submitted.json().id);
        expect(latest.policyFingerprint).not.toBe(
          current.json().policyFingerprint,
        );
        expect(
          (
            await updated(path + "/submit", "POST", {
              ...input,
              policyFingerprint: current.json().policyFingerprint,
            })
          ).statusCode,
        ).toBe(409);
        expect(
          (
            await updated(path + "/submit", "POST", {
              ...input,
              policyFingerprint: latest.policyFingerprint,
            })
          ).statusCode,
        ).toBe(409);
        expect(
          await db.syntheticSubmission.count({ where: { draftId: id } }),
        ).toBe(1);
        expect(
          (await updated(`/api/application-drafts/${id}/submit`, "POST", {}))
            .statusCode,
        ).toBe(409);
      } finally {
        if (earlier === undefined)
          delete process.env.STAYLINK_SYNTHETIC_POLICY_JSON;
        else process.env.STAYLINK_SYNTHETIC_POLICY_JSON = earlier;
        for (const candidate of apps) await candidate.close();
      }
    },
  );

  it.runIf(enabled)(
    "denies a revoked representative even with an existing synthetic draft",
    async () => {
      const company = await request(applicant, "/api/companies", "POST", {
        name: "Syarikat latihan",
        registrationNumber: `UJIAN${randomBytes(7).toString("hex")}`,
        address: "Alamat simulasi",
        phone: "0000000000",
        email: "fixture@example.test",
        authorityType: "PENGARAH",
      });
      expect(company.statusCode).toBe(201);
      const companyId = company.json().id as string;
      const where = { userId_companyId: { userId: applicant.id, companyId } };
      const representative = await db.companyRepresentative.findUniqueOrThrow({ where });
      const uploaded = await request(applicant, `/api/companies/${companyId}/documents`, "POST", {
        fileName: "proof-synthetic.pdf",
        content: Buffer.from("%PDF-1.4\nDATA UJIAN\n%%EOF").toString("base64"),
      });
      expect(uploaded.statusCode).toBe(200);
      const proofId = uploaded.json().id;
      expect(await scanDelegationDocument(db, {
        scan: async () => ({ status: "CLEAN", engine: "synthetic" }),
      }, proofId)).toBe(true);
      const verifier = await actor("PIC_KAWASAN");
      expect((await request(verifier, `/api/representations/${representative.id}/verify`, "POST", {
        documentId: proofId, expectedRevision: 1, status: "VERIFIED", reason: "Semakan sintetik P0",
      })).statusCode).toBe(200);
      const created = await request(
        applicant,
        "/api/application-drafts",
        "POST",
        { capacity: "COMPANY", companyId },
      );
      expect(created.statusCode).toBe(201);
      await db.userRoleAssignment.create({
        data: {
          userId: applicant.id,
          roleId: "WAKIL_SYARIKAT",
          reference: "UAT 49",
        },
      });
      expect(
        (
          await request(applicant, "/api/auth/role", "POST", {
            roleId: "WAKIL_SYARIKAT",
          })
        ).statusCode,
      ).toBe(200);
      const id = created.json().id as string;
      const draftPath = `${root}/drafts/${id}`;
      const expiredAt = new Date(Date.now() - 60_000);
      await db.companyRepresentative.update({
        where,
        data: {
          startsAt: new Date(Date.now() - 120_000),
          endsAt: expiredAt,
        },
      });
      expect((await request(applicant, draftPath)).statusCode).toBe(404);
      await db.companyRepresentative.update({ where, data: { endsAt: null } });

      expect((await request(applicant, draftPath)).statusCode).toBe(200);
      const floor = await db.premiseFloor.create({
        data: {
          draftId: id,
          floorLabel: "G",
          position: 0,
          rooms: 1,
          beds: 1,
          workers: 1,
          areaSqm: 12,
          facilities,
        },
      });
      const premises = await db.applicationPremises.create({
        data: readyPremises(id, 1),
      });
      const unit = await db.premiseUnit.create({
        data: {
          draftId: id,
          premiseId: premises.id,
          unitLabel: "B",
          normalizedLabel: "b",
        },
      });
      await db.premiseUnitFloor.create({
        data: { draftId: id, unitId: unit.id, floorId: floor.id },
      });
      const evidence = await request(
        applicant,
        `${draftPath}/evidence`,
        "POST",
        { verdict: "CLEAN", version: created.json().version },
      );
      expect(evidence.statusCode, evidence.body).toBe(200);
      const submitted = await request(
        applicant,
        `${draftPath}/submit`,
        "POST",
        {
          version: evidence.json().version,
          accepted: true,
          key: randomUUID(),
          declarationVersion: "SYNTHETIC-K05-v1",
          previousId: null,
        },
      );
      expect(submitted.statusCode, submitted.body).toBe(200);
      expect(
        await db.auditLog.count({
          where: {
            target: submitted.json().id,
            action: "SYNTHETIC_SUBMISSION_CAPTURED",
            activeRole: "WAKIL_SYARIKAT",
          },
        }),
      ).toBe(1);

      const switchCapacity = await request(
        applicant,
        `/api/application-drafts/${id}`,
        "PATCH",
        {
          capacity: "INDIVIDUAL",
          version: evidence.json().version,
          notes: "Tukar kapasiti draf latihan.",
        },
      );
      expect(switchCapacity.statusCode).toBe(200);
      await db.companyRepresentative.update({
        where,
        data: { status: "REVOKED" },
      });
      expect((await request(applicant, draftPath)).statusCode).toBe(404);
      expect(
        (
          await request(
            pic,
            `${root}/reviews/${submitted.json().id}/comparison`,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await request(applicant, `${draftPath}/evidence`, "POST", {
            version: switchCapacity.json().version,
            verdict: "CLEAN",
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (await request(applicant, `${draftPath}/billing`)).statusCode,
      ).toBe(404);
      const reviews = await request(pic, `${root}/reviews`);
      expect(reviews.statusCode, reviews.body).toBe(200);
      expect(reviews.json().reviews).not.toContainEqual(
        expect.objectContaining({ id: submitted.json().id }),
      );
      expect(
        (
          await request(pic, `${root}/reviews/${submitted.json().id}`, "POST", {
            action: "CONFIRM_COMPLETE",
            version: 1,
            reason: "Latihan sekatan.",
          })
        ).statusCode,
      ).toBe(404);
    },
  );
});

it("keeps the same CSRF token across tabs and separates it from other sessions", async () => {
  const a = await actor("PEMOHON");
  const b = await actor("PEMOHON");
  const tabs = await Promise.all([
    request(a, "/api/auth/me"),
    request(a, "/api/auth/me"),
  ]);
  for (const tab of tabs) {
    expect(tab.statusCode).toBe(200);
    expect(tab.headers["cache-control"]).toContain("no-store");
  }
  const csrf = tabs[0].json().csrf as string;
  expect(tabs[1].json().csrf).toBe(csrf);
  expect((await request(b, "/api/auth/me")).json().csrf).not.toBe(csrf);
  expect((await request(a, "/api/auth/me")).json().csrf).toBe(csrf);
  for (const tab of tabs) {
    const saved = await request(
      { ...a, csrf: tab.json().csrf },
      "/api/application-drafts",
      "POST",
      { capacity: "INDIVIDUAL" },
    );
    expect(saved.statusCode).toBe(201);
  }
  expect(
    (
      await request(a, "/api/application-drafts", "POST", {
        capacity: "INDIVIDUAL",
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await request({ ...b, csrf }, "/api/application-drafts", "POST", {
        capacity: "INDIVIDUAL",
      })
    ).statusCode,
  ).toBe(403);
});

it("does not register synthetic endpoints in production and preserves the request limit", async () => {
  const previousMode = process.env.NODE_ENV;
  let productionApp: FastifyInstance | undefined;
  try {
    process.env.NODE_ENV = "production";
    productionApp = await buildApp();
    expect(
      productionApp.hasRoute({
        method: "GET",
        url: "/api/synthetic-portal/drafts/:id",
      }),
    ).toBe(false);
    expect(
      productionApp.hasRoute({
        method: "POST",
        url: "/api/synthetic-portal/callbacks/payment/:id",
      }),
    ).toBe(false);
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
    await productionApp?.close();
  }
  for (let count = 0; count < 120; count++) {
    const response = await app.inject({
      url: "/api/health",
      remoteAddress: "2001:db8::36",
    });
    expect(response.statusCode).toBe(200);
  }
  const limited = await app.inject({
    url: "/api/health",
    remoteAddress: "2001:db8::36",
  });
  expect(limited.statusCode).toBe(429);
  expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
});
