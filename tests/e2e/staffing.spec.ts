import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("staffing lab admin appoints an acting officer in two districts and revokes one", async ({
  page,
  baseURL,
}) => {
  test.skip(process.env.STAYLINK_SYNTHETIC_STAFFING !== "true");
  const { syntheticPortalDatabase } =
    await import("../../apps/api/src/synthetic-portal-gate");
  if (
    !syntheticPortalDatabase() ||
    !baseURL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  )
    throw Error("Pangkalan data ujian pelantikan tidak sah.");
  const { db, hash, token } = await import("../../apps/api/src/core");
  const raw = token();
  const csrf = createHmac("sha256", raw)
    .update("staylink.csrf.v1")
    .digest("hex");
  const fixture = (roleId: string) => ({
    name: `DATA UJIAN Pelantikan ${randomUUID().slice(0, 8)}`,
    email: `staffing-${randomUUID()}@example.test`,
    phone: "0123456789",
    kind: "OFFICER",
    emailVerified: true,
    roles: { create: { roleId, reference: "Data ujian pelantikan" } },
  });
  try {
    const admin = await db.user.create({ data: fixture("PENTADBIR_ICT") });
    const target = await db.user.create({ data: fixture("PENTADBIR_TEMPLAT") });
    await db.session.create({
      data: {
        id: hash(raw),
        userId: admin.id,
        activeRole: "PENTADBIR_ICT",
        csrfHash: hash(csrf),
        mfaVerified: true,
        expiresAt: new Date(Date.now() + 300_000),
      },
    });
    await page
      .context()
      .addCookies([
        {
          name: "staylink",
          value: raw,
          url: baseURL,
          httpOnly: true,
          secure: baseURL.startsWith("https:"),
        },
      ]);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Pengguna & pelantikan" }).click();
    const row = page.getByRole("row").filter({ hasText: target.email });
    await row.getByRole("button", { name: "Lantik peranan" }).click();
    const form = page.locator(".action-panel");
    await form
      .getByRole("combobox", { name: "Peranan", exact: true })
      .selectOption("PIC_KAWASAN");
    await form.getByRole("combobox", { name: "Jabatan", exact: true }).selectOption("BANGUNAN");
    await form
      .getByRole("combobox", { name: "Skop daerah (kosong: semua)", exact: true })
      .selectOption("SPU");
    await form
      .getByRole("combobox", { name: "Jenis pelantikan latihan", exact: true })
      .selectOption("ACTING");
    await form
      .getByRole("combobox", { name: "Daerah tambahan pertama (latihan)", exact: true })
      .selectOption("SPT");
    await form
      .getByLabel("Rujukan pelantikan rasmi", { exact: true })
      .fill("Pelantikan latihan E2E");
    await form
      .getByLabel("Tarikh kuat kuasa", { exact: true })
      .fill(new Date().toISOString().slice(0, 10));
    await form
      .getByLabel("Tarikh tamat (pilihan)", { exact: true })
      .fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/admin/users/${target.id}/roles`) &&
        response.request().method() === "POST",
    );
    await form.getByRole("button", { name: "Simpan", exact: true }).click();
    expect((await created).status()).toBe(200);
    await row.getByText("Pelantikan (3)", { exact: true }).click();
    const appointment = row
      .locator(".appointment")
      .filter({ hasText: "SPU · Pelantikan latihan E2E" });
    await expect(appointment.getByText(/Pemangku latihan/)).toBeVisible();
    await expect(
      row
        .locator(".appointment")
        .filter({ hasText: "SPT · Pelantikan latihan E2E" }),
    ).toBeVisible();
    await appointment
      .getByRole("button", { name: "Tamatkan pelantikan" })
      .click();
    const revoked = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/appointments/") &&
        response.request().method() === "DELETE",
    );
    await form.getByRole("button", { name: /Tamatkan|Sahkan/ }).click();
    expect((await revoked).status()).toBe(200);
    await expect(appointment.getByText(/REVOKED/)).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});
