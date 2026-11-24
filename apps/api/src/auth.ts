import { protectIdentification } from "./identity.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { createHmac, randomUUID } from "node:crypto";
import {
  hash,
  token,
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
import {
  postgresAuth,
  type AuthRepository,
  type AuthAccount,
} from "./auth-repository.js";

export function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}
export async function session(
  req: FastifyRequest,
  full = true,
  repository = postgresAuth,
) {
  const raw = req.cookies.staylink;
  if (!raw) fail(401, "Sila log masuk.");
  const s = await repository.loadSession(hash(raw));
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
export async function authorize(
  req: FastifyRequest,
  action: string,
  repository = postgresAuth,
) {
  const s = await session(req, true, repository);
  const assignments = s.user.roles.filter(
    (a) => isCurrent(a) && a.roleId === s.activeRole,
  );
  if (
    !assignments.some((a) =>
      a.role.permissions.some((p) => p.action === action),
    )
  ) {
    await repository.audit(
      s.userId,
      s.activeRole,
      "ACCESS_DENIED",
      action,
      "DENIED",
    );
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
// The HttpOnly session secret keys a separate token for same-origin requests.
function sessionCsrf(sessionSecret: string) {
  return createHmac("sha256", sessionSecret)
    .update("staylink.csrf.v1")
    .digest("hex");
}

async function makeSession(
  repository: AuthRepository,
  reply: any,
  user: AuthAccount,
) {
  const raw = token();
  const csrf = sessionCsrf(raw);
  reply.header("Cache-Control", "private, no-store");
  await repository.createSession({
    id: hash(raw),
    userId: user.id,
    csrfHash: hash(csrf),
    expiresAt: new Date(Date.now() + 8 * 3600000),
    mfaVerified: user.kind !== "OFFICER",
  });
  reply.setCookie("staylink", raw, {
    httpOnly: true,
    sameSite: "strict",
    secure: production || process.env.STAYLINK_DEMO_HOST === "true",
    path: "/",
    maxAge: 28800,
  });
  return { user: safeUser(user), csrf, mfaRequired: user.kind === "OFFICER" };
}
export async function authRoutes(
  app: FastifyInstance,
  repository: AuthRepository = postgresAuth,
) {
  const loadSession = (req: FastifyRequest, full = true) =>
    session(req, full, repository);
  const { audit, issueIdentity, notify } = repository;
  const authLimit = {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
  };
  app.post("/api/auth/register", authLimit, async (req, reply) => {
    const b = registerSchema.parse(req.body);
    if (
      process.env.STAYLINK_DEMO_HOST === "true" &&
      !b.email.toLowerCase().endsWith("@example.test")
    )
      fail(400, "Pendaftaran demo memerlukan alamat latihan @example.test.");
    await repository.assertRegistrationReady();
    let user;
    try {
      user = await repository.register({
        ...protectIdentification(b.identificationNumber),
        name: b.name,
        email: b.email,
        phone: b.phone,
        passwordHash: await argon2.hash(b.password, { type: argon2.argon2id }),
        consentAt: new Date(),
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
    const u = await repository.findUser(b.email);
    const valid = u?.passwordHash
      ? await argon2.verify(u.passwordHash, b.password)
      : await argon2.verify(await dummyHash, "invalid");
    if (!u || !valid || u.status !== "ACTIVE") {
      await audit(u?.id || null, null, "LOGIN", undefined, "FAILURE");
      fail(401, "E-mel atau kata laluan tidak sah.");
    }
    await audit(u.id, null, "LOGIN", u.id);
    return makeSession(repository, reply, u);
  });
  app.get("/api/auth/me", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const s = await loadSession(req, false);
    const csrf = sessionCsrf(req.cookies.staylink!);
    const csrfHash = hash(csrf);
    // Existing sessions migrate once. All tabs compute the same token.
    if (s.csrfHash !== csrfHash) {
      await repository.refreshCsrf(s.id, s.csrfHash, csrfHash);
    }
    const factor = await repository.findFactor(s.userId);
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
    const s = await loadSession(req, false);
    await repository.logout(s.id);
    reply.clearCookie("staylink", { path: "/" });
    return { ok: true };
  });
  app.post("/api/auth/role", async (req) => {
    const s = await loadSession(req);
    const { roleId } = z.object({ roleId: z.string() }).parse(req.body);
    if (!s.user.roles.some((a) => a.roleId === roleId && isCurrent(a)))
      fail(403, "Pelantikan tidak aktif atau telah tamat.");
    await repository.switchRole(s.id, roleId);
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
    const u = await repository.activate(hash(b.token), b.type, passwordHash);
    if (!u) fail(400, "Pautan tidak sah atau telah luput.");
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
    const u = await repository.findUser(email);
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
    const s = await loadSession(req);
    const b = z
      .object({ currentPassword: z.string(), password: passwordSchema })
      .parse(req.body);
    if (
      !s.user.passwordHash ||
      !(await argon2.verify(s.user.passwordHash, b.currentPassword))
    )
      fail(400, "Kata laluan semasa tidak sah.");
    await repository.changePassword(
      s.userId,
      await argon2.hash(b.password, { type: argon2.argon2id }),
    );
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
    const s = await loadSession(req, false);
    if (s.user.kind !== "OFFICER" || !s.user.emailVerified)
      fail(403, "Akaun tidak layak.");
    const existing = await repository.findFactor(s.userId);
    if (existing?.verified)
      fail(409, "MFA telah aktif. Hubungi pentadbir untuk pemulihan.");
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    if (!(await repository.setFactor(s.userId, encrypt(secret))))
      fail(409, "MFA telah aktif. Hubungi pentadbir untuk pemulihan.");
    const uri = totp(secret).toString();
    await audit(s.userId, null, "MFA_SETUP", s.userId);
    return { secret, qr: await QRCode.toDataURL(uri) };
  });
  app.post("/api/auth/mfa/verify", authLimit, async (req) => {
    const s = await loadSession(req, false);
    if (!s.user.emailVerified) fail(403, "Sahkan e-mel dahulu.");
    const { code } = z
      .object({ code: z.string().regex(/^\d{6}$/) })
      .parse(req.body);
    const f = await repository.findFactor(s.userId);
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
    const recoveryCodes = f.verified
      ? []
      : Array.from({ length: 8 }, () => randomUUID());
    if (
      !(await repository.claimMfa(s.id, f, accepted, recoveryCodes.map(hash)))
    )
      fail(400, "Kod MFA telah digunakan. Tunggu kod seterusnya.");
    await audit(s.userId, null, "MFA_VERIFIED", s.userId);
    return { ok: true, recoveryCodes };
  });
  app.post("/api/auth/mfa/recovery", authLimit, async (req) => {
    const s = await loadSession(req, false);
    if (!s.user.emailVerified) fail(403, "Sahkan e-mel dahulu.");
    const { code } = z.object({ code: z.string().uuid() }).parse(req.body);
    if (!(await repository.useRecoveryCode(s.id, s.userId, hash(code))))
      fail(400, "Kod pemulihan tidak sah.");
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
