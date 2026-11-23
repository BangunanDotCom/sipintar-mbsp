import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import { scenarios } from "./uat-feedback-model.js";
import {
  PreflightError,
  type fixtureEnvironment,
} from "./uat-preflight-config.js";

export const personas = [
  { role: "PEMOHON", district: null, label: "pemohon" },
  { role: "PIC_KAWASAN", district: "SPU", label: "pic-spu" },
  { role: "PPSK", district: "SPU", label: "ppsk" },
  { role: "PIC_KAWASAN", district: "SPT", label: "pic-spt" },
] as const;

const account = z.object({
  label: z.enum(["pemohon", "pic-spu", "ppsk", "pic-spt"]),
  role: z.enum(["PEMOHON", "PIC_KAWASAN", "PPSK"]),
  id: z.uuid(),
  email: z
    .string()
    .regex(/^uat-[a-f0-9]{12}-(?:pemohon|pic-spu|ppsk|pic-spt)@example\.test$/),
  password: z.string().regex(/^Aa1![a-f0-9]{36}$/),
  mfaSecretBase32: z
    .string()
    .regex(/^[A-Z2-7]{32}$/)
    .nullable(),
});
const manifestSchema = z.strictObject({
  database: z.string(),
  version: z.string(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
const kitSchema = z.object({
  accounts: z.array(account).length(personas.length),
  scenarios: z
    .array(
      z.object({
        id: z.enum(scenarios),
        draftPath: z
          .string()
          .regex(
            /^\/permohonan\/draf\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/semakan$/,
          ),
        feeSen: z.number().optional(),
      }),
    )
    .length(scenarios.length),
});

export async function readTrainingKit(
  path: string,
  expected: ReturnType<typeof fixtureEnvironment>,
  env: NodeJS.ProcessEnv = process.env,
) {
  const directory = resolve(path);
  async function readPrivate(name: string) {
    const file = await open(
      join(directory, name),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await file.stat();
      if (
        !info.isFile() ||
        info.uid !== process.getuid?.() ||
        (info.mode & 0o777) !== 0o600 ||
        info.nlink !== 1
      )
        throw new PreflightError(
          "Fail kit mesti dimiliki pengendali dan berizin 0600.",
        );
      const content = Buffer.alloc(16_385);
      const { bytesRead } = await file.read(content, 0, content.length);
      if (bytesRead === content.length)
        throw new PreflightError("Fail kit melebihi had saiz.");
      return content.toString("utf8", 0, bytesRead);
    } finally {
      await file.close();
    }
  }

  try {
    const root = await realpath(tmpdir());
    const info = await lstat(directory);
    if (
      dirname(directory) !== root ||
      !basename(directory).startsWith("staylink-uat-") ||
      !info.isDirectory() ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o777) !== 0o700
    )
      throw new PreflightError(
        "Gunakan direktori kit persendirian berizin 0700 di bawah TMPDIR.",
      );
    const manifest = manifestSchema.parse(
      JSON.parse(await readPrivate("preflight.json")),
    );
    if (manifest.database !== expected.database)
      throw new PreflightError("Kit latihan terikat pada pangkalan data lain.");
    if (
      manifest.version !== expected.version ||
      manifest.fingerprint !== expected.fingerprint
    )
      throw new PreflightError(
        "Versi atau cap jari polisi berubah selepas kit dijana. Gunakan sesi baharu.",
      );
    const kit = kitSchema.parse(JSON.parse(await readPrivate("accounts.json")));
    if (
      new Set(kit.accounts.map(({ id }) => id)).size !== personas.length ||
      new Set(kit.accounts.map(({ email }) => email)).size !==
        personas.length ||
      new Set(kit.scenarios.map(({ id }) => id)).size !== scenarios.length ||
      new Set(kit.scenarios.map(({ draftPath }) => draftPath)).size !==
        scenarios.length ||
      !personas.every(({ label, role, district }) =>
        kit.accounts.some(
          (item) =>
            item.label === label &&
            item.role === role &&
            item.email.endsWith(`-${label}@example.test`) &&
            (item.mfaSecretBase32 !== null) === Boolean(district),
        ),
      )
    )
      throw new PreflightError(
        "Kit memerlukan empat akaun berasingan dan enam draf unik.",
      );

    const bindings = {
      STAYLINK_SYNTHETIC_PORTAL: "true",
      STAYLINK_SYNTHETIC_DISTRICT: "SPU",
      STAYLINK_SYNTHETIC_PIC_ID: kit.accounts.find(
        ({ label }) => label === "pic-spu",
      )!.id,
      STAYLINK_SYNTHETIC_SUPERVISOR_ID: kit.accounts.find(
        ({ label }) => label === "ppsk",
      )!.id,
      STAYLINK_SYNTHETIC_CALLBACK_KEY: env.STAYLINK_SYNTHETIC_CALLBACK_KEY,
    };
    const entries = Object.entries(bindings);
    if (
      !/^[a-f0-9]{64}$/.test(bindings.STAYLINK_SYNTHETIC_CALLBACK_KEY ?? "") ||
      entries.some(([key, value]) => env[key] !== value) ||
      (await readPrivate("portal.env")) !==
        entries.map(([key, value]) => `export ${key}=${value}\n`).join("")
    )
      throw new PreflightError(
        "Padankan konfigurasi portal latihan dengan portal.env kit dan kunci callback tiruan.",
      );
    return kit;
  } catch (error) {
    if (error instanceof PreflightError) throw error;
    throw new PreflightError(
      "Kit tidak boleh dibaca atau formatnya tidak sah. Semak direktori dan fail persendirian.",
    );
  }
}
