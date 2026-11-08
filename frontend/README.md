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

The visual system lives in `app/workspace-design.css`, loaded last by the root layout. It owns the rounded workspace, dark/light palettes, dialogs and authentication styling. `product.css` retains the terminal layout and legacy controller styles; prefer updating the design system rather than appending another visual override there.

Dropdowns use Tom Select, initialized by `src/replay/dropdowns.ts` after the terminal starts. Keep the original select IDs and dispatch ordinary `change` events when needed: the bridge synchronizes controller value assignments, option-list updates, hidden and disabled states. `app/dropdowns.css` owns the shared light/dark styling. Menus use the browser popover layer to escape the scrollable workspace and modal clipping.
