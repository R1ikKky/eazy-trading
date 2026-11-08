"use client";
import { useEffect, useState } from "react";
import { setUserScope } from "../../src/auth/session";
export default function Login() {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [providers, setProviders] = useState({
    google: false,
    github: false,
    registration: false,
  });
  useEffect(() => {
    void fetch("/api/auth/providers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setProviders)
      .catch(() =>
        setError("Unable to load sign-in options. Reload to try again."),
      );
    const params = new URLSearchParams(location.search);
    if (params.has("error")) {
      const messages: Record<string, string> = {
        ACCOUNT_EXISTS:
          "An account with this email already exists. Sign in using its original method. Google and GitHub accounts are not linked automatically.",
        REGISTRATION_DISABLED:
          "New accounts are currently disabled. Sign in with an existing account or ask the site owner to enable registration.",
        ACCESS_DENIED: "This email is not permitted to access this site.",
      };
      setError(
        messages[params.get("reason") || ""] ||
          "Social sign-in could not be completed. Please try again. If it continues, contact the site owner.",
      );
    }
  }, []);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="auth-brand" href="/">
          <span className="auth-brand-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M8 5v14l11-7Z" />
            </svg>
          </span>
          <span>
            replay<span className="auth-brand-light">lab</span>
          </span>
        </a>
        <h1>{register ? "Create an account" : "Welcome back"}</h1>
        <p className="oauth-label">Login with</p>
        <div className="oauth-buttons">
          {(["google", "github"] as const).map((provider) => (
            <button
              key={provider}
              type="button"
              aria-label={
                provider === "google"
                  ? "Continue with Google"
                  : "Continue with GitHub"
              }
              disabled={!providers[provider] || busy}
              title={
                providers[provider] ? "" : "This sign-in method is unavailable"
              }
              onClick={() => location.assign(`/api/auth/${provider}/start`)}
            >
              {provider === "google" ? (
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02l3.35-2.59Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.35 2.59C7.19 7.72 9.4 5.96 12 5.96Z"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.6-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.11c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
                </svg>
              )}
            </button>
          ))}
        </div>
        <div className="auth-divider">or use a password</div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            const data = new FormData(e.currentTarget);
            const value = register
              ? {
                  username: data.get("username"),
                  email: data.get("email"),
                  password: data.get("password"),
                }
              : { login: data.get("login"), password: data.get("password") };
            try {
              const response = await fetch(
                "/api/auth/" + (register ? "register" : "login"),
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(value),
                },
              );
              const result = await response.json();
              if (!response.ok)
                throw Error(result.message || "Sign-in failed.");
              setUserScope(result.user.id);
              location.assign("/");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to sign in.");
              setBusy(false);
            }
          }}
        >
          {register ? (
            <>
              <label>
                Username
                <input
                  name="username"
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9_][a-zA-Z0-9_.\-]*"
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
            </>
          ) : (
            <label>
              Username or email
              <input
                placeholder="Username or email"
                name="login"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
          )}
          <label>
            Password
            <input
              placeholder={
                register ? "At least 12 characters" : "Enter your password"
              }
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={register ? 12 : 1}
              maxLength={256}
            />
          </label>
          {register && (
            <p className="auth-help">
              {providers.registration
                ? "Use at least 12 characters."
                : "Account registration is currently closed."}
            </p>
          )}
          <p role="alert" className="auth-error">
            {error}
          </p>
          <button
            className="auth-submit"
            type="submit"
            disabled={busy || (register && !providers.registration)}
          >
            {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
          </button>
        </form>
        {
          <button
            className="auth-switch"
            type="button"
            disabled={busy}
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Already have an account? Sign in"
              : "Create an account"}
          </button>
        }
      </section>
    </main>
  );
}
