import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";
test("eazy trading branding preserves preferences and favorites from the previous name", async ({
  page,
}) => {
  await authenticateTestPage(page, null);
  const me = await (await page.request.get("/api/auth/me")).json();
  await page.addInitScript((owner) => {
    if (localStorage.getItem("eazy-trading-storage-migrated-v1")) return;
    localStorage.setItem("replay-lab-theme", "forest");
    localStorage.setItem("replay-lab-language", "en");
    localStorage.setItem(
      "replay-lab-drawing-ui:" + owner,
      JSON.stringify({
        favorites: ["trend"],
        showFavorites: true,
        position: { x: 350, y: 160 },
      }),
    );
    localStorage.setItem(
      "replay-lab-template",
      JSON.stringify({ drawingWidth: 3 }),
    );
  }, me.id);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/sessions");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await expect(page).toHaveTitle("Sessions · eazy trading");
  await expect(
    page.getByRole("link", { name: "eazy trading", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "forest");
  expect(
    await page.evaluate(() => localStorage.getItem("eazy-trading-template")),
  ).toBe('{"drawingWidth":3}');
  const brand = page.locator(".brand");
  expect(await brand.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "/tmp/eazy-trading-sessions.png" });
  await page.locator('[data-view="replay"]').click();
  await expect(page).toHaveTitle("Replay · eazy trading");
  await expect(
    page.locator('.drawing-favorites [data-tool="trend"]'),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/eazy-trading-replay.png" });
  await page.reload();
  await expect(
    page.locator('.drawing-favorites [data-tool="trend"]'),
  ).toBeVisible({ timeout: 30000 });
  await page.goto("/login");
  await expect(page.locator(".auth-brand")).toHaveText("eazy trading");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({ path: "/tmp/eazy-trading-login-mobile.png" });
  expect(
    await page
      .locator(".auth-brand")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  expect(errors).toEqual([]);
});
