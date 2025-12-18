// Guard: prevent duplicate initialization
if (globalThis.__eldenOverlayInjected) {
  // Already initialized
} else {
  globalThis.__eldenOverlayInjected = true;

console.log("Elden Overlay: Content script initialized");

/*************************
 * STATES
 *************************/
const STATES = {
  died: {
    text: "YOU DIED",
    color: "#8b0000",
    sound: "died.mp3"
  },
  grace: {
    text: "LOST GRACE FOUND",
    color: "#d4af37",
    sound: "grace.mp3"
  },
  victory: {
    text: "GREAT RUNE RESTORED",
    color: "#d4af37",
    sound: "victory.mp3"
  },
  failed: {
    text: "FOUL TARNISHED",
    color: "#c2a14d",
    sound: "morgott.mp3"
  },
  malenia: {
    text: "I AM MALENIA",
    color: "#b8860b",
    sound: "malenia.mp3"
  }
};

/*************************
 * SETTINGS
 *************************/
let settings = {
  volume: 0.8,
  customText: "YOU DIED"
};

let overlayPending = false;

chrome.storage.sync.get(settings, data => {
  settings = { ...settings, ...data };
  console.log("Elden Overlay: Settings loaded:", settings);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.volume) {
    settings.volume = changes.volume.newValue;
    console.log("Elden Overlay: Volume updated:", settings.volume);
  }
  if (changes.customText) {
    settings.customText = changes.customText.newValue;
    console.log("Elden Overlay: Custom text updated:", settings.customText);
  }
});

// Listen for triggers from background script
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "ELDEN_TRIGGER") return;

  console.log("Elden Overlay: Received trigger:", msg);

  const { action, stateKey, customText } = msg;

  if (action === "overlay") {
    showOverlay(stateKey, customText);
    sendResponse({ ok: true });
    return true;
  }

  sendResponse({ ok: false, error: "unknown_action" });
});

/*************************
 * AUDIO MANAGER - SIMPLIFIED
 *************************/
let audioContext = null;
let audioBuffers = {};

// Initialize Web Audio API (more reliable than Audio elements)
const initAudio = async () => {
  if (audioContext) return;
  
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log("Audio context created");
  } catch (err) {
    console.error("Failed to create audio context:", err);
  }
};

// Load and cache audio file
const loadSound = async (filename) => {
  if (audioBuffers[filename]) {
    return audioBuffers[filename];
  }

  try {
    const url = chrome.runtime.getURL(`sounds/${filename}`);
    console.log("Loading audio from:", url);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    audioBuffers[filename] = audioBuffer;
    console.log("Audio loaded successfully:", filename);
    return audioBuffer;
  } catch (err) {
    console.error("Failed to load audio:", filename, err);
    return null;
  }
};

// Play sound using Web Audio API
const playSound = async (filename) => {
  console.log("Playing sound:", filename);
  
  try {
    await initAudio();
    
    // Resume context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    const buffer = await loadSound(filename);
    if (!buffer) {
      console.error("No buffer for:", filename);
      return;
    }
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    
    const gainNode = audioContext.createGain();
    gainNode.gain.value = settings.volume;
    
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    source.start(0);
    console.log("Sound playing:", filename);
    
  } catch (err) {
    console.error("Error playing sound:", filename, err);
    
    // Fallback to basic Audio element
    try {
      console.log("Trying fallback audio method");
      const audio = new Audio(chrome.runtime.getURL(`sounds/${filename}`));
      audio.volume = settings.volume;
      await audio.play();
      console.log("Fallback audio played");
    } catch (fallbackErr) {
      console.error("Fallback audio also failed:", fallbackErr);
    }
  }
};

/*************************
 * OVERLAY
 *************************/
function showOverlay(stateKey, customText, opts = {}) {
  const state = STATES[stateKey];
  if (!state) {
    console.error("Elden Overlay: Invalid state key:", stateKey);
    return;
  }

  console.log("Elden Overlay: Showing overlay:", stateKey);

  const immediate = Boolean(opts.immediate);

  // Prevent re-entrancy
  if (overlayPending || document.getElementById("elden-overlay")) {
    console.log("Elden Overlay: Already showing, skipping");
    return;
  }
  overlayPending = true;

  // Camera shake on death
  if (stateKey === "died") {
    document.body.style.transition = "transform 0.12s ease";
    document.body.style.transform = "scale(1.01)";
    setTimeout(() => (document.body.style.transform = "scale(1)"), 180);
  }

  const overlay = document.createElement("div");
  overlay.id = "elden-overlay";
  overlay.className = "souls-overlay";
  overlay.dataset.state = stateKey;

  const text = document.createElement("div");
  text.className = "souls-text";
  text.textContent = customText || state.text;
  text.style.color = state.color;

  overlay.appendChild(text);

  // Append to <html> for better fixed positioning
  (document.documentElement || document.body).appendChild(overlay);

  if (immediate) {
    overlay.classList.add("show");
  } else {
    requestAnimationFrame(() => overlay.classList.add("show"));
  }

  // Play sound
  if (state.sound) {
    console.log("Elden Overlay: Playing state sound:", state.sound);
    playSound(state.sound);
  }

  if (immediate) return;

  const visibleMs = stateKey === "grace" ? 2400 : 1800;
  setTimeout(() => {
    overlay.classList.remove("show");
    overlay.classList.add("hide");
    setTimeout(() => {
      overlay.remove();
      overlayPending = false;
      console.log("Elden Overlay: Overlay removed");
    }, 350);
  }, visibleMs);
}

/*************************
 * FORM VALIDATION TRIGGERS
 *************************/
let lastFailedAt = 0;
const failedCooldownMs = 2500;

let failStreak = 0;
let failStreakResetTimer = null;

const triggerFailed = () => {
  const now = Date.now();
  if (now - lastFailedAt < failedCooldownMs) return;
  lastFailedAt = now;

  failStreak += 1;
  if (failStreakResetTimer) clearTimeout(failStreakResetTimer);
  failStreakResetTimer = setTimeout(() => {
    failStreak = 0;
  }, 15000);

  console.log("Elden Overlay: Validation failed, streak:", failStreak);

  // Malenia on 3+ streaks, Morgott normally
  if (failStreak >= 3) {
    showOverlay("malenia");
  } else {
    showOverlay("failed");
  }
};

// HTML5 validation failure
document.addEventListener("invalid", () => {
  console.log("Elden Overlay: Invalid event triggered");
  triggerFailed();
}, true);

// Blur on required fields
document.addEventListener(
  "blur",
  (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
    if (!el.required) return;

    if (typeof el.checkValidity === "function" && !el.checkValidity()) {
      console.log("Elden Overlay: Required field validation failed on blur");
      triggerFailed();
    }
  },
  true
);

/*************************
 * PAGE LEAVE (CLOSE TAB ONLY - NOT RELOAD)
 *************************/
const onLeavingPage = (e) => {
  // Only trigger death overlay if it's an actual navigation away or tab close
  // Don't trigger on page reload
  if (e.type === "beforeunload" && e.returnValue === undefined) {
    // This is likely a reload, not a close
    return;
  }
  
  try {
    console.log("Elden Overlay: Page leaving (tab close), showing death overlay");
    showOverlay("died", settings.customText, { immediate: true });
  } catch (err) {
    console.error("Elden Overlay: Error on page leave:", err);
  }
};

// Only use pagehide for tab close detection (more reliable)
window.addEventListener("pagehide", onLeavingPage);

/*************************
 * GMAIL SEND → VICTORY
 *************************/
document.addEventListener("click", e => {
  if (!location.hostname.includes("mail.google.com")) return;
  if (!(e.target instanceof Element)) return;
  const sendBtn = e.target.closest('div[role="button"][data-tooltip^="Send"]');
  if (sendBtn) {
    console.log("Elden Overlay: Gmail send detected");
    showOverlay("victory");
  }
});

/*************************
 * FORM SUBMIT → VICTORY
 *************************/
document.addEventListener(
  "submit",
  (e) => {
    const form = e.target;

    if (!form.checkValidity()) {
      console.log("Elden Overlay: Form submit blocked - invalid");
      e.preventDefault();
      triggerFailed();
      return;
    }
    
    console.log("Elden Overlay: Form submitted successfully");
    failStreak = 0;
    showOverlay("victory");
  },
  true
);

/*************************
 * NAVIGATION EVENTS
 *************************/
// Back button pressed → Death sound only (no overlay)
window.addEventListener("popstate", () => {
  console.log("Elden Overlay: Back button pressed");
  playSound("died.mp3");
});

/*************************
 * LINK CLICKS → Subtle grace sound
 *************************/
let lastLinkClickAt = 0;
document.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (!link || !link.href) return;
  
  // Ignore same-page anchors
  if (link.href.startsWith("#") || link.getAttribute("href")?.startsWith("#")) return;
  
  // Cooldown to avoid spam
  const now = Date.now();
  if (now - lastLinkClickAt < 1000) return;
  lastLinkClickAt = now;
  
  // Ignore if opens in new tab
  if (link.target === "_blank" || e.ctrlKey || e.metaKey) return;
  
  console.log("Elden Overlay: Navigation link clicked");
  // Quick subtle sound for navigation
  playSound("grace.mp3");
}, true);

/*************************
 * ERROR HANDLING → Failed sound
 *************************/
window.addEventListener("error", (e) => {
  // Only trigger on major script errors, not resource loading
  if (e.error && e.error.stack) {
    console.log("Elden Overlay: JavaScript error detected");
    // Don't show overlay for every error, just play sound
    const now = Date.now();
    if (now - lastFailedAt > 5000) { // 5 second cooldown
      playSound("morgott.mp3");
      lastFailedAt = now;
    }
  }
}, true);

/*************************
 * AJAX/FETCH FAILURES → Morgott sound
 *************************/
let lastNetworkErrorAt = 0;
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  try {
    const response = await originalFetch(...args);
    
    // Trigger on HTTP errors (400, 500, etc)
    if (!response.ok && response.status >= 400) {
      const now = Date.now();
      if (now - lastNetworkErrorAt > 3000) {
        console.log("Elden Overlay: Network error detected:", response.status);
        playSound("morgott.mp3");
        lastNetworkErrorAt = now;
      }
    }
    
    return response;
  } catch (err) {
    const now = Date.now();
    if (now - lastNetworkErrorAt > 3000) {
      console.log("Elden Overlay: Network request failed");
      playSound("morgott.mp3");
      lastNetworkErrorAt = now;
    }
    throw err;
  }
};

/*************************
 * DEBUG KEYS
 *************************/
document.addEventListener("keydown", e => {
  // Shift+Ctrl+D = Test death sound
  if (e.shiftKey && e.ctrlKey && e.key === "D") {
    console.log("Debug: Testing death sound");
    showOverlay("died");
    e.preventDefault();
  }
  // Shift+Ctrl+G = Test grace sound
  if (e.shiftKey && e.ctrlKey && e.key === "G") {
    console.log("Debug: Testing grace sound");
    showOverlay("grace");
    e.preventDefault();
  }
  // Shift+Ctrl+V = Test victory sound
  if (e.shiftKey && e.ctrlKey && e.key === "V") {
    console.log("Debug: Testing victory sound");
    showOverlay("victory");
    e.preventDefault();
  }
  // Shift+Ctrl+F = Test failed sound (Morgott)
  if (e.shiftKey && e.ctrlKey && e.key === "F") {
    console.log("Debug: Testing failed sound");
    showOverlay("failed");
    e.preventDefault();
  }
  // Shift+Ctrl+M = Test Malenia sound
  if (e.shiftKey && e.ctrlKey && e.key === "M") {
    console.log("Debug: Testing Malenia sound");
    showOverlay("malenia");
    e.preventDefault();
  }
});

// Initialize audio on first user interaction
document.addEventListener('click', initAudio, { once: true });
document.addEventListener('keydown', initAudio, { once: true });

} // end guard
