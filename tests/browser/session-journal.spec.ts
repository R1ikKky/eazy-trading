import { expect, test } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("right journal follows only the current session, supports review, rewind and collapse", async ({
  page,
}) => {
  test.setTimeout(90000);
  await authenticateTestPage(page, "en");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const panel = page.locator("#replayJournal"),
    rows = panel.locator("[data-session-trade]");
  const saved = () =>
    expect(page.locator("#saveStatus")).toHaveAttribute("data-state", "saved", {
      timeout: 30000,
    });
  const workspace = async () =>
    (await page.request.get("/api/workspace", { maxRetries: 2 })).json();
  const active = async () => {
    await saved();
    const state = await workspace();
    return state.sessions.find(
      (s: any) => s.id === state.settings.activeSessionId,
    );
  };
  const create = async (name: string) => {
    await page.goto("/sessions");
    await saved();
    await page.locator("#setupOpen").click();
    await page.locator("#sessionName").fill(name);
    await page.locator("#fromDate").fill("2024-01-08");
    await page.locator("#toDate").fill("2024-01-12");
    await page.locator('#setupForm button[type="submit"]').click();
    await expect(page.locator("#setupDialog")).not.toBeVisible({
      timeout: 45000,
    });
    await expect(page.locator("#lastPrice")).toHaveText(/[0-9]/);
    await expect(panel).toBeVisible();
  };
  await create("Session journal A");
  await expect(panel).toContainText("Session journal A");
  await expect(rows).toHaveCount(0);
  await expect(panel).toContainText(
    "Closed trades from this session will appear here.",
  );
  const a = (await active()).id;
  const chart = (await page.locator("#chartCard").boundingBox())!,
    bounds = (await panel.boundingBox())!;
  expect(bounds.x - chart.x - chart.width).toBeCloseTo(12, 0);
  expect(bounds.y).toBeCloseTo(chart.y, 0);
  expect(bounds.height).toBeCloseTo(chart.height, 0);
  await page.locator("#long").click();
  await expect(page.locator("#replayJournalCurrent")).toContainText(
    "Open position",
  );
  await expect(page.locator("#replayJournalCurrent")).toContainText("Long");
  await expect(rows).toHaveCount(0);
  await page.locator("#quickClose").click();
  await page.locator("#step").click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator("#replayJournalCurrent")).not.toBeVisible();
  const trade = (await active()).snapshot.trades[0];
  await expect(rows.first()).toContainText(trade.entry.toFixed(2));
  await expect(rows.first()).toContainText(trade.exit.toFixed(2));
  const pnl =
    (trade.pnl < 0 ? "−" : "") +
    "$" +
    Math.abs(trade.pnl).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  await expect(page.locator("#replayJournalSummary strong").first()).toHaveText(
    pnl,
  );
  await rows.first().click();
  await expect(page.locator("#tradeDetailDialog")).toBeVisible();
  await page.locator("#tradeNote").fill("Waited for the setup <not HTML>");
  await page.locator('#tradeNoteForm button[type="submit"]').click();
  await expect(rows.first()).toContainText("Waited for the setup <not HTML>");
  // A replay step with no trade changes must preserve the existing row DOM and focus.
  const originalRow = await rows.first().elementHandle();
  await page.locator("#step").click();
  expect(await originalRow!.evaluate((el) => el.isConnected)).toBe(true);
  // Rewind once without financial changes, then once across the close execution.
  await page.locator("#back").click();
  await page.locator("#back").click();
  await page
    .getByRole("dialog", { name: "Go back one candle?" })
    .getByRole("button", { name: "Rewind candle", exact: true })
    .click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator("#replayJournalCurrent")).toBeVisible();
  await page.locator("#step").click();
  await expect(rows).toHaveCount(1);
  await saved();
  await page.screenshot({ path: "/tmp/session-journal-desktop.png" });
  await page.locator("#replayJournalHide").click();
  await expect(panel).not.toBeVisible();
  const reveal = page.locator("#replayJournalShow");
  await expect(reveal).toBeFocused();
  await expect(reveal).toHaveAttribute("aria-expanded", "false");
  const fullChart = (await page.locator("#chartCard").boundingBox())!;
  expect(fullChart.width).toBeGreaterThan(chart.width + 300);
  const revealBox = (await reveal.boundingBox())!,
    plot = (await page.locator("#chart").boundingBox())!;
  expect(
    Math.abs(revealBox.y + revealBox.height / 2 - plot.y - plot.height / 2),
  ).toBeLessThan(2);
  expect(revealBox.x + revealBox.width).toBeCloseTo(
    fullChart.x + fullChart.width,
    0,
  );
  await page.reload();
  await expect(page.locator("#lastPrice")).toHaveText(/[0-9]/, {
    timeout: 30000,
  });
  await expect(panel).not.toBeVisible();
  await reveal.click();
  await expect(panel).toBeVisible();
  await expect(page.locator("#replayJournalHide")).toBeFocused();
  await expect(rows).toHaveCount(1);
  await page.locator("[data-rail-hide]").click();
  await expect(page.locator(".drawing-rail-reveal")).toBeVisible();
  await expect(panel).toBeVisible();
  await create("Session journal B");
  await expect(panel).toContainText("Session journal B");
  await expect(rows).toHaveCount(0);
  await page.goto("/sessions");
  await saved();
  await expect(panel).not.toBeVisible();
  await expect(reveal).not.toBeVisible();
  await page.locator(`[data-resume="${a}"]`).click();
  await expect(panel).toContainText("Session journal A");
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Yellow", exact: true }).check();
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = (await panel.boundingBox())!;
  expect(mobile.x).toBeGreaterThanOrEqual(0);
  expect(mobile.x + mobile.width).toBeLessThanOrEqual(390);
  expect(mobile.y + mobile.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "/tmp/session-journal-mobile.png" });
  await page.locator("#replayJournalHide").click();
  await expect(reveal).toBeVisible();
  await expect(page.locator("#long")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile starts collapsed and shows the journal from the right edge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticateTestPage(page, "en");
  await page.goto("/replay");
  await expect(page.locator("#lastPrice")).toHaveText(/[0-9]/, {
    timeout: 30000,
  });
  await expect(page.locator("#replayJournal")).not.toBeVisible();
  await page.locator("#replayJournalShow").click();
  await expect(page.locator("#replayJournal")).toBeVisible();
  await page.locator("#replayJournalHide").click();
  await expect(page.locator("#replayJournalShow")).toBeFocused();
});
