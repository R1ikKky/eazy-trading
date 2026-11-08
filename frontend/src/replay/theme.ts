export const THEMES = ["dark", "yellow", "blue"] as const;
export type Theme = (typeof THEMES)[number];
const key = "replay-lab-theme";
export function currentTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return THEMES.includes(value as Theme) ? value as Theme : "dark";
}
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", {
    dark: "#101113", yellow: "#f3edd7", blue: "#0b1424",
  }[theme]);
  try { localStorage.setItem(key, theme); } catch {}
}
export function initializeTheme() {
  let saved: string | null = null;
  try { saved = localStorage.getItem(key); } catch {}
  setTheme(THEMES.includes(saved as Theme) ? saved as Theme : "dark");
}
