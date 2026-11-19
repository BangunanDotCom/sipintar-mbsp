import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./core.js";
import { fail } from "./auth.js";
import { applicant, companyAuthority } from "./application-drafts.js";
import { premiseFloorsSchema, summarizePremiseFloors } from "../../../packages/shared/src/floor-summary.js";
import { FloorIdentityError, reconcileFloorIds } from "../../../packages/shared/src/floor-identity.js";
import { comparePremisesTotals } from "../../../packages/shared/src/premises-consistency.js";

const paramsSchema = z.object({ id: z.uuid() });
export async function authorizedDraft(
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
  app.get("/api/application-drafts/:id/floors", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store, max-age=0");
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
      const parsed = premiseFloorsSchema.safeParse(floors);
      const totals = parsed.success ? summarizePremiseFloors(parsed.data) : null;
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
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
      const ids = (() => {
        try {
          return reconcileFloorIds(existing, input.floors, randomUUID);
        } catch (error) {
          if (!(error instanceof FloorIdentityError)) throw error;
          if (error.reason === "ambiguous")
            fail(409, "Nama tingkat sedia ada tidak unik. Muat semula dan betulkan nama menggunakan ID tingkat.");
          fail(400, "ID tingkat tidak sah atau berulang.");
        }
      })();
      const linked = await tx.premiseUnitFloor.findFirst({
        where: { draftId: id, floorId: { notIn: ids } }, select: { floorId: true },
      });
      if (linked) fail(409, "Buang pautan unit sebelum membuang tingkat.");
      await tx.premiseFloor.deleteMany({
        where: { draftId: id, id: { notIn: ids } },
      });
      const existingById = new Map(existing.map((floor) => [floor.id, floor]));
      const reservedLabels = new Set([...existing, ...input.floors].map((floor) => floor.floorLabel));
      const reservedPositions = new Set(existing.map((floor) => floor.position));
      let temporaryPosition = -1;
      // Park reordered or renamed rows outside both layouts so unique
      // constraints stay valid even during a label or position swap.
      for (const [position, floor] of input.floors.entries()) {
        const row = existingById.get(ids[position]);
        if (!row || (row.position === position && row.floorLabel === floor.floorLabel)) continue;
        let temporaryLabel = `__pending_${row.id}`;
        while (reservedLabels.has(temporaryLabel)) temporaryLabel += "_";
        reservedLabels.add(temporaryLabel);
        while (reservedPositions.has(temporaryPosition)) temporaryPosition--;
        await tx.premiseFloor.update({
          where: { id: row.id },
          data: { position: temporaryPosition--, floorLabel: temporaryLabel },
        });
      }
      for (const [position, floor] of input.floors.entries()) {
        const data = {
          position, floorLabel: floor.floorLabel,
          rooms: floor.rooms, beds: floor.beds, workers: floor.workers,
          areaSqm: new Prisma.Decimal(floor.areaSqm), facilities: floor.facilities,
        };
        if (existingById.has(ids[position])) {
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
