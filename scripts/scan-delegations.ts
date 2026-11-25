import "dotenv/config";
import { db } from "../apps/api/src/core.js";
import {
  dueDelegationScans,
  scanDelegationDocument,
} from "../apps/api/src/delegation-scan-worker.js";
import { configuredMalwareScanner } from "../apps/api/src/malware-scanner-config.js";

async function main() {
  if (
    process.env.STAYLINK_DELEGATION_SCAN_ENABLED !== "true" ||
    process.env.STAYLINK_CLAMAV_ENABLED !== "true"
  )
    throw new Error(
      "Pengimbasan surat kuasa dan ClamAV mesti didayakan secara nyata.",
    );
  const scanner = configuredMalwareScanner();
  const pending = await dueDelegationScans(db, new Date());
  for (const { id } of pending) await scanDelegationDocument(db, scanner, id);
}

main()
  .catch(() => {
    console.error("Pengimbasan surat kuasa gagal.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
