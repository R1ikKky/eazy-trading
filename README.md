# eazy trading

Manual NQ/ES replay, trading journal, strategies, chart drawings, screenshots, CSV imports, and analytics.

The application now runs on **Next.js + TypeScript**, **NestJS + TypeScript**, and **PostgreSQL + TypeORM**. The existing design and replay execution rules are preserved, including the local UI edits present before this migration.

## Docker

```sh
docker compose up -d --build
```

Open **http://127.0.0.1:3000**. PostgreSQL starts first; Nest applies the versioned TypeORM migration before serving the API. Next proxies `/api/*` to Nest on the internal network. Database records and screenshot bytes persist in the `postgres-data` volume.

To run beside the old application on port 3000:

```sh
PORT=3100 POSTGRES_PORT=55432 docker compose -p eazy-trading-next up -d --build
```

Use a different PostgreSQL port if one is already occupied. Do not use `docker compose down -v` unless you intend to delete the database. The former `replay-data` volume is not modified or imported automatically.

Authentication is required. Before starting, configure `AUTH_OWNER_EMAIL`, `AUTH_OWNER_USERNAME` and `AUTH_BOOTSTRAP_PASSWORD` in `.env` or Dokploy Environment to create your account and claim existing data. Registration is disabled by default. See [authentication setup](docs/authentication.md) for Google/GitHub OAuth and token behavior.

Existing installations should keep their current Docker Compose project name and database volume when updating. The project rename does not require a new database.

## Development

Node.js 24+ and PostgreSQL 17 are required. `backend/` and `frontend/` are separate npm workspaces, installed together with the root lockfile. Root scripts coordinate both apps; each folder can also run independently.

```sh
npm run dev:backend    # equivalent to cd backend && npm run dev
npm run dev:frontend   # equivalent to cd frontend && npm run dev
```


```sh
npm ci
cp .env.example .env
docker compose up -d db
npm run dev
```

Open http://127.0.0.1:3000. `DATABASE_URL` configures Nest. The backend reads `backend/.env` before the shared root `.env`; the frontend uses its own `.env` files with root `.env` defaults. `PUBLIC_ORIGIN` must match the browser origin. `API_PORT` defaults to 3001; `API_INTERNAL_URL` configures Next's API proxy and must be set when building with a different backend address. For a different frontend port, export `PORT` and set the corresponding `PUBLIC_ORIGIN` for both processes.

```sh
npm run typecheck
npm test
npm run build
npm start
```

`npm run test:integration` uses `DATABASE_URL` to create its own temporary database and removes only that database. Its PostgreSQL role needs `CREATEDB`; the configured application database is not altered. It tests HTTP validation, origin protection, revision races, restart persistence, datasets, screenshots, archive checksums, and SQLite import/rollback.

Browser checks require the new app running against a test database on port 3100:

```sh
TEST_AUTH_LOGIN=owner TEST_AUTH_PASSWORD=YOUR_TEST_PASSWORD npm run test:browser
```

`BROWSER_BASE_URL` changes the URL, and `CHROMIUM_PATH` changes the Chromium executable (default `/usr/bin/chromium`). Use a disposable instance with registration enabled and OAuth credentials unset. These tests create accounts and sessions in that test workspace.

## Import existing local data

Back up the complete old `.local-data` directory first, including `workspace.sqlite`, its WAL files if present, and `objects/`. Stop the old server while taking the backup. For the old Docker instance, its data is in the `replay-data` volume mounted at `/app/.local-data`; copy that directory out of the stopped container.

With an empty PostgreSQL target and the new API stopped:

```sh
npm run build:backend
npm run import:sqlite -- /absolute/path/to/old/.local-data
```

The importer reads SQLite without changing it, verifies imported dataset checksums, and imports workspaces, datasets/manifests, and screenshots referenced by workspaces in one PostgreSQL transaction. IDs and revisions remain unchanged. Missing objects or conflicting IDs roll back the entire import. It deliberately refuses to overwrite an existing workspace. Keep the original backup: unreferenced historical snapshots and orphaned objects remain there.

Browser theme/chart preferences and offline drafts remain tied to their original browser origin. The JSON backup UI remains compatible, but JSON does not contain uploaded CSV files or screenshots. No personal data from the hosted site is included in this repository.

## Source layout

- `frontend/app/`: Next App Router pages, React workspace markup, styles.
- `frontend/src/replay/`: TypeScript replay engine, chart controllers, imports, workspace cache, analytics and validation. Canvas and chart interactions retain their imperative controllers to preserve behavior. The frontend TypeScript migration currently permits dynamic types in these controllers; the API uses strict TypeScript.
- `backend/`: independent NestJS workspace with its own package scripts, Nest CLI configuration and Dockerfile. Feature modules live in `src/modules/`; shared infrastructure in `src/common/`, `src/config/`, and `src/database/`. See [backend/README.md](backend/README.md).
- `frontend/`: independent Next.js workspace with its own package scripts and Dockerfile. See [frontend/README.md](frontend/README.md).
- `data/market-archives.json`: backend immutable archive catalog.
- `market-archives/`: original monthly OHLCV files, still verified by SHA-256. Prices, IDs and timestamps are unchanged.
- `tests/`: regression tests now exercising the TypeScript modules, plus old API compatibility tests; `backend/test/` and `tests/browser/` cover the new stack.

`dist/`, `worker/`, `drizzle/`, and `scripts/local-server.mjs` are retained as the original implementation for rollback, migration fixtures and provenance. They are **not used by the new production app**. Do not delete `dist/` as if it were generated output. New generated output lives in `backend/dist/` and `frontend/.next/`.

Historical data provenance and execution limitations are preserved in [the original README](docs/legacy-readme.md). Archived setup notes are in [docs/legacy-local-setup.md](docs/legacy-local-setup.md). Existing Python market-data preparation tools remain available; they are not application servers.

Footprint, demo streaming, and Databento setup: [docs/orderflow.md](docs/orderflow.md).

`packages/orderflow/` owns the shared trade format, contract specifications, CSV parsing, deduplication, and footprint aggregation used by replay and streaming.

Bundled NQ/ES summer 2026 gap repair, pinned source files, validation and saved-session compatibility: [docs/summer-2026-data.md](docs/summer-2026-data.md).
