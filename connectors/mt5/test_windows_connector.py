import importlib.util
from pathlib import Path
from types import SimpleNamespace as NS
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('windows_connector', Path(__file__).parent / 'windows/windows_connector.py')
connector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(connector)

class Terminal:
    def __init__(self, login=12345678, server='FundingPips-SIM1', ready=True):
        self.account = NS(login=login, server=server, currency='EUR', trade_allowed=True)
        self.ready, self.disconnected = ready, False
        self.initialization = None
        self.deals = [NS(ticket=9007199254740993, position_id=9007199254740992, time_msc=1700000000000,
                         type=0, entry=0, symbol='EURUSD.a', volume=0.03, price=1.1,
                         profit=12.5, commission=-0.2, swap=-0.1, fee=-0.03)]

    def initialize(self, *args, **kwargs):
        self.initialization = (args, kwargs)
        return self.ready

    def account_info(self): return self.account
    def history_deals_total(self, start, end): return len(self.deals)
    def history_deals_get(self, start, end): return self.deals
    def positions_get(self): return [NS(ticket=9007199254740992, symbol='EURUSD.a', type=0, volume=0.03, price_open=1.1, profit=4.2, swap=-0.1, sl=1.09, tp=1.12)]
    def shutdown(self): self.disconnected = True
    # No login(), order_send(), close-terminal or account-changing functions exist.

class WindowsConnectorTests(unittest.TestCase):
    def setUp(self): self.job = {'login': '12345678', 'server': 'FundingPips-SIM1'}

    def test_reads_active_terminal_without_login_or_order_operations(self):
        mt5 = Terminal()
        data = connector.collect(mt5, self.job, 'C:\\MT5\\terminal64.exe')
        self.assertEqual(mt5.initialization, (('C:\\MT5\\terminal64.exe',), {'timeout': 60000}))
        self.assertTrue(mt5.disconnected)
        self.assertFalse(data['account']['readOnly'])
        self.assertTrue(data['account']['collectorReadOnly'])
        self.assertEqual(data['deals'][0]['ticket'], '9007199254740993')
        self.assertEqual(data['deals'][0]['commission'], -0.2)
        self.assertEqual(data['positions'][0]['tp'], 1.12)

    def test_wrong_account_and_failed_terminal_never_import(self):
        for terminal in [Terminal(login=99), Terminal(server='Other'), Terminal(ready=False)]:
            with self.assertRaises(ValueError): connector.collect(terminal, self.job)
            self.assertTrue(terminal.disconnected)

    def test_missing_history_and_large_history_fail_without_partial_upload(self):
        terminal = Terminal()
        terminal.history_deals_get = lambda *args: None
        with self.assertRaisesRegex(ValueError, 'HISTORY_FAILED'): connector.collect(terminal, self.job)
        terminal = Terminal()
        terminal.history_deals_total = lambda *args: 50001
        with self.assertRaisesRegex(ValueError, 'HISTORY_TOO_LARGE'): connector.collect(terminal, self.job)

    def test_https_only_and_no_credentials_or_redirect_paths_in_origin(self):
        self.assertEqual(connector.site_origin('https://journal.example.test/'), 'https://journal.example.test')
        for value in ['http://journal.example.test', 'https://name:secret@journal.example.test', 'https://journal.example.test/path', 'https://journal.example.test?token=key', 'https://journal.example.test:1234']:
            with self.assertRaises(ValueError): connector.site_origin(value)

    def test_download_contains_current_source_and_no_environment_or_cached_keys(self):
        root = Path(__file__).resolve().parents[2]
        with zipfile.ZipFile(root / 'frontend/public/downloads/eazy-trading-windows-connector.zip') as archive:
            self.assertEqual(len(archive.namelist()), 5)
            self.assertEqual(archive.read('eazy-trading-connector/windows_connector.py'), (Path(__file__).parent / 'windows/windows_connector.py').read_bytes())
            self.assertFalse(any('.env' in name or 'connector.json' in name or '.venv' in name for name in archive.namelist()))
            self.assertIn(b'\r\n', archive.read('eazy-trading-connector/Start Connector.cmd'))

if __name__ == '__main__': unittest.main()
