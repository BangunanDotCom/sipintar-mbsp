import { awaitDraftRequestBudget } from "./request-budget";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { syntheticPortalDatabase } from "../../apps/api/src/synthetic-portal-gate";
import { db, hash, token } from "../../apps/api/src/core";
import { protectIdentification } from "../../apps/api/src/identity";
import { emptyPremises } from "../../packages/shared/src/premises";

test("synthetic portal joins applicant, PIC, supervisor and invoicing", async ({
  browser,
  baseURL,
}) => {
  const database = syntheticPortalDatabase();
  test.skip(
    !database ||
      !process.env.STAYLINK_SYNTHETIC_PIC_ID ||
      !process.env.STAYLINK_SYNTHETIC_SUPERVISOR_ID ||
      !process.env.STAYLINK_SYNTHETIC_CALLBACK_KEY,
  );
  test.setTimeout(150000);
  const [active] = await db.$queryRaw<
    { name: string }[]
  >`SELECT current_database()::text AS name`;
  expect(active?.name).toBe(database);
  const contexts: BrowserContext[] = [];
  async function signIn(role: "PEMOHON" | "PIC_KAWASAN" | "PPSK", id: string) {
    const applicant = role === "PEMOHON";
    // Fixture provisioning. Browser requests then use the normal session and CSRF handlers.
    await db.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: `Latihan portal ${role}`,
        email: `${id}@example.test`,
        kind: applicant ? "APPLICANT" : "OFFICER",
        emailVerified: true,
        phone: "0123456789",
        ...(applicant
          ? protectIdentification(`UJIAN${randomBytes(6).toString("hex")}`)
          : {}),
        roles: {
          create: {
            roleId: role,
            districtId: applicant ? null : "SPU",
            reference: "UJIAN ISSUE 31",
          },
        },
      },
    });
    const raw = token();
    await db.session.create({
      data: {
        id: hash(raw),
        userId: id,
        activeRole: role,
        mfaVerified: true,
        csrfHash: hash(token()),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const context = await browser.newContext({ baseURL });
    contexts.push(context);
    await context.addCookies([
      {
        name: "staylink",
        value: raw,
        url: baseURL!,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    return context.newPage();
  }

  try {
    const applicant = await signIn("PEMOHON", randomUUID());
    const pic = await signIn(
      "PIC_KAWASAN",
      process.env.STAYLINK_SYNTHETIC_PIC_ID!,
    );
    const supervisor = await signIn(
      "PPSK",
      process.env.STAYLINK_SYNTHETIC_SUPERVISOR_ID!,
    );
    await awaitDraftRequestBudget(applicant.request, 110);
    const session = await applicant.request.get("/api/auth/me");
    expect(session.ok()).toBe(true);
    const headers = {
      Origin: baseURL!,
      "X-CSRF-Token": (await session.json()).csrf,
    };
    const draft = await applicant.request.post("/api/application-drafts", {
      headers,
      data: { capacity: "INDIVIDUAL" },
    });
    expect(draft.status()).toBe(201);
    const { id, version } = await draft.json();
    const root = `/api/application-drafts/${id}`;
    const premise = await applicant.request.put(root + "/premises", {
      headers,
      data: {
        version,
        premises: {
          ...emptyPremises,
          accommodationUnits: 1,
          address: "Premis latihan",
          postcode: "13000",
          lotNumber: "LOT-UJIAN",
          locality: "Mukim latihan",
          districtId: "SPU",
          latitude: 5.42,
          longitude: 100.4,
          buildingType: "Kedai latihan",
          currentUse: "Latihan",
          involvedFloors: 2,
          totalRooms: 2,
          floorAreaSqm: 100,
          proposedWorkers: 4,
          certificateType: "CCC",
          certificateNumber: "CCC-UJIAN",
          certificateDate: "2025-01-01",
        },
      },
    });
    expect(premise.ok()).toBe(true);
    const floors = await applicant.request.put(root + "/floors", {
      headers,
      data: {
        version: (await premise.json()).version,
        floors: ["Tingkat Bawah", "Tingkat 1"].map((floorLabel) => ({
          floorLabel,
          rooms: 1,
          beds: 2,
          workers: 2,
          areaSqm: 50,
          facilities: {
            toilets: 1,
            bathrooms: 1,
            sinks: 1,
            diningTables: 0,
            diningChairs: 0,
            fireExtinguishers: 1,
          },
        })),
      },
    });
    expect(floors.ok()).toBe(true);
    const pageRoot = `/permohonan/draf/${id}`;
    await applicant.goto(pageRoot + "/unit");
    await applicant.getByRole("button", { name: "Tambah unit" }).click();
    await applicant
      .getByRole("textbox", { name: "Label unit" })
      .fill("Kedai latihan A");
    await applicant
      .getByRole("checkbox", { name: "Tingkat Bawah", exact: true })
      .check();
    await applicant
      .getByRole("checkbox", { name: "Tingkat 1", exact: true })
      .check();
    const saved = applicant.waitForResponse(
      (result) =>
        result.url().endsWith("/units") && result.request().method() === "PUT",
    );
    await applicant.getByRole("button", { name: "Simpan draf unit" }).click();
    expect((await saved).ok()).toBe(true);
    await applicant.goto(pageRoot + "/semakan");
    const panel = applicant.getByRole("region", {
      name: "Serahan latihan sintetik",
    });
    await expect(panel).toBeVisible();
    const submit = panel.getByRole("button", {
      name: "Serah permohonan sintetik",
    });
    await expect(submit).toBeDisabled();
    await panel.getByLabel("Keputusan imbasan tiruan").selectOption("FAILED");
    await panel.getByRole("button", { name: "Jana bukti tiruan" }).click();
    await expect(panel.getByText(/floor_layout .*FAILED/)).toHaveCount(2);
    await expect(submit).toBeDisabled();
    await panel.getByLabel("Keputusan imbasan tiruan").selectOption("CLEAN");
    await panel.getByRole("button", { name: "Jana bukti tiruan" }).click();
    await expect(panel.getByText(/floor_layout .*CLEAN/)).toHaveCount(2);
    await panel.getByRole("checkbox").check();
    const firstSubmit = applicant.waitForResponse(
      (result) =>
        result.url().includes("/synthetic-portal/") &&
        result.url().endsWith("/submit"),
    );
    await submit.click();
    const first = await (await firstSubmit).json();
    expect(first.id).toBeTruthy();

    await pic.goto("/dashboard");
    const firstCard = pic.getByRole("article", {
      name: `Serahan sintetik ${first.id}`,
    });
    await expect(firstCard.getByText(/Nasihat AI tiruan sahaja/)).toBeVisible();
    await firstCard
      .getByLabel("Alasan keputusan sintetik")
      .fill("Betulkan bukti latihan.");
    await firstCard
      .getByRole("button", { name: "Minta pembetulan sintetik" })
      .click();
    await expect(firstCard.getByText(/Pembetulan diminta ·/)).toBeVisible();

    await applicant.reload();
    await expect(panel.getByText(/Betulkan bukti latihan/)).toBeVisible();
    await panel.getByRole("button", { name: "Jana bukti tiruan" }).click();
    await expect(panel.getByText("Bukti tiruan dikemas kini.")).toBeVisible();
    await panel.getByRole("checkbox").check();
    const corrected = applicant.waitForResponse(
      (result) =>
        result.url().includes("/synthetic-portal/") &&
        result.url().endsWith("/submit"),
    );
    await panel
      .getByRole("button", { name: "Serah pembetulan sintetik" })
      .click();
    const second = await (await corrected).json();
    expect(second.id).toBeTruthy();
    expect(second.id).not.toBe(first.id);

    await pic.reload();
    const secondCard = pic.getByRole("article", {
      name: `Serahan sintetik ${second.id}`,
    });
    await secondCard
      .getByLabel("Alasan keputusan sintetik")
      .fill("Bukti latihan lengkap.");
    await secondCard
      .getByRole("button", { name: "Sahkan lengkap sintetik" })
      .click();
    await expect(secondCard.getByText(/Lengkap dalam simulasi/)).toBeVisible();
    await expect(
      secondCard.getByRole("button", { name: "Daftar keputusan sintetik" }),
    ).toHaveCount(0);

    await supervisor.goto("/dashboard");
    const supervisorCard = supervisor.getByRole("article", {
      name: `Serahan sintetik ${second.id}`,
    });
    await supervisorCard
      .getByLabel("Alasan keputusan sintetik")
      .fill("Pendaftaran latihan oleh PPSK.");
    await supervisorCard
      .getByRole("button", { name: "Daftar keputusan sintetik" })
      .click();
    await supervisorCard
      .getByRole("button", { name: "Jana invois tiruan" })
      .click();
    await expect(
      supervisorCard.getByText(/1 unit fizikal × RM50/),
    ).toBeVisible();
    await supervisorCard
      .getByRole("button", { name: "Rekonsiliasi tiruan" })
      .click();
    await expect(
      supervisorCard.getByText("Direkonsiliasi dalam simulasi"),
    ).toBeVisible();
    await applicant.reload();
    await expect(
      panel.getByText("Direkonsiliasi dalam simulasi"),
    ).toBeVisible();
    await expect(
      applicant.getByRole("button", {
        name: "Hantar Permohonan (belum tersedia)",
      }),
    ).toBeDisabled();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await db.$disconnect();
  }
});
