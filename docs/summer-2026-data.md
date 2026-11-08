# Summer 2026 historical-data repair

The bundled paired NQ/ES archive now covers 1 January 2024 through 7 October 2026 without the previous multi-month summer break. This change adds **126,017 NQ** and **88,015 ES** original one-minute OHLCV bars. It does not manufacture ticks for Footprint mode.

## Sources and validation

Data publisher: [kfccolonel1/BARS](https://github.com/kfccolonel1/BARS/tree/b8f2d8ab36e44c289036ce093bf7c9f04073a7d9), pinned commit `b8f2d8ab36e44c289036ce093bf7c9f04073a7d9`, retrieved 8 November 2026.

NQ rows come from its 2026 stitched minute file, labelled `alfordlabs` for the repaired interval. A separate publisher-labelled IBKR summer export matches every overlapping OHLC tuple; the separate TradingView export also provides timestamp checks, with differences near different front-month roll choices. Both comparison files come from the same repository: these checks establish agreement between published exports, not independent certification of their original feed.

ES rows come from the explicitly named **ESU6** contract export, expanded to **ESU26** using the file's 2026 dates. The previous ES archive switches to the September contract at 18:00 New York on 10 June under its existing calendar rule. Using the September contract directly continues that rule; blindly taking the publisher's stitched ES front month would use a different contract during part of June. The new source is not price-adjusted to conceal that difference.

Every imported row passes timestamp order/alignment, explicit UTC-offset/New York conversion, quarter-point tick size, OHLC bounds, finite nonnegative integer volume and duplicate checks. Comparisons at ±60 seconds confirm same-minute alignment. Exact raw-source SHA-256 hashes, comparison counts, monthly additions and UTC bounds are in [the audit](../market-archives/evidence/summer-2026-gap-fill.json).

The repaired windows contain every scheduled minute under the checked CME equity-index schedule: Sunday 18:00 through Friday 17:00 New York, daily 17:00–18:00 maintenance, and 13:00 New York early closes on 25 May, 19 June, 3 July and 7 September 2026. [CME trading hours and holiday calendars](https://www.cmegroup.com/trading-hours.html). Weekends, maintenance and holiday closures remain empty. This is a **bounded summer-window coverage check**; it does not imply complete minute coverage of every earlier year or the final October session.

Original feed provenance and redistribution rights are not independently established by the public repository; it has no declared LICENSE. Publisher source labels and limitations are retained in metadata. NQ's export does not identify actual quarterly contracts, so no contract identifiers or rollover rules are guessed for it.

## Archive behavior

- New NQ archive: `curated-NQ-history-2024-2026-v3`, 974,317 bars.
- New ES archive: `curated-ES-history-2024-2026-v2`, 903,694 bars.
- Existing historical and September/October rows are preserved exactly, including existing contract identifiers.
- Old manifests and compressed files remain available. Saved sessions still load their original archive IDs and preserve their replay indices and results.
- New sessions automatically use the extended archives, including requests crossing May/June into September. The old recent-only archives are retired for automatic selection, not deleted.
- Market-closed intervals are not filled. No prices, timestamps or volumes are rounded, resampled, adjusted or synthesized.

## Reproduce

The builder reads local pinned files and never downloads during startup or tests. To fetch the exact input bytes into `/tmp/replay-gap-data`:

```sh
python3 - <<'PY'
import json, pathlib, urllib.request
sources = json.load(open('market-archives/evidence/summer-2026-gap-fill.json'))['sources']
target = pathlib.Path('/tmp/replay-gap-data')
target.mkdir(exist_ok=True)
for name, source in sources.items():
    urllib.request.urlretrieve(source['url'], target / name)
PY
python3 scripts/fill-summer-2026.py /tmp/replay-gap-data
npm test
```

The builder verifies pinned hashes before accepting input, writes deterministic monthly gzip/base64 assets, and updates the backend JSON and frontend TypeScript catalogs together. It leaves `dist/` rollback assets unchanged.
