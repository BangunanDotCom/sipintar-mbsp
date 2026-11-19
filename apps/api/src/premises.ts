import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApplicationPremises, Prisma } from "@prisma/client";
import { db } from "./core.js";
import { fail } from "./auth.js";
import { applicant, companyAuthority } from "./application-drafts.js";
import { premiseFloorsSchema, summarizePremiseFloors } from "../../../packages/shared/src/floor-summary.js";
import { comparePremisesTotals } from "../../../packages/shared/src/premises-consistency.js";
import { evaluateDraftReadiness } from "../../../packages/shared/src/draft-readiness.js";
import {
  premisesSaveSchema,
  completePremisesSchema,
  emptyPremises,
  type PremisesFields,
} from "../../../packages/shared/src/premises.js";
async function own(
  tx: Prisma.TransactionClient,
  s: Awaited<ReturnType<typeof applicant>>,
  id: string,
) {
  const d = await tx.applicationDraft.findFirst({
    where: { id, initiatedByUserId: s.userId, status: "DRAFT" },
  });
  if (!d) fail(404, "Draf tidak ditemui.");
  if (d.companyId) await companyAuthority(tx, s.userId, d.companyId);
  return d;
}
export function premisesFields(p: ApplicationPremises | null): PremisesFields {
  if (!p) return { ...emptyPremises };
  return {
    address: p.address,
    postcode: p.postcode,
    lotNumber: p.lotNumber,
    locality: p.locality,
    districtId: p.districtId as PremisesFields["districtId"],
    latitude: p.latitude,
    longitude: p.longitude,
    buildingType: p.buildingType,
    currentUse: p.currentUse,
    involvedFloors: p.involvedFloors,
    accommodationUnits: p.accommodationUnits,
    totalRooms: p.totalRooms,
    floorAreaSqm: p.floorAreaSqm === null ? null : Number(p.floorAreaSqm),
    proposedWorkers: p.proposedWorkers,
    certificateType: p.certificateType as PremisesFields["certificateType"],
    certificateNumber: p.certificateNumber,
    certificateDate: p.certificateDate?.toISOString().slice(0, 10) || null,
  };
}
function response(
  d: {
    id: string;
    version: number;
    status: string;
    capacity: string;
    applicantSnapshot: Prisma.JsonValue;
  },
  p: ApplicationPremises | null,
) {
  const values = premisesFields(p);
  return {
    draftId: d.id,
    version: d.version,
    status: d.status,
    capacity: d.capacity,
    applicant: d.applicantSnapshot,
    premises: values,
    complete: completePremisesSchema.safeParse(values).success,
    locationSource: p?.locationSource || null,
    boundaryStatus: "UNVERIFIED",
    updatedAt: p?.updatedAt || null,
    submissionEnabled: false,
  };
}
export async function premisesRoutes(app: FastifyInstance) {
  app.get("/api/application-drafts/:id/premises", async (req) => {
    const s = await applicant(req),
      { id } = z.object({ id: z.uuid() }).parse(req.params);
    return db.$transaction(async (tx) => {
      const d = await own(tx, s, id),
        p = await tx.applicationPremises.findUnique({ where: { draftId: id } });
      await tx.auditLog.create({
        data: {
          actorId: s.userId,
          activeRole: s.activeRole,
          action: "APPLICATION_PREMISES_OPENED",
          target: id,
        },
      });
      const floors = await tx.premiseFloor.findMany({ where: { draftId: id }, orderBy: { position: "asc" } });
      const parsed = premiseFloorsSchema.safeParse(floors.map((f) => ({
        floorLabel: f.floorLabel, rooms: f.rooms, beds: f.beds, workers: f.workers,
        areaSqm: Number(f.areaSqm), facilities: f.facilities,
      })));
      const totals = parsed.success ? summarizePremiseFloors(parsed.data) : null;
      return { ...response(d, p), floorTotals: totals,
        floorMismatches: totals ? comparePremisesTotals(premisesFields(p), totals) : [],
        readiness: evaluateDraftReadiness({ premises: premisesFields(p), floors: parsed.success ? parsed.data : [] }) };
    });
  });
  app.put("/api/application-drafts/:id/premises", async (req) => {
    const s = await applicant(req),
      { id } = z.object({ id: z.uuid() }).parse(req.params),
      b = premisesSaveSchema.parse(req.body);
    if (b.action === "CONTINUE") completePremisesSchema.parse(b.premises);
    return db.$transaction(async (tx) => {
      const d = await own(tx, s, id);
      const claim = await tx.applicationDraft.updateMany({
        where: {
          id,
          initiatedByUserId: s.userId,
          status: "DRAFT",
          version: b.version,
        },
        data: { version: { increment: 1 } },
      });
      if (!claim.count)
        fail(
          409,
          "Draf telah dikemas kini dalam tab lain. Muat semula sebelum menyimpan.",
        );
      const data = {
        ...b.premises,
        certificateDate: b.premises.certificateDate
          ? new Date(b.premises.certificateDate + "T00:00:00Z")
          : null,
        locationSource: b.premises.latitude === null ? null : "USER_PIN",
        boundaryStatus: "UNVERIFIED",
      };
      const p = await tx.applicationPremises.upsert({
        where: { draftId: id },
        create: { ...data, draftId: id },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          actorId: s.userId,
          activeRole: s.activeRole,
          action: "APPLICATION_PREMISES_SAVED",
          target: id,
          metadata: {
            version: b.version + 1,
            complete: completePremisesSchema.safeParse(b.premises).success,
            intent: b.action,
          },
        },
      });
      const floors = await tx.premiseFloor.findMany({ where: { draftId: id }, orderBy: { position: "asc" } });
      const parsed = premiseFloorsSchema.safeParse(floors.map((f) => ({
        floorLabel: f.floorLabel, rooms: f.rooms, beds: f.beds, workers: f.workers,
        areaSqm: Number(f.areaSqm), facilities: f.facilities,
      })));
      const totals = parsed.success ? summarizePremiseFloors(parsed.data) : null;
      return { ...response({ ...d, version: b.version + 1 }, p), floorTotals: totals,
        floorMismatches: totals ? comparePremisesTotals(premisesFields(p), totals) : [],
        readiness: evaluateDraftReadiness({ premises: premisesFields(p), floors: parsed.success ? parsed.data : [] }) };
    });
  });
}
