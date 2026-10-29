import { closeMailer } from "../apps/api/src/core.js";
import {
  db,
  notify,
  issueIdentity,
  origin,
  audit,
} from "../apps/api/src/core.js";
import { seed } from "../prisma/seed.js";
import { z } from "zod";
// This command is a local privileged maintenance operation. It can run only once.
const email = z.email().parse(process.env.BOOTSTRAP_EMAIL).toLowerCase();
const name = z.string().min(3).parse(process.env.BOOTSTRAP_NAME);
await seed();
const admin = await db.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(17345001)`;
  const existing = await tx.userRoleAssignment.count({
    where: { roleId: "PENTADBIR_ICT" },
  });
  if (existing)
    throw Error(
      "Pentadbir telah wujud. Gunakan proses jemputan melalui portal.",
    );
  return tx.user.create({
    data: {
      name,
      email,
      phone: process.env.BOOTSTRAP_PHONE || "0000000000",
      kind: "OFFICER",
      roles: {
        create: {
          roleId: "PENTADBIR_ICT",
          departmentId: "ICT",
          reference: "Bootstrap pentadbir pertama melalui konsol",
        },
      },
    },
  });
});
const t = await issueIdentity(admin.id, "OFFICER_INVITE");
await notify(
  admin.id,
  "INVITATION",
  "Pengaktifan pentadbir pertama",
  "Tetapkan kata laluan dan MFA melalui pautan e-mel.",
  `${origin}/aktifkan?type=OFFICER_INVITE&token=${t}`,
);
await audit(admin.id, null, "ADMIN_BOOTSTRAP", admin.id);
console.log(
  "Jemputan disimpan dalam outbox e-mel. Tiada kata laluan lalai dicipta.",
);
closeMailer();
await db.$disconnect();
