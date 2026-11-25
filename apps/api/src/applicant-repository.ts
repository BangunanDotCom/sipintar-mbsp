import type { Company, Prisma } from "@prisma/client";
import { db } from "./core.js";
import { fail } from "./auth.js";
import type { protectIdentification } from "./identity.js";

export type CompanyDetails = Pick<
  Company,
  "name" | "address" | "phone" | "email"
>;
type Identification = ReturnType<typeof protectIdentification>;
type VerificationStatus = "VERIFIED" | "DOCUMENT_UPDATE_REQUIRED";

export const delegationSummary = {
  id: true,
  fileName: true,
  status: true,
  validUntil: true,
} as const;

export const postgresApplicantRepository = {
  async setIdentification(
    userId: string,
    currentPasswordHash: string,
    data: Identification,
  ) {
    return (
      (
        await db.user.updateMany({
          where: {
            id: userId,
            identificationHash: null,
            passwordHash: currentPasswordHash,
          },
          data,
        })
      ).count === 1
    );
  },
  async updateProfile(id: string, data: { name: string; phone: string }) {
    return db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        kind: true,
        emailVerified: true,
        identificationMasked: true,
      },
    });
  },
  async districts() {
    return db.district.findMany({ orderBy: { id: "asc" } });
  },
  async companies(userId: string) {
    const now = new Date();
    return db.companyRepresentative.findMany({
      where: {
        userId,
        status: { not: "REVOKED" },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      include: {
        company: { include: { documents: { select: delegationSummary } } },
      },
    });
  },
  async createCompany(
    userId: string,
    data: CompanyDetails & { registrationNumber: string },
    authorityType: string,
    endsAt: Date | null,
  ) {
    return db.company.create({
      data: {
        ...data,
        representatives: {
          create: {
            userId,
            authorityType,
            canManageRepresentatives: true,
            endsAt,
          },
        },
      },
    });
  },
  async updateCompany(id: string, data: CompanyDetails, _userId: string) {
    return db.company.update({
      where: { id },
      data: { ...data, informationStatus: "UNVERIFIED" },
    });
  },
  async settings(keys: string[]) {
    return db.systemConfiguration.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
  },
  async uploadDelegation(data: Prisma.DelegationDocumentUncheckedCreateInput) {
    return db.delegationDocument.create({
      data,
      select: { id: true, fileName: true, status: true },
    });
  },
  async delegation(id: string) {
    return db.delegationDocument.findUnique({
      where: { id },
      select: { id: true, companyId: true, fileName: true, content: true },
    });
  },
  async representations() {
    return db.companyRepresentative.findMany({
      take: 100,
      include: {
        user: { select: { id: true, name: true } },
        company: {
          select: {
            id: true,
            name: true,
            documents: {
              select: { id: true, fileName: true, uploadedBy: true },
            },
          },
        },
      },
    });
  },
  async representative(id: string) {
    return db.companyRepresentative.findUniqueOrThrow({ where: { id } });
  },
  async verifyRepresentative(
    id: string,
    companyId: string,
    userId: string,
    status: VerificationStatus,
  ) {
    const valid = {
      companyId,
      OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
    };
    await db.$transaction(async (tx) => {
      if (
        status === "VERIFIED" &&
        !(await tx.delegationDocument.count({ where: valid }))
      )
        fail(400, "Surat kuasa sah diperlukan.");
      await tx.companyRepresentative.update({
        where: { id },
        data: { status, verifiedBy: userId },
      });
      await tx.delegationDocument.updateMany({
        where: valid,
        data: { status },
      });
    });
  },
};

export type ApplicantRepository = typeof postgresApplicantRepository;
