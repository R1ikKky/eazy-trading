import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";
test.beforeEach(async ({ page }) => authenticateTestPage(page));
test("icon-only profile and persistent Dark, Yellow and Blue appearance settings", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/sessions");
  await expect(page.locator("#saveStatus")).toHaveAttribute("data-state", "saved", { timeout: 30000 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".profile-trigger > span")).toHaveCount(1);
  const backgrounds = new Set<string>();
  for (const theme of ["Dark", "Yellow", "Blue"] as const) {
    await page.getByRole("button", { name: "Настройки оформления", exact: true }).click();
    await expect(page.getByRole("radio")).toHaveCount(3);
    await page.getByRole("radio", { name: theme, exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());
    backgrounds.add(await page.locator(".app-shell").evaluate((element) => getComputedStyle(element).backgroundColor));
    await page.screenshot({ path: `/tmp/appearance-${theme.toLowerCase()}.png` });
    await page.getByRole("button", { name: "Закрыть настройки оформления", exact: true }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());
  }
  expect(backgrounds.size).toBe(3);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole("button", { name: "Настройки оформления", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Blue", exact: true })).toBeChecked();
  const bounds = (await page.locator(".appearance-settings").boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: "/tmp/appearance-mobile.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Настройки профиля", exact: true }).click();
  await expect(page.getByLabel("Отображаемое имя", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
