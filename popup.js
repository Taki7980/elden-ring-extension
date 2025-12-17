const text = document.getElementById("text");
const volume = document.getElementById("volume");
const statusEl = document.getElementById("status");

const setStatus = (msg) => {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
};

const getActiveTab = async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] || null;
};

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

const insertCss = (tabId) =>
  new Promise((resolve, reject) => {
    chrome.scripting.insertCSS({ target: { tabId }, files: ["style.css"] }, () => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve();
    });
  });

const execContent = (tabId) =>
  new Promise((resolve, reject) => {
    chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve();
    });
  });

const injectContentScripts = async (tabId) => {
  // Ensure CSS first so the overlay renders styled.
  await insertCss(tabId);
  await execContent(tabId);
};

const sendToTab = (tabId, message) =>
  new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(resp);
    });
  });

const sendToActiveTab = async (message) => {
  const tab = await getActiveTab();
  const tabId = tab?.id;
  if (!tabId) throw new Error("no_active_tab");
  if (isRestrictedUrl(tab.url)) throw new Error("restricted_page");

  try {
    return await sendToTab(tabId, message);
  } catch (e) {
    // Common case: content script not injected yet (or page just loaded).
    if ((e?.message || "").includes("Receiving end does not exist")) {
      await injectContentScripts(tabId);
      return await sendToTab(tabId, message);
    }
    throw e;
  }
};

chrome.storage.sync.get(null, (data) => {
  text.value = data.customText || "";
  volume.value = data.volume ?? 0.8;
});

document.getElementById("save").onclick = async () => {
  await chrome.storage.sync.set({
    customText: text.value,
    volume: Number(volume.value)
  });

  setStatus("Settings saved.");
  setTimeout(() => setStatus(""), 1500);
};

const playSoundFromExtension = (file) => {
  try {
    chrome.runtime.sendMessage({ type: "PLAY_SOUND", file });
  } catch {
    // ignore
  }
};

const handleRunError = (e, opts = {}) => {
  if (e?.message === "restricted_page") {
    if (opts.fallbackSound) {
      playSoundFromExtension(opts.fallbackSound);
      setStatus("This page is restricted — played sound only.");
      setTimeout(() => setStatus(""), 1500);
      return;
    }

    setStatus("This page is restricted by the browser. Open any normal https:// site for overlays.");
    return;
  }
  setStatus(`Could not run on this page. (${e?.message || e})`);
};

document.getElementById("testGrace").onclick = async () => {
  try {
    setStatus("Grace...");
    await sendToActiveTab({ type: "ELDEN_TRIGGER", action: "sound", stateKey: "grace.mp3" });
    setStatus("Grace found.");
    setTimeout(() => setStatus(""), 1500);
  } catch (e) {
    handleRunError(e, { fallbackSound: "grace.mp3" });
  }
};

document.getElementById("testDied").onclick = async () => {
  try {
    setStatus("You Died...");
    await sendToActiveTab({
      type: "ELDEN_TRIGGER",
      action: "overlay",
      stateKey: "died",
      customText: text.value,
      force: true,
    });
    setStatus("");
  } catch (e) {
    // On restricted pages we can't show overlays; play sound only.
    handleRunError(e, { fallbackSound: "died.mp3" });
  }
};

document.getElementById("testVictory").onclick = async () => {
  try {
    setStatus("Victory...");
    await sendToActiveTab({ type: "ELDEN_TRIGGER", action: "overlay", stateKey: "victory", force: true });
    setStatus("");
  } catch (e) {
    handleRunError(e, { fallbackSound: "victory.mp3" });
  }
};

document.getElementById("testFailed").onclick = async () => {
  try {
    setStatus("Foul Tarnished...");
    await sendToActiveTab({ type: "ELDEN_TRIGGER", action: "overlay", stateKey: "failed", force: true });
    setStatus("");
  } catch (e) {
    handleRunError(e, { fallbackSound: "morgott.mp3" });
  }
};
