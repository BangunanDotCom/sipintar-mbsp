import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("applicant can open the closed training case and download both decision letters", async ({
  page,
}) => {
  const kitPath = process.env.STAYLINK_COMPLETION_KIT_FILE;
  test.skip(!kitPath);
  const kit = JSON.parse(await readFile(kitPath!, "utf8")) as {
    accounts: { label: string; email: string; password: string }[];
    scenarios: { id: string; draftPath: string }[];
  };
  const applicant = kit.accounts.find(({ label }) => label === "pemohon")!;
  const fixture = kit.scenarios.find(({ id }) => id === "single-unit")!;
  await page.goto("/log-masuk");
  await page.getByLabel(/E-mel/i).fill(applicant.email);
  await page.getByLabel(/^Kata laluan$/i).fill(applicant.password);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/auth/login") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Log masuk$/i }).click();
  expect((await response).status()).toBe(200);
  const session = await page.request.get("/api/auth/me");
  const data = await session.json();
  if (data.activeRole !== "PEMOHON") {
    const headers = {
      Origin: new URL(page.url()).origin,
      "X-CSRF-Token": data.csrf,
    };
    expect(
      (
        await page.request.post("/api/auth/role", {
          headers,
          data: { roleId: "PEMOHON" },
        })
      ).status(),
    ).toBe(200);
  }
  await page.goto(fixture.draftPath);
  await expect(page.getByText("Ditutup dalam simulasi")).toBeVisible();
  await expect(
    page.getByText(/Invois kedua tiruan.*Direkonsiliasi/),
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Muat turun surat induk LATIHAN v1" })
    .click();
  expect((await pending).suggestedFilename()).toBe("staylink-latihan-v1.txt");
  const pdf = page.waitForEvent("download");
  await page.getByRole("link", { name: "PDF susulan LATIHAN v2" }).click();
  expect((await pdf).suggestedFilename()).toBe("staylink-latihan-v2.pdf");
  await expect(
    page.getByRole("link", { name: "Muat turun surat susulan LATIHAN v2" }),
  ).toBeVisible();
});

test("PPSK filters and downloads the district summary with MFA", async ({
  page,
  baseURL,
}) => {
  const kitPath = process.env.STAYLINK_COMPLETION_KIT_FILE;
  test.skip(!kitPath);
  test.setTimeout(75_000);
  const { totp } = await import("../../apps/api/src/auth");
  const kit = JSON.parse(await readFile(kitPath!, "utf8")) as {
    accounts: {
      label: string;
      email: string;
      password: string;
      mfaSecretBase32: string;
    }[];
    scenarios?: { submissionId?: string }[];
  };
  const officer = kit.accounts.find(({ label }) => label === "ppsk")!;
  const login = await page.request.post("/api/auth/login", {
    data: { email: officer.email, password: officer.password },
  });
  expect(login.status()).toBe(200);
  const session = await login.json();
  const headers = {
    Origin: new URL(baseURL!).origin,
    "X-CSRF-Token": session.csrf,
  };
  expect(
    (
      await page.request.get(
        "/api/synthetic-portal/completion/queue?format=csv",
      )
    ).status(),
  ).toBe(403);
  // The packaged job uses this PPSK account in its API suite immediately before
  // Playwright. Use a fresh TOTP time step so the replay guard stays enforced.
  const untilNextStep = 30_000 - (Date.now() % 30_000);
  await new Promise((resolve) => setTimeout(resolve, untilNextStep + 100));

  expect(
    (
      await page.request.post("/api/auth/mfa/verify", {
        headers,
        data: { code: totp(officer.mfaSecretBase32).generate() },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/auth/role", {
        headers,
        data: { roleId: "PPSK" },
      })
    ).status(),
  ).toBe(200);

  await page.goto("/dashboard");
  const queue = page
    .getByRole("heading", { name: "Tugasan keputusan latihan" })
    .locator("..");
  await expect(queue).toBeVisible();
  await queue.getByLabel("Status kes latihan").selectOption("closed");
  await expect(queue.getByText(/[1-9]\d* ditutup/)).toBeVisible();
  const download = page.waitForEvent("download");
  await queue
    .getByRole("link", { name: "Muat turun ringkasan daerah CSV" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "staylink-latihan-SPU-closed.csv",
  );
  await page.getByText("Arkib kes latihan ditutup", { exact: true }).click();
  await expect(
    page.getByText("SPU · Halaman 1", { exact: true }),
  ).toBeVisible();
  const id = kit.scenarios?.[0]?.submissionId;
  const card = id
    ? page.getByRole("article", { name: "Serahan sintetik " + id })
    : page;
  if (process.env.STAYLINK_COMPLETION_PARITY_BROWSER === "true") {
    await expect(card.getByText(/^BKT latihan diterima/)).toBeVisible();
    await card
      .getByText("Jadual konsolidasi teknikal latihan", { exact: true })
      .click();
    await expect(
      card.getByText(/Ulasan semasa.*Semakan susulan selesai/),
    ).toBeVisible();
    await expect(
      card.getByText(/Snapshot Kertas Pertimbangan v/),
    ).toBeVisible();
    await card
      .getByText("Sejarah versi ulasan teknikal", { exact: true })
      .click();
    await expect(
      card.getByText(/PERANCANG_BANDAR.*Diserah.*Semakan perancang/).first(),
    ).toBeVisible();
    await expect(
      card.getByText(/KEJURUTERAAN.*Diserah.*Semakan kejuruteraan/),
    ).toBeVisible();
    await expect(card.getByText(/— SK$/)).toHaveCount(3);
    await expect(card.getByText(/— TOLAK$/)).toBeVisible();
  }
  await card.getByText("Lejar kewangan latihan", { exact: true }).click();
  await expect(card.getByText(/Peringkat 1 · Resit · 5000 sen/)).toBeVisible();
  await expect(
    card.getByText("Catatan belum dipindah: 0. Percanggahan: 0."),
  ).toBeVisible();
  if (process.env.STAYLINK_SYNTHETIC_RECORDS === "true") {
    await card
      .getByText("Daftar kawalan rekod latihan", { exact: true })
      .click();
    if (process.env.STAYLINK_COMPLETION_PARITY_BROWSER === "true") {
      const state = card.getByText(/^(Rekod ditahan|Tiada tahanan rekod)$/);
      await expect(state).toBeVisible();
      if ((await state.textContent()) === "Tiada tahanan rekod") {
        await card
          .getByLabel("Sebab tindakan rekod")
          .fill("Pengesahan kawalan rekod melalui pelayar");
        await card
          .getByRole("button", { name: "Letak tahanan rekod latihan" })
          .click();
      }
    }
    await expect(
      card.getByText("Rekod ditahan", { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByText("Permohonan buka semula direkodkan. Kes kekal ditutup."),
    ).toBeVisible();
  }
});

for (const assignment of [
  "PIC_KAWASAN",
  "PIC_KAWASAN_SPT",
  "PERANCANG_BANDAR",
  "KEJURUTERAAN",
  "URUS_SETIA_JK",
  "PEGAWAI_PENANDATANGAN",
]) {
  test(`training dashboard requires MFA and respects the ${assignment} assignment`, async ({
    page,
    baseURL,
  }) => {
    const kitPath = process.env.STAYLINK_COMPLETION_KIT_FILE;
    test.skip(
      !kitPath || process.env.STAYLINK_COMPLETION_PARITY_BROWSER !== "true",
    );
    const { totp } = await import("../../apps/api/src/auth");
    const { accounts } = JSON.parse(await readFile(kitPath!, "utf8")) as {
      accounts: {
        label: string;
        email: string;
        password: string;
        mfaSecretBase32: string;
      }[];
    };
    const { email, password, mfaSecretBase32 } = accounts.find(
      ({ label }) => label === assignment,
    )!;
    const login = await page.request.post("/api/auth/login", {
      data: { email, password },
    });
    expect(login.status()).toBe(200);
    const headers = {
      Origin: new URL(baseURL!).origin,
      "X-CSRF-Token": (await login.json()).csrf,
    };
    const queue = "/api/synthetic-portal/completion/queue";
    expect((await page.request.get(queue)).status()).toBe(403);
    expect(
      (
        await page.request.post("/api/auth/mfa/verify", {
          headers,
          data: { code: totp(mfaSecretBase32).generate() },
        })
      ).status(),
    ).toBe(200);
    const roleId =
      assignment === "PIC_KAWASAN_SPT" ? "PIC_KAWASAN" : assignment;
    expect(
      (
        await page.request.post("/api/auth/role", { headers, data: { roleId } })
      ).status(),
    ).toBe(200);
    const wrongDistrict = assignment === "PIC_KAWASAN_SPT";
    expect((await page.request.get(queue)).status()).toBe(
      wrongDistrict ? 404 : 200,
    );
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /^Selamat datang/ }),
    ).toBeVisible();
    const completion = page.getByRole("heading", {
      name: "Tugasan keputusan latihan",
    });
    if (wrongDistrict) await expect(completion).toHaveCount(0);
    else await expect(completion).toBeVisible();
  });
}
