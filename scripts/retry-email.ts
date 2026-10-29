import { closeMailer } from "../apps/api/src/core.js";
import { db, dispatchMail } from "../apps/api/src/core.js";
const logs = await db.emailDeliveryLog.findMany({
  where: { status: { in: ["PENDING", "FAILED"] }, attempts: { lt: 5 } },
  take: 100,
  orderBy: { createdAt: "asc" },
});
for (const log of logs) await dispatchMail(log.id);
console.log(`${logs.length} rekod diproses.`);
closeMailer();
await db.$disconnect();
