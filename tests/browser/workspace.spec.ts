import { test, expect } from "@playwright/test";
test("paired replay, orders, notes, themes, and session restoration", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  await page.goto("/");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.locator('[data-view="sessions"]').click();
  await expect(page.locator("#view-sessions")).toBeVisible();
  await page.locator("#setupOpen").click();
  await page.locator("#sessionName").fill("Migration browser test");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator("#setupForm button[type=submit]").click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  await expect(page.locator("#view-replay")).toBeVisible();
  await expect(page.locator("#view-replay .page-heading")).toHaveCount(0);
  await expect(page.locator("#view-replay .stats-grid")).toHaveCount(0);
  await expect(page.locator("#setupOpen")).not.toBeVisible();
  await expect(page.locator("#importOpen")).not.toBeVisible();
  await expect(page.locator("#chartError")).not.toBeVisible();
  await expect(page.locator("#chart canvas").first()).toBeVisible();
  await expect(page.locator("#compareChart canvas").first()).toBeVisible();
  await page.locator("#step").click();
  await page.locator("#stop").fill("100");
  await page.locator("#target").fill("100");
  await page.locator("#long").click();
  await expect(page.locator("#positionBox")).toContainText("MARKET");
  await page.locator("#step").click();
  await expect(page.locator("#positionBox")).toContainText("LONG");
  await page.locator('[data-action="close"]').click();
  await page.locator("#step").click();
  await expect(page.locator("#positionBox")).toContainText("Вне позиции");
  await page.locator(".replay-notes summary").click();
  await page.locator("#sessionNotes").fill("Persist this migration note");
  await page.locator("#themeToggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
  );
  await page.screenshot({ path: "/tmp/replay-migration.png", fullPage: true });
  const before = await (await page.request.get("/api/workspace")).json();
  const session = before.sessions.find(
    (s: { id: string }) => s.id === before.settings.activeSessionId,
  );
  expect(session.snapshot.trades).toHaveLength(1);
  expect(session.comparisonDatasetId).toBeTruthy();
  await page.reload();
  await expect(page.locator("#sessionNotes")).toHaveValue(
    "Persist this migration note",
    { timeout: 45000 },
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
});
