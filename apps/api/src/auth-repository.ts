import { audit, db, issueIdentity, notify } from "./core.js";
import { assertDatabaseConfigured } from "./errors.js";
import type { MfaFactor } from "@prisma/client";
import type { protectIdentification } from "./identity.js";

type Registration = ReturnType<typeof protectIdentification> & {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  consentAt: Date;
};

type NewSession = {
  id: string;
  userId: string;
  csrfHash: string;
  expiresAt: Date;
  mfaVerified: boolean;
};

export const postgresAuth = {
  async assertRegistrationReady() {
    assertDatabaseConfigured();
  },
  async register(data: Registration) {
    return db.user.create({
      data: {
        ...data,
        roles: { create: { roleId: "PEMOHON", reference: "Pendaftaran awam" } },
      },
    });
  },
  async findUser(email: string) {
    return db.user.findUnique({ where: { email } });
  },
  async loadSession(id: string) {
    return db.session.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            roles: { include: { role: { include: { permissions: true } } } },
          },
        },
      },
    });
  },
  async createSession(data: NewSession) {
    await db.session.create({ data });
  },
  async refreshCsrf(id: string, previousHash: string, csrfHash: string) {
    await db.session.updateMany({
      where: { id, csrfHash: previousHash },
      data: { csrfHash },
    });
  },
  async logout(id: string) {
    await db.session.delete({ where: { id } });
  },
  async switchRole(id: string, activeRole: string) {
    await db.session.update({ where: { id }, data: { activeRole } });
  },
  async activate(tokenHash: string, provider: string, passwordHash?: string) {
    return db.$transaction(async (tx) => {
      const identity = await tx.authenticationIdentity.findUnique({
        where: { tokenHash },
      });
      if (
        !identity ||
        identity.provider !== provider ||
        identity.consumedAt ||
        identity.expiresAt < new Date()
      )
        return null;
      const claim = await tx.authenticationIdentity.updateMany({
        where: { id: identity.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (!claim.count) return null;
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
  },
  async changePassword(userId: string, passwordHash: string) {
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { passwordHash } }),
      db.session.deleteMany({ where: { userId } }),
    ]);
  },
  async findFactor(userId: string) {
    return db.mfaFactor.findUnique({ where: { userId } });
  },
  async setFactor(userId: string, encryptedSecret: string) {
    await db.mfaFactor.upsert({
      where: { userId },
      create: { userId, encryptedSecret },
      update: { encryptedSecret },
    });
    return true;
  },
  async claimMfa(
    sessionId: string,
    factor: AuthFactor,
    accepted: bigint,
    recoveryHashes: string[],
  ) {
    return db.$transaction(async (tx) => {
      const claim = await tx.mfaFactor.updateMany({
        where: { id: factor.id, lastStep: { lt: accepted } },
        data: { verified: true, lastStep: accepted },
      });
      if (!claim.count) return false;
      if (!factor.verified) {
        await tx.recoveryCode.deleteMany({ where: { userId: factor.userId } });
        for (const codeHash of recoveryHashes)
          await tx.recoveryCode.create({
            data: { userId: factor.userId, codeHash },
          });
      }
      await tx.session.update({
        where: { id: sessionId },
        data: { mfaVerified: true },
      });
      return true;
    });
  },
  async useRecoveryCode(sessionId: string, userId: string, codeHash: string) {
    return db.$transaction(async (tx) => {
      const used = await tx.recoveryCode.updateMany({
        where: { userId, codeHash, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!used.count) return false;
      await tx.session.update({
        where: { id: sessionId },
        data: { mfaVerified: true },
      });
      return true;
    });
  },
  audit: async (...args: Parameters<typeof audit>) => {
    await audit(...args);
  },
  notify,
  issueIdentity,
};

export type AuthRepository = typeof postgresAuth;
export type AuthFactor = MfaFactor;
export type AuthAccount = NonNullable<
  Awaited<ReturnType<AuthRepository["findUser"]>>
>;
export type AuthSession = NonNullable<
  Awaited<ReturnType<AuthRepository["loadSession"]>>
>;
