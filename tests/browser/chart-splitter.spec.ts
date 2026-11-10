import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";
test("chart divider resizes both charts, clamps, resets and persists without changing replay", async ({
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
  await page.locator("#sessionName").fill("Resizable paired charts");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  const first = page.locator(".primary-pane"),
    second = page.locator(".comparison-card"),
    divider = page.getByRole("separator", {
      name: "Resize charts",
      exact: true,
    });
  await expect(second.locator("canvas").first()).toBeVisible();
  await expect(divider).toBeVisible();
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  const progress = await page.locator("#progressLabel").textContent(),
    price = await page.locator("#lastPrice").textContent();
  expect((await page.locator("#chartCard").boundingBox())!.y).toBeGreaterThan(
    (await page.locator(".app-sidebar").boundingBox())!.y + 64,
  );
  const viewport = (await page.locator("#chartPanes").boundingBox())!;
  const card = (await page.locator("#chartCard").boundingBox())!;
  expect(card.y + card.height).toBeLessThanOrEqual(1000);
  expect(card.y + card.height).toBeGreaterThan(970);
  await expect(page.locator("#chartExpand")).toHaveCount(0);
  let saves = 0;
  page.on("request", (request) => {
    if (
      request.method() === "PUT" &&
      new URL(request.url()).pathname === "/api/workspace"
    )
      saves++;
  });
  const drag = async (fraction: number) => {
    const rect = (await divider.boundingBox())!,
      panes = (await page.locator("#chartPanes").boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      panes.x + (panes.width - 10) * fraction + 5,
      rect.y + rect.height / 2,
      { steps: 15 },
    );
    await page.mouse.up();
  };
  await drag(0.7);
  await expect
    .poll(async () => Number(await divider.getAttribute("aria-valuenow")))
    .toBeGreaterThan(65);
  const grown = (await first.boundingBox())!,
    shrunk = (await second.boundingBox())!;
  expect(grown.width).toBeGreaterThan(shrunk.width * 2);
  await expect
    .poll(async () =>
      Math.abs(
        (await page.locator("#chart canvas").first().boundingBox())!.width -
          grown.width,
      ),
    )
    .toBeLessThan(100);
  await expect
    .poll(async () =>
      Math.abs(
        (await page.locator("#compareChart canvas").first().boundingBox())!
          .width - shrunk.width,
      ),
    )
    .toBeLessThan(100);
  await drag(0.01);
  expect((await first.boundingBox())!.width).toBeGreaterThanOrEqual(219);
  await drag(0.99);
  expect((await second.boundingBox())!.width).toBeGreaterThanOrEqual(219);
  await divider.dblclick();
  await expect
    .poll(async () =>
      Math.abs(
        (await first.boundingBox())!.width -
          (await second.boundingBox())!.width,
      ),
    )
    .toBeLessThan(2);
  await divider.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "60");
  await expect(page.locator("#progressLabel")).toHaveText(progress!);
  await expect(page.locator("#lastPrice")).toHaveText(price!);
  expect((await page.locator("#chartPanes").boundingBox())!.width).toBeCloseTo(
    viewport.width,
    0,
  );
  await page.screenshot({ path: "/tmp/chart-splitter-desktop.png" });
  await page.locator("#compareToggle").click();
  await expect(divider).not.toBeVisible();
  await page.locator("#compareToggle").click();
  await expect(divider).toBeVisible();
  await expect(divider).toHaveAttribute("aria-valuenow", "60");
  expect(saves).toBe(0);
  await page.reload();
  await expect(divider).toBeVisible({ timeout: 30000 });
  await expect(divider).toHaveAttribute("aria-valuenow", "60");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(divider).toHaveAttribute("aria-orientation", "horizontal");
  await divider.scrollIntoViewIfNeeded();
  await divider.focus();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(divider).toHaveAttribute("aria-valuenow", "60");
  expect((await first.boundingBox())!.height).toBeGreaterThan(
    (await second.boundingBox())!.height,
  );
  const mobileDivider = (await divider.boundingBox())!;
  await page.mouse.move(
    mobileDivider.x + mobileDivider.width / 2,
    mobileDivider.y + 5,
  );
  await page.mouse.down();
  await page.mouse.move(
    mobileDivider.x + mobileDivider.width / 2,
    mobileDivider.y - 80,
    { steps: 8 },
  );
  await page.mouse.up();
  expect(Number(await divider.getAttribute("aria-valuenow"))).toBeLessThan(60);
  await divider.dblclick();
  await expect(divider).toHaveAttribute("aria-valuenow", "50");
  await page.screenshot({ path: "/tmp/chart-splitter-mobile.png" });
  await expect(page.locator("#chartExpand")).toHaveCount(0);
  await expect(divider).toBeVisible();
  expect((await page.locator("#chart").boundingBox())!.height).toBeGreaterThan(
    20,
  );
  expect(
    (await page.locator("#compareChart").boundingBox())!.height,
  ).toBeGreaterThan(20);
  const expandedHeight = (await page.locator("#chartCard").boundingBox())!
    .height;
  await page.keyboard.press("Escape");
  expect((await page.locator("#chartCard").boundingBox())!.height).toBe(
    expandedHeight,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(divider).toHaveAttribute("aria-orientation", "vertical");
  await expect(divider).toHaveAttribute("aria-valuenow", "60");
  expect(errors).toEqual([]);
});
