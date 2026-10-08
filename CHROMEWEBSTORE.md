# Chrome Web Store Listing: Lexiconic

## Store Listing Copy

**Title:** Lexiconic - Local Grammar & Spellcheck
**Short Description (132 chars):** Private, local AI grammar checker. Fix typos and rewrite text anywhere you type online—from Gmail to Jira and beyond.

**Detailed Description:**
Write with confidence on any website while keeping your data entirely private.

Lexiconic is a local grammar and spell checker that works wherever you type. Whether you are drafting an email in Gmail, updating tasks in Jira, writing a post on LinkedIn, or filling out a web form, Lexiconic catches your typos and polishes your sentences instantly.

Powered by your local Ollama instance, Lexiconic processes your writing directly on your device. You get the benefits of an advanced writing assistant while keeping your personal text entirely offline.

Features:
- **Works Everywhere:** Analyzes text in Gmail, Notion, Slack, Jira, social media, and almost any web form.
- **Complete Privacy:** Operates offline and keeps your data exclusively on your machine.
- **Tone & Style Controls:** Rewrite sentences to sound professional, casual, concise, or friendly.
- **Instant Fixes:** Accept individual suggestions or apply all corrections with one click.
- **Local AI Powered:** Out-of-the-box support for Gemma 4 (gemma4:e4b) through Ollama.

**Search Terms:** spellcheck, grammar, local ai, privacy, writing assistant, email checker, ollama, rewrite

## Version History
- **v0.1.3** (2026-10-06): Added overlay canvas for in-line red squiggly underlines on text offsets, and added tone and style quick-select dropdowns to the suggestion popup header for instant configuration.
- **v0.1.2** (2026-10-05): Added GitHub releases navigation, documentation links, and improved UI styling.
- **v0.1.1** (2026-10-05): Updated popup model selector, refined setup guides and offline mode.
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
