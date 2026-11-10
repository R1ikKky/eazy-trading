import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";
test.beforeEach(async ({ page }) => {
  await authenticateTestPage(page);
});
test("footprint mode and a deduplicated demo reconnect", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  const initial = await (await page.request.get("/api/workspace")).json();
  const base = initial.sessions.find((s: any) => s.source !== "user_csv");
  await page.locator("[data-view=sessions]").click();
  if (base) {
    await page.locator(`[data-resume="${base.id}"]`).click();
  } else {
    await page.locator("#setupOpen").click();
    await page.locator("#sessionName").fill("Footprint replay");
    await page.locator("#fromDate").fill("2024-01-08");
    await page.locator("#toDate").fill("2024-01-08");
    await page.locator("#setupForm button[type=submit]").click();
    await expect(page.locator("#setupDialog")).not.toBeVisible();
  }

  await expect(page.locator("#view-replay")).toBeVisible();

  // Legacy feed controllers are internal; exercise the engine without exposing its controls.
  await page.locator("#chartDisplay").selectOption("footprint", { force: true });
  await expect(page.locator(".footprint-notice")).toContainText(
    "Tick trade data required",
  );
  await expect(page.locator(".trade-import")).toHaveCount(0);
  const replay = await page.locator("#progressLabel").textContent();
  await page.locator("#chartDisplay").selectOption("candles", { force: true });
  await page.locator("#chartDisplay").selectOption("footprint", { force: true });
  expect(await page.locator("#progressLabel").textContent()).toBe(replay);
  const bounds = await page.locator("#chart").boundingBox();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(250);
  await page.screenshot({ path: "/tmp/footprint-replay.png", fullPage: true });
  await page.locator("#orderflowSource").selectOption("demo", { force: true });
  await expect(page.locator("#feedStatus")).toHaveText("Demo · live", {
    timeout: 15000,
  });
  await expect(page.locator("#long")).toBeDisabled();
  const data = () =>
    page.request.get("/api/orderflow/stream?source=demo").then((r) => r.json());
  await page.locator("#demoDisconnect").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#feedStatus")).toHaveText("Demo · interrupted");
  const before = await data();
  const beforeIds = new Set(before.events.map((e: { id: string }) => e.id));
  await expect(page.locator("#feedStatus")).toHaveText("Demo · live", {
    timeout: 15000,
  });
  const after = await data();
  expect(new Set(after.events.map((e: { id: string }) => e.id)).size).toBe(
    after.events.length,
  );
  const oldAgain = after.events.filter((e: { id: string }) =>
    beforeIds.has(e.id),
  );
  expect(oldAgain).toHaveLength(before.events.length);
  expect(after.events.length).toBeGreaterThan(before.events.length);
  await expect(page.locator("#footprintSummary")).toContainText("NQZ6");
  await page.screenshot({ path: "/tmp/footprint-demo.png", fullPage: true });
  await page.locator("#symbol").selectOption("ES", {force:true});
  await expect(page.locator("#footprintSummary")).toContainText("ESZ6");
  await page.locator("#symbol").selectOption("NQ", {force:true});
  await expect(page.locator("#footprintSummary")).toContainText("NQZ6");
  await page.locator("#orderflowSource").selectOption("replay", { force: true });
  await expect(page.locator("#orderflowSource")).toHaveValue("replay");
  expect(await page.locator("#progressLabel").textContent()).toBe(replay);
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
  );
  await page.reload();
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
  );
  await page.locator("[data-view=replay]").click();
  await page.locator("#chartDisplay").selectOption("footprint", { force: true });
  await expect(page.locator(".footprint-notice")).toContainText(
    "Tick trade data required",
  );
  expect(errors).toEqual([]);
});
