import { awaitDraftRequestBudget } from "./request-budget";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { syntheticPortalDatabase } from "../../apps/api/src/synthetic-portal-gate";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { totp } from "../../apps/api/src/auth";
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
  type KitAccount = {
    id: string;
    role: string;
    label?: string;
    email: string;
    password: string;
    mfaSecretBase32: string | null;
  };
  const kitPath = process.env.STAYLINK_UAT_KIT_FILE;
  const kit: {
    accounts: KitAccount[];
    scenarios?: { id: string; draftPath: string; feeSen?: number }[];
  } | null = kitPath ? JSON.parse(await readFile(kitPath, "utf8")) : null;
  const evidenceDirectory = process.env.STAYLINK_UAT_EVIDENCE_DIR;
  if (evidenceDirectory) await mkdir(evidenceDirectory, { recursive: true });
  const apiTimings: Record<string, number[]> = {};
  const uiTimings: Record<string, number> = {};
  function measure(page: import("@playwright/test").Page) {
    if (!evidenceDirectory) return page;
    page.on("requestfinished", (request) => {
      const path = new URL(request.url()).pathname;
      const duration = request.timing().responseEnd;
      if (!path.startsWith("/api/synthetic-portal/") || duration < 0) return;
      const label =
        request.method() +
        " " +
        path.replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi, ":id");
      (apiTimings[label] ??= []).push(Math.round(duration));
    });
    return page;
  }
  async function capture(
    region: import("@playwright/test").Locator,
    file: string,
  ) {
    if (!evidenceDirectory) return;
    await region.screenshot({
      path: join(evidenceDirectory, file),
      animations: "disabled",
    });
  }
  async function signIn(
    role: "PEMOHON" | "PIC_KAWASAN" | "PPSK" | "WAKIL_SYARIKAT",
    id: string,
  ) {
    const applicant = role === "PEMOHON" || role === "WAKIL_SYARIKAT";
    const context = await browser.newContext({
      baseURL,
      ignoreHTTPSErrors: process.env.STAYLINK_HTTPS_REHEARSAL === "true",
    });
    contexts.push(context);
    if (kit) {
      const account = kit.accounts.find(
        (item) => item.role === role && item.id === id,
      );
      if (!account)
        throw Error(
          "Akaun kit latihan tidak sepadan dengan konfigurasi portal.",
        );
      const login = await context.request.post("/api/auth/login", {
        data: {
          email: account.email,
          password: account.password,
        },
      });
      expect(login.status(), role + " login").toBe(200);
      const session = await login.json();
      expect(session.mfaRequired).toBe(!applicant);
      const headers = { Origin: baseURL!, "X-CSRF-Token": session.csrf };
      if (!applicant) {
        expect(
          (await context.request.get("/api/synthetic-portal/reviews")).status(),
        ).toBe(403);
        if (!account.mfaSecretBase32)
          throw Error("Kunci MFA latihan tidak tersedia.");
        const verified = await context.request.post("/api/auth/mfa/verify", {
          headers,
          data: {
            code: totp(account.mfaSecretBase32).generate(),
          },
        });
        expect(verified.status(), role + " MFA").toBe(200);
      }
      const selected = await context.request.post("/api/auth/role", {
        headers,
        data: { roleId: role },
      });
      expect(selected.status(), role + " role").toBe(200);
      return measure(await context.newPage());
    }
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
    await context.addCookies([
      {
        name: "staylink",
        value: raw,
        url: baseURL!,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    return measure(await context.newPage());
  }

  try {
    const applicant = await signIn(
      "PEMOHON",
      kit?.accounts.find(({ role }) => role === "PEMOHON")?.id ?? randomUUID(),
    );
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
    const openApplicant = performance.now();
    await applicant.goto(pageRoot + "/semakan");
    const panel = applicant.getByRole("region", {
      name: "Serahan latihan sintetik",
    });
    await expect(panel).toBeVisible();
    const steps = panel.getByRole("navigation", {
      name: "Langkah latihan pemohon",
    });
    await expect(
      steps.getByRole("link", { name: "Bukti", exact: true }),
    ).toHaveAttribute("aria-current", "step");
    await expect(
      steps.getByRole("link", { name: /Tingkat dan kemudahan/ }),
    ).toBeVisible();
    await expect(
      panel.getByRole("list", {
        name: "Keperluan dokumen mengikut polisi latihan",
      }),
    ).toContainText("Wajib");

    uiTimings.applicant = Math.round(performance.now() - openApplicant);
    for (const width of [320, 390, 768]) {
      await applicant.setViewportSize({ width, height: 850 });
      expect(
        await panel.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
    }
    const scanChoice = panel.getByLabel("Keputusan imbasan tiruan");
    await scanChoice.focus();
    await expect(scanChoice).toBeFocused();

    const submit = panel.getByRole("button", {
      name: "Serah permohonan sintetik",
    });
    await expect(submit).toBeDisabled();
    await panel.getByLabel("Keputusan imbasan tiruan").selectOption("FAILED");
    await panel.getByRole("button", { name: "Jana bukti tiruan" }).click();
    await expect(panel.getByText(/floor_layout .*FAILED/)).toHaveCount(2);
    await expect(submit).toBeDisabled();
    await capture(panel, "pemohon-bukti-gagal.png");
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
    const submitted = await firstSubmit;
    expect(submitted.request().postDataJSON().policyFingerprint).toMatch(
      /^[a-f0-9]{64}$/,
    );
    const first = await submitted.json();
    expect(first.id).toBeTruthy();

    const openPic = performance.now();
    await pic.goto("/dashboard");
    const firstCard = pic.getByRole("article", {
      name: `Serahan sintetik ${first.id}`,
    });
    await expect(firstCard.getByText(/Nasihat AI tiruan sahaja/)).toBeVisible();
    uiTimings.pic = Math.round(performance.now() - openPic);
    await pic.setViewportSize({ width: 390, height: 850 });
    const tasks = pic.getByRole("region", { name: "Tugasan semakan sintetik" });
    await tasks.getByLabel("Penapis tugasan").selectOption("action");
    await expect(firstCard).toBeVisible();
    await tasks.getByLabel("Penapis tugasan").selectOption("all");
    const search = tasks.getByRole("searchbox", {
      name: "ID serahan atau rujukan latihan",
    });
    await search.fill(first.id.slice(0, 8));
    await search.press("Enter");
    await expect(search).toBeFocused();
    await expect(firstCard).toBeVisible();
    const clear = tasks.getByRole("button", { name: "Kosongkan carian" });
    await clear.focus();
    await clear.press("Enter");
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");

    for (const width of [320, 390, 768]) {
      await pic.setViewportSize({ width, height: 850 });
      expect(
        await firstCard.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
    }

    await firstCard
      .getByLabel("Alasan keputusan sintetik")
      .fill("Betulkan bukti latihan.");
    await firstCard
      .getByRole("button", { name: "Minta pembetulan sintetik" })
      .click();
    await expect(firstCard.getByText(/Pembetulan diminta ·/)).toBeVisible();
    await capture(firstCard, "pic-pembetulan.png");

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
      .getByRole("button", { name: "Bandingkan versi serahan" })
      .click();
    const comparison = secondCard.getByRole("region", {
      name: "Perbandingan serahan latihan",
    });
    await expect(comparison.getByText("Versi terdahulu")).toBeVisible();
    await comparison
      .getByText("Inventori tingkat dan kemudahan semasa")
      .click();
    await expect(comparison.getByText(/1 bilik · 2 katil/)).toHaveCount(2);
    await capture(secondCard, "pic-perbandingan.png");

    await expect(
      comparison.getByRole("list", { name: "Versi bukti baharu" }),
    ).toBeVisible();
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

    let billingReads = 0;
    supervisor.on("request", (req) => {
      if (
        req.method() === "GET" &&
        req.url().endsWith(`/reviews/${second.id}/billing`)
      )
        billingReads++;
    });
    const openPpsk = performance.now();
    await supervisor.goto("/dashboard");
    const supervisorCard = supervisor.getByRole("article", {
      name: `Serahan sintetik ${second.id}`,
    });
    await supervisorCard
      .getByLabel("Alasan keputusan sintetik")
      .fill("Pendaftaran latihan oleh PPSK.");
    uiTimings.ppsk = Math.round(performance.now() - openPpsk);
    await supervisorCard
      .getByRole("button", { name: "Daftar keputusan sintetik" })
      .click();
    const invoiceDetails = supervisorCard.getByRole("button", {
      name: "Buka butiran invois",
    });
    await expect(invoiceDetails).toHaveAttribute("aria-expanded", "false");
    expect(billingReads).toBe(0);
    await invoiceDetails.click();
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
    await capture(supervisorCard, "ppsk-rekonsiliasi.png");
    await panel.getByRole("button", { name: "Semak status terkini" }).click();
    await expect(
      panel.getByText("Direkonsiliasi dalam simulasi"),
    ).toBeVisible();
    await expect(
      applicant.getByRole("button", {
        name: "Hantar Permohonan (belum tersedia)",
      }),
    ).toBeDisabled();
    if (kit?.scenarios) {
      const scenario = (id: string) => {
        const match = kit.scenarios!.find((item) => item.id === id);
        if (!match) throw Error("Senario kit latihan tidak tersedia.");
        const draftId = match.draftPath.split("/")[3];
        return `/api/synthetic-portal/drafts/${draftId}`;
      };
      const multiple = await applicant.request.get(scenario("multiple-units"));
      expect((await multiple.json()).inventory).toEqual({
        unitCount: 2,
        floorCount: 2,
      });
      const failed = await applicant.request.get(scenario("failed-evidence"));
      const failedState = await failed.json();
      expect(failedState).toMatchObject({
        ready: false,
        evidence: [expect.objectContaining({ scanStatus: "FAILED" })],
      });
      const currentSession = await applicant.request.get("/api/auth/me");
      const headers = {
        Origin: baseURL!,
        "X-CSRF-Token": (await currentSession.json()).csrf,
      };
      const submitFixture = (path: string, state: typeof failedState) =>
        applicant.request.post(path + "/submit", {
          headers,
          data: {
            version: state.draftVersion,
            declarationVersion: state.declaration.version,
            policyFingerprint: state.policyFingerprint,
            accepted: true,
            key: randomUUID(),
            previousId: null,
          },
        });
      expect(
        (
          await submitFixture(scenario("failed-evidence"), failedState)
        ).status(),
      ).toBe(409);
      async function submitCleanFixture(id: string) {
        const path = scenario(id);
        const before = await applicant.request.get(path);
        expect(before.status()).toBe(200);
        const evidence = await applicant.request.post(path + "/evidence", {
          headers,
          data: {
            version: (await before.json()).draftVersion,
            verdict: "CLEAN",
          },
        });
        expect(evidence.status()).toBe(200);
        const after = await applicant.request.get(path);
        expect(after.status()).toBe(200);
        const submission = await submitFixture(path, await after.json());
        expect(submission.status()).toBe(200);
        return (await submission.json()).id as string;
      }
      const multiId = await submitCleanFixture("multiple-units");
      const districtId = await submitCleanFixture("district-spt");
      const root = "/api/synthetic-portal/reviews";
      const officerQueue = await pic.request.get(root);
      expect(officerQueue.status()).toBe(200);
      const reviews = (await officerQueue.json()).reviews;
      expect(reviews).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: multiId })]),
      );
      expect(reviews).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: districtId })]),
      );
      expect(
        (await pic.request.get(`${root}/${districtId}/comparison`)).status(),
      ).toBe(404);
      const officerHeaders = async (page: typeof pic) => ({
        Origin: baseURL!,
        "X-CSRF-Token": (await (await page.request.get("/api/auth/me")).json())
          .csrf,
      });
      const multiPath = `${root}/${multiId}`;
      const complete = await pic.request.post(multiPath, {
        headers: await officerHeaders(pic),
        data: {
          action: "CONFIRM_COMPLETE",
          version: 1,
          reason: "Dua unit latihan disemak.",
        },
      });
      expect(complete.status()).toBe(200);
      const ppskHeaders = await officerHeaders(supervisor);
      const register = await supervisor.request.post(multiPath, {
        headers: ppskHeaders,
        data: {
          action: "REGISTER",
          version: 2,
          reason: "Dua unit latihan didaftar.",
        },
      });
      expect(register.status()).toBe(200);
      const invoice = await supervisor.request.post(multiPath + "/billing", {
        headers: ppskHeaders,
        data: { action: "ISSUE" },
      });
      expect(invoice.status()).toBe(200);
      expect(await invoice.json()).toMatchObject({
        invoice: { unitCount: 2, amountSen: 10000 },
      });
      const representative = kit.accounts.find(
        ({ label }) => label === "wakil",
      );
      const company = representative
        ? await signIn("WAKIL_SYARIKAT", representative.id)
        : applicant;
      if (representative) {
        expect(
          (await applicant.request.get(scenario("company-active"))).status(),
        ).toBe(404);
        expect(
          (await company.request.get(scenario("single-unit"))).status(),
        ).toBe(404);
      } else {
        expect(
          (
            await applicant.request.post("/api/auth/role", {
              headers,
              data: { roleId: "WAKIL_SYARIKAT" },
            })
          ).status(),
        ).toBe(200);
      }
      expect(
        (await company.request.get(scenario("company-active"))).status(),
      ).toBe(200);
      expect(
        (
          await company.request.post(scenario("company-active") + "/evidence", {
            headers: await officerHeaders(company),
            data: { version: 1, verdict: "CLEAN" },
          })
        ).status(),
      ).toBe(200);
      expect(
        (await company.request.get(scenario("company-expired"))).status(),
      ).toBe(404);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    if (evidenceDirectory)
      await writeFile(
        join(evidenceDirectory, "timings-ms.json"),
        JSON.stringify({ ui: uiTimings, api: apiTimings }, null, 2) + "\n",
      );
    await db.$disconnect();
  }
});
