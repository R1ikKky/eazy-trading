# Authentication

All workspace, attachment, dataset, market-data and order-flow APIs require authentication. The UI sends application tokens in HttpOnly, SameSite=Lax cookies; Secure is enabled for an HTTPS PUBLIC_ORIGIN. Tokens are never stored in localStorage. Access JWTs expire after **15 minutes**. Opaque refresh tokens expire **one calendar month from login** (UTC, clamped to month end). Refresh rotates the token without extending that deadline. Reusing an old refresh token revokes the whole session. Logout immediately revokes that session, including its access JWT. Multiple devices have separate sessions.

## Initial deployment / existing data

Set these in Dokploy **Environment**, using your own email and password, then redeploy:

```dotenv
PUBLIC_ORIGIN=https://eazy-trading.ru
PORT=3100
AUTH_OWNER_EMAIL=YOUR_EMAIL
AUTH_OWNER_USERNAME=owner
AUTH_BOOTSTRAP_PASSWORD=YOUR_STRONG_PASSWORD
AUTH_REGISTRATION_ENABLED=false
AUTH_ALLOWED_EMAILS=
AUTH_JWT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

Keep the existing PostgreSQL password, database volume and feed settings. The domain routes to service `web`, **container port 3000**; PORT=3100 is only the host binding. No separate API domain is needed.

Open `/login` and sign in as `owner` or your email. Only the explicitly configured owner receives existing `local-owner` workspaces, datasets and screenshots. New registrations receive empty, isolated workspaces. Existing browser drafts use separate per-account cache keys; the old shared cache is not imported into an account automatically. Export unsaved old drafts before upgrading. SQLite imports should run before the owner is bootstrapped so the migration can assign their data.

After the owner account has been created, remove AUTH_BOOTSTRAP_PASSWORD and redeploy. The bootstrap password does not use the registration password-length check and cannot block startup for being short. Normal signup still requires at least 12 characters. Bootstrap never resets an existing account password. If the configured username already belongs to another email, bootstrap skips creation with a warning and leaves the existing account unchanged. Keep AUTH_OWNER_EMAIL configured to reserve it. Back up PostgreSQL before upgrades.

AUTH_JWT_SECRET may be left blank: a cryptographically random, stable signing secret is generated and persisted in PostgreSQL. Alternatively set a random secret of at least 32 bytes, e.g. generated with `openssl rand -hex 32`; keep it server-side and consistent across API replicas. Changing the secret invalidates access tokens; existing refresh sessions can obtain new access tokens.

Set AUTH_REGISTRATION_ENABLED=true to allow password signup and new social accounts. With false, existing accounts can still sign in; a verified OAuth identity matching AUTH_OWNER_EMAIL can create the owner account. AUTH_ALLOWED_EMAILS optionally restricts all sign-in methods to a comma-separated email list. Password accounts do not verify email ownership: for a private installation keep registration disabled and bootstrap the owner.

## Google

Create a Google Cloud OAuth client of type **Web application**, configure its consent screen/audience, and add the exact authorized redirect URI:

```text
https://eazy-trading.ru/api/auth/google/callback
```

Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server environment and redeploy. In Google's testing mode add your account as a test user. The adapter requests `openid email profile`, uses authorization code + PKCE + one-time browser-bound state, and obtains a verified email and stable subject from Google's HTTPS userinfo endpoint.

Official setup: https://developers.google.com/identity/protocols/oauth2/web-server

## GitHub

Create a GitHub **OAuth App** (Settings → Developer settings → OAuth Apps), with homepage `https://eazy-trading.ru` and authorization callback:

```text
https://eazy-trading.ru/api/auth/github/callback
```

Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET and redeploy. The adapter requests `read:user user:email`, uses authorization code + PKCE + one-time browser-bound state, and requires a verified primary email from `/user/emails`. Private GitHub emails work when verified. Provider access tokens are used on the server during login and are not stored or returned to the browser.

Official flow: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
Email API: https://docs.github.com/en/rest/users/emails#list-email-addresses-for-the-authenticated-user

Accounts with the same email are **not linked automatically**. Use the original sign-in method if that email is already registered. Therefore, a bootstrapped password owner signs in with its password; use distinct emails when initially checking each OAuth provider. Account linking and password reset/email delivery are outside this feature.

## API and checks

Public routes: GET `/api/health`, GET `/api/auth/providers`, POST `/api/auth/register`, `/login`, `/refresh`, `/logout`, and GET `/api/auth/{google|github}/{start|callback}`. Protected GET `/api/auth/me` returns the current profile. Login accepts `{login,password}`; register accepts `{username,email,password}`. Cookie authentication is automatic; the guard also accepts an access JWT in an Authorization Bearer header. Mutating browser requests must carry the exact configured Origin. Identity headers cannot select an owner.

Password hashes use salted scrypt. Refresh tokens are stored as SHA-256 hashes. OAuth states expire after 10 minutes. Login/signup/OAuth starts share a PostgreSQL-backed limit of 30 attempts per 15 minutes per observed connection IP. Forwarded IP headers are not trusted; behind a reverse proxy this limit is conservative and can be shared by users. Expired sessions, states and rate-limit buckets are cleaned hourly.

```sh
npm run typecheck
npm test
DATABASE_URL=postgresql://... npm run test:integration
BROWSER_BASE_URL=http://127.0.0.1:3200 TEST_AUTH_LOGIN=owner TEST_AUTH_PASSWORD=YOUR_TEST_PASSWORD npm run test:browser
```

Integration tests create/drop their own temporary databases. Browser tests require a disposable running instance with registration enabled, OAuth credentials unset, demo feed enabled, and test owner credentials. They exercise real password signup/login/logout, automatic refresh, normal replay and footprint controls. OAuth integration tests mock only provider HTTPS endpoints while exercising actual app routes, PostgreSQL, state, cookies and token exchange. Real Google/GitHub redirects require your configured provider apps and are not validated by fixtures.
