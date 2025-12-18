const text = document.getElementById("text");
const volume = document.getElementById("volume");
const statusEl = document.getElementById("status");

const setStatus = (msg) => {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  console.log("Popup:", msg);
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

  return await sendToTab(tabId, message);
};

// Load settings
chrome.storage.sync.get(null, (data) => {
  text.value = data.customText || "";
  volume.value = data.volume ?? 0.8;
  console.log("Popup: Settings loaded:", data);
});

// Save settings
document.getElementById("save").onclick = async () => {
  const newSettings = {
    customText: text.value,
    volume: Number(volume.value)
  };
  
  console.log("Popup: Saving settings:", newSettings);
  
  await chrome.storage.sync.set(newSettings);

  setStatus("Settings saved.");
  setTimeout(() => setStatus(""), 1500);
};

const handleRunError = (e) => {
  console.error("Popup: Error:", e);
  
  if (e?.message === "restricted_page") {
    setStatus("This page is restricted. Try a normal website.");
    return;
  }
  setStatus(`Error: ${e?.message || e}`);
};

// Test Grace
document.getElementById("testGrace").onclick = async () => {
  try {
    setStatus("Testing grace...");
    console.log("Popup: Test grace");
    
    await sendToActiveTab({ 
      type: "ELDEN_TRIGGER", 
      action: "overlay", 
      stateKey: "grace"
    });
    
    setStatus("Grace shown!");
    setTimeout(() => setStatus(""), 1500);
  } catch (e) {
    handleRunError(e);
  }
};

// Test You Died
document.getElementById("testDied").onclick = async () => {
  try {
    setStatus("Testing death...");
    console.log("Popup: Test died");
    
    await sendToActiveTab({
      type: "ELDEN_TRIGGER",
      action: "overlay",
      stateKey: "died",
      customText: text.value
    });
    
    setStatus("Death shown!");
    setTimeout(() => setStatus(""), 1500);
  } catch (e) {
    handleRunError(e);
  }
};

// Test Victory
document.getElementById("testVictory").onclick = async () => {
  try {
    setStatus("Testing victory...");
    console.log("Popup: Test victory");
    
    await sendToActiveTab({ 
      type: "ELDEN_TRIGGER", 
      action: "overlay", 
      stateKey: "victory"
    });
    
    setStatus("Victory shown!");
    setTimeout(() => setStatus(""), 1500);
  } catch (e) {
    handleRunError(e);
  }
};

// Test Foul Tarnished
document.getElementById("testFailed").onclick = async () => {
  try {
    setStatus("Testing failed...");
    console.log("Popup: Test failed");
    
    await sendToActiveTab({ 
      type: "ELDEN_TRIGGER", 
      action: "overlay", 
      stateKey: "failed"
    });
    
    setStatus("Failed shown!");
    setTimeout(() => setStatus(""), 1500);
  } catch (e) {
    handleRunError(e);
  }
};

console.log("Popup: Script loaded");
