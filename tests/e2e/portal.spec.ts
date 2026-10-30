import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { totp } from "../../apps/api/src/auth";
async function activationLink(email: string) {
  const list: any = await fetch(
    "http://localhost:8025/api/v1/messages?limit=200",
  ).then((r) => r.json());
  const message = list.messages.find((m: any) =>
    m.To.some((x: any) => x.Address === email),
  );
  expect(message).toBeTruthy();
  const detail: any = await fetch(
    `http://localhost:8025/api/v1/message/${message.ID}`,
  ).then((r) => r.json());
  return detail.Text.trim();
}
// Exercise form/auth/draft behavior without fetching community map tiles in automation.
// Provider rendering is covered by maps.spec.ts fixtures; review captures use a separate real-network run.
test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
});
test("portal desktop navigation, FAQ and honest future module state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Perkhidmatan pintar. Urusan lebih terhubung.",
    }),
  ).toBeVisible();
  await page
    .locator(".hero-actions")
    .getByRole("link", { name: "Permohonan Baharu" })
    .click();
  await expect(page).toHaveURL(/\/log-masuk\?next=%2Fpermohonan%2Fbaharu$/);
  await expect(
    page.getByRole("heading", { name: "Selamat kembali." }),
  ).toBeVisible();
  await page.goto("/");
  await page
    .locator(".hero-actions")
    .getByRole("link", { name: "Log Masuk Pegawai" })
    .click();
  await expect(page).toHaveURL(/\/log-masuk$/);
  await expect(
    page.getByRole("heading", { name: "Selamat kembali." }),
  ).toBeVisible();
  await page.goto("/");
  await page.getByText("Siapakah yang boleh mendaftar akaun?").click();
  await expect(
    page.getByText("Individu yang ingin mewakili syarikat boleh"),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Semak Status", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Akan Tersedia Dalam Fasa Seterusnya" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile menu, responsive layouts and readable forms", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Buka menu" }).click();
  await expect(
    page.getByRole("button", { name: "Tutup menu" }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Buka menu" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Buka menu" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.getByRole("button", { name: "Buka menu" }).click();
  await page
    .getByRole("link", { name: "Log Masuk", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Selamat kembali." }),
  ).toBeVisible();
  await expect(page.getByLabel("E-mel", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("registration, real email activation, login, role selection and company creation", async ({
  page,
}) => {
  const email = `e2e-${randomUUID()}@example.test`;
  const password = `Aa1!${randomBytes(24).toString("hex")}`;
  await page.goto("/daftar");
  await page
    .getByLabel("Nama penuh", { exact: true })
    .fill("DATA UJIAN Pelayar");
  await page
    .getByLabel("Nombor pengenalan (MyKad / pasport)", { exact: true })
    .fill(`UJIAN${randomBytes(6).toString("hex")}`);
  await page.getByLabel("E-mel", { exact: true }).fill(email);
  await page.getByLabel("Nombor telefon", { exact: true }).fill("0123456789");
  await page.getByLabel("Kata laluan", { exact: false }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Daftar Akaun" }).click();
  await expect(page.getByRole("status")).toContainText("Akaun didaftarkan");
  await page.goto(await activationLink(email));
  await page.getByRole("button", { name: "Sahkan Akaun" }).click();
  await expect(page.getByRole("status")).toContainText("Berjaya");
  await page.goto("/log-masuk");
  await page.getByLabel("E-mel", { exact: true }).fill(email);
  await page.getByLabel("Kata laluan", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log Masuk", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pilih peranan untuk meneruskan" }),
  ).toBeVisible();
  await page
    .getByLabel("Peranan aktif", { exact: true })
    .selectOption("PEMOHON");
  await expect(
    page.getByRole("heading", { name: "Selamat datang, DATA." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Syarikat & wakil" }).click();
  await page
    .getByLabel("Nama syarikat", { exact: true })
    .fill("DATA UJIAN Syarikat Pelayar");
  await page
    .getByLabel("Nombor pendaftaran SSM")
    .fill(`E2E${randomUUID().slice(0, 8)}`);
  await page
    .getByLabel("Alamat berdaftar")
    .fill("Alamat syarikat data ujian sahaja, Seberang Perai");
  await page.getByLabel("Telefon syarikat").fill("0123456789");
  await page.getByLabel("E-mel syarikat").fill("e2e-company@example.test");
  await page.getByRole("button", { name: "Tambah Syarikat" }).click();
  await expect(
    page.getByRole("heading", { name: "DATA UJIAN Syarikat Pelayar" }),
  ).toBeVisible();
  await expect(page.getByText("Perwakilan: Belum disahkan")).toBeVisible();
  await page.getByRole("button", { name: "Log keluar" }).click();
  await expect(page).toHaveURL(/log-masuk/);
});
test("officer invite, password activation, QR enrollment and MFA verification", async ({
  page,
  request,
}) => {
  // Provision through the authorized API using a local test administrator session.
  const { db, hash, token } = await import("../../apps/api/src/core");
  const raw = token(),
    csrf = token();
  const admin = await db.user.create({
    data: {
      name: "DATA UJIAN Admin E2E",
      email: `admin-e2e-${randomUUID()}@example.test`,
      phone: "0123456789",
      kind: "OFFICER",
      emailVerified: true,
      roles: {
        create: { roleId: "PENTADBIR_ICT", reference: "DATA UJIAN E2E" },
      },
    },
  });
  await db.session.create({
    data: {
      id: hash(raw),
      userId: admin.id,
      activeRole: "PENTADBIR_ICT",
      mfaVerified: true,
      csrfHash: hash(csrf),
      expiresAt: new Date(Date.now() + 300000),
    },
  });
  const email = `officer-e2e-${randomUUID()}@example.test`;
  const password = `Aa1!${randomBytes(24).toString("hex")}`;
  const invited = await request.post("/api/admin/officers", {
    headers: {
      cookie: `staylink=${raw}`,
      origin: "http://localhost:5173",
      "x-csrf-token": csrf,
    },
    data: {
      name: "DATA UJIAN Pegawai E2E",
      email,
      phone: "0123456789",
      roleId: "PIC_KAWASAN",
      departmentId: "BANGUNAN",
      districtId: "SPU",
      reference: "DATA UJIAN Pelantikan E2E",
    },
  });
  expect(invited.status()).toBe(201);
  await page.goto(await activationLink(email));
  await page.getByLabel("Kata laluan baharu").fill(password);
  await page.getByRole("button", { name: "Sahkan Akaun" }).click();
  await expect(page.getByRole("status")).toContainText("Berjaya");
  await page.goto("/log-masuk");
  await page.getByLabel("E-mel", { exact: true }).fill(email);
  await page.getByLabel("Kata laluan", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log Masuk", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pengesahan dua faktor" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Daftar MFA" }).click();
  await expect(page.getByAltText("Kod QR pendaftaran TOTP")).toBeVisible();
  const secret = await page.locator("code").textContent();
  await page.getByLabel("Kod pengesah 6 digit").fill(totp(secret!).generate());
  await page.getByRole("button", { name: "Sahkan MFA" }).click();
  await expect(
    page.getByRole("heading", { name: "Simpan kod pemulihan anda" }),
  ).toBeVisible();
  expect((await page.locator("pre").textContent())?.split("\n")).toHaveLength(
    8,
  );
  await page.getByRole("button", { name: "Saya telah menyimpan kod" }).click();
  await page
    .getByLabel("Peranan aktif", { exact: true })
    .selectOption("PIC_KAWASAN");
  await expect(
    page.getByRole("heading", { name: "Kawasan seliaan" }),
  ).toBeVisible();
  await db.$disconnect();
});

async function registerApplicant(
  page: any,
  email: string,
  name: string,
  password: string,
) {
  await page.goto("/daftar");
  await page.getByLabel("Nama penuh", { exact: true }).fill(name);
  await page
    .getByLabel("Nombor pengenalan (MyKad / pasport)", { exact: true })
    .fill(`UJIAN${randomBytes(6).toString("hex")}`);
  await page.getByLabel("Nombor telefon", { exact: true }).fill("0000000000");
  await page.getByLabel("E-mel", { exact: true }).fill(email);
  await page.getByLabel("Kata laluan", { exact: false }).fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Daftar Akaun" }).click();
  await expect(page.getByRole("status")).toContainText("Akaun didaftarkan");
  await page.goto(await activationLink(email));
  await page.getByRole("button", { name: "Sahkan Akaun" }).click();
  await expect(page.getByRole("status")).toContainText("Berjaya");
  await page.goto("/log-masuk");
  await page.getByLabel("E-mel", { exact: true }).fill(email);
  await page.getByLabel("Kata laluan", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log Masuk", exact: true }).click();
  await page
    .getByLabel("Peranan aktif", { exact: true })
    .selectOption("PEMOHON");
  await expect(
    page.getByRole("heading", { name: "Profil pemohon", exact: true }),
  ).toBeVisible();
}
async function addCompany(page: any, name: string) {
  const panel = page.locator("section.panel").filter({
    has: page.getByRole("heading", {
      name: "Daftar profil syarikat",
      exact: true,
    }),
  });
  await panel.getByLabel("Nama syarikat", { exact: true }).fill(name);
  await panel
    .getByLabel("Nombor pendaftaran SSM")
    .fill(`UJIAN${randomBytes(5).toString("hex")}`);
  await panel
    .getByLabel("Alamat berdaftar")
    .fill("Alamat data ujian sahaja, bukan premis atau identiti sebenar");
  await panel.getByLabel("Telefon syarikat").fill("0000000000");
  await panel.getByLabel("E-mel syarikat").fill("syarikat-ujian@example.test");
  await panel.getByRole("button", { name: "Tambah Syarikat" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
function delegationPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const text =
    "BT /F1 16 Tf 50 750 Td (DATA UJIAN - SURAT KUASA CONTOH SAHAJA) Tj ET";
  objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test("Phase 2A: one applicant manages two companies, a private PDF and an invited second representative", async ({
  page,
  browser,
}) => {
  const recipientContext = await browser.newContext({
    baseURL: "http://localhost:5173",
    reducedMotion: "reduce",
  });
  const recipientPage = await recipientContext.newPage();
  try {
    const ownerEmail = `p2a-owner-${randomUUID()}@example.test`,
      recipientEmail = `p2a-rep-${randomUUID()}@example.test`;
    const ownerPassword = `Aa1!${randomBytes(24).toString("hex")}`,
      recipientPassword = `Aa1!${randomBytes(24).toString("hex")}`;
    await registerApplicant(
      page,
      ownerEmail,
      "DATA UJIAN Pemohon A",
      ownerPassword,
    );
    await registerApplicant(
      recipientPage,
      recipientEmail,
      "DATA UJIAN Wakil B",
      recipientPassword,
    );
    await page.getByRole("button", { name: "Syarikat & wakil" }).click();
    const companyName = `DATA UJIAN Syarikat A ${randomBytes(3).toString("hex")}`;
    await addCompany(page, companyName);
    await addCompany(
      page,
      `DATA UJIAN Syarikat B ${randomBytes(3).toString("hex")}`,
    );
    const card = page.locator("article.company-record").filter({
      has: page.getByRole("heading", { name: companyName, exact: true }),
    });
    await card.getByText("Surat kuasa & dokumen", { exact: true }).click();
    await card.getByLabel("Muat naik surat kuasa").setInputFiles({
      name: "surat-kuasa-ujian.pdf",
      mimeType: "application/pdf",
      buffer: delegationPdf(),
    });
    await expect(
      card.getByRole("link", { name: "surat-kuasa-ujian.pdf" }),
    ).toBeVisible();
    await card.getByText("Jemput wakil syarikat", { exact: true }).click();
    const invite = card
      .locator("details")
      .filter({ hasText: "Jemput wakil syarikat" });
    await invite
      .getByLabel("E-mel akaun pemohon yang disahkan")
      .fill(recipientEmail);
    await invite.getByLabel("Jenis kuasa perwakilan").selectOption("PEKERJA");
    await invite.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(invite.getByRole("status")).toContainText(
      "Maklumat berjaya disimpan",
    );
    await recipientPage.goto(await activationLink(recipientEmail));
    await expect(
      recipientPage.getByText(companyName, { exact: true }),
    ).toBeVisible();
    await recipientPage
      .getByRole("button", { name: "Terima jemputan", exact: true })
      .click();
    await expect(recipientPage.getByRole("status")).toContainText(
      "Perwakilan diterima",
    );
    await recipientPage.getByRole("button", { name: "Ke dashboard" }).click();
    await recipientPage
      .getByRole("button", { name: "Syarikat & wakil" })
      .click();
    const received = recipientPage.locator("article.company-record").filter({
      has: recipientPage.getByRole("heading", {
        name: companyName,
        exact: true,
      }),
    });
    await expect(
      received.getByText("Perwakilan: Belum disahkan"),
    ).toBeVisible();
    await received.getByText("Senarai wakil syarikat", { exact: true }).click();
    await expect(
      received.getByText("DATA UJIAN Pemohon A", { exact: true }),
    ).toBeVisible();
    await expect(
      received.getByText("DATA UJIAN Wakil B", { exact: true }),
    ).toBeVisible();
    await received.getByText("Surat kuasa & dokumen", { exact: true }).click();
    const [download] = await Promise.all([
      recipientPage.waitForEvent("download"),
      received.getByRole("link", { name: "surat-kuasa-ujian.pdf" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("surat-kuasa-ujian.pdf");
    await page.getByRole("button", { name: "Ringkasan", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.screenshot({
      path: "docs/screenshots/phase2a-dashboard-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "docs/screenshots/phase2a-dashboard-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    await recipientContext.close();
  }
});

test("Phase 2A: applicant can recover access through a real test email and log in with a new password", async ({
  page,
}) => {
  const email = `p2a-reset-${randomUUID()}@example.test`,
    password = `Aa1!${randomBytes(24).toString("hex")}`,
    newPassword = `Aa1!${randomBytes(24).toString("hex")}`;
  await registerApplicant(page, email, "DATA UJIAN Pemulihan", password);
  await page.getByRole("button", { name: "Log keluar" }).click();
  await page.getByRole("link", { name: "Lupa kata laluan?" }).click();
  await page.getByLabel("E-mel", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Hantar Pautan" }).click();
  await expect(page.getByRole("status")).toContainText("Jika akaun layak");
  await page.goto(await activationLink(email));
  await page.getByLabel("Kata laluan baharu").fill(newPassword);
  await page.getByRole("button", { name: "Sahkan Akaun" }).click();
  await expect(page.getByRole("status")).toContainText("Berjaya");
  await page.goto("/log-masuk");
  await page.getByLabel("E-mel", { exact: true }).fill(email);
  await page.getByLabel("Kata laluan", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log Masuk", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "E-mel atau kata laluan tidak sah",
  );
  await page.getByLabel("Kata laluan", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Log Masuk", exact: true }).click();
  await page
    .getByLabel("Peranan aktif", { exact: true })
    .selectOption("PEMOHON");
  await expect(
    page.getByRole("heading", { name: "Profil pemohon", exact: true }),
  ).toBeVisible();
});

// The full suite intentionally keeps production rate limits. Wait for a fresh
// request budget instead of sending the final draft flows into an expected 429.
async function awaitDraftRequestBudget(request: APIRequestContext) {
  await expect
    .poll(
      async () => {
        const response = await request.get("/api/health");
        return Number(response.headers()["x-ratelimit-remaining"] || 0);
      },
      {
        timeout: 90000,
        intervals: [1000, 5000, 10000],
        message: "Waiting for the development API request budget to reset",
      },
    )
    .toBeGreaterThanOrEqual(50);
}

// Synthetic fixture avoids exhausting per-IP login limits in an eight-flow browser suite.
// Email verification itself is exercised through Mailpit in the Phase 2A flows above.
async function draftApplicantFixture() {
  const { db } = await import("../../apps/api/src/core"),
    { protectIdentification } = await import("../../apps/api/src/identity"),
    argon2 = (await import("argon2")).default;
  const email = `p2b1-${randomUUID()}@example.test`,
    password = `Aa1!${randomBytes(24).toString("hex")}`;
  const user = await db.user.create({
    data: {
      name: "DATA UJIAN Pemohon Draf",
      email,
      phone: "0000000000",
      kind: "APPLICANT",
      emailVerified: true,
      consentAt: new Date(),
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      ...protectIdentification(`UJIAN${randomBytes(6).toString("hex")}`),
      roles: {
        create: {
          roleId: "PEMOHON",
          reference: "DATA UJIAN Pelayar Fasa 2B.1",
        },
      },
    },
  });
  return { user, email, password };
}

test("Phase 2B.1: login return, individual autofill, PostgreSQL save and dashboard resume", async ({
  page,
}) => {
  test.setTimeout(120000);
  await awaitDraftRequestBudget(page.request);
  const { email, password } = await draftApplicantFixture();
  await page.goto("/");
  await page
    .locator(".hero-actions")
    .getByRole("link", { name: "Permohonan Baharu" })
    .click();
  await expect(page).toHaveURL(/log-masuk\?next=/);
  await page.getByLabel("E-mel", { exact: true }).fill(email);
  await page.getByLabel("Kata laluan", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/permohonan\/baharu$/);
  await page
    .getByRole("radio", { name: "Individu atas kapasiti sendiri" })
    .check();
  await expect(page.locator(".draft-official")).toContainText(
    "DATA UJIAN Pemohon Draf",
  );
  await expect(page.locator(".draft-official")).toContainText(email);
  await page
    .getByLabel("Catatan draf (pilihan)", { exact: false })
    .fill("DATA UJIAN nota individu disimpan");
  await page.getByRole("button", { name: "Simpan Draf", exact: true }).click();
  await expect(page).toHaveURL(/\/permohonan\/draf\/[a-f0-9-]+$/);
  const draftUrl = page.url(),
    id = draftUrl.split("/").pop()!;
  await expect(
    page.getByRole("button", { name: "Hantar Permohonan (belum tersedia)" }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByLabel("Catatan draf (pilihan)", { exact: false }),
  ).toHaveValue("DATA UJIAN nota individu disimpan");
  await page
    .getByLabel("Catatan draf (pilihan)", { exact: false })
    .fill("DATA UJIAN nota individu dikemas kini");
  await page.getByRole("button", { name: "Simpan Draf", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draf berjaya disimpan" }),
  ).toBeVisible();
  const { db } = await import("../../apps/api/src/core");
  const stored = await db.applicationDraft.findUniqueOrThrow({ where: { id } });
  expect(stored.notes).toBe("DATA UJIAN nota individu dikemas kini");
  expect(stored.status).toBe("DRAFT");
  expect(stored.version).toBe(2);
  expect(stored.initiatedByUserId).toBe(stored.officialApplicantUserId);
  await page
    .getByRole("link", { name: "Kembali ke dashboard", exact: true })
    .click();
  await page.getByRole("link", { name: "Sambung Semula", exact: true }).click();
  await expect(page).toHaveURL(draftUrl);
  // A logged-out deep link must also preserve the draft return destination.
  await page
    .getByRole("link", { name: "Kembali ke dashboard", exact: true })
    .click();
  await page.getByRole("button", { name: "Log keluar" }).click();
  await page.goto(draftUrl);
  await expect(page).toHaveURL(/log-masuk\?next=%2Fpermohonan%2Fdraf%2F/);
  await page.getByLabel("E-mel", { exact: true }).fill(email);
  await page.getByLabel("Kata laluan", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log Masuk", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sambung Draf PPTT" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Catatan draf (pilihan)", { exact: false }),
  ).toHaveValue("DATA UJIAN nota individu dikemas kini");
  await db.$disconnect();
});

test("Phase 2B.1: company autofill, separate initiator, responsive screenshots and revoked access", async ({
  page,
}) => {
  test.setTimeout(120000);
  await awaitDraftRequestBudget(page.request);
  const { user } = await draftApplicantFixture();
  const {
    db: fixtureDb,
    hash,
    token,
  } = await import("../../apps/api/src/core");
  await fixtureDb.user.update({
    where: { id: user.id },
    data: { name: "DATA UJIAN Wakil Draf" },
  });
  const raw = token();
  await fixtureDb.session.create({
    data: {
      id: hash(raw),
      userId: user.id,
      csrfHash: hash(token()),
      activeRole: "PEMOHON",
      mfaVerified: true,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await page.context().addCookies([
    {
      name: "staylink",
      value: raw,
      url: "http://localhost:5173",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await page.goto("/dashboard");
  await page
    .getByRole("button", { name: "Syarikat & wakil", exact: true })
    .click();
  await addCompany(page, "DATA UJIAN Syarikat Draf PPTT");
  await page.goto("/permohonan/baharu");
  await page
    .getByRole("radio", { name: "Wakil syarikat", exact: true })
    .check();
  const selector = page.getByLabel("Syarikat yang diwakili", { exact: true });
  await expect(selector.locator("option")).toHaveCount(2);
  const companyId = await selector
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await selector.selectOption(companyId!);
  await expect(page.locator(".draft-official")).toContainText(
    "DATA UJIAN Syarikat Draf PPTT",
  );
  await expect(page.locator(".draft-side")).toContainText(
    "DATA UJIAN Wakil Draf",
  );
  await page
    .getByLabel("Catatan draf (pilihan)", { exact: false })
    .fill("DATA UJIAN: draf awal, belum dihantar kepada MBSP.");
  await page.getByRole("button", { name: "Simpan Draf", exact: true }).click();
  await expect(page).toHaveURL(/\/permohonan\/draf\/[a-f0-9-]+$/);
  await expect(
    page.getByRole("heading", { name: "Sambung Draf PPTT" }),
  ).toBeVisible();
  const id = page.url().split("/").pop()!,
    { db } = await import("../../apps/api/src/core");
  const stored = await db.applicationDraft.findUniqueOrThrow({ where: { id } });
  expect(stored.companyId).toBe(companyId);
  expect(stored.officialApplicantUserId).toBeNull();
  expect((stored.initiatorSnapshot as any).name).toBe("DATA UJIAN Wakil Draf");
  expect((stored.applicantSnapshot as any).name).toBe(
    "DATA UJIAN Syarikat Draf PPTT",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 1000 : 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Simpan Draf", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(
      page.getByAltText("Logo Majlis Bandaraya Seberang Perai"),
    ).toBeVisible();
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `docs/screenshots/phase2b1-draft-${width === 390 ? "mobile" : "desktop"}.png`,
        fullPage: true,
        animations: "disabled",
      });
  }
  expect(errors).toEqual([]);
  await db.companyRepresentative.update({
    where: {
      userId_companyId: {
        userId: stored.initiatedByUserId,
        companyId: companyId!,
      },
    },
    data: { status: "REVOKED" },
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Draf atau kebenaran syarikat tidak ditemui",
  );
  await expect(
    page.getByRole("button", { name: "Simpan Draf", exact: true }),
  ).toHaveCount(0);
  await db.$disconnect();
});

async function premisesSession(page: any) {
  const { user, email, password } = await draftApplicantFixture();
  const { db, hash, token } = await import("../../apps/api/src/core"),
    raw = token();
  await db.session.create({
    data: {
      id: hash(raw),
      userId: user.id,
      csrfHash: hash(token()),
      activeRole: "PEMOHON",
      mfaVerified: true,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await page.context().addCookies([
    {
      name: "staylink",
      value: raw,
      url: "http://localhost:5173",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await page.goto("/permohonan/baharu");
  await page
    .getByRole("radio", { name: "Individu atas kapasiti sendiri" })
    .check();
  await page.getByRole("button", { name: "Seterusnya", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Maklumat Premis Penginapan Pekerja Tempoh Terhad",
      exact: true,
    }),
  ).toBeVisible();
  return { user, email, password, id: page.url().split("/").at(-2)! };
}
test("Phase 2B.2: partial/full premises save, actual map pin, review and responsive screenshots", async ({
  page,
}) => {
  test.setTimeout(120000);
  await awaitDraftRequestBudget(page.request);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { id } = await premisesSession(page),
    { db } = await import("../../apps/api/src/core");
  await page.getByRole("button", { name: "Seterusnya", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Semak medan");
  expect(await db.applicationPremises.count({ where: { draftId: id } })).toBe(
    0,
  );
  await page
    .getByLabel("Alamat penuh premis", { exact: true })
    .fill("DATA UJIAN Alamat Premis Penginapan sahaja");
  await page.getByRole("button", { name: "Simpan Draf", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Maklumat premis berjaya disimpan" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Alamat penuh premis", { exact: true }),
  ).toHaveValue("DATA UJIAN Alamat Premis Penginapan sahaja");
  await page.getByLabel("Poskod", { exact: true }).fill("13000");
  await page
    .getByLabel("Nombor lot / PT", { exact: true })
    .fill("PT DATA UJIAN 01");
  await page
    .getByLabel("Mukim atau bandar", { exact: true })
    .fill("Mukim DATA UJIAN");
  await page
    .getByLabel("Daerah (diisytiharkan pemohon)", { exact: true })
    .selectOption("SPT");
  await page.locator(".premises-map").click({ position: { x: 200, y: 150 } });
  await expect(page.getByLabel("Latitude", { exact: true })).not.toHaveValue(
    "",
  );
  const firstLongitude = await page
    .getByLabel("Longitude", { exact: true })
    .inputValue();
  await page.locator(".premises-map").click({ position: { x: 250, y: 180 } });
  await expect(page.getByLabel("Longitude", { exact: true })).not.toHaveValue(
    firstLongitude,
  );
  const clickedLatitude = await page
    .getByLabel("Latitude", { exact: true })
    .inputValue();
  await page
    .locator(".leaflet-marker-icon")
    .dragTo(page.locator(".premises-map"), {
      targetPosition: { x: 300, y: 220 },
    });
  await expect(page.getByLabel("Latitude", { exact: true })).not.toHaveValue(
    clickedLatitude,
  );
  const latitude = Number(
      await page.getByLabel("Latitude", { exact: true }).inputValue(),
    ),
    longitude = Number(
      await page.getByLabel("Longitude", { exact: true }).inputValue(),
    );
  await expect(
    page.getByLabel("Daerah (diisytiharkan pemohon)", { exact: true }),
  ).toHaveValue("SPT");
  for (const [label, value] of [
    ["Jenis bangunan", "Bangunan DATA UJIAN"],
    ["Kegunaan bangunan sedia ada", "Kegunaan DATA UJIAN"],
    ["Bilangan tingkat terlibat", "2"],
    ["Bilangan unit penginapan", "4"],
    ["Bilangan bilik keseluruhan", "12"],
    ["Jumlah keluasan lantai terlibat (m²)", "250.75"],
    ["Jumlah pekerja yang dicadangkan", "36"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel("Jenis sijil", { exact: true }).selectOption("CCC");
  await page.getByRole("button", { name: "Seterusnya", exact: true }).click();
  await expect(
    page.getByLabel("Nombor rujukan sijil", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await page
    .getByLabel("Nombor rujukan sijil", { exact: true })
    .fill("DATA-UJIAN-CCC-01");
  await page
    .getByLabel("Tarikh sijil (jika diketahui)", { exact: true })
    .fill("2025-01-01");
  await page.getByRole("button", { name: "Seterusnya", exact: true }).click();
  await expect(page).toHaveURL(/\/semakan$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Semakan Draf PPTT", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Hantar Permohonan (belum tersedia)",
      exact: true,
    }),
  ).toBeDisabled();
  const stored = await db.applicationPremises.findUniqueOrThrow({
    where: { draftId: id },
  });
  expect(stored.latitude).toBe(latitude);
  expect(stored.longitude).toBe(longitude);
  expect(stored.totalRooms).toBe(12);
  expect(Number(stored.floorAreaSqm)).toBe(250.75);
  expect(stored.boundaryStatus).toBe("UNVERIFIED");
  expect(
    (await db.applicationDraft.findUniqueOrThrow({ where: { id } })).status,
  ).toBe("DRAFT");
  await page.getByRole("link", { name: "Sebelumnya", exact: true }).click();
  await expect(
    page.getByLabel("Bilangan bilik keseluruhan", { exact: true }),
  ).toHaveValue("12");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width >= 1024 ? 1000 : 844 });
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390 || width === 1440) {
      // Regression-only capture under controlled network failure; not the real-network review evidence.
      await expect(
        page.getByText("Memuatkan peta asas OpenStreetMap…", { exact: true }),
      ).toHaveCount(0);
      await page.screenshot({
        path: `docs/screenshots/phase2b2-premises-${width === 390 ? "mobile" : "desktop"}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
  }
  expect(errors).toEqual([]);
  await db.$disconnect();
});
test("Phase 2B.2: keyboard pin, previous autosave, resume and premises login return", async ({
  page,
}) => {
  test.setTimeout(120000);
  await awaitDraftRequestBudget(page.request);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { id, email, password } = await premisesSession(page);
  await page.locator(".premises-map").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".map-center")).not.toContainText("100.420000");
  await page
    .getByRole("button", { name: "Letak Pin di Tengah Peta", exact: true })
    .click();
  await expect(page.getByLabel("Longitude", { exact: true })).not.toHaveValue(
    "",
  );
  await expect(page.locator(".leaflet-marker-icon")).toBeVisible();
  await page
    .getByLabel("Alamat penuh premis", { exact: true })
    .fill("DATA UJIAN catatan alamat separa");
  await page.getByRole("button", { name: "Sebelumnya", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/permohonan/draf/${id}$`));
  await page.getByRole("button", { name: "Seterusnya", exact: true }).click();
  await expect(
    page.getByLabel("Alamat penuh premis", { exact: true }),
  ).toHaveValue("DATA UJIAN catatan alamat separa");
  const url = page.url();
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Log keluar", exact: true }).click();
  await page.goto(url);
  await expect(page).toHaveURL(/log-masuk\?next=.*%2Fpremis$/);
  await page.getByLabel("E-mel", { exact: true }).fill(email);
  await page.getByLabel("Kata laluan", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log Masuk", exact: true }).click();
  await expect(
    page.getByLabel("Alamat penuh premis", { exact: true }),
  ).toHaveValue("DATA UJIAN catatan alamat separa");
});
