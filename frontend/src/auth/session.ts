let refreshInFlight: Promise<boolean> | undefined;
let originalFetch: typeof fetch;
let activeUser: string | undefined;
export function setUserScope(id: string) {
  activeUser = id;
  try {
    sessionStorage.setItem("replay-user-id", id);
  } catch {}
}
async function refresh() {
  const request = originalFetch || fetch;
  const work = async () => {
    const existing = await request("/api/auth/me", { cache: "no-store" });
    if (existing.ok) {
      const user = await existing.json();
      if (activeUser && activeUser !== user.id) {
        location.replace("/");
        return false;
      }
      return true;
    }
    if (existing.status !== 401)
      throw Error("Authentication server unavailable");
    const result = await request("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
    });
    if (!result.ok && result.status !== 401)
      throw Error("Authentication server unavailable");
    if (
      result.ok &&
      activeUser &&
      (await result.json()).user.id !== activeUser
    ) {
      location.replace("/");
      return false;
    }
    return result.ok;
  };
  if (navigator.locks) return navigator.locks.request("replay-refresh", work);
  return work();
}
export function ensureSession() {
  return (refreshInFlight ||= refresh().finally(() => {
    refreshInFlight = undefined;
  }));
}
export function installAuthFetch() {
  if (originalFetch) return;
  originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      location.origin,
    );
    const protectedApi =
      url.origin === location.origin &&
      url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith("/api/auth/") &&
      url.pathname !== "/api/health";
    if (protectedApi && activeUser) {
      const headers = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined),
      );
      headers.set("x-replay-user", activeUser);
      init = { ...init, headers };
    }
    const retryInput = input instanceof Request ? input.clone() : input;
    const response = await originalFetch(input, init);
    if (
      protectedApi &&
      response.status === 409 &&
      (
        await response
          .clone()
          .json()
          .catch(() => ({}))
      ).error === "ACCOUNT_CHANGED"
    ) {
      location.replace("/");
      throw Error("Account changed. Reloading workspace.");
    }
    if (response.status !== 401 || !protectedApi) return response;
    if (await ensureSession()) return originalFetch(retryInput, init);
    location.replace("/login?expired=1");
    return response;
  };
}
