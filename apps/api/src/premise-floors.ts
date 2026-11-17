import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./core.js";
import { fail } from "./auth.js";
import { applicant, companyAuthority } from "./application-drafts.js";
import { premiseFloorsSchema, summarizePremiseFloors } from "../../../packages/shared/src/floor-summary.js";

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
        floorLabel: row.floorLabel,
        rooms: row.rooms, beds: row.beds, workers: row.workers,
        areaSqm: Number(row.areaSqm),
        facilities: row.facilities,
      }));
      return {
        draftId: id,
        version: draft.version,
        floors,
        totals: floors.length ? summarizePremiseFloors(premiseFloorsSchema.parse(floors)) : null,
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
      await tx.premiseFloor.deleteMany({ where: { draftId: id } });
      await tx.premiseFloor.createMany({
        data: input.floors.map((floor, position) => ({
          draftId: id, position, floorLabel: floor.floorLabel,
          rooms: floor.rooms, beds: floor.beds, workers: floor.workers,
          areaSqm: new Prisma.Decimal(floor.areaSqm),
          facilities: floor.facilities,
        })),
      });
      await tx.auditLog.create({
        data: {
          actorId: s.userId, activeRole: s.activeRole,
          action: "APPLICATION_FLOORS_SAVED", target: id,
          metadata: { version: input.version + 1, floorCount: totals.floors },
        },
      });
      return { draftId: id, version: input.version + 1, totals };
    });
  });
}
