import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { postgresAuth } from "./auth-repository.js";
import {
  postgresDraftRepository,
  type DraftTransaction,
} from "./draft-repository.js";
import { fail } from "./auth.js";
import { applicant, companyAuthority } from "./application-drafts.js";
import {
  premiseFloorsSchema,
  summarizePremiseFloors,
} from "../../../packages/shared/src/floor-summary.js";
import {
  FloorIdentityError,
  reconcileFloorIds,
} from "../../../packages/shared/src/floor-identity.js";
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
export async function ownedDraft(
  tx: DraftTransaction,
  userId: string,
  id: string,
) {
  const draft = await tx.findDraft(userId, id);
  if (!draft) fail(404, "Draf permohonan tidak ditemui.");
  if (draft.companyId) await tx.companyAuthority(userId, draft.companyId);
  return draft;
}
export async function premiseFloorRoutes(
  app: FastifyInstance,
  repository = postgresDraftRepository,
  auth = postgresAuth,
) {
  app.get("/api/application-drafts/:id/floors", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store, max-age=0");
    const s = await applicant(req, auth);
    const { id } = paramsSchema.parse(req.params);
    return repository.transaction(async (tx) => {
      const draft = await ownedDraft(tx, s.userId, id);
      const stored = await tx.floors(id);
      const floors = stored.map((row) => ({
        id: row.id,
        floorLabel: row.floorLabel,
        rooms: row.rooms,
        beds: row.beds,
        workers: row.workers,
        areaSqm: Number(row.areaSqm),
        facilities: row.facilities,
      }));
      const parsed = premiseFloorsSchema.safeParse(floors);
      const totals = parsed.success
        ? summarizePremiseFloors(parsed.data)
        : null;
      const premises = await tx.findPremises(id);
      const mismatches = totals
        ? comparePremisesTotals(
            premises
              ? {
                  involvedFloors: premises.involvedFloors,
                  totalRooms: premises.totalRooms,
                  proposedWorkers: premises.proposedWorkers,
                  floorAreaSqm:
                    premises.floorAreaSqm === null
                      ? null
                      : Number(premises.floorAreaSqm),
                }
              : null,
            totals,
          )
        : [];
      return {
        draftId: id,
        version: draft.version,
        floors,
        totals,
        mismatches,
      };
    }, true);
  });
  app.put("/api/application-drafts/:id/floors", async (req) => {
    const s = await applicant(req, auth);
    const { id } = paramsSchema.parse(req.params);
    const input = z
      .object({
        version: z.number().int().positive(),
        floors: premiseFloorsSchema,
      })
      .strict()
      .parse(req.body);
    const totals = summarizePremiseFloors(input.floors);
    return repository.transaction(async (tx) => {
      await ownedDraft(tx, s.userId, id);
      if (!(await tx.saveDraft(s.userId, id, input.version)))
        fail(409, "Draf telah dikemas kini. Muat semula sebelum menyimpan.");
      const existing = await tx.floors(id);
      const ids = (() => {
        try {
          return reconcileFloorIds(existing, input.floors, randomUUID);
        } catch (error) {
          if (!(error instanceof FloorIdentityError)) throw error;
          if (error.reason === "ambiguous")
            fail(
              409,
              "Nama tingkat sedia ada tidak unik. Muat semula dan betulkan nama menggunakan ID tingkat.",
            );
          fail(400, "ID tingkat tidak sah atau berulang.");
        }
      })();
      if (await tx.hasRemovedFloorLinks(id, ids))
        fail(409, "Buang pautan unit sebelum membuang tingkat.");
      if (await tx.hasRemovedFloorDocuments(id, ids))
        fail(409, "Alihkan pautan bukti dokumen sebelum membuang rekod ini.");
      await tx.deleteFloors(id, ids);
      const existingById = new Map(existing.map((floor) => [floor.id, floor]));
      const reservedLabels = new Set(
        [...existing, ...input.floors].map((floor) => floor.floorLabel),
      );
      const reservedPositions = new Set(
        existing.map((floor) => floor.position),
      );
      let temporaryPosition = -1;
      // Park reordered or renamed rows outside both layouts so unique
      // constraints stay valid even during a label or position swap.
      for (const [position, floor] of input.floors.entries()) {
        const row = existingById.get(ids[position]);
        if (
          !row ||
          (row.position === position && row.floorLabel === floor.floorLabel)
        )
          continue;
        let temporaryLabel = `__pending_${row.id}`;
        while (reservedLabels.has(temporaryLabel)) temporaryLabel += "_";
        reservedLabels.add(temporaryLabel);
        while (reservedPositions.has(temporaryPosition)) temporaryPosition--;
        await tx.updateFloor(row.id, {
          position: temporaryPosition--,
          floorLabel: temporaryLabel,
        });
      }
      for (const [position, floor] of input.floors.entries()) {
        const data = {
          position,
          floorLabel: floor.floorLabel,
          rooms: floor.rooms,
          beds: floor.beds,
          workers: floor.workers,
          areaSqm: new Prisma.Decimal(floor.areaSqm),
          facilities: floor.facilities,
        };
        if (existingById.has(ids[position])) {
          await tx.updateFloor(ids[position], data);
        } else {
          await tx.createFloor(ids[position], id, data);
        }
      }
      await tx.audit({
        actorId: s.userId,
        activeRole: s.activeRole,
        action: "APPLICATION_FLOORS_SAVED",
        target: id,
        metadata: { version: input.version + 1, floorCount: totals.floors },
      });
      const premises = await tx.findPremises(id);
      const mismatches = comparePremisesTotals(
        premises
          ? {
              involvedFloors: premises.involvedFloors,
              totalRooms: premises.totalRooms,
              proposedWorkers: premises.proposedWorkers,
              floorAreaSqm:
                premises.floorAreaSqm === null
                  ? null
                  : Number(premises.floorAreaSqm),
            }
          : null,
        totals,
      );
      return {
        draftId: id,
        version: input.version + 1,
        floors: input.floors.map((floor, position) => ({
          ...floor,
          id: ids[position],
        })),
        totals,
        mismatches,
      };
    });
  });
}
