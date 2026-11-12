"""Private, temporary desktop for preparing broker server metadata; never log in here."""
import getpass
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.request

def find_server_metadata(root):
    """Current MT5 encodes its database; require a broker discovery receipt too."""
    matches = []
    server = "FundingPips-SIM1"
    for database in root.rglob("servers.dat"):
        if not 100 < database.stat().st_size <= 5 * 1024 * 1024:
            continue
        data = database.read_bytes()
        # Older builds store server names directly. New builds keep only the
        # database header readable, so use their adjacent discovery log instead.
        plain = server.encode("utf-16-le") in data or server.encode() in data
        header = "Servers".encode("utf-16-le") in data[:512]
        receipt = False
        if header:
            for log in (database.parent.parent / "logs").glob("*.log"):
                if log.stat().st_size > 5 * 1024 * 1024:
                    continue
                text = log.read_text(encoding="utf-16", errors="replace")
                if "\tBroker\t" + server + ":" in text:
                    receipt = True
                    break
        if plain or receipt:
            matches.append(database)
    return matches


def main():
    os.umask(0o077)
    seed = Path("/seed")
    if (seed / "terminal64.exe").exists():
        raise SystemExit("A terminal seed already exists. Back it up before preparing a replacement.")
    password = getpass.getpass("Choose a temporary VNC password (8 characters): ")
    if len(password) != 8 or not password.isascii() or not password.isalnum():
        raise SystemExit("Use exactly 8 letters/numbers for this temporary VNC password.")
    with tempfile.TemporaryDirectory(dir="/work", prefix="setup-") as folder:
        root = Path(folder)
        auth = root / "vnc-password"
        auth.write_text(password + "\n")
        env = {**os.environ, "DISPLAY": ":99", "WINEPREFIX": str(root / "wine"), "WINEDEBUG": "-all", "WINEDLLOVERRIDES": "mscoree,mshtml="}
        installer = root / "mt5setup.exe"
        print("Downloading the official MetaQuotes MT5 installer…", flush=True)
        request = urllib.request.Request("https://download.terminal.free/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe", headers={"User-Agent": "eazy-trading MT5 setup"})
        with urllib.request.urlopen(request, timeout=120) as response, installer.open("wb") as output:
            shutil.copyfileobj(response, output)
        processes = []
        try:
            processes.append(subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1280x800x24", "-nolisten", "tcp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            time.sleep(1)
            subprocess.run(["wine", "winecfg", "-v=win11"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90, check=False)
            processes.append(subprocess.Popen(["openbox"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            processes.append(subprocess.Popen(["x11vnc", "-display", ":99", "-rfbport", "5900", "-passwdfile", str(auth), "-forever", "-noshared", "-nocmds"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            processes.append(subprocess.Popen(["websockify", "--web=/usr/share/novnc", "6080", "127.0.0.1:5900"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            processes.append(subprocess.Popen(["wine", str(installer)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            print("Open http://127.0.0.1:6080/vnc.html through your SSH tunnel (port 6080), click Connect and enter your temporary VNC password. Install MT5, search FundingPips Corp and select FundingPips-SIM1. Do NOT enter account credentials. Then close MT5 normally.", flush=True)
            input("After closing MT5, press Enter here to save the clean terminal seed: ")
            binaries = list((root / "wine" / "drive_c").rglob("terminal64.exe"))
            if len(binaries) != 1:
                raise SystemExit("Cannot identify a single MT5 installation. No seed was saved.")
            install = binaries[0].parent
            servers = find_server_metadata(root / "wine" / "drive_c")
            # Windows installs may spell this MetaEditor64.exe on a case-sensitive host.
            editor = next((p for p in install.iterdir() if p.name.casefold() == "metaeditor64.exe" and p.is_file()), None)
            if len(servers) != 1 or editor is None:
                raise SystemExit("FundingPips-SIM1 metadata or MetaEditor is missing. No seed was saved.")
            # Stop terminal writes before copying. Save binaries and servers only.
            subprocess.run(["wineserver", "-k"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
            subprocess.run(["wineserver", "-w"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
            # A seed is not ready until its official compiler can compile our collector.
            source = root / "EazyJournal.mq5"
            shutil.copy2(Path(__file__).with_name("EazyJournal.mq5"), source)
            def windows(path): return "Z:" + str(path).replace("/", "\\")
            log = root / "collector-compile.log"
            subprocess.run(["wine", str(editor), "/portable", "/compile:" + windows(source), "/log:" + windows(log)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120, check=False)
            if not source.with_suffix(".ex5").is_file():
                if log.is_file():
                    print(log.read_text(encoding="utf-16", errors="replace"), flush=True)
                raise SystemExit("Collector compilation failed. No seed was saved.")
            subprocess.run(["wineserver", "-k"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
            subprocess.run(["wineserver", "-w"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
            seed.mkdir(exist_ok=True)
            (seed / "Config").mkdir(exist_ok=True)
            for name, original in (("terminal64.exe", binaries[0]), ("metaeditor64.exe", editor)):
                shutil.copy2(original, seed / name)
                (seed / name).chmod(0o644)
            shutil.copy2(servers[-1], seed / "Config" / "servers.dat")
            compiled = source.with_suffix('.ex5')
            shutil.copy2(compiled, seed / 'EazyJournal.ex5')
            (seed / 'collector.json').write_text(json.dumps({
                'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'binarySha256': hashlib.sha256(compiled.read_bytes()).hexdigest(),
            }), encoding='utf-8')
            (seed / 'EazyJournal.ex5').chmod(0o644)
            (seed / 'collector.json').chmod(0o644)
            (seed / "Config" / "servers.dat").chmod(0o644)
            (seed / "Config").chmod(0o755)
            seed.chmod(0o755)
            print("Clean terminal seed saved. Close the VNC viewer and SSH tunnel.", flush=True)
        finally:
            subprocess.run(["wineserver", "-k"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15, check=False)
            for process in reversed(processes):
                if process.poll() is None:
                    process.terminate()


if __name__ == "__main__":
    main()
