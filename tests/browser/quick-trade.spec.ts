import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("inline market entry immediately displays and restores actual entry, SL, and TP on the correct chart", async ({
  page,
}) => {
  await authenticateTestPage(page, "en");
  await page.addInitScript(() => {
    let library: any;
    const tracked: any[] = [];
    (window as any).__tradeCharts = tracked;
    Object.defineProperty(window, "LightweightCharts", {
      configurable: true,
      get: () => library,
      set(value) {
        library = {
          ...value,
          createChart(...args: any[]) {
            const chart = value.createChart(...args),
              add = chart.addSeries.bind(chart);
            chart.addSeries = (...seriesArgs: any[]) => {
              const series = add(...seriesArgs);
              if (seriesArgs[0] === value.CandlestickSeries) {
                const state = {
                  id: args[0].id,
                  chart,
                  series,
                  lines: [] as any[],
                };
                tracked.push(state);
                const create = series.createPriceLine.bind(series),
                  remove = series.removePriceLine.bind(series);
                series.createPriceLine = (options: any) => {
                  const line = create(options);
                  state.lines.push({ line, options });
                  return line;
                };
                series.removePriceLine = (line: any) => {
                  state.lines = state.lines.filter(
                    (item) => item.line !== line,
                  );
                  remove(line);
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
  await expect(page.locator("#historyOpen")).toHaveCount(0);
  await expect(page.locator(".island-trade-toggle")).toHaveCount(0);
  await page.locator("#setupOpen").click();
  await page.locator("#sessionName").fill("Immediate inline trading");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  await expect(page.locator(".quick-order #qty")).toBeVisible();
  const progress = await page.locator("#progressLabel").textContent();
  const quote = Number(
    (await page.locator("#lastPrice").textContent())!.replaceAll(",", ""),
  );
  await page.locator("#qty").fill("2");
  await page.locator("#stop").fill("12");
  await page.locator("#target").fill("24");
  await page.locator("#long").click();
  await expect(page.locator("#quickPositionText")).toContainText("LONG");
  await expect(page.locator("#progressLabel")).toHaveText(progress!);
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  const workspace = await (await page.request.get("/api/workspace")).json();
  const active = workspace.sessions.find(
    (s: any) => s.id === workspace.settings.activeSessionId,
  );
  const p = active.snapshot.position;
  expect(p.entryAtClose).toBe(true);
  expect(active.snapshot.pending).toBeNull();
  expect(p.entry).toBe(quote + 0.25);
  expect(p.sl).toBe(p.entry - 12);
  expect(p.tp).toBe(p.entry + 24);
  const assertLines = async (id: string) => {
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            (window as any).__tradeCharts.find((c: any) => c.id === id)?.lines
              .length,
          id,
        ),
      )
      .toBe(3);
    const lines = await page.evaluate((id) => {
      const c = (window as any).__tradeCharts.find((c: any) => c.id === id);
      return c.lines.map((line: any) => ({
        price: line.options.price,
        y: c.series.priceToCoordinate(line.options.price),
        height: c.chart.paneSize().height,
      }));
    }, id);
    expect(
      lines
        .map((line: any) => line.price)
        .sort((a: number, b: number) => a - b),
    ).toEqual([p.sl, p.entry, p.tp]);
    for (const line of lines) {
      expect(line.y).not.toBeNull();
      expect(line.y).toBeGreaterThanOrEqual(0);
      expect(line.y).toBeLessThan(line.height);
    }
  };
  await assertLines("chart");
  await page.screenshot({ path: "/tmp/quick-trade-desktop.png" });
  await page.locator("#comparisonTitle").click();
  await page.getByRole("menuitemradio", { name: /^NQ / }).click();
  await assertLines("compareChart");
  await page.reload();
  await expect(page.locator("#quickPositionText")).toContainText("LONG", {
    timeout: 30000,
  });
  await expect(page.locator("#qty")).toHaveValue("2");
  await assertLines("chart");
  await assertLines("compareChart");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator("#long")).toBeVisible();
    const field = (await page.locator("#long").boundingBox())!;
    expect(field.x + field.width).toBeLessThanOrEqual(width);
    const close = (await page.locator("#quickClose").boundingBox())!;
    expect(close.y + close.height).toBeLessThanOrEqual(844);
    expect(
      (await page.locator("#chart").boundingBox())!.height,
    ).toBeGreaterThan(20);
    await page.screenshot({ path: `/tmp/quick-trade-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#quickClose").click();
  await page.locator("#step").click();
  await expect(page.locator("#quickPosition")).not.toBeVisible();
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.reload();
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await expect(page.locator("#long")).toBeEnabled({ timeout: 30000 });
  await page.locator("#stop").fill("1000");
  await page.locator("#target").fill("2000");
  await page.locator("#short").click();
  await expect(page.locator("#quickPositionText")).toContainText("SHORT");
  for (const id of ["chart", "compareChart"]) {
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const c = (window as any).__tradeCharts.find((c: any) => c.id === id);
          return (
            c?.lines.length === 3 &&
            c.lines.every((line: any) => {
              const y = c.series.priceToCoordinate(line.options.price);
              return y !== null && y >= 0 && y < c.chart.paneSize().height;
            })
          );
        }, id),
      )
      .toBe(true);
  }
  expect(errors).toEqual([]);
});
