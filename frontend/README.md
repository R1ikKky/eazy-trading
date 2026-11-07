# Frontend

Next.js App Router application with TypeScript. Install dependencies from the repository root with `npm ci`. From this folder:

```sh
npm run dev
npm run build
npm start
npm run typecheck
```

- `app/`: pages, layout, React workspace markup and styles.
- `src/replay/`: replay engine, chart controllers, workspace cache and analytics.
- `proxy.ts`: local host/origin checks.
- `next.config.ts`: `/api/*` forwarding to the NestJS backend.

Next loads frontend `.env` files normally; root `.env` values provide shared defaults. `API_INTERNAL_URL` is a server-only backend address (default `http://127.0.0.1:3001`) and must be set when building. `PUBLIC_ORIGIN` must match the browser URL and backend configuration. No backend code is imported into the frontend.

The Dockerfile builds only this application. Its Docker build context is the repository root so npm can install from the shared workspace lockfile.
