#!/usr/bin/env bash
# ==============================================================================
# Lexiconic - Ollama Startup Script for Linux & macOS
# ==============================================================================
# This script launches the local Ollama daemon with the necessary CORS origins
# enabled so the Lexiconic Chrome extension can communicate with it.
# ==============================================================================

set -e

# Configuration
DEFAULT_ORIGINS="chrome-extension://*"
export OLLAMA_ORIGINS="${OLLAMA_ORIGINS:-$DEFAULT_ORIGINS}"

echo "=========================================================="
echo " Starting Ollama for Project Lexiconic"
echo "=========================================================="
echo "OLLAMA_ORIGINS: ${OLLAMA_ORIGINS}"

# Check if Ollama is installed
if ! command -v ollama >/dev/null 2>&1; then
    echo ""
    echo "[!] Error: 'ollama' command was not found in your PATH."
    echo "    Please install Ollama from: https://ollama.com/download"
    echo "=========================================================="
    exit 1
fi

# Check if port 11434 is already in use
PORT_IN_USE=0
if command -v lsof >/dev/null 2>&1; then
    if lsof -i :11434 -sTCP:LISTEN >/dev/null 2>&1; then
        PORT_IN_USE=1
    fi
elif command -v nc >/dev/null 2>&1; then
    if nc -z 127.0.0.1 11434 >/dev/null 2>&1; then
        PORT_IN_USE=1
    fi
fi

if [ "$PORT_IN_USE" -eq 1 ]; then
    echo ""
    echo "[WARNING] Port 11434 is already in use!"
    echo "If Ollama is already running in the background (e.g. systemd or menu bar app),"
    echo "it may lack the required OLLAMA_ORIGINS permissions for Chrome extensions."
    echo "If Lexiconic cannot connect, stop the background Ollama service and re-run this script."
    echo ""
fi

echo "Starting Ollama server... (Press Ctrl+C to terminate)"
echo "=========================================================="
exec ollama serve
