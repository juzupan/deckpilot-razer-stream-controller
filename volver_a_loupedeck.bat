@echo off
chcp 65001 >nul
echo Cerrando DeckPilot...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -like ('*' + '%~dp0' + 'index.js*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
timeout /t 2 /nobreak >nul
echo Abriendo Loupedeck...
start "" "C:\Program Files (x86)\Loupedeck\Loupedeck2\configui2\Loupedeck.exe"
timeout /t 3 /nobreak >nul
