# Lexiconic — Project Structure & Architecture Guide

> **Audience:** AI Agents & Developers  
> **Last Updated:** October 2026 (v0.1.2)  
> **Repository:** [https://github.com/DeusBit/lexiconic](https://github.com/DeusBit/lexiconic)  
> **Home Page:** [https://deusbit.github.io/lexiconic/](https://deusbit.github.io/lexiconic/)

---

## 1. Executive Summary

**Lexiconic** is an offline-first, privacy-focused Google Chrome extension (Manifest V3) that provides real-time grammar, spelling, and tone corrections directly within web input fields (standard `<textarea>`, `<input type="text">`, and rich-text `contenteditable` editors such as Gmail).

All inference is executed locally through an **[Ollama](https://ollama.com/)** daemon running on the user's workstation. No keystrokes, personal text, or telemetry are ever sent to remote cloud servers.

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                              Web Browser                               │
│                                                                        │
│  ┌─────────────────────────┐          ┌─────────────────────────────┐  │
│  │   Active Webpage / DOM  │          │    Content Script Engine    │  │
│  │ (Textarea/ContentEditable)◄────────┤       (`content.js`)        │  │
│  └────────────┬────────────┘          │  - Floating UI badge        │  │
│               │ typing events         │  - Suggestion card popup    │  │
│               ▼                       │  - DOM diff & replacement   │  │
│     Debounced Text Extraction         └──────────────┬──────────────┘  │
│                                                      │                 │
│                                          chrome.runtime.sendMessage    │
│                                          ({ action: "checkText" })     │
│                                                      │                 │
│  ┌─────────────────────────┐          ┌──────────────▼──────────────┐  │
│  │    Action Popup UI      │          │   Background Service Worker │  │
│  │   (`popup/popup.html`)  │          │      (`background.js`)      │  │
│  │  - Host & model settings│          │  - Health pings (alarms)    │  │
│  │  - Tone & style prefs   │          │  - Icon status (color/gray) │  │
│  │  - Manual test sandbox  │          │  - Structured prompt engine │  │
│  └────────────┬────────────┘          └──────────────┬──────────────┘  │
│               │                                      │                 │
│               └──────────► chrome.storage.local ◄────┘                 │
└──────────────────────────────────────┬─────────────────────────────────┘
                                       │ HTTP POST /api/generate
                                       │ (JSON Schema format)
                                       ▼
                            ┌─────────────────────┐
                            │ Local Ollama Daemon │
                            │ (e.g. gemma4:e4b)   │
                            │  127.0.0.1:11434    │
                            └─────────────────────┘
```

---

## 3. Complete File & Directory Inventory

```
lexiconic/
├── .agents/                        # AI agent documentation and specialized skills
│   ├── skills/                     # Workspace skills for development workflows
│   │   ├── chrome-extensions/      # MV3 extension development best practices
│   │   └── modern-web-guidance/    # Modern HTML/CSS/JS frontend guidance
│   ├── AGENTS.md                   # Agent entry point and orientation
│   └── PROJECT_STRUCTURE.md        # Comprehensive architecture & file reference (this file)
│
├── background.js                   # MV3 background service worker (Ollama client & ping)
├── content.js                      # In-page content script (DOM observer, badge & UI)
├── styles.css                      # Injected styling for in-page badge, cards & suggestions
├── manifest.json                   # Chrome Extension Manifest V3 configuration
│
├── popup/                          # Extension action popup (toolbar settings UI)
│   ├── popup.html                  # Popup layout (host, model, tones, test area)
│   ├── popup.css                   # Modern styling & theme for toolbar popup
│   └── popup.js                    # Popup logic, connection test, storage persistence
│
├── icons/                          # Application icons in multiple resolutions
│   ├── icon_x16.png                # Toolbar icon (active / color, 16x16)
│   ├── icon_x32.png                # High-DPI toolbar icon (32x32)
│   ├── icon_x48.png                # Extension management icon (48x48)
│   ├── icon_x128.png               # Chrome Web Store & main brand icon (128x128)
│   ├── icon_x256.png               # High-res brand asset (256x256)
│   ├── icon_x500.png               # Promo / store display asset (500x500)
│   ├── icon_gray_x16.png           # Offline toolbar icon (gray, 16x16)
│   ├── icon_gray_x32.png           # Offline toolbar icon (gray, 32x32)
│   ├── icon_gray_x48.png           # Offline toolbar icon (gray, 48x48)
│   ├── icon_gray_x128.png          # Offline toolbar icon (gray, 128x128)
│   └── icon_gray_x256.png          # Offline toolbar icon (gray, 256x256)
│
├── docs/                           # GitHub Pages documentation & landing site
│   ├── index.html                  # Landing page & Ollama setup guide
│   ├── styles.css                  # Responsive styles with brand colors & animations
│   ├── logo.png                    # Brand logo icon (copied from icons/icon_x128.png)
│   ├── favicon.png                 # Browser favicon (256x256)
│   ├── image.png                   # Hero UI screenshot demonstrating suggestions
│   ├── run-ollama.sh               # Startup bash script for Linux / macOS
│   ├── run-ollama.ps1              # Startup PowerShell script for Windows
│   └── run-ollama.bat              # Startup batch script for Windows Command Prompt
│
├── scripts/                        # Automation & build scripts
│   ├── build.js                    # Prepares clean staging build in dist/
│   ├── pack.js                     # Archives dist/ into a release .zip
│   └── validate.js                 # Pre-flight checker for manifest, icons, and MV3 rules
│
├── mock-pages/                     # Test sandbox environments
│   └── test1.html                  # Mock testbed with textareas & contenteditables
│
├── test-lexiconic.html             # Standalone HTML page for manual QA testing
├── CHROMEWEBSTORE.md               # Chrome Web Store listing copy & permission justifications
├── README.MD                       # User-facing README and quickstart guide
├── LICENSE                         # Project license (Apache 2.0)
└── package.json                    # Project scripts & development dependencies
```

---

## 4. Subsystem Deep-Dive

### 4.1. Manifest Configuration (`manifest.json`)
* **Manifest Version:** `3`
* **Permissions:**
  * `storage`: Persists host URL, model name, writing style/tone, and auto-check flags.
  * `alarms`: Schedules regular 30-second connectivity checks in the background worker.
* **Host Permissions:**
  * `http://localhost:11434/*`, `http://127.0.0.1:11434/*`, `http://localhost/*`, `http://127.0.0.1/*`
  * Strictly scoped to local loopback addresses to connect with the local Ollama daemon.
* **Content Scripts:**
  * Matches `<all_urls>` with `run_at: "document_idle"`, injecting `content.js` and `styles.css`.

### 4.2. Service Worker (`background.js`)
* **Dynamic Action Icons:**
  * Regularly polls `GET ${ollamaHost}/api/tags` via `AbortController` (3s timeout).
  * If online: sets icon to `icons/icon_x*.png` (colored) and title to connected.
  * If offline: sets icon to `icons/icon_gray_x*.png` (grayscale) and updates tooltip.
* **Message Routing:**
  * `updateConnectionStatus`: Manually syncs icon status when popup verifies connectivity.
  * `checkText`: Asynchronously executes grammar check and replies to `content.js`.
* **Prompt Engineering:**
  * Zero-temperature generation (`temperature: 0.0`) with `format: "json"`.
  * Injects configured `writingTone` (e.g. professional, friendly, casual) and `writingStyle` (e.g. natural, concise, polished).
  * Strict schema:
    ```json
    {
      "errors": [
        {
          "original": "misspelled word or phrase",
          "replacement": "corrected version",
          "explanation": "short reason"
        }
      ]
    }
    ```

### 4.3. Content Script Engine (`content.js`)
* **Target Detection:**
  * Listens to `focusin`, `input`, `scroll`, and window resize events.
  * Detects standard `<textarea>`, `<input type="text|search|email|url">`, and rich `contenteditable` containers.
  * Dedicated compatibility for **Gmail** (`role="textbox"`, `aria-label="Message Body"`), handling nested block nodes and preserving formatting.
* **Floating Badge:**
  * Appends a discreet Lexiconic badge adjacent to the active input.
  * Displays error count badge or loading spinner.
  * Supports click-to-open manual inspection.
* **Suggestion Popup UI:**
  * Renders a sleek floating card displaying error items.
  * Each card displays the original snippet, recommended replacement, explanation tag, "Apply" button, and "Dismiss" button.
  * Top bar provides a single-click **"Fix All"** action.
* **Text Replacement Engine:**
  * For standard inputs: replaces selection / substring, calculates new cursor positions, and dispatches synthetic `input` and `change` events.
  * For rich contenteditable / Gmail: resolves text nodes, executes replacement while preserving surrounding HTML hierarchy, and triggers input dispatch.

### 4.4. Toolbar Action Popup (`popup/`)
* **Connection Status Card:** Visual indicator showing whether the local Ollama instance is accessible.
* **Host Input:** Default `http://localhost:11434` with test connection button.
* **Model Selector:** Dynamically enumerates models from `/api/tags`, defaulting to recommended `gemma4:e4b`.
* **Tone & Style Dropdowns:** Customizes prompt instructions.
* **Auto-Check Toggle:** Toggles continuous background checking vs. on-demand manual trigger.
* **Interactive Sandbox:** In-popup test textarea for verifying model response immediately.

### 4.5. Documentation Site (`docs/`)
* Hosted via **GitHub Pages**.
* Showcases features, installation steps, and model setup.
* Includes tabbed interactive scripts:
  * `run-ollama.sh` (macOS / Linux)
  * `run-ollama.ps1` (Windows PowerShell)
  * `run-ollama.bat` (Windows Command Prompt)
* Fully responsive layout with brand styling, animated badges, and direct repository links.

---

## 5. Storage Schema (`chrome.storage.local`)

| Key | Type | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `ollamaHost` | `string` | `"http://localhost:11434"` | URL of the local Ollama daemon |
| `ollamaModel` | `string` | `"gemma4:e4b"` | Model tag to invoke for grammar inference |
| `writingTone` | `string` | `"professional"` | Tone preference (`neutral`, `friendly`, `professional`, `formal`, `casual`, `confident`) |
| `writingStyle` | `string` | `"natural"` | Style preference (`natural`, `simple`, `concise`, `polished`, `academic`, `keep`) |
| `autoCheck` | `boolean` | `false` | Whether to automatically run inference as user types |

---

## 6. Build, Test & Validation Commands

All core project tasks are controlled via npm scripts:

```bash
# 1. Pre-flight verification (manifest, MV3 compliance, icons, permissions)
npm run validate

# 2. Stage distribution files into dist/
npm run build

# 3. Create release .zip bundle for Chrome Web Store
npm run pack

# 4. Clean up dist/ build folder
npm run clean
```

---

## 7. Critical Agent Guidelines & Conventions

1. **Manifest V3 Compliance:**
   * No `eval()`, no remote code execution.
   * Service worker cannot use DOM APIs or `window`.
   * Never introduce MV2 keys (`browser_action`, `page_action`, `background.scripts`).
2. **Supported Local Models:**
   * Primary recommended out-of-the-box model: **`gemma4:e4b`**.
   * Note: `llama3.2:1b` was deliberately removed from the project; **do not** re-introduce it.
3. **CORS Requirement:**
   * Ollama requires `OLLAMA_ORIGINS="chrome-extension://*"` or the specific extension ID to accept requests from browser extensions.
   * All startup scripts in `docs/` (`run-ollama.sh`, `run-ollama.ps1`, `run-ollama.bat`) configure this environment variable automatically.
4. **Validation First:**
   * Whenever editing `manifest.json`, icon assets, `background.js`, `content.js`, or `styles.css`, always run `node scripts/validate.js` to ensure zero regressions before completing tasks.
5. **Preserve Documentation Parity:**
   * Any change to supported models, defaults, or setup instructions must be mirrored across `README.MD`, `CHROMEWEBSTORE.md`, and the site in `docs/index.html`.
