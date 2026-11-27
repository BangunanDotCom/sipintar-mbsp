import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { decrypt } from "../../apps/api/src/core.js";

type Table = { name: string; columns: string[]; rows: (string | null)[][] };

async function load(path: string) {
  const handle = await open(path, "r");
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > 64 * 1024 * 1024
    )
      throw Error("Use private Oracle lab snapshots up to 64 MiB.");
    const value = JSON.parse(await handle.readFile("utf8")) as {
      checksum: string;
      snapshot: { format: string; source: string; tables: Table[] };
    };
    if (
      value.snapshot.format !== "stl-oracle-lab-001" ||
      !/^STL_LAB_[A-Z][A-Z0-9_]{0,19}$/.test(value.snapshot.source)
    )
      throw Error("Expected an Oracle synthetic lab snapshot.");
    return value;
  } finally {
    await handle.close();
  }
}

const [, , beforePath, afterPath] = process.argv;
if (
  process.env.STAYLINK_VERIFY_SYNTHETIC_RESTORE !== "true" ||
  process.argv.length !== 4
)
  throw Error(
    "Enable the synthetic restore verification and supply source and restored snapshots.",
  );

const [before, after] = await Promise.all([load(beforePath), load(afterPath)]);
if (
  before.checksum !== after.checksum ||
  before.checksum !==
    createHash("sha256")
      .update(JSON.stringify(before.snapshot.tables))
      .digest("hex") ||
  JSON.stringify(before.snapshot.tables) !==
    JSON.stringify(after.snapshot.tables)
)
  throw Error("The source and restored records differ.");

function table(name: string) {
  const row = after.snapshot.tables.find(
    (candidate) => candidate.name === name,
  );
  if (!row) throw Error("Required table missing from the snapshot.");
  return row;
}
function col(row: Table, name: string) {
  const index = row.columns.indexOf(name);
  if (index < 0) throw Error("Required column missing from the snapshot.");
  return index;
}

const delegation = table("STL_DELEGATION_DOCUMENTS");
const bytes = col(delegation, "CONTENT");
const sha256 = col(delegation, "SHA256");
const verdict = col(delegation, "SCAN_STATUS");
let matched = 0;
let legacyMismatch = 0;
for (const row of delegation.rows) {
  const digest = createHash("sha256")
    .update(Buffer.from(row[bytes] ?? "", "base64"))
    .digest("hex");
  if (digest === row[sha256]) matched++;
  else if (row[verdict] === "LEGACY") legacyMismatch++;
  else throw Error("Stored non-legacy PDF does not match its SHA-256.");
}

let mfaVerified = false;
const email = process.env.STAYLINK_VERIFY_SYNTHETIC_MFA_EMAIL;
if (email) {
  if (!email.endsWith("@example.test"))
    throw Error("MFA probe requires a synthetic account.");
  const users = table("STL_USERS");
  const user = users.rows.find((row) => row[col(users, "EMAIL")] === email);
  const factors = table("STL_MFA_FACTORS");
  const factor = factors.rows.find(
    (row) => row[col(factors, "USER_ID")] === user?.[col(users, "ID")],
  );
  const ciphertext = factor?.[col(factors, "ENCRYPTED_SECRET")];
  if (!ciphertext || !/^[A-Z2-7]{16,64}$/.test(decrypt(ciphertext)))
    throw Error("The restored synthetic MFA secret could not be decrypted.");
  mfaVerified = true;
}

console.log(
  JSON.stringify({
    tables: after.snapshot.tables.length,
    delegationDigestsMatched: matched,
    legacyDigestsMismatched: legacyMismatch,
    financialEntries: table("STL_SYNTH_FINANCIAL_ENTRIES").rows.length,
    outboxEntries: table("STL_TRAINING_REMINDER_OUTBOX").rows.length,
    mfaVerified,
  }),
);
