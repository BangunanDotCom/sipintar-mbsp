import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { totp } from "../../apps/api/src/auth";

test("hosted demo rehearses HTTPS, admin MFA, applicant registration and bounded concurrency", async ({
  page,
  playwright,
  request,
  baseURL,
}) => {
  test.skip(process.env.STAYLINK_HTTPS_REHEARSAL !== "true");
  test.setTimeout(60_000);
  const kitPath = process.env.STAYLINK_UAT_KIT_FILE;
  if (!kitPath) throw Error("Kit latihan belum disediakan.");
  const kit = JSON.parse(await readFile(kitPath, "utf8")) as {
    accounts: {
      label: string;
      email: string;
      password: string;
      mfaSecretBase32: string;
    }[];
  };
  expect(kit.accounts).toHaveLength(6);
  const admin = kit.accounts.find(({ label }) => label === "pentadbir")!;
  const edge = await page.goto("/log-masuk");
  expect(edge?.ok()).toBe(true);
  expect(edge?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect((await request.get("/assets/missing-demo-file.js")).status()).toBe(
    404,
  );
  const missingApi = await request.get("/api/demo-not-found");
  expect(missingApi.status()).toBe(404);
  expect(missingApi.headers()["content-type"]).toContain("application/json");
  expect((await request.get("/api/docs/json")).status()).toBe(200);

  const login = await page.request.post("/api/auth/login", {
    data: { email: admin.email, password: admin.password },
  });
  expect(login.status()).toBe(200);
  const cookie = login.headers()["set-cookie"] ?? "";
  expect(
    ["Secure", "HttpOnly", "SameSite=Strict"].every((flag) =>
      cookie.includes(flag),
    ),
  ).toBe(true);
  expect((await login.json()).mfaRequired).toBe(true);
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);
  const headers = {
    Origin: baseURL!,
    "X-CSRF-Token": (await login.json()).csrf,
  };
  expect(
    (
      await page.request.post("/api/auth/mfa/verify", {
        headers,
        data: { code: totp(admin.mfaSecretBase32).generate() },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/auth/role", {
        headers: { ...headers, Origin: "https://wrong.example.test" },
        data: { roleId: "PENTADBIR_ICT" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/auth/role", {
        headers,
        data: { roleId: "PENTADBIR_ICT" },
      })
    ).status(),
  ).toBe(200);
  expect((await page.request.get("/api/admin/users")).status()).toBe(200);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /Selamat datang/ }),
  ).toBeVisible();
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }

  const identifier = randomBytes(5).toString("hex");
  const registration = {
    name: "Data Latihan Portal",
    identificationNumber: `UJIAN${identifier}`,
    phone: "0100000000",
    password: `Aa1!${randomBytes(20).toString("hex")}`,
    consent: true,
  };
  expect(
    (
      await request.post("/api/auth/register", {
        data: { ...registration, email: "blocked@invalid.test" },
      })
    ).status(),
  ).toBe(400);
  const email = `demo-${identifier}@example.test`;
  const registered = await request.post("/api/auth/register", {
    data: { ...registration, email },
  });
  expect(registered.status()).toBe(201);
  const mailbox = await request.get(
    `http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent("to:" + email)}`,
  );
  const [message] = (await mailbox.json()).messages;
  expect(Boolean(message?.ID)).toBe(true);
  const mail = await request.get(
    `http://127.0.0.1:8025/api/v1/message/${message.ID}`,
  );
  const token = ((await mail.json()).Text as string).match(
    /https:\/\/localhost:5443\/aktifkan\?type=VERIFY_EMAIL&token=[a-f0-9]+/,
  )?.[0];
  expect(Boolean(token)).toBe(true);
  await page.goto(token!);
  await page.getByRole("button", { name: "Sahkan Akaun" }).click();
  await expect(page.getByRole("status")).toContainText("Berjaya");

  const concurrent = kit.accounts.filter(({ label }) =>
    ["pemohon", "wakil", "pic-spu", "ppsk", "pic-spt"].includes(label),
  );
  const isolated = await Promise.all(
    concurrent.map(() =>
      playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true }),
    ),
  );
  try {
    const loginStart = performance.now();
    const loggedIn = await Promise.all(
      isolated.map((client, index) =>
        client.post("/api/auth/login", {
          data: {
            email: concurrent[index].email,
            password: concurrent[index].password,
          },
        }),
      ),
    );
    expect(loggedIn.map((item) => item.status())).toEqual([
      200, 200, 200, 200, 200,
    ]);
    const sessions = await Promise.all(
      isolated.map((client) => client.get("/api/auth/me")),
    );
    expect(sessions.map((item) => item.status())).toEqual([
      200, 200, 200, 200, 200,
    ]);
    const identities = await Promise.all(sessions.map((item) => item.json()));
    expect(new Set(identities.map((item) => item.user.id)).size).toBe(5);
    console.info(
      `Lima akaun berasingan menyelesaikan log masuk dan bacaan sesi dalam ${Math.round(performance.now() - loginStart)} ms.`,
    );
    const sptIndex = concurrent.findIndex(({ label }) => label === "pic-spt");
    const picSpt = isolated[sptIndex];
    const spt = identities[sptIndex];
    const sptHeaders = { Origin: baseURL!, "X-CSRF-Token": spt.csrf };
    expect(spt.mfaRequired).toBe(true);
    expect(
      (
        await picSpt.post("/api/auth/mfa/verify", {
          headers: sptHeaders,
          data: { code: totp(concurrent[sptIndex].mfaSecretBase32).generate() },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await picSpt.post("/api/auth/role", {
          headers: sptHeaders,
          data: { roleId: "PIC_KAWASAN" },
        })
      ).status(),
    ).toBe(200);
    const current = await picSpt.get("/api/auth/me");
    expect((await current.json()).roles).toEqual([
      expect.objectContaining({ id: "PIC_KAWASAN", districtId: "SPT" }),
    ]);
    expect((await picSpt.get("/api/synthetic-portal/reviews")).status()).toBe(
      404,
    );
    expect((await picSpt.get("/api/admin/users")).status()).toBe(403);
  } finally {
    await Promise.all(isolated.map((client) => client.dispose()));
  }
  const start = performance.now();
  const samples = await Promise.all(
    Array.from({ length: 6 }, () => request.get("/api/health")),
  );
  expect(samples.map((sample) => sample.status())).toEqual([
    200, 200, 200, 200, 200, 200,
  ]);
  console.info(
    `Enam permintaan health serentak melalui Nginx/TLS selesai dalam ${Math.round(performance.now() - start)} ms.`,
  );
});
