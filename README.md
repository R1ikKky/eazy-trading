## Локальная разработка (Linux)

Проект подготовлен в `/home/rick/Codding/replay-lab`. Требуется Node.js 24+;
внешних npm-зависимостей нет, `npm install` не нужен.

```bash
cd /home/rick/Codding/replay-lab
npm run dev
```

Откройте http://127.0.0.1:3000. Остановка — Ctrl+C. Для другого порта:
`PORT=3001 npm run dev`. `npm start` запускает сервер без наблюдения за файлами.
После изменений интерфейса обновите страницу браузера.

- `dist/` — редактируемые исходники, **не удалять**. Сборка генерирует только
  `dist/server/` и `dist/.openai/`.
- `scripts/local-server.mjs` — локальный HTTP-сервер и адаптеры SQLite/файлов.
- `worker/api.mjs` — общий API; облачная авторизация сохранена.
- `.local-data/` — SQLite, загруженные данные, изображения и снимки сессий.
  Каталог исключён из Git. Для полной резервной копии остановите сервер и
  скопируйте весь каталог, включая SQLite и объекты.
- `npm test` — тесты движка, API, локального сохранения после перезапуска,
  сборка Worker и проверка результата. `npm run build` не запускает сервер.

Сервер доступен только на 127.0.0.1 и использует одну локальную личность.
Используйте именно адрес 127.0.0.1, а не localhost. Встроенные месячные архивы
читаются с проверкой SHA-256. Миграции из `drizzle/` применяются при запуске.

ZIP содержит исходники, но не личные данные опубликованного сайта. JSON-копию
можно импортировать через интерфейс; загруженные пользователем CSV и изображения
нужно переносить отдельно с сохранением ссылок. См. `LOCAL-SETUP.md`.
Исходный экспорт описан в `EXPORT-INFO.json`; его суммы относятся к версии до
локальных изменений. Прежняя Git-история в ZIP отсутствует.

---

# Replay Lab

October 2025 NQ gaps were restored on 7 October 2026 from the public Hindsight Finance `nq_1m.parquet` archive: 8,767 original OHLCV candles were added only at absent timestamps. No prices or volumes were transformed and every established candle was retained. The completed New York October partition has 31,380 candles. The revised main archive is `curated-NQ-history-2024-2026-v2`; the previous immutable archive remains available for restoring saved sessions and is omitted from new-session choices. Minute prices and timestamps were cross-checked against a separate Databento-schema export; daily Open/High/Low matched Yahoo NQ=F for the affected CME trading dates. Upstream Hindsight feed/roll methodology and license are not stated. Source hashes, pinned download URL and the precise inserted dates are in `market-archives/evidence/NQ-october-2025-restoration.json`. The 2026 gaps remain unchanged.

To reproduce the October partition, use `scripts/fill-nq-october-2025.py` with the verified normalized JSONL and its source metadata. To upload just that immutable cloud object, run `python scripts/upload-market-data.py https://nq-es-replay-lab.rick-sunches.chatgpt.site --part-id curated-NQ-history-2024-2026-v2-2025-10`; the Site token is requested with input echo disabled. The uploader validates the exact published catalog SHA and reads the object back after storage.

Private NQ/ES manual replay workspace with real minute OHLCV. Imported archives cover all calendar months of 2024/2025, available older 2026, and recent September/October 2026. Exact counts, dates, source conventions and gaps live in `dist/market-archives.mjs`. Missing bars are never synthesized. Original January2024 FirstRate/HF data remains available after that provider shut down.

Primary NQ combines public Hugging Face archives and verified TopstepX bars at genuinely missing times. Prices are unchanged; timestamps from Chicago minute-end are normalized to UTC opening. NQ has gaps in October2025 and a partial January2026 gap; a separately labeled, additive-adjusted Kaggle archive covers those October dates. Never merge its adjusted price levels into raw history.

ES uses actual quarterly-contract bars from a public archive. A deterministic calendar filter selects the contract beginning at 18:00 NewYork before the roll trading day, eight calendar days before the thirdFriday expiry. Other-contract rows are excluded instead of smoothing price jumps; absent expected-contract minutes remain gaps. Source labels and download checksums remain visible.

Recent Yahoo Finance CME futures minute quote arrays are imported separately; empty, duplicate and incomplete records are excluded. Historical expiry codes and roll rules are unspecified, so the engine cannot detect rollover for NQ primary or recent Yahoo series. Neither 2026 archive promises every minute through the current date.

## Workflow

Choose an archive in **Данные**, then create a named session with dates, capital and a strategy. Reveal candles with Replay or the step button. Use Market, Limit or Stop; edit protection, move to breakeven or exit partially. Only one position or entry order is active at a time.

**Сессии** restores candle, position, pending order, notes and chart drawings. Repeating a session creates a separate pass. **Журнал** filters trades and stores review notes, tags, strategy checklists and private screenshots. **Аналитика** shows closed-trade equity, drawdown, daily calendar, expectancy, R and strategy/symbol/day breakdowns.

The ES/NQ comparison reveals only prices available at the main replay clock. Chart settings include candles, colors/opacity, scales, labels, timezone, sessions, SMA/EMA and drawing tools. TradingView account layouts and Pine scripts cannot be imported into Lightweight Charts.

## Persistence

Sites dispatch supplies authenticated identity. D1 `DB` stores owner-scoped revision metadata; R2 `BUCKET` holds immutable market archives, workspace snapshots and image attachments. Writes enforce same origin. A local cache preserves offline drafts; conflicting devices never silently overwrite each other. Click a conflict status to export the local copy and load the cloud copy.

Curated history is packed into immutable gzip/base64 monthly files. Their catalog and SHA256 checksums ship with the app; data files live in R2 outside the Worker bundle. `/api/market-data/:id` relies on the confirmed owner-private Sites dispatch boundary for service access. POST also requires same origin and accepts only bytes matching the published immutable checksum; it cannot write any caller-selected object or user record. Browser replay lazily reads the selected months and prior context. Source copies in `market-archives/` remain in the Git-backed project for reproducibility; they are excluded from deployment output.

JSON backup contains sessions, journal and strategies. Market archives and images remain separate owner-scoped cloud objects; a backup is not a portable copy of those files. Journal CSV is safe against spreadsheet formula injection.

## Execution limits

Minute OHLC cannot establish every intrabar event order. Execution uses subsequent candles, configured commission and adverse slippage, conservative SL priority when order is ambiguous, and contract-aware rollover. CSV should include `contract` to detect expiry changes. Open P&L is separate; analytics and drawdown use completed trades. An open position at the last candle stays open. External data availability depends on the provider. CSV import streams up to 250 MiB / 3 million candles into owner-private monthly parts of at most 50,000 candles. The archive manifest is validated against saved owner-scoped objects; only the selected replay range and prior context are fetched. One active replay is bounded to 1 million candles including loaded context. The 2024/2025/2026 coverage display reflects months actually saved, not a promise that every market minute exists. FirstRate headerless New York time (including DST) and Databento ts_event timestamps are supported. Prices must retain the0.25tick grid. Adjusted archival series are identified explicitly; no source prices are converted to invented raw levels.

This release has no broker account synchronization, tick/order-book fills or automated Pine backtesting. It does not claim complete TradeZella parity.

## Build and verification

Node 24+, no installation required:

```sh
npm test
npm run build
```

`scripts/build-product.mjs` embeds frontend assets and the API into an ESM Worker at `dist/server/index.js`. `dist/` also retains frontend source assets; do not run a build that deletes it. Hosting declares `DB` and `BUCKET`; migrations are in `drizzle/` and are applied by Sites before publication.

Tests cover actual engine executions/restoration, real SQLite schema and API owner/origin/CAS behavior, client saving conflicts and offline drafts, import validation, analytical metrics and the generated Worker. Browser visual/interaction QA was unavailable in the managed environment for this release.
