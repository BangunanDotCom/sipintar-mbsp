import {
  delegationMetadata,
  delegationSummary as evidenceSummary,
} from "./delegation-evidence.js";
import type { Company } from "@prisma/client";
import { db } from "./core.js";
import type { protectIdentification } from "./identity.js";

export type CompanyDetails = Pick<
  Company,
  "name" | "address" | "phone" | "email"
>;
type Identification = ReturnType<typeof protectIdentification>;
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
    const memberships = await db.companyRepresentative.findMany({
      where: {
        userId,
        company: { status: "ACTIVE" },
        status: { not: "REVOKED" },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      include: { company: true },
    });
    const documents = await db.delegationDocument.findMany({
      where: {
        representativeId: { in: memberships.map(({ id }) => id) },
        supersededAt: null,
        revokedAt: null,
      },
      select: delegationMetadata,
    });
    return memberships.map((rep) => {
      const visible = documents
        .filter(
          (doc) =>
            doc.representativeId === rep.id &&
            doc.authorityType === rep.authorityType,
        )
        .map((doc) => ({ ...evidenceSummary(doc, now), status: rep.status }));
      const status =
        rep.status === "VERIFIED" &&
        !visible.some(
          (doc) => doc.id === rep.verifiedDocumentId && doc.downloadable,
        )
          ? "DOCUMENT_UPDATE_REQUIRED"
          : rep.status;
      return {
        ...rep,
        status,
        company: { ...rep.company, documents: visible },
      };
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
};

export type ApplicantRepository = typeof postgresApplicantRepository;
