import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
// Visibility deliberately reveals an ephemeral test value. Do not save traces or
// screenshots of that state; review screenshots below contain empty fields only.
test.use({ trace: "off" });
for (const [label, path] of [
  ["register", "/daftar"],
  ["login", "/log-masuk"],
  ["reset", "/aktifkan?type=RESET_PASSWORD&token=" + "0".repeat(64)],
]) {
  test(`password visibility is keyboard accessible and does not submit ${label}`, async ({
    page,
  }) => {
    const writes: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST") writes.push(new URL(r.url()).pathname);
    });
    await page.goto(path);
    const input = page.locator('input[name="password"]');
    const secret = "Aa1!" + randomBytes(18).toString("hex");
    await input.fill(secret);
    const toggle = page.getByRole("button", {
      name: "Tunjukkan kata laluan",
      exact: true,
    });
    await expect(input).toHaveAttribute("type", "password");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(await toggle.getAttribute("aria-controls")).toBe(
      await input.getAttribute("id"),
    );
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(input).toHaveAttribute("type", "text");
    const hide = page.getByRole("button", {
      name: "Sembunyikan kata laluan",
      exact: true,
    });
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await expect(hide).toBeFocused();
    expect(
      await input.evaluate(
        (node: HTMLInputElement, value) => node.value === value,
        secret,
      ),
    ).toBe(true);
    await page.keyboard.press("Enter");
    await expect(input).toHaveAttribute("type", "password");
    expect(
      await input.evaluate(
        (node: HTMLInputElement, value) => node.value === value,
        secret,
      ),
    ).toBe(true);
    expect(writes).toEqual([]);
  });
}
test("password control has a touch target and fits mobile without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/daftar");
  const box = await page
    .getByRole("button", { name: "Tunjukkan kata laluan", exact: true })
    .boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('input[name="password"]')).toHaveAccessibleName(
    "Kata laluan",
  );
});
