import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("older saved sessions enable Back and preserve the original when opening an earlier clean replay", async ({
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
  await page.locator("#sessionName").fill("Older rewind save");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  await page.locator("#step").click();
  await page.locator("#long").click();
  await page.locator("#step").click();
  await page.locator("#step").click();
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.goto("/icon.svg");
  const w = await (await page.request.get("/api/workspace")).json(),
    original = w.sessions.find((s: any) => s.id === w.settings.activeSessionId);
  const originalId = original.id,
    originalState = structuredClone(original.snapshot);
  delete original.snapshot.rewind;
  const response = await page.request.put("/api/workspace", {
    headers: {
      origin: process.env.BROWSER_BASE_URL || "http://127.0.0.1:3100",
    },
    data: w,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto("/replay");
  await expect(page.locator("#quickPositionText")).toContainText("LONG", {
    timeout: 30000,
  });
  await expect(page.locator("#back")).toBeEnabled();
  const dialog = page.getByRole("dialog", { name: "Go back one candle?" });
  await page.locator("#back").click();
  await expect(dialog).toContainText(
    "Your original session and its trades will stay unchanged",
  );
  await dialog.getByRole("button", { name: "Stay here", exact: true }).click();
  await expect(page.locator("#quickPositionText")).toContainText("LONG");
  await page.locator("#back").click();
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "/tmp/legacy-rewind-dialog.png" });
  await dialog
    .getByRole("button", { name: "Open replay", exact: true })
    .click();
  await expect(page.locator("#quickPosition")).not.toBeVisible();
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  const after = await (await page.request.get("/api/workspace")).json(),
    branch = after.sessions.find(
      (s: any) => s.id === after.settings.activeSessionId,
    ),
    kept = after.sessions.find((s: any) => s.id === originalId);
  expect(branch.id).not.toBe(originalId);
  expect(branch.snapshot.index).toBe(originalState.index - 1);
  expect(branch.snapshot.position).toBeNull();
  expect(branch.snapshot.trades).toEqual([]);
  expect(kept.snapshot.index).toBe(originalState.index);
  expect(kept.snapshot.position).toEqual(originalState.position);
  expect(kept.snapshot.trades).toEqual(originalState.trades);
  await page.locator("#back").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  const final = await (await page.request.get("/api/workspace")).json();
  expect(
    final.sessions.find((s: any) => s.id === final.settings.activeSessionId)
      .snapshot.index,
  ).toBe(originalState.index - 2);
  expect(errors).toEqual([]);
});
