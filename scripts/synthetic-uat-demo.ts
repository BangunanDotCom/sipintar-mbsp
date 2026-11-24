import "dotenv/config";
import { isPersonalDemoDatabase } from "../apps/api/src/demo-host-config.mjs";
import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import argon2 from "argon2";
import { Secret } from "otpauth";
import { db, encrypt, hash } from "../apps/api/src/core.js";
import { protectIdentification } from "../apps/api/src/identity.js";
import { fixtureEnvironment, PreflightError } from "./uat-preflight-config.js";
import {
  isTrainingApplicant,
  trainingPersonas,
  trainingTempRoot,
} from "./uat-preflight-kit.js";
import { syntheticPortalDatabase } from "../apps/api/src/synthetic-portal-gate.js";

async function prepareDemo() {
  const expected = syntheticPortalDatabase();
  if (!expected || !/^staylink_issue(?:36|40|45|49|54|58|62)_/.test(expected))
    throw Error(
      "Gunakan PostgreSQL loopback seperti staylink_issue58_<label>_test dengan opt-in portal sintetik.",
    );
  const [actual] = await db.$queryRaw<
    { name: string }[]
  >`SELECT current_database()::text AS name`;
  if (actual?.name !== expected)
    throw Error("Pangkalan data latihan aktif tidak sepadan.");
  const hosted = expected.startsWith("staylink_issue62_");
  const personal = isPersonalDemoDatabase(expected);
  const manifest =
    hosted || expected.startsWith("staylink_issue58_")
      ? fixtureEnvironment()
      : null;
  const batch = randomBytes(6).toString("hex");
  const identities = await Promise.all(
    trainingPersonas(expected).map(async ({ role, district, label }) => {
      const password = `Aa1!${randomBytes(18).toString("hex")}`;
      const mfa = isTrainingApplicant(role)
        ? null
        : new Secret({ size: 20 }).base32;
      return {
        role,
        district,
        label,
        name: `Latihan STAYLink ${role}`,
        email: `uat-${batch}-${label}@example.test`,
        password,
        passwordHash: await argon2.hash(password),
        mfa,
        encrypted: mfa ? encrypt(mfa) : null,
      };
    }),
  );
  const directory = await mkdtemp(
    join(await trainingTempRoot(), "staylink-uat-"),
  );
  const result = await db.$transaction(async (tx) => {
    if (manifest) {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(58001)`;
      if (
        (await tx.user.count()) ||
        (await tx.applicationDraft.count()) ||
        (await tx.company.count())
      )
        throw new PreflightError(
          "Kit latihan memerlukan DB baharu tanpa akaun, draf atau syarikat.",
        );
    }
    const accounts = [];
    for (const identity of identities) {
      const {
        role,
        district,
        label,
        email,
        name,
        passwordHash,
        encrypted,
        password,
        mfa,
      } = identity;
      const applicant = isTrainingApplicant(role);
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          phone: "0100000000",
          emailVerified: true,
          kind: applicant ? "APPLICANT" : "OFFICER",
          ...(applicant
            ? protectIdentification(
                `UJIAN${batch}${role === "WAKIL_SYARIKAT" ? "WA" : ""}`,
              )
            : {}),
          roles: {
            create: [
              {
                roleId: role,
                districtId: district,
                ...(role === "PENTADBIR_ICT" ? { departmentId: "ICT" } : {}),
                reference: hosted ? "LATIHAN ISSUE 62" : "LATIHAN ISSUE 49",
              },
              ...(!hosted && applicant
                ? [{ roleId: "WAKIL_SYARIKAT", reference: "LATIHAN ISSUE 49" }]
                : []),
            ],
          },
        },
      });
      if (encrypted)
        await tx.mfaFactor.create({
          data: { userId: user.id, encryptedSecret: encrypted, verified: true },
        });
      accounts.push({
        role,
        label,
        id: user.id,
        email,
        password,
        mfaSecretBase32: mfa,
      });
    }
    const applicant = await tx.user.findUniqueOrThrow({
      where: { id: accounts[0].id },
    });
    const representative = hosted
      ? await tx.user.findUniqueOrThrow({
          where: { id: accounts.find(({ label }) => label === "wakil")!.id },
        })
      : applicant;
    const companyFor = (expired: boolean) =>
      tx.company.create({
        data: {
          name: expired
            ? "Syarikat latihan — kuasa luput"
            : "Syarikat latihan — kuasa sah",
          registrationNumber: `UAT${batch}${expired ? "LUPUT" : "SAH"}`,
          address: "Alamat latihan",
          phone: "0100000000",
          email: `company-${batch}@example.test`,
          representatives: {
            create: {
              userId: representative.id,
              status: "VERIFIED",
              authorityType: "PENGARAH",
              startsAt: new Date(Date.now() - 120_000),
              endsAt: expired ? new Date(Date.now() - 60_000) : null,
            },
          },
        },
        include: { representatives: true },
      });
    async function scenario(
      label: string,
      unitCount: number,
      districtId = "SPU",
      company?: Awaited<ReturnType<typeof companyFor>>,
      failed = false,
    ) {
      const actor = company ? representative : applicant;
      const profile = {
        userId: actor.id,
        name: actor.name,
        email: actor.email,
        phone: actor.phone,
        identificationMasked: actor.identificationMasked,
      };
      const draft = await tx.applicationDraft.create({
        data: {
          initiatedByUserId: actor.id,
          initiatorSnapshot: profile,
          notes: label,
          ...(company
            ? {
                capacity: "COMPANY",
                companyId: company.id,
                applicantSnapshot: {
                  companyId: company.id,
                  name: company.name,
                  registrationNumber: company.registrationNumber,
                  address: company.address,
                  phone: company.phone,
                  email: company.email,
                  informationStatus: company.informationStatus,
                },
                representativeSnapshot: {
                  ...profile,
                  representativeId: company.representatives[0].id,
                  authorityType: "PENGARAH",
                  status: "VERIFIED",
                },
              }
            : {
                capacity: "INDIVIDUAL",
                officialApplicantUserId: applicant.id,
                applicantSnapshot: profile,
              }),
        },
      });
      const premise = await tx.applicationPremises.create({
        data: {
          draftId: draft.id,
          address: "Premis Latihan Maya, lot UAT-49",
          postcode: "13000",
          lotNumber: "UAT-49",
          locality: "Mukim latihan",
          districtId,
          latitude: 5.42,
          longitude: 100.4,
          locationSource: "USER_PIN",
          buildingType: "Kedai latihan",
          currentUse: "Latihan",
          involvedFloors: 2,
          accommodationUnits: unitCount,
          totalRooms: 2,
          floorAreaSqm: 100,
          proposedWorkers: 4,
          certificateType: "NOT_APPLICABLE",
        },
      });
      const floors = await Promise.all(
        ["Tingkat Bawah", "Tingkat 1"].map((floorLabel, position) =>
          tx.premiseFloor.create({
            data: {
              draftId: draft.id,
              floorLabel,
              position,
              rooms: 1,
              beds: 2,
              workers: 2,
              areaSqm: 50,
              facilities: {
                toilets: 1,
                bathrooms: 1,
                sinks: 1,
                diningTables: 0,
                diningChairs: 0,
                fireExtinguishers: 1,
              },
            },
          }),
        ),
      );
      for (let index = 0; index < unitCount; index++) {
        const unitLabel = index === 0 ? "Kedai Latihan A" : "Kedai Latihan B";
        const unit = await tx.premiseUnit.create({
          data: {
            draftId: draft.id,
            premiseId: premise.id,
            unitLabel,
            normalizedLabel: unitLabel.toLowerCase(),
          },
        });
        const links = index === 0 ? floors : floors.slice(1);
        await tx.premiseUnitFloor.createMany({
          data: links.map(({ id }) => ({
            draftId: draft.id,
            floorId: id,
            unitId: unit.id,
          })),
        });
      }
      if (failed) {
        const storageKey = `issue31-fixture/${draft.id}/uat-failed`;
        await tx.applicationDocument.create({
          data: {
            draftId: draft.id,
            category: "floor_layout",
            version: 1,
            fileName: "simulasi-metadata.pdf",
            mimeType: "application/pdf",
            byteSize: Buffer.byteLength(storageKey),
            sha256: hash(storageKey),
            storageKey,
            scanStatus: "FAILED",
            uploadedBy: applicant.id,
            scope: { create: { floorId: floors[0].id } },
          },
        });
      }
      return `/permohonan/draf/${draft.id}/semakan`;
    }
    const draftPath = await scenario(
      "Latihan UAT · satu unit merentasi dua tingkat",
      1,
    );
    const scenarios = [
      { id: "single-unit", draftPath, feeSen: 5000 },
      {
        id: "multiple-units",
        draftPath: await scenario("Latihan UAT · dua unit fizikal", 2),
        feeSen: 10000,
      },
      {
        id: "failed-evidence",
        draftPath: await scenario(
          "Latihan UAT · bukti gagal",
          1,
          "SPU",
          undefined,
          true,
        ),
      },
      {
        id: "company-active",
        draftPath: await scenario(
          "Latihan UAT · kuasa sah",
          1,
          "SPU",
          await companyFor(false),
        ),
      },
      {
        id: "company-expired",
        draftPath: await scenario(
          "Latihan UAT · kuasa luput",
          1,
          "SPU",
          await companyFor(true),
        ),
      },
      {
        id: "district-spt",
        draftPath: await scenario("Latihan UAT · daerah berasingan", 1, "SPT"),
      },
    ];
    if (personal)
      scenarios.push({
        id: "district-sps",
        draftPath: await scenario(
          "Latihan Personal Demo · daerah SPS",
          1,
          "SPS",
        ),
      });
    return {
      ...(personal && { loginUrl: `${process.env.APP_ORIGIN}/log-masuk` }),
      accounts,
      draftPath,
      scenarios,
      feeSen: 5000,
    };
  });
  await writeFile(
    join(directory, "accounts.json"),
    JSON.stringify(result, null, 2) + "\n",
    {
      mode: 0o600,
      flag: "wx",
    },
  );
  await writeFile(
    join(directory, "portal.env"),
    [
      "export STAYLINK_SYNTHETIC_PORTAL=true",
      "export STAYLINK_SYNTHETIC_DISTRICT=SPU",
      `export STAYLINK_SYNTHETIC_PIC_ID=${result.accounts[1].id}`,
      `export STAYLINK_SYNTHETIC_SUPERVISOR_ID=${result.accounts[2].id}`,
      `export STAYLINK_SYNTHETIC_CALLBACK_KEY=${randomBytes(32).toString("hex")}`,
      ...(personal
        ? [
            `export STAYLINK_PERSONAL_PIC_SPT_ID=${result.accounts.find(({ label }) => label === "pic-spt")!.id}`,
            `export STAYLINK_PERSONAL_PIC_SPS_ID=${result.accounts.find(({ label }) => label === "pic-sps")!.id}`,
          ]
        : []),
      "",
    ].join("\n"),
    { mode: 0o600, flag: "wx" },
  );
  if (manifest)
    await writeFile(
      join(directory, "preflight.json"),
      JSON.stringify(manifest) + "\n",
      {
        mode: 0o600,
        flag: "wx",
      },
    );
  console.log(`Kit latihan ditulis ke ${directory}`);
}

try {
  await prepareDemo();
} catch (error) {
  process.exitCode = 1;
  console.error(
    error instanceof PreflightError ||
      (error instanceof Error && error.message.startsWith("Gunakan PostgreSQL"))
      ? error.message
      : "Penyediaan kit latihan gagal. Semak migrasi, seed peranan dan konfigurasi sintetik.",
  );
} finally {
  await db.$disconnect();
}
