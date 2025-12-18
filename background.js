const isRestrictedUrl = (url) => {
  if (!url) return true;
  
  const lowerUrl = url.toLowerCase();
  
  // Browser-specific restricted pages
  const browserRestricted = (
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
  
  // Sensitive page patterns (auth, payment, banking, etc.)
  const sensitivePatterns = [
    '/login',
    '/signin',
    '/sign-in',
    '/signup',
    '/sign-up',
    '/register',
    '/auth',
    '/authentication',
    '/oauth',
    '/checkout',
    '/payment',
    '/pay',
    '/billing',
    '/transaction',
    '/transfer',
    '/bank',
    '/wallet',
    '/account/security',
    '/account/password',
    '/password/reset',
    '/verification',
    '/verify',
    '/2fa',
    '/mfa',
    '/confirm',
    '/cart/checkout'
  ];
  
  const hasSensitivePattern = sensitivePatterns.some(pattern => lowerUrl.includes(pattern));
  
  // Sensitive domains (banking, payment processors, crypto)
  const sensitiveDomains = [
    'paypal.com',
    'stripe.com',
    'square.com',
    'venmo.com',
    'cashapp.com',
    'coinbase.com',
    'binance.com',
    'kraken.com',
    'blockchain.com',
    'accounts.google.com',
    'login.microsoftonline.com',
    'appleid.apple.com',
    'secure.chase.com',
    'secure.bankofamerica.com',
    'online.citi.com',
    'wellsfargo.com',
    'usbank.com',
    'capitalone.com',
    'ally.com',
    'schwab.com',
    'fidelity.com',
    'etrade.com',
    'robinhood.com',
    'mint.intuit.com',
    'turbotax.intuit.com',
    'irs.gov',
    'authorize.net',
    'checkout.stripe.com',
    'checkout.paypal.com'
  ];
  
  const hasSensitiveDomain = sensitiveDomains.some(domain => lowerUrl.includes(domain));
  
  return browserRestricted || hasSensitivePattern || hasSensitiveDomain;
};

const isSearchPage = (url) => {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();
    
    const searchEngines = [
      'google',
      'bing',
      'yahoo',
      'duckduckgo',
      'ecosia',
      'brave.com/search',
      'startpage',
      'qwant',
      'yandex',
      'baidu',
      'ask.com',
      'aol.com'
    ];
    
    const isSearchEngine = searchEngines.some(engine => hostname.includes(engine));
    
    const hasSearchParams = urlObj.search.includes('q=') || 
                           urlObj.search.includes('query=') || 
                           urlObj.search.includes('search=') ||
                           pathname.includes('/search');
    
    return isSearchEngine && (hasSearchParams || pathname === '/' || pathname === '');
  } catch {
    return false;
  }
};

const getDomain = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
};

const getFullUrl = (url) => {
  try {
    const urlObj = new URL(url);
    // Return origin + pathname (no query params, no hash)
    return urlObj.origin + urlObj.pathname;
  } catch {
    return null;
  }
};

const getBaseDomain = (url) => {
  try {
    const urlObj = new URL(url);
    // Just return the domain/origin for broader matching
    return urlObj.origin;
  } catch {
    return null;
  }
};

// Check if session has expired (24 hours)
const checkAndResetSession = async () => {
  return new Promise((resolve) => {
    chrome.storage.local.get({ sessionStart: null, visitedDomains: {} }, (data) => {
      const now = Date.now();
      const sessionStart = data.sessionStart;
      const twentyFourHours = 24 * 60 * 60 * 1000;
      
      // If no session start or 24 hours have passed, reset
      if (!sessionStart || (now - sessionStart) >= twentyFourHours) {
        console.log("Session expired or first run, resetting visited domains");
        chrome.storage.local.set({
          sessionStart: now,
          visitedDomains: {}
        }, () => {
          resolve(true); // Session was reset
        });
      } else {
        console.log("Session still valid");
        resolve(false); // Session still valid
      }
    });
  });
};

// REMOVED: Browser history tracking - privacy concern
// We now only track domains in the current 24-hour session
// All tracking data is stored locally and never leaves the browser

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

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    chrome.storage.sync.set({
      volume: 0.8
    });
    chrome.storage.local.set({
      sessionStart: Date.now(),
      visitedDomains: {}
    });
  }
  
  // Check session on install/update
  await checkAndResetSession();
  injectAllOpenTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  // Check session on browser startup
  await checkAndResetSession();
  injectAllOpenTabs();
});

// Check session periodically (every hour)
setInterval(async () => {
  await checkAndResetSession();
}, 60 * 60 * 1000);

try {
  checkAndResetSession().then(() => {
    injectAllOpenTabs();
  });
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

const tabDomainMap = new Map();
const tabNavigationCount = new Map(); // Track navigation events per tab

// Track tab closures and show death screen
chrome.tabs.onRemoved.addListener((closedTabId, removeInfo) => {
  console.log("Tab closed:", closedTabId);
  
  const closedDomain = tabDomainMap.get(closedTabId);
  
  if (!closedDomain) {
    console.log("No domain tracked for this tab");
    tabDomainMap.delete(closedTabId);
    tabNavigationCount.delete(closedTabId);
    return;
  }
  
  console.log("Tab closed with domain:", closedDomain);
  
  // Small delay to ensure tab list is updated
  setTimeout(() => {
    // Check if there are other tabs with the same domain (not full URL)
    chrome.tabs.query({}, (allTabs) => {
      let hasDuplicateTabs = false;
      
      console.log("Checking remaining tabs...");
      for (const tab of allTabs || []) {
        if (tab.id === closedTabId) continue;
        
        if (tab.url && !isRestrictedUrl(tab.url)) {
          const tabDomain = getBaseDomain(tab.url);
          console.log("Comparing:", tabDomain, "with", closedDomain);
          if (tabDomain === closedDomain) {
            hasDuplicateTabs = true;
            console.log("Found duplicate tab with same domain!");
            break;
          }
        }
      }
      
      console.log("Duplicate tabs for this domain:", hasDuplicateTabs ? "YES (not showing death)" : "NO (showing death)");
      
      // Only show death screen if this was the LAST tab with this domain
      if (!hasDuplicateTabs) {
        chrome.storage.local.get({ visitedDomains: {} }, (data) => {
          const visitedDomains = data.visitedDomains || {};
          const domainData = visitedDomains[closedDomain];
          const wasSearchPage = domainData?.isSearch;
          
          console.log("Search page check:", wasSearchPage);
          
          // Show death screen for non-search pages
          if (!wasSearchPage) {
            console.log("Attempting to show death screen...");
            
            // Try to get active tab in the same window
            if (removeInfo.windowId) {
              chrome.tabs.query({ active: true, windowId: removeInfo.windowId }, (tabs) => {
                const activeTab = tabs?.[0];
                console.log("Active tab:", activeTab?.id, activeTab?.url);
                
                if (activeTab?.id && !isRestrictedUrl(activeTab.url)) {
                  console.log("Showing death overlay on tab:", activeTab.id);
                  injectIfNeededThenSend(activeTab.id, activeTab.url, {
                    type: "ELDEN_TRIGGER",
                    action: "overlay",
                    stateKey: "died"
                  });
                } else {
                  console.log("No valid active tab found");
                }
              });
            } else {
              console.log("No window ID available");
            }
          } else {
            console.log("Was a search page, not showing death screen");
          }
        });
      } else {
        console.log("Still have other tabs with same domain open, not showing death screen");
      }
      
      tabDomainMap.delete(closedTabId);
      tabNavigationCount.delete(closedTabId);
    });
  }, 50);
});

// Track page navigation and show grace for new domains only
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Track URL changes for navigation detection
  if (changeInfo.url && tab.url) {
    const baseDomain = getBaseDomain(tab.url);
    if (baseDomain && !isRestrictedUrl(tab.url)) {
      tabDomainMap.set(tabId, baseDomain);
      
      // Increment navigation count for this tab
      const navCount = (tabNavigationCount.get(tabId) || 0) + 1;
      tabNavigationCount.set(tabId, navCount);
      console.log(`Tab ${tabId} navigation count:`, navCount);
    }
  }
  
  if (changeInfo.status !== "complete") return;
  if (!tab?.url || isRestrictedUrl(tab.url)) return;

  const baseDomain = getBaseDomain(tab.url);
  if (!baseDomain) return;

  tabDomainMap.set(tabId, baseDomain);

  const isSearch = isSearchPage(tab.url);
  
  // Get navigation count - if > 1, this is a reload or navigation within same tab
  const navCount = tabNavigationCount.get(tabId) || 0;
  const isReloadOrNavigation = navCount > 1;

  console.log(`Tab ${tabId} - Domain: ${baseDomain}, NavCount: ${navCount}, IsReload: ${isReloadOrNavigation}`);

  // Check and reset session if needed
  await checkAndResetSession();

  chrome.storage.local.get({ visitedDomains: {} }, async (data) => {
    const visitedDomains = data.visitedDomains || {};
    
    // Privacy-safe: Only check current session data (stored locally)
    // No browser history access - respects user privacy
    const wasVisitedInSession = visitedDomains[baseDomain];
    
    // Show grace ONLY if:
    // 1. Not visited in current 24h session (privacy-safe local check)
    // 2. Not a search page
    // 3. NOT a reload or navigation (first load in this tab)
    const shouldShowGrace = !wasVisitedInSession && !isSearch && !isReloadOrNavigation;
    
    if (shouldShowGrace) {
      console.log("NEW DOMAIN discovered (first time in 24h session):", baseDomain);
      
      // Store only domain and timestamp locally - no browsing history collected
      visitedDomains[baseDomain] = {
        timestamp: Date.now(),
        isSearch: isSearch
      };
      chrome.storage.local.set({ visitedDomains });
      
      // Inject scripts first
      injectIntoTab(tabId, tab.url);
      
      // Show grace overlay after a short delay
      setTimeout(() => {
        injectIfNeededThenSend(tabId, tab.url, {
          type: "ELDEN_TRIGGER",
          action: "overlay",
          stateKey: "grace"
        });
      }, 250);
    } else {
      if (isReloadOrNavigation) {
        console.log("Reload or navigation detected, not showing grace:", baseDomain);
      } else {
        console.log("Domain already visited in session:", baseDomain);
      }
      
      // Still mark as visited in session if not already
      if (!wasVisitedInSession) {
        visitedDomains[baseDomain] = {
          timestamp: Date.now(),
          isSearch: isSearch
        };
        chrome.storage.local.set({ visitedDomains });
      }
      
      // Just inject scripts without showing overlay
      injectIntoTab(tabId, tab.url);
    }
  });
});
