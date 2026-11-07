(() => {
  const key = "replay-lab-theme";
  const root = document.documentElement;
  let saved;
  try {
    saved = localStorage.getItem(key);
  } catch {}
  let current = saved === "dark" || saved === "light" ? saved : "dark";
  function apply() {
    root.dataset.theme = current;
    document
      .querySelector<HTMLElement>('meta[name="theme-color"]')
      ?.setAttribute("content", current === "dark" ? "#111017" : "#f7f7fa");
    const button = document.getElementById("themeToggle");
    if (button) {
      button.setAttribute("aria-pressed", String(current === "dark"));
      button.title =
        current === "dark" ? "Включить светлую тему" : "Включить тёмную тему";
      button.querySelector<HTMLElement>("span").textContent =
        current === "dark" ? "☀" : "☾";
    }
  }
  apply();
  function bind() {
    apply();
    document.getElementById("themeToggle").addEventListener("click", () => {
      current = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(key, current);
      } catch {}
      apply();
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();

export {};
