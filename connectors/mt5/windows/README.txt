eazy trading - Windows MT5 connector

1. Install Python 3.14 (64-bit) from https://www.python.org/downloads/windows/.
   Include the Python launcher in the installer options.
2. Open MT5 on this PC and sign in to the account you want to journal.
3. Extract this ZIP to a normal folder, then double-click Start Connector.cmd.
4. Enter your website's HTTPS address and the Windows pairing key from
   Journal > MT5 > Use Windows PC. Never enter a broker password in this tool.
5. Leave the connector window open. On the website, click Sync now.

Use the trader's normal network. The website receives history data; it does
not log into the broker from the VPS. This does not guarantee broker approval.
No VPN, VNC, Docker, Wine, MQL compilation, or VPS MT5 installation is needed.

The connector only reads history and open positions. It does not switch the
terminal's account, place/modify orders, or close your trading terminal.
It can detect the wrong MT5 instance: specify its terminal64.exe path when
pairing if you have multiple MT5 installations. The account/server must match.

The pairing key is scoped to one journal account, stored encrypted with Windows
DPAPI under your Windows login in %LOCALAPPDATA%\eazy-trading\connector.json.
To change the website, key or terminal path, run Pair again.cmd.
To revoke access, click Disconnect on the website. Pairing again revokes old keys.
Only run one copy of this connector per paired account. It must be running,
with Windows awake and MT5 signed in, whenever you click Sync now.

The installer downloads the official MetaTrader5 Python package and dependencies
from PyPI. Source code is included. This ZIP is not a signed Windows executable.
Allowing downloaded scripts is your choice; do not bypass your organisation's
security controls. Never send your pairing key or broker password in chat.

Results are broker history in account currency. Open positions are snapshots,
not live quotes. The Python deal API does not expose historical SL/TP values.
There is no automatic R calculation without your planned initial risk.
