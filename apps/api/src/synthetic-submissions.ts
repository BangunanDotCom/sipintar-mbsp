import type { ApplicationDraft, Prisma } from "@prisma/client";
import { syntheticPortalDatabase } from "./synthetic-portal-gate.js";
import { z } from "zod";
import { db } from "./core.js";
import { fail } from "./auth.js";
import { authorizedDraft } from "./premise-floors.js";
import { validDraftApplicantContext } from "./draft-applicant-context.js";
import { companyAuthority } from "./application-drafts.js";
import {
  evaluateDocumentPolicy,
  type Evidence,
} from "../../../packages/shared/src/document-policy.js";

const inputSchema = z.strictObject({
  draftId: z.uuid(),
  version: z.number().int().positive(),
  key: z.uuid(),
  accepted: z.literal(true),
  declarationVersion: z.string().max(80),
  previousId: z.uuid().nullable(),
});

export type SyntheticPolicy = {
  declarationVersion: string;
  documents: unknown;
  correctionFor?: string;
};

function assertSandbox() {
  const portalDatabase = syntheticPortalDatabase();
  if (portalDatabase) return portalDatabase;
  const configured = process.env.TEST_DATABASE_URL;
  const actual = process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== "test" || !configured || actual !== configured)
    fail(404, "Serahan sintetik tidak tersedia.");
  const local = new URL(configured);
  if (
    local.protocol !== "postgresql:" ||
    local.hostname !== "127.0.0.1" ||
    local.port !== "5432" ||
    !/^\/staylink_issue24_[a-z0-9_]+_test$/.test(local.pathname) ||
    local.search ||
    local.hash
  )
    fail(404, "Serahan sintetik tidak tersedia.");
  return local.pathname.slice(1);
}

// The caller supplies a server-owned policy; this service only writes to eligible synthetic databases.
export async function captureSyntheticSubmission(
  userId: string,
  payload: unknown,
  policy?: SyntheticPolicy,
) {
  const expectedDatabase = assertSandbox();
  if (!policy || !policy.declarationVersion.startsWith("SYNTHETIC-"))
    fail(409, "Polisi akuan sintetik belum tersedia.");
  const input = inputSchema.parse(payload);
  return db.$transaction(async (tx) => {
    const [active] = await tx.$queryRaw<
      { name: string }[]
    >`SELECT current_database()::text AS name`;
    if (active?.name !== expectedDatabase)
      fail(404, "Pangkalan data sintetik tidak tersedia.");
    const draft = await authorizedDraft(tx, userId, input.draftId);
    const authority = draft.companyId
      ? await companyAuthority(tx, userId, draft.companyId)
      : null;
    assertSyntheticCapacity(draft, authority);
    // Serializes submission, correction and existing versioned draft edits.
    const [current] = await tx.$queryRaw<{ version: number }[]>`
      SELECT version FROM application_drafts WHERE id = ${draft.id} FOR UPDATE`;
    const prior = await tx.syntheticSubmission.findUnique({
      where: { draftId_key: { draftId: draft.id, key: input.key } },
    });
    if (prior) {
      if (
        prior.actorId !== userId ||
        prior.draftVersion !== input.version ||
        prior.previousId !== input.previousId ||
        prior.declarationVersion !== input.declarationVersion
      )
        fail(409, "Kunci idempotensi telah digunakan untuk serahan lain.");
      return { id: prior.id, version: prior.draftVersion };
    }
    if (
      current?.version !== input.version ||
      input.declarationVersion !== policy.declarationVersion
    )
      fail(409, "Versi draf atau akuan tidak sepadan.");
    // The content read before acquiring the draft lock must match the claimed version.
    if (draft.version !== current.version) fail(409, "Draf telah berubah.");
    const latest = await tx.syntheticSubmission.findFirst({
      where: { draftId: draft.id },
      orderBy: { draftVersion: "desc" },
    });
    if (
      (latest?.id ?? null) !== input.previousId ||
      (latest &&
        (latest.draftVersion >= input.version ||
          policy.correctionFor !== latest.id))
    )
      fail(409, "Pembetulan sintetik belum dibenarkan.");

    // A scan-state change cannot invalidate these rows until the capture commits.
    await tx.$queryRaw`SELECT id FROM application_documents WHERE "draftId" = ${draft.id} FOR SHARE`;
    const { premises, floors, eligible, evidence, readiness } =
      await loadSyntheticReadiness(tx, draft, authority, policy);

    const row = await tx.syntheticSubmission.create({
      data: {
        draftId: draft.id,
        draftVersion: input.version,
        key: input.key,
        actorId: userId,
        declarationVersion: input.declarationVersion,
        previousId: input.previousId,
        policyVersion: readiness.version,
        snapshot: {
          capacity: draft.capacity,
          companyId: draft.companyId,
          premisesId: premises.id,
          buildingType: premises.buildingType,
          districtId: premises.districtId,
          representativeId: authority?.id ?? null,
          authorityType: authority?.authorityType ?? null,
          floors: floors.map(
            ({
              id,
              floorLabel,
              rooms,
              beds,
              workers,
              areaSqm,
              facilities,
            }) => ({
              id,
              floorLabel,
              rooms,
              beds,
              workers,
              areaSqm: areaSqm.toString(),
              facilities,
            }),
          ),
          units: premises.units.map(({ id, unitLabel, floorLinks }) => ({
            id,
            unitLabel,
            floorIds: floorLinks.map(({ floorId }) => floorId),
          })),
          evidence: eligible.map(({ id, version }, index) => ({
            id,
            version,
            ...evidence[index],
          })),
        },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        activeRole: "PEMOHON",
        action: "SYNTHETIC_SUBMISSION_CAPTURED",
        target: row.id,
        metadata: {
          draftVersion: row.draftVersion,
          previousId: input.previousId,
        },
      },
    });
    return { id: row.id, version: row.draftVersion };
  });
}

type Authority = Awaited<ReturnType<typeof companyAuthority>> | null;

function assertSyntheticCapacity(
  draft: ApplicationDraft,
  authority: Authority,
) {
  if (
    (draft.capacity === "COMPANY" &&
      (!authority || authority.status !== "VERIFIED")) ||
    (draft.capacity !== "INDIVIDUAL" && draft.capacity !== "COMPANY")
  )
    fail(409, "Kuasa wakil sintetik belum disahkan.");
  if (
    !validDraftApplicantContext(
      draft.capacity,
      draft.companyId,
      draft.officialApplicantUserId,
      draft.initiatedByUserId,
    )
  )
    fail(409, "Konteks pemohon sintetik tidak sah.");
}

export async function loadSyntheticReadiness(
  tx: Prisma.TransactionClient,
  draft: ApplicationDraft,
  authority: Authority,
  policy: SyntheticPolicy,
) {
  assertSyntheticCapacity(draft, authority);
  const premises = await tx.applicationPremises.findUnique({
    where: { draftId: draft.id },
    include: {
      units: {
        orderBy: { id: "asc" },
        include: { floorLinks: { orderBy: { floorId: "asc" } } },
      },
    },
  });
  const floors = await tx.premiseFloor.findMany({
    where: { draftId: draft.id },
    orderBy: { position: "asc" },
  });
  if (
    !premises?.buildingType ||
    (syntheticPortalDatabase() &&
      !["SPU", "SPT", "SPS"].includes(premises.districtId ?? "")) ||
    !floors.length ||
    !premises.units.length ||
    premises.accommodationUnits !== premises.units.length ||
    premises.units.some((unit) => !unit.floorLinks.length) ||
    new Set(
      premises.units.flatMap((unit) =>
        unit.floorLinks.map((link) => link.floorId),
      ),
    ).size !== floors.length
  )
    fail(409, "Inventori premis sintetik belum lengkap.");

  const documents = await tx.applicationDocument.findMany({
    where: {
      draftId: draft.id,
      supersededAt: null,
      ...(syntheticPortalDatabase()
        ? { storageKey: { startsWith: "issue31-fixture/" } }
        : {}),
    },
    include: { scope: true },
    orderBy: { id: "asc" },
  });
  const eligible = documents.filter(
    (item) =>
      item.scanStatus === "CLEAN" &&
      ["VERIFIED", "UNVERIFIED"].includes(item.verificationStatus),
  );
  const evidence = eligible.map((item): Evidence => ({
    scope: item.scope?.unitId
      ? "UNIT"
      : item.scope?.floorId
        ? "FLOOR"
        : "DRAFT",
    targetId: item.scope?.unitId ?? item.scope?.floorId ?? draft.id,
    category: item.category,
    scanStatus: item.scanStatus,
    verificationStatus: item.verificationStatus,
  }));
  if (
    authority &&
    !evidence.some(
      (item) =>
        item.scope === "DRAFT" &&
        item.category === "company_authority" &&
        item.verificationStatus === "VERIFIED",
    )
  )
    fail(409, "Bukti kuasa wakil sintetik belum disahkan.");
  const capacity = draft.capacity === "COMPANY" ? "COMPANY" : "INDIVIDUAL";
  const readiness = evaluateDocumentPolicy(policy.documents, {
    capacity,
    premiseType: premises.buildingType,
    facts: {},
    targets: {
      DRAFT: [draft.id],
      UNIT: premises.units.map(({ id }) => id),
      FLOOR: floors.map(({ id }) => id),
    },
    evidence,
  });
  if (
    readiness.status !== "READY" ||
    !readiness.version?.startsWith("SYNTHETIC-")
  )
    fail(409, "Bukti dokumen sintetik belum lengkap.");

  return { premises, floors, eligible, evidence, readiness };
}
