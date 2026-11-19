import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import argon2 from "argon2";
import { Secret } from "otpauth";
import { db, encrypt } from "../apps/api/src/core.js";
import { protectIdentification } from "../apps/api/src/identity.js";
import { syntheticPortalDatabase } from "../apps/api/src/synthetic-portal-gate.js";

async function prepareDemo() {
  const expected = syntheticPortalDatabase();
  if (!expected?.startsWith("staylink_issue36_"))
    throw Error(
      "Gunakan PostgreSQL loopback staylink_issue36_<label>_test dengan opt-in portal sintetik.",
    );
  const [actual] = await db.$queryRaw<
    { name: string }[]
  >`SELECT current_database()::text AS name`;
  if (actual?.name !== expected)
    throw Error("Pangkalan data latihan aktif tidak sepadan.");
  const roles = ["PEMOHON", "PIC_KAWASAN", "PPSK"] as const;
  const batch = randomBytes(6).toString("hex");
  const identities = await Promise.all(
    roles.map(async (role) => {
      const password = `Aa1!${randomBytes(18).toString("hex")}`;
      const mfa = role === "PEMOHON" ? null : new Secret({ size: 20 }).base32;
      return {
        role,
        name: `Latihan STAYLink ${role}`,
        email: `uat-${batch}-${role.toLowerCase()}@example.test`,
        password,
        passwordHash: await argon2.hash(password),
        mfa,
        encrypted: mfa ? encrypt(mfa) : null,
      };
    }),
  );
  const directory = await mkdtemp(join(tmpdir(), "staylink-uat-"));
  const result = await db.$transaction(async (tx) => {
    const accounts = [];
    for (const identity of identities) {
      const { role, email, name, passwordHash, encrypted, password, mfa } =
        identity;
      const applicant = role === "PEMOHON";
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          phone: "0100000000",
          emailVerified: true,
          kind: applicant ? "APPLICANT" : "OFFICER",
          ...(applicant ? protectIdentification(`UJIAN${batch}`) : {}),
          roles: {
            create: {
              roleId: role,
              districtId: applicant ? null : "SPU",
              reference: "LATIHAN ISSUE 36",
            },
          },
        },
      });
      if (encrypted)
        await tx.mfaFactor.create({
          data: { userId: user.id, encryptedSecret: encrypted, verified: true },
        });
      accounts.push({
        role,
        id: user.id,
        email,
        password,
        mfaSecretBase32: mfa,
      });
    }
    const applicant = await tx.user.findUniqueOrThrow({
      where: { id: accounts[0].id },
    });
    const profile = {
      userId: applicant.id,
      name: applicant.name,
      email: applicant.email,
      phone: applicant.phone,
      identificationMasked: applicant.identificationMasked,
    };
    const draft = await tx.applicationDraft.create({
      data: {
        capacity: "INDIVIDUAL",
        initiatedByUserId: applicant.id,
        officialApplicantUserId: applicant.id,
        initiatorSnapshot: profile,
        applicantSnapshot: profile,
        notes: "Latihan UAT STAYLink MBSP.",
      },
    });
    const premise = await tx.applicationPremises.create({
      data: {
        draftId: draft.id,
        address: "Premis Latihan Maya, lot UAT-36",
        postcode: "13000",
        lotNumber: "UAT-36",
        locality: "Mukim latihan",
        districtId: "SPU",
        latitude: 5.42,
        longitude: 100.4,
        locationSource: "USER_PIN",
        buildingType: "Kedai latihan",
        currentUse: "Latihan",
        involvedFloors: 2,
        accommodationUnits: 1,
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
    const unit = await tx.premiseUnit.create({
      data: {
        draftId: draft.id,
        premiseId: premise.id,
        unitLabel: "Kedai Latihan A",
        normalizedLabel: "kedai latihan a",
      },
    });
    await tx.premiseUnitFloor.createMany({
      data: floors.map(({ id }) => ({
        draftId: draft.id,
        floorId: id,
        unitId: unit.id,
      })),
    });
    return {
      accounts,
      draftPath: `/permohonan/draf/${draft.id}/semakan`,
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
      "",
    ].join("\n"),
    { mode: 0o600, flag: "wx" },
  );
  console.log(`Kit latihan ditulis ke ${directory}`);
}

try {
  await prepareDemo();
} catch (error) {
  process.exitCode = 1;
  console.error(
    error instanceof Error && error.message.startsWith("Gunakan PostgreSQL")
      ? error.message
      : "Penyediaan kit latihan gagal. Semak migrasi, seed peranan dan konfigurasi sintetik.",
  );
} finally {
  await db.$disconnect();
}
