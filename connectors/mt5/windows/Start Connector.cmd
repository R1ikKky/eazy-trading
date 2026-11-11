@echo off
setlocal
cd /d "%~dp0"
for %%V in (3.14 3.13 3.12) do (
  py -%%V -c "import sys; assert sys.maxsize > 2**32" >nul 2>&1
  if not errorlevel 1 (
    set "CONNECTOR_PYTHON=%%V"
    goto python_found
  )
)
echo Install Python 3.14 for Windows, 64-bit, from python.org first.
echo Include the Python launcher during installation, then run this file again.
pause
exit /b 1
:python_found
if not exist ".venv\Scripts\python.exe" (
  py -%CONNECTOR_PYTHON% -m venv .venv
  if errorlevel 1 goto failed
)
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt
if errorlevel 1 goto failed
if "%~1"=="--setup" (
  ".venv\Scripts\python.exe" windows_connector.py --setup
) else (
  if "%~1"=="--diagnose" (
    ".venv\Scripts\python.exe" windows_connector.py --diagnose
  ) else (
    ".venv\Scripts\python.exe" windows_connector.py
  )
)
pause
exit /b
:failed
echo Installation failed. Check the internet connection and the error above.
pause
exit /b 1
