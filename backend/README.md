# Backend

NestJS application with strict TypeScript, PostgreSQL and TypeORM.

Install dependencies from the repository root with `npm ci`. From this folder:

```sh
npm run dev                 # Nest CLI watch mode
npm run build               # compiled application in dist/
npm start
npm run typecheck
npm run migration:run       # build first
npm run import:sqlite -- /absolute/path/to/backup
npm run test:integration    # builds and tests in a temporary PostgreSQL database
```

Environment variables take precedence over `backend/.env`, then the root `.env`. Copy `.env.example` if using a backend-specific environment. The frontend origin must match `PUBLIC_ORIGIN`.

```text
src/
  main.ts                   # HTTP bootstrap and global /api prefix
  app.module.ts             # composition of feature modules
  common/
    exceptions/             # API error helper
    filters/                # exception-to-HTTP mapping
    guards/                 # origin and host protection
    http/                   # bounded raw-body and JSON readers
    validation/             # shared JSON/id predicates
  config/                   # environment loading and project paths
  database/
    database.module.ts      # TypeORM connection
    database.config.ts      # PostgreSQL/entity/migration options
    data-source.ts          # TypeORM CLI entry
    migrations/             # versioned migrations; synchronize is disabled
  modules/
    auth/                   # password login, OAuth, sessions, global auth guard
    workspace/              # controller, service, entity, DTO and validation
    datasets/               # datasets and archive manifests
    attachments/            # private screenshots
    market-data/            # immutable bundled market history
  scripts/                  # explicit SQLite importer
test/                       # PostgreSQL HTTP integration tests
```

Each feature owns its controller and service. Persisted features register their entities through `TypeOrmModule.forFeature`; services use `DataSource` transactions for atomic writes. Shared infrastructure is not mixed into feature code. Public API URLs, schema names, migration version, and save formats remain compatible. User identity comes from the authenticated session. See [authentication setup](../docs/authentication.md).

The immutable archive assets live in the shared root `data/` and `market-archives/` directories. Defaults resolve relative to the project location, so running from the repository root, backend folder, or Docker uses the same files. `MARKET_CATALOG` and `MARKET_ARCHIVES_DIR` can override those locations.
