@echo off
setlocal
rem Reference Viewer installer (Windows)
rem  1. Allow unsigned CEP extensions (PlayerDebugMode) for CSXS 11-13
rem  2. Link this folder into %APPDATA%\Adobe\CEP\extensions (junction, no admin needed)
rem     -> updating this repository (git pull) updates the panel too.

for %%V in (11 12 13) do (
    reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
)
echo [OK] PlayerDebugMode enabled (CSXS.11 - CSXS.13)

set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"
set "DEST_DIR=%APPDATA%\Adobe\CEP\extensions"
set "DEST=%DEST_DIR%\ReferenceViewer"

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"
if exist "%DEST%" (
    echo [!] "%DEST%" already exists. Remove it first if you want to re-link.
) else (
    mklink /J "%DEST%" "%SRC%" >nul && echo [OK] Linked: "%DEST%" ^-^> "%SRC%"
)

echo.
echo Restart After Effects, then open: Window ^> Extensions ^> Reference Viewer
pause
