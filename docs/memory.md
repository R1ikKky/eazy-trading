# Memory use and the MT5 worker

The user's VPS reading on 12 November 2026 showed 3.8 GiB RAM, 1.6 GiB available, no swap and 20 GiB free disk. Its eazy trading web/API/database containers used approximately 86/104/44 MiB respectively. Dokploy itself used approximately 893 MiB. These are snapshots, not peak-load guarantees; most observed resident memory was outside the application containers.

Changes made for this deployment:

- Next.js uses its traced standalone production server, with static assets and public downloads copied explicitly. It does not load the TypeScript configuration and the entire monorepo installation at runtime. The resulting tested web image is about 102 MiB on disk; image size is not RAM usage.
- Next production builds use one page-generation worker, Webpack's memory optimization mode, and a 1 GiB JavaScript heap limit per build process. This reduces build concurrency/peak allocations; a heap limit is not a cap on total RSS across every compiler process.
- The API health check uses the existing lightweight Python runtime instead of starting Node plus its HTTP client every ten seconds. Its status/timeout behavior remains the same.
- The MT5 exporter is compiled once during admin setup. Runtime sync copies the compiled exporter and checks the binary/source SHA-256 manifest. No MetaEditor compiler runs per sync. Existing seeds without the compiled exporter/manifest need a fresh setup.
- While idle, the worker runs only its Python poller. Xvfb starts with a sync and closes with Wine/MT5 afterward. One VPS terminal job is allowed across the deployment. The runtime cap remains 1.5 GiB and one CPU until actual broker synchronization is measured; reducing that limit without evidence could simply kill valid imports.

The credential-free local MT5 setup desktop used about 321 MiB after installation and broker discovery. This is not a peak measurement or an authenticated sync benchmark. The native collector compiled with 0 errors/0 warnings, and its saved seed passed fingerprint validation.

Local preview measurements: web container ~68 MiB before the deployment change; ~53 MiB shortly after the new server started and ~63 MiB after journal/download and replay trading browser tests. The API varied from ~102 to ~126 MiB as requests warmed it. Database usage varied from ~29 to ~41 MiB. These are separate snapshots on the development host, not a controlled percentage-saving benchmark or a prediction of VPS memory. No gigabyte-scale RAM saving is claimed. Replay protection lines/restoration, broker pairing and connector downloads passed browser verification.

No changes were made to PostgreSQL durability, shared buffers, trading history, chart features, or other VPS services. Market archives are small (largest compressed part about 0.4 MiB), so rewriting their checksum/serving path would add risk for little memory benefit. The database and application heaps have not been arbitrarily restricted.

Before the trial, use `bash scripts/mt5-host-preflight.sh` on the VPS for a read-only capacity report. The explicit `--create-swap` option creates a dedicated 2 GiB `/swapfile-eazy` only when no swap is active, requires at least 5 GiB free disk, refuses to overwrite an unrelated existing file, backs up fstab before adding its own entry and restarts no services. It should be run only on the VPS host, never inside an app container. Swap provides emergency headroom; it does not replace RAM or guarantee the terminal fits.

Build the API/web deployment before running the one-time desktop, then close the desktop before starting the MT5 profile. For manual low-memory builds, build one service at a time with the same project/environment; `COMPOSE_PARALLEL_LIMIT=1` limits Compose engine-call concurrency but is not a global BuildKit RAM limit. Do not disable TypeScript validation or checksum checks to make builds fit.

After installing the current seed, start the MT5 worker, observe `docker stats --no-stream` while idle and during one real investor-password sync, and compare results to MT5 history before enabling scheduled/multiple-user workloads. If there are OOM kills or sustained heavy swapping, stop the MT5 worker and reassess capacity instead of claiming the existing VPS is sufficient.
