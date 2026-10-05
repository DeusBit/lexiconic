# Chrome Web Store Listing: Lexiconic

## Store Listing Copy

**Title:** Lexiconic - Local Grammar & Spellcheck
**Short Description (132 chars):** Local grammar and spell checker powered by Ollama

**Detailed Description:**
Lexiconic is a privacy-first, locally hosted spell and grammar checking Chrome extension. Powered by Ollama, it analyzes your text entirely on your device—no cloud services, no trackers, and no data leaves your computer.

Features:
- Instant grammar and spell checks on any webpage
- Fully local and private analysis using Ollama models
- Out-of-the-box support for Gemma 4 (gemma4:e4b) and lightweight Llama 3.2 1B (llama3.2:1b)
- Customize tone (e.g. professional, casual, friendly) and style (e.g. natural, concise)
- Fix issues individually or apply all corrections with one click
- Operates offline and guarantees complete data privacy

**Search Terms:** spellcheck, grammar, local ai, privacy, writing assistant

## Version History
- **v0.1.1** (2026-10-05): Added out-of-the-box support for Llama 3.2 1B (`llama3.2:1b`) alongside Gemma 4 (`gemma4:e4b`), updated popup model selector, and refined setup guides.
- **v0.1.0** (2026-10-05): Initial release.

## Privacy & Data Use
**Does this extension collect personal data?** No.
**Does it send data to remote servers?** No, it communicates exclusively with a local Ollama instance running on `localhost` or `127.0.0.1`. All text processing occurs locally on your machine.

## Permissions Justification

**`storage`**
Used to save user preferences, such as the Ollama host URL, preferred language model, writing tone, and writing style settings locally in the browser.

**`alarms`**
Used to periodically check the connection status of the local Ollama server in the background and update the extension icon to indicate whether the AI is currently reachable.

**Host Permissions:**
- `http://localhost:*/*`, `http://127.0.0.1:*/*`, `https://localhost:*/*`, `https://127.0.0.1:*/*`: Required to communicate with the local Ollama API for grammar analysis and to verify connectivity.
- `<all_urls>` (Content Script): Required to inject the grammar check badge and popup UI into all text inputs and content-editable fields across the web so users can analyze their text anywhere they write.
