# Project Lexiconic

**Project Lexiconic** is a privacy-first, locally hosted spell and grammar checking Chrome extension. Powered by local large language models via [Ollama](https://ollama.com/), Lexiconic inspects browser input fields (such as textareas, text inputs, and `contenteditable` elements) and delivers real-time correction suggestions—without your keystrokes or data ever leaving your machine.

---

## Features

- **100% Local & Private:** All inference runs on your own hardware using Ollama. No remote telemetry, cloud APIs, or third-party servers.
- **Industry-Leading Experience:** Evaluates text and surfaces non-intrusive correction popups and single-click replacements, comparable to industry-leading writing assistants.
- **Manual & Auto Spellcheck Modes:** Configure whether suggestions run automatically as you type or on-demand via manual badge triggers.
- **Structured JSON Engine:** Instructs local models to deliver strict structured error lists (identifying original phrases, replacements, and concise rationale).
- **Universal Input Compatibility:** Supports standard `<textarea>`, `<input type="text">`, and rich-text `contenteditable` divs across the web.

---

## System Architecture

```
┌────────────────────────────────────────────────────────┐
│                      Web Browser                       │
│  ┌───────────────────────┐    ┌─────────────────────┐  │
│  │   Active Webpage      │    │ Lexiconic Extension │  │
│  │ (Textarea / Editable) │    │   (Content Script)  │  │
│  └──────────┬────────────┘    └──────────┬──────────┘  │
│             │ typing event               │             │
│             ▼                            │             │
│    Debounce Buffer (1000ms) ─────────────┤             │
│                                          │             │
│                               chrome.runtime.sendMessage│
│                                          │             │
│                               ┌──────────▼──────────┐  │
│                               │  Background Worker  │  │
│                               │   (Manifest V3)     │  │
│                               └──────────┬──────────┘  │
└──────────────────────────────────────────┼─────────────┘
                                           │ POST /api/generate
                                           │ (JSON payload)
                                           ▼
                                ┌─────────────────────┐
                                │ Local Ollama Daemon │
                                │   (gemma4:e4b /     │
                                │   llama3.2:1b)      │
                                └─────────────────────┘
```

---

## Prerequisites

1. **Google Chrome** (or any Chromium-based browser supporting Manifest V3).
2. **[Ollama](https://ollama.com/)** installed and running locally.
3. A fast, low-latency small language model pulled locally. Lexiconic supports two models out-of-the-box:
   - **`gemma4:e4b`** (Default): Recommended for rich, highly accurate grammar checks and nuanced tone refinement.
   - **`llama3.2:1b`** (Fast & Lightweight): Compact 1B model with minimal memory footprint and ultra-fast inference.

```bash
# Pull the default Gemma 4 model:
ollama pull gemma4:e4b

# Or pull the lightweight Llama 3.2 1B model:
ollama pull llama3.2:1b
```

---

## Installation & Setup

### 1. Launch Ollama with Cross-Origin Permissions
By default, Ollama blocks HTTP requests originating from browser extensions (`chrome-extension://*`). Use the automated startup scripts or run the commands manually:

#### Quick Start (Automated Scripts)
- **macOS / Linux:**
  ```bash
  chmod +x run-ollama.sh
  ./run-ollama.sh
  ```
- **Windows (PowerShell):**
  ```powershell
  .\run-ollama.ps1
  ```
- **Windows (Command Prompt / Double-Click):**
  ```cmd
  run-ollama.bat
  ```

#### Manual Commands
- **macOS / Linux:**
  ```bash
  OLLAMA_ORIGINS="chrome-extension://*" ollama serve
  ```
- **Windows (PowerShell):**
  ```powershell
  $env:OLLAMA_ORIGINS="chrome-extension://*"
  ollama serve
  ```
- **Windows (Command Prompt):**
  ```cmd
  set OLLAMA_ORIGINS=chrome-extension://*
  ollama serve
  ```

> *Tip: Once the extension is loaded, you can replace the wildcard `*` with your specific extension ID for tighter local security.*

### 2. Load the Extension in Chrome
1. Clone or download this repository onto your machine.
2. In Chrome, navigate to `chrome://extensions/`.
3. Toggle on **Developer mode** in the upper-right corner.
4. Click **Load unpacked**.
5. Select the project directory (`Project Lexiconic`).

---

## File Structure

```
project-lexiconic/
├── manifest.json       # Manifest V3 configuration and host permissions
├── background.js       # Background worker communicating with Ollama
├── content.js          # DOM listener, debouncing, and UI pill injector
├── styles.css          # Styling for badges, suggestion cards, and buttons
└── README.md           # Project documentation
```

---

## Configuration & Tuning

### Changing the Model
You can switch models directly from the extension popup:
1. Click the **Lexiconic** extension icon in Chrome.
2. Navigate to the **Ollama Settings** tab.
3. Select your model from the **Model** dropdown:
   - **`gemma4:e4b` (Default)** — High accuracy and stylistic nuance.
   - **`llama3.2:1b` (Fast 1B)** — Ultra-low latency and lightweight memory footprint.
   - Or choose **Custom…** to enter any other locally pulled Ollama model (e.g. `qwen2.5:1.5b`, `mistral`).
4. Click **Save Model**.

Alternatively, the fallback default model can be configured in `background.js`:
```javascript
const {
    ollamaHost   = "http://localhost:11434",
    ollamaModel  = "gemma4:e4b", // Or "llama3.2:1b"
    writingTone  = "professional",
    writingStyle = "natural",
} = await chrome.storage.local.get([ ... ]);
```

### Adjusting Debounce Delay
To adjust how long the extension waits after keystrokes cease before triggering an LLM inference, modify the debounce delay in `content.js`:

```javascript
debounceTimer = setTimeout(() => {
  // ...
}, 1000); // Default is 1000ms (1 second)
```

---

## Roadmap

- [ ] Add overlay canvas to draw red squiggly underlines directly over identified text offsets, similar to industry-leading products.
- [ ] Options page to switch target Ollama models and endpoints (`http://localhost:11434`) via Chrome Storage.
- [ ] Support custom tone preferences (e.g., Academic, Casual, Executive).
- [ ] Ignore list for user-defined dictionaries and code blocks.

---

## License

This project is licensed under the MIT License. See `LICENSE` for details.