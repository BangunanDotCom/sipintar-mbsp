import "dotenv/config";
import { randomUUID } from "node:crypto";
import { buildApp } from "../apps/api/src/app.js";
import { totp } from "../apps/api/src/auth.js";
import { db } from "../apps/api/src/core.js";
import {
  inspectDemoHost,
  isPersonalDemoDatabase,
} from "../apps/api/src/demo-host-config.mjs";
import { fixtureEnvironment, PreflightError } from "./uat-preflight-config.js";
import { readTrainingKit } from "./uat-preflight-kit.js";

async function stageExamples() {
  const [directory] = process.argv.slice(2);
  const { failures, database, origin } = inspectDemoHost();
  if (
    !directory ||
    process.argv.length !== 3 ||
    failures.length ||
    !origin ||
    !isPersonalDemoDatabase(database)
  )
    throw new PreflightError(
      "Gunakan konfigurasi Personal Demo yang lengkap dan direktori kit privat.",
    );

  type DraftState = {
    draftVersion: number;
    latest: { id: string } | null;
    ready: boolean;
    declaration: { version: string };
    policyFingerprint: string;
  };
  const kit = await readTrainingKit(directory, fixtureEnvironment());
  const app = await buildApp();
  const sessions: Record<string, string>[] = [];
  const portal = "/api/synthetic-portal";
  type Account = (typeof kit.accounts)[number];
  async function submitPost(
    url: string,
    data: object,
    headers: Record<string, string> = { origin: origin! },
  ) {
    const response = await app.inject({
      method: "POST",
      url,
      payload: data,
      headers,
    });
    if (response.statusCode !== 200)
      throw new PreflightError(
        `Langkah penyediaan latihan ditolak (HTTP ${response.statusCode}). Gunakan DB latihan baharu sebelum mengulang penyediaan.`,
      );
    return response;
  }

  async function login(label: Account["label"]) {
    const { email, password, role, mfaSecretBase32 } = kit.accounts.find(
      (item) => item.label === label,
    )!;
    const response = await submitPost("/api/auth/login", { email, password });
    const cookie = response.cookies.find((item) => item.name === "staylink")!;
    const headers = {
      origin: origin!,
      cookie: `staylink=${cookie.value}`,
      "x-csrf-token": response.json<{ csrf: string }>().csrf,
    };
    sessions.push(headers);
    if (mfaSecretBase32) {
      await submitPost(
        "/api/auth/mfa/verify",
        { code: totp(mfaSecretBase32).generate() },
        headers,
      );
    }
    await submitPost("/api/auth/role", { roleId: role }, headers);
    return headers;
  }

  async function draftState(url: string, headers: Record<string, string>) {
    const response = await app.inject({ method: "GET", url, headers });
    if (response.statusCode !== 200)
      throw new PreflightError(
        "Draf contoh tidak tersedia kepada pemohon latihan.",
      );
    return response.json<DraftState>();
  }

  try {
    const applicant = await login("pemohon");
    const drafts = [];
    for (const id of [
      "single-unit",
      "multiple-units",
      "district-spt",
      "district-sps",
    ] as const) {
      const fixture = kit.scenarios.find((item) => item.id === id)!;
      const url = `${portal}/drafts/${fixture.draftPath.split("/")[3]}`;
      const state = await draftState(url, applicant);
      if (state.latest || state.draftVersion !== 1)
        throw new PreflightError(
          "Contoh memerlukan draf asal. Gunakan DB latihan baharu untuk reset.",
        );
      drafts.push({ id, url, version: state.draftVersion });
    }
    const pic = await login("pic-spu");
    for (const { id, url, version } of drafts) {
      await submitPost(
        `${url}/evidence`,
        { version, verdict: "CLEAN" },
        applicant,
      );
      const state = await draftState(url, applicant);
      if (!state.ready)
        throw new PreflightError(
          "Bukti latihan tidak memenuhi polisi sintetik.",
        );
      const response = await submitPost(
        `${url}/submit`,
        {
          version: state.draftVersion,
          key: randomUUID(),
          accepted: true,
          declarationVersion: state.declaration.version,
          policyFingerprint: state.policyFingerprint,
          previousId: null,
        },
        applicant,
      );
      if (id === "multiple-units") {
        await submitPost(
          `${portal}/reviews/${response.json<{ id: string }>().id}`,
          {
            action: "REQUEST_CORRECTION",
            version: 1,
            reason:
              "Latihan sahaja. Kemas kini ringkasan permohonan dan hantar semula.",
          },
          pic,
        );
      }
    }
    console.log(
      "Sedia · tiga serahan untuk semakan daerah dan satu permohonan untuk pembetulan.",
    );
  } finally {
    try {
      for (const headers of sessions) {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/logout",
          headers,
        });
        if (response.statusCode !== 200) {
          console.error(
            "Sesi persediaan latihan gagal ditutup. Tahan serahan kit.",
          );
          process.exitCode = 1;
        }
      }
    } finally {
      await app.close();
    }
  }
}

try {
  await stageExamples();
} catch (error) {
  console.error(
    error instanceof PreflightError
      ? error.message
      : "Penyediaan contoh gagal. Semak konfigurasi sintetik dan sediakan DB latihan baharu.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
