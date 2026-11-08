# Footprint and live order flow

## What is available

Replay's **Chart → Candles / Footprint** selector changes the drawing on the existing Lightweight Charts pane. Instrument, timeframe, replay index and visible range survive switching. The overlay uses the chart's own time and price coordinates; zoom and pan still work. Dense views show volume shading; zoom in for readable sell-left/buy-right numbers. **Rows** groups 1, 2, 4 or 8 contract ticks. NQ and ES use the same contract specifications as the trading engine.

Every candle shows `V` (all executed volume, including unknown side) and `Δ` (buy minus sell). Unknown-side volume is never inferred from candle direction or price changes. Candle volume reconciles to sell + buy + unknown at its price levels. Exact contracts remain separate in aggregation; a contract transition cannot merge two raw price ladders. If contracts overlap at the same candle time, the chart shows the last contract for that time. Split overlapping historical contracts into separate imports.

Existing market archives contain OHLCV, not tick executions. Choosing Footprint on them displays **Tick trade data required**. OHLCV cannot reconstruct authentic order flow.

## Import real historical trades

Open **Data → Import tick trades for Footprint**, then select a UTF-8 CSV:

```csv
time,contract,price,size,side,id
2026-11-02T14:30:00.123456789Z,NQZ6,21000.25,5,buy,source-trade-1
2026-11-02T14:30:00.223456789Z,NQZ6,21000.00,3,sell,source-trade-2
2026-11-02T14:30:00.323456789Z,NQZ6,21000.00,2,unknown,source-trade-3
```

- `time`: integer Unix nanoseconds or ISO time with UTC/explicit offset; nanoseconds are retained.
- `contract`: exact quarterly contract, e.g. NQZ6 / NQZ26, not NQ.c.0 or a root symbol.
- `side`: buy/sell/unknown, or Databento B/A/N. **A = sell aggressor, B = buy aggressor**.
- `size`: positive integer contracts; price must lie on the contract tick grid.
- `id`: optional unique source identity; identical retries deduplicate; conflicting records with one ID are rejected. Without IDs, each CSV row has a distinct identity.

One instrument, sorted event timestamps, 100,000 trades and 8 MB maximum per file. This importer is for the canonical CSV above; convert other provider CSV column names/price encodings explicitly before import. It does not assign an aggressor to an ambiguous trade.

The app saves both minute bars and the original events through its existing private dataset API into PostgreSQL. It then opens normal session setup with that dataset selected. Select its dates, start the session, and choose Footprint. No account is needed. Imported trades remain available when restoring that session.

The existing replay clock advances one minute per step. **Within minute** inspects 0–59.999 seconds of the current revealed minute. Moving it backward rebuilds the partial candle from only trades at or before the selected instant. The chart in either drawing mode uses those same filtered trades. The ordinary trading simulator still executes with its documented minute-OHLC rules; tick inspection does not turn it into a tick-fill engine. Context before the selected session is included only when present in the imported tape.

`tests/fixtures/trades-nq-synthetic.csv` is an explicitly **synthetic test fixture**, not market data. It contains a displacement, pullback, and unknown aggressor example for local verification.

## Demo stream (no provider key)

Set server configuration to `ORDERFLOW_FEED=demo` and restart the API. With Docker:

```sh
ORDERFLOW_FEED=demo PORT=3100 POSTGRES_PORT=55432 \
  docker compose -p replay-lab-migration up -d --build
```

Open a replay session, select **Source → Demo**, then **Chart → Footprint**. Demo is visibly labeled, sends separate NQ and ES exact-contract tapes through the same server buffer, HTTP delivery, normalization validation, and frontend aggregator as real data. It does not fabricate provider-sourced history. Source selection preserves the historical replay for returning to it; streaming mode is a chart monitor and disables simulated order entry.

Click **Demo disconnect / reconnect**. The server pauses for two seconds, shows interrupted, then reconnects and resends an overlapping block before continuing. IDs deduplicate the overlap. Existing candle volume stays steady during the pause and rises only for new trades. Switch instruments to inspect the other stream; the historical comparison pane is hidden while streaming to avoid mixing historical and current clocks.

The frontend polls `/api/orderflow/stream` every 500 ms. Epoch/cursor snapshots handle browser reconnects without additive replay of the same snapshot. A connection failure shows interrupted. Server memory retains at most 200,000 events, compacting to 100,000; retention loss is explicitly marked as a gap. Gap notices remain visible. Live history is not a durable recording service: a server restart starts a new epoch with an explicit gap/partial-initial-candle notice. Use archived trade CSVs for repeatable historical reviews.

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
PORT=3100 POSTGRES_PORT=55432 docker compose -p replay-lab-migration up -d
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
