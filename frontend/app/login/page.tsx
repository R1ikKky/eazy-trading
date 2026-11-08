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
    if (new URLSearchParams(location.search).has("error"))
      setError(
        "Social sign-in could not be completed. Try your original sign-in method.",
      );
  }, []);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="auth-brand" href="/">
          ▶ replaylab
        </a>
        <h1>{register ? "Create an account" : "Welcome back"}</h1>
        <p>Your private trading workspace.</p>
        <div className="oauth-buttons">
          {(["google", "github"] as const).map((provider) => (
            <button
              key={provider}
              type="button"
              disabled={!providers[provider] || busy}
              title={
                providers[provider] ? "" : "This sign-in method is unavailable"
              }
              onClick={() => location.assign(`/api/auth/${provider}/start`)}
            >
              {provider === "google"
                ? "Continue with Google"
                : "Continue with GitHub"}
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
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={register ? 12 : 1}
              maxLength={256}
            />
          </label>
          {register && <p className="auth-help">Use at least 12 characters.</p>}
          <p role="alert" className="auth-error">
            {error}
          </p>
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
          </button>
        </form>
        {providers.registration && (
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
        )}
      </section>
    </main>
  );
}
