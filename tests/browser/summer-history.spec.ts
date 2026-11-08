import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("paired summer history loads through normal session controls and preserves replay on reload", async ({
  page,
}) => {
  await authenticateTestPage(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.locator("[data-view=sessions]").click();
  await page.locator("#setupOpen").click();
  await page.locator("#sessionNQ").check();
  await page.locator("#sessionES").check();
  const name = "Summer gap check " + Date.now();
  await page.locator("#sessionName").fill(name);
  await page.locator("#fromDate").fill("2026-07-15");
  await page.locator("#toDate").fill("2026-08-20");
  await page.locator("#setupForm button[type=submit]").click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  await expect(page.locator("#chart canvas").first()).toBeVisible();
  await expect(page.locator("#compareChart canvas").first()).toBeVisible();
  await page.locator("#step").click();
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  const workspace = await (await page.request.get("/api/workspace")).json();
  const session = workspace.sessions.find((s: any) => s.name === name);
  expect(session.datasetId).toBe("curated-NQ-history-2024-2026-v3");
  expect(session.comparisonDatasetId).toBe("curated-ES-history-2024-2026-v2");
  await page.reload();
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.waitForFunction(() =>
    document.getElementById("rangeLabel")?.textContent?.includes("2026"),
  );
  await page.locator("[data-view=replay]").click();
  await expect(page.locator("#chart canvas").first()).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator("#compareChart canvas").first()).toBeVisible();
  const restored = await (await page.request.get("/api/workspace")).json();
  expect(
    restored.sessions.find((s: any) => s.id === session.id).snapshot,
  ).toEqual(session.snapshot);
  expect(errors).toEqual([]);
});
