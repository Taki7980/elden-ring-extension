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

// Extract domain from URL for tracking
const getDomain = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
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
    // Initialize visited domains tracking
    chrome.storage.local.set({
      visitedDomains: {}
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

// TAB CLOSE: Only show death overlay if it's the last tab of that domain
chrome.tabs.onRemoved.addListener((closedTabId, removeInfo) => {
  console.log("Tab closed:", closedTabId);
  
  // Get the URL of the closed tab from cache or query remaining tabs
  chrome.tabs.query({}, (allTabs) => {
    // First, try to find if there was a URL associated with this tab
    // We need to check if any remaining tabs have the same domain
    
    // Get all domains from remaining tabs
    const remainingDomains = new Set();
    const tabsByDomain = {};
    
    for (const tab of allTabs || []) {
      if (tab.url && !isRestrictedUrl(tab.url)) {
        const domain = getDomain(tab.url);
        if (domain) {
          remainingDomains.add(domain);
          if (!tabsByDomain[domain]) {
            tabsByDomain[domain] = [];
          }
          tabsByDomain[domain].push(tab);
        }
      }
    }
    
    // Check visited domains to see which domain was closed
    chrome.storage.local.get({ visitedDomains: {}, lastClosedDomain: null }, (data) => {
      const visitedDomains = data.visitedDomains || {};
      
      // Find domains that were visited but no longer have open tabs
      let closedDomain = null;
      for (const domain in visitedDomains) {
        if (!remainingDomains.has(domain)) {
          closedDomain = domain;
          break;
        }
      }
      
      // If we found a closed domain (meaning last tab of that domain was closed)
      if (closedDomain) {
        console.log("Last tab of domain closed:", closedDomain);
        
        // Show death overlay on the currently active tab
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
        
        // Clean up the visited domain since all tabs are closed
        delete visitedDomains[closedDomain];
        chrome.storage.local.set({ visitedDomains });
      } else {
        console.log("Duplicate tab closed, not showing death overlay");
      }
    });
  });
});

// Store tab domain mapping for tracking
const tabDomainMap = new Map();

// Track tab URLs when they load
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.url) {
    const domain = getDomain(tab.url);
    if (domain && !isRestrictedUrl(tab.url)) {
      tabDomainMap.set(tabId, domain);
    }
  }
  
  // Only proceed when navigation completes
  if (changeInfo.status !== "complete") return;
  if (!tab?.url || isRestrictedUrl(tab.url)) return;

  const domain = getDomain(tab.url);
  if (!domain) return;

  // Store domain for this tab
  tabDomainMap.set(tabId, domain);

  // Check if this domain has been visited before
  chrome.storage.local.get({ visitedDomains: {} }, (data) => {
    const visitedDomains = data.visitedDomains || {};
    
    // Check if domain was visited in this session
    if (!visitedDomains[domain]) {
      // First visit to this domain - show grace overlay
      console.log("First visit to domain:", domain);
      
      // Mark domain as visited
      visitedDomains[domain] = Date.now();
      chrome.storage.local.set({ visitedDomains });

      // Inject and show grace
      setTimeout(() => {
        injectIfNeededThenSend(tabId, tab.url, {
          type: "ELDEN_TRIGGER",
          action: "overlay",
          stateKey: "grace"
        });
      }, 150);
    } else {
      // Already visited this domain - just ensure content script is injected
      injectIntoTab(tabId, tab.url);
    }
  });
});

// Alternative approach: Track when tab is actually removed
chrome.tabs.onRemoved.addListener((closedTabId) => {
  // Get the domain of the closed tab
  const closedDomain = tabDomainMap.get(closedTabId);
  
  if (closedDomain) {
    console.log("Tab closed with domain:", closedDomain);
    
    // Check if there are any other tabs with the same domain
    setTimeout(() => {
      chrome.tabs.query({}, (allTabs) => {
        let hasDuplicates = false;
        
        for (const tab of allTabs || []) {
          if (tab.id === closedTabId) continue; // Skip the closed tab
          
          if (tab.url && !isRestrictedUrl(tab.url)) {
            const domain = getDomain(tab.url);
            if (domain === closedDomain) {
              hasDuplicates = true;
              break;
            }
          }
        }
        
        if (!hasDuplicates) {
          console.log("Last tab of domain closed:", closedDomain);
          
          // This was the last tab of this domain - clean up and trigger death
          chrome.storage.local.get({ visitedDomains: {} }, (data) => {
            const visitedDomains = data.visitedDomains || {};
            delete visitedDomains[closedDomain];
            chrome.storage.local.set({ visitedDomains });
          });
        } else {
          console.log("Still have other tabs of this domain open");
        }
        
        // Clean up the mapping
        tabDomainMap.delete(closedTabId);
      });
    }, 50);
  }
});
