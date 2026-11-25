import { requireUnclosedTrainingDraft } from "./synthetic-completion-gate.js";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  normalizeUnitLabel,
  premiseUnitsSaveSchema,
  type PremiseUnitsRecord,
} from "../../../packages/shared/src/premise-units.js";
import { applicant } from "./application-drafts.js";
import { fail } from "./auth.js";
import { db } from "./core.js";
import { authorizedDraft } from "./premise-floors.js";

const params = z.object({ id: z.uuid() });

async function readUnits(
  tx: Prisma.TransactionClient,
  draftId: string,
  version: number,
): Promise<PremiseUnitsRecord> {
  const premise = await tx.applicationPremises.findUnique({
    where: { draftId },
    select: {
      id: true,
      accommodationUnits: true,
      units: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          unitLabel: true,
          floorLinks: { select: { floorId: true } },
        },
      },
    },
  });
  const floorRows = await tx.premiseFloor.findMany({
    where: { draftId },
    orderBy: { position: "asc" },
    select: { id: true, floorLabel: true },
  });
  const floors = floorRows.map(({ id, floorLabel }) => ({
    floorId: id,
    floorLabel,
  }));
  const units = (premise?.units ?? []).map(({ id, unitLabel, floorLinks }) => {
    const linked = new Set(floorLinks.map(({ floorId }) => floorId));
    return {
      unitId: id,
      unitLabel,
      floorIds: floors
        .filter(({ floorId }) => linked.has(floorId))
        .map(({ floorId }) => floorId),
    };
  });
  const declaredCount = premise?.accommodationUnits ?? null;
  const unitCount = units.length;
  return {
    version,
    premiseId: premise?.id ?? null,
    units,
    floors,
    totals: { unitCount, declaredCount },
    inventoryStatus:
      unitCount === 0
        ? "NOT_RECORDED"
        : declaredCount === null
          ? "NOT_DECLARED"
          : declaredCount === unitCount
            ? "MATCHED"
            : "MISMATCH",
  };
}

export async function premiseUnitRoutes(app: FastifyInstance) {
  app.get("/api/application-drafts/:id/units", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store, max-age=0");
    const { userId } = await applicant(req);
    const { id } = params.parse(req.params);
    return db.$transaction(
      async (tx) => {
        const { version } = await authorizedDraft(tx, userId, id);
        return readUnits(tx, id, version);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  });

  app.put("/api/application-drafts/:id/units", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store, max-age=0");
    const s = await applicant(req);
    const { id } = params.parse(req.params);
    const input = premiseUnitsSaveSchema.parse(req.body);
    return db.$transaction(async (tx) => {
      await authorizedDraft(tx, s.userId, id);
      await requireUnclosedTrainingDraft(tx, id);
      const claim = await tx.applicationDraft.updateMany({
        where: {
          id,
          initiatedByUserId: s.userId,
          status: "DRAFT",
          version: input.version,
        },
        data: { version: { increment: 1 } },
      });
      if (claim.count !== 1)
        fail(409, "Draf telah dikemas kini. Muat semula sebelum menyimpan.");

      const premise = await tx.applicationPremises.findUnique({
        where: { draftId: id },
        select: {
          id: true,
          units: {
            select: {
              id: true,
              normalizedLabel: true,
              floorLinks: { select: { floorId: true } },
            },
          },
        },
      });
      if (!premise) fail(409, "Simpan maklumat premis dahulu.");
      const existing = new Map(premise.units.map((unit) => [unit.id, unit]));
      const floors = new Set(
        (
          await tx.premiseFloor.findMany({
            where: { draftId: id },
            select: { id: true },
          })
        ).map(({ id }) => id),
      );
      const retained = new Set<string>();
      for (const unit of input.units) {
        if (unit.unitId) {
          if (!existing.has(unit.unitId))
            fail(400, "ID unit tidak sah untuk premis ini.");
          retained.add(unit.unitId);
        }
        if (unit.floorIds.some((floorId) => !floors.has(floorId)))
          fail(400, "ID tingkat tidak sah untuk premis ini.");
      }
      const omitted = premise.units.filter((unit) => !retained.has(unit.id));
      if (omitted.some((unit) => unit.floorLinks.length > 0))
        fail(409, "Simpan unit tanpa pautan tingkat sebelum membuangnya.");

      if (await tx.draftDocumentScope.findFirst({
        where: { draftId: id, unitId: { in: omitted.map(({ id }) => id) } }, select: { documentId: true },
      })) fail(409, "Alihkan pautan bukti dokumen sebelum membuang rekod ini.");
      await tx.premiseUnit.deleteMany({
        where: {
          premiseId: premise.id,
          id: { in: omitted.map(({ id }) => id) },
        },
      });
      const desired = input.units.map((unit) => ({
        ...unit,
        id: unit.unitId ?? randomUUID(),
        normalizedLabel: normalizeUnitLabel(unit.unitLabel),
      }));
      const reserved = new Set([
        ...premise.units.map(({ normalizedLabel }) => normalizedLabel),
        ...desired.map(({ normalizedLabel }) => normalizedLabel),
      ]);
      // Keep the unique index valid through label swaps.
      for (const unit of desired) {
        const prior = existing.get(unit.id);
        if (!prior || prior.normalizedLabel === unit.normalizedLabel) continue;
        let temporaryLabel = `__pending_${unit.id}`;
        while (reserved.has(temporaryLabel)) temporaryLabel += "_";
        reserved.add(temporaryLabel);
        await tx.premiseUnit.update({
          where: { id: unit.id },
          data: { normalizedLabel: temporaryLabel },
        });
      }

      const links: Prisma.PremiseUnitFloorCreateManyInput[] = [];
      for (const unit of desired) {
        const data = {
          unitLabel: unit.unitLabel,
          normalizedLabel: unit.normalizedLabel,
        };
        const prior = existing.get(unit.id);
        if (prior) {
          await tx.premiseUnit.update({ where: { id: unit.id }, data });
          await tx.premiseUnitFloor.deleteMany({
            where: {
              draftId: id,
              unitId: unit.id,
              floorId: { notIn: unit.floorIds },
            },
          });
        } else {
          await tx.premiseUnit.create({
            data: { ...data, id: unit.id, premiseId: premise.id, draftId: id },
          });
        }
        const linked = new Set(prior?.floorLinks.map(({ floorId }) => floorId));
        for (const floorId of unit.floorIds) {
          if (!linked.has(floorId))
            links.push({ unitId: unit.id, floorId, draftId: id });
        }
      }
      if (links.length) await tx.premiseUnitFloor.createMany({ data: links });
      const version = input.version + 1;
      await tx.auditLog.create({
        data: {
          actorId: s.userId,
          activeRole: s.activeRole,
          action: "APPLICATION_UNITS_SAVED",
          target: id,
          metadata: {
            version,
            unitCount: desired.length,
            floorLinkCount: desired.reduce(
              (count, unit) => count + unit.floorIds.length,
              0,
            ),
          },
        },
      });
      return readUnits(tx, id, version);
    });
  });
}
