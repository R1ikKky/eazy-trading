"""Local, read-only history collection from the user's already signed-in MT5.
No broker login/password, order, trade modification, EA or DLL-import operations.
"""
import base64
import ctypes
import getpass
import json
import os
from pathlib import Path
import sys
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

ERRORS = {"ACCOUNT_MISMATCH", "HISTORY_FAILED", "HISTORY_TOO_LARGE", "TERMINAL_UNAVAILABLE", "MT5_NOT_CONNECTED", "MT5_TIMEOUT"}
VERSION = "1.1"


def progress(message):
    line = time.strftime("%H:%M:%S") + " " + message
    print(line, flush=True)
    # Only app-owned stage/error messages go here, never tokens or broker objects.
    if os.name == "nt" and os.environ.get("LOCALAPPDATA"):
        try:
            folder = Path(os.environ["LOCALAPPDATA"]) / "eazy-trading"
            folder.mkdir(parents=True, exist_ok=True)
            with (folder / "connector.log").open("a", encoding="utf-8") as log:
                log.write(line + "\n")
        except OSError:
            pass


def site_origin(value):
    u = urllib.parse.urlsplit(value.strip())
    if u.scheme != "https" or not u.hostname or u.username or u.password or u.port not in (None, 443) or u.path not in ("", "/") or u.query or u.fragment:
        raise ValueError("Enter only your website's HTTPS address, for example https://journal.example.com")
    return "https://" + u.netloc.lower()


def collect(mt5, job, terminal=""):
    try:
        progress("Opening the local MT5 connection (up to 60 seconds)...")
        # No login parameters: read the user's active terminal, never switch its account.
        ready = mt5.initialize(terminal, timeout=60000) if terminal else mt5.initialize(timeout=60000)
        if not ready:
            try:
                code = mt5.last_error()[0]
                if isinstance(code, int): progress("MT5 initialization failed with API code " + str(code))
            except Exception:
                pass
            raise ValueError("TERMINAL_UNAVAILABLE")
        info = mt5.terminal_info()
        if not info or not info.connected:
            progress("MT5 is not connected to its broker. Finish updates and sign in inside MT5, then retry.")
            raise ValueError("MT5_NOT_CONNECTED")
        progress("MT5 is connected. Checking the active account...")
        account = mt5.account_info()
        if not account or str(account.login) != job["login"] or account.server != job["server"]:
            raise ValueError("ACCOUNT_MISMATCH")
        until = int(time.time()) + 86400
        progress("Checking the broker history count...")
        count = mt5.history_deals_total(0, until)
        if count is None:
            raise ValueError("HISTORY_FAILED")
        if count > 50000:
            raise ValueError("HISTORY_TOO_LARGE")
        progress("Downloading deal history from the local terminal...")
        history = mt5.history_deals_get(0, until)
        progress("Reading open positions...")
        positions = mt5.positions_get()
        if history is None or positions is None or len(history) != count:
            raise ValueError("HISTORY_FAILED")
        if len(positions) > 2000:
            raise ValueError("HISTORY_TOO_LARGE")
        deals = [{"ticket": str(d.ticket), "positionId": str(d.position_id), "timeMsc": d.time_msc,
                  "type": d.type, "entry": d.entry, "symbol": d.symbol, "volume": d.volume,
                  "price": d.price, "profit": d.profit, "commission": d.commission,
                  "swap": d.swap, "fee": d.fee, "sl": 0, "tp": 0} for d in history]
        # Python's deal records do not include historical SL/TP; zero means unavailable.
        opened = [{"ticket": str(p.ticket), "symbol": p.symbol, "side": "buy" if p.type == 0 else "sell",
                   "volume": p.volume, "price": p.price_open, "profit": p.profit,
                   "swap": p.swap, "sl": p.sl, "tp": p.tp} for p in positions]
        final_account = mt5.account_info()
        if not final_account or str(final_account.login) != job["login"] or final_account.server != job["server"]:
            raise ValueError("ACCOUNT_MISMATCH")
        if mt5.history_deals_total(0, until) != count:
            raise ValueError("HISTORY_FAILED")
        final_info = mt5.terminal_info()
        if not final_info or not final_info.connected:
            raise ValueError("MT5_NOT_CONNECTED")
        progress("History read: " + str(len(deals)) + " deals, " + str(len(opened)) + " open positions.")
        return {"account": {"login": str(account.login), "server": account.server, "currency": account.currency,
                            "readOnly": not bool(account.trade_allowed), "collectorReadOnly": True},
                "deals": deals, "positions": opened}
    finally:
        # Disconnect the Python API only. Do not close the user's trading terminal.
        mt5.shutdown()


def collect_process(job, terminal="", timeout=120, command=None):
    """A blocked native MT5 call cannot freeze the uploader or its heartbeat.
    Kill only our child Python process on timeout; never terminate MT5.
    """
    with tempfile.TemporaryDirectory(prefix="eazy-mt5-") as folder:
        output = Path(folder) / "result.json"
        args = command or [sys.executable, str(Path(__file__).resolve()), "--collect-local"]
        process = subprocess.Popen([*args, str(output)], stdin=subprocess.PIPE, text=True,
                                   stderr=subprocess.DEVNULL)
        try:
            # No pairing key, job lease, broker password or website URL enters the child.
            process.communicate(json.dumps({"login": job["login"], "server": job["server"], "terminal": terminal}), timeout=timeout)
            if not output.is_file():
                return {"error": "COLLECTOR_FAILED"}
            if output.stat().st_size > 18 * 1024 * 1024:
                return {"error": "HISTORY_TOO_LARGE"}
            return json.loads(output.read_text(encoding="utf-8"))
        except subprocess.TimeoutExpired:
            progress("MT5 did not respond within " + str(timeout) + " seconds. Check updates, login, and the selected terminal path.")
            return {"error": "MT5_TIMEOUT"}
        finally:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=10)


def collect_local_entry(output):
    try:
        import MetaTrader5 as mt5
        request = json.load(sys.stdin)
        result = {"snapshot": collect(mt5, request, request.get("terminal", ""))}
    except Exception as error:
        code = str(error)
        result = {"error": code if code in ERRORS else "COLLECTOR_FAILED"}
        progress("Local MT5 read failed: " + result["error"])
    Path(output).write_text(json.dumps(result, allow_nan=False), encoding="utf-8")


def dpapi(data, encrypt):
    if os.name != "nt":
        raise RuntimeError("This connector requires Windows.")
    class Blob(ctypes.Structure):
        _fields_ = [("size", ctypes.c_uint32), ("data", ctypes.POINTER(ctypes.c_ubyte))]
    storage = ctypes.create_string_buffer(data)
    incoming = Blob(len(data), ctypes.cast(storage, ctypes.POINTER(ctypes.c_ubyte)))
    outgoing = Blob()
    crypt = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    fn = crypt.CryptProtectData if encrypt else crypt.CryptUnprotectData
    fn.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(Blob)]
    fn.restype = ctypes.c_int
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    if not fn(ctypes.byref(incoming), None, None, None, None, 1, ctypes.byref(outgoing)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(outgoing.data, outgoing.size)
    finally:
        kernel.LocalFree(outgoing.data)


def configuration(reset=False):
    folder = Path(os.environ["LOCALAPPDATA"]) / "eazy-trading"
    path = folder / "connector.json"
    if path.exists() and not reset:
        config = json.loads(path.read_text(encoding="utf-8"))
        config["origin"] = site_origin(config["origin"])
        config["token"] = dpapi(base64.b64decode(config["protectedToken"]), False).decode()
        return config
    origin = site_origin(input("Your eazy trading website address (https://...): "))
    token = getpass.getpass("Paste the Windows pairing key from Journal > MT5 (hidden): ").strip()
    import re
    if not re.fullmatch(r"[a-fA-F0-9-]{36}\.[A-Za-z0-9_-]{43}", token):
        raise ValueError("Invalid pairing key. Use the key from Use Windows PC, not a server secret or broker password.")
    terminal = input("MT5 terminal64.exe full path (Enter for automatic detection): ").strip().strip('"')
    if terminal and not Path(terminal).is_file():
        raise ValueError("The MT5 terminal path does not exist.")
    folder.mkdir(parents=True, exist_ok=True)
    saved = {"origin": origin, "terminal": terminal, "protectedToken": base64.b64encode(dpapi(token.encode(), True)).decode()}
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(saved), encoding="utf-8")
    os.replace(temporary, path)
    return {**saved, "token": token}


class Client:
    def __init__(self, config):
        self.origin, self.token = config["origin"], config["token"]

    def request(self, path, value):
        encoded = json.dumps(value, separators=(",", ":"), allow_nan=False).encode()
        if len(encoded) > 18 * 1024 * 1024:
            raise ValueError("HISTORY_TOO_LARGE")
        req = urllib.request.Request(self.origin + "/api/mt5/local/" + path, data=encoded, headers={
            "Content-Type": "application/json", "Origin": self.origin, "Authorization": "Bearer " + self.token,
        })
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs): return None
        with urllib.request.build_opener(NoRedirect).open(req, timeout=45) as response:
            return json.load(response)


def access_error(status):
    if status == 401:
        return RuntimeError("Pairing key not accepted (HTTP 401). Generate one new Windows key, run Pair again.cmd, then leave Use Windows PC alone while the connector runs.")
    return RuntimeError("Website blocked the connector request (HTTP 403). Check the site's access rules or firewall; replacing the pairing key may not help.")


def run(config):
    client = Client(config)
    identity = client.request("heartbeat", {})
    print("Website paired for account " + identity["login"] + " on " + identity["server"] + ". MT5 connection will be checked on sync.", flush=True)
    print("Keep MT5 signed in. Open Journal > MT5 on your website and click Sync now.", flush=True)
    print("This window must stay open while you sync. Ctrl+C stops the connector.", flush=True)
    stop = threading.Event()
    def heartbeat():
        while not stop.wait(15):
            try: client.request("heartbeat", {})
            except Exception: pass
    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    try:
        while True:
            try:
                job = client.request("claim", {}).get("job")
                if not job:
                    time.sleep(5)
                    continue
                progress("Starting local MT5 read...")
                try:
                    result = collect_process(job, config.get("terminal", ""))
                except Exception as error:
                    code = str(error)
                    result = {"error": code if code in ERRORS else "COLLECTOR_FAILED"}
                for attempt in range(3):
                    try:
                        progress("Sending sync result to the website...")
                        client.request("jobs/" + job["id"] + "/finish", {"lease": job["lease"], **result})
                        progress("Sync finished. Check your website journal." if "snapshot" in result else "Sync failed: " + result["error"] + ". Check MT5 and your website.")
                        break
                    except urllib.error.HTTPError as error:
                        if error.code < 500: raise
                        time.sleep(2)
                    except (TimeoutError, urllib.error.URLError):
                        time.sleep(2)
                else:
                    progress("Could not deliver the sync result after 3 attempts. Check the website connection; this job will expire.")
                result.clear()
            except urllib.error.HTTPError as error:
                if error.code in (401, 403):
                    raise access_error(error.code) from None
                if error.code == 409:
                    progress("This sync expired or was cancelled. Wait until MT5 is ready, then click Sync now again.")
                    continue
                print("Website returned HTTP " + str(error.code) + ". Retrying...", flush=True)
                time.sleep(10)
            except (TimeoutError, urllib.error.URLError):
                print("Cannot reach your website. Check the internet connection; retrying...", flush=True)
                time.sleep(10)
    finally:
        stop.set()
        thread.join(timeout=50)


def main():
    if os.name != "nt":
        raise SystemExit("Run this connector on the Windows PC with MT5, not the VPS.")
    try:
        if len(sys.argv) == 3 and sys.argv[1] == "--collect-local":
            collect_local_entry(sys.argv[2])
            return
        progress("eazy trading Windows connector " + VERSION)
        run(configuration("--setup" in sys.argv))
    except KeyboardInterrupt:
        print("Connector stopped. MT5 remains open.")
    except urllib.error.HTTPError as error:
        progress(str(access_error(error.code)) if error.code in (401, 403) else "Website returned HTTP " + str(error.code) + ". Check the website address and connection.")
        raise SystemExit(1) from None
    except Exception as error:
        # Configuration errors are ours; never print broker/HTTP bodies or tokens.
        if isinstance(error, (ValueError, RuntimeError)):
            progress(str(error))
        else:
            print("Connector could not start. Check Python, MT5, and your pairing settings.")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
