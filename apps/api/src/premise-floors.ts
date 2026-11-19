import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./core.js";
import { fail } from "./auth.js";
import { applicant, companyAuthority } from "./application-drafts.js";
import { premiseFloorsSchema, summarizePremiseFloors } from "../../../packages/shared/src/floor-summary.js";
import { reconcileFloorIds } from "../../../packages/shared/src/floor-identity.js";
import { comparePremisesTotals } from "../../../packages/shared/src/premises-consistency.js";

const paramsSchema = z.object({ id: z.uuid() });
async function authorizedDraft(
  tx: Prisma.TransactionClient,
  userId: string,
  draftId: string,
) {
  const draft = await tx.applicationDraft.findFirst({
    where: { id: draftId, initiatedByUserId: userId, status: "DRAFT" },
  });
  if (!draft) fail(404, "Draf permohonan tidak ditemui.");
  if (draft.companyId) await companyAuthority(tx, userId, draft.companyId);
  return draft;
}
export async function premiseFloorRoutes(app: FastifyInstance) {
  app.get("/api/application-drafts/:id/floors", async (req) => {
    const s = await applicant(req);
    const { id } = paramsSchema.parse(req.params);
    return db.$transaction(async (tx) => {
      const draft = await authorizedDraft(tx, s.userId, id);
      const stored = await tx.premiseFloor.findMany({
        where: { draftId: id }, orderBy: { position: "asc" },
      });
      const floors = stored.map((row) => ({
        id: row.id,
        floorLabel: row.floorLabel,
        rooms: row.rooms, beds: row.beds, workers: row.workers,
        areaSqm: Number(row.areaSqm),
        facilities: row.facilities,
      }));
      const totals = floors.length ? summarizePremiseFloors(premiseFloorsSchema.parse(floors)) : null;
      const premises = await tx.applicationPremises.findUnique({ where: { draftId: id } });
      const mismatches = totals ? comparePremisesTotals(premises ? {
        involvedFloors: premises.involvedFloors,
        totalRooms: premises.totalRooms,
        proposedWorkers: premises.proposedWorkers,
        floorAreaSqm: premises.floorAreaSqm === null ? null : Number(premises.floorAreaSqm),
      } : null, totals) : [];
      return {
        draftId: id,
        version: draft.version,
        floors,
        totals, mismatches,
      };
    });
  });
  app.put("/api/application-drafts/:id/floors", async (req) => {
    const s = await applicant(req);
    const { id } = paramsSchema.parse(req.params);
    const input = z.object({
      version: z.number().int().positive(),
      floors: premiseFloorsSchema,
    }).strict().parse(req.body);
    const totals = summarizePremiseFloors(input.floors);
    return db.$transaction(async (tx) => {
      await authorizedDraft(tx, s.userId, id);
      const claim = await tx.applicationDraft.updateMany({
        where: { id, initiatedByUserId: s.userId, status: "DRAFT", version: input.version },
        data: { version: { increment: 1 } },
      });
      if (claim.count !== 1) fail(409, "Draf telah dikemas kini. Muat semula sebelum menyimpan.");
      const existing = await tx.premiseFloor.findMany({ where: { draftId: id } });
      const ids = reconcileFloorIds(existing, input.floors, randomUUID);
      const retained = new Set(ids);
      await tx.premiseFloor.deleteMany({
        where: { draftId: id, id: { notIn: [...retained] } },
      });
      // Move existing rows to temporary unique positions and labels before
      // applying reordered/renamed rows, avoiding compound-unique conflicts.
      for (const row of existing.filter((floor) => retained.has(floor.id))) {
        await tx.premiseFloor.update({
          where: { id: row.id },
          data: { position: -(row.position + 1), floorLabel: `__pending_${row.id}` },
        });
      }
      const existingIds = new Set(existing.map((floor) => floor.id));
      for (const [position, floor] of input.floors.entries()) {
        const data = {
          position, floorLabel: floor.floorLabel,
          rooms: floor.rooms, beds: floor.beds, workers: floor.workers,
          areaSqm: new Prisma.Decimal(floor.areaSqm), facilities: floor.facilities,
        };
        if (existingIds.has(ids[position])) {
          await tx.premiseFloor.update({ where: { id: ids[position] }, data });
        } else {
          await tx.premiseFloor.create({ data: { ...data, id: ids[position], draftId: id } });
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: s.userId, activeRole: s.activeRole,
          action: "APPLICATION_FLOORS_SAVED", target: id,
          metadata: { version: input.version + 1, floorCount: totals.floors },
        },
      });
      const premises = await tx.applicationPremises.findUnique({ where: { draftId: id } });
      const mismatches = comparePremisesTotals(premises ? {
        involvedFloors: premises.involvedFloors,
        totalRooms: premises.totalRooms,
        proposedWorkers: premises.proposedWorkers,
        floorAreaSqm: premises.floorAreaSqm === null ? null : Number(premises.floorAreaSqm),
      } : null, totals);
      return { draftId: id, version: input.version + 1, floors: input.floors.map((floor, position) => ({ ...floor, id: ids[position] })), totals, mismatches };
    });
  });
}
