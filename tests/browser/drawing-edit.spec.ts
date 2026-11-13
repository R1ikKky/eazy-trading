import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("click selects a drawing for style and point editing without selecting a tool first", async ({
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
  await page.locator("#sessionName").fill("Click to edit drawings");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  const chart = page.locator("#chart"),
    count = page.locator("#drawingCount");
  const point = async (x: number, y: number) => {
    const box = (await chart.boundingBox())!;
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  };
  await page.locator('[data-group="lines"]').click();
  await page.locator('.drawing-tool-list [data-tool="trend"]').click();
  await point(0.25, 0.4);
  await point(0.65, 0.6);
  await expect(count).toHaveText("1");
  const drawing = chart.locator("[data-drawing-id]").first(),
    line = drawing.locator("line").first();
  const coords = async () => ({
    x1: Number(await line.getAttribute("x1")),
    x2: Number(await line.getAttribute("x2")),
    y1: Number(await line.getAttribute("y1")),
    y2: Number(await line.getAttribute("y2")),
  });
  const clickDrawing = async () => {
    const b = (await chart.boundingBox())!,
      c = await coords();
    await page.mouse.click(b.x + (c.x1 + c.x2) / 2, b.y + (c.y1 + c.y2) / 2);
  };
  for (const id of ["drawUndo", "drawDelete", "drawClear"])
    await expect(page.locator("#" + id + " svg")).toBeVisible();
  await expect(drawing.locator("circle")).toHaveCount(0);
  await clickDrawing();
  await expect(drawing.locator("circle")).toHaveCount(2);
  await expect(page.locator(".drawing-style-menu")).toBeVisible();
  await expect(page.locator("#drawDelete")).toBeEnabled();
  // Selection alone must not create an undo entry.
  await page.keyboard.press("Control+z");
  await expect(count).toHaveText("0");
  await expect(page.locator(".drawing-style-menu")).not.toBeVisible();
  await page.locator('[data-group="lines"]').click();
  await page.locator('.drawing-tool-list [data-tool="trend"]').click();
  await point(0.25, 0.4);
  await point(0.65, 0.6);
  await expect(count).toHaveText("1");
  await clickDrawing();
  await page.locator("#drawingStyleColor").fill("#ff8800");
  await page.locator("#drawingStyleColor").dispatchEvent("change");
  await expect(line).toHaveAttribute("stroke", "#ff8800");
  await page.locator("#drawingStyleWidth").selectOption("4");
  await expect(line).toHaveAttribute("stroke-width", "4");
  // Clicking empty space leaves editing mode, then a direct handle drag selects again.
  await point(0.8, 0.2);
  await expect(drawing.locator("circle")).toHaveCount(0);
  await expect(page.locator(".drawing-style-menu")).not.toBeVisible();
  const original = await coords(),
    box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + original.x1, box.y + original.y1);
  await page.mouse.down();
  await page.mouse.move(box.x + original.x1 + 35, box.y + original.y1 - 25, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(line).not.toHaveAttribute("x1", String(original.x1));
  await expect(line).toHaveAttribute("x2", String(original.x2));
  await page.keyboard.press("Control+z");
  await expect(line).toHaveAttribute("x1", String(original.x1));
  await expect(count).toHaveText("1");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await clickDrawing();
  await expect(drawing.locator("circle")).toHaveCount(2);
  await page.screenshot({ path: "/tmp/drawing-click-editor.png" });
  await page.reload();
  await expect(line).toHaveAttribute("stroke", "#ff8800", { timeout: 30000 });
  expect(errors).toEqual([]);
});
