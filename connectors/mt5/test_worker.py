import json
from pathlib import Path
import tempfile
import unittest
from worker import read_snapshot, validate_job

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

if __name__ == "__main__": unittest.main()
