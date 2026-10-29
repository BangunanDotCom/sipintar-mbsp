import { protectIdentification } from "../apps/api/src/identity.js";
import { db, production, audit } from "../apps/api/src/core.js";
import { seed } from "../prisma/seed.js";
import { roles, passwordSchema } from "../packages/shared/src/index.js";
import argon2 from "argon2";
if (production || process.env.DEMO_DATA_ALLOWED !== "true")
  throw Error(
    "Demo seed memerlukan persekitaran bukan produksi dan DEMO_DATA_ALLOWED=true.",
  );
const password = passwordSchema.parse(process.env.DEMO_PASSWORD);
await seed();
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
for (const roleId of Object.keys(roles)) {
  const email = `ujian.${roleId.toLowerCase()}@example.test`;
  const user = await db.user.upsert({
    where: { email },
    create: {
      ...(["PEMOHON", "WAKIL_SYARIKAT"].includes(roleId)
        ? protectIdentification("UJIAN" + roleId.replaceAll("_", ""))
        : {}),
      name: `DATA UJIAN ${roles[roleId as keyof typeof roles]}`,
      email,
      phone: "0000000000",
      passwordHash,
      emailVerified: true,
      kind: ["PEMOHON", "WAKIL_SYARIKAT"].includes(roleId)
        ? "APPLICANT"
        : "OFFICER",
      consentAt: new Date(),
      roles: {
        create: {
          roleId,
          districtId: ["PIC_KAWASAN", "PPSK"].includes(roleId) ? "SPU" : null,
          departmentId: "BANGUNAN",
          reference: "DATA UJIAN — BUKAN PELANTIKAN RASMI",
        },
      },
    },
    update: {},
  });
  if (roleId === "PEMOHON") {
    const company = await db.company.upsert({
      where: { registrationNumber: "DATAUJIAN0001" },
      create: {
        name: "DATA UJIAN Syarikat Contoh",
        registrationNumber: "DATAUJIAN0001",
        address: "ALAMAT DATA UJIAN, Seberang Perai",
        phone: "0000000000",
        email: "syarikat@example.test",
        representatives: {
          create: {
            userId: user.id,
            authorityType: "PENGARAH",
            canManageRepresentatives: true,
          },
        },
      },
      update: {},
    });
    console.log(`Profil syarikat DATA UJIAN: ${company.registrationNumber}`);
  }
  await audit(user.id, roleId, "DEMO_SEED", user.id);
  console.log(`DATA UJIAN: ${email} (pegawai wajib daftar MFA)`);
}
for (const districtId of ["SPU", "SPT", "SPS"])
  await db.area.upsert({
    where: {
      name_districtId: { name: `DATA UJIAN Kawasan ${districtId}`, districtId },
    },
    create: { name: `DATA UJIAN Kawasan ${districtId}`, districtId },
    update: {},
  });
await db.$disconnect();
