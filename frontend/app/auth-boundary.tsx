"use client";
import { createContext, useContext, useEffect, useState } from "react";
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
const UserContext = createContext<User | null>(null);
export function AuthBoundary({ children }: { children: React.ReactNode }) {
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
            ? "Unable to reach the server. Please reload."
            : "Loading your workspace…"}
        </p>
      </main>
    );
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
export function AccountMenu() {
  const user = useContext(UserContext);
  const [busy, setBusy] = useState(false);
  return (
    <div className="account-menu">
      <span className="account-avatar" aria-hidden="true">
        {(user?.username || user?.displayName || "R").slice(0, 1).toUpperCase()}
      </span>
      <span title={user?.email || ""}>
        {user?.username || user?.displayName}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await fetch("/api/auth/logout", { method: "POST" });
            if (!result.ok) throw Error();
            sessionStorage.removeItem("replay-user-id");
            location.replace("/login");
          } catch {
            setBusy(false);
            alert("Could not sign out. Try again.");
          }
        }}
      >
        Sign out
      </button>
    </div>
  );
}
