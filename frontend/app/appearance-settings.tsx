"use client";
import { useEffect, useRef, useState } from "react";
import {
  initializeTheme,
  currentTheme,
  setTheme,
  THEMES,
  type Theme,
} from "../src/replay/theme";
import {
  t as translate,
  initializeLanguage,
  changeLanguage,
  type Language,
} from "../src/i18n/language";
import { useLanguage } from "../src/i18n/use-language";
export function ThemeInitializer() {
  useEffect(() => {
    initializeLanguage();
    initializeTheme();
  }, []);
  return null;
}
export function AppearanceSettings() {
  const language = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, select] = useState<Theme>("dark");
  const [busy, setBusy] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<Language | null>(null);
  const [error, setError] = useState("");
  const outsidePress = useRef(false);
  const isOutside = (
    event: { clientX: number; clientY: number },
    element: HTMLDialogElement,
  ) => {
    const bounds = element.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  };
  async function chooseLanguage(value: Language) {
    setPendingLanguage(value);
    setBusy(true);
    setError("");
    try {
      await changeLanguage(value);
    } catch {
      setError(translate("Не удалось сохранить настройки"));
      setBusy(false);
      setPendingLanguage(null);
    }
  }
  return (
    <>
      <button
        type="button"
        className="icon-button theme-toggle"
        id="appearanceOpen"
        aria-label={translate("Настройки оформления")}
        aria-haspopup="dialog"
        onClick={() => {
          select(currentTheme());
          dialog.current?.showModal();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="m9.5 3-.7 2.2-2 .9-2.1-.5-2.5 4.3 1.5 1.7v2.3l-1.5 1.7 2.5 4.3 2.1-.5 2 .9.7 2.2h5l.7-2.2 2-.9 2.1.5 2.5-4.3-1.5-1.7v-2.3l1.5-1.7-2.5-4.3-2.1.5-2-.9L14.5 3z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        className="appearance-settings"
        aria-labelledby="appearance-title"
        onPointerDown={(event) => {
          outsidePress.current =
            event.button === 0 &&
            event.target === event.currentTarget &&
            isOutside(event, event.currentTarget);
        }}
        onPointerCancel={() => {
          outsidePress.current = false;
        }}
        onClick={(event) => {
          if (
            outsidePress.current &&
            event.target === event.currentTarget &&
            isOutside(event, event.currentTarget)
          )
            event.currentTarget.close();
          outsidePress.current = false;
        }}
      >
        <div className="dialog-header">
          <div>
            <h2 id="appearance-title">{translate("Настройки")}</h2>
            <p className="settings-subtitle">
              {translate("Настройте рабочее пространство")}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={translate("Закрыть настройки оформления")}
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <section className="settings-section">
          <h3>{translate("Оформление")}</h3>
          <fieldset className="theme-choices">
            <legend>{translate("Тема интерфейса")}</legend>
            {THEMES.map((value) => (
              <label key={value} className="theme-choice">
                <input
                  type="radio"
                  name="interface-theme"
                  value={value}
                  checked={selected === value}
                  onChange={() => {
                    select(value);
                    setTheme(value);
                  }}
                />
                <span
                  className={`theme-preview theme-preview-${value}`}
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                </span>
                <span className="theme-choice-name">
                  {value[0].toUpperCase() + value.slice(1)}
                  <span aria-hidden="true">
                    {selected === value ? "✓" : ""}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        </section>
        <section className="settings-section settings-language">
          <h3>{translate("Язык")}</h3>
          <fieldset className="language-choices" disabled={busy}>
            <legend>{translate("Язык интерфейса")}</legend>
            {(
              [
                { value: "en", name: "English", code: "EN" },
                { value: "ru", name: "Русский", code: "RU" },
              ] as const
            ).map(({ value, name, code }) => (
              <label key={value} className="language-choice">
                <input
                  type="radio"
                  name="interface-language"
                  value={value}
                  checked={(pendingLanguage || language) === value}
                  onChange={() => void chooseLanguage(value)}
                />
                <span className="language-code" aria-hidden="true">
                  {code}
                </span>
                <span lang={value}>{name}</span>
                <span className="language-check" aria-hidden="true">
                  {language === value ? "✓" : ""}
                </span>
              </label>
            ))}
          </fieldset>
          <p className="settings-subtitle" role="status">
            {busy
              ? translate("Применение") + "…"
              : error || translate("Язык применяется ко всем разделам сайта")}
          </p>
        </section>
      </dialog>
    </>
  );
}
