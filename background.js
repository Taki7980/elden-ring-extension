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
  if (reason === "install") {
    chrome.storage.sync.set({
      volume: 0.8,
      customText: "YOU DIED"
    });
  }
  injectAllOpenTabs();
});

chrome.runtime.onStartup.addListener(() => {
  injectAllOpenTabs();
});

// Run once when service worker starts
try {
  injectAllOpenTabs();
} catch {
  // ignore
}

const injectIfNeededThenSend = (tabId, url, message) => {
  if (isRestrictedUrl(url)) return;

  chrome.tabs.sendMessage(tabId, message, () => {
    const err = chrome.runtime.lastError;
    if (!err) return;

    if ((err.message || "").includes("Receiving end does not exist")) {
      chrome.scripting.insertCSS({ target: { tabId }, files: ["style.css"] }, () => {
        void chrome.runtime.lastError;
        chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
          void chrome.runtime.lastError;
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, () => void chrome.runtime.lastError);
          }, 100);
        });
      });
    }
  });
};

// TAB CLOSE: Send message to show overlay and play sound
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log("Tab closed");
  
  // Try to show overlay on remaining tabs in the same window
  if (removeInfo.windowId) {
    chrome.tabs.query({ active: true, windowId: removeInfo.windowId }, (tabs) => {
      const activeTab = tabs?.[0];
      if (activeTab?.id && !isRestrictedUrl(activeTab.url)) {
        setTimeout(() => {
          injectIfNeededThenSend(activeTab.id, activeTab.url, {
            type: "ELDEN_TRIGGER",
            action: "overlay",
            stateKey: "died"
          });
        }, 100);
      }
    });
  }
});

// NEW TAB: Show grace overlay
chrome.tabs.onCreated.addListener((tab) => {
  if (!tab?.id) return;
  const tabId = tab.id;

  console.log("New tab created");

  const cleanupTimer = setTimeout(() => {
    chrome.tabs.onUpdated.removeListener(onUpdated);
  }, 60000);

  const onUpdated = (updatedTabId, changeInfo, updatedTab) => {
    if (updatedTabId !== tabId) return;
    if (changeInfo.status !== "complete") return;

    const url = updatedTab?.url;
    if (isRestrictedUrl(url)) {
      return;
    }

    injectIntoTab(tabId, url);

    clearTimeout(cleanupTimer);
    chrome.tabs.onUpdated.removeListener(onUpdated);

    setTimeout(() => {
      injectIfNeededThenSend(tabId, url, {
        type: "ELDEN_TRIGGER",
        action: "overlay",
        stateKey: "grace"
      });
    }, 150);
  };

  chrome.tabs.onUpdated.addListener(onUpdated);
});
