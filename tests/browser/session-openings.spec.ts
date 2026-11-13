import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";
test("skip to market openings advances both charts and restores the saved clock", async ({
  page,
}) => {
  await authenticateTestPage(page, "en");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/sessions");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.locator("#setupOpen").click();
  await page.locator("#sessionName").fill("Session openings");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  for (const [id, time] of [
    ["london", "2024-01-08T08:00:00Z"],
    ["new-york", "2024-01-08T14:30:00Z"],
    ["asia", "2024-01-09T00:00:00Z"],
  ]) {
    await page.locator("#sessionSkip").click();
    await expect(page.locator(".session-jump-menu")).toBeVisible();
    if (id === "london")
      await page.screenshot({ path: "/tmp/session-jump-menu.png" });
    await page.locator(`[data-session-opening="${id}"]`).click();
    await expect(page.locator("#saveStatus")).toHaveAttribute(
      "data-state",
      "saved",
      { timeout: 30000 },
    );
    const workspace = await (await page.request.get("/api/workspace")).json();
    const active = workspace.sessions.find(
      (s: any) => s.id === workspace.settings.activeSessionId,
    );
    expect(active.snapshot.currentTime).toBe(Date.parse(time) / 1000);
    await expect(page.locator("#playLabel")).toHaveText("Play");
    await expect(page.locator("#compareChart canvas").first()).toBeVisible();
  }
  const clock = await page.locator("#replayTime").textContent();
  await page.reload();
  await expect(page.locator("#replayTime")).toHaveText(clock!, {
    timeout: 30000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#sessionSkip").click();
  const box = (await page.locator(".session-jump-menu").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(errors).toEqual([]);
});
