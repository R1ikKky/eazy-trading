import { test, expect } from "@playwright/test";

test("password signup, private workspace, automatic refresh, logout and login", async ({
  page,
  context,
}) => {
  const base = process.env.BROWSER_BASE_URL || "http://127.0.0.1:3100";
  const username = "browser_" + Date.now();
  const password = "Browser-test-password-2026";
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
  expect((await page.request.patch("/api/auth/me", { headers: { origin: base }, data: { displayName: "Unauthorized" } })).status()).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Email", { exact: true })
    .fill(username + "@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  const cookies = await context.cookies(base + "/api/auth/me");
  expect(cookies.find((c) => c.name === "replay_access")?.httpOnly).toBe(true);
  expect(cookies.find((c) => c.name === "replay_refresh")?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "replay_access",
  );
  const refreshBefore = cookies.find((c) => c.name === "replay_refresh")!.value;
  await context.clearCookies({ name: "replay_access" });
  expect(
    await page.evaluate(async () => (await fetch("/api/workspace")).status),
  ).toBe(200);
  const refreshAfter = (await context.cookies(base + "/api/auth/me")).find(
    (c) => c.name === "replay_refresh",
  )!.value;
  expect(refreshAfter).not.toBe(refreshBefore);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Profile settings", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Profile test name");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();
  expect((await (await page.request.get("/api/auth/me")).json()).displayName).toBe("Profile test name");
  expect((await page.request.patch("/api/auth/me", {
    headers: { origin: base }, data: { displayName: "" },
  })).status()).toBe(400);
  expect((await page.request.patch("/api/auth/me", {
    headers: { origin: base }, data: { displayName: "Other", email: "changed@example.test" },
  })).status()).toBe(400);
  await page.getByRole("button", { name: "Close profile settings", exact: true }).click();
  await expect(page.locator(".profile-trigger")).toHaveText("P");
  await page.reload();
  await expect(page.locator(".profile-trigger")).toHaveText("P");
  await page.request.post("/api/auth/logout", { headers: { origin: base } });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("wrong password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".auth-error")).toContainText(
    "Invalid login or password",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.screenshot({ path: "/tmp/replay-auth-workspace.png" });
});
