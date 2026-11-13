import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("SL and TP drag between panes and execution history has exact arrows and dashed direction lines", async ({
  page,
}) => {
  await authenticateTestPage(page, "en");
  await page.addInitScript(() => {
    let library: any;
    const tracked: any[] = [];
    (window as any).__executionCharts = tracked;
    Object.defineProperty(window, "LightweightCharts", {
      configurable: true,
      get: () => library,
      set(value) {
        library = {
          ...value,
          createChart(...args: any[]) {
            const chart = value.createChart(...args),
              add = chart.addSeries.bind(chart);
            chart.addSeries = (...options: any[]) => {
              const series = add(...options);
              if (options[0] === value.CandlestickSeries) {
                const state = {
                  id: args[0].id,
                  chart,
                  series,
                  history: null as any,
                };
                tracked.push(state);
                const attach = series.attachPrimitive.bind(series);
                series.attachPrimitive = (primitive: any) => {
                  if (primitive.setHistory) state.history = primitive;
                  attach(primitive);
                };
              }
              return series;
            };
            return chart;
          },
        };
      },
    });
  });
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
    .fill("Execution arrows and draggable levels");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  await page.locator("#comparisonTitle").click();
  await page.getByRole("menuitemradio", { name: /^NQ / }).click();
  await page.locator("#qty").fill("2");
  await page.locator("#stop").fill("40");
  await page.locator("#target").fill("80");
  await page.locator("#long").click();
  await expect(page.locator("#quickPositionText")).toContainText("LONG");
  const active = async () => {
    const w = await (await page.request.get("/api/workspace")).json();
    return w.sessions.find((s: any) => s.id === w.settings.activeSessionId)
      .snapshot;
  };
  await expect.poll(async () => (await active()).position?.side).toBe(1);
  const initial = (await active()).position;
  const ranges = () =>
    page.evaluate(() =>
      (window as any).__executionCharts.map((c: any) => ({
        time: c.chart.timeScale().getVisibleLogicalRange(),
        price: c.series.priceScale().getVisibleRange(),
      })),
    );
  const before = await ranges();
  const drag = async (id: string, from: number, to: number, cancel = false) => {
    const points = await page.evaluate(
      ({ id, from, to }) => {
        const c = (window as any).__executionCharts.find(
            (c: any) => c.id === id,
          ),
          box = document.getElementById(id)!.getBoundingClientRect();
        return {
          x: box.x + box.width * 0.55,
          y: box.y + c.series.priceToCoordinate(from),
          end: box.y + c.series.priceToCoordinate(to),
        };
      },
      { id, from, to },
    );
    await page.mouse.move(points.x, points.y);
    await page.mouse.down();
    await page.mouse.move(points.x, points.end, { steps: 10 });
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
  };
  await drag("chart", initial.sl, initial.sl - 4);
  await expect
    .poll(async () => (await active()).position.sl)
    .toBe(initial.sl - 4);
  await drag("compareChart", initial.tp, initial.tp + 8);
  await expect
    .poll(async () => (await active()).position.tp)
    .toBe(initial.tp + 8);
  const saved = (await active()).position;
  await drag("chart", saved.sl, saved.sl - 4, true);
  await page.waitForTimeout(100);
  expect((await active()).position.sl).toBe(saved.sl);
  const after = await ranges();
  for (let i = 0; i < 2; i++)
    for (const axis of ["time", "price"] as const)
      for (const bound of ["from", "to"])
        expect(after[i][axis][bound]).toBeCloseTo(before[i][axis][bound], 5);
  await page.locator("#quickClose").click();
  await page.locator("#step").click();
  await expect.poll(async () => (await active()).trades.length).toBe(1);
  const trade = (await active()).trades[0];
  const assertHistory = async (expected: any, color: string) => {
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).__executionCharts.filter(
              (c: any) => c.history && c.series.data().length,
            ).length,
        ),
      )
      .toBe(2);
    const drawn = await page.evaluate(() =>
      (window as any).__executionCharts.map((c: any) => {
        const fills: any[] = [],
          lines: any[] = [];
        let path: any[] = [],
          dash: number[] = [];
        const ctx = {
          strokeStyle: "",
          fillStyle: "",
          lineWidth: 0,
          save() {},
          restore() {},
          rect() {},
          clip() {},
          beginPath() {
            path = [];
          },
          moveTo(x: number, y: number) {
            path.push([x, y]);
          },
          lineTo(x: number, y: number) {
            path.push([x, y]);
          },
          closePath() {},
          setLineDash(d: number[]) {
            dash = d;
          },
          stroke() {
            lines.push({
              path: [...path],
              dash: [...dash],
              color: this.strokeStyle,
            });
          },
          fill() {
            fills.push({ path: [...path], color: this.fillStyle });
          },
        };
        c.history
          .paneViews()[0]
          .renderer()
          .draw({
            useMediaCoordinateSpace: (fn: any) =>
              fn({ context: ctx, mediaSize: c.chart.paneSize() }),
          });
        return { fills, lines, data: c.series.data().map((b: any) => b.time) };
      }),
    );
    const coords = await page.evaluate(
      (t) =>
        (window as any).__executionCharts.map((c: any) => ({
          entry: [
            c.chart.timeScale().timeToCoordinate(t.time),
            c.series.priceToCoordinate(t.entry),
          ],
          exit: [
            c.chart.timeScale().timeToCoordinate(t.exitTime),
            c.series.priceToCoordinate(t.exits[0].price),
          ],
        })),
      expected,
    );
    for (let i = 0; i < 2; i++) {
      const line = drawn[i].lines.find((l: any) => l.color === color);
      expect(line).toBeTruthy();
      expect(line.dash).toEqual([5, 4]);
      expect(line.path).toEqual([coords[i].entry, coords[i].exit]);
      expect(
        drawn[i].fills.some(
          (f: any) =>
            f.color === color &&
            JSON.stringify(f.path[0]) === JSON.stringify(coords[i].entry),
        ),
      ).toBe(true);
      expect(
        drawn[i].fills.some(
          (f: any) =>
            f.color === color &&
            JSON.stringify(f.path[0]) === JSON.stringify(coords[i].exit),
        ),
      ).toBe(true);
    }
  };
  await assertHistory(trade, "#259176");
  await page.screenshot({ path: "/tmp/exact-trade-history.png" });
  await page.locator("#short").click();
  await page.locator("#step").click();
  await page.locator("#quickClose").click();
  await page.locator("#step").click();
  await expect.poll(async () => (await active()).trades.length).toBe(2);
  await assertHistory((await active()).trades[1], "#d57470");
  await page.reload();
  await expect(page.locator("#long")).toBeEnabled({ timeout: 30000 });
  await assertHistory((await active()).trades[1], "#d57470");
  expect(errors).toEqual([]);
});
