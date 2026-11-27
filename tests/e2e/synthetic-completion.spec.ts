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

for (const { role, label, wrongDistrict } of [
  { role: "PIC_KAWASAN", label: "pic-spu", wrongDistrict: false },
  { role: "PIC_KAWASAN", label: "pic-spt", wrongDistrict: true },
  { role: "PIC_KAWASAN", label: "pic-sps", wrongDistrict: true },
  { role: "PERANCANG_BANDAR", label: "perancang", wrongDistrict: false },
  { role: "KEJURUTERAAN", label: "kejuruteraan", wrongDistrict: false },
  { role: "URUS_SETIA_JK", label: "urus-setia", wrongDistrict: false },
  {
    role: "PEGAWAI_PENANDATANGAN",
    label: "penandatangan",
    wrongDistrict: false,
  },
]) {
  test(`training dashboard requires MFA and respects the ${label} assignment`, async ({
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
      (account) => account.label === label,
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
    const roleId = role;
    expect(
      (
        await page.request.post("/api/auth/role", { headers, data: { roleId } })
      ).status(),
    ).toBe(200);
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

test("officers complete a registered case through the browser", async ({
  browser,
}) => {
  const filename = process.env.STAYLINK_COMPLETION_KIT_FILE;
  test.skip(
    !filename || process.env.STAYLINK_COMPLETION_PARITY_UI_FLOW !== "true",
  );
  test.setTimeout(150_000);
  const { totp } = await import("../../apps/api/src/auth");
  const kit = JSON.parse(await readFile(filename!, "utf8")) as {
    accounts: {
      label: string;
      role: string;
      email: string;
      password: string;
      mfaSecretBase32?: string;
    }[];
    scenarios: { submissionId: string; draftPath: string }[];
  };
  expect(kit.accounts).toHaveLength(11);
  const { submissionId, draftPath } = kit.scenarios[0];
  const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  async function login(label: string) {
    const account = kit.accounts.find((item) => item.label === label)!;
    const context = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        "x-staylink-demo-client": "192.0.2." + (contexts.length + 1),
      },
    });
    context.setDefaultTimeout(12_000);
    contexts.push(context);
    const page = await context.newPage();
    await page.goto("/log-masuk");
    await page.getByLabel(/E-mel/i).fill(account.email);
    await page.getByLabel(/^Kata laluan$/i).fill(account.password);
    const signedIn = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^Log masuk$/i }).click();
    expect((await signedIn).status()).toBe(200);
    await page.goto("/dashboard");
    if (account.mfaSecretBase32) {
      await page
        .getByLabel("Kod pengesah 6 digit")
        .fill(totp(account.mfaSecretBase32).generate());
      const verified = page.waitForResponse((response) =>
        response.url().endsWith("/api/auth/mfa/verify"),
      );
      await page
        .getByRole("button", { name: "Sahkan MFA", exact: true })
        .click();
      expect((await verified).status()).toBe(200);
      const select = page.getByLabel("Peranan aktif");
      const recovery = page.getByRole("button", {
        name: "Saya telah menyimpan kod",
      });
      await expect(select.or(recovery)).toBeVisible();
      if (await recovery.isVisible()) await recovery.click();
    }
    const control = page.getByLabel("Peranan aktif");
    await control.selectOption(account.role);
    await expect(
      page.getByRole("heading", { name: /^Selamat datang/ }),
    ).toBeVisible();
    return page;
  }

  type Page = Awaited<ReturnType<typeof login>>;
  type Locator = ReturnType<Page["getByText"]>;
  function caseCard(page: Page, manager = false) {
    return manager
      ? page.getByRole("article", { name: "Serahan sintetik " + submissionId })
      : page
          .locator("section.company-record")
          .filter({ has: page.getByText(submissionId, { exact: true }) });
  }
  async function act(page: Page, button: Locator) {
    await expect(button).toBeEnabled();
    const result = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith("/api/synthetic-portal/completion/" + submissionId) &&
        response.request().method() === "POST",
    );
    await button.click();
    const response = await result;
    expect(response.status(), await response.text()).toBe(200);
  }
  async function note(page: Page, card: Locator, label: string, text: string) {
    const input = card.getByRole("textbox", { name: label, exact: true });
    await input.fill(text);
    await act(
      page,
      card
        .getByRole("form", { name: label, exact: true })
        .getByRole("button", { name: "Rekod tindakan latihan" }),
    );
  }

  try {
    const council = await login("urus-setia");
    await note(
      council,
      caseCard(council),
      "Catatan penerimaan BKT latihan",
      "BKT latihan disahkan melalui pelayar.",
    );
    const pic = await login("pic-spu");
    const review = caseCard(pic, true);
    await act(
      pic,
      review.getByRole("button", { name: "Rujuk Perancang dan Kejuruteraan" }),
    );
    const planning = await login("perancang");
    const engineering = await login("kejuruteraan");
    for (const [page, comment] of [
      [planning, "Ulasan perancang lengkap."],
      [engineering, "Ulasan kejuruteraan lengkap."],
    ] as const) {
      // Each department opens the latest case version before writing.
      await page.reload();
      const card = caseCard(page);
      await act(
        page,
        card.getByRole("button", { name: "Sahkan penerimaan tugas latihan" }),
      );
      await note(page, card, "Ulasan umum jabatan", comment);
    }
    await pic.reload();
    await note(
      pic,
      review,
      "Sebab pulang ulasan Perancang Bandar",
      "Kemas kini ulasan perancang latihan.",
    );
    await planning.reload();
    await note(
      planning,
      caseCard(planning),
      "Ulasan umum jabatan",
      "Ulasan pindaan perancang lengkap.",
    );
    await pic.reload();
    await note(
      pic,
      review,
      "Ringkasan Kertas Pertimbangan",
      "Kertas latihan disahkan selepas ulasan pindaan.",
    );
    await council.reload();
    const decisions = caseCard(council);
    const decisionButton = decisions.getByRole("button", {
      name: "Rekod keputusan mesyuarat latihan",
    });
    const form = decisions.locator("form").filter({
      has: council.getByRole("button", {
        name: "Rekod keputusan mesyuarat latihan",
      }),
    });
    const outcomes = form.getByRole("combobox");
    await expect(outcomes).toHaveCount(4);
    for (let index = 0; index < 4; index++) {
      await outcomes.nth(index).selectOption(index ? "TOLAK" : "SK");
      await form
        .getByRole("textbox")
        .nth(index)
        .fill("Keputusan mesyuarat sintetik.");
    }
    await act(council, decisionButton);
    const signer = await login("penandatangan");
    await act(
      signer,
      caseCard(signer).getByRole("button", {
        name: "Tandatangan secara simulasi",
      }),
    );
    const ppsk = await login("ppsk");
    const registered = caseCard(ppsk, true);
    for (const name of [
      "Jana invois kedua tiruan",
      "Simulasi rekonsiliasi kedua",
      "Tutup permohonan latihan",
    ])
      await act(ppsk, registered.getByRole("button", { name }));
    await expect(registered.getByText("Ditutup dalam simulasi")).toBeVisible();
    const applicant = await login("pemohon");
    await applicant.goto(draftPath);
    const download = applicant.waitForEvent("download");
    await applicant.getByRole("link", { name: "PDF induk LATIHAN v1" }).click();
    expect((await download).suggestedFilename()).toBe(
      "staylink-latihan-v1.pdf",
    );
    for (const label of ["wakil", "pentadbir", "pic-spt", "pic-sps"])
      await login(label);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
