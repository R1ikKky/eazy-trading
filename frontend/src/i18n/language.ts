import english from "./en.json";
export const LANGUAGES = ["en", "ru"] as const;
export type Language = (typeof LANGUAGES)[number];
const storageKey = "replay-lab-language";
let selected: Language = "en";
const listeners = new Set<() => void>();
let flushWorkspace: (() => Promise<unknown>) | undefined;
const dictionary: Record<string, string> = english;
const phrasePattern = new RegExp(
  "(?<![А-Яа-яЁё])(?:" +
    Object.keys(dictionary)
      .sort((a, b) => b.length - a.length)
      .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|") +
    ")(?![А-Яа-яЁё])",
  "g",
);
export const currentLanguage = () => selected;
export const locale = () => (selected === "ru" ? "ru-RU" : "en-US");
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setLanguage(language: Language) {
  selected = LANGUAGES.includes(language) ? language : "en";
  if (typeof document !== "undefined") document.documentElement.lang = selected;
  try {
    localStorage.setItem(storageKey, selected);
  } catch {}
  for (const listener of listeners) listener();
}
export function initializeLanguage() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(storageKey);
  } catch {}
  setLanguage(
    LANGUAGES.includes(saved as Language) ? (saved as Language) : "en",
  );
}
/** Translate app-owned copy only. User content is passed separately through tr. */
export function t(source: string): string {
  return selected === "ru"
    ? source
    : source.replace(phrasePattern, (phrase) => dictionary[phrase]);
}
/** Translate static template segments without touching interpolated names, notes or HTML. */
export function tr(parts: TemplateStringsArray, ...values: unknown[]) {
  return parts.reduce(
    (text, part, index) =>
      text + t(part) + (index < values.length ? String(values[index]) : ""),
    "",
  );
}
export function configureLanguagePersistence(flush: () => Promise<unknown>) {
  flushWorkspace = flush;
}
export async function changeLanguage(language: Language) {
  if (language === selected) return;
  // Save the active session before reloading the imperative chart controllers.
  window.dispatchEvent(new Event("language-will-change"));
  await flushWorkspace?.();
  // The chart owns DOM inside React containers. Apply the new locale on the
  // next document rather than reconciling those containers during reload.
  localStorage.setItem(storageKey, language);
  location.reload();
}
