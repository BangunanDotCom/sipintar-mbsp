import { draftInactivity } from "../../../packages/shared/src/draft-inactivity.js";
import { requireUnclosedTrainingDraft } from "./synthetic-completion-gate.js";
import {
  Prisma,
  type ApplicationDraft,
  type ApplicationPremises,
  type PremiseFloor,
  type PremiseUnit,
} from "@prisma/client";
import { db } from "./core.js";
import { fail } from "./auth.js";
import { validRepresentative } from "./company-representative-policy.js";
import type { AuditEntry } from "./oracle/audit.js";

export type DraftValues = Pick<
  ApplicationDraft,
  | "capacity"
  | "companyId"
  | "officialApplicantUserId"
  | "applicantSnapshot"
  | "representativeSnapshot"
  | "notes"
>;
export type DraftCreation = DraftValues &
  Pick<ApplicationDraft, "initiatedByUserId" | "initiatorSnapshot">;
export type PremisesValues = Omit<
  ApplicationPremises,
  "id" | "draftId" | "createdAt" | "updatedAt" | "floorAreaSqm"
> & { floorAreaSqm: number | null };
export type FloorValues = Pick<
  PremiseFloor,
  | "position"
  | "floorLabel"
  | "rooms"
  | "beds"
  | "workers"
  | "areaSqm"
  | "facilities"
>;
export type UnitValues = Pick<PremiseUnit, "unitLabel" | "normalizedLabel">;
type UnitLink = { draftId: string; unitId: string; floorId: string };

export const documentMetadataSelection = {
  id: true,
  category: true,
  version: true,
  fileName: true,
  mimeType: true,
  byteSize: true,
  scanStatus: true,
  verificationStatus: true,
  uploadedAt: true,
  supersededAt: true,
  scope: { select: { unitId: true, floorId: true } },
} satisfies Prisma.ApplicationDocumentSelect;

export async function postgresCompanyAuthority(
  tx: Prisma.TransactionClient,
  userId: string,
  companyId: string,
  lock = true,
) {
  if (lock) {
    await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM company_representatives WHERE "userId" = ${userId} AND "companyId" = ${companyId} FOR SHARE`;
  }
  const representative = await tx.companyRepresentative.findUnique({
    where: { userId_companyId: { userId, companyId } },
    include: { company: true },
  });
  if (
    !representative ||
    !validRepresentative(representative) ||
    representative.company.status !== "ACTIVE"
  )
    fail(404, "Draf atau kebenaran syarikat tidak ditemui.");
  return representative;
}

const json = (value: Prisma.JsonValue) =>
  value === null ? Prisma.JsonNull : value;
const draftData = (data: DraftValues) => ({
  ...data,
  applicantSnapshot: json(data.applicantSnapshot),
  representativeSnapshot: data.representativeSnapshot ?? Prisma.DbNull,
});

function postgresDraftTransaction(tx: Prisma.TransactionClient) {
  return {
    companyAuthority: (userId: string, companyId: string) =>
      postgresCompanyAuthority(tx, userId, companyId),
    async findDraft(userId: string, id: string) {
      return tx.applicationDraft.findFirst({
        where: { id, initiatedByUserId: userId, status: "DRAFT" },
      });
    },
    async createDraft(data: DraftCreation) {
      return tx.applicationDraft.create({
        data: {
          ...data,
          ...draftData(data),
          initiatorSnapshot: json(data.initiatorSnapshot),
        },
      });
    },
    async saveDraft(
      userId: string,
      id: string,
      version: number,
      data?: DraftValues,
    ) {
      await requireUnclosedTrainingDraft(tx, id);
      const result = await tx.applicationDraft.updateMany({
        where: { id, initiatedByUserId: userId, status: "DRAFT", version },
        data: { ...(data && draftData(data)), version: { increment: 1 } },
      });
      return result.count === 1;
    },
    async findPremises(draftId: string) {
      return tx.applicationPremises.findUnique({ where: { draftId } });
    },
    async savePremises(draftId: string, data: PremisesValues) {
      return tx.applicationPremises.upsert({
        where: { draftId },
        create: { ...data, draftId },
        update: data,
      });
    },
    async floors(draftId: string) {
      return tx.premiseFloor.findMany({
        where: { draftId },
        orderBy: { position: "asc" },
      });
    },
    async hasRemovedFloorLinks(draftId: string, retained: string[]) {
      return !!(await tx.premiseUnitFloor.findFirst({
        where: { draftId, floorId: { notIn: retained } },
        select: { floorId: true },
      }));
    },
    async hasRemovedFloorDocuments(draftId: string, retained: string[]) {
      return !!(await tx.draftDocumentScope.findFirst({
        where: { draftId, floorId: { notIn: retained, not: null } },
        select: { documentId: true },
      }));
    },
    async deleteFloors(draftId: string, retained: string[]) {
      await tx.premiseFloor.deleteMany({
        where: { draftId, id: { notIn: retained } },
      });
    },
    async updateFloor(id: string, data: Partial<FloorValues>) {
      await tx.premiseFloor.update({
        where: { id },
        data: {
          ...data,
          facilities:
            data.facilities === undefined ? undefined : json(data.facilities),
        },
      });
    },
    async createFloor(id: string, draftId: string, data: FloorValues) {
      await tx.premiseFloor.create({
        data: { id, draftId, ...data, facilities: json(data.facilities) },
      });
    },
    async units(premiseId: string) {
      return tx.premiseUnit.findMany({
        where: { premiseId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          unitLabel: true,
          normalizedLabel: true,
          floorLinks: { select: { floorId: true } },
        },
      });
    },
    async hasRemovedUnitDocuments(draftId: string, removed: string[]) {
      return !!(await tx.draftDocumentScope.findFirst({
        where: { draftId, unitId: { in: removed } },
        select: { documentId: true },
      }));
    },
    async deleteUnits(premiseId: string, removed: string[]) {
      await tx.premiseUnit.deleteMany({
        where: { premiseId, id: { in: removed } },
      });
    },
    async updateUnit(id: string, data: Partial<UnitValues>) {
      await tx.premiseUnit.update({ where: { id }, data });
    },
    async createUnit(
      id: string,
      premiseId: string,
      draftId: string,
      data: UnitValues,
    ) {
      await tx.premiseUnit.create({
        data: { id, premiseId, draftId, ...data },
      });
    },
    async deleteFloorLinks(
      draftId: string,
      unitId: string,
      retainedFloorIds: string[],
    ) {
      await tx.premiseUnitFloor.deleteMany({
        where: { draftId, unitId, floorId: { notIn: retainedFloorIds } },
      });
    },
    async createFloorLinks(links: UnitLink[]) {
      await tx.premiseUnitFloor.createMany({ data: links });
    },
    async documents(draftId: string) {
      return tx.applicationDocument.findMany({
        where: { draftId },
        select: documentMetadataSelection,
        orderBy: [{ category: "asc" }, { version: "desc" }],
      });
    },
    async audit(entry: AuditEntry) {
      await tx.auditLog.create({
        data: {
          ...entry,
          metadata: entry.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    },
  };
}
export type DraftTransaction = ReturnType<typeof postgresDraftTransaction>;

export const postgresDraftRepository = {
  transaction<T>(
    operation: (tx: DraftTransaction) => Promise<T>,
    consistentRead = false,
  ) {
    return db.$transaction(
      (tx) => operation(postgresDraftTransaction(tx)),
      consistentRead
        ? { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
        : undefined,
    );
  },
  async allowedCompanies(userId: string) {
    const now = new Date();
    return db.companyRepresentative.findMany({
      where: {
        userId,
        status: { not: "REVOKED" },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        company: { status: "ACTIVE" },
      },
      include: { company: true },
      orderBy: { company: { name: "asc" } },
    });
  },
  async list(userId: string, companyIds: string[]) {
    const drafts = await db.applicationDraft.findMany({
      where: {
        initiatedByUserId: userId,
        status: "DRAFT",
        OR: [
          { capacity: "INDIVIDUAL" },
          { capacity: "COMPANY", companyId: { in: companyIds } },
        ],
      },
      select: {
        id: true,
        capacity: true,
        applicantSnapshot: true,
        status: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        syntheticSubmissions: { select: { id: true }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    const now = new Date();
    return drafts.map(({ syntheticSubmissions, ...draft }) => ({
      ...draft,
      inactivity: syntheticSubmissions.length
        ? null
        : draftInactivity(draft.updatedAt, now),
    }));
  },
  async ownsDraft(userId: string, id: string) {
    return !!(await db.applicationDraft.findFirst({
      where: { id, initiatedByUserId: userId },
      select: { id: true },
    }));
  },
};

export type DraftRepository = typeof postgresDraftRepository;
