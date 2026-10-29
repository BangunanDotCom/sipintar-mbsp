import { test, expect } from "@playwright/test";
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
  await expect(page).toHaveURL(/\/daftar$/);
  await expect(
    page.getByText("Pendaftaran akaun Fasa 1.", { exact: true }),
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
