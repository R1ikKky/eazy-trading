import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";
test.beforeEach(async ({ page }) => authenticateTestPage(page));
test("workspace URLs support deep links, history, and navigation without saves", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/sessions");
  await expect(page.locator("#rangeLabel")).toContainText(/\d{4}/, { timeout: 30000 });
  await expect(page.locator("#saveStatus")).toHaveAttribute("data-state", "saved", { timeout: 30000 });
  await page.waitForTimeout(1200);
  const before = await (await page.request.get("/api/workspace")).json();
  let saves = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/workspace" && request.method() === "PUT") saves++;
  });
  const chart = await page.locator("#chart").elementHandle();
  for (const [view, path] of [["journal", "/journal"], ["analytics", "/analytics"], ["sessions", "/sessions"]]) {
    await page.locator(`[data-view="${view}"]`).click();
    await expect(page).toHaveURL(new RegExp(path + "$"));
    await expect(page.locator(`#view-${view}`)).toBeVisible();
    const nav=(await page.locator('.app-sidebar').boundingBox())!;
    expect(nav.y).toBeLessThan(40);expect(nav.height).toBeLessThan(80);
    expect((await page.locator('.app-shell').boundingBox())!.x).toBeLessThan(20);
    expect((await page.locator(`#view-${view} .view-heading`).boundingBox())!.y).toBeGreaterThan(nav.y+nav.height);

  }
  await page.locator('[data-view="playbooks"]').click();
  await expect(page).toHaveURL(/\/strategies$/);
  await expect(page.locator("#view-playbooks")).toBeVisible();
  expect((await page.locator('.app-sidebar').boundingBox())!.height).toBeLessThan(80);
  await page.goBack();
  await expect(page).toHaveURL(/\/sessions$/);
  await expect(page.locator("#view-sessions")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/strategies$/);
  await expect(page.locator("#view-playbooks")).toBeVisible();
  await page.locator('[data-view="replay"]').click();
  await expect(page).toHaveURL(/\/replay$/);
  await expect(page.locator("#view-replay")).toBeVisible();
  expect(await chart!.evaluate((element) => element === document.getElementById("chart"))).toBe(true);
  await page.locator('[data-view="sessions"]').focus();
  await page.keyboard.press("s");
  await page.waitForTimeout(1200);
  expect(saves).toBe(0);
  const after = await (await page.request.get("/api/workspace")).json();
  expect(after.sessions).toEqual(before.sessions);
  await page.goto("/journal");
  await expect(page.locator("#journalSearch")).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.locator("#journalSearch")).toBeVisible({ timeout: 30000 });
  await page.goto("/replay");
  await expect(page.locator("#chart canvas").first()).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/\/replay$/);
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    for(const view of ['sessions','journal','analytics']) {
      await page.locator(`[data-view="${view}"]`).click();
      await expect(page.locator(`#view-${view}`)).toBeVisible();
      const nav=(await page.locator('.app-sidebar').boundingBox())!;
      expect(nav.x).toBeGreaterThanOrEqual(0);expect(nav.x+nav.width).toBeLessThanOrEqual(width);
      expect(nav.y).toBeLessThan(30);expect(nav.height).toBeLessThan(65);
      await page.screenshot({path:`/tmp/top-navigation-${view}-${width}.png`});
    }
  }
  expect(errors).toEqual([]);
});
