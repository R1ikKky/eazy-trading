"""Pack validated, normalized real OHLCV into immutable monthly Site assets.

Input: JSONL objects with Unix bar-open seconds, OHLCV, optional actual contract.
Acquisition and source timestamp normalization happen separately. Prices are never
rounded, adjusted, interpolated, or synthesized here. Run with source metadata JSON.
"""
import base64
import gzip
import hashlib
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

root = Path(__file__).resolve().parents[1]
asset_dir = root / 'market-archives'
asset_dir.mkdir(exist_ok=True)
index_path = root / 'dist' / 'market-archives.mjs'
prefix = 'export const marketArchives='
index = json.loads(index_path.read_text()[len(prefix):].rstrip(';\n')) if index_path.exists() else []
metadata = json.loads(Path(sys.argv[2]).read_text())
archive_id = metadata['id']
assert archive_id.startswith('curated-') and metadata['symbol'] in ['NQ', 'ES']
assert archive_id.replace('-', '').replace('_', '').isalnum()
previous = 0
parts = []
rows = []
month = None
ny = ZoneInfo('America/New_York')
contracts = set()
minute_evidence = False

def flush():
    if not rows:
        return
    part_id = archive_id + '-' + month
    raw = json.dumps(rows, separators=(',', ':')).encode()
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    (asset_dir / (part_id + '.b64')).write_text(base64.b64encode(packed).decode())
    parts.append({'id': part_id, 'month': month, 'count': len(rows),
                  'firstTime': rows[0][0], 'lastTime': rows[-1][0],
                  'sha256': hashlib.sha256(packed).hexdigest(),
                  'uncompressedBytes': len(raw), 'packedBytes': len(packed)})

with open(sys.argv[1]) as stream:
    for line in stream:
        b = json.loads(line)
        t = b['time']
        assert type(t) is int and 946684800 <= t <= 4102444800 and t % 60 == 0 and t > previous
        o, h, l, c = [b[k] for k in ['open', 'high', 'low', 'close']]
        assert all(type(p) in [int, float] and 0 < p <= 100000000 and abs(p*4-round(p*4)) < 1e-7 for p in [o, h, l, c])
        assert h >= max(o, c) and l <= min(o, c) and l <= h
        assert type(b['volume']) in [int, float] and 0 <= b['volume'] < 1e20
        if previous and t - previous == 60:
            minute_evidence = True
        previous = t
        key = datetime.fromtimestamp(t, timezone.utc).astimezone(ny).strftime('%Y-%m')
        if month and month != key:
            flush()
            rows = []
        month = key
        row = [t, o, h, l, c, b['volume']]
        if b.get('contract'):
            row.append(b['contract'])
            contracts.add(b['contract'])
        rows.append(row)
assert minute_evidence
flush()
archive = {'id': archive_id, 'kind': 'archive', 'symbol': metadata['symbol'],
           'name': metadata['name'], 'source': 'curated_archive',
           'count': sum(p['count'] for p in parts), 'firstTime': parts[0]['firstTime'],
           'lastTime': parts[-1]['lastTime'], 'parts': parts,
           'months': [p['month'] for p in parts], 'metadata': {**metadata, 'contracts': sorted(contracts)}}
index = [a for a in index if a['id'] != archive_id] + [archive]
index_path.write_text(prefix + json.dumps(index, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(json.dumps({'id': archive_id, 'count': archive['count'], 'firstTime': archive['firstTime'],
                  'lastTime': archive['lastTime'], 'months': len(parts),
                  'packedBytes': sum(p['packedBytes'] for p in parts)}))
