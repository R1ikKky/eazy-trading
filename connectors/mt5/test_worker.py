import json
from pathlib import Path
import tempfile
import unittest
from worker import read_snapshot, validate_job
import worker
import hashlib
from unittest.mock import patch
from setup import find_server_metadata

class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.job = {"login": "12345678", "server": "FundingPips-SIM1", "password": "synthetic-password"}

    def test_no_ini_injection(self):
        validate_job(self.job)
        for field, value in [("password", "bad\n[Experts]\nEnabled=1"), ("login", "1\nServer=bad"), ("server", "FundingPips2-SIM")]:
            with self.assertRaises(ValueError): validate_job({**self.job, field: value})

    def test_atomic_complete_and_account_identity_required(self):
        rows = [{"kind": "account", "login": "12345678", "server": "FundingPips-SIM1", "readOnly": True, "currency": "USD"}, {"kind": "deal", "ticket": "9007199254740993"}, {"kind": "complete", "deals": 1, "positions": 0}]
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "history.jsonl"
            def write(data): file.write_text("\n".join(json.dumps(row) for row in data))
            write(rows)
            self.assertEqual(read_snapshot(file, self.job)["deals"][0]["ticket"], "9007199254740993")
            for data in [rows[:-1], [{**rows[0], "login": "99"}, *rows[1:]], [*rows[:-1], {**rows[-1], "deals": 2}], [{**rows[0], "readOnly": False}, *rows[1:]]]:
                write(data)
                with self.assertRaises(ValueError): read_snapshot(file, self.job)

    def test_precompiled_seed_rejects_stale_source_and_modified_binary(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'Config').mkdir()
            (root / 'Config/servers.dat').write_bytes(b'synthetic server metadata')
            (root / 'terminal64.exe').write_bytes(b'synthetic terminal')
            binary = root / 'EazyJournal.ex5'
            binary.write_bytes(b'synthetic compiled collector')
            manifest = {'sourceSha256': hashlib.sha256(Path(worker.__file__).with_name('EazyJournal.mq5').read_bytes()).hexdigest(), 'binarySha256': hashlib.sha256(binary.read_bytes()).hexdigest()}
            metadata = root / 'collector.json'
            metadata.write_text(json.dumps(manifest))
            worker.validate_seed(root)
            binary.write_bytes(b'changed')
            with self.assertRaises(ValueError): worker.validate_seed(root)
            binary.write_bytes(b'synthetic compiled collector')
            metadata.write_text(json.dumps({**manifest, 'sourceSha256': 'outdated'}))
            with self.assertRaises(ValueError): worker.validate_seed(root)

    def test_idle_worker_does_not_start_wine_or_a_display(self):
        with patch.object(worker, 'TOKEN', 'synthetic-' * 5), patch.object(worker, 'ORIGIN', 'https://journal.example.test'), patch.object(worker, 'validate_seed'), patch.object(worker, 'request', return_value={'job': None}), patch.object(worker.time, 'sleep', side_effect=KeyboardInterrupt), patch.object(worker.subprocess, 'Popen', side_effect=AssertionError('Idle worker started a process')):
            with self.assertRaises(KeyboardInterrupt): worker.main()

    def test_encoded_server_database_requires_matching_broker_discovery(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'Config').mkdir()
            (root / 'logs').mkdir()
            database = root / 'Config/servers.dat'
            database.write_bytes('Copyright MetaQuotes\0Servers\0'.encode('utf-16-le') + b'\x80' * 200)
            self.assertEqual(find_server_metadata(root), [])
            log = root / 'logs/setup.log'
            log.write_text('time\tBroker\tFundingPips-SIM: discovered\n', encoding='utf-16')
            self.assertEqual(find_server_metadata(root), [])
            log.write_text('time\tBroker\tFundingPips-SIM1: no demo/preliminary groups on server side\n', encoding='utf-16')
            self.assertEqual(find_server_metadata(root), [database])
            database.write_bytes(b'not a server database' * 10)
            self.assertEqual(find_server_metadata(root), [])

if __name__ == "__main__": unittest.main()
