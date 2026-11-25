import { configuredMalwareScanner } from "../../apps/api/src/malware-scanner-config.js";

if (
  process.env.STAYLINK_JTIK_SYNTHETIC_PROBE !== "true" ||
  process.env.STAYLINK_CLAMAV_ENABLED !== "true"
)
  throw Error(
    "Sediakan pengimbas makmal yang diluluskan dan aktifkan probe sintetik.",
  );

const scanner = configuredMalwareScanner();
const benign = Buffer.from(
  "%PDF-1.4\nSynthetic scanner acceptance fixture\n%%EOF",
);
const eicar = Buffer.from(
  "X5O!P%@AP[4" +
    "\\" +
    "PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
);
const clean = await scanner.scan(benign);
const detected = await scanner.scan(eicar);
if (clean.status !== "CLEAN" || detected.status !== "INFECTED")
  throw Error("Keputusan fixture pengimbas tidak sepadan.");
console.log(
  "ClamAV accepted the benign fixture and detected the standard EICAR fixture.",
);
