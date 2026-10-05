/**
 * popup.js — Lexiconic extension popup logic
 *
 * Responsibilities:
 *  - Load saved Ollama host + model from chrome.storage.local
 *  - Test connectivity and populate model dropdown from /api/tags
 *  - Allow the user to change and persist the host URL and model
 */

const DEFAULT_HOST  = "http://localhost:11434";
const DEFAULT_MODEL = "gemma4:e4b";
const CUSTOM_VALUE  = "__custom__";
const DEFAULT_TONE  = "professional";
const DEFAULT_STYLE = "natural";

const SUPPORTED_MODELS = [
    { id: "gemma4:e4b", label: "gemma4:e4b (Default)" },
    { id: "llama3.2:1b", label: "llama3.2:1b (Fast 1B)" }
];

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

// ── DOM refs ────────────────────────────────────────────────
const statusDot        = document.getElementById("status-dot");
const statusText       = document.getElementById("status-text");
const statusDetail     = document.getElementById("status-detail");
const hostInput        = document.getElementById("host-input");
const btnSave          = document.getElementById("btn-save");
const btnReset         = document.getElementById("btn-reset");
const btnRecheck       = document.getElementById("btn-recheck");
const modelSelect      = document.getElementById("model-select");
const customModelGroup = document.getElementById("custom-model-group");
const customModelInput = document.getElementById("custom-model-input");
const btnSaveModel     = document.getElementById("btn-save-model");
const btnResetModel    = document.getElementById("btn-reset-model");
const autoCheckToggle  = document.getElementById("auto-check-toggle");
const versionLabel     = document.getElementById("version-label");

// Writing style pill groups
const tonePills  = document.getElementById("tone-pills");
const stylePills = document.getElementById("style-pills");

// Setup Guide helpers (inside Connector card)
const extIdVal             = document.getElementById("ext-id-val");
const btnCopyId            = document.getElementById("btn-copy-id");
const osTabs               = document.querySelectorAll(".os-tab");
const commandText          = document.getElementById("command-text");
const btnCopyCmd           = document.getElementById("btn-copy-cmd");
const copyCmdLabel         = document.getElementById("copy-cmd-label");
const specificOriginToggle = document.getElementById("use-specific-origin-toggle");

// Tab navigation
const tabBtnWriting     = document.getElementById("tab-btn-writing");
const tabBtnOllama      = document.getElementById("tab-btn-ollama");
const panelWriting      = document.getElementById("tab-panel-writing");
const panelOllama       = document.getElementById("tab-panel-ollama");
const ollamaTabAsterisk = document.getElementById("ollama-tab-asterisk");

function switchTab(targetTab) {
    const isWriting = targetTab === "writing";
    if (tabBtnWriting) {
        tabBtnWriting.classList.toggle("active", isWriting);
        tabBtnWriting.setAttribute("aria-selected", isWriting ? "true" : "false");
    }
    if (tabBtnOllama) {
        tabBtnOllama.classList.toggle("active", !isWriting);
        tabBtnOllama.setAttribute("aria-selected", !isWriting ? "true" : "false");
    }
    if (panelWriting) panelWriting.hidden = !isWriting;
    if (panelOllama)  panelOllama.hidden  = isWriting;
}

function setOllamaTabError(hasError) {
    if (tabBtnOllama) {
        tabBtnOllama.classList.toggle("has-error", hasError);
        if (hasError) {
            tabBtnOllama.setAttribute("title", "Ollama connection failed — click to configure");
        } else {
            tabBtnOllama.removeAttribute("title");
        }
    }
    if (ollamaTabAsterisk) {
        ollamaTabAsterisk.hidden = !hasError;
    }
}

// Collapsible Setup Guide (inside Ollama Settings tab)
const setupGuideCard      = document.getElementById("setup-guide-card");
const setupGuideToggleBtn = document.getElementById("setup-guide-toggle-btn");
const setupGuideBody      = document.getElementById("setup-guide-body");

function setSetupGuideExpanded(expanded) {
    if (!setupGuideCard || !setupGuideBody) return;
    if (expanded) {
        setupGuideCard.classList.remove("is-collapsed");
        setupGuideBody.hidden = false;
        if (setupGuideToggleBtn) setupGuideToggleBtn.setAttribute("aria-expanded", "true");
    } else {
        setupGuideCard.classList.add("is-collapsed");
        setupGuideBody.hidden = true;
        if (setupGuideToggleBtn) setupGuideToggleBtn.setAttribute("aria-expanded", "false");
    }
}

let currentExtId = chrome.runtime.id || "";
let selectedOS = "mac"; // 'mac' | 'win-ps' | 'win-cmd'

// ── Init ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    const { version } = chrome.runtime.getManifest();
    versionLabel.textContent = `v${version}`;

    // Tab buttons
    if (tabBtnWriting) {
        tabBtnWriting.addEventListener("click", () => switchTab("writing"));
    }
    if (tabBtnOllama) {
        tabBtnOllama.addEventListener("click", () => switchTab("ollama"));
    }

    // Clicking status pill in header opens Ollama Settings tab
    const statusPill = document.getElementById("status-pill");
    if (statusPill) {
        statusPill.style.cursor = "pointer";
        statusPill.addEventListener("click", () => switchTab("ollama"));
    }

    // Accordion toggle click handler for Setup Guide
    if (setupGuideToggleBtn) {
        setupGuideToggleBtn.addEventListener("click", () => {
            const isCurrentlyCollapsed = setupGuideCard.classList.contains("is-collapsed");
            setSetupGuideExpanded(isCurrentlyCollapsed);
        });
    }

    // Pre-fill extension ID
    if (extIdVal) {
        extIdVal.textContent = currentExtId || "unknown";
    }

    // Auto-detect OS for tab pre-selection
    const platform = navigator.userAgent.toLowerCase();
    if (platform.includes("win")) {
        selectedOS = "win-ps";
    } else {
        selectedOS = "mac";
    }
    updateOSTabsUI();
    updateCommandSnippet();

    const { ollamaHost = DEFAULT_HOST } = await chrome.storage.local.get("ollamaHost");
    hostInput.value = ollamaHost;

    const { autoCheck = false } = await chrome.storage.local.get("autoCheck");
    updateAutoCheckUI(autoCheck);

    // Restore tone & style pill selections
    const { writingTone = DEFAULT_TONE } = await chrome.storage.local.get("writingTone");
    const { writingStyle = DEFAULT_STYLE } = await chrome.storage.local.get("writingStyle");
    setPillGroupActive(tonePills, writingTone);
    setPillGroupActive(stylePills, writingStyle);

    // Initial model options setup
    await setModelSelectOffline();

    // Check connection (this will also populate the model list on success)
    await checkConnection(ollamaHost);
});

// ── Host events ──────────────────────────────────────────────
btnSave.addEventListener("click", async () => {
    const host = normalizeHost(hostInput.value);
    hostInput.value = host;
    await chrome.storage.local.set({ ollamaHost: host });
    showToast("Host saved!");
    await checkConnection(host);
});

btnReset.addEventListener("click", async () => {
    hostInput.value = DEFAULT_HOST;
    await chrome.storage.local.set({ ollamaHost: DEFAULT_HOST });
    showToast("Reset to default");
    await checkConnection(DEFAULT_HOST);
});

btnRecheck.addEventListener("click", async () => {
    const { ollamaHost = DEFAULT_HOST } = await chrome.storage.local.get("ollamaHost");
    await checkConnection(ollamaHost);
});

hostInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnSave.click();
});

// ── Model events ─────────────────────────────────────────────
modelSelect.addEventListener("change", () => {
    const isCustom = modelSelect.value === CUSTOM_VALUE;
    customModelGroup.hidden = !isCustom;
    if (isCustom) {
        customModelInput.focus();
    }
});

btnSaveModel.addEventListener("click", async () => {
    const model = resolveSelectedModel();
    if (!model) { showToast("Enter a model name"); return; }
    await chrome.storage.local.set({ ollamaModel: model });
    showToast(`Model saved: ${model}`);
});

btnResetModel.addEventListener("click", async () => {
    await chrome.storage.local.set({ ollamaModel: DEFAULT_MODEL });
    showToast(`Reset to ${DEFAULT_MODEL}`);

    // Re-apply to the select if the default is in the list, else select custom
    const opt = [...modelSelect.options].find((o) => o.value === DEFAULT_MODEL);
    if (opt) {
        modelSelect.value = DEFAULT_MODEL;
        customModelGroup.hidden = true;
    } else {
        modelSelect.value = CUSTOM_VALUE;
        customModelInput.value = DEFAULT_MODEL;
        customModelGroup.hidden = false;
    }
});

customModelInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnSaveModel.click();
});

// ── Onboarding & Commands logic ──────────────────────────────
function getOriginsValue() {
    const useSpecific = specificOriginToggle && specificOriginToggle.checked;
    if (useSpecific && currentExtId) {
        return `chrome-extension://${currentExtId}`;
    }
    return `chrome-extension://*`;
}

function updateCommandSnippet() {
    if (!commandText) return;
    const origin = getOriginsValue();

    if (selectedOS === "mac") {
        commandText.textContent = `OLLAMA_ORIGINS="${origin}" ollama serve`;
    } else if (selectedOS === "win-ps") {
        commandText.textContent = `$env:OLLAMA_ORIGINS="${origin}"; ollama serve`;
    } else if (selectedOS === "win-cmd") {
        commandText.textContent = `set OLLAMA_ORIGINS=${origin} && ollama serve`;
    }
}

function updateOSTabsUI() {
    osTabs.forEach((tab) => {
        const isActive = tab.getAttribute("data-os") === selectedOS;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });
}

osTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        selectedOS = tab.getAttribute("data-os");
        updateOSTabsUI();
        updateCommandSnippet();
    });
});

if (specificOriginToggle) {
    specificOriginToggle.addEventListener("change", () => {
        updateCommandSnippet();
    });
}

if (btnCopyId) {
    btnCopyId.addEventListener("click", async () => {
        if (!currentExtId) return;
        await navigator.clipboard.writeText(currentExtId);
        btnCopyId.textContent = "Copied!";
        showToast("Extension ID copied!");
        setTimeout(() => {
            btnCopyId.textContent = "Copy ID";
        }, 1500);
    });
}

if (btnCopyCmd) {
    btnCopyCmd.addEventListener("click", async () => {
        const cmd = commandText.textContent;
        await navigator.clipboard.writeText(cmd);
        btnCopyCmd.classList.add("copied");
        if (copyCmdLabel) copyCmdLabel.textContent = "Copied to Clipboard!";
        showToast("Startup command copied!");
        setTimeout(() => {
            btnCopyCmd.classList.remove("copied");
            if (copyCmdLabel) copyCmdLabel.textContent = "Copy Command";
        }, 2000);
    });
}

// ── Preferences events ───────────────────────────────────────
function updateAutoCheckUI(isEnabled) {
    if (!autoCheckToggle) return;
    autoCheckToggle.checked = !!isEnabled;

    const statusBadge = document.getElementById("auto-check-status-badge");
    const descOn = document.getElementById("desc-mode-on");
    const descOff = document.getElementById("desc-mode-off");

    if (statusBadge) {
        if (isEnabled) {
            statusBadge.className = "toggle-status-badge on";
            statusBadge.innerHTML = "Enabled &bull; Checks as you type";
        } else {
            statusBadge.className = "toggle-status-badge off";
            statusBadge.innerHTML = "Disabled &bull; Manual check on click";
        }
    }

    if (descOn && descOff) {
        descOn.classList.toggle("is-active", !!isEnabled);
        descOff.classList.toggle("is-active", !isEnabled);
    }
}

autoCheckToggle.addEventListener("change", async () => {
    const isChecked = autoCheckToggle.checked;
    await chrome.storage.local.set({ autoCheck: isChecked });
    updateAutoCheckUI(isChecked);
    showToast(isChecked ? "Auto spell check enabled" : "Auto check disabled (manual mode)");
});

// ── Writing style pill-group events ──────────────────────────
function setPillGroupActive(groupEl, value) {
    if (!groupEl) return;
    for (const pill of groupEl.querySelectorAll(".pill")) {
        const isActive = pill.getAttribute("data-value") === value;
        pill.classList.toggle("active", isActive);
        pill.setAttribute("aria-checked", isActive ? "true" : "false");
    }
}

function initPillGroup(groupEl, storageKey, defaultVal, descriptions = {}) {
    if (!groupEl) return;
    for (const pill of groupEl.querySelectorAll(".pill")) {
        const value = pill.getAttribute("data-value");
        if (value && descriptions[value]) {
            pill.title = descriptions[value];
        }
    }
    groupEl.addEventListener("click", async (e) => {
        const pill = e.target.closest(".pill");
        if (!pill) return;
        const value = pill.getAttribute("data-value");
        setPillGroupActive(groupEl, value);
        await chrome.storage.local.set({ [storageKey]: value });
        showToast(`${storageKey === "writingTone" ? "Tone" : "Style"}: ${value}`);
    });
}

initPillGroup(tonePills, "writingTone", DEFAULT_TONE, toneDescriptions);
initPillGroup(stylePills, "writingStyle", DEFAULT_STYLE, styleDescriptions);

// ── Connection check ─────────────────────────────────────────
async function checkConnection(host) {
    setStatus("checking", "Checking…", "");
    btnRecheck.classList.add("spinning");

    try {
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(`${host}/api/tags`, {
            method: "GET",
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data   = await response.json();
            const models = data?.models ?? [];
            const modelNames = models.map((m) => m.name).slice(0, 3).join(", ");
            const detail = models.length === 0
                ? "Connected — no models pulled yet"
                : `${models.length} model${models.length > 1 ? "s" : ""}: ${modelNames}${models.length > 3 ? "…" : ""}`;
            setStatus("connected", "Connected", detail);
            setSetupGuideExpanded(false);
            setOllamaTabError(false);
            chrome.runtime.sendMessage({ action: "updateConnectionStatus", connected: true }, () => {
                if (chrome.runtime.lastError) {} // Ignore if background is sleeping
            });
            await populateModelSelect(models);
        } else {
            setStatus("error", "🔴 Ollama not detected", `HTTP ${response.status} ${response.statusText} — CORS origin not set?`);
            setSetupGuideExpanded(true);
            setOllamaTabError(true);
            chrome.runtime.sendMessage({ action: "updateConnectionStatus", connected: false }, () => {
                if (chrome.runtime.lastError) {}
            });
            setModelSelectOffline();
        }
    } catch (err) {
        if (err.name === "AbortError") {
            setStatus("error", "🔴 Ollama not detected", `Timed out connecting to ${host} (4s)`);
        } else if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
            setStatus("error", "🔴 Ollama not detected", `CORS blocked or server not running on ${host}`);
        } else {
            setStatus("error", "🔴 Ollama not detected", err.message);
        }
        setSetupGuideExpanded(true);
        setOllamaTabError(true);
        chrome.runtime.sendMessage({ action: "updateConnectionStatus", connected: false }, () => {
            if (chrome.runtime.lastError) {}
        });
        setModelSelectOffline();
    } finally {
        btnRecheck.classList.remove("spinning");
    }
}

// ── Model select helpers ──────────────────────────────────────

/**
 * Populate the model <select> from the Ollama /api/tags response.
 * Preserves the user's currently saved model as the active selection.
 */
async function populateModelSelect(models) {
    const { ollamaModel = DEFAULT_MODEL } = await chrome.storage.local.get("ollamaModel");

    modelSelect.innerHTML = "";

    // 1. Supported out-of-the-box models
    const supportedOptGroup = document.createElement("optgroup");
    supportedOptGroup.label = "Supported Models (OOTB)";
    for (const sm of SUPPORTED_MODELS) {
        const opt = document.createElement("option");
        opt.value = sm.id;
        const isPulled = models.some((m) => m.name === sm.id || m.name.startsWith(sm.id.split(":")[0]));
        opt.textContent = isPulled ? `${sm.label} ✓` : sm.label;
        supportedOptGroup.appendChild(opt);
    }
    modelSelect.appendChild(supportedOptGroup);

    // 2. Other local models detected in Ollama
    const supportedIds = SUPPORTED_MODELS.map((m) => m.id);
    const otherModels = models.filter((m) => !supportedIds.includes(m.name));
    if (otherModels.length > 0) {
        const otherGroup = document.createElement("optgroup");
        otherGroup.label = "Other Local Models";
        for (const m of otherModels) {
            const opt = document.createElement("option");
            opt.value = m.name;
            opt.textContent = m.name;
            otherGroup.appendChild(opt);
        }
        modelSelect.appendChild(otherGroup);
    }

    // 3. User's saved model if not already in the list
    const allKnown = [...supportedIds, ...models.map((m) => m.name)];
    if (!allKnown.includes(ollamaModel) && ollamaModel !== CUSTOM_VALUE) {
        const customSavedGroup = document.createElement("optgroup");
        customSavedGroup.label = "Active Model";
        const opt = document.createElement("option");
        opt.value = ollamaModel;
        opt.textContent = `${ollamaModel} (saved)`;
        customSavedGroup.appendChild(opt);
        modelSelect.appendChild(customSavedGroup);
    }

    // 4. Custom entry option
    const customOpt = document.createElement("option");
    customOpt.value = CUSTOM_VALUE;
    customOpt.textContent = "Custom…";
    modelSelect.appendChild(customOpt);

    // Restore selection
    if ([...modelSelect.options].some((o) => o.value === ollamaModel)) {
        modelSelect.value = ollamaModel;
        customModelGroup.hidden = true;
    } else {
        modelSelect.value = CUSTOM_VALUE;
        customModelInput.value = ollamaModel;
        customModelGroup.hidden = false;
    }

    modelSelect.disabled = false;
}

/** Called when Ollama is unreachable — show supported models and saved selection. */
async function setModelSelectOffline() {
    const { ollamaModel = DEFAULT_MODEL } = await chrome.storage.local.get("ollamaModel");

    modelSelect.innerHTML = "";

    const supportedGroup = document.createElement("optgroup");
    supportedGroup.label = "Supported Models (OOTB)";
    for (const sm of SUPPORTED_MODELS) {
        const opt = document.createElement("option");
        opt.value = sm.id;
        opt.textContent = sm.label;
        supportedGroup.appendChild(opt);
    }
    modelSelect.appendChild(supportedGroup);

    if (!SUPPORTED_MODELS.some((m) => m.id === ollamaModel) && ollamaModel !== CUSTOM_VALUE) {
        const savedGroup = document.createElement("optgroup");
        savedGroup.label = "Active Model";
        const opt = document.createElement("option");
        opt.value = ollamaModel;
        opt.textContent = `${ollamaModel} (saved)`;
        savedGroup.appendChild(opt);
        modelSelect.appendChild(savedGroup);
    }

    const customOpt = document.createElement("option");
    customOpt.value = CUSTOM_VALUE;
    customOpt.textContent = "Custom…";
    modelSelect.appendChild(customOpt);

    if ([...modelSelect.options].some((o) => o.value === ollamaModel)) {
        modelSelect.value = ollamaModel;
        customModelGroup.hidden = true;
    } else {
        modelSelect.value = CUSTOM_VALUE;
        customModelInput.value = ollamaModel;
        customModelGroup.hidden = false;
    }

    modelSelect.disabled = false;
}

/** Returns the model name that should actually be saved. */
function resolveSelectedModel() {
    if (modelSelect.value === CUSTOM_VALUE) {
        return customModelInput.value.trim();
    }
    return modelSelect.value.trim();
}

// ── Generic helpers ───────────────────────────────────────────
function setStatus(state, text, detail) {
    statusDot.className      = `status-dot ${state}`;
    statusText.className     = `status-text ${state === "connected" ? "connected" : state === "error" ? "error" : ""}`;
    statusText.textContent   = text.replace(/^🔴\s*/, "");
    const titleText          = detail ? `${text} — ${detail}` : text;
    statusText.title         = titleText;
    const pill = document.getElementById("status-pill");
    if (pill) pill.title     = titleText;
    if (statusDetail) statusDetail.textContent = detail;
}

function normalizeHost(raw) {
    let host = raw.trim().replace(/\/+$/, "");
    if (!host) return DEFAULT_HOST;
    if (!/^https?:\/\//i.test(host)) host = `http://${host}`;
    return host;
}

let toastTimer;
function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}
