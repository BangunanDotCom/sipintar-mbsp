import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export async function activationLink(email: string) {
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

export async function registerApplicant(
  page: Page,
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
  await page.getByLabel("Kata laluan", { exact: true }).fill(password);
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

export async function openPremisesDraft(page: Page) {
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
  return { id: page.url().split("/").at(-2)! };
}
