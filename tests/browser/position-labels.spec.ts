import { expect, test } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("position metrics are selected-only, editable, persistent and fit resized charts", async ({
  page,
}) => {
  test.setTimeout(90000);
  await authenticateTestPage(page, "en");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/sessions");
  const saved = () =>
    expect(page.locator("#saveStatus")).toHaveAttribute("data-state", "saved", {
      timeout: 30000,
    });
  await saved();
  await page.locator("#setupOpen").click();
  await page.locator("#sessionName").fill("Responsive position labels");
  await page.locator("#sessionNQ").check();
  await page.locator("#sessionES").check();
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  await page.locator("#replayJournalHide").click();
  const chart = page.locator("#chart");
  const drawings = chart.locator("[data-drawing-id]");
  const labels = chart.locator("[data-position-label]");
  for (const [index, type] of ["long-position", "short-position"].entries()) {
    await page.locator('[data-group="analysis"]').click();
    await page.locator(`.drawing-tool-list [data-tool="${type}"]`).click();
    const bounds = (await chart.boundingBox())!;
    await page.mouse.click(
      bounds.x + bounds.width * (index ? 0.65 : 0.25),
      bounds.y + bounds.height * 0.5,
    );
    await expect(drawings).toHaveCount(index + 1);
    await expect(labels).toHaveCount(3);
    await expect(drawings.last()).toContainText("Open P&L:");
    await expect(drawings.last()).toContainText("Qty:");
    await expect(drawings.last()).toContainText("Risk/reward ratio:");
    await expect(drawings.last()).toContainText("Amount:");
    if (index)
      await expect(
        drawings.first().locator("[data-position-label]"),
      ).toHaveCount(0);
  }
  const rect = (await chart.boundingBox())!;
  await page.mouse.click(rect.x + 16, rect.y + rect.height - 70);
  await expect(labels).toHaveCount(0);
  await expect(chart.locator("[data-position-zone]")).toHaveCount(4);
  const last = drawings.last();
  const line = last.locator('[data-position-level="entry"]');
  const x = Number(await line.getAttribute("x1")),
    y = Number(await line.getAttribute("y1"));
  await page.mouse.click(rect.x + x, rect.y + y);
  await expect(labels).toHaveCount(3);
  await expect(page.locator("#drawingAccountSize")).toBeVisible();
  await page.locator("#drawingAccountSize").fill("1000");
  await page.locator("#drawingRiskPercent").fill("25");
  await page.locator("#drawingRiskPercent").press("Tab");
  await saved();
  const state = await (
    await page.request.get("/api/workspace", { maxRetries: 2 })
  ).json();
  const session = state.sessions.find(
    (s: any) => s.id === state.settings.activeSessionId,
  );
  const drawing = session.drawings.find(
    (d: any) => d.type === "short-position",
  );
  expect(drawing.accountSize).toBe(1000);
  expect(drawing.riskPercent).toBe(25);
  expect(session.snapshot.position).toBeNull();
  await expect(last.locator('[data-position-label="stop"]')).toContainText(
    "750",
  );
  await expect(last.locator('[data-position-label="target"]')).toContainText(
    "1250",
  );
  const risk = Math.abs(drawing.points[0].price - drawing.points[1].price);
  const expectedQty = Number(
    (250 / (risk * (drawing.symbol === "NQ" ? 20 : 50))).toFixed(3),
  );
  await expect(last.locator('[data-position-label="entry"]')).toContainText(
    String(expectedQty),
  );
  await page.keyboard.press("Escape");
  await expect(labels).toHaveCount(0);
  // A drag selects the drawing without leaving the style popover over the chart.
  const right = Number(await line.getAttribute("x2"));
  await page.mouse.move(rect.x + right, rect.y + y);
  await page.mouse.down();
  await page.mouse.move(rect.x + right + 16, rect.y + y, { steps: 6 });
  await page.mouse.up();
  await expect(labels).toHaveCount(3);
  for (const [width, height] of [
    [1440, 1000],
    [900, 700],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(async () =>
        labels.evaluateAll(
          (nodes) =>
            nodes.length === 3 &&
            nodes.every((node) => {
              const svg = node.closest("svg");
              if (!svg) return false;
              const clip = svg.querySelector("clipPath rect");
              if (!clip) return false;
              const plotLeft = Number(clip.getAttribute("x"));
              const plotRight = plotLeft + Number(clip.getAttribute("width"));
              const plotHeight = Number(clip.getAttribute("height"));
              const box = node.getBoundingClientRect(),
                origin = svg.getBoundingClientRect();
              return (
                box.left >= origin.left + plotLeft - 1 &&
                box.right <= origin.left + plotRight + 1 &&
                box.top >= origin.top - 1 &&
                box.bottom <= origin.top + plotHeight + 1
              );
            }),
        ),
      )
      .toBe(true);
    const overlaps = await labels.evaluateAll((nodes) => {
      const boxes = nodes
        .map((node) => node.getBoundingClientRect())
        .sort((a, b) => a.top - b.top);
      return boxes.some(
        (box, index) => index && box.top < boxes[index - 1].bottom - 1,
      );
    });
    expect(overlaps).toBe(false);
    await page.screenshot({ path: `/tmp/position-labels-${width}.png` });
  }
  await saved();
  await page.reload();
  await expect(page.locator("#lastPrice")).toHaveText(/[0-9]/, {
    timeout: 30000,
  });
  await expect(labels).toHaveCount(0);
  const restored = await (
    await page.request.get("/api/workspace", { maxRetries: 2 })
  ).json();
  const record = restored.sessions.find(
    (s: any) => s.id === restored.settings.activeSessionId,
  );
  expect(record.drawings.find((d: any) => d.id === drawing.id)).toMatchObject({
    accountSize: 1000,
    riskPercent: 25,
  });
  expect(errors).toEqual([]);
});
