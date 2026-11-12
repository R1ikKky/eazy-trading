import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("page identity sits outside Backtesting navigation without duplicate titles or overlap", async ({
  page,
}, info) => {
  await authenticateTestPage(page, "en");
  await page.goto("/journal");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await expect(
    page.getByRole("heading", { name: "Trade journal", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".app-sidebar .brand")).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "Backtesting", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "Replay", exact: true }),
  ).toHaveCount(0);
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const brand = document
        .querySelector(".workspace-identity")!
        .getBoundingClientRect();
      const nav = document
        .querySelector(".app-sidebar")!
        .getBoundingClientRect();
      const content = document
        .querySelector("#view-journal")!
        .getBoundingClientRect();
      return {
        separated: brand.right <= nav.left + 1 || brand.bottom <= nav.top + 1,
        inside:
          brand.left >= 0 &&
          nav.left >= 0 &&
          nav.right <= innerWidth &&
          brand.right <= innerWidth,
        contentBelow: content.top >= Math.max(brand.bottom, nav.bottom),
      };
    });
    expect(layout).toEqual({
      separated: true,
      inside: true,
      contentBelow: true,
    });
    await page.screenshot({ path: info.outputPath(`header-${width}.png`) });
  }
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Sessions", exact: true })
    .click();
  await expect(page.locator(".workspace-page-title")).toHaveText("Sessions");
});
