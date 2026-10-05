/**
 * content.js — Lexiconic In-Page Writing Assistant
 *
 * Attaches a floating extension badge to the active input/textarea/contenteditable field.
 * Allows the user to manually open the suggestion popup to check grammar and spelling
 * across all text, review all suggestions, fix individual issues, or fix all with one click.
 */

(function () {
    let activeElement = null;
    let debounceTimer = null;
    let badgeElement = null;
    let popupElement = null;
    let resizeObserver = null;

    // State cache for the currently active element
    let currentCheckState = {
        lastCheckedText: "",
        isLoading: false,
        errors: [],
        errorMessage: null,
    };

    let autoCheckEnabled = false;
    let isApplyingFix = false;

    // Load initial setting
    chrome.storage.local.get("autoCheck", (data) => {
        autoCheckEnabled = data.autoCheck || false;
    });

    // Listen for changes
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.autoCheck !== undefined) {
            autoCheckEnabled = changes.autoCheck.newValue;
            if (!currentCheckState.isLoading && badgeElement) {
                updateBadgeCounter(currentCheckState.errors.length);
            }
        }
    });

    /* ── Eligibility & DOM Extraction ───────────────────────── */

    function isElementVisible(el) {
        if (!el || !document.body.contains(el)) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
            return false;
        }
        return true;
    }

    function getRootEditableElement(el) {
        if (!el || !(el instanceof Element)) return null;

        // Standard inputs
        if (el.tagName === "TEXTAREA") return el;
        if (el.tagName === "INPUT") {
            const type = (el.type || "").toLowerCase();
            return ["text", "search", "url", "email", ""].includes(type) ? el : null;
        }

        // Special check for Gmail compose message body:
        // Role="textbox" with contenteditable, or .Am.editable, or [aria-label="Message Body"]
        const gmailBody = el.closest(
            '[role="textbox"][contenteditable="true"], .Am.editable, [aria-label="Message Body"][contenteditable="true"]'
        );
        if (gmailBody) return gmailBody;

        // General contenteditable container:
        if (el.isContentEditable) {
            let current = el;
            let root = el;
            while (current && current !== document.body && current !== document.documentElement) {
                if (current.isContentEditable) {
                    root = current;
                }
                const ce = current.getAttribute("contenteditable");
                if (ce === "true" || ce === "") {
                    return current;
                }
                current = current.parentElement;
            }
            return root;
        }

        // Check if user clicked a wrapper around a rich text editor or Gmail compose box
        const innerEditable = el.querySelector(
            '[role="textbox"][contenteditable="true"], .Am.editable, [contenteditable="true"]'
        );
        if (innerEditable && isElementVisible(innerEditable)) {
            return innerEditable;
        }

        return null;
    }

    function isEligibleInput(el) {
        return !!getRootEditableElement(el);
    }

    function getElementText(el) {
        if (!el) return "";
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
            return el.value || "";
        }
        if (el.isContentEditable) {
            // For Gmail or rich editors, exclude email signatures from spell checking
            const sig = el.querySelector('[data-smartmail="gmail_signature"], .gmail_signature');
            if (sig) {
                const clone = el.cloneNode(true);
                const cloneSig = clone.querySelector('[data-smartmail="gmail_signature"], .gmail_signature');
                const clonePrefix = clone.querySelector('.gmail_signature_prefix');
                if (cloneSig) cloneSig.remove();
                if (clonePrefix) clonePrefix.remove();
                return clone.innerText || "";
            }
            return el.innerText || "";
        }
        return el.value || el.innerText || "";
    }

    function setElementText(el, newText) {
        if (!el) return;
        if (el.isContentEditable) {
            // For contenteditable with Gmail signature, preserve signature elements completely
            const sig = el.querySelector('[data-smartmail="gmail_signature"], .gmail_signature');
            const prefix = el.querySelector('.gmail_signature_prefix');
            if (sig || prefix) {
                const nodesToRemove = [];
                for (const child of Array.from(el.childNodes)) {
                    if (child === sig || child === prefix || child.contains?.(sig) || child.contains?.(prefix)) {
                        continue;
                    }
                    nodesToRemove.push(child);
                }
                for (const child of nodesToRemove) {
                    child.remove();
                }
                const textContainer = document.createElement("div");
                textContainer.textContent = newText;
                el.insertBefore(textContainer, prefix || sig);
            } else {
                el.innerText = newText;
            }
        } else {
            // Support React / synthetic events by dispatching via prototype setter
            const valueSetter = Object.getOwnPropertyDescriptor(el, "value")?.set;
            const prototype = Object.getPrototypeOf(el);
            const protoSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
            if (protoSetter && valueSetter !== protoSetter) {
                protoSetter.call(el, newText);
            } else if (valueSetter) {
                valueSetter.call(el, newText);
            } else {
                el.value = newText;
            }
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function normalizeWhitespaceAndQuotes(str) {
        if (!str) return "";
        return str
            .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ")
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
    }

    function isSignatureOrQuoteNode(node) {
        if (!node) return false;
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (!el) return false;
        return !!el.closest('[data-smartmail="gmail_signature"], .gmail_signature, .gmail_signature_prefix, .gmail_quote');
    }

    function performRangeReplacement(rootEl, startNode, startOffset, endNode, endOffset, replacement) {
        try {
            rootEl.focus();

            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);

            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            let execSuccess = false;
            try {
                execSuccess = document.execCommand("insertText", false, replacement);
            } catch (e) {
                execSuccess = false;
            }

            if (!execSuccess) {
                range.deleteContents();
                const newTextNode = document.createTextNode(replacement);
                range.insertNode(newTextNode);
                range.setStartAfter(newTextNode);
                range.setEndAfter(newTextNode);
                selection.removeAllRanges();
                selection.addRange(range);
            }

            rootEl.dispatchEvent(new Event("input", { bubbles: true }));
            rootEl.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
        } catch (e) {
            console.warn("Lexiconic: Error during contenteditable replacement:", e);
            return false;
        }
    }

    function replaceTextInContentEditable(rootEl, original, replacement) {
        if (!rootEl || !original) return false;

        // Walk all text nodes inside rootEl, strictly ignoring signatures and quotes
        const walker = document.createTreeWalker(
            rootEl,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (isSignatureOrQuoteNode(node)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const textNodes = [];
        let n;
        while ((n = walker.nextNode())) {
            textNodes.push(n);
        }

        if (textNodes.length === 0) return false;

        // Pass 1: Exact search within a single text node
        for (const node of textNodes) {
            const val = node.nodeValue || "";
            const idx = val.indexOf(original);
            if (idx !== -1) {
                return performRangeReplacement(rootEl, node, idx, node, idx + original.length, replacement);
            }
        }

        // Pass 2: Normalized search within a single text node (whitespace & smart quotes)
        const normOriginal = normalizeWhitespaceAndQuotes(original).trim();
        for (const node of textNodes) {
            const val = node.nodeValue || "";
            const normVal = normalizeWhitespaceAndQuotes(val);
            const idx = normVal.indexOf(normOriginal);
            if (idx !== -1) {
                return performRangeReplacement(rootEl, node, idx, node, idx + normOriginal.length, replacement);
            }
        }

        // Pass 3: Multi-node search across text nodes (handles phrases split across nodes or tags)
        let fullText = "";
        const charMap = []; // Maps each character index in fullText to { node, offset }
        for (const node of textNodes) {
            const val = node.nodeValue || "";
            for (let i = 0; i < val.length; i++) {
                charMap.push({ node, offset: i });
            }
            fullText += val;
        }

        // Match on concatenated text (exact)
        let matchIdx = fullText.indexOf(original);
        let matchLen = original.length;

        // Match on concatenated text (normalized)
        if (matchIdx === -1) {
            const normFull = normalizeWhitespaceAndQuotes(fullText);
            matchIdx = normFull.indexOf(normOriginal);
            matchLen = normOriginal.length;
        }

        // Match on concatenated text (case-insensitive normalized)
        if (matchIdx === -1) {
            const lowerFull = normalizeWhitespaceAndQuotes(fullText).toLowerCase();
            const lowerOrig = normOriginal.toLowerCase();
            matchIdx = lowerFull.indexOf(lowerOrig);
            matchLen = lowerOrig.length;
        }

        if (matchIdx !== -1 && matchIdx + matchLen <= charMap.length) {
            const startPoint = charMap[matchIdx];
            const endPoint = charMap[matchIdx + matchLen - 1];
            return performRangeReplacement(
                rootEl,
                startPoint.node,
                startPoint.offset,
                endPoint.node,
                endPoint.offset + 1,
                replacement
            );
        }

        return false;
    }

    function replaceTextInElement(el, original, replacement) {
        if (!el || !original) return;

        if (el.isContentEditable) {
            const replaced = replaceTextInContentEditable(el, original, replacement);
            if (replaced) return;

            // Never call setElementText() on contentEditable when search fails,
            // as el.innerText = newText wipes out HTML styling, block structure, and email signatures.
            console.warn("Lexiconic: Could not locate text node to safely replace in contentEditable:", original);
            return;
        }

        const text = getElementText(el);
        if (!text) return;
        const newText = text.replace(original, replacement);
        setElementText(el, newText);
    }

    /* ── Badge Creation & Management ────────────────────────── */

    function getOrCreateBadge() {
        if (badgeElement && document.body.contains(badgeElement)) {
            return badgeElement;
        }

        const badge = document.createElement("div");
        badge.id = "ollama-spell-badge";
        badge.className = "ollama-badge lexiconic-input-badge";
        badge.setAttribute("role", "button");
        badge.setAttribute("tabindex", "0");
        badge.setAttribute("aria-label", "Lexiconic AI Grammar Assistant");
        badge.title = "Lexiconic: Click to check grammar";

        // Lexiconic Icon container
        const iconWrap = document.createElement("div");
        iconWrap.className = "lexiconic-badge-icon";
        iconWrap.textContent = "L";

        // Notification counter pill
        const counter = document.createElement("span");
        counter.className = "lexiconic-badge-counter";
        counter.style.display = "none";

        badge.appendChild(iconWrap);
        badge.appendChild(counter);

        // Prevent click from stealing focus from the input field
        badge.addEventListener("mousedown", (e) => {
            e.preventDefault();
        });

        badge.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleSuggestionPopup();
        });

        document.body.appendChild(badge);
        badgeElement = badge;
        return badge;
    }

    function updateBadgeCounter(count) {
        if (!badgeElement) return;
        const counter = badgeElement.querySelector(".lexiconic-badge-counter");
        if (!counter) return;

        if (count > 0) {
            counter.textContent = count > 9 ? "9+" : String(count);
            counter.style.display = "flex";
            badgeElement.classList.add("has-errors");
            badgeElement.classList.remove("is-clean");
            badgeElement.title = `Lexiconic: ${count} issue${count > 1 ? "s" : ""} found. Click to review`;
        } else {
            counter.style.display = "none";
            badgeElement.classList.remove("has-errors");
            if (currentCheckState.lastCheckedText && !currentCheckState.isLoading) {
                badgeElement.classList.add("is-clean");
                badgeElement.title = "Lexiconic: All good! Click to check text";
            } else {
                badgeElement.classList.remove("is-clean");
                badgeElement.title = autoCheckEnabled
                    ? "Lexiconic: Click to check grammar"
                    : "Click to run spell check manually on the whole input value and show all suggestions";
            }
        }
    }

    function setBadgeLoading(loading) {
        if (!badgeElement) return;
        if (loading) {
            badgeElement.classList.add("is-loading");
            badgeElement.title = "Lexiconic: Checking text with Ollama...";
        } else {
            badgeElement.classList.remove("is-loading");
        }
    }

    function updateBadgePosition() {
        if (!activeElement || !badgeElement) return;
        if (!isElementVisible(activeElement)) {
            hideBadge();
            return;
        }

        const rect = activeElement.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            hideBadge();
            return;
        }

        const badgeWidth = badgeElement.offsetWidth || 30;
        const badgeHeight = badgeElement.offsetHeight || 30;
        const isSingleLine = rect.height <= 44;

        // Clip against scrollable parent containers (such as Gmail's compose body scroll container)
        let visibleBottom = rect.bottom;
        let visibleRight = rect.right;
        let parent = activeElement.parentElement;
        while (parent && parent !== document.body && parent !== document.documentElement) {
            const style = window.getComputedStyle(parent);
            const overflowY = style.overflowY;
            const overflowX = style.overflowX;
            if (
                overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden" ||
                overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden"
            ) {
                const parentRect = parent.getBoundingClientRect();
                if (parentRect.height > 0 && parentRect.width > 0) {
                    visibleBottom = Math.min(visibleBottom, parentRect.bottom);
                    visibleRight = Math.min(visibleRight, parentRect.right);
                }
            }
            parent = parent.parentElement;
        }

        let top, left;
        if (isSingleLine) {
            top = rect.top + (rect.height - badgeHeight) / 2;
            left = visibleRight - badgeWidth - 6;
        } else {
            top = visibleBottom - badgeHeight - 8;
            left = visibleRight - badgeWidth - 8;
        }

        // Keep inside viewport bounds
        top = Math.max(6, Math.min(window.innerHeight - badgeHeight - 6, top));
        left = Math.max(6, Math.min(window.innerWidth - badgeWidth - 6, left));

        badgeElement.style.top = `${Math.round(top)}px`;
        badgeElement.style.left = `${Math.round(left)}px`;
        badgeElement.style.display = "flex";

        if (popupElement && popupElement.style.display !== "none") {
            updatePopupPosition();
        }
    }

    function showBadgeForElement(el) {
        const rootEl = getRootEditableElement(el);
        if (!rootEl || !isElementVisible(rootEl)) return;

        const isDifferent = activeElement !== rootEl;
        activeElement = rootEl;

        if (isDifferent) {
            currentCheckState = {
                lastCheckedText: "",
                isLoading: false,
                errors: [],
                errorMessage: null,
            };
            updateBadgeCounter(0);
        }

        if (resizeObserver) {
            resizeObserver.disconnect();
        }
        if (window.ResizeObserver) {
            resizeObserver = new ResizeObserver(() => {
                updateBadgePosition();
            });
            resizeObserver.observe(activeElement);
            if (activeElement.parentElement) {
                resizeObserver.observe(activeElement.parentElement);
            }
        }

        getOrCreateBadge();
        updateBadgePosition();
    }

    function hideBadge() {
        if (badgeElement) {
            badgeElement.style.display = "none";
        }
        closeSuggestionPopup();
    }

    /* ── Popup Creation & Management ────────────────────────── */

    function getOrCreatePopup() {
        if (popupElement && document.body.contains(popupElement)) {
            return popupElement;
        }

        const popup = document.createElement("div");
        popup.id = "lexiconic-suggestion-popup";
        popup.className = "lexiconic-popup-card";
        popup.style.display = "none";

        // Prevent clicks inside popup from stealing focus
        popup.addEventListener("mousedown", (e) => {
            e.preventDefault();
        });

        // Header
        const header = document.createElement("div");
        header.className = "lexiconic-popup-header";

        const brand = document.createElement("div");
        brand.className = "lexiconic-popup-brand";

        const brandIcon = document.createElement("div");
        brandIcon.className = "lexiconic-popup-brand-icon";
        brandIcon.textContent = "L";

        const brandInfo = document.createElement("div");
        brandInfo.className = "lexiconic-popup-brand-info";

        const brandTitle = document.createElement("div");
        brandTitle.className = "lexiconic-popup-title";
        brandTitle.textContent = "Lexiconic Suggestions";

        const brandSubtitle = document.createElement("div");
        brandSubtitle.className = "lexiconic-popup-subtitle";
        brandSubtitle.textContent = "Local AI Spellcheck";

        brandInfo.appendChild(brandTitle);
        brandInfo.appendChild(brandSubtitle);
        brand.appendChild(brandIcon);
        brand.appendChild(brandInfo);

        const headerActions = document.createElement("div");
        headerActions.className = "lexiconic-popup-header-actions";

        const recheckBtn = document.createElement("button");
        recheckBtn.className = "lexiconic-btn-icon";
        recheckBtn.title = "Re-check grammar";
        recheckBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
            </svg>
        `;
        recheckBtn.addEventListener("click", () => {
            runGrammarCheck(true);
        });

        const closeBtn = document.createElement("button");
        closeBtn.className = "lexiconic-btn-icon lexiconic-close-btn";
        closeBtn.title = "Close popup";
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", () => {
            closeSuggestionPopup();
        });

        headerActions.appendChild(recheckBtn);
        headerActions.appendChild(closeBtn);
        header.appendChild(brand);
        header.appendChild(headerActions);

        // Body / Content area
        const body = document.createElement("div");
        body.className = "lexiconic-popup-body";

        // Footer
        const footer = document.createElement("div");
        footer.className = "lexiconic-popup-footer";

        const footerLeft = document.createElement("span");
        footerLeft.className = "lexiconic-popup-status-pill";
        footerLeft.textContent = "Local & Private";

        const fixAllBtn = document.createElement("button");
        fixAllBtn.className = "lexiconic-btn-fix-all";
        fixAllBtn.textContent = "Fix All";
        fixAllBtn.style.display = "none";
        fixAllBtn.addEventListener("mousedown", (e) => {
            e.preventDefault();
        });
        fixAllBtn.addEventListener("click", () => {
            applyAllFixes();
        });

        footer.appendChild(footerLeft);
        footer.appendChild(fixAllBtn);

        popup.appendChild(header);
        popup.appendChild(body);
        popup.appendChild(footer);

        document.body.appendChild(popup);
        popupElement = popup;
        return popup;
    }

    function updatePopupPosition() {
        if (!popupElement || !badgeElement || !activeElement) return;

        const badgeRect = badgeElement.getBoundingClientRect();
        const popupWidth = 320;
        const estimatedHeight = 300;

        // Determine if there's enough space below the badge
        const spaceBelow = window.innerHeight - badgeRect.bottom;
        let top, left;

        if (spaceBelow >= estimatedHeight + 10 || badgeRect.top < estimatedHeight + 10) {
            // Position below badge
            top = badgeRect.bottom + 8;
        } else {
            // Position above badge
            top = badgeRect.top - estimatedHeight - 8;
        }

        // Align right edge with badge right edge
        left = badgeRect.right - popupWidth;

        // Keep inside viewport bounds
        left = Math.max(10, Math.min(window.innerWidth - popupWidth - 10, left));
        top = Math.max(10, Math.min(window.innerHeight - estimatedHeight - 10, top));

        popupElement.style.top = `${Math.round(top)}px`;
        popupElement.style.left = `${Math.round(left)}px`;
    }

    function openSuggestionPopup() {
        if (!activeElement) return;
        const popup = getOrCreatePopup();
        popup.style.display = "flex";
        updatePopupPosition();

        const currentText = getElementText(activeElement);
        // If text has changed or we never checked yet, run grammar check
        if (currentText !== currentCheckState.lastCheckedText || currentCheckState.errors.length === 0) {
            runGrammarCheck(false);
        } else {
            renderPopupContent();
        }
    }

    function closeSuggestionPopup() {
        if (popupElement) {
            popupElement.style.display = "none";
        }
    }

    function toggleSuggestionPopup() {
        if (popupElement && popupElement.style.display !== "none") {
            closeSuggestionPopup();
        } else {
            openSuggestionPopup();
        }
    }

    /* ── Grammar Checking Execution ─────────────────────────── */

    function runGrammarCheck(force) {
        if (!activeElement) return;
        const text = getElementText(activeElement);

        if (!text || text.trim().length < 5) {
            currentCheckState.lastCheckedText = text;
            currentCheckState.isLoading = false;
            currentCheckState.errors = [];
            currentCheckState.errorMessage = null;
            updateBadgeCounter(0);
            renderPopupContent();
            return;
        }

        if (!force && text === currentCheckState.lastCheckedText && !currentCheckState.isLoading) {
            renderPopupContent();
            return;
        }

        currentCheckState.lastCheckedText = text;
        currentCheckState.isLoading = true;
        currentCheckState.errorMessage = null;
        setBadgeLoading(true);
        renderPopupContent();

        chrome.runtime.sendMessage(
            { action: "checkText", text: text },
            (response) => {
                currentCheckState.isLoading = false;
                setBadgeLoading(false);

                if (chrome.runtime.lastError) {
                    currentCheckState.errorMessage = chrome.runtime.lastError.message;
                    currentCheckState.errors = [];
                    updateBadgeCounter(0);
                    renderPopupContent();
                    return;
                }

                if (response && response.success) {
                    const errors = response.data?.errors || [];
                    currentCheckState.errors = errors;
                    currentCheckState.errorMessage = null;
                    updateBadgeCounter(errors.length);
                } else {
                    currentCheckState.errorMessage = response?.error || "Could not reach Ollama server.";
                    currentCheckState.errors = [];
                    updateBadgeCounter(0);
                }
                renderPopupContent();
            }
        );
    }

    /* ── Render Popup UI State ──────────────────────────────── */

    function renderPopupContent() {
        if (!popupElement || popupElement.style.display === "none") return;

        const body = popupElement.querySelector(".lexiconic-popup-body");
        const fixAllBtn = popupElement.querySelector(".lexiconic-btn-fix-all");
        const statusPill = popupElement.querySelector(".lexiconic-popup-status-pill");
        if (!body) return;

        // Clear existing content safely
        while (body.firstChild) {
            body.removeChild(body.firstChild);
        }

        const text = activeElement ? getElementText(activeElement) : "";

        // 1. Text is empty or too short
        if (!text || text.trim().length < 5) {
            if (fixAllBtn) fixAllBtn.style.display = "none";
            if (statusPill) statusPill.textContent = "Ready";

            const emptyCard = document.createElement("div");
            emptyCard.className = "lexiconic-state-card";

            const icon = document.createElement("div");
            icon.className = "lexiconic-state-icon";
            icon.textContent = "✍️";

            const title = document.createElement("div");
            title.className = "lexiconic-state-title";
            title.textContent = "Type to Check Grammar";

            const desc = document.createElement("div");
            desc.className = "lexiconic-state-desc";
            desc.textContent = "Enter at least 5 characters in this field to check spelling and grammar.";

            emptyCard.appendChild(icon);
            emptyCard.appendChild(title);
            emptyCard.appendChild(desc);
            body.appendChild(emptyCard);
            return;
        }

        // 2. Loading state
        if (currentCheckState.isLoading) {
            if (fixAllBtn) fixAllBtn.style.display = "none";
            if (statusPill) statusPill.textContent = "Analyzing…";

            const loadingCard = document.createElement("div");
            loadingCard.className = "lexiconic-state-card";

            const spinner = document.createElement("div");
            spinner.className = "lexiconic-spinner";

            const title = document.createElement("div");
            title.className = "lexiconic-state-title";
            title.textContent = "Checking text with Ollama…";

            const desc = document.createElement("div");
            desc.className = "lexiconic-state-desc";
            desc.textContent = "Analyzing grammar, spelling, and phrasing locally.";

            loadingCard.appendChild(spinner);
            loadingCard.appendChild(title);
            loadingCard.appendChild(desc);
            body.appendChild(loadingCard);
            return;
        }

        // 3. Error state (e.g. Ollama unreachable)
        if (currentCheckState.errorMessage) {
            if (fixAllBtn) fixAllBtn.style.display = "none";
            if (statusPill) statusPill.textContent = "Connection Error";

            const errorCard = document.createElement("div");
            errorCard.className = "lexiconic-state-card lexiconic-card-warning";

            const icon = document.createElement("div");
            icon.className = "lexiconic-state-icon";
            icon.textContent = "⚠️";

            const title = document.createElement("div");
            title.className = "lexiconic-state-title";
            title.textContent = "Connection Failed";

            const desc = document.createElement("div");
            desc.className = "lexiconic-state-desc";
            desc.textContent = currentCheckState.errorMessage;

            const retryBtn = document.createElement("button");
            retryBtn.className = "lexiconic-btn-retry";
            retryBtn.textContent = "Retry Check";
            retryBtn.addEventListener("click", () => {
                runGrammarCheck(true);
            });

            errorCard.appendChild(icon);
            errorCard.appendChild(title);
            errorCard.appendChild(desc);
            errorCard.appendChild(retryBtn);
            body.appendChild(errorCard);
            return;
        }

        // 4. Clean state (0 errors)
        if (currentCheckState.errors.length === 0) {
            if (fixAllBtn) fixAllBtn.style.display = "none";
            if (statusPill) statusPill.textContent = "All Good";

            const cleanCard = document.createElement("div");
            cleanCard.className = "lexiconic-state-card lexiconic-card-clean";

            const icon = document.createElement("div");
            icon.className = "lexiconic-state-icon";
            icon.textContent = "✨";

            const title = document.createElement("div");
            title.className = "lexiconic-state-title";
            title.textContent = "No Issues Found!";

            const desc = document.createElement("div");
            desc.className = "lexiconic-state-desc";
            desc.textContent = "Spelling and grammar look clean.";

            cleanCard.appendChild(icon);
            cleanCard.appendChild(title);
            cleanCard.appendChild(desc);
            body.appendChild(cleanCard);
            return;
        }

        // 5. Suggestions List
        const count = currentCheckState.errors.length;
        if (statusPill) {
            statusPill.textContent = `${count} issue${count > 1 ? "s" : ""}`;
        }
        if (fixAllBtn) {
            fixAllBtn.style.display = "inline-flex";
            fixAllBtn.textContent = count > 1 ? `Fix All (${count})` : "Fix All";
        }

        const listContainer = document.createElement("div");
        listContainer.className = "lexiconic-suggestions-list";

        currentCheckState.errors.forEach((err, index) => {
            const card = document.createElement("div");
            card.className = "lexiconic-suggestion-card";

            const cardHeader = document.createElement("div");
            cardHeader.className = "lexiconic-suggestion-header";

            const badge = document.createElement("span");
            badge.className = "lexiconic-issue-badge";
            badge.textContent = "Suggestion";

            const dismissBtn = document.createElement("button");
            dismissBtn.className = "lexiconic-btn-dismiss";
            dismissBtn.title = "Dismiss suggestion";
            dismissBtn.textContent = "✕";
            dismissBtn.addEventListener("mousedown", (e) => {
                e.preventDefault();
            });
            dismissBtn.addEventListener("click", () => {
                dismissSuggestion(index);
            });

            cardHeader.appendChild(badge);
            cardHeader.appendChild(dismissBtn);

            // Diff row
            const diffRow = document.createElement("div");
            diffRow.className = "lexiconic-diff-row";

            const delTag = document.createElement("span");
            delTag.className = "lexiconic-del";
            delTag.textContent = err.original || "";

            const arrow = document.createElement("span");
            arrow.className = "lexiconic-arrow";
            arrow.textContent = "→";

            const insTag = document.createElement("span");
            insTag.className = "lexiconic-ins";
            insTag.textContent = err.replacement || "";

            diffRow.appendChild(delTag);
            diffRow.appendChild(arrow);
            diffRow.appendChild(insTag);

            card.appendChild(cardHeader);
            card.appendChild(diffRow);

            if (err.explanation) {
                const note = document.createElement("div");
                note.className = "lexiconic-explanation";
                note.textContent = err.explanation;
                card.appendChild(note);
            }

            // Fix button
            const actionRow = document.createElement("div");
            actionRow.className = "lexiconic-action-row";

            const fixBtn = document.createElement("button");
            fixBtn.className = "lexiconic-btn-fix";
            fixBtn.textContent = "Apply Fix";
            fixBtn.addEventListener("mousedown", (e) => {
                e.preventDefault();
            });
            fixBtn.addEventListener("click", () => {
                applySingleFix(index);
            });

            actionRow.appendChild(fixBtn);
            card.appendChild(actionRow);

            listContainer.appendChild(card);
        });

        body.appendChild(listContainer);
    }

    /* ── Actions: Apply Fixes ───────────────────────────────── */

    function applySingleFix(index) {
        if (!activeElement || !currentCheckState.errors[index]) return;
        const err = currentCheckState.errors[index];

        isApplyingFix = true;
        try {
            replaceTextInElement(activeElement, err.original, err.replacement);
            currentCheckState.lastCheckedText = getElementText(activeElement);
        } finally {
            setTimeout(() => {
                isApplyingFix = false;
            }, 60);
        }

        // Remove from list
        currentCheckState.errors.splice(index, 1);
        updateBadgeCounter(currentCheckState.errors.length);
        renderPopupContent();
    }

    function applyAllFixes() {
        if (!activeElement || currentCheckState.errors.length === 0) return;

        isApplyingFix = true;
        try {
            const errorsToFix = [...currentCheckState.errors];
            for (const err of errorsToFix) {
                if (err.original && err.replacement) {
                    replaceTextInElement(activeElement, err.original, err.replacement);
                }
            }
            currentCheckState.lastCheckedText = getElementText(activeElement);
        } finally {
            setTimeout(() => {
                isApplyingFix = false;
            }, 60);
        }

        currentCheckState.errors = [];
        updateBadgeCounter(0);
        renderPopupContent();
    }

    function dismissSuggestion(index) {
        currentCheckState.errors.splice(index, 1);
        updateBadgeCounter(currentCheckState.errors.length);
        renderPopupContent();
    }

    /* ── Global Event Handlers ──────────────────────────────── */

    // Listen to focusin to attach badge immediately when user focuses an editable element
    document.addEventListener("focusin", (e) => {
        const root = getRootEditableElement(e.target);
        if (root && isElementVisible(root)) {
            showBadgeForElement(root);
        }
    }, true);

    // Listen to click to support clicking into Gmail compose wrappers or padding
    document.addEventListener("click", (e) => {
        const root = getRootEditableElement(e.target);
        if (root && isElementVisible(root)) {
            if (activeElement !== root) {
                showBadgeForElement(root);
            } else {
                updateBadgePosition();
            }
        }
    }, true);

    // Typing debounce
    document.addEventListener("input", (e) => {
        if (isApplyingFix) return;

        const root = getRootEditableElement(e.target);
        if (!root) return;

        if (activeElement !== root) {
            showBadgeForElement(root);
        } else {
            updateBadgePosition();
        }

        if (!autoCheckEnabled) {
            currentCheckState.lastCheckedText = "";
            currentCheckState.errors = [];
            currentCheckState.errorMessage = null;
            updateBadgeCounter(0);
            if (popupElement && popupElement.style.display !== "none") {
                renderPopupContent();
            }
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const text = getElementText(root);
            if (!text || text.trim().length < 5) {
                currentCheckState.errors = [];
                updateBadgeCounter(0);
                if (popupElement && popupElement.style.display !== "none") {
                    renderPopupContent();
                }
                return;
            }

            // Run check in background so badge counter updates
            setBadgeLoading(true);
            chrome.runtime.sendMessage(
                { action: "checkText", text: text },
                (response) => {
                    setBadgeLoading(false);
                    if (chrome.runtime.lastError) return;
                    if (response && response.success && Array.isArray(response.data?.errors)) {
                        currentCheckState.errors = response.data.errors;
                        currentCheckState.lastCheckedText = text;
                        updateBadgeCounter(response.data.errors.length);
                    } else {
                        currentCheckState.errors = [];
                        updateBadgeCounter(0);
                    }
                    if (popupElement && popupElement.style.display !== "none") {
                        renderPopupContent();
                    }
                }
            );
        }, 1000);
    }, true);

    // Keep badge aligned during window scroll and resize
    window.addEventListener("scroll", updateBadgePosition, true);
    window.addEventListener("resize", updateBadgePosition, true);

    // Close popup and hide badge if user clicks outside of active input, badge, and popup
    document.addEventListener("pointerdown", (e) => {
        const target = e.target;
        const clickedRoot = getRootEditableElement(target);
        const clickedInput = activeElement && (
            activeElement === target ||
            activeElement.contains(target) ||
            (clickedRoot && clickedRoot === activeElement)
        );
        const clickedBadge = badgeElement && (badgeElement === target || badgeElement.contains(target));
        const clickedPopup = popupElement && (popupElement === target || popupElement.contains(target));

        if (!clickedInput && !clickedBadge && !clickedPopup) {
            closeSuggestionPopup();
            // If another input wasn't clicked, we can hide the badge
            if (!clickedRoot) {
                hideBadge();
                activeElement = null;
            }
        }
    }, true);

    // Close popup on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && popupElement && popupElement.style.display !== "none") {
            closeSuggestionPopup();
        }
    });

    // ── Dynamic Element / Gmail Compose Observer ──────────────
    const domObserver = new MutationObserver((mutations) => {
        if (activeElement && document.body.contains(activeElement) && isElementVisible(activeElement)) {
            updateBadgePosition();
            return;
        }

        const focused = document.activeElement;
        if (focused && focused !== document.body) {
            const root = getRootEditableElement(focused);
            if (root && isElementVisible(root)) {
                showBadgeForElement(root);
                return;
            }
        }

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;

                const composeEl = node.matches && (
                    node.matches('[role="textbox"][contenteditable="true"], .Am.editable, [aria-label="Message Body"][contenteditable="true"]')
                ) ? node : (node.querySelector ? node.querySelector('[role="textbox"][contenteditable="true"], .Am.editable, [aria-label="Message Body"][contenteditable="true"]') : null);

                if (composeEl && isElementVisible(composeEl)) {
                    showBadgeForElement(composeEl);
                    return;
                }
            }
        }
    });

    domObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });

})();