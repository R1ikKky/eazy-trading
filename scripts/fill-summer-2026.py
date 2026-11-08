"""Build immutable summer-gap archive versions from pinned public CSV exports.

Usage: python3 scripts/fill-summer-2026.py /tmp/replay-gap-data
Download the exact URLs in SOURCES to that directory first. No network requests,
price adjustments, resampling, interpolation, contract inference or synthetic bars.
Old manifests/assets remain usable by saved sessions. Re-running is deterministic.
"""
import base64
import copy
import csv
import gzip
import hashlib
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PIN = 'b8f2d8ab36e44c289036ce093bf7c9f04073a7d9'
BASE = f'https://raw.githubusercontent.com/kfccolonel1/BARS/{PIN}/'
SOURCES = {
    'nq.csv': ('NQ/1min/NQ_1min_2026-01-01_2026-10-08_stitched.csv', '6a0aaa144118160da036409310df4e57cf41f7d23d9a07ce04671da50a154d65'),
    'es.csv': ('ES/1min/ES_1min_2025-06-20_2026-10-09_stitched.csv', '36baf1581b5a7ea2533812c101b7057cc6166162e14e089cb699650fd5c7635d'),
    'nq-tv.csv': ('raw/NQ/1min/NQ_1min_2025-07-13_2026-07-31_tradingview.csv', '052a063884174c089abf72e303d150597775f5fb5018c2350682472fe212e6b0'),
    'nq-ib.csv': ('raw/NQ/1min/NQ_1min_2026-05-31_2026-08-28_ibkr-ss50.csv', '048f5bcaa7b18c6456750f6f1832e069df2401b4d1aac59118acffe82fac87f6'),
    'es-m.csv': ('raw/ES/1min/ib/ES_1min_2026-03-08_2026-06-16_ibkr-ESM6.csv', '9dd593a8800fd2577b055115d9417e4a7f6ec8aa72b9c4334dae09df4f22c258'),
    'es-u.csv': ('raw/ES/1min/ib/ES_1min_2026-06-07_2026-09-15_ibkr-ESU6.csv', '26fda76b0579b073b3d25025dcc7473f3811b48cb875b0817c690addddaa3aee'),
    'catalog.json': ('catalog.json', 'ee0f57f28cc3761724dcf8a9204bb3882e213f68d1d0641584c6ae93cff3f48b'),
    'README.md': ('README.md', 'cc5e1f10a2020573da49f8846d978623a8ad6dfeb6f795c40b1f95d57c3a35a1'),
}
NY = ZoneInfo('America/New_York')
EARLY_CLOSES = {'2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07'}
SOURCE_DIR = Path(sys.argv[1])
CATALOG_PATH = ROOT / 'data/market-archives.json'
catalog = json.loads(CATALOG_PATH.read_text())
by_id = {a['id']: a for a in catalog}
sha = lambda body: hashlib.sha256(body).hexdigest()
iso = lambda t: datetime.fromtimestamp(t, timezone.utc).isoformat()
month = lambda t: datetime.fromtimestamp(t, NY).strftime('%Y-%m')


def read_csv(name, volume_required=True, contract=None, label_range=None):
    body = (SOURCE_DIR/name).read_bytes()
    assert sha(body) == SOURCES[name][1], f'{name}: source bytes changed'
    records = {}
    previous = 0
    sources = Counter()
    with (SOURCE_DIR/name).open() as stream:
        for line, value in enumerate(csv.DictReader(stream), 2):
            date = datetime.fromisoformat(value['datetime'])
            assert date.utcoffset() is not None
            assert date.utcoffset() == date.astimezone(NY).utcoffset()
            t = int(date.timestamp())
            prices = [float(value[k]) for k in ('open', 'high', 'low', 'close')]
            assert t % 60 == 0 and t > previous, (name, line, 'timestamp')
            assert all(math.isfinite(p) and p > 0 and p*4 == round(p*4) for p in prices), (name, line, 'tick')
            assert prices[1] >= max(prices) and prices[2] <= min(prices), (name, line, 'OHLC')
            volume = float(value['volume']) if value.get('volume') else None
            if volume_required:
                assert volume is not None and math.isfinite(volume) and volume >= 0 and volume.is_integer(), (name, line, 'volume')
            row = [t, *prices, volume]
            if contract:
                assert value['contract'] == 'ESU6' and date.year == 2026
                row.append(contract)  # Explicit ESU6 from file, decade from its 2026 dates.
            records[t] = row
            previous = t
            if label_range is None or label_range[0] <= t < label_range[1]:
                sources[value.get('source', 'publisher-labelled export')] += 1
    return records, dict(sources)


def decode(part):
    packed = base64.b64decode((ROOT/'market-archives'/(part['id']+'.b64')).read_bytes(), validate=True)
    assert sha(packed) == part['sha256']
    rows = json.loads(gzip.decompress(packed))
    assert len(rows) == part['count']
    return rows


def pack(archive_id, key, rows):
    raw = json.dumps(rows, separators=(',', ':')).encode()
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    part_id = archive_id + '-' + key
    (ROOT/'market-archives'/(part_id+'.b64')).write_text(base64.b64encode(packed).decode())
    return {'id': part_id, 'month': key, 'count': len(rows), 'firstTime': rows[0][0],
            'lastTime': rows[-1][0], 'sha256': sha(packed), 'uncompressedBytes': len(raw), 'packedBytes': len(packed)}


def coverage(rows, lo, hi):
    missing, unexpected = [], []
    expected = 0
    for t in range(lo, hi, 60):
        date = datetime.fromtimestamp(t, NY)
        minute = date.hour*60 + date.minute
        cutoff = 13*60 if date.strftime('%Y-%m-%d') in EARLY_CLOSES else 17*60
        opened = (date.weekday() < 5 and minute < cutoff) or (date.weekday() in (0, 1, 2, 3, 6) and minute >= 18*60)
        if opened:
            expected += 1
            if t not in rows:
                missing.append(iso(t))
        elif t in rows:
            unexpected.append(iso(t))
    assert not missing and not unexpected, (missing[:10], unexpected[:10])
    return {'fromUTC': iso(lo), 'untilUTCExclusive': iso(hi), 'expectedMinutes': expected,
            'presentMinutes': expected, 'missingScheduledMinutes': 0, 'outsideScheduledHours': 0,
            'calendar': 'America/New_York; Sun 18:00–Fri 17:00; daily 17:00–18:00 halt; four listed 13:00 ET early closes',
            'earlyCloseDates': sorted(EARLY_CLOSES), 'calendarSource': 'https://www.cmegroup.com/trading-hours.html'}


def compare(main, reference, lo, hi):
    matches = {}
    for shift in (-60, 0, 60):
        keys = [t for t in reference if lo <= t < hi and t+shift in main]
        exact = sum(reference[t][1:5] == main[t+shift][1:5] for t in keys)
        matches[str(shift)] = {'overlap': len(keys), 'exactOHLC': exact}
    return matches


# Verify metadata checksums too, independently from the data parsers.
for name, (_, expected) in SOURCES.items():
    assert sha((SOURCE_DIR/name).read_bytes()) == expected, name

audit = {'sourceRepository': 'https://github.com/kfccolonel1/BARS', 'sourceCommit': PIN,
         'retrievedAt': '2026-11-08', 'priceTransformation': 'None', 'syntheticBars': 0,
         'license': 'No LICENSE file; GitHub repository license is null. Publisher labels do not independently establish original feed provenance or redistribution rights.',
         'sources': {name: {'url': BASE+path, 'sha256': digest} for name, (path, digest) in SOURCES.items()},
         'archives': {}}

for symbol, old_id, new_id, source_name, contract in [
    ('NQ', 'curated-NQ-history-2024-2026-v2', 'curated-NQ-history-2024-2026-v3', 'nq.csv', None),
    ('ES', 'curated-ES-history-2024-2026', 'curated-ES-history-2024-2026-v2', 'es-u.csv', 'ESU26'),
]:
    baseline = by_id[old_id]
    recent = by_id[f'curated-{symbol}-recent-2026']
    lo, hi = baseline['lastTime'] + 60, recent['firstTime']
    source, source_counts = read_csv(source_name, contract=contract, label_range=(lo, hi))
    inserted = {t: b for t, b in source.items() if lo <= t < hi}
    covered = coverage(inserted, lo, hi)
    assert len(inserted) == covered['expectedMinutes']
    grouped = defaultdict(list)
    for t, row in inserted.items():
        grouped[month(t)].append(row)
    old_parts = {p['month']: p for p in [*baseline['parts'], *recent['parts']]}
    assert len(old_parts) == len(baseline['parts']) + len(recent['parts'])
    parts = dict(old_parts)
    for key, additions in grouped.items():
        old_rows = decode(old_parts[key]) if key in old_parts else []
        assert not ({r[0] for r in old_rows} & {r[0] for r in additions})
        rows = sorted([*old_rows, *additions], key=lambda b: b[0])
        assert all(a[0] < b[0] for a, b in zip(rows, rows[1:]))
        parts[key] = pack(new_id, key, rows)
    merged = copy.deepcopy(baseline)
    merged['id'] = new_id
    merged['name'] = f'{symbol} · 2024–октябрь 2026'
    merged['parts'] = [parts[k] for k in sorted(parts)]
    merged['months'] = sorted(parts)
    merged['firstTime'] = merged['parts'][0]['firstTime']
    merged['lastTime'] = merged['parts'][-1]['lastTime']
    merged['count'] = sum(p['count'] for p in merged['parts'])
    assert merged['count'] == baseline['count'] + recent['count'] + len(inserted)
    meta = merged['metadata']
    meta.pop('supersededBy', None)
    meta['id'], meta['name'] = new_id, merged['name']
    meta['supersedes'] = old_id
    meta['provider'] = baseline['metadata']['provider'] + ' / BARS public archive'
    meta['retrievedAt'] = audit['retrievedAt']
    meta['license'] = meta.get('license', 'Earlier archive: see source metadata.') + '; BARS: no declared LICENSE; original feed and redistribution rights not independently established.'
    meta['timeConvention'] = meta.get('timeConvention', '') + ' Summer repair: explicit America/New_York UTC offsets, Unix bar-open seconds, no minute shift.'
    meta['bars'], meta['firstTime'], meta['lastTime'] = merged['count'], merged['firstTime'], merged['lastTime']
    if 'count' in meta:
        meta['count'], meta['first'], meta['last'] = merged['count'], iso(merged['firstTime']), iso(merged['lastTime'])
    if 'years' in meta:
        meta['years']['2026'] += len(inserted) + recent['count']
    # These measurements describe the old source extraction, not this extended archive.
    inherited = ('monthlyCoverage', 'normalizedSHA256', 'bytes', 'validation', 'duplicateSelections')
    statistics = {key: meta.pop(key) for key in inherited if key in meta}
    if statistics:
        meta['baselineSourceStatistics'] = statistics
    meta['sourceUrls'] = list(dict.fromkeys([*meta.get('sourceUrls', [meta.get('sourceUrl', '')]), BASE+SOURCES[source_name][0]]))
    meta['contracts'] = sorted(set(meta.get('contracts', [])) | ({contract} if contract else set()))
    meta['gapFillPolicy'] = 'Preserve every old archive and recent-archive row exactly. Copy only real source rows between their endpoints. No rounding, interpolation or OHLCV generation.'
    meta['summary'] = f'Летний пробел 2026 закрыт: добавлено {len(inserted):,} исходных минут. Прежние свечи и архивы сохранены.'
    meta['note'] = ('Доступен единый архив 2024–07.10.2026. Между прежним архивом и сентябрьским рядом добавлены только исходные минутные OHLCV. '
                    + ('NQ: исходный непрерывный ряд BARS, метка alfordlabs; контрактные коды и точное правило ролловера издателем не указаны. ' if symbol == 'NQ' else 'ES: исходный файл контракта ESU6, нормализованное обозначение ESU26; продолжение после прежнего календарного перехода на сентябрьский контракт. ')
                    + 'Временные метки с явным UTC offset переведены в Unix seconds без сдвига минуты. Старые участки вне летнего окна сохраняют ранее задокументированные ограничения. Это OHLCV, не тиковые сделки.')
    meta['summerGapFill'] = {'source': audit['sources'][source_name], 'sourceCommit': PIN, 'insertedBars': len(inserted),
                            'sourceLabels': source_counts, 'coverage': covered, 'priceTransformation': 'None',
                            'contract': contract, 'provenanceCaveat': audit['license']}
    meta.setdefault('coverage', {})['summer2026'] = covered
    meta['coverage']['lastUTC'] = iso(merged['lastTime'])
    meta['coverage']['complete'] = False  # Full-history minute completeness is not implied by this bounded repair.
    # Retired archives still decode identically; new selection follows the explicit chain.
    baseline['metadata']['supersededBy'] = new_id
    baseline['name'] = symbol + ' · прежняя версия для сохранённых сессий'
    recent['metadata']['supersededBy'] = new_id
    catalog = [a for a in catalog if a['id'] != new_id] + [merged]
    report = {'baselineArchive': old_id, 'recentArchive': recent['id'], 'updatedArchive': new_id,
              'insertedBars': len(inserted), 'insertedSourceLabels': source_counts, 'monthlyInserted': {m: len(v) for m, v in sorted(grouped.items())},
              'coverage': covered, 'oldRowsPreserved': baseline['count'] + recent['count'],
              'archiveCount': merged['count'], 'partsReused': sum(p['month'] not in grouped for p in old_parts.values()),
              'validation': {'unalignedTimestamps': 0, 'duplicateTimestamps': 0, 'invalidOHLC': 0, 'offTickPrices': 0, 'invalidVolume': 0}}
    references = [('nq-ib.csv', True), ('nq-tv.csv', False)] if symbol == 'NQ' else [('es.csv', True)]
    report['comparisons'] = {}
    for ref_name, needs_volume in references:
        ref, _ = read_csv(ref_name, needs_volume)
        report['comparisons'][ref_name] = compare(source, ref, lo, hi)
    audit['archives'][symbol] = report
    print(json.dumps({'symbol': symbol, 'inserted': len(inserted), 'newArchive': new_id, 'totalBars': merged['count']}), flush=True)

encoded = json.dumps(catalog, ensure_ascii=False, separators=(',', ':'))
CATALOG_PATH.write_text(encoded+'\n')
(ROOT/'frontend/src/replay/market-archives.ts').write_text('export const marketArchives='+encoded+';\n')
(ROOT/'market-archives/evidence/summer-2026-gap-fill.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2)+'\n')
