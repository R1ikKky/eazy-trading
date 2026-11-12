import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("drawing toolbar stays centered, fits laptop heights, and slides away with a persistent restore tab", async ({
  page,
}) => {
  await authenticateTestPage(page, "en");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/replay");
  const rail = page.locator(".drawing-rail");
  await expect(rail).toBeVisible({ timeout: 30000 });
  for (const [width, height] of [
    [1440, 1000],
    [1366, 768],
    [1280, 650],
    [1280, 540],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(async () => {
        const b = (await rail.boundingBox())!;
        return Math.abs(b.y + b.height / 2 - height / 2);
      })
      .toBeLessThan(1);
    const b = (await rail.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(10);
    expect(b.y + b.height).toBeLessThanOrEqual(height - 10);
    expect(
      await rail.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
    ).toBe(true);
    for (const button of await rail.locator(":scope > button").all()) {
      const r = (await button.boundingBox())!;
      expect(r.y).toBeGreaterThanOrEqual(b.y);
      expect(r.y + r.height).toBeLessThanOrEqual(b.y + b.height);
      expect(r.height).toBeGreaterThan(20);
    }
    await page.screenshot({ path: `/tmp/drawing-rail-${width}-${height}.png` });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator('[data-group="lines"]').click();
  await page.locator('.drawing-tool-list [data-tool="trend"]').click();
  const before = (await page.locator("#chartCard").boundingBox())!;
  await page
    .getByRole("button", { name: "Hide drawing toolbar", exact: true })
    .click();
  await expect(rail).toHaveAttribute("aria-hidden", "true");
  expect(await rail.evaluate((el) => el.inert)).toBe(true);
  await expect
    .poll(async () => {
      const r = (await rail.boundingBox())!;
      return r.x + r.width;
    })
    .toBeLessThan(0);
  await expect(page.locator("#chart")).not.toHaveClass(/drawing-mode/);
  await expect
    .poll(async () => (await page.locator("#chartCard").boundingBox())!.width)
    .toBeGreaterThan(before.width + 30);
  await expect(
    page.getByRole("button", { name: "Show drawing toolbar", exact: true }),
  ).toBeVisible();
  for (const width of [1366, 680, 390]) {
    await page.setViewportSize({ width, height: 768 });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const main = document
            .querySelector(".product-main")!
            .getBoundingClientRect();
          const chart = document
            .querySelector("#chartCard")!
            .getBoundingClientRect();
          return Math.abs(chart.left - main.left - (main.right - chart.right));
        }),
      )
      .toBeLessThanOrEqual(1);
    const chart = (await page.locator("#chartCard").boundingBox())!;
    const reveal = (await page.locator(".drawing-rail-reveal").boundingBox())!;
    expect(Math.abs(reveal.x - chart.x)).toBeLessThanOrEqual(2);
    const canvas = (await page.locator("#chart").boundingBox())!;
    expect(reveal.y).toBeGreaterThanOrEqual(canvas.y);
    expect(reveal.y + reveal.height).toBeLessThanOrEqual(
      canvas.y + canvas.height,
    );
    await page.screenshot({ path: `/tmp/collapsed-chart-${width}.png` });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Show drawing toolbar", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.locator('[data-view="sessions"]').click();
  await expect(page.locator(".drawing-rail-reveal")).not.toBeVisible();
  await page.locator('[data-view="replay"]').click();
  await page
    .getByRole("button", { name: "Show drawing toolbar", exact: true })
    .click();
  await expect(rail).toHaveAttribute("aria-hidden", "false");
  await expect
    .poll(async () => (await rail.boundingBox())!.x)
    .toBeGreaterThan(0);
  expect(await rail.evaluate((el) => el.inert)).toBe(false);
  expect(errors).toEqual([]);
});
