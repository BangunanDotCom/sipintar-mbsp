import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import {
  db,
  hash,
  token,
  audit,
  notify,
  issueIdentity,
  encrypt,
  decrypt,
  safeUser,
  origin,
  production,
} from "./core.js";
import {
  isCurrent,
  passwordSchema,
  registerSchema,
} from "../../../packages/shared/src/index.js";
export function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}
export async function session(req: FastifyRequest, full = true) {
  const raw = req.cookies.staylink;
  if (!raw) fail(401, "Sila log masuk.");
  const s = await db.session.findUnique({
    where: { id: hash(raw) },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: true } } } },
        },
      },
    },
  });
  if (!s || s.expiresAt < new Date() || s.user.status !== "ACTIVE")
    fail(401, "Sesi tamat atau akaun tidak aktif.");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (
      req.headers.origin !== origin ||
      typeof req.headers["x-csrf-token"] !== "string" ||
      hash(req.headers["x-csrf-token"]) !== s.csrfHash
    )
      fail(403, "Pengesahan keselamatan gagal. Muat semula halaman.");
  }
  if (full) {
    if (!s.user.emailVerified) fail(403, "Sahkan e-mel anda dahulu.");
    if (s.user.kind === "OFFICER" && !s.mfaVerified)
      fail(403, "Pengesahan MFA diperlukan.");
  }
  return s;
}
export async function authorize(req: FastifyRequest, action: string) {
  const s = await session(req);
  const assignments = s.user.roles.filter(
    (a) => isCurrent(a) && a.roleId === s.activeRole,
  );
  if (
    !assignments.some((a) =>
      a.role.permissions.some((p) => p.action === action),
    )
  ) {
    await audit(s.userId, s.activeRole, "ACCESS_DENIED", action, "DENIED");
    fail(403, "Anda tidak mempunyai kebenaran untuk tindakan ini.");
  }
  return { ...s, assignments };
}
export const totp = (secret: string) =>
  new OTPAuth.TOTP({
    issuer: "STAYLink MBSP",
    label: "Pegawai",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
async function makeSession(app: FastifyInstance, reply: any, user: any) {
  const raw = token(),
    csrf = token();
  await db.session.create({
    data: {
      id: hash(raw),
      userId: user.id,
      activeRole: null,
      csrfHash: hash(csrf),
      expiresAt: new Date(Date.now() + 8 * 3600000),
      mfaVerified: user.kind !== "OFFICER",
    },
  });
  reply.setCookie("staylink", raw, {
    httpOnly: true,
    sameSite: "strict",
    secure: production,
    path: "/",
    maxAge: 28800,
  });
  return { user: safeUser(user), csrf, mfaRequired: user.kind === "OFFICER" };
}
export async function authRoutes(app: FastifyInstance) {
  const authLimit = {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
  };
  app.post("/api/auth/register", authLimit, async (req, reply) => {
    const b = registerSchema.parse(req.body);
    let user;
    try {
      user = await db.user.create({
        data: {
          name: b.name,
          email: b.email,
          phone: b.phone,
          passwordHash: await argon2.hash(b.password, {
            type: argon2.argon2id,
          }),
          consentAt: new Date(),
          roles: {
            create: { roleId: "PEMOHON", reference: "Pendaftaran awam" },
          },
        },
      });
    } catch (e: any) {
      if (e.code === "P2002")
        fail(409, "Pendaftaran tidak dapat diteruskan. Cuba pemulihan akaun.");
      throw e;
    }
    const t = await issueIdentity(user.id, "VERIFY_EMAIL");
    await notify(
      user.id,
      "VERIFICATION",
      "Sahkan e-mel STAYLink",
      "Sila semak e-mel untuk mengaktifkan akaun.",
      `${origin}/aktifkan?type=VERIFY_EMAIL&token=${t}`,
    );
    await audit(user.id, null, "REGISTER", user.id);
    reply.code(201);
    return { message: "Akaun didaftarkan. Semak e-mel anda untuk pengesahan." };
  });
  app.post("/api/auth/login", authLimit, async (req, reply) => {
    const b = z
      .object({
        email: z.string().toLowerCase(),
        password: z.string().max(128),
      })
      .parse(req.body);
    const u = await db.user.findUnique({ where: { email: b.email } });
    const valid = u?.passwordHash
      ? await argon2.verify(u.passwordHash, b.password)
      : await argon2.verify(await dummyHash, "invalid");
    if (!u || !valid || u.status !== "ACTIVE") {
      await audit(u?.id || null, null, "LOGIN", undefined, "FAILURE");
      fail(401, "E-mel atau kata laluan tidak sah.");
    }
    await audit(u.id, null, "LOGIN", u.id);
    return makeSession(app, reply, u);
  });
  app.get("/api/auth/me", async (req) => {
    const s = await session(req, false);
    const csrf = token();
    await db.session.update({
      where: { id: s.id },
      data: { csrfHash: hash(csrf) },
    });
    const factor = await db.mfaFactor.findUnique({
      where: { userId: s.userId },
    });
    return {
      user: safeUser(s.user),
      roles: s.user.roles
        .filter((a) => isCurrent(a))
        .map((a) => ({
          id: a.roleId,
          label: a.role.label,
          districtId: a.districtId,
          endsAt: a.endsAt,
        })),
      activeRole: s.activeRole,
      csrf,
      mfaRequired: s.user.kind === "OFFICER" && !s.mfaVerified,
      mfaEnrolled: factor?.verified || false,
    };
  });
  app.post("/api/auth/logout", async (req, reply) => {
    const s = await session(req, false);
    await db.session.delete({ where: { id: s.id } });
    reply.clearCookie("staylink", { path: "/" });
    return { ok: true };
  });
  app.post("/api/auth/role", async (req) => {
    const s = await session(req);
    const { roleId } = z.object({ roleId: z.string() }).parse(req.body);
    if (!s.user.roles.some((a) => a.roleId === roleId && isCurrent(a)))
      fail(403, "Pelantikan tidak aktif atau telah tamat.");
    await db.session.update({
      where: { id: s.id },
      data: { activeRole: roleId },
    });
    await audit(s.userId, roleId, "ROLE_SWITCH", s.userId);
    return { ok: true };
  });
  app.post("/api/auth/activate", authLimit, async (req) => {
    const b = z
      .object({
        token: z.string().length(64),
        type: z.enum(["VERIFY_EMAIL", "OFFICER_INVITE", "RESET_PASSWORD"]),
        password: passwordSchema.optional(),
      })
      .parse(req.body);
    if (b.type !== "VERIFY_EMAIL" && !b.password)
      fail(400, "Kata laluan baharu diperlukan.");
    const passwordHash = b.password
      ? await argon2.hash(b.password, { type: argon2.argon2id })
      : undefined;
    const u = await db.$transaction(async (tx) => {
      const identity = await tx.authenticationIdentity.findUnique({
        where: { tokenHash: hash(b.token) },
      });
      if (
        !identity ||
        identity.provider !== b.type ||
        identity.consumedAt ||
        identity.expiresAt < new Date()
      )
        fail(400, "Pautan tidak sah atau telah luput.");
      const claim = await tx.authenticationIdentity.updateMany({
        where: { id: identity.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (!claim.count) fail(400, "Pautan telah digunakan.");
      const user = await tx.user.update({
        where: { id: identity.userId },
        data: {
          emailVerified: true,
          ...(passwordHash ? { passwordHash } : {}),
        },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      return user;
    });
    await audit(u.id, null, b.type, u.id);
    await notify(
      u.id,
      "SECURITY",
      "Akaun dikemas kini",
      "Pengesahan akaun atau kata laluan berjaya.",
    );
    return { message: "Berjaya. Sila log masuk." };
  });
  app.post("/api/auth/recover", authLimit, async (req) => {
    const { email, type } = z
      .object({
        email: z.email().transform((x) => x.toLowerCase()),
        type: z
          .enum(["RESET_PASSWORD", "VERIFY_EMAIL"])
          .default("RESET_PASSWORD"),
      })
      .parse(req.body);
    const u = await db.user.findUnique({ where: { email } });
    if (
      u &&
      u.status === "ACTIVE" &&
      (type !== "VERIFY_EMAIL" || !u.emailVerified)
    ) {
      const t = await issueIdentity(u.id, type);
      await notify(
        u.id,
        "SECURITY",
        "Pautan keselamatan STAYLink",
        "Pautan pemulihan telah diminta.",
        `${origin}/aktifkan?type=${type}&token=${t}`,
      );
    }
    return { message: "Jika akaun layak, pautan akan dihantar melalui e-mel." };
  });
  app.post("/api/auth/password", async (req) => {
    const s = await session(req);
    const b = z
      .object({ currentPassword: z.string(), password: passwordSchema })
      .parse(req.body);
    if (
      !s.user.passwordHash ||
      !(await argon2.verify(s.user.passwordHash, b.currentPassword))
    )
      fail(400, "Kata laluan semasa tidak sah.");
    await db.$transaction([
      db.user.update({
        where: { id: s.userId },
        data: {
          passwordHash: await argon2.hash(b.password, {
            type: argon2.argon2id,
          }),
        },
      }),
      db.session.deleteMany({ where: { userId: s.userId } }),
    ]);
    await audit(s.userId, s.activeRole, "PASSWORD_CHANGE", s.userId);
    await notify(
      s.userId,
      "SECURITY",
      "Kata laluan ditukar",
      "Semua sesi telah ditamatkan.",
    );
    return { message: "Kata laluan ditukar. Sila log masuk semula." };
  });
  app.post("/api/auth/mfa/setup", async (req) => {
    const s = await session(req, false);
    if (s.user.kind !== "OFFICER" || !s.user.emailVerified)
      fail(403, "Akaun tidak layak.");
    const existing = await db.mfaFactor.findUnique({
      where: { userId: s.userId },
    });
    if (existing?.verified)
      fail(409, "MFA telah aktif. Hubungi pentadbir untuk pemulihan.");
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    await db.mfaFactor.upsert({
      where: { userId: s.userId },
      create: { userId: s.userId, encryptedSecret: encrypt(secret) },
      update: { encryptedSecret: encrypt(secret) },
    });
    const uri = totp(secret).toString();
    await audit(s.userId, null, "MFA_SETUP", s.userId);
    return { secret, qr: await QRCode.toDataURL(uri) };
  });
  app.post("/api/auth/mfa/verify", authLimit, async (req) => {
    const s = await session(req, false);
    if (!s.user.emailVerified) fail(403, "Sahkan e-mel dahulu.");
    const { code } = z
      .object({ code: z.string().regex(/^\d{6}$/) })
      .parse(req.body);
    const f = await db.mfaFactor.findUnique({ where: { userId: s.userId } });
    if (!f) fail(400, "Daftar MFA dahulu.");
    const step = Math.floor(Date.now() / 30000);
    const delta = totp(decrypt(f.encryptedSecret)).validate({
      token: code,
      window: 1,
    });
    if (delta === null) {
      await audit(s.userId, null, "MFA_VERIFY", s.userId, "FAILURE");
      fail(400, "Kod MFA tidak sah.");
    }
    const accepted = BigInt(step + delta);
    const recoveryCodes: string[] = [];
    await db.$transaction(async (tx) => {
      const claim = await tx.mfaFactor.updateMany({
        where: { id: f.id, lastStep: { lt: accepted } },
        data: { verified: true, lastStep: accepted },
      });
      if (!claim.count)
        fail(400, "Kod MFA telah digunakan. Tunggu kod seterusnya.");
      if (!f.verified) {
        await tx.recoveryCode.deleteMany({ where: { userId: s.userId } });
        for (let i = 0; i < 8; i++) {
          const raw = randomUUID();
          recoveryCodes.push(raw);
          await tx.recoveryCode.create({
            data: { userId: s.userId, codeHash: hash(raw) },
          });
        }
      }
      await tx.session.update({
        where: { id: s.id },
        data: { mfaVerified: true },
      });
    });
    await audit(s.userId, null, "MFA_VERIFIED", s.userId);
    return { ok: true, recoveryCodes };
  });
  app.post("/api/auth/mfa/recovery", authLimit, async (req) => {
    const s = await session(req, false);
    if (!s.user.emailVerified) fail(403, "Sahkan e-mel dahulu.");
    const { code } = z.object({ code: z.string().uuid() }).parse(req.body);
    await db.$transaction(async (tx) => {
      const used = await tx.recoveryCode.updateMany({
        where: { userId: s.userId, codeHash: hash(code), usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!used.count) fail(400, "Kod pemulihan tidak sah.");
      await tx.session.update({
        where: { id: s.id },
        data: { mfaVerified: true },
      });
    });
    await audit(s.userId, null, "MFA_RECOVERY_USED", s.userId);
    await notify(
      s.userId,
      "SECURITY",
      "Kod pemulihan digunakan",
      "Satu kod pemulihan MFA telah digunakan.",
    );
    return { ok: true };
  });
}
const dummyHash = argon2.hash("timing-only-value-not-an-account", {
  type: argon2.argon2id,
});
