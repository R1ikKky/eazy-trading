# Footprint and live order flow

## What is available

Replay's **Chart → Candles / Footprint** selector changes the drawing on the existing Lightweight Charts pane. Instrument, timeframe, replay index and visible range survive switching. The overlay uses the chart's own time and price coordinates; zoom and pan still work. Dense views show volume shading; zoom in for readable sell-left/buy-right numbers. **Rows** groups 1, 2, 4 or 8 contract ticks. NQ and ES use the same contract specifications as the trading engine.

Every candle shows `V` (all executed volume, including unknown side) and `Δ` (buy minus sell). Unknown-side volume is never inferred from candle direction or price changes. Candle volume reconciles to sell + buy + unknown at its price levels. Exact contracts remain separate in aggregation; a contract transition cannot merge two raw price ladders. If contracts overlap at the same candle time, the chart shows the last contract for that time. Split overlapping historical contracts into separate imports.

Existing market archives contain OHLCV, not tick executions. Choosing Footprint on them displays **Tick trade data required**. OHLCV cannot reconstruct authentic order flow.

Historical tick-trade CSV import is not available in the user interface. The Footprint view works with the live/demo trade stream; replay archives contain OHLCV only and cannot reconstruct authentic order flow.

## Demo stream (no provider key)

Set server configuration to `ORDERFLOW_FEED=demo` and restart the API. With Docker:

```sh
ORDERFLOW_FEED=demo PORT=3100 POSTGRES_PORT=55432 \
  docker compose -p eazy-trading-migration up -d --build
```

Open a replay session, select **Source → Demo**, then **Chart → Footprint**. Demo is visibly labeled, sends separate NQ and ES exact-contract tapes through the same server buffer, HTTP delivery, normalization validation, and frontend aggregator as real data. It does not fabricate provider-sourced history. Source selection preserves the historical replay for returning to it; streaming mode is a chart monitor and disables simulated order entry.

Click **Demo disconnect / reconnect**. The server pauses for two seconds, shows interrupted, then reconnects and resends an overlapping block before continuing. IDs deduplicate the overlap. Existing candle volume stays steady during the pause and rises only for new trades. Switch instruments to inspect the other stream; the historical comparison pane is hidden while streaming to avoid mixing historical and current clocks.

The frontend polls `/api/orderflow/stream` every 500 ms. Epoch/cursor snapshots handle browser reconnects without additive replay of the same snapshot. A connection failure shows interrupted. Server memory retains at most 200,000 events, compacting to 100,000; retention loss is explicitly marked as a gap. Gap notices remain visible. Live history is not a durable recording service: a server restart starts a new epoch with an explicit gap/partial-initial-candle notice. Use a live market-data provider for trade-level history; this app does not currently import archived tick trades.

## Switch to Databento after purchase

The built backend Docker image already includes the official pinned Databento Python SDK (`databento==0.90.0`). Its adapter is server-side. Do not put a key into frontend variables or any `NEXT_PUBLIC_*` variable.

Configure only the backend, then restart (no source change/rebuild required if using the already-built image):

```dotenv
ORDERFLOW_FEED=databento
DATABENTO_API_KEY=<your server-side key>
ORDERFLOW_NQ_CONTRACT=NQZ6
ORDERFLOW_ES_CONTRACT=ESZ6
ORDERFLOW_DATA_RIGHTS_CONFIRMED=true
ORDERFLOW_CUSTOMER_ACCESS=true
```

The example contracts are December 2026 raw exchange symbols. Confirm the appropriate tradable expiries for the date and your rollover policy; update these configuration values and restart when rolling. Continuous chart roots NQ/ES resolve to these exact configured contracts, never to a guessed front month. Existing historical contract labels and roll handling remain in the replay engine.

Put these values in the root `.env` for Compose, then:

```sh
PORT=3100 POSTGRES_PORT=55432 docker compose -p eazy-trading-migration up -d
```

Open **Source → Live**. Status progresses disabled/connecting/live/interrupted; live means actual trade events have arrived. Both access and data-rights switches are required before a real subscription is started. Missing credentials/contracts keep the real feed disabled. The application requires authentication and isolates user workspaces; these switches are deployment-wide controls, not a per-user entitlement/billing system. Only expose customer access after your deployment's authentication and contracted CME/Databento redistribution requirements are satisfied.

For local API development, install `backend/providers/requirements.txt` in a Python venv and set `DATABENTO_PYTHON` to its interpreter. Disabled/demo mode never imports the SDK or needs a key. Normal tests/startup work without a provider account.

The adapter subscribes to `GLBX.MDP3`, schema `trades`, `stype_in=raw_symbol`. The official SDK performs challenge-response authentication and live instrument mapping. On disconnect it resubscribes inclusively from each exact contract's last event timestamp with a one-second overlap. Stable provider record identities remove duplicates. Trades replay is limited to the provider's 24-hour window; expired/failed recovery, provider errors/slow-reader warnings, unresolved mapping and retention loss produce explicit gap notices. It retries with backoff. Unknown aggressor side stays unknown. It does not use MBP quotes as a substitute for trade aggressor data.

## Verification and limits

```sh
npm test
npm run typecheck
# With the SDK installed, no network/account is used by this test:
/path/to/venv/bin/python -m unittest discover -s backend/providers -p 'test_*.py'
```

Local tests cover tick grouping, unknown-side reconciliation, nanosecond cutoffs, backward reconstruction, contract/instrument isolation, CSV validation, duplicate reconnect overlap, buffer epochs/gaps, actual SDK TradeMsg normalization and fake-client subscription/replay calls. Browser checks exercise imports, toggles, grouping, within-minute seeking and demo updates through normal chart controls.

A local fixture cannot verify account authentication success, purchased GLBX.MDP3 live permissions, exchange symbol availability, real network recovery, latency or customer redistribution rights. Those require an entitled account and production acceptance checks. No real provider connection is made by the tests.

Official sources checked for this implementation:

- [Live authentication](https://databento.com/docs/api-live/basics/authentication)
- [Trades schema and aggressor side](https://databento.com/docs/schemas/trades)
- [Live subscription and inclusive replay](https://databento.com/docs/api-live/client/subscribe)
- [Official Python live client and symbology map](https://github.com/databento/databento-python/blob/main/databento/live/client.py)
