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
