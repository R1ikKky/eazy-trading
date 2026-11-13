import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("Play and Next candle preserve both chart viewports and price scales", async ({
  page,
}) => {
  await authenticateTestPage(page, "en");
  await page.addInitScript(() => {
    let library: any;
    const tracked: any[] = [];
    (window as any).__viewportCharts = tracked;
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
              if (seriesArgs[0] === value.CandlestickSeries)
                tracked.push({ id: args[0].id, chart, series });
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
  await page.locator("#sessionName").fill("Fixed playback viewport");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__viewportCharts.filter(
            (c: any) => c.series.data().length,
          ).length,
      ),
    )
    .toBe(2);
  const configure = async (manual: boolean) => {
    await page.evaluate((manual) => {
      for (const c of (window as any).__viewportCharts) {
        const data = c.series.data(),
          n = data.length,
          price = data.at(-1).close;
        c.chart.timeScale().setVisibleLogicalRange({
          from: n - (manual ? 180 : 120),
          to: n + (manual ? -40 : 15),
        });
        if (manual)
          c.series
            .priceScale()
            .setVisibleRange({ from: price - 100, to: price + 100 });
      }
    }, manual);
    await page.waitForTimeout(200);
  };
  const snapshot = () =>
    page.evaluate(() =>
      (window as any).__viewportCharts.map((c: any) => ({
        id: c.id,
        time: c.chart.timeScale().getVisibleLogicalRange(),
        price: c.series.priceScale().getVisibleRange(),
      })),
    );
  const assertUnchanged = async (before: any[]) => {
    const after = await snapshot();
    expect(after.length).toBe(2);
    for (let i = 0; i < after.length; i++) {
      expect(after[i].id).toBe(before[i].id);
      for (const key of ["from", "to"]) {
        expect(after[i].time[key]).toBeCloseTo(before[i].time[key], 5);
        expect(after[i].price[key]).toBeCloseTo(before[i].price[key], 5);
      }
    }
  };
  await configure(false);
  const automatic = await snapshot(),
    progress = await page.locator("#progressLabel").textContent();
  await page.locator("#step").click();
  await expect(page.locator("#progressLabel")).not.toHaveText(progress!);
  await page.waitForTimeout(200);
  await assertUnchanged(automatic);
  await configure(true);
  for (const id of ["chart", "compareChart"]) {
    const box = await page.locator("#" + id).boundingBox();
    if (!box) throw new Error("Chart is missing");
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width * 0.45 + 60,
      box.y + box.height * 0.45 + 20,
      { steps: 8 },
    );
    await page.mouse.up();
  }
  await page.waitForTimeout(200);
  const manual = await snapshot(),
    nextProgress = await page.locator("#progressLabel").textContent();
  await page.locator("#play").click();
  await expect(page.locator("#progressLabel")).not.toHaveText(nextProgress!, {
    timeout: 5000,
  });
  await page.locator("#play").click();
  await page.waitForTimeout(200);
  await assertUnchanged(manual);
  expect(errors).toEqual([]);
});
