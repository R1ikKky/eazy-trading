import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("Magnet snaps both crosshair and drawing anchors and resets on release, cancel and blur", async ({
  page,
}) => {
  await authenticateTestPage(page, "en");
  await page.addInitScript(() => {
    let library: any;
    (window as any).__magnetCharts = [];
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
              if (options[0] === value.CandlestickSeries)
                (window as any).__magnetCharts.push({
                  id: args[0].id,
                  chart,
                  series,
                });
              return series;
            };
            return chart;
          },
        };
      },
    });
  });
  const snappedEnds: any[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/sessions");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.locator("#setupOpen").click();
  await page.locator("#sessionName").fill("Ctrl magnet");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  const primarySymbol = await page.locator("#symbol").inputValue();
  const magnet = page.locator('[data-drawing-toggle="magnet"]');
  const choose = async () => {
    await page.locator('[data-group="lines"]').click();
    await page.locator('.drawing-tool-list [data-tool="trend"]').click();
  };
  await page.keyboard.down("Control");
  await expect(magnet).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("Control");
  for (const selector of ["#chart", "#compareChart"]) {
    const chart = page.locator(selector);
    await choose();
    await expect(magnet).toHaveAttribute("aria-pressed", "false");
    // Ctrl must work even while the tool button still owns keyboard focus.
    await page.keyboard.down("Control");
    await expect(magnet).toHaveAttribute("aria-pressed", "true");
    const b = (await chart.boundingBox())!;
    await page.mouse.click(b.x + b.width * 0.35, b.y + b.height * 0.1);
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.6);
    const cursor = chart.locator("[data-magnet-crosshair]");
    await expect(cursor).toHaveCount(1);
    await expect(chart).toHaveClass(/drawing-magnet-cursor/);
    const snapped = await cursor.evaluate((el) => ({
      time: Number(el.getAttribute("data-time")),
      price: Number(el.getAttribute("data-price")),
      x: Number(el.getAttribute("data-x")),
      y: Number(el.getAttribute("data-y")),
    }));
    const expected = await page.evaluate(
      ({ id, snapped }) => {
        const c = (window as any).__magnetCharts.find((c: any) => c.id === id);
        const bar = c.series.data().find((b: any) => b.time === snapped.time);
        return {
          prices: [bar.open, bar.high, bar.low, bar.close],
          x:
            c.chart.timeScale().timeToCoordinate(snapped.time) +
            c.chart.priceScale("left").width(),
          y: c.series.priceToCoordinate(snapped.price),
        };
      },
      { id: selector.slice(1), snapped },
    );
    expect(expected.prices).toContain(snapped.price);
    expect(snapped.x).toBeCloseTo(expected.x, 5);
    expect(snapped.y).toBeCloseTo(expected.y, 5);
    snappedEnds.push(snapped);
    if (selector === "#chart")
      await page.screenshot({ path: "/tmp/magnet-crosshair.png" });
    await page.keyboard.up("Control");
    await expect(cursor).toHaveCount(0);
    await expect(chart).not.toHaveClass(/drawing-magnet-cursor/);
    await page.keyboard.down("Control");
    await expect(cursor).toHaveCount(1);
    await page.mouse.click(b.x + b.width * 0.6, b.y + b.height * 0.6);
    await expect(magnet).toHaveAttribute("aria-pressed", "false");
    await expect(chart).not.toHaveClass(/drawing-mode/);
    await expect(cursor).toHaveCount(0);
    await page.keyboard.up("Control");
    await choose();
    await page.mouse.click(b.x + b.width * 0.35, b.y + b.height * 0.1);
    await page.mouse.click(b.x + b.width * 0.6, b.y + b.height * 0.6);
    await expect(chart.locator("[data-drawing-id]")).toHaveCount(2);
  }
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  const workspace = await (await page.request.get("/api/workspace")).json();
  const active = workspace.sessions.find(
    (s: any) => s.id === workspace.settings.activeSessionId,
  );
  const chartSymbols = [primarySymbol, primarySymbol === "NQ" ? "ES" : "NQ"];
  for (const [index, symbol] of chartSymbols.entries()) {
    const [snapped, free] = active.drawings.filter(
      (d: any) => d.symbol === symbol,
    );
    expect(snapped.a.price).not.toBe(free.a.price);
    expect(snapped.b.price).toBe(snappedEnds[index].price);
    expect(snapped.b.time).toBe(snappedEnds[index].time);
  }
  await choose();
  await page.keyboard.down("Control");
  await expect(magnet).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("Control");
  await expect(magnet).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.down("Control");
  const chartBounds = (await page.locator("#chart").boundingBox())!;
  await page.mouse.click(chartBounds.x + 100, chartBounds.y + 100);
  await page.keyboard.press("Escape");
  await expect(magnet).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("Control");
  await choose();
  await page.keyboard.down("Control");
  await expect(magnet).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(magnet).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("Control");
  await choose();
  await page.mouse.click(chartBounds.x + 100, chartBounds.y + 100);
  await magnet.click();
  await expect(magnet).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(chartBounds.x + 200, chartBounds.y + 150);
  await expect(page.locator("#chart [data-magnet-crosshair]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("#chart [data-magnet-crosshair]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
