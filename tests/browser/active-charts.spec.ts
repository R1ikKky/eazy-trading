import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";
test("last clicked chart receives drawings and instrument switches preserve the session", async ({
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
  await page.locator("#sessionName").fill("Active charts");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  const first = page.locator("#chart"),
    second = page.locator("#compareChart"),
    panes = page.locator("#chartPanes");
  await expect(second.locator("canvas").first()).toBeVisible();
  await expect(page.locator(".symbol-group")).not.toBeVisible();
  const chooseTool = async () => {
    await page.locator('[data-group="lines"]').click();
    await page.locator('.drawing-tool-list [data-tool="trend"]').click();
  };
  const draw = async (target: typeof first) => {
    await chooseTool();
    const b = (await target.boundingBox())!;
    await page.mouse.click(b.x + b.width * 0.25, b.y + b.height * 0.35);
    await page.mouse.click(b.x + b.width * 0.6, b.y + b.height * 0.6);
  };
  await draw(first);
  await expect(first.locator("[data-drawing-id]")).toHaveCount(1);
  await expect(second.locator("[data-drawing-id]")).toHaveCount(0);
  await draw(second);
  await expect(panes).toHaveAttribute("data-active-chart", "comparison");
  await expect(second.locator("[data-drawing-id]")).toHaveCount(1);
  await expect(first.locator("[data-drawing-id]")).toHaveCount(1);
  await page.locator("#drawUndo").click();
  await expect(second.locator("[data-drawing-id]")).toHaveCount(0);
  await expect(first.locator("[data-drawing-id]")).toHaveCount(1);
  await draw(second);
  await expect(second.locator("[data-drawing-id]")).toHaveCount(1);
  for (const target of [first, second]) {
    const chartBounds = (await target.boundingBox())!,
      drawingBounds = (await target.locator("svg.chart-drawings").boundingBox())!;
    for (const axis of ["x", "y", "width", "height"] as const)
      expect(drawingBounds[axis]).toBeCloseTo(chartBounds[axis], 0);
  }
  await page.getByRole("button", { name: "Trade panel", exact: true }).click();
  await page.locator("#stop").fill("1000");
  await page.locator("#target").fill("1000");
  await page.locator("#long").click();
  await page.locator("#step").click();
  await expect(page.locator("#positionBox")).toContainText("LONG");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  const before = await (await page.request.get("/api/workspace")).json(),
    session = before.sessions.find(
      (s: any) => s.id === before.settings.activeSessionId,
    ),
    time = await page.locator("#progressLabel").textContent();
  expect(session.drawings.map((d: any) => d.symbol).sort()).toEqual([
    "ES",
    "NQ",
  ]);
  expect(
    session.drawings.find((d: any) => d.symbol === "ES").a.price,
  ).toBeLessThan(10000);
  expect(
    session.drawings.find((d: any) => d.symbol === "NQ").a.price,
  ).toBeGreaterThan(10000);
  const select = async (id: string, symbol: string) => {
    await page.locator("#" + id).click();
    await page
      .getByRole("menuitemradio", { name: new RegExp("^" + symbol + " ") })
      .click();
  };
  await select("primaryChartTitle", "ES");
  await expect(page.locator("#primaryChartTitle")).toContainText("ES");
  await expect(first.locator("[data-drawing-id]")).toHaveCount(1);
  expect(
    await first.locator("[data-drawing-id]").getAttribute("data-drawing-id"),
  ).toBe(session.drawings.find((d: any) => d.symbol === "ES").id);
  await select("comparisonTitle", "NQ");
  await expect(page.locator("#comparisonTitle")).toContainText("NQ");
  await expect(second.locator("[data-drawing-id]")).toHaveCount(1);
  expect(
    await second.locator("[data-drawing-id]").getAttribute("data-drawing-id"),
  ).toBe(session.drawings.find((d: any) => d.symbol === "NQ").id);
  await page.locator('[data-tf="5"]').click();
  await expect(page.locator("#comparisonTitle")).toContainText("5m");
  await expect(page.locator("#primaryChartTitle")).toContainText("1m");
  await expect(page.locator("#progressLabel")).toHaveText(time!);
  await expect(page.locator("#orderInstrument")).toHaveText("NQ");
  const after = await (await page.request.get("/api/workspace")).json(),
    restored = after.sessions.find((s: any) => s.id === session.id);
  expect(after.sessions).toHaveLength(before.sessions.length);
  expect(restored.snapshot).toEqual(session.snapshot);
  await page.screenshot({ path: "/tmp/active-charts-swapped.png" });
  await page.reload();
  await expect(page.locator("#primaryChartTitle")).toContainText("ES", {
    timeout: 30000,
  });
  await expect(page.locator("#comparisonTitle")).toContainText("NQ");
  await expect(second.locator("[data-drawing-id]")).toHaveCount(1);
  await expect(first.locator("[data-drawing-id]")).toHaveCount(1);
  await expect(page.locator("#positionBox")).toContainText("LONG");
  expect(errors).toEqual([]);
});
