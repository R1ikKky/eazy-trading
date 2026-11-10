import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("Ctrl temporarily snaps drawing anchors and resets on completion, release, cancel and blur", async ({
  page,
}) => {
  await authenticateTestPage(page, "en");
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
    await page.mouse.click(b.x + b.width * 0.6, b.y + b.height * 0.6);
    await expect(magnet).toHaveAttribute("aria-pressed", "false");
    await expect(chart).not.toHaveClass(/drawing-mode/);
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
  for (const symbol of ["NQ", "ES"]) {
    const [snapped, free] = active.drawings.filter(
      (d: any) => d.symbol === symbol,
    );
    expect(snapped.a.price).not.toBe(free.a.price);
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
  expect(errors).toEqual([]);
});
