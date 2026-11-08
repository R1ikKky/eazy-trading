"use client";
import { useEffect, useRef, useState } from "react";
import { initializeTheme, currentTheme, setTheme, type Theme } from "../src/replay/theme";
export function ThemeInitializer() {
  useEffect(() => initializeTheme(), []);
  return null;
}
export function AppearanceSettings() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, select] = useState<Theme>("dark");
  return <>
    <button type="button" className="icon-button theme-toggle" id="appearanceOpen"
      aria-label="Настройки оформления" aria-haspopup="dialog"
      onClick={() => { select(currentTheme()); dialog.current?.showModal(); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m9.5 3-.7 2.2-2 .9-2.1-.5-2.5 4.3 1.5 1.7v2.3l-1.5 1.7 2.5 4.3 2.1-.5 2 .9.7 2.2h5l.7-2.2 2-.9 2.1.5 2.5-4.3-1.5-1.7v-2.3l1.5-1.7-2.5-4.3-2.1.5-2-.9L14.5 3z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
    <dialog ref={dialog} className="appearance-settings" aria-labelledby="appearance-title">
      <div className="dialog-header">
        <h2 id="appearance-title">Оформление</h2>
        <button type="button" className="icon-button" aria-label="Закрыть настройки оформления" onClick={() => dialog.current?.close()}>×</button>
      </div>
      <fieldset className="theme-choices">
        <legend>Тема интерфейса</legend>
        {([{ value: "dark", name: "Dark" }, { value: "yellow", name: "Yellow" }, { value: "blue", name: "Blue" }] as const).map(({ value, name }) =>
          <label key={value} className="theme-choice">
            <input type="radio" name="interface-theme" value={value} checked={selected === value}
              onChange={() => { select(value); setTheme(value); }} />
            <span className={`theme-preview theme-preview-${value}`} aria-hidden="true"><i /><i /><i /></span>
            <span className="theme-choice-name">{name}<span aria-hidden="true">{selected === value ? "✓" : ""}</span></span>
          </label>)}
      </fieldset>
    </dialog>
  </>;
}
