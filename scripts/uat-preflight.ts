import "dotenv/config";
import { createConnection } from "node:net";
import { parseArgs } from "node:util";
import argon2 from "argon2";
import { fixtureEnvironment, PreflightError } from "./uat-preflight-config.js";
import {
  isTrainingApplicant,
  trainingPersonas,
  trainingScenarios,
  readTrainingKit,
} from "./uat-preflight-kit.js";

async function checkMailpit() {
  const smtp = await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 1025 });
    const finish = (available: boolean) => {
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(3000, () => finish(false));
    socket.once("error", () => finish(false));
    socket.once("data", (data) =>
      finish(/^220 [^\r\n]*Mailpit ESMTP/i.test(data.toString())),
    );
  });
  if (!smtp)
    throw new PreflightError(
      "Mailpit SMTP tidak menjawab pada 127.0.0.1:1025.",
    );
  try {
    const reply = await fetch("http://127.0.0.1:8025/api/v1/messages?limit=1", {
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    if (!reply.ok || !Array.isArray((await reply.json()).messages))
      throw Error();
  } catch {
    throw new PreflightError("API Mailpit tidak menjawab pada 127.0.0.1:8025.");
  }
}

export async function runPreflight(args: string[]) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: { kit: { type: "string" }, help: { type: "boolean" } },
      allowPositionals: true,
    });
  } catch {
    throw new PreflightError("Argumen pemeriksaan tidak sah. Rujuk --help.");
  }
  if (parsed.values.help) {
    console.log(
      "Pemeriksaan awal UAT sintetik STAYLink MBSP\n  uat:preflight -- empty\n  uat:preflight -- kit --kit DIREKTORI\nGunakan PostgreSQL dan Mailpit loopback.",
    );
    return;
  }
  const [mode] = parsed.positionals;
  if (
    parsed.positionals.length !== 1 ||
    !(
      (mode === "empty" && !parsed.values.kit) ||
      (mode === "kit" && parsed.values.kit)
    )
  )
    throw new PreflightError(
      "Pilih empty atau kit --kit DIREKTORI. Rujuk --help.",
    );

  const expected = fixtureEnvironment();
  const people = trainingPersonas(expected.database);
  const cases = trainingScenarios(expected.database);
  const hosted = expected.database.startsWith("staylink_issue62_");
  const kit = parsed.values.kit
    ? await readTrainingKit(parsed.values.kit, expected)
    : null;
  const { db, decrypt } = await import("../apps/api/src/core.js");
  await checkMailpit();
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const [active] = await tx.$queryRaw<
          { name: string }[]
        >`SELECT current_database()::text AS name`;
        if (active.name !== expected.database)
          throw new PreflightError(
            "Pangkalan data PostgreSQL aktif tidak sepadan dengan sasaran.",
          );
        if (!kit) {
          const [schema] = await tx.$queryRaw<{ unused: boolean }[]>`
          SELECT NOT EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
          ) AS unused`;
          if (!schema.unused)
            throw new PreflightError(
              "DB latihan sudah mengandungi objek. Sediakan DB kosong baharu tanpa memadam sejarah.",
            );
          return;
        }
        const users = await tx.user.findMany({
          select: {
            id: true,
            email: true,
            kind: true,
            status: true,
            emailVerified: true,
            passwordHash: true,
            roles: { include: { role: { include: { permissions: true } } } },
            factors: true,
          },
          take: people.length + 1,
        });
        const now = new Date();
        const verified = await Promise.all(
          people.map(async ({ label, role, district }) => {
            const account = kit.accounts.find((item) => item.label === label)!;
            const user = users.find((item) => item.id === account.id);
            const applicant = isTrainingApplicant(role);
            const expectedRoles =
              applicant && !hosted ? ["PEMOHON", "WAKIL_SYARIKAT"] : [role];
            if (
              !user ||
              user.email !== account.email ||
              user.status !== "ACTIVE" ||
              !user.emailVerified ||
              user.kind !== (applicant ? "APPLICANT" : "OFFICER") ||
              user.roles.length !== expectedRoles.length ||
              !expectedRoles.every((item) =>
                user.roles.some(
                  (assignment) =>
                    assignment.roleId === item &&
                    assignment.districtId === district &&
                    assignment.status === "ACTIVE" &&
                    assignment.startsAt <= now &&
                    !assignment.endsAt &&
                    assignment.role.permissions.some(
                      ({ action }) =>
                        action ===
                        (applicant
                          ? "applications.draft"
                          : role === "PENTADBIR_ICT"
                            ? "users.manage"
                            : role === "PIC_KAWASAN" || role === "PPSK"
                              ? "areas.read"
                              : "profile"),
                    ),
                ),
              ) ||
              !user.passwordHash ||
              !(await argon2.verify(user.passwordHash, account.password))
            )
              return false;
            if (applicant) return user.factors.length === 0;
            const [factor] = user.factors;
            return (
              factor?.verified &&
              user.factors.length === 1 &&
              decrypt(factor.encryptedSecret) === account.mfaSecretBase32
            );
          }),
        );
        if (
          users.length !== people.length ||
          verified.some((result) => !result)
        )
          throw new PreflightError(
            "Semak akaun, kata laluan, MFA dan pelantikan daerah kit latihan.",
          );

        const drafts = await tx.applicationDraft.findMany({
          take: cases.length + 1,
          include: {
            premises: { include: { units: { include: { floorLinks: true } } } },
            floors: { select: { id: true } },
            documents: { select: { scanStatus: true } },
            company: { include: { representatives: true } },
            _count: { select: { syntheticSubmissions: true } },
          },
        });
        const applicant = kit.accounts.find(
          ({ label }) => label === "pemohon",
        )!;
        const fixturesValid = kit.scenarios.every(
          ({ id, draftPath, feeSen }) => {
            const draft = drafts.find(
              (item) => item.id === draftPath.split("/")[3],
            );
            const units = draft?.premises?.units;
            const expectedUnits = id === "multiple-units" ? 2 : 1;
            const company = id === "company-active" || id === "company-expired";
            const actor =
              company && hosted
                ? kit.accounts.find(({ label }) => label === "wakil")!
                : applicant;
            const rep = draft?.company?.representatives.find(
              (item) => item.userId === actor.id,
            );
            return (
              draft?.initiatedByUserId === actor.id &&
              draft.version === 1 &&
              draft.status === "DRAFT" &&
              draft._count.syntheticSubmissions === 0 &&
              draft.premises?.districtId ===
                (id === "district-spt"
                  ? "SPT"
                  : id === "district-sps"
                    ? "SPS"
                    : "SPU") &&
              draft.floors.length === 2 &&
              units?.length === expectedUnits &&
              units.some((unit) => unit.floorLinks.length === 2) &&
              (feeSen === undefined || feeSen === expectedUnits * 5000) &&
              (id === "failed-evidence"
                ? draft.documents.length === 1 &&
                  draft.documents[0].scanStatus === "FAILED"
                : draft.documents.length === 0) &&
              (company
                ? draft.capacity === "COMPANY" &&
                  draft.company?.status === "ACTIVE" &&
                  rep?.status === "VERIFIED" &&
                  rep.startsAt <= now &&
                  (id === "company-expired"
                    ? Boolean(rep.endsAt && rep.endsAt <= now)
                    : rep.endsAt === null)
                : draft.capacity === "INDIVIDUAL" &&
                  draft.officialApplicantUserId === applicant.id &&
                  !draft.companyId)
            );
          },
        );
        if (
          drafts.length !== cases.length ||
          !fixturesValid ||
          (await tx.company.count()) !== 2 ||
          (await tx.session.count()) !== 0
        )
          throw new PreflightError(
            "Semua fixture asal diperlukan. Sesi yang telah digunakan perlu dikekalkan dan latihan baharu menggunakan DB baharu.",
          );
      },
      { timeout: 15_000 },
    );
  } catch (error) {
    if (error instanceof PreflightError) throw error;
    throw new PreflightError(
      "Semakan baca sahaja PostgreSQL gagal. Semak sambungan, migrasi, klien Prisma dan kunci kit.",
    );
  } finally {
    await db.$disconnect();
  }
  console.log(
    `LULUS · PostgreSQL dan Mailpit loopback · ${kit ? `${people.length} akaun dan ${cases.length} fixture sedia` : "DB kosong"}`,
  );
  console.log(`Polisi ${expected.version} · cap jari ${expected.fingerprint}`);
  console.log("Bukti kesiapsiagaan teknikal latihan.");
}
