import { verifiedDelegation } from "./delegation-evidence.js";
import { requireUnclosedTrainingDraft } from "./synthetic-completion-gate.js";
import { syntheticDocumentFacts } from "./synthetic-owner-policy.js";
import {
  lockSyntheticApplicantSession,
  type ObservedPortalSession,
} from "./synthetic-portal-session.js";
import type {
  ApplicationDraft,
  Prisma,
  SyntheticSubmission,
} from "@prisma/client";
import { syntheticPortalDatabase } from "./synthetic-portal-gate.js";
import { z } from "zod";
import { db } from "./core.js";
import { fail } from "./auth.js";
import { authorizedDraft } from "./premise-floors.js";
import { validDraftApplicantContext } from "./draft-applicant-context.js";
import { premisesFields } from "./premises.js";
import { evaluateDraftReadiness } from "../../../packages/shared/src/draft-readiness.js";
import type { AuditEntry } from "./oracle/audit.js";
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
  owner?: { version: string; fingerprint: string };
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

export type SyntheticSubmissionTransaction = {
  lockApplicant(
    userId: string,
    operator?: ObservedPortalSession,
  ): Promise<"PEMOHON" | "WAKIL_SYARIKAT">;
  draft(userId: string, id: string): Promise<ApplicationDraft>;
  authority(userId: string, companyId: string): Promise<NonNullable<Authority>>;
  proof(authority: NonNullable<Authority>): Promise<DelegationProof>;
  lockDraftVersion(draft: ApplicationDraft): Promise<number | undefined>;
  submissionByKey(
    draftId: string,
    key: string,
  ): Promise<SyntheticSubmission | null>;
  latestSubmission(draftId: string): Promise<SyntheticSubmission | null>;
  correctionRequested(submissionId: string): Promise<boolean>;
  lockEvidence(draftId: string): Promise<void>;
  requireUnclosed(draftId: string): Promise<void>;
  inventory(draftId: string): Promise<SyntheticInventory>;
  evidence(draftId: string): Promise<SyntheticEvidence>;
  createSubmission(
    data: Omit<SyntheticSubmission, "id" | "createdAt" | "snapshot"> & {
      snapshot: Prisma.InputJsonObject;
    },
  ): Promise<SyntheticSubmission>;
  audit(entry: AuditEntry): Promise<void>;
};

// The PostgreSQL caller still supplies its existing verified sandbox and policy.
export async function captureSyntheticSubmission(
  userId: string,
  payload: unknown,
  policy?: SyntheticPolicy,
  operator?: ObservedPortalSession,
) {
  const expectedDatabase = assertSandbox();
  const enforcePortal = Boolean(syntheticPortalDatabase());
  return db.$transaction(async (tx) => {
    const [active] = await tx.$queryRaw<
      { name: string }[]
    >`SELECT current_database()::text AS name`;
    if (active?.name !== expectedDatabase)
      fail(404, "Pangkalan data sintetik tidak tersedia.");
    const repository: SyntheticSubmissionTransaction = {
      async lockApplicant(user, session) {
        if (!enforcePortal) return "PEMOHON";
        if (!session || session.userId !== user)
          fail(403, "Sesi portal diperlukan.");
        return lockSyntheticApplicantSession(tx, session);
      },
      draft: (user, id) => authorizedDraft(tx, user, id),
      authority: (user, company) => companyAuthority(tx, user, company),
      proof: (authority) => verifiedDelegation(tx, authority),
      async lockDraftVersion(draft) {
        const [current] = await tx.$queryRaw<{ version: number }[]>`
          SELECT version FROM application_drafts WHERE id = ${draft.id} FOR UPDATE`;
        return current?.version;
      },
      async submissionByKey(draftId, key) {
        return tx.syntheticSubmission.findUnique({
          where: { draftId_key: { draftId, key } },
        });
      },
      async latestSubmission(draftId) {
        return tx.syntheticSubmission.findFirst({
          where: { draftId },
          orderBy: { draftVersion: "desc" },
        });
      },
      async correctionRequested(id) {
        return !!(await tx.auditLog.findFirst({
          where: {
            target: id,
            outcome: "SUCCESS",
            action: "SYNTHETIC_PORTAL_CORRECTION_REQUESTED",
          },
          select: { id: true },
        }));
      },
      requireUnclosed: (draftId) => requireUnclosedTrainingDraft(tx, draftId),
      async lockEvidence(draftId) {
        await tx.$queryRaw`SELECT id FROM application_documents WHERE "draftId" = ${draftId} FOR SHARE`;
        await tx.$queryRaw`SELECT "documentId" FROM draft_document_scopes WHERE "draftId" = ${draftId} FOR SHARE`;
      },
      inventory: (id) => loadSyntheticInventory(tx, id),
      evidence: (id) => loadSyntheticEvidence(tx, id),
      async createSubmission(data) {
        return tx.syntheticSubmission.create({ data });
      },
      async audit(entry) {
        await tx.auditLog.create({
          data: {
            ...entry,
            metadata: entry.metadata as Prisma.InputJsonValue | undefined,
          },
        });
      },
    };
    return captureInTransaction(
      repository,
      userId,
      payload,
      policy,
      operator,
      enforcePortal,
    );
  });
}

export async function captureInTransaction(
  tx: SyntheticSubmissionTransaction,
  userId: string,
  payload: unknown,
  policy: SyntheticPolicy | undefined,
  operator: ObservedPortalSession | undefined,
  enforcePortal: boolean,
) {
  if (!policy || !policy.declarationVersion.startsWith("SYNTHETIC-"))
    fail(409, "Polisi akuan sintetik belum tersedia.");
  const input = inputSchema.parse(payload);
  const activeRole = await tx.lockApplicant(userId, operator);
  const draft = await tx.draft(userId, input.draftId);
  const authority = draft.companyId
    ? await tx.authority(userId, draft.companyId)
    : null;
  assertSyntheticCapacity(draft, authority);
  const currentVersion = await tx.lockDraftVersion(draft);
  const prior = await tx.submissionByKey(draft.id, input.key);
  if (prior) {
    const savedPolicy = z
      .object({ policyFingerprint: z.string().optional() })
      .safeParse(prior.snapshot);
    if (
      policy.owner &&
      savedPolicy.success &&
      savedPolicy.data.policyFingerprint &&
      savedPolicy.data.policyFingerprint !== policy.owner.fingerprint
    )
      fail(409, "Serahan latihan ini menggunakan polisi terdahulu.");
    if (authority || enforcePortal)
      await assertSnapshotAuthority(prior, tx.authority, tx.proof);
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
    currentVersion !== input.version ||
    input.declarationVersion !== policy.declarationVersion
  )
    fail(409, "Versi draf atau akuan tidak sepadan.");
  // The content read before acquiring the draft lock must match the claimed version.
  if (draft.version !== currentVersion) fail(409, "Draf telah berubah.");
  const latest = await tx.latestSubmission(draft.id);
  if (
    (latest?.id ?? null) !== input.previousId ||
    (latest &&
      (latest.draftVersion >= input.version ||
        (enforcePortal
          ? !(await tx.correctionRequested(latest.id))
          : policy.correctionFor !== latest.id)))
  )
    fail(409, "Pembetulan sintetik belum dibenarkan.");
  if (latest && (authority || enforcePortal)) {
    const original = await assertSnapshotAuthority(
      latest,
      tx.authority,
      tx.proof,
    );
    if (
      original.capacity !== draft.capacity ||
      original.companyId !== draft.companyId
    )
      fail(
        409,
        "Kapasiti dan syarikat asal mesti dikekalkan untuk pembetulan sintetik.",
      );
  }

  await tx.requireUnclosed(draft.id);
  const authorityProof = authority ? await tx.proof(authority) : null;
  await tx.lockEvidence(draft.id);
  const { premises, floors, eligible, evidence, readiness } =
    evaluateSyntheticReadiness(
      draft,
      authority,
      policy,
      await tx.inventory(draft.id),
      await tx.evidence(draft.id),
      enforcePortal,
    );

  const row = await tx.createSubmission({
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
      ...(policy.owner && {
        ownerPolicyVersion: policy.owner.version,
        policyFingerprint: policy.owner.fingerprint,
      }),
      districtId: premises.districtId,
      representativeId: authority?.id ?? null,
      authorityProof,
      authorityType: authority?.authorityType ?? null,
      floors: floors.map(
        ({ id, floorLabel, rooms, beds, workers, areaSqm, facilities }) => ({
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
  });
  await tx.audit({
    actorId: userId,
    activeRole,
    action: "SYNTHETIC_SUBMISSION_CAPTURED",
    target: row.id,
    metadata: {
      draftVersion: row.draftVersion,
      previousId: input.previousId,
      ...(policy.owner && {
        ownerPolicyVersion: policy.owner.version,
        policyFingerprint: policy.owner.fingerprint,
      }),
    },
  });
  return { id: row.id, version: row.draftVersion };
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

export type SyntheticInventory = {
  premises:
    | (import("@prisma/client").ApplicationPremises & {
        units: {
          id: string;
          unitLabel: string;
          floorLinks: { floorId: string }[];
        }[];
      })
    | null;
  floors: import("@prisma/client").PremiseFloor[];
};

export async function loadSyntheticInventory(
  tx: Prisma.TransactionClient,
  draftId: string,
): Promise<SyntheticInventory> {
  const premises = await tx.applicationPremises.findUnique({
    where: { draftId: draftId },
    include: {
      units: {
        orderBy: { id: "asc" },
        include: { floorLinks: { orderBy: { floorId: "asc" } } },
      },
    },
  });
  const floors = await tx.premiseFloor.findMany({
    where: { draftId: draftId },
    orderBy: { position: "asc" },
  });
  return { premises, floors };
}

export async function loadSyntheticEvidence(
  tx: Prisma.TransactionClient,
  draftId: string,
) {
  return tx.applicationDocument.findMany({
    where: {
      draftId,
      supersededAt: null,
      ...(syntheticPortalDatabase()
        ? { storageKey: { startsWith: "issue31-fixture/" } }
        : {}),
    },
    select: {
      id: true,
      category: true,
      version: true,
      scanStatus: true,
      verificationStatus: true,
      scope: { select: { unitId: true, floorId: true } },
    },
    orderBy: { id: "asc" },
  });
}

export type SyntheticEvidence = Awaited<
  ReturnType<typeof loadSyntheticEvidence>
>;

export function documentContext(
  draft: ApplicationDraft,
  { premises, floors }: Awaited<ReturnType<typeof loadSyntheticInventory>>,
  documents: Awaited<ReturnType<typeof loadSyntheticEvidence>>,
) {
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
  const capacity =
    draft.capacity === "COMPANY"
      ? ("COMPANY" as const)
      : ("INDIVIDUAL" as const);
  return {
    eligible,
    capacity,
    evidence,
    premiseType: premises?.buildingType ?? null,
    facts: syntheticDocumentFacts(
      premises?.units.length ?? 0,
      premises?.certificateType ?? null,
    ),
    targets: {
      DRAFT: [draft.id],
      UNIT: premises?.units.map(({ id }) => id) ?? [],
      FLOOR: floors.map(({ id }) => id),
    },
  };
}

export async function loadSyntheticReadiness(
  tx: Prisma.TransactionClient,
  draft: ApplicationDraft,
  authority: Authority,
  policy: SyntheticPolicy,
  loaded?: {
    inventory: Awaited<ReturnType<typeof loadSyntheticInventory>>;
    documents: Awaited<ReturnType<typeof loadSyntheticEvidence>>;
  },
) {
  if (authority) await verifiedDelegation(tx, authority);
  return evaluateSyntheticReadiness(
    draft,
    authority,
    policy,
    loaded?.inventory ?? (await loadSyntheticInventory(tx, draft.id)),
    loaded?.documents ?? (await loadSyntheticEvidence(tx, draft.id)),
    Boolean(syntheticPortalDatabase()),
  );
}

export function evaluateSyntheticReadiness(
  draft: ApplicationDraft,
  authority: Authority,
  policy: SyntheticPolicy,
  inventory: SyntheticInventory,
  documents: SyntheticEvidence,
  enforcePortal: boolean,
) {
  assertSyntheticCapacity(draft, authority);
  const { premises, floors } = inventory;
  if (
    !premises?.buildingType ||
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

  if (enforcePortal) {
    const inventory = evaluateDraftReadiness({
      premises: premisesFields(premises),
      floors: floors.map(
        ({ id, floorLabel, rooms, beds, workers, areaSqm, facilities }) => ({
          id,
          floorLabel,
          rooms,
          beds,
          workers,
          areaSqm: Number(areaSqm),
          facilities,
        }),
      ),
    });
    if (!inventory.readyForNextStage)
      fail(
        409,
        inventory.issues[0] ?? "Butiran premis sintetik belum lengkap.",
      );
  }

  const context = documentContext(draft, inventory, documents);
  const { eligible, evidence } = context;
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
  const readiness = evaluateDocumentPolicy(policy.documents, context);
  if (
    readiness.status !== "READY" ||
    !readiness.version?.startsWith("SYNTHETIC-")
  )
    fail(409, "Bukti dokumen sintetik belum lengkap.");

  return { premises, floors, eligible, evidence, readiness };
}

export type DelegationProof = {
  id: string;
  version: number | null;
  sha256: string;
};

export async function requireSyntheticSnapshotAuthority(
  tx: Prisma.TransactionClient,
  row: { snapshot: Prisma.JsonValue; actorId: string },
) {
  return assertSnapshotAuthority(
    row,
    (userId, companyId) => companyAuthority(tx, userId, companyId),
    (rep) => verifiedDelegation(tx, rep),
  );
}

export async function assertSnapshotAuthority(
  row: { snapshot: Prisma.JsonValue; actorId: string },
  locateAuthority: (
    userId: string,
    companyId: string,
  ) => Promise<NonNullable<Authority>>,
  proof: (authority: NonNullable<Authority>) => Promise<DelegationProof>,
) {
  const context = z
    .object({
      capacity: z.enum(["INDIVIDUAL", "COMPANY"]),
      companyId: z.uuid().nullable(),
      representativeId: z.uuid().nullable().optional(),
      authorityProof: z
        .object({
          id: z.uuid(),
          version: z.number().int().positive(),
          sha256: z.string(),
        })
        .nullable()
        .optional(),
    })
    .safeParse(row.snapshot);
  if (
    !context.success ||
    (context.data.capacity === "COMPANY") !== Boolean(context.data.companyId)
  )
    fail(409, "Konteks kuasa serahan sintetik tidak sah.");
  if (context.data.companyId) {
    const authority = await locateAuthority(
      row.actorId,
      context.data.companyId,
    );
    const current = await proof(authority);
    const saved = context.data.authorityProof;
    if (
      !saved ||
      context.data.representativeId !== authority.id ||
      current.id !== saved.id ||
      current.version !== saved.version ||
      current.sha256 !== saved.sha256
    )
      fail(409, "Kuasa serahan sintetik tidak lagi disahkan.");
  }
  return context.data;
}
