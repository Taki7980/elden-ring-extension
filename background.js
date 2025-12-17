const isRestrictedUrl = (url) => {
  if (!url) return true;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("brave://") ||
    url.startsWith("opera://") ||
    url.startsWith("vivaldi://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("view-source:") ||
    url.includes("chrome.google.com/webstore")
  );
};

const injectIntoTab = (tabId, url) => {
  if (isRestrictedUrl(url)) return;

  // Inject CSS + script. Script is guarded to avoid double-initialization.
  chrome.scripting.insertCSS({ target: { tabId }, files: ["style.css"] }, () => {
    void chrome.runtime.lastError;
    chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
      void chrome.runtime.lastError;
    });
  });
};

const injectAllOpenTabs = () => {
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs || []) {
      if (!t?.id) continue;
      injectIntoTab(t.id, t.url);
    }
  });
};

chrome.runtime.onInstalled.addListener(({ reason }) => {
  // Only set defaults on first install; don't wipe user settings on updates.
  if (reason === "install") {
    chrome.storage.sync.set({
      volume: 0.8,
      customText: "YOU DIED"
    });
  }

  // Ensure audio is ready.
  void ensureOffscreen();

  // Ensure the extension works immediately on already-open tabs.
  injectAllOpenTabs();
});

chrome.runtime.onStartup.addListener(() => {
  // Ensure audio is ready.
  void ensureOffscreen();

  // Ensure the extension works after browser restart.
  injectAllOpenTabs();
});

// Also run once when the service worker starts (e.g. after clicking "Reload" in chrome://extensions).
try {
  void ensureOffscreen();
  injectAllOpenTabs();
} catch {
  // ignore
}

const OFFSCREEN_URL = "offscreen.html";

let offscreenCreating = null;

const ensureOffscreen = async () => {
  // Deduplicate concurrent createDocument() calls.
  if (offscreenCreating) return offscreenCreating;

  offscreenCreating = (async () => {
    // MV3: offscreen document used for reliable audio playback.
    try {
      if (chrome.offscreen?.hasDocument) {
        const has = await chrome.offscreen.hasDocument();
        if (has) return;
      }

      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: "Play Elden Ring sounds on tab events reliably."
      });
    } catch {
      // ignore
    }
  })();

  try {
    await offscreenCreating;
  } finally {
    offscreenCreating = null;
  }
};

const playExtensionSound = async (file) => {
  try {
    await ensureOffscreen();
    chrome.runtime.sendMessage({ type: "OFFSCREEN_PLAY", file });
  } catch {
    // ignore
  }
};

// Allow content scripts / popup to request reliable audio.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "PLAY_SOUND") return;
  void playExtensionSound(msg.file);
  sendResponse?.({ ok: true });
});

const injectIfNeededThenSend = (tabId, url, message) => {
  if (isRestrictedUrl(url)) return;

  chrome.tabs.sendMessage(tabId, message, () => {
    const err = chrome.runtime.lastError;
    if (!err) return;

    // If the content script isn't present yet, inject it and retry.
    if ((err.message || "").includes("Receiving end does not exist")) {
      chrome.scripting.insertCSS({ target: { tabId }, files: ["style.css"] }, () => {
        void chrome.runtime.lastError;
        chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
          void chrome.runtime.lastError;
          chrome.tabs.sendMessage(tabId, message, () => void chrome.runtime.lastError);
        });
      });
    }
  });
};

// Note: we can't display an overlay *inside* a tab that's already closing.
// Instead we show it on the remaining active tab in the same window.
chrome.tabs.onRemoved.addListener((_tabId, _removeInfo) => {
  // Always play death sound on close (reliable, even if overlay doesn't paint).
  void playExtensionSound("died.mp3");
});

// On new tab: show "LOST GRACE FOUND" once the tab reaches a *non-restricted* URL.
// (The default New Tab page is chrome:// and can't be scripted.)
chrome.tabs.onCreated.addListener((tab) => {
  if (!tab?.id) return;
  const tabId = tab.id;

  // On every new tab, play grace sound from the extension (works even on chrome://newtab).
  void playExtensionSound("grace.mp3");

  const cleanupTimer = setTimeout(() => {
    chrome.tabs.onUpdated.removeListener(onUpdated);
  }, 60000);

  const onUpdated = (updatedTabId, changeInfo, updatedTab) => {
    if (updatedTabId !== tabId) return;
    if (changeInfo.status !== "complete") return;

    const url = updatedTab?.url;
    if (isRestrictedUrl(url)) {
      // Still on chrome://newtab or another restricted page; keep waiting.
      return;
    }

    // Ensure scripts are present on the new page.
    injectIntoTab(tabId, url);

    clearTimeout(cleanupTimer);
    chrome.tabs.onUpdated.removeListener(onUpdated);

    injectIfNeededThenSend(tabId, url, {
      type: "ELDEN_TRIGGER",
      action: "overlay",
      stateKey: "grace",
      force: true
    });
  };

  chrome.tabs.onUpdated.addListener(onUpdated);
});

