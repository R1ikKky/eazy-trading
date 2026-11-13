import { expect, test } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

for (const symbol of ["NQ", "ES"]) {
  test(`${symbol} position drawings start with SL and TP, support editing, undo and reload`, async ({
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
    await page
      .locator("#sessionName")
      .fill(`${symbol} default position drawings`);
    await page.locator(`#session${symbol}`).check();
    await page.locator(`#session${symbol === "NQ" ? "ES" : "NQ"}`).uncheck();
    await page.locator("#fromDate").fill("2024-01-08");
    await page.locator("#toDate").fill("2024-01-12");
    await page.locator('#setupForm button[type="submit"]').click();
    await expect(page.locator("#setupDialog")).not.toBeVisible({
      timeout: 45000,
    });
    await expect(page.locator("#lastPrice")).toHaveText(/[0-9]/);
    const chart = page.locator("#chart"),
      count = page.locator("#drawingCount");
    const saved = async () => {
      await expect(page.locator("#saveStatus")).toHaveAttribute(
        "data-state",
        "saved",
        { timeout: 30000 },
      );
      const workspace = await (
        await page.request.get("/api/workspace", { maxRetries: 2 })
      ).json();
      return workspace.sessions.find(
        (s: any) => s.id === workspace.settings.activeSessionId,
      );
    };
    for (const [index, type] of ["long-position", "short-position"].entries()) {
      await page.locator('[data-group="analysis"]').click();
      await page.locator(`.drawing-tool-list [data-tool="${type}"]`).click();
      const bounds = (await chart.boundingBox())!;
      await page.mouse.move(
        bounds.x + bounds.width * (index ? 0.65 : 0.22),
        bounds.y + bounds.height * 0.5,
      );
      // A complete box is previewed before the single placement click.
      await expect(
        chart.locator('[data-position-zone="stop"]').last(),
      ).toBeVisible();
      await page.mouse.down();
      await page.mouse.up();
      await expect(count).toHaveText(String(index + 1));
      const drawing = chart.locator("[data-drawing-id]").last();
      await expect(drawing.locator("circle")).toHaveCount(3);
      await expect(drawing).toContainText("R:R 1.00");
      const entry = Number(
        await drawing
          .locator('[data-position-level="entry"]')
          .getAttribute("y1"),
      );
      for (const level of ["stop", "target"]) {
        const zone = drawing.locator(`[data-position-zone="${level}"]`);
        const height = Number(await zone.getAttribute("height"));
        expect(height).toBeGreaterThan(5);
        const y = Number(await zone.getAttribute("y"));
        const above = (type === "long-position") === (level === "target");
        expect(above ? y < entry : y === entry).toBe(true);
      }
      const stored = (await saved()).drawings.find((d: any) => d.type === type);
      const [a, sl, tp] = stored.points;
      expect(sl.price > 0 && tp.price > 0).toBe(true);
      expect(
        type === "long-position"
          ? sl.price < a.price && tp.price > a.price
          : sl.price > a.price && tp.price < a.price,
      ).toBe(true);
      expect(Math.abs(sl.price - a.price)).toBe(Math.abs(tp.price - a.price));
      expect(sl.price * 4).toBe(Math.round(sl.price * 4));

      // Each level remains draggable independently, and drawing undo restores it.
      for (const handle of [1, 2]) {
        const line = drawing.locator('[data-position-level="entry"]');
        const x = Number(
          await line.getAttribute(sl.time > a.time ? "x2" : "x1"),
        );
        const zone = drawing.locator(
          `[data-position-zone="${handle === 1 ? "stop" : "target"}"]`,
        );
        const top = Number(await zone.getAttribute("y")),
          height = Number(await zone.getAttribute("height"));
        const y = top < entry ? top : top + height;
        await page.mouse.move(bounds.x + x, bounds.y + y);
        await page.mouse.down();
        await page.mouse.move(
          bounds.x + x,
          bounds.y + y + (y < entry ? -24 : 24),
          { steps: 8 },
        );
        await page.mouse.up();
        await expect(drawing.locator("circle").nth(handle)).not.toHaveAttribute(
          "cy",
          String(y),
        );
        const changed = (await saved()).drawings.find(
          (d: any) => d.id === stored.id,
        );
        expect(changed.points[handle].price).not.toBe(
          stored.points[handle].price,
        );
        expect(changed.points[handle === 1 ? 2 : 1]).toEqual(
          stored.points[handle === 1 ? 2 : 1],
        );
        await page.keyboard.press("Control+z");
        const restored = (await saved()).drawings.find(
          (d: any) => d.id === stored.id,
        );
        expect(restored.points).toEqual(stored.points);
      }
    }
    await page.mouse.move(900, 100);
    await page.screenshot({ path: `/tmp/position-drawings-${symbol}.png` });
    expect((await saved()).snapshot.position).toBeNull();
    await page.reload();
    await expect(count).toHaveText("2", { timeout: 30000 });
    await expect(chart.locator('[data-position-zone="stop"]')).toHaveCount(2);
    await expect(chart.locator('[data-position-zone="target"]')).toHaveCount(2);
    expect(errors).toEqual([]);
  });
}
