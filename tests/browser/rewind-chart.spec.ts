import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";
import { trackGestureCharts, drawLevels } from "./chart-gesture-helper";

test("rewind confirms discarded orders, protection edits and closes, with chart-created SL/TP", async ({
  page,
}) => {
  await authenticateTestPage(page, "en");
  await trackGestureCharts(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/sessions");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.locator("#setupOpen").click();
  await page
    .locator("#sessionName")
    .fill("Logical rewind and drawn protections");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  const state = async () => {
    const w = await (await page.request.get("/api/workspace")).json();
    return w.sessions.find((s: any) => s.id === w.settings.activeSessionId)
      .snapshot;
  };
  const at = async (index: number) =>
    expect.poll(async () => (await state()).index).toBe(index);
  const back = async (accept: boolean, phrase: string) => {
    const dialogEvent = page.waitForEvent("dialog"),
      click = page.locator("#back").click();
    const dialog = await dialogEvent;
    expect(dialog.message()).toContain(phrase);
    if (accept) await dialog.accept();
    else await dialog.dismiss();
    await click;
  };
  await expect(page.locator("#stop,#target")).toHaveCount(0);
  await expect(page.locator("#back")).toBeDisabled();
  await page.locator("#step").click();
  await at(1);
  await page.locator("#long").click();
  await expect.poll(async () => (await state()).position?.side).toBe(1);
  let p = (await state()).position;
  expect(p.sl).toBeNull();
  expect(p.tp).toBeNull();
  await drawLevels(page, p.entry, p.entry - 12, p.entry + 24);
  p = (await state()).position;
  expect(p.sl).toBe(p.entry - 12);
  expect(p.tp).toBe(p.entry + 24);
  await page.locator("#step").click();
  await page.locator("#step").click();
  await at(3);
  const drag = await page.evaluate(
    ({ from, to }) => {
      const c = (window as any).__gestureCharts.find(
          (c: any) => c.id === "chart",
        ),
        b = document.getElementById("chart")!.getBoundingClientRect();
      return {
        x: b.x + c.chart.paneSize().width * 0.55,
        y: b.y + c.series.priceToCoordinate(from),
        end: b.y + c.series.priceToCoordinate(to),
      };
    },
    { from: p.sl, to: p.entry - 8 },
  );
  await page.mouse.move(drag.x, drag.y);
  await page.mouse.down();
  await page.mouse.move(drag.x, drag.end, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await state()).position.sl).toBe(p.entry - 8);
  await back(false, "SL/TP");
  await at(3);
  expect((await state()).position.sl).toBe(p.entry - 8);
  await back(true, "SL/TP");
  await at(2);
  expect((await state()).position.sl).toBe(p.entry - 12);
  await page.locator("#back").click();
  await at(1);
  await back(true, "Orders");
  await at(0);
  expect((await state()).position).toBeNull();
  await expect(page.locator("#back")).toBeDisabled();
  await page.locator("#step").click();
  await at(1);
  await page.locator("#short").click();
  await expect.poll(async () => (await state()).position?.side).toBe(-1);
  p = (await state()).position;
  await drawLevels(page, p.entry, p.entry + 12, p.entry - 24);
  expect((await state()).position.sl).toBe(p.entry + 12);
  expect((await state()).position.tp).toBe(p.entry - 24);
  await page.locator("#step").click();
  await at(2);
  const entryControl = page.locator("#chart .position-entry-control");
  await entryControl.locator(".position-entry-label").hover();
  await entryControl
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect.poll(async () => (await state()).trades.length).toBe(1);
  await back(false, "Trade executions");
  expect((await state()).trades).toHaveLength(1);
  await back(true, "Trade executions");
  await at(1);
  expect((await state()).trades).toHaveLength(0);
  expect((await state()).position.side).toBe(-1);
  await page.reload();
  await expect(page.locator("#quickPositionText")).toContainText("SHORT", {
    timeout: 30000,
  });
  await expect(page.locator("#back")).toBeEnabled();
  await back(true, "Orders");
  await at(0);
  expect((await state()).position).toBeNull();
  const future = await page.evaluate(
    (time) =>
      (window as any).__gestureCharts.some((c: any) =>
        c.series.data().some((b: any) => b.time > time),
      ),
    (await state()).currentTime,
  );
  expect(future).toBe(false);
  await page.screenshot({ path: "/tmp/rewind-chart-controls.png" });
  expect(errors).toEqual([]);
});
