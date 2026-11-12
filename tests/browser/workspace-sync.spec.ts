import { test, expect } from "@playwright/test";

test("two devices synchronize automatically and preserve a draft open on the other device", async ({
  browser,
}) => {
  const baseURL = process.env.BROWSER_BASE_URL || "http://127.0.0.1:3100";
  const username = "sync_" + Date.now(),
    password = "Browser-sync-test-password-2026";
  const a = await browser.newContext({ baseURL }),
    b = await browser.newContext({ baseURL });
  try {
    for (const context of [a, b])
      await context.addInitScript(() => {
        localStorage.setItem("eazy-trading-language", "en");
        // Independent devices both have a foreground page, unlike browser tabs.
        Object.defineProperty(document, "hidden", { get: () => false });
      });
    const registered = await a.request.post("/api/auth/register", {
      headers: { origin: baseURL },
      data: { username, email: username + "@example.test", password },
    });
    expect(registered.ok(), await registered.text()).toBeTruthy();
    const loggedIn = await b.request.post("/api/auth/login", {
      headers: { origin: baseURL },
      data: { login: username, password },
    });
    expect(loggedIn.ok()).toBeTruthy();
    const first = await a.newPage(),
      second = await b.newPage();
    for (const page of [first, second]) {
      await page.goto("/strategies");
      await expect(page.locator("#saveStatus")).toHaveAttribute(
        "data-state",
        "saved",
        { timeout: 30000 },
      );
    }
    await second.locator("[data-create-strategy]").first().click();
    await second.locator("#playbookName").fill("Device B draft");
    await first.locator("[data-create-strategy]").first().click();
    await first.locator("#playbookName").fill("Device A strategy");
    await first.locator("#playbookForm button[type=submit]").click();
    await expect(first.locator("#saveStatus")).toHaveAttribute(
      "data-state",
      "saved",
    );
    await second.waitForTimeout(5500);
    await expect(second.locator("#playbookName")).toHaveValue("Device B draft");
    await second.locator("#playbookForm button[type=submit]").click();
    for (const page of [first, second]) {
      await expect(
        page.getByRole("heading", { name: "Device A strategy", exact: true }),
      ).toBeVisible({ timeout: 20000 });
      await expect(
        page.getByRole("heading", { name: "Device B draft", exact: true }),
      ).toBeVisible({ timeout: 20000 });
      await expect(page.locator("#saveStatus")).toHaveAttribute(
        "data-state",
        "saved",
        { timeout: 15000 },
      );
      await expect(page.locator("#saveStatus")).not.toHaveAttribute(
        "role",
        "button",
      );
      await expect(page.locator("#saveStatus")).not.toHaveAttribute(
        "title",
        /restore|another device/i,
      );
    }
    const workspace = await (await a.request.get("/api/workspace")).json();
    const unchanged = await a.request.get(
      `/api/workspace?revision=${workspace.revision}`,
    );
    expect(unchanged.status()).toBe(204);
    expect((await unchanged.body()).length).toBe(0);
    expect(unchanged.headers()["cache-control"]).toBe("no-store");
    const changed = await a.request.get(
      `/api/workspace?revision=${workspace.revision - 1}`,
    );
    expect(changed.status()).toBe(200);
    expect((await changed.json()).revision).toBe(workspace.revision);
    expect(workspace.playbooks.map((p: any) => p.name).sort()).toEqual([
      "Device A strategy",
      "Device B draft",
    ]);
  } finally {
    await a.close();
    await b.close();
  }
});
