# MT5 journal (FundingPips-SIM1)

The website can save an encrypted investor connection and request an on-demand history sync. A separate, optional Wine/MT5 worker connects only during a sync, imports broker history and open positions, then destroys the temporary terminal, Wine prefix and credentials. No trading commands are present. Your laptop does not need to run MT5.

**Status:** the application, migration, collector and deployment files are implemented. The WineHQ container builds, API/import tests and browser checks pass. An automated attempt to install MT5 did not produce MetaEditor, so native MQL5 compilation and a real FundingPips login remain unverified. The interactive setup helper must compile the collector successfully before it saves a seed. Deployment requires that clean seed and an actual investor login from the website. Saving a connection does not mean it has authenticated. The UI reports missing setup, offline workers, queued/running jobs, successful sync times and failures separately.

## Before changing your VPS

Keep Ubuntu and your existing Dokploy/application/database. Back up PostgreSQL. Check `free -h`, `df -h`, and `docker stats --no-stream` over SSH. This deployment limits one terminal to 1 CPU and 1.5 GiB RAM, plus its temporary disk files. A 4 GiB VPS may fit one worker alongside the app; this is not a measured capacity guarantee. Leave headroom for PostgreSQL and builds; stop setup before running the worker. Never install Wine in the existing API image.

Use the deployed repository checkout, or a separate admin checkout of this repository for preparing the seed. Do not put investor or SSH passwords into chat, git, shell commands, URLs or tickets.

## 1. Prepare the terminal once

MT5 needs broker server metadata. A generic terminal binary alone is insufficient. [FundingPips instructions](https://help.fundingpips.com/hc/en-us/articles/43468639481105-Account-Workspace) assign **FundingPips-SIM1** to **FundingPips Corp**, not FundingPips Corp (2). [MetaQuotes supports MT5 through Wine on Linux](https://www.metatrader5.com/en/terminal/help/start_advanced/install_linux).

The setup container creates a temporary desktop; it does not install packages on Ubuntu or modify your website. From the repository directory on the VPS:

```bash
sudo install -d -m 0755 -o 10001 -g 10001 /opt/eazy-trading/mt5-seed
export MT5_TERMINAL_SEED=/opt/eazy-trading/mt5-seed
docker compose -f compose.mt5-setup.yaml run --rm --build --service-ports mt5-setup
```

Choose a temporary eight-character VNC password when prompted. It is distinct from every account password. From a second terminal **on your own computer**, open a private tunnel (substitute your SSH user/server if different):

```bash
ssh -N -L 5901:127.0.0.1:5901 root@YOUR_VPS_IP
```

Connect a VNC viewer to `127.0.0.1:5901`, enter the temporary VNC password, complete the official MT5 installer, then search **FundingPips Corp** in MT5's account/server chooser. Select **FundingPips-SIM1**. **Do not log in or add an account in this setup desktop.** Close MT5 normally so it saves server metadata, return to the first SSH terminal and press Enter. The helper copies only `terminal64.exe`, `metaeditor64.exe`, and `Config/servers.dat` to the seed; it refuses an existing seed. It discards Wine configuration, account databases, charts and Expert Advisors. Close the VNC viewer and tunnel after setup exits.

If broker discovery or the official installer requires extra interaction, complete it in this private desktop. No terminal binary is redistributed by this repository. FundingPips and MetaQuotes terms still apply. If a future MT5 build changes dependencies or the server database format, update the worker/seed before enabling sync. Never bypass a failed seed check by copying a personal terminal profile containing credentials or EAs.

## 2. Configure API and worker

Generate two independent secrets on the VPS:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

Save the first output as `MT5_ENCRYPTION_KEY` and the second as `MT5_WORKER_TOKEN` in your deployment's private environment. Set `MT5_TERMINAL_SEED=/opt/eazy-trading/mt5-seed`, `MT5_BOOT_SYMBOL=EURUSD`, and `PUBLIC_ORIGIN` to the website's exact HTTPS origin. Keep the encryption key with encrypted database backups; replacing/loss of the key requires reconnecting investor passwords. Never commit the values. The worker receives only its token, not the encryption key. The API decrypts credentials only for a leased job. Database backups retain encrypted old values according to your backup policy.

The existing `compose.yaml` imports the worker definition behind an optional `mt5` profile. In **Dokploy → your existing eazy trading application → Environment**, add `COMPOSE_PROFILES=mt5` only after the terminal seed is ready, along with `MT5_TERMINAL_SEED=/opt/eazy-trading/mt5-seed` and `MT5_BOOT_SYMBOL=EURUSD`. Keep the two secrets you already generated and the existing `PUBLIC_ORIGIN`. Save and redeploy the **same application**, retaining `compose.yaml` as its Compose path. Do not create another application/project or change its database settings. Leave `COMPOSE_PROFILES` empty until setup is complete; ordinary deployments do not start Wine.

For a direct Compose deployment, use the same environment settings and the existing project name/Compose file. The API runs the additive MT5 migration automatically. The optional worker exposes no ports and mounts the seed read-only. Both services share the private network; `http://api:3001` resolves to the existing API. The worker sends the required same-origin header; global browser authentication and origin checks remain intact. Standard Dokploy redeploys preserve the worker while its profile is enabled.

The worker compiles the supplied MQL script with MetaEditor for each temporary terminal. A missing terminal/compiler/script output keeps sync from succeeding. Verify a compile and a real read-only import before calling production setup complete. If your broker uses a suffix on EURUSD, set `MT5_BOOT_SYMBOL` to a valid chart symbol; the startup script requires a chart. No VNC desktop is exposed by the worker.

## 3. Connect privately in the website

Open **Journal → MT5 → Connect MT5**. Enter an account label, the MT5 **account number** (not your FundingPips dashboard username), `FundingPips-SIM1`, and the **investor password** from your private Credentials panel. Save, then **Sync now**. The collector rejects a connection that reports trading permission. An account restriction can also disable trading, so that flag alone is not proof of an investor password; always supply the investor password. Passwords never appear in connection/job responses to the browser.

Check the first import against MT5's All History tab: symbols, closed position count, fractional lots, entry/exit prices, profit, signed commission, swap and fees. Try Sync now again after a minute and confirm no duplicates. Verify a partial close and an open position if your account has them. Only then rely on the synced journal. No real FundingPips login was used in automated tests.

Disconnect destroys the active encrypted password and cancels queued/running leases; imported trades and annotations stay available. Reconnecting the same account/server preserves that history. Existing database backups may still contain the previous encrypted record.

## Data and practical limits

- Every connection belongs to the signed-in website user; five accounts per user, one active job per account and one terminal across the deployment. Worker endpoints require a separate deployment token; user cookies do not grant worker access.
- Initial/on-demand sync requests all history available from the broker. At most 50,000 deals / 2,000 open positions / 18 MiB of JSON per import. Exceeding a limit fails explicitly and preserves the previous journal; no silent history truncation. Raw deals are retained under `(connection, ticket)` identity; corrections replace matching tickets, repeated sync does not duplicate them. Historical broker deletions/cancellations are retained as broker records, not guessed away.
- Separate replay and MT5 sources prevent mixing lots with futures contracts, foreign account currencies with replay USD, or broker times with ET. The MT5 UI labels time as **broker time**. Results are grouped by account currency. Cash adjustments/deposits are visible separately and excluded from trade statistics.
- Position round trips handle scale-ins, partial closes, close-by and netting reversals. Incomplete/orphan histories are retained but excluded from statistics. Open position values are snapshots at the last sync, not live quotes. Broker cancellations that change the original deal type can produce an incomplete history warning rather than an invented reversal.
- Broker net = profit + signed commission + swap + fee. Separate cash operations are not assigned to trades without an explicit broker relationship. Original risk/R cannot reliably be inferred from historical stops; add planned initial risk in account currency yourself. Notes, tags, strategy label and planned risk survive syncs independently of broker data. Strategy labels here are journal annotations, not replay strategy objects.
- Only **Sync now** is implemented. Scheduled/background polling without a user request is not enabled. Sync includes executed deals and current open positions; pending orders and tick-by-tick trade paths are not imported.
- No native Windows Python package or paid external account connector is used. The optional container requires outbound access to broker servers and MetaQuotes for updates. No server credentials were supplied in chat; the VPS has not been modified by this work.
