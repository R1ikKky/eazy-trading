import { expect, type Page } from "@playwright/test";
export async function authenticateTestPage(page: Page) {
  if (!process.env.TEST_AUTH_LOGIN || !process.env.TEST_AUTH_PASSWORD) return;
  const base = process.env.BROWSER_BASE_URL || "http://127.0.0.1:3100";
  const response = await page.request.post("/api/auth/login", {
    headers: { origin: base },
    data: {
      login: process.env.TEST_AUTH_LOGIN,
      password: process.env.TEST_AUTH_PASSWORD,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}
