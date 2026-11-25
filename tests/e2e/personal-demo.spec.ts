import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { totp } from "../../apps/api/src/auth";

test("seven private accounts exercise staged cases and district boundaries on HTTPS", async ({
  browser,
  baseURL,
}) => {
  test.skip(baseURL !== "https://localhost:5444");
  test.setTimeout(90_000);
  const kitPath = process.env.STAYLINK_UAT_KIT_FILE;
  if (!kitPath) throw Error("Kit Personal Demo diperlukan.");
  const kit = JSON.parse(await readFile(kitPath, "utf8")) as {
    loginUrl: string;
    accounts: {
      label: string;
      id: string;
      role: string;
      email: string;
      password: string;
      mfaSecretBase32: string | null;
    }[];
    scenarios: { id: string; draftPath: string }[];
  };
  expect(kit.loginUrl).toBe(baseURL + "/log-masuk");
  expect(kit.accounts).toHaveLength(7);
  expect(new Set(kit.accounts.map(({ password }) => password)).size).toBe(7);
  const expectedDistricts: Record<string, string> = {
    "pic-spu": "SPU",
    "pic-spt": "SPT",
    "pic-sps": "SPS",
    ppsk: "SPU",
  };
  const contexts = [];
  const submissions = new Map<string, string>();
  const pilot = (label: string) =>
    kit.accounts.find((account) => account.label === label)!;
  const draft = (label: string) =>
    "/api/synthetic-portal/drafts/" +
    kit.scenarios.find(({ id }) => id === label)!.draftPath.split("/")[3];
  try {
    for (const label of [
      "pemohon",
      "wakil",
      "pic-spt",
      "pic-sps",
      "ppsk",
      "pentadbir",
      "pic-spu",
    ]) {
      const account = pilot(label);
      const context = await browser.newContext({
        baseURL,
        ignoreHTTPSErrors: true,
      });
      contexts.push(context);
      const page = await context.newPage();
      const request = context.request;
      const login = await request.post("/api/auth/login", {
        data: { email: account.email, password: account.password },
      });
      expect(login.status(), label + " log masuk").toBe(200);
      expect(login.headers()["set-cookie"]).toContain("Secure");
      const { csrf, mfaRequired } = await login.json();
      expect(mfaRequired).toBe(Boolean(account.mfaSecretBase32));
      const headers = { Origin: baseURL!, "X-CSRF-Token": csrf };
      if (account.mfaSecretBase32) {
        const protectedUrl =
          label === "pentadbir"
            ? "/api/admin/users"
            : "/api/synthetic-portal/reviews";
        expect((await request.get(protectedUrl)).status()).toBe(403);
        const verify = () =>
          request.post("/api/auth/mfa/verify", {
            headers,
            data: { code: totp(account.mfaSecretBase32!).generate() },
          });
        let verified = await verify();
        if (
          label === "pic-spu" &&
          verified.status() === 400 &&
          (await verified.json()).message.includes("Kod MFA telah digunakan")
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, 30_100 - (Date.now() % 30_000)),
          );
          verified = await verify();
        }
        expect(verified.status(), label + " MFA").toBe(200);
      }
      expect(
        (
          await request.post("/api/auth/role", {
            headers,
            data: { roleId: account.role },
          })
        ).status(),
      ).toBe(200);
      const me = await request.get("/api/auth/me");
      expect(me.status(), label + " sesi").toBe(200);
      expect(await me.json()).toMatchObject({
        user: { id: account.id, emailVerified: true },
        activeRole: account.role,
        mfaRequired: false,
      });

      const district = expectedDistricts[label];
      const reviewPath = "/api/synthetic-portal/reviews";
      const browserQueue = district
        ? page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === reviewPath &&
              response.request().method() === "GET",
          )
        : null;
      const delayed = label === "pic-spt";
      const started = delayed
        ? page.waitForRequest(
            (request) => new URL(request.url()).pathname === reviewPath,
          )
        : null;
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      if (delayed)
        await page.route("**" + reviewPath + "?*", async (route) => {
          await held;
          await route.continue();
        });
      const landing = await page.goto("/dashboard");
      expect(landing?.status(), label + " dashboard").toBe(200);
      await expect(
        page.getByRole("heading", { name: /Selamat datang/ }),
      ).toBeVisible();
      if (delayed) {
        try {
          await started;
          await expect(
            page.getByRole("heading", { name: "Tugasan semakan sintetik" }),
          ).toBeVisible();
          await expect(
            page
              .getByRole("status")
              .filter({ hasText: "Memuatkan tugasan latihan" }),
          ).toBeVisible();
          await expect(page.getByText(/Kawasan SPT ·/)).toHaveCount(0);
        } finally {
          release();
        }
      }
      if (label === "pemohon") {
        for (const [scenario, state] of [
          ["single-unit", "SUBMITTED"],
          ["multiple-units", "CORRECTION_REQUESTED"],
          ["district-spt", "SUBMITTED"],
          ["district-sps", "SUBMITTED"],
        ]) {
          const result = await request.get(draft(scenario));
          expect(result.status()).toBe(200);
          const value = await result.json();
          expect(value.reviewStatus).toBe(state);
          submissions.set(scenario, value.latest.id);
        }
        const fresh = await request.post("/api/application-drafts", {
          headers,
          data: { capacity: "INDIVIDUAL" },
        });
        expect(fresh.status()).toBe(201);
        expect((await fresh.json()).status).toBe("DRAFT");
      } else if (label === "wakil") {
        expect((await request.get(draft("company-active"))).status()).toBe(200);
        expect((await request.get(draft("single-unit"))).status()).toBe(404);
      } else if (label === "pentadbir") {
        expect((await request.get("/api/admin/users")).status()).toBe(200);
        expect(
          (await request.get("/api/synthetic-portal/reviews")).status(),
        ).toBe(403);
      } else {
        const queue = await browserQueue!;
        expect(queue.status(), label + " GET semakan dalam pelayar").toBe(200);
        await expect(
          page.getByRole("heading", { name: "Tugasan semakan sintetik" }),
        ).toBeVisible();
        await expect(
          page.getByText(new RegExp(`Kawasan ${district} ·`)),
        ).toBeVisible();
        const url = reviewPath;
        const review = await queue.json();
        expect(review.district).toBe(district);
        const own = submissions.get(
          district === "SPT"
            ? "district-spt"
            : district === "SPS"
              ? "district-sps"
              : "single-unit",
        );
        expect(review.reviews.map(({ id }: { id: string }) => id)).toContain(
          own,
        );
        await expect(
          page.getByRole("article", { name: `Serahan sintetik ${own}` }),
        ).toBeVisible();
        const other = submissions.get(
          district === "SPT" ? "district-sps" : "district-spt",
        );
        expect(
          review.reviews.map(({ id }: { id: string }) => id),
        ).not.toContain(other);
        expect((await request.get(`${url}/${other}/comparison`)).status()).toBe(
          404,
        );
        expect(
          (
            await request.post(`${url}/${other}`, {
              headers,
              data: {
                action: "REQUEST_CORRECTION",
                version: 1,
                reason: "Ujian rentas daerah",
              },
            })
          ).status(),
        ).toBe(404);
        if (label === "pic-sps") {
          expect(
            (
              await request.post(`${url}/${own}`, {
                headers,
                data: {
                  action: "CONFIRM_COMPLETE",
                  version: 1,
                  reason: "Semakan latihan setempat",
                },
              })
            ).status(),
          ).toBe(200);
        }
      }
      expect((await request.post("/api/auth/logout", { headers })).ok()).toBe(
        true,
      );
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
