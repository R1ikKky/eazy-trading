import { expect, type Page } from "@playwright/test";
export async function authenticateTestPage(page: Page, language: "ru" | "en" | null = "ru") {
  if (language) await page.addInitScript((value) => {
    if (!localStorage.getItem("replay-lab-language")) localStorage.setItem("replay-lab-language", value);
  }, language);
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

export async function chooseTheme(page: Page, theme: "Dark" | "Yellow" | "Blue") {
  await page.getByRole("button", { name: "Настройки оформления", exact: true }).click();
  await page.getByRole("radio", { name: theme, exact: true }).check();
  await page.getByRole("button", { name: "Закрыть настройки оформления", exact: true }).click();
}
