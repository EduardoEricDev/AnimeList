@echo off
REM ==============================================================================
REM AnimeList - Iniciar Aplicativo
REM Verifica se o atalho na Area de Trabalho existe (recria se necessario)
REM e abre o aplicativo em modo desktop silencioso
REM ==============================================================================

set "DESKTOP_LNK=%USERPROFILE%\Desktop\AnimeList.lnk"
if not exist "%DESKTOP_LNK%" (
    powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\create-desktop-shortcut.ps1"
)

start wscript "%~dp0launch-app.vbs"
exit
