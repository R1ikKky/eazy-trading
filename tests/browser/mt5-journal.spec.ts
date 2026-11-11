import { test, expect } from "@playwright/test";
import { authenticateTestPage } from "./auth-helper";

test("Windows pairing uses no broker password and gates sync on this PC connection", async ({
  page,
}) => {
  await authenticateTestPage(page, "en");
  const id = "00000000-0000-4000-8000-000000000002";
  let account: any = null;
  let payload: any;
  let online = false;
  const pairingKey = id + "." + "x".repeat(43);
  await page.route("**/api/mt5/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    let data: any;
    if (path.endsWith("/connections") && request.method() === "GET")
      data = {
        configured: true,
        workerOnline: true,
        accounts: account ? [{ ...account, workerOnline: online }] : [],
      };
    else if (path.endsWith("/connections") && request.method() === "POST") {
      payload = request.postDataJSON();
      account = {
        id,
        label: payload.label,
        login: payload.login,
        server: payload.server,
        syncLocation: "local",
        workerOnline: false,
        connected: false,
        lastSync: null,
        currency: null,
        job: null,
      };
      data = { id };
    } else if (path.endsWith("/windows")) {
      account.connected = true;
      data = {
        token: pairingKey,
        login: account.login,
        server: account.server,
      };
    } else if (path.endsWith("/local/heartbeat")) {
      online = true;
      data = { login: account.login, server: account.server };
    } else
      data = {
        trades: [],
        positions: [],
        adjustments: [],
        warnings: 0,
        total: 0,
        currency: null,
        summary: { net: 0, closed: 0, wins: 0 },
      };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/journal");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "MT5", exact: true }).click();
  await page.getByRole("button", { name: "Connect MT5", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Windows PC", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByLabel("Investor password", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("MT5 account number", { exact: true }).fill("12345678");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use Windows PC", exact: true }),
  ).toBeVisible();
  expect(payload.mode).toBe("local");
  expect(payload.password).toBeUndefined();
  await page
    .getByRole("button", { name: "Use Windows PC", exact: true })
    .click();
  await expect(
    page.getByLabel("One-time pairing key", { exact: true }),
  ).toHaveValue(pairingKey);
  await expect(
    page.getByRole("button", { name: "Sync now", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Your Windows connector is offline.", { exact: false }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download Windows connector", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "eazy-trading-windows-connector.zip",
  );
  const artifact = await page.request.get(
    "/downloads/eazy-trading-windows-connector.zip",
  );
  expect(artifact.ok()).toBeTruthy();
  expect((await artifact.body()).subarray(0, 2).toString()).toBe("PK");
  await page.evaluate(() =>
    fetch("/api/mt5/local/heartbeat", { method: "POST" }),
  );
  await expect(
    page.getByRole("button", { name: "Sync now", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await page.getByRole("button", { name: "MT5", exact: true }).click();
  await expect(
    page.getByLabel("One-time pairing key", { exact: true }),
  ).toHaveCount(0);
});

test("MT5 setup status is honest and replay journal remains accessible", async ({
  page,
}) => {
  await authenticateTestPage(page, "en");
  await page.goto("/journal");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "MT5", exact: true }).click();
  await expect(
    page.getByText("MT5 sync is waiting for server setup.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect MT5", exact: true }).click();
  await expect(page.getByLabel("Server", { exact: true })).toHaveValue(
    "FundingPips-SIM1",
  );
  await expect(
    page.getByRole("button", { name: "Save connection", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.locator("#journalFilters")).toBeVisible();
});

test("MT5 investor connection, sync and notes UI use separate broker ledger at laptop size", async ({
  page,
}) => {
  await authenticateTestPage(page, "en");
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = "00000000-0000-4000-8000-000000000001";
  let accounts: any[] = [];
  let saved: any;
  let imported = false;
  let annotation = {
    note: "",
    tags: [] as string[],
    strategy: "",
    plannedRisk: null as number | null,
  };
  await page.route("**/api/mt5/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    let data: any = {};
    if (path.endsWith("/connections") && req.method() === "GET")
      data = {
        configured: true,
        workerOnline: true,
        accounts,
        servers: ["FundingPips-SIM1"],
      };
    else if (path.endsWith("/connections") && req.method() === "POST") {
      saved = req.postDataJSON();
      accounts = [
        {
          id,
          label: saved.label,
          login: saved.login,
          server: saved.server,
          connected: true,
          currency: null,
          lastSync: null,
          job: null,
        },
      ];
      data = { id };
    } else if (path.endsWith("/sync")) {
      imported = true;
      accounts[0] = {
        ...accounts[0],
        currency: "EUR",
        lastSync: new Date().toISOString(),
        job: { status: "succeeded" },
      };
      data = { status: "queued" };
    } else if (path.includes("/trades/")) {
      annotation = req.postDataJSON();
      data = { saved: true };
    } else if (path.endsWith("/journal"))
      data = {
        trades: imported
          ? [
              {
                id: "71:901",
                symbol: "XAUUSD.a",
                side: "buy",
                volume: 0.03,
                entryPrice: 2000,
                exitPrice: 2020,
                openedAt: 1700000000000,
                closedAt: 1700000060000,
                profit: 60,
                commission: -3,
                swap: -2,
                fee: -0.5,
                net: 54.5,
                fills: ["901", "902"],
                annotation,
              },
            ]
          : [],
        positions: [],
        adjustments: [],
        warnings: 0,
        total: imported ? 1 : 0,
        currency: "EUR",
        summary: {
          net: imported ? 54.5 : 0,
          closed: imported ? 1 : 0,
          wins: imported ? 1 : 0,
        },
      };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/journal");
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "MT5", exact: true }).click();
  await page.getByRole("button", { name: "Connect MT5", exact: true }).click();
  await page.getByLabel("MT5 account number", { exact: true }).fill("12345678");
  await page.getByRole("button", { name: "VPS worker", exact: true }).click();
  await page
    .getByLabel("Investor password", { exact: true })
    .fill("synthetic-investor-password");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sync now", exact: true }),
  ).toBeEnabled();
  expect(saved.server).toBe("FundingPips-SIM1");
  expect(saved.password).toBe("synthetic-investor-password");
  await expect(
    page.getByLabel("Investor password", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.getByText("XAUUSD.a", { exact: true })).toBeVisible();
  await expect(page.locator(".mt5-stats")).toContainText("54.50 EUR");
  await page
    .getByRole("button", { name: "Details & notes", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "XAUUSD.a · buy · 0.03 lots",
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Notes", { exact: true })
    .fill("First line\nSecond line");
  await dialog.getByLabel("Strategy", { exact: true }).fill("London breakout");
  await dialog.getByLabel("Planned initial risk", { exact: false }).fill("20");
  await dialog.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "London breakout", exact: true }),
  ).toBeVisible();
  expect(annotation.note).toBe("First line\nSecond line");
  await expect(page.locator(".mt5-journal tbody")).toContainText("2.73");
  expect(
    await page
      .locator(".mt5-toolbar")
      .evaluate((el) => el.getBoundingClientRect().right <= innerWidth),
  ).toBe(true);
  expect(errors).toEqual([]);
});
