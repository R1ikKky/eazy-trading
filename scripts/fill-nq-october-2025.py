"""Add verified original October candles as a new, immutable NQ archive version.

Usage: python scripts/fill-nq-october-2025.py <normalized JSONL> <source metadata>
Existing archives and their candle bytes remain available for saved sessions.
Only absent timestamps are copied, without changing any OHLCV value.
"""
import base64
import copy
import gzip
import hashlib
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

root = Path(__file__).resolve().parents[1]
prefix = 'export const marketArchives='
catalog_path = root/'dist/market-archives.mjs'
catalog = json.loads(catalog_path.read_text()[len(prefix):].rstrip(';\n'))
old_id = 'curated-NQ-history-2024-2026'
new_id = old_id+'-v2'
baseline = next(a for a in catalog if a['id'] == old_id)
old_part = next(p for p in baseline['parts'] if p['month'] == '2025-10')
assert old_part['sha256'] == 'befc9d8033b7a47084e4c5635402167b1ab9f2d83530f433b2f3c376be1a2bb7'
encoded = (root/'market-archives'/(old_part['id']+'.b64')).read_bytes()
packed = base64.b64decode(encoded, validate=True)
assert hashlib.sha256(packed).hexdigest() == old_part['sha256']
old_rows = json.loads(gzip.decompress(packed))
old = {row[0]: row for row in old_rows}
source_path = Path(sys.argv[1])
source_meta = json.loads(Path(sys.argv[2]).read_text())
assert hashlib.sha256(source_path.read_bytes()).hexdigest() == 'a74a50c0493b69aef933766dc0db5df49bb7d88774efcb160a39d13eace27bb5'
assert source_meta['sourceSHA256'] == '46f2a9a6ee921dcb8b5895120f8069e5fa3197db94180cbe2df8bba725390662'
assert source_meta['priceTransformation'].startswith('None.')
ny = ZoneInfo('America/New_York')
source = {}
with source_path.open() as stream:
    for line in stream:
        b = json.loads(line)
        t = b['time']
        assert type(t) is int and t % 60 == 0 and t not in source
        assert datetime.fromtimestamp(t, timezone.utc).astimezone(ny).strftime('%Y-%m') == '2025-10'
        source[t] = [t, *[b[k] for k in ['open', 'high', 'low', 'close', 'volume']]]
assert len(source) == 31380 and all(t in source for t in old)
added = {t: row for t, row in source.items() if t not in old}
assert len(added) == 8767
rows = [row for _, row in sorted({**old, **added}.items())]
assert all(next_row[0] > row[0] for row, next_row in zip(rows, rows[1:]))
assert len(rows) == 31380 and all(row == old[row[0]] for row in rows if row[0] in old)
raw = json.dumps(rows, separators=(',', ':')).encode()
packed = gzip.compress(raw, compresslevel=9, mtime=0)
new_part = {'id': new_id+'-2025-10', 'month': '2025-10', 'count': len(rows),
            'firstTime': rows[0][0], 'lastTime': rows[-1][0],
            'sha256': hashlib.sha256(packed).hexdigest(),
            'uncompressedBytes': len(raw), 'packedBytes': len(packed)}
(root/'market-archives'/(new_part['id']+'.b64')).write_text(base64.b64encode(packed).decode())
current = copy.deepcopy(baseline)
current['id'] = new_id
current['name'] = 'NQ · 2024–май 2026 · октябрь восстановлен'
current['parts'] = [new_part if p['month'] == '2025-10' else p for p in current['parts']]
current['count'] = baseline['count']+len(added)
meta = current['metadata']
meta.pop('supersededBy', None)
meta.pop('normalizedFile', None)
meta.update({'id': new_id, 'name': current['name'], 'bars': current['count'],
             'supersedes': old_id, 'retrievedAt': source_meta['retrievedAt'],
             'provider': 'Hugging Face / TopstepX / Hindsight Finance',
             'sourceUrl': source_meta['sourceURL'],
             'summary': 'Октябрь 2025 восстановлен: добавлены 8 767 исходных минут. Цены не изменены. В 2026 остаются пропуски; контрактные коды не указаны.',
             'note': 'Реальные минутные бары 01.01.2024–04.05.2026. Все 8 767 отсутствовавших октябрьских минут, включая 21 и 27–31.10.2025, добавлены из публичного архива Hindsight Finance. Время UTC обозначает открытие минуты; OHLCV скопированы без изменений. Все прежние свечи сохранены. Минутные цены проверены на пересечении с отдельным экспортом Databento; дневные Open/High/Low сверены с Yahoo. Поставщик потока Hindsight и его правила склейки не указаны. В 2026 остаются пропуски, включая часть 19–20 января. Квартальные контракты не указаны.',
             'gapFillPolicy': 'Preserve every existing timestamp and OHLCV value. Add only verified absent original Hindsight October 2025 rows; earlier TopstepX gap filling is retained.'})
meta['sourceUrls'] = list(dict.fromkeys([*meta.get('sourceUrls', []), source_meta['sourceURL']]))
meta['sourceFiles'].append({'name': 'hindsight_SB_nq_1m.parquet',
                            'sourceUrl': source_meta['immutableDownloadURL'],
                            'sha256': source_meta['sourceSHA256']})
meta['years']['2025'] += len(added)
meta['coverage']['missingWeekdaysExcludingKnownMarketHolidays'] = []
meta['coverage']['october2025'] = {'month': '2025-10', 'candles': len(rows),
                                 'insertedCandles': len(added), 'completeTradingMinutes': True}
meta['octoberGapFill'] = {'source': source_meta['provider'],
                         'sourceUrl': source_meta['sourceURL'],
                         'immutableDownloadUrl': source_meta['immutableDownloadURL'],
                         'sourceSHA256': source_meta['sourceSHA256'],
                         'normalizedSHA256': source_meta['normalizedSHA256'],
                         'insertedCandles': len(added), 'priceTransformation': 'None',
                         'feedProvider': source_meta['originalFeedProvider'],
                         'license': source_meta['license']}
baseline['name'] = 'NQ · прежняя версия для сохранённых сессий'
baseline['metadata']['supersededBy'] = new_id
baseline['metadata']['summary'] = 'Прежняя версия сохраняет исходные свечи и результаты старых сессий. Для новых тестов доступен архив с восстановленным октябрём.'
catalog = [a for a in catalog if a['id'] != new_id]+[current]
catalog_path.write_text(prefix+json.dumps(catalog, ensure_ascii=False, separators=(',', ':'))+';\n')
audit = {'baselineArchive': old_id, 'updatedArchive': new_id,
         'baselineCandles': baseline['count'], 'updatedCandles': current['count'],
         'preservedOctoberCandles': len(old), 'insertedCandles': len(added),
         'octoberCandles': len(rows), 'oldPart': old_part, 'updatedPart': new_part,
         'insertedByNYDate': dict(sorted(Counter(datetime.fromtimestamp(t, timezone.utc).astimezone(ny).date().isoformat() for t in added).items())),
         'originalSource': source_meta, 'priceTransformation': 'None',
         'existingCandlesChanged': 0}
evidence = root/'market-archives/evidence'
evidence.mkdir(exist_ok=True)
(evidence/'NQ-october-2025-restoration.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'id': new_id, 'insertedCandles': len(added), 'octoberCandles': len(rows),
                  'updatedCandles': current['count'], 'partId': new_part['id'], 'sha256': new_part['sha256']}))
