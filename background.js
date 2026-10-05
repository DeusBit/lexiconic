const COLOR_ICONS = {
    16: "icons/icon_x16.png",
    32: "icons/icon_x32.png",
    48: "icons/icon_x48.png",
    128: "icons/icon_x128.png",
    256: "icons/icon_x256.png"
};

const GRAY_ICONS = {
    16: "icons/icon_gray_x16.png",
    32: "icons/icon_gray_x32.png",
    48: "icons/icon_gray_x48.png",
    128: "icons/icon_gray_x128.png",
    256: "icons/icon_gray_x256.png"
};

let lastConnectionStatus = null;

async function updateExtensionIcon(connected) {
    if (lastConnectionStatus === connected) return;
    lastConnectionStatus = connected;

    const path = connected ? COLOR_ICONS : GRAY_ICONS;
    try {
        await chrome.action.setIcon({ path });
        await chrome.action.setTitle({
            title: connected
                ? "Lexiconic - Local AI Spellcheck (Connected)"
                : "Lexiconic - Ollama not detected (Click for setup)"
        });
    } catch (e) {
        // Ignored if action unavailable
    }
}

async function checkOllamaConnectivity() {
    const { ollamaHost = "http://localhost:11434" } = await chrome.storage.local.get("ollamaHost");
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${ollamaHost}/api/tags`, {
            method: "GET",
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        await updateExtensionIcon(res.ok);
        return res.ok;
    } catch (e) {
        await updateExtensionIcon(false);
        return false;
    }
}

// Check connectivity on startup and alarms
chrome.runtime.onInstalled.addListener(() => {
    checkOllamaConnectivity();
    chrome.alarms.create("checkOllamaAlarm", { periodInMinutes: 0.5 });
});

chrome.runtime.onStartup.addListener(() => {
    checkOllamaConnectivity();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "checkOllamaAlarm") {
        checkOllamaConnectivity();
    }
});

// Check whenever host is updated in storage
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.ollamaHost) {
        checkOllamaConnectivity();
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateConnectionStatus") {
        updateExtensionIcon(Boolean(request.connected));
        sendResponse({ success: true });
        return false;
    }

    if (request.action === "checkText") {
        (async () => {
            try {
                const result = await checkSpelling(request.text);
                updateExtensionIcon(true);
                sendResponse({ success: true, data: result });
            } catch (err) {
                updateExtensionIcon(false);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true; // Keep message channel open for async response
    }
});

const toneDescriptions = {
  neutral: "Neutral and objective",
  friendly: "Warm, approachable, and conversational",
  professional: "Polished, business-appropriate, and respectful",
  formal: "Formal, respectful, and structured",
  casual: "Relaxed, informal, and conversational",
  confident: "Clear, direct, and assertive"
};

const styleDescriptions = {
  natural: "Natural wording that sounds like a fluent native speaker",
  simple: "Clear, straightforward language with simple sentence structures",
  concise: "Brief and direct, removing unnecessary words",
  polished: "Refined and well-structured while preserving the author's voice",
  academic: "Objective, precise, and structured",
  keep: "Make the minimum changes necessary and preserve the author's original style"
};

async function checkSpelling(text) {
    // Read user-configured host + model + style prefs; fall back to defaults
    const {
        ollamaHost   = "http://localhost:11434",
        ollamaModel  = "gemma4:e4b",
        writingTone  = "professional",
        writingStyle = "natural",
    } = await chrome.storage.local.get([
        "ollamaHost", "ollamaModel", "writingTone", "writingStyle"
    ]);

    const toneDesc = toneDescriptions[writingTone] || toneDescriptions.professional;
    const styleDesc = styleDescriptions[writingStyle] || styleDescriptions.natural;

    const prompt = `You are a strict spellcheck and grammar correction engine.
Analyze the input text and detect spelling and grammar issues.
The user's preferred tone is "${writingTone}" (${toneDesc}) and their preferred writing style is "${writingStyle}" (${styleDesc}).
Tailor your replacement suggestions to match that tone and style while preserving the original meaning.
Return ONLY valid JSON matching this schema:
{
  "errors": [
    {
      "original": "misspelled word or phrase",
      "replacement": "corrected version",
      "explanation": "short reason"
    }
  ]
}
Input text: "${text}"`;

    const response = await fetch(`${ollamaHost}/api/generate`, {

        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: ollamaModel,
            prompt: prompt,
            stream: false,
            format: "json",
            options: {
                temperature: 0.0
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();
    try {
        return JSON.parse(data.response);
    } catch (e) {
        return { errors: [] };
    }
}