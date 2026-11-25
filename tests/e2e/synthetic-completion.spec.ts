import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("applicant can open the closed training case and download both decision letters via HTTPS", async ({
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
      Origin: "https://localhost:5444",
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
  await expect(
    page.getByRole("link", { name: "Muat turun surat susulan LATIHAN v2" }),
  ).toBeVisible();
});
