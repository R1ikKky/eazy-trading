import { expect, test } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("themed session deletion supports cancellation, keyboard, mobile and persistence", async ({
  page,
}) => {
  await authenticateTestPage(page, "en");
  const errors: string[] = [],
    nativeDialogs: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => {
    nativeDialogs.push(dialog.type());
    await dialog.dismiss();
  });
  const workspace = async () =>
    (await page.request.get("/api/workspace", { maxRetries: 2 })).json();
  const waitSaved = () =>
    expect(page.locator("#saveStatus")).toHaveAttribute("data-state", "saved", {
      timeout: 30000,
    });
  const create = async (name: string) => {
    await page.goto("/sessions");
    await waitSaved();
    await page.locator("#setupOpen").click();
    await page.locator("#sessionName").fill(name);
    await page.locator("#fromDate").fill("2024-01-08");
    await page.locator("#toDate").fill("2024-01-12");
    await page.locator('#setupForm button[type="submit"]').click();
    await expect(page.locator("#setupDialog")).not.toBeVisible({
      timeout: 45000,
    });
    await expect(page.locator("#lastPrice")).toHaveText(/[0-9]/);
    await expect(page.locator("#drawingCount")).not.toBeVisible();
    await waitSaved();
    return (await workspace()).settings.activeSessionId;
  };
  const name = "Delete <session> & journal";
  const target = await create(name),
    keeper = await create("Keep this session");
  await page.goto("/sessions");
  await waitSaved();
  const before = await workspace();
  const opener = page.locator(`[data-delete-session="${target}"]`);
  const dialog = page.getByRole("dialog", {
    name: "Delete session?",
    exact: true,
  });
  const theme = async (name: string) => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("radio", { name, exact: true }).check();
    await page
      .getByRole("button", { name: "Close settings", exact: true })
      .click();
  };
  for (const [index, color] of ["Dark", "Yellow", "Blue"].entries()) {
    await theme(color);
    await opener.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".session-delete-summary strong")).toHaveText(
      name,
    );
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    const styles = await dialog.evaluate((el) => {
      const backdrop = getComputedStyle(el, "::backdrop");
      const probe = document.createElement("div");
      probe.style.background = "var(--surface)";
      document.body.append(probe);
      const surface = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        surface,
        background: getComputedStyle(el).backgroundColor,
        backdrop: backdrop.backgroundColor,
        blur: backdrop.backdropFilter,
      };
    });
    expect(styles.background).toBe(styles.surface);
    expect(styles.backdrop).toBe("rgba(0, 0, 0, 0)");
    expect(styles.blur).toBe("none");
    await page.screenshot({
      path: `/tmp/session-delete-${color.toLowerCase()}.png`,
    });
    if (index === 0) await page.keyboard.press("Enter");
    if (index === 1) await page.keyboard.press("Escape");
    if (index === 2)
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect((await workspace()).sessions.some((s: any) => s.id === target)).toBe(
      true,
    );
  }
  await opener.click();
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await theme("Yellow");
  await page.setViewportSize({ width: 390, height: 844 });
  await opener.click();
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "/tmp/session-delete-mobile.png" });
  await dialog
    .getByRole("button", { name: "Delete session", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toHaveCount(0);
  await waitSaved();
  await expect
    .poll(async () =>
      (await workspace()).sessions.some((s: any) => s.id === target),
    )
    .toBe(false);
  const after = await workspace();
  expect(after.sessions.length).toBe(before.sessions.length - 1);
  expect(after.settings.activeSessionId).toBe(keeper);
  await page.reload();
  await waitSaved();
  await expect(opener).toHaveCount(0);
  // The active session keeps its existing guard against deletion.
  await page.locator(`[data-delete-session="${keeper}"]`).click();
  await expect(page.locator("#toast")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect((await workspace()).sessions.some((s: any) => s.id === keeper)).toBe(
    true,
  );
  expect(nativeDialogs).toEqual([]);
  expect(errors).toEqual([]);
});
