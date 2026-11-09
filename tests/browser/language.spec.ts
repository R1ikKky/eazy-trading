import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";
test("English default, six themes, and persisted language preserve the session", async ({
  page,
}) => {
  await authenticateTestPage(page, null);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/sessions");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('[data-view="sessions"]')).toHaveText("Sessions");
  await expect(page.locator('[data-view="journal"]')).toHaveText("Journal");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Customization", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".theme-choices").getByRole("radio")).toHaveCount(
    6,
  );
  await expect(
    page.getByRole("radio", { name: "English", exact: true }),
  ).toBeChecked();
  const backgrounds = new Set<string>();
  for (const theme of ["Light", "Forest", "Rose"]) {
    await page.getByRole("radio", { name: theme, exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      theme.toLowerCase(),
    );
    backgrounds.add(
      await page
        .locator(".app-shell")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    await page.screenshot({
      path: `/tmp/settings-${theme.toLowerCase()}-english.png`,
    });
  }
  expect(backgrounds.size).toBe(3);
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.locator("#setupOpen").click();
  await page.locator("#sessionName").fill("Новая сессия · user text");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.locator("#step").click();
  const index = await page.locator("#progressLabel").textContent();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Русский", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru", {
    timeout: 30000,
  });
  await expect(page.locator('[data-view="sessions"]')).toHaveText("Сессии");
  await expect(page.locator("#rangeLabel")).toContainText("2024", {
    timeout: 30000,
  });
  await expect(page.locator("#progressLabel")).toHaveText(
    index!.replace("Candle", "Свеча").replace("of", "из"),
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rose");
  const workspace = await (await page.request.get("/api/workspace")).json();
  const session = workspace.sessions.find(
    (s: any) => s.id === workspace.settings.activeSessionId,
  );
  expect(session.name).toBe("Новая сессия · user text");
  await page.locator('[data-group="fib"]').click();
  await expect(page.locator(".drawing-group-menu strong")).toHaveText(
    "Фибоначчи",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Настройки оформления", exact: true })
    .click();
  await page.getByRole("radio", { name: "English", exact: true }).click();
  await expect(page.locator('[data-view="sessions"]')).toHaveText("Sessions", {
    timeout: 30000,
  });
  await expect(page.locator("#progressLabel")).toHaveText(index!);
  await page.locator('[data-group="fib"]').click();
  await expect(page.locator(".drawing-group-menu strong")).toHaveText(
    "Fibonacci",
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const bounds = (await page.locator(".appearance-settings").boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "/tmp/settings-language-mobile.png" });
  await page.mouse.click(3, 3);
  await expect(page.locator(".appearance-settings")).not.toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('[data-view="sessions"]')).toHaveText("Sessions");
  expect(errors).toEqual([]);
});
