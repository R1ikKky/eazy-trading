"""One on-demand MT5 terminal per job. No passwords in argv, logs or persistent volumes."""
import json
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
import urllib.error

os.umask(0o077)
SEED = Path(os.environ.get("MT5_TERMINAL_SEED", "/seed"))
API = os.environ.get("MT5_API_URL", "http://api:3001/api/mt5").rstrip("/")
ORIGIN = os.environ.get("PUBLIC_ORIGIN", "")
TOKEN = os.environ.get("MT5_WORKER_TOKEN", "")
KNOWN_ERRORS = {"LOGIN_FAILED", "READ_ONLY_REQUIRED", "ACCOUNT_MISMATCH", "HISTORY_FAILED", "HISTORY_TOO_LARGE", "TERMINAL_UNAVAILABLE", "COLLECTOR_FAILED"}

def validate_seed(seed=SEED):
    for name in ('terminal64.exe', 'Config/servers.dat', 'EazyJournal.ex5', 'collector.json'):
        if not (seed / name).is_file():
            raise ValueError('MT5 seed is incomplete. Complete the current one-time setup first.')
    if (seed / 'collector.json').stat().st_size > 4096 or not 0 < (seed / 'EazyJournal.ex5').stat().st_size <= 5 * 1024 * 1024:
        raise ValueError('Invalid compiled collector metadata or size.')
    manifest = json.loads((seed / 'collector.json').read_text(encoding='utf-8'))
    if not isinstance(manifest, dict):
        raise ValueError('Invalid compiled collector metadata.')
    source = Path(__file__).with_name('EazyJournal.mq5')
    if manifest.get('sourceSha256') != hashlib.sha256(source.read_bytes()).hexdigest() or manifest.get('binarySha256') != hashlib.sha256((seed / 'EazyJournal.ex5').read_bytes()).hexdigest():
        raise ValueError('The compiled MT5 collector does not match this worker. Rebuild the terminal seed with the current setup.')

def request(path, value):
    data = json.dumps(value, separators=(",", ":"), allow_nan=False).encode()
    req = urllib.request.Request(API + path, data=data, headers={
        "Content-Type": "application/json", "Origin": ORIGIN, "Authorization": "Bearer " + TOKEN,
    })
    # Redirects must not forward the privileged worker token to another origin.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    with urllib.request.build_opener(NoRedirect).open(req, timeout=45) as response:
        return json.load(response)

def validate_job(job):
    if not isinstance(job.get("login"), str) or not job["login"].isdigit() or len(job["login"]) > 20:
        raise ValueError("ACCOUNT_MISMATCH")
    if job.get("server") != "FundingPips-SIM1":
        raise ValueError("ACCOUNT_MISMATCH")
    password = job.get("password")
    if not isinstance(password, str) or not password or len(password) > 256 or any(ord(c) < 32 or ord(c) == 127 for c in password):
        raise ValueError("LOGIN_FAILED")

def read_snapshot(path, job):
    if path.stat().st_size > 18 * 1024 * 1024:
        raise ValueError("HISTORY_TOO_LARGE")
    lines = [json.loads(line) for line in path.read_text(encoding="utf-8-sig").splitlines() if line]
    if len(lines) < 2 or lines[0].get("kind") != "account" or lines[-1].get("kind") != "complete":
        raise ValueError("HISTORY_FAILED")
    account, end = lines[0], lines[-1]
    if account.get("login") != job["login"] or account.get("server") != job["server"]:
        raise ValueError("ACCOUNT_MISMATCH")
    if account.get("readOnly") is not True:
        raise ValueError("READ_ONLY_REQUIRED")
    if any(line.get("kind") not in {"deal", "position"} for line in lines[1:-1]):
        raise ValueError("HISTORY_FAILED")
    deals = [d for d in lines[1:-1] if d["kind"] == "deal"]
    positions = [p for p in lines[1:-1] if p["kind"] == "position"]
    if len(deals) != end.get("deals") or len(positions) != end.get("positions"):
        raise ValueError("HISTORY_FAILED")
    return {"account": account, "deals": deals, "positions": positions}

def execute(job):
    validate_job(job)
    # Nothing is taken from seed profiles, EAs, login/password databases or scripts.
    with tempfile.TemporaryDirectory(prefix="mt5-", dir="/work") as directory:
        root = Path(directory)
        terminal = root / "terminal"
        terminal.mkdir()
        for binary in ("terminal64.exe",):
            shutil.copy2(SEED / binary, terminal / binary)
        (terminal / "Config").mkdir()
        shutil.copy2(SEED / "Config" / "servers.dat", terminal / "Config" / "servers.dat")
        scripts = terminal / "MQL5" / "Scripts"
        scripts.mkdir(parents=True)
        shutil.copy2(SEED / 'EazyJournal.ex5', scripts / 'EazyJournal.ex5')
        env = {**os.environ, "WINEPREFIX": str(root / "wine"), "WINEDEBUG": "-all", "WINEDLLOVERRIDES": "mscoree,mshtml=", "DISPLAY": ":99"}
        # Do not expose the API token to Wine or the terminal process environment.
        env.pop("MT5_WORKER_TOKEN", None)
        env.pop("MT5_ENCRYPTION_KEY", None)
        def wine(*args, timeout=90):
            return subprocess.run(["wine", *args], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=timeout, check=False)
        def windows(path):
            return "Z:" + str(path).replace("/", "\\")
        process = None
        display = None
        try:
            display = subprocess.Popen(['Xvfb', ':99', '-screen', '0', '1024x768x24', '-nolisten', 'tcp'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            wine("winecfg", "-v=win11", timeout=90)
            config = root / "login.ini"
            symbol = os.environ.get("MT5_BOOT_SYMBOL", "EURUSD")
            if not symbol or len(symbol) > 64 or any(ord(c) < 32 or c in "=[]" for c in symbol):
                raise ValueError("TERMINAL_UNAVAILABLE")
            config.write_text("[Common]\nLogin=" + job["login"] + "\nServer=" + job["server"] + "\nPassword=" + job["password"] +
                              "\nKeepPrivate=0\nNewsEnable=0\n[Experts]\nEnabled=0\nAllowLiveTrading=0\nAllowDllImport=0\n[StartUp]\nSymbol=" + symbol + "\nPeriod=M1\nScript=EazyJournal\n", encoding="utf-16")
            process = subprocess.Popen(["wine", str(terminal / "terminal64.exe"), "/portable", "/config:" + windows(config)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            deadline = time.monotonic() + 240
            output = terminal / "MQL5" / "Files" / "eazy-history.jsonl"
            error = output.with_name("eazy-error.txt")
            while time.monotonic() < deadline:
                if error.is_file():
                    code = error.read_text(encoding="utf-8-sig").strip()
                    raise ValueError(code if code in KNOWN_ERRORS else "COLLECTOR_FAILED")
                if output.is_file():
                    return read_snapshot(output, job)
                time.sleep(1)
            raise ValueError("LOGIN_FAILED")
        finally:
            if process is not None and process.poll() is None:
                process.terminate()
            try:
                subprocess.run(["wineserver", "-k"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15, check=False)
                subprocess.run(["wineserver", "-w"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15, check=False)
            finally:
                if display is not None:
                    display.terminate()
                    display.wait(timeout=5)

def main():
    if len(TOKEN) < 32 or not ORIGIN or not API.startswith(("http://api:3001/", "http://127.0.0.1:", "https://")):
        raise SystemExit("MT5 worker configuration is missing or invalid.")
    try:
        validate_seed()
    except (ValueError, OSError, KeyError):
        raise SystemExit('MT5 seed is missing, outdated or invalid. Follow docs/mt5.md before starting the worker.') from None
    stop = threading.Event()
    # Polls also act as a worker heartbeat while a Wine job is running.
    def heartbeat():
        while not stop.wait(15):
            try: request("/worker/heartbeat", {})
            except Exception: pass
    # Start heartbeat only while a job is in progress, so it cannot steal a queued job.
    try:
        while True:
            try:
                job = request("/worker/claim", {}).get("job")
                if not job:
                    time.sleep(5)
                    continue
                stop.clear()
                thread = threading.Thread(target=heartbeat, daemon=True)
                thread.start()
                try:
                    result = {"snapshot": execute(job)}
                except Exception as error:
                    code = str(error)
                    result = {"error": code if code in KNOWN_ERRORS else "COLLECTOR_FAILED"}
                # Always stop polling before finishing a lease.
                stop.set()
                thread.join(timeout=50)
                for attempt in range(3):
                    try:
                        request("/worker/jobs/" + job["id"] + "/finish", {"lease": job["lease"], **result})
                        break
                    except urllib.error.HTTPError as error:
                        if error.code < 500: break
                        time.sleep(2)
                    except Exception:
                        time.sleep(2)
                job.clear()
                result.clear()
            except Exception:
                # Never print exceptions/HTTP bodies: they may include sensitive data.
                print("MT5 worker is waiting for the API.", flush=True)
                time.sleep(10)
    finally:
        stop.set()

if __name__ == "__main__":
    main()
