import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("ENTRY expands left and cancels untouched fills or closes at the current price after a step", async ({
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
  await page.locator("#sessionName").fill("Entry hover actions");
  await page.locator("#fromDate").fill("2024-01-08");
  await page.locator("#toDate").fill("2024-01-12");
  await page.locator('#setupForm button[type="submit"]').click();
  await expect(page.locator("#setupDialog")).not.toBeVisible({
    timeout: 45000,
  });
  await page.locator("#qty").fill("2");
  await page.locator("#stop").fill("40");
  await page.locator("#target").fill("80");
  const snapshot = async () => {
    const w = await (await page.request.get("/api/workspace")).json();
    return w.sessions.find((s: any) => s.id === w.settings.activeSessionId)
      .snapshot;
  };
  const control = page.locator("#chart .position-entry-control");
  await page.locator("#long").click();
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("data-action", "cancel");
  await expect.poll(async () => (await snapshot()).position?.side).toBe(1);
  const untouched = await snapshot();
  await page.mouse.move(900, 100);
  const collapsed = (await control.boundingBox())!;
  await control.locator(".position-entry-label").hover();
  const expanded = (await control.boundingBox())!;
  expect(expanded.x).toBeLessThan(collapsed.x - 30);
  expect(expanded.x + expanded.width).toBeCloseTo(
    collapsed.x + collapsed.width,
    2,
  );
  await page.screenshot({ path: "/tmp/entry-hover-cancel.png" });
  await control
    .getByRole("button", { name: "Cancel order", exact: true })
    .click();
  await expect(control).not.toBeVisible();
  await expect.poll(async () => (await snapshot()).position).toBeNull();
  expect((await snapshot()).trades).toHaveLength(0);
  expect((await snapshot()).index).toBe(untouched.index);
  await page.reload();
  await expect(page.locator("#lastPrice")).toHaveText(/[0-9]/, { timeout: 30000 });
  await expect(page.locator("#long")).toBeEnabled({ timeout: 30000 });
  await expect(control).not.toBeVisible();
  await page.locator("#long").click();
  await expect(control).toHaveAttribute("data-action", "cancel");
  await page.locator("#step").click();
  await expect(control).toHaveAttribute("data-action", "close");
  await expect
    .poll(async () => (await snapshot()).index)
    .toBe(untouched.index + 1);
  const open = await snapshot(),
    quote = Number(
      (await page.locator("#lastPrice").textContent())!.replaceAll(",", ""),
    );
  await page.locator("#comparisonTitle").click();
  await page.getByRole("menuitemradio", { name: /^NQ / }).click();
  const secondary = page.locator("#compareChart .position-entry-control");
  await expect(secondary).toBeVisible();
  await expect(secondary).toHaveAttribute("data-action", "close");
  await control.locator(".position-entry-label").hover();
  await page.screenshot({ path: "/tmp/entry-hover-close.png" });
  await control.getByRole("button", { name: "Close", exact: true }).click();
  await expect(control).not.toBeVisible();
  await expect(secondary).not.toBeVisible();
  await expect.poll(async () => (await snapshot()).trades.length).toBe(1);
  const closed = await snapshot();
  expect(closed.index).toBe(open.index);
  expect(closed.position).toBeNull();
  expect(closed.trades[0].exit).toBe(quote - open.position.slip * 0.25);
  await page.reload();
  await expect(page.locator("#lastPrice")).toHaveText(/[0-9]/, { timeout: 30000 });
  await expect(page.locator("#long")).toBeEnabled({ timeout: 30000 });
  expect((await snapshot()).trades).toHaveLength(1);
  await expect(control).not.toBeVisible();
  expect(errors).toEqual([]);
});
