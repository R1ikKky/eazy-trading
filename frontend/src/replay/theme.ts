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
      button.querySelector<HTMLElement>("span").innerHTML =
        current === "dark"
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14a8 8 0 0 1-10-10 8.5 8.5 0 1 0 10 10Z"/></svg>';
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
