import { expect, test } from "@playwright/test";
import { authenticateTestPage, chooseTheme } from "./auth-helper";

test("chart dialogs follow the site theme and leave the page backdrop clear", async ({ page }) => {
  await authenticateTestPage(page);
  await page.goto("/replay");
  await expect(page.locator("#lastPrice")).toHaveText(/[0-9]/, { timeout: 30000 });

  for (const theme of ["Yellow", "Dark", "Blue"] as const) {
    await chooseTheme(page, theme);
    await page.locator("#settingsOpen").click();
    const dialog = page.locator("#settingsDialog");
    await expect(dialog).toBeVisible();
    const colors = await dialog.evaluate((element) => {
      const probe = document.createElement("div");
      probe.style.background = "var(--surface)";
      probe.style.color = "var(--text)";
      document.body.append(probe);
      const surface = getComputedStyle(probe).backgroundColor;
      const text = getComputedStyle(probe).color;
      probe.style.background = "var(--surface-raised)";
      const raised = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const backdrop = getComputedStyle(element, "::backdrop");
      const tab = element.querySelector('[role="tab"][aria-selected="true"]')!;
      return {
        surface, text, raised,
        dialogSurface: getComputedStyle(element).backgroundColor,
        title: getComputedStyle(element.querySelector("#settingsTitle")!).color,
        tabSurface: getComputedStyle(tab).backgroundColor,
        tabText: getComputedStyle(tab).color,
        backdrop: backdrop.backgroundColor,
        blur: backdrop.backdropFilter,
      };
    });
    expect(colors.dialogSurface).toBe(colors.surface);
    expect(colors.title).toBe(colors.text);
    expect(colors.tabSurface).toBe(colors.raised);
    expect(colors.tabText).toBe(colors.text);
    expect(colors.backdrop).toBe("rgba(0, 0, 0, 0)");
    expect(colors.blur).toBe("none");
    await page.screenshot({ path: `/tmp/chart-settings-${theme.toLowerCase()}.png` });

    const swatch = dialog.locator(".tv-swatch").first();
    const candleColor = await swatch.locator("span").evaluate((el) => getComputedStyle(el).backgroundColor);
    await swatch.click();
    await expect(page.locator("#chartPalette")).toBeVisible();
    expect(await page.locator("#chartPalette").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(colors.surface);
    expect(await swatch.locator("span").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(candleColor);
    await page.keyboard.press("Escape");
    await page.locator("#settingsCancel").click();
    await expect(dialog).not.toBeVisible();
  }

  await chooseTheme(page, "Yellow");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#settingsOpen").click();
  const bounds = (await page.locator("#settingsDialog").boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await expect(page.locator("#settingsCancel")).toBeInViewport();
  await page.screenshot({ path: "/tmp/chart-settings-yellow-mobile.png" });
  await page.locator("#settingsCancel").click();

  // Exercise the shared backdrop against each dialog's more specific legacy styles.
  const backdrops = await page.evaluate(() => {
    return ["", "rewind-dialog", "mt5-modal", "drawing-text-dialog", "tv-data-dialog"].map((className) => {
      const dialog = document.createElement("dialog");
      dialog.className = className;
      document.body.append(dialog);
      dialog.showModal();
      const style = getComputedStyle(dialog, "::backdrop");
      const result = { className, background: style.backgroundColor, filter: style.backdropFilter };
      dialog.close();
      dialog.remove();
      return result;
    });
  });
  for (const backdrop of backdrops) {
    expect(backdrop.background, backdrop.className).toBe("rgba(0, 0, 0, 0)");
    expect(backdrop.filter, backdrop.className).toBe("none");
  }
});
