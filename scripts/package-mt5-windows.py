"""Build the public, credential-free connector download from reviewed source files."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
source = root / "connectors" / "mt5" / "windows"
output = root / "frontend" / "public" / "downloads" / "eazy-trading-windows-connector.zip"
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in ["windows_connector.py", "requirements.txt", "Start Connector.cmd", "Pair again.cmd", "README.txt"]:
        item = zipfile.ZipInfo("eazy-trading-connector/" + name, (2026, 1, 1, 0, 0, 0))
        item.compress_type = zipfile.ZIP_DEFLATED
        item.external_attr = 0o644 << 16
        data = (source / name).read_bytes()
        if name.endswith('.cmd'):
            data = data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
        archive.writestr(item, data)
print("Built frontend/public/downloads/eazy-trading-windows-connector.zip")
