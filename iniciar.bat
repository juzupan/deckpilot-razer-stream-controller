@echo off
chcp 65001 >nul
title DeckPilot
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta Node.js. Instala la version LTS desde https://nodejs.org y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)

rem --- acceso directo en el escritorio (se actualiza cada vez, abre en modo automatico) ---
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $l=Join-Path $d 'DeckPilot.lnk'; $nuevo=-not (Test-Path $l); $s=(New-Object -ComObject WScript.Shell).CreateShortcut($l); $s.TargetPath='%~dp0iniciar.bat'; $s.Arguments='auto'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0deckpilot.ico,0'; $s.WindowStyle=7; $s.Description='DeckPilot - tu Razer Stream Controller'; $s.Save(); if($nuevo){ Write-Host ' Acceso directo DeckPilot creado en tu escritorio.' }; $e=Join-Path $d 'Editar DeckPilot.lnk'; $s2=(New-Object -ComObject WScript.Shell).CreateShortcut($e); $s2.TargetPath='%~dp0editar.bat'; $s2.WorkingDirectory='%~dp0'; $s2.IconLocation='%~dp0deckpilot.ico,0'; $s2.WindowStyle=7; $s2.Description='Editor visual de DeckPilot'; $s2.Save()"

rem --- si DeckPilot ya estaba corriendo, se cierra para arrancar limpio (y ver la animacion) ---
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -like ('*' + '%~dp0' + 'index.js*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"

rem --- Loupedeck y DeckPilot no pueden usar el controlador al mismo tiempo ---
tasklist /fi "imagename eq LogiPluginService.exe" | find /i "LogiPluginService" >nul
if not errorlevel 1 goto preguntar
tasklist /fi "imagename eq Loupedeck.exe" | find /i "Loupedeck.exe" >nul
if not errorlevel 1 goto preguntar
goto instalar

:preguntar
rem desde el acceso directo (modo automatico) se cierra Loupedeck sin preguntar
if /i "%~1"=="auto" goto cerrar
echo.
echo  Loupedeck esta abierto y tiene ocupado el controlador.
choice /c SN /m " Cerrarlo ahora para usar DeckPilot"
if errorlevel 2 exit /b 0
:cerrar
echo  Cerrando Loupedeck para usar DeckPilot...
taskkill /im Loupedeck.exe /f >nul 2>nul
taskkill /im LogiPluginService.exe /f >nul 2>nul
timeout /t 2 /nobreak >nul

:instalar
if not exist node_modules\loupedeck (
  echo.
  echo  Primera vez: instalando lo necesario, tarda un minuto...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo  La instalacion fallo. Copia el mensaje de arriba y pasaselo a Claude.
    pause
    exit /b 1
  )
)

echo.
echo  DeckPilot corriendo. Deja esta ventana abierta (puedes minimizarla).
echo  Para volver a Loupedeck: cierra esta ventana y abre volver_a_loupedeck.bat
echo.
node "%~dp0index.js"
echo.
pause
