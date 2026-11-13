import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("Ctrl+Z removes drawings in reverse order and preserves native input undo", async ({
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
  await page.locator("#sessionName").fill("Drawing keyboard undo");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  const count = page.locator("#drawingCount"),
    chart = page.locator("#chart");
  const begin = async () => {
    await page.locator('[data-group="lines"]').click();
    await page.locator('.drawing-tool-list [data-tool="trend"]').click();
  };
  const point = async (x: number, y: number) => {
    const box = (await chart.boundingBox())!;
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  };
  await begin();
  await point(0.25, 0.4);
  await point(0.5, 0.55);
  await expect(count).toHaveText("1");
  const firstId = await chart
    .locator("[data-drawing-id]")
    .first()
    .getAttribute("data-drawing-id");
  await begin();
  await point(0.35, 0.3);
  await point(0.65, 0.6);
  await expect(count).toHaveText("2");
  await page.locator("#qty").focus();
  await page.keyboard.press("Control+z");
  await expect(count).toHaveText("2");
  // Toolbar focus must not disable the chart shortcut.
  await page.locator("#drawUndo").focus();
  await page.keyboard.press("Control+z");
  await expect(count).toHaveText("1");
  await expect(chart.locator(`[data-drawing-id="${firstId}"]`)).toHaveCount(1);
  // An unfinished drawing is canceled before the preceding saved drawing.
  await begin();
  await point(0.45, 0.35);
  await page.keyboard.press("Control+z");
  await expect(count).toHaveText("1");
  await page.keyboard.press("Meta+z");
  await expect(count).toHaveText("0");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.reload();
  await expect(count).toHaveText("0", { timeout: 30000 });
  expect(errors).toEqual([]);
});
