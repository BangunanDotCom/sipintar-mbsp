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
import { postgresAuth } from "./auth-repository.js";
import {
  postgresDraftRepository,
  type DraftTransaction,
} from "./draft-repository.js";
import { ownedDraft } from "./premise-floors.js";

const params = z.object({ id: z.uuid() });

async function readUnits(
  tx: DraftTransaction,
  draftId: string,
  version: number,
): Promise<PremiseUnitsRecord> {
  const premise = await tx.findPremises(draftId);
  const floorRows = await tx.floors(draftId);
  const storedUnits = premise ? await tx.units(premise.id) : [];
  const floors = floorRows.map(({ id, floorLabel }) => ({
    floorId: id,
    floorLabel,
  }));
  const units = storedUnits.map(({ id, unitLabel, floorLinks }) => {
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

export async function premiseUnitRoutes(
  app: FastifyInstance,
  repository = postgresDraftRepository,
  auth = postgresAuth,
) {
  app.get("/api/application-drafts/:id/units", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store, max-age=0");
    const { userId } = await applicant(req, auth);
    const { id } = params.parse(req.params);
    return repository.transaction(async (tx) => {
      const { version } = await ownedDraft(tx, userId, id);
      return readUnits(tx, id, version);
    }, true);
  });

  app.put("/api/application-drafts/:id/units", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store, max-age=0");
    const s = await applicant(req, auth);
    const { id } = params.parse(req.params);
    const input = premiseUnitsSaveSchema.parse(req.body);
    return repository.transaction(async (tx) => {
      await ownedDraft(tx, s.userId, id);
      if (!(await tx.saveDraft(s.userId, id, input.version)))
        fail(409, "Draf telah dikemas kini. Muat semula sebelum menyimpan.");
      const premise = await tx.findPremises(id);
      if (!premise) fail(409, "Simpan maklumat premis dahulu.");
      const storedUnits = await tx.units(premise.id);
      const existing = new Map(storedUnits.map((unit) => [unit.id, unit]));
      const floors = new Set((await tx.floors(id)).map(({ id }) => id));
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
      const omitted = storedUnits.filter((unit) => !retained.has(unit.id));
      if (omitted.some((unit) => unit.floorLinks.length > 0))
        fail(409, "Simpan unit tanpa pautan tingkat sebelum membuangnya.");

      const removed = omitted.map(({ id }) => id);
      if (await tx.hasRemovedUnitDocuments(id, removed))
        fail(409, "Alihkan pautan bukti dokumen sebelum membuang rekod ini.");
      await tx.deleteUnits(premise.id, removed);
      const desired = input.units.map((unit) => ({
        ...unit,
        id: unit.unitId ?? randomUUID(),
        normalizedLabel: normalizeUnitLabel(unit.unitLabel),
      }));
      const reserved = new Set([
        ...storedUnits.map(({ normalizedLabel }) => normalizedLabel),
        ...desired.map(({ normalizedLabel }) => normalizedLabel),
      ]);
      // Keep the unique index valid through label swaps.
      for (const unit of desired) {
        const prior = existing.get(unit.id);
        if (!prior || prior.normalizedLabel === unit.normalizedLabel) continue;
        let temporaryLabel = `__pending_${unit.id}`;
        while (reserved.has(temporaryLabel)) temporaryLabel += "_";
        reserved.add(temporaryLabel);
        await tx.updateUnit(unit.id, { normalizedLabel: temporaryLabel });
      }

      const links: Prisma.PremiseUnitFloorCreateManyInput[] = [];
      for (const unit of desired) {
        const data = {
          unitLabel: unit.unitLabel,
          normalizedLabel: unit.normalizedLabel,
        };
        const prior = existing.get(unit.id);
        if (prior) {
          await tx.updateUnit(unit.id, data);
          await tx.deleteFloorLinks(id, unit.id, unit.floorIds);
        } else {
          await tx.createUnit(unit.id, premise.id, id, data);
        }
        const linked = new Set(prior?.floorLinks.map(({ floorId }) => floorId));
        for (const floorId of unit.floorIds) {
          if (!linked.has(floorId))
            links.push({ unitId: unit.id, floorId, draftId: id });
        }
      }
      if (links.length) await tx.createFloorLinks(links);
      const version = input.version + 1;
      await tx.audit({
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
      });
      return readUnits(tx, id, version);
    });
  });
}
