<#
.SYNOPSIS
    Starts Ollama with required parameters for the Lexiconic Chrome extension.

.DESCRIPTION
    Lexiconic requires Ollama to allow cross-origin requests from Chrome extensions.
    This script sets OLLAMA_ORIGINS to "chrome-extension://*" and starts `ollama serve`.
#>

param(
    [string]$Origins = "chrome-extension://*"
)

$Host.UI.RawUI.WindowTitle = "Lexiconic - Ollama Service"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Starting Ollama for Project Lexiconic" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Check if Ollama CLI is installed and accessible in PATH
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollamaCmd) {
    Write-Host "[!] Error: 'ollama' was not found in your PATH." -ForegroundColor Red
    Write-Host "    Please install Ollama from: https://ollama.com/download" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Cyan
    exit 1
}

# Set the required environment variable
$env:OLLAMA_ORIGINS = $Origins
Write-Host "OLLAMA_ORIGINS: $env:OLLAMA_ORIGINS" -ForegroundColor Green

# Check if port 11434 is already in use
try {
    $existingConn = Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue
    if ($existingConn) {
        Write-Host ""
        Write-Host "[WARNING] Port 11434 is already in use!" -ForegroundColor Yellow
        Write-Host "If Ollama is already running in the background (e.g. system tray app)," -ForegroundColor Yellow
        Write-Host "it may not have OLLAMA_ORIGINS configured, which will block extension requests." -ForegroundColor Yellow
        Write-Host "To fix: Right-click the Ollama icon in the system tray, select 'Quit Ollama'," -ForegroundColor Yellow
        Write-Host "and then re-run this script." -ForegroundColor Yellow
        Write-Host ""
    }
} catch {
    # Non-fatal if Get-NetTCPConnection is unavailable on older PS versions
}

Write-Host "Starting Ollama server... (Press Ctrl+C to terminate)" -ForegroundColor DarkCyan
Write-Host "==========================================================" -ForegroundColor Cyan

ollama serve
