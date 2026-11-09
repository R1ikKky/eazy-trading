"use client";
import { t as translate } from "../src/i18n/language";
import { useLanguage } from "../src/i18n/use-language";
import { createContext, useContext, useEffect, useState, useRef } from "react";
import {
  ensureSession,
  installAuthFetch,
  setUserScope,
} from "../src/auth/session";
type User = {
  id: string;
  username: string | null;
  email: string | null;
  displayName: string;
};
const UpdateUserContext = createContext<(user: User) => void>(() => {});
const UserContext = createContext<User | null>(null);
export function AuthBoundary({ children }: { children: React.ReactNode }) {
  useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!(await ensureSession())) {
          location.replace("/login");
          return;
        }
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) {
          location.replace("/login");
          return;
        }
        const current = await response.json();
        if (!active) return;
        setUserScope(current.id);
        installAuthFetch();
        setUser(current);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  if (!user)
    return (
      <main className="auth-page">
        <p>
          {failed
            ? translate("Сервер недоступен. Обновите страницу.")
            : translate("Загрузка рабочего пространства…")}
        </p>
      </main>
    );
  return <UserContext.Provider value={user}><UpdateUserContext.Provider value={setUser}>{children}</UpdateUserContext.Provider></UserContext.Provider>;
}
export function AccountMenu() {
  useLanguage();
  const user = useContext(UserContext);
  const updateUser = useContext(UpdateUserContext);
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <>
      <button type="button" className="account-menu profile-trigger"
        aria-label={translate("Настройки профиля")} aria-haspopup="dialog"
        onClick={() => {
          setName(user?.displayName || "");
          setMessage("");
          dialog.current?.showModal();
        }}>
        <span className="account-avatar" aria-hidden="true">
          {(user?.displayName || user?.username || "R").slice(0, 1).toUpperCase()}
        </span>
      </button>
      <dialog ref={dialog} className="profile-settings" aria-labelledby="profile-title">
        <div className="dialog-header">
          <h2 id="profile-title">{translate("Настройки профиля")}</h2>
          <button type="button" className="icon-button" aria-label={translate("Закрыть настройки профиля")}
            onClick={() => dialog.current?.close()}>×</button>
        </div>
        <form onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const response = await fetch("/api/auth/me", {
              method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ displayName: name }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || translate("Не удалось сохранить профиль."));
            updateUser(result);
            setName(result.displayName);
            setMessage(translate("Изменения сохранены."));
          } catch (error) {
            setMessage(error instanceof Error ? error.message : translate("Не удалось сохранить профиль."));
          } finally { setBusy(false); }
        }}>
          <label htmlFor="profile-name">{translate("Отображаемое имя")}</label>
          <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)}
            required maxLength={100} autoComplete="name" disabled={busy} />
          <dl className="profile-details">
            <div><dt>{translate("Логин")}</dt><dd>{user?.username || "—"}</dd></div>
            <div><dt>Email</dt><dd>{user?.email || "—"}</dd></div>
          </dl>
          <p role="status" className="profile-message">{message}</p>
          <button type="submit" className="button primary full" disabled={busy || !name.trim()}>
            {busy ? translate("Сохранение…") : translate("Сохранить изменения")}
          </button>
        </form>
      </dialog>
    </>
  );
}
