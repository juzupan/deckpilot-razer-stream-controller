@echo off
rem Abre el editor visual de DeckPilot. Si DeckPilot no esta corriendo, lo arranca primero.
cd /d "%~dp0"
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:4747/api/estado | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto abrir
start "DeckPilot" /min "%~dp0iniciar.bat" auto
powershell -NoProfile -Command "for ($i = 0; $i -lt 40; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:4747/api/estado | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
:abrir
start "" "http://127.0.0.1:4747/"
