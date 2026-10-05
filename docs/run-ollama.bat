@echo off
rem ==============================================================================
rem Lexiconic - Ollama Startup Script for Windows (Command Prompt / Double-Click)
rem ==============================================================================
rem Configures OLLAMA_ORIGINS to accept requests from Chrome extensions and
rem starts `ollama serve`.
rem ==============================================================================

title Lexiconic - Ollama Service

echo ==========================================================
echo  Starting Ollama for Project Lexiconic
echo ==========================================================

rem Check if Ollama CLI exists in PATH
where ollama >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Error: 'ollama' command was not found in your PATH.
    echo     Please install Ollama from: https://ollama.com/download
    echo ==========================================================
    pause
    exit /b 1
)

rem Set the required environment variable
set "OLLAMA_ORIGINS=chrome-extension://*"
echo OLLAMA_ORIGINS: %OLLAMA_ORIGINS%

rem Check if port 11434 is already listening
netstat -ano | findstr /R /C:":11434 .*LISTENING" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [WARNING] Port 11434 is already in use!
    echo If Ollama is already running in the background (e.g. system tray app),
    echo it may not have OLLAMA_ORIGINS configured, which will block extension requests.
    echo To fix: Right-click the Ollama icon in the system tray, select 'Quit Ollama',
    echo and then re-run this script.
    echo.
)

echo Starting Ollama server... (Press Ctrl+C to terminate)
echo ==========================================================

ollama serve

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Ollama server stopped with an error code: %ERRORLEVEL%
    pause
)
