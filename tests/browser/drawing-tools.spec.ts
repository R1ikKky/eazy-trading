import { test, expect } from "@playwright/test";
import { authenticateTestPage, chooseTheme } from "./auth-helper";
test.beforeEach(async ({ page }) => authenticateTestPage(page));
test("grouped drawings, editing, favorites and account persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/replay");
  await expect(page.locator("#rangeLabel")).toContainText("2024", {
    timeout: 30000,
  });
  await expect(page.locator(".drawing-rail")).toBeVisible();
  const chart = page.locator("#chart");
  await expect(chart.locator("canvas").first()).toBeVisible();
  const count = page.locator("#drawingCount");
  const baseline = Number(await count.textContent());
  const choose = async (group: string, id: string) => {
    await page.locator(`[data-group="${group}"]`).click();
    await page.locator(`.drawing-tool-list [data-tool="${id}"]`).click();
  };
  const point = async (x: number, y: number) => {
    const rect = (await chart.boundingBox())!;
    await page.mouse.click(rect.x + rect.width * x, rect.y + rect.height * y);
  };
  await choose("lines", "trend");
  await point(0.25, 0.4);
  await point(0.55, 0.55);
  await expect(count).toHaveText(String(baseline + 1));
  const trend = chart.locator("[data-drawing-id]").last();
  const trendId = await trend.getAttribute("data-drawing-id");
  const line = chart.locator(`[data-drawing-id="${trendId}"] line`).first();
  const x1 = Number(await line.getAttribute("x1")),
    y1 = Number(await line.getAttribute("y1"));
  await choose("cursor", "select");
  const chartRect = (await chart.boundingBox())!;
  await page.mouse.move(chartRect.x + x1, chartRect.y + y1);
  await page.mouse.down();
  await page.mouse.move(chartRect.x + x1 + 35, chartRect.y + y1 - 25, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(line).not.toHaveAttribute("x1", String(x1));
  await page
    .getByRole("button", { name: "Зафиксировать разметку", exact: true })
    .click();
  const lockedX = await line.getAttribute("x1"),
    lockedY = await line.getAttribute("y1");
  await page.mouse.move(
    chartRect.x + Number(lockedX),
    chartRect.y + Number(lockedY),
  );
  await page.mouse.down();
  await page.mouse.move(
    chartRect.x + Number(lockedX) + 30,
    chartRect.y + Number(lockedY) + 20,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(line).toHaveAttribute("x1", lockedX!);
  await page
    .getByRole("button", { name: "Зафиксировать разметку", exact: true })
    .click();
  await page.locator("#drawDelete").click();
  await expect(count).toHaveText(String(baseline));
  await page.locator("#drawUndo").click();
  await expect(count).toHaveText(String(baseline + 1));
  await choose("fib", "fib");
  await point(0.3, 0.3);
  await point(0.6, 0.6);
  await expect(count).toHaveText(String(baseline + 2));
  await choose("patterns", "xabcd");
  for (let i = 0; i < 5; i++) await point(0.2 + i * 0.1, i % 2 ? 0.35 : 0.65);
  await expect(count).toHaveText(String(baseline + 3));
  await choose("analysis", "long-position");
  await point(0.3, 0.5);
  await expect(count).toHaveText(String(baseline + 4));
  await choose("shapes", "brush");
  const rect = (await chart.boundingBox())!;
  await page.mouse.move(rect.x + rect.width * 0.3, rect.y + rect.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height * 0.4, {
    steps: 20,
  });
  await page.mouse.up();
  await expect(count).toHaveText(String(baseline + 5));
  await choose("text", "note");
  await point(0.5, 0.5);
  await page.locator("#drawingTextInput").fill("Browser note");
  await page.locator('.drawing-text-dialog button[type="submit"]').click();
  await expect(count).toHaveText(String(baseline + 6));
  await expect(chart.locator("svg.chart-drawings")).toContainText(
    "Browser note",
  );
  await page.locator('[data-group="lines"]').click();
  const star = page.locator('[data-favorite="trend"]');
  if ((await star.getAttribute("aria-pressed")) === "true") await star.click();
  await star.click();
  await page.keyboard.press("Escape");
  const dock = page.locator(".drawing-favorites");
  await expect(dock).toBeVisible();
  await expect(dock.locator('[data-tool="trend"]')).toBeVisible();
  const grip = page.getByRole("button", {
    name: "Переместить избранное",
    exact: true,
  });
  const gripRect = (await grip.boundingBox())!;
  await page.mouse.move(gripRect.x + 8, gripRect.y + 8);
  await page.mouse.down();
  await page.mouse.move(350, 160, { steps: 10 });
  await page.mouse.up();
  const dockRect = (await dock.boundingBox())!;
  expect(dockRect.y).toBeLessThan(200);
  await page
    .getByRole("button", { name: "Скрыть разметку", exact: true })
    .click();
  await expect(chart.locator("[data-drawing-id]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Скрыть разметку", exact: true })
    .click();
  await expect(chart.locator("svg.chart-drawings")).toContainText(
    "Browser note",
  );
  await page.locator("#drawUndo").click();
  await expect(count).toHaveText(String(baseline + 5));
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  const workspace = await (await page.request.get("/api/workspace")).json();
  const stored = workspace.sessions.find(
    (session: any) => session.id === workspace.settings.activeSessionId,
  );
  expect(
    stored.drawings.some(
      (d: any) => d.type === "xabcd" && d.points.length === 5,
    ),
  ).toBe(true);
  expect(
    stored.drawings.some(
      (d: any) => d.type === "brush" && d.points.length >= 2,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (!key.startsWith("eazy-trading-drawing-ui:"))
        localStorage.removeItem(key);
  });
  await page.reload();
  await expect(page.locator("#rangeLabel")).toContainText("2024", {
    timeout: 30000,
  });
  await expect(count).toHaveText(String(baseline + 5));
  await expect(dock.locator('[data-tool="trend"]')).toBeVisible();
  expect((await dock.boundingBox())!.y).toBeLessThan(200);
  for (const theme of ["Yellow", "Blue", "Dark"] as const) {
    await chooseTheme(page, theme);
    await page.locator('[data-group="fib"]').click();
    await expect(page.locator(".drawing-group-menu")).toBeVisible();
    await page.screenshot({ path: `/tmp/drawing-tools-${theme}.png` });
    await page.keyboard.press("Escape");
  }
  await chart.hover();
  await page.locator('#chartPaneButton').click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await expect(page.locator('.drawing-rail')).toBeVisible();
  await page.locator('[data-group="lines"]').click();
  await expect(page.locator('.drawing-group-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(()=>document.exitFullscreen());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-group="text"]').click();
  const menu = (await page.locator(".drawing-group-menu").boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(390);
  expect(menu.y + menu.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "/tmp/drawing-tools-mobile.png" });
  await page.keyboard.press("Escape");
  await page.locator('[data-view="sessions"]').click();
  await expect(page.locator(".drawing-rail")).not.toBeVisible();
  await expect(dock).not.toBeVisible();
  expect(errors).toEqual([]);
});
