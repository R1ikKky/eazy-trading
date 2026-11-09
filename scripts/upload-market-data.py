"""Upload the exact catalogued market assets to the selected private Site.

Usage: python scripts/upload-market-data.py <literal Site origin> [--part-id <id>]
Sites service token is read with echo disabled and is never saved or printed.
Uploads are sequential and idempotent; all cloud objects are then read back.
"""
import base64
import os
import argparse
import getpass
import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('origin')
parser.add_argument('--part-id', help='Upload and verify one exact catalogued part.')
args = parser.parse_args()
origin = args.origin.rstrip('/')
expected_origin = os.environ.get('MARKET_DATA_SITE_ORIGIN', '').rstrip('/')
if not expected_origin or origin != expected_origin:
    raise SystemExit('Set MARKET_DATA_SITE_ORIGIN to the verified literal Site URL and use the same origin argument.')
prefix = 'export const marketArchives='
catalog = json.loads((root/'dist/market-archives.mjs').read_text()[len(prefix):].rstrip(';\n'))
parts = list({p['id']: p for a in catalog for p in a['parts']}.values())
if args.part_id:
    parts = [p for p in parts if p['id'] == args.part_id]
    if not parts:
        raise SystemExit('Requested part is not present in the published catalog.')
token = getpass.getpass('Ready for Site service token (hidden): ')
headers = {'OAI-Sites-Authorization': 'Bearer '+token, 'Origin': origin,
           'User-Agent': 'Mozilla/5.0', 'Content-Type': 'text/plain; charset=utf-8'}

def request(part, method, data=None):
    url = origin+'/api/market-data/'+part['id']+'?v='+part['sha256']
    for attempt in range(3):
        try:
            with urlopen(Request(url, method=method, headers=headers, data=data), timeout=30) as response:
                return response.status, response.read()
        except HTTPError as error:
            if error.code in [502, 503, 504] and attempt < 2:
                continue
            # Never print request headers, credentials or HTML authentication pages.
            raise RuntimeError('Site HTTP '+str(error.code)+' for '+part['id']) from None
    raise RuntimeError('Site did not confirm '+part['id'])

for n, part in enumerate(parts, 1):
    data = (root/'market-archives'/(part['id']+'.b64')).read_bytes()
    assert len(data) == ((part['packedBytes']+2)//3)*4
    assert hashlib.sha256(base64.b64decode(data, validate=True)).hexdigest() == part['sha256']
    status, reply = request(part, 'POST', data)
    result = json.loads(reply)
    assert status in [200, 201] and result.get('ok') and result['sha256'] == part['sha256'] and result['count'] == part['count']
    if n == 1 or n % 5 == 0 or n == len(parts):
        print(json.dumps({'uploaded': n, 'total': len(parts), 'id': part['id']}), flush=True)

def verify(part):
    status, data = request(part, 'GET')
    assert status == 200
    assert len(data) == ((part['packedBytes']+2)//3)*4
    assert hashlib.sha256(base64.b64decode(data, validate=True)).hexdigest() == part['sha256']
    return part['id']

with ThreadPoolExecutor(max_workers=4) as pool:
    verified = list(pool.map(verify, parts))
token = ''
print(json.dumps({'ok': True, 'cloudVerifiedParts': len(verified),
                  'archives': [{'id': a['id'], 'count': a['count'], 'firstTime': a['firstTime'], 'lastTime': a['lastTime']} for a in catalog]}), flush=True)
