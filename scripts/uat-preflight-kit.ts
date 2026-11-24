import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import { isPersonalDemoDatabase } from "../apps/api/src/demo-host-config.mjs";
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

export const isTrainingApplicant = (role: string) =>
  role === "PEMOHON" || role === "WAKIL_SYARIKAT";

export const trainingPersonas = (database: string) =>
  database.startsWith("staylink_issue62_")
    ? ([
        ...personas,
        { role: "WAKIL_SYARIKAT", district: null, label: "wakil" },
        { role: "PENTADBIR_ICT", district: null, label: "pentadbir" },
        ...(isPersonalDemoDatabase(database)
          ? ([
              { role: "PIC_KAWASAN", district: "SPS", label: "pic-sps" },
            ] as const)
          : []),
      ] as const)
    : personas;

export function privatePermissions(
  path: string,
  info: { uid: number; mode: number },
  mode: number,
) {
  if (process.platform !== "win32")
    return info.uid === process.getuid?.() && (info.mode & 0o777) === mode;
  // Windows uses a private inherited ACL instead of POSIX mode bits.
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `
      $ErrorActionPreference = 'Stop'
      $path = $env:STAYLINK_CHECK_ACL
      if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 1 }
      $acl = Get-Acl -LiteralPath $path
      $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
      $allowed = @($owner, 'S-1-5-18', 'S-1-5-32-544')
      if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $allowed) { exit 1 }
      foreach ($ace in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        if ($ace.AccessControlType -eq 'Allow' -and $ace.IdentityReference.Value -notin $allowed) { exit 1 }
      }
    `,
      ],
      {
        env: { ...process.env, STAYLINK_CHECK_ACL: path },
        stdio: "ignore",
        timeout: 5000,
      },
    );
    return true;
  } catch {
    return false;
  }
}

export async function trainingTempRoot() {
  const root = await realpath(tmpdir());
  if (
    process.platform === "win32" &&
    !privatePermissions(root, await lstat(root), 0o700)
  )
    throw new PreflightError(
      "Tetapkan TEMP dan TMP kepada direktori Windows dengan ACL latihan terhad.",
    );
  return root;
}

export const personalScenarios = [...scenarios, "district-sps"] as const;
export const trainingScenarios = (database: string) =>
  isPersonalDemoDatabase(database) ? personalScenarios : scenarios;

const account = z.object({
  label: z.enum([
    "pemohon",
    "pic-spu",
    "ppsk",
    "pic-spt",
    "pic-sps",
    "wakil",
    "pentadbir",
  ]),
  role: z.enum([
    "PEMOHON",
    "PIC_KAWASAN",
    "PPSK",
    "WAKIL_SYARIKAT",
    "PENTADBIR_ICT",
  ]),
  id: z.uuid(),
  email: z
    .string()
    .regex(
      /^uat-[a-f0-9]{12}-(?:pemohon|pic-spu|ppsk|pic-spt|pic-sps|wakil|pentadbir)@example\.test$/,
    ),
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
  loginUrl: z.url().optional(),
  accounts: z.array(account).max(7),
  scenarios: z
    .array(
      z.object({
        id: z.enum(personalScenarios),
        draftPath: z
          .string()
          .regex(
            /^\/permohonan\/draf\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/semakan$/,
          ),
        feeSen: z.number().optional(),
      }),
    )
    .max(personalScenarios.length),
});

export async function readTrainingKit(
  path: string,
  expected: ReturnType<typeof fixtureEnvironment>,
  env: NodeJS.ProcessEnv = process.env,
) {
  const directory = resolve(path);
  const people = trainingPersonas(expected.database);
  const cases = trainingScenarios(expected.database);
  const personal = isPersonalDemoDatabase(expected.database);
  async function readPrivate(name: string) {
    const path = join(directory, name);
    if (!(await lstat(path)).isFile())
      throw new PreflightError("Kit tidak boleh dibaca melalui pautan.");
    const file = await open(
      path,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
    try {
      const info = await file.stat();
      if (
        !info.isFile() ||
        !privatePermissions(path, info, 0o600) ||
        info.nlink !== 1
      )
        throw new PreflightError(
          "Fail kit mesti persendirian (0600 atau ACL Windows terhad).",
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
    const root = await trainingTempRoot();
    const info = await lstat(directory);
    if (
      dirname(directory) !== root ||
      !basename(directory).startsWith("staylink-uat-") ||
      !info.isDirectory() ||
      !privatePermissions(directory, info, 0o700)
    )
      throw new PreflightError(
        "Gunakan direktori kit persendirian di bawah direktori sementara (0700 atau ACL Windows terhad).",
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
      kit.accounts.length !== people.length ||
      new Set(kit.accounts.map(({ id }) => id)).size !== people.length ||
      new Set(kit.accounts.map(({ email }) => email)).size !== people.length ||
      new Set(kit.accounts.map(({ password }) => password)).size !==
        people.length ||
      (personal && kit.loginUrl !== `${env.APP_ORIGIN}/log-masuk`) ||
      kit.scenarios.length !== cases.length ||
      !cases.every((id) => kit.scenarios.some((item) => item.id === id)) ||
      new Set(kit.scenarios.map(({ id }) => id)).size !== cases.length ||
      new Set(kit.scenarios.map(({ draftPath }) => draftPath)).size !==
        cases.length ||
      !people.every(({ label, role }) =>
        kit.accounts.some(
          (item) =>
            item.label === label &&
            item.role === role &&
            item.email.endsWith(`-${label}@example.test`) &&
            (item.mfaSecretBase32 === null) === isTrainingApplicant(role),
        ),
      )
    )
      throw new PreflightError(
        "Kit memerlukan akaun peranan berasingan dan enam draf unik.",
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
      ...(personal && {
        STAYLINK_PERSONAL_PIC_SPT_ID: kit.accounts.find(
          ({ label }) => label === "pic-spt",
        )!.id,
        STAYLINK_PERSONAL_PIC_SPS_ID: kit.accounts.find(
          ({ label }) => label === "pic-sps",
        )!.id,
      }),
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
