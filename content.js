// Guard: prevent duplicate initialization
if (globalThis.__eldenOverlayInjected) {
  // Already initialized
} else {
  globalThis.__eldenOverlayInjected = true;

// Check if current page is sensitive (auth, payment, etc.)
const isSensitivePage = () => {
  const url = window.location.href.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  
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
  
  const sensitiveKeywords = [
    'paypal.com',
    'stripe.com',
    'square.com',
    'venmo.com',
    'cashapp.com',
    'coinbase.com',
    'binance.com',
    'kraken.com',
    'accounts.google.com',
    'login.microsoftonline.com',
    'appleid.apple.com',
    'secure.chase.com',
    'secure.bankofamerica.com',
    'online.citi.com',
    'wellsfargo.com',
    'usbank.com',
    'capitalone.com'
  ];
  
  const hasSensitivePattern = sensitivePatterns.some(pattern => pathname.includes(pattern) || url.includes(pattern));
  const hasSensitiveDomain = sensitiveKeywords.some(keyword => url.includes(keyword));
  
  return hasSensitivePattern || hasSensitiveDomain;
};

// Skip initialization if on sensitive page
if (isSensitivePage()) {
  console.log("Elden Overlay: Sensitive page detected, extension disabled for safety");
  // Exit immediately without initializing anything
} else {

console.log("Elden Overlay: Content script initialized");

/*************************
 * DEMOTIVATING TEXTS
 *************************/
const MORGOTT_TEXTS = [
  "UNWORTHY TARNISHED",
  "FOUL TARNISHED",
  "THOU ART UNFIT",
  "PATHETIC ATTEMPT",
  "WOEFUL FAILURE",
  "TRY AGAIN TARNISHED",
  "INSUFFICIENT SKILL",
  "LACKING FORTITUDE",
  "GRACE ELUDES THEE",
  "WEAK ADVERSARY",
  "EMBOLDENED BY FLAME",
  "PUT THESE FOOLISH AMBITIONS TO REST"
];

const MALENIA_TEXTS = [
  "I AM MALENIA",
  "BLADE OF MIQUELLA",
  "KNOW TRUE DEFEAT",
  "I HAVE NEVER KNOWN DEFEAT",
  "YOUR SKILL IS LACKING",
  "FALL BEFORE ME",
  "SCARLET AEONIA BLOOMS",
  "INADEQUATE WARRIOR",
  "BOW TO THE GODDESS",
  "WITNESS TRUE POWER",
  "YOU WILL WITNESS TRUE HORROR",
  "LET YOUR FLESH BE CONSUMED"
];

const getRandomText = (textArray) => {
  return textArray[Math.floor(Math.random() * textArray.length)];
};

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
    text: "SITE OF GRACE DISCOVERED",
    color: "#d4af37",
    sound: "grace.mp3"
  },
  victory: {
    text: "GREAT ENEMY FELLED",
    color: "#d4af37",
    sound: "victory.mp3"
  },
  failed: {
    text: null,
    color: "#c2a14d",
    sound: "morgott.mp3"
  },
  malenia: {
    text: null,
    color: "#b8860b",
    sound: "malenia.mp3"
  }
};

/*************************
 * SETTINGS
 *************************/
let settings = {
  volume: 0.8
};

let overlayPending = false;

chrome.storage.sync.get(settings, data => {
  settings = { ...settings, ...data };
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.volume) {
    settings.volume = changes.volume.newValue;
  }
});

// Listen for triggers from background script
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "ELDEN_TRIGGER") return;

  const { action, stateKey, customText } = msg;

  if (action === "overlay") {
    showOverlay(stateKey, customText);
    sendResponse({ ok: true });
    return true;
  }

  sendResponse({ ok: false, error: "unknown_action" });
});

/*************************
 * OPTIMIZED AUDIO MANAGER
 *************************/
let audioContext = null;
let audioBuffers = {};
let isPreloading = false;
let preloadComplete = false;

const initAudio = async () => {
  if (audioContext) return audioContext;
  
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    console.log("Audio context created:", audioContext.state);
    return audioContext;
  } catch (err) {
    console.error("Failed to create audio context:", err);
    return null;
  }
};

const preloadAllSounds = async () => {
  if (isPreloading || preloadComplete) return;
  isPreloading = true;

  const sounds = ["died.mp3", "grace.mp3", "victory.mp3", "malenia.mp3", "morgott.mp3"];
  
  await initAudio();
  if (!audioContext) return;

  const loadPromises = sounds.map(async (filename) => {
    try {
      const url = chrome.runtime.getURL(`sounds/${filename}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      audioBuffers[filename] = audioBuffer;
      console.log(`✓ Preloaded: ${filename}`);
    } catch (err) {
      console.error(`Failed to preload ${filename}:`, err);
    }
  });

  await Promise.all(loadPromises);
  preloadComplete = true;
  console.log("All audio preloaded successfully");
};

const playSound = async (filename) => {
  try {
    if (!audioContext) {
      await initAudio();
    }
    
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    const buffer = audioBuffers[filename];
    if (!buffer) {
      console.warn(`Sound ${filename} not preloaded, loading now...`);
      const url = chrome.runtime.getURL(`sounds/${filename}`);
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      audioBuffers[filename] = audioBuffer;
      return playSound(filename);
    }
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    
    const gainNode = audioContext.createGain();
    gainNode.gain.value = settings.volume;
    
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    source.start(0);
    console.log(`🔊 Playing: ${filename}`);
    
  } catch (err) {
    console.error(`Error playing sound ${filename}:`, err);
    
    try {
      const audio = new Audio(chrome.runtime.getURL(`sounds/${filename}`));
      audio.volume = settings.volume;
      await audio.play();
    } catch (fallbackErr) {
      console.error("Fallback audio also failed:", fallbackErr);
    }
  }
};

/*************************
 * OPTIMIZED ERDTREE LEAVES
 *************************/
function createErdtreeLeaves() {
  const container = document.createElement("div");
  container.className = "erdtree-leaves-container";
  
  const leafCount = 12 + Math.floor(Math.random() * 5);
  
  for (let i = 0; i < leafCount; i++) {
    const leaf = document.createElement("div");
    leaf.className = "erdtree-leaf";
    
    const left = Math.random() * 100;
    const delay = Math.random() * 4;
    const duration = 7 + Math.random() * 4;
    const size = 0.6 + Math.random() * 0.6;
    
    leaf.style.cssText = `
      left: ${left}%;
      animation-delay: ${delay}s;
      animation-duration: ${duration}s;
      transform: scale(${size});
    `;
    
    container.appendChild(leaf);
  }
  
  return container;
}

/*************************
 * OPTIMIZED OVERLAY
 *************************/
function showOverlay(stateKey, customText, opts = {}) {
  const state = STATES[stateKey];
  if (!state) {
    console.error("Invalid state key:", stateKey);
    return;
  }

  const immediate = Boolean(opts.immediate);

  if (overlayPending || document.getElementById("elden-overlay")) {
    console.log("Overlay already showing, skipping");
    return;
  }
  overlayPending = true;

  if (state.sound) {
    playSound(state.sound);
  }

  if (stateKey === "died") {
    document.body.style.willChange = "transform";
    document.body.style.transition = "transform 0.1s ease";
    document.body.style.transform = "scale(1.01)";
    setTimeout(() => {
      document.body.style.transform = "scale(1)";
      setTimeout(() => {
        document.body.style.willChange = "auto";
      }, 100);
    }, 150);
  }

  const overlay = document.createElement("div");
  overlay.id = "elden-overlay";
  overlay.className = "souls-overlay";
  overlay.dataset.state = stateKey;

  if (stateKey === "grace" || stateKey === "victory") {
    const leaves = createErdtreeLeaves();
    overlay.appendChild(leaves);
  }

  const text = document.createElement("div");
  text.className = "souls-text";
  
  let displayText = customText || state.text;
  if (stateKey === "failed" && !customText) {
    displayText = getRandomText(MORGOTT_TEXTS);
  } else if (stateKey === "malenia" && !customText) {
    displayText = getRandomText(MALENIA_TEXTS);
  }
  
  text.textContent = displayText;
  text.style.color = state.color;

  overlay.appendChild(text);

  const fragment = document.createDocumentFragment();
  fragment.appendChild(overlay);
  (document.documentElement || document.body).appendChild(fragment);

  if (immediate) {
    overlay.classList.add("show");
  } else {
    requestAnimationFrame(() => {
      overlay.classList.add("show");
    });
  }

  if (immediate) {
    setTimeout(() => {
      if (overlay && overlay.parentNode) {
        overlay.remove();
      }
      overlayPending = false;
    }, 100);
    return;
  }

  const visibleMs = stateKey === "grace" ? 2200 : 1600;
  setTimeout(() => {
    if (!overlay || !overlay.parentNode) {
      overlayPending = false;
      return;
    }
    
    overlay.classList.remove("show");
    overlay.classList.add("hide");
    
    setTimeout(() => {
      if (overlay && overlay.parentNode) {
        overlay.remove();
      }
      overlayPending = false;
    }, 300);
  }, visibleMs);
}

/*************************
 * FORM VALIDATION TRIGGERS
 *************************/
let lastFailedAt = 0;
const failedCooldownMs = 2000;

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
  }, 12000);

  console.log("Validation failed, streak:", failStreak);

  if (failStreak >= 3) {
    showOverlay("malenia");
  } else {
    showOverlay("failed");
  }
};

document.addEventListener("invalid", (e) => {
  triggerFailed();
}, { capture: true, passive: true });

document.addEventListener("blur", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
  if (!el.required) return;

  if (typeof el.checkValidity === "function" && !el.checkValidity()) {
    triggerFailed();
  }
}, { capture: true, passive: true });

/*************************
 * PAGE LEAVE - DISABLED (handled by background.js)
 *************************/
// Removed pagehide listener - death screen now only shown via background.js when tab closes

/*************************
 * GMAIL SEND → VICTORY
 *************************/
document.addEventListener("click", e => {
  if (!location.hostname.includes("mail.google.com")) return;
  if (!(e.target instanceof Element)) return;
  const sendBtn = e.target.closest('div[role="button"][data-tooltip^="Send"]');
  if (sendBtn) {
    showOverlay("victory");
  }
}, { passive: true });

/*************************
 * FORM SUBMIT → VICTORY
 *************************/
document.addEventListener("submit", (e) => {
  const form = e.target;

  if (!form.checkValidity()) {
    e.preventDefault();
    triggerFailed();
    return;
  }
  
  failStreak = 0;
  showOverlay("victory");
}, { capture: true });

/*************************
 * NAVIGATION EVENTS - REMOVED
 *************************/
// Don't play sound on navigation - too intrusive

/*************************
 * LINK CLICKS - REMOVED
 *************************/
// Don't play sound on link clicks - grace only shown when explicitly visiting new domains

/*************************
 * ERROR HANDLING
 *************************/
window.addEventListener("error", (e) => {
  if (e.error && e.error.stack) {
    const now = Date.now();
    if (now - lastFailedAt > 4000) {
      playSound("morgott.mp3");
      lastFailedAt = now;
    }
  }
}, { capture: true, passive: true });

/*************************
 * AJAX/FETCH FAILURES
 *************************/
let lastNetworkErrorAt = 0;
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  try {
    const response = await originalFetch(...args);
    
    if (!response.ok && response.status >= 400) {
      const now = Date.now();
      if (now - lastNetworkErrorAt > 2500) {
        playSound("morgott.mp3");
        lastNetworkErrorAt = now;
      }
    }
    
    return response;
  } catch (err) {
    const now = Date.now();
    if (now - lastNetworkErrorAt > 2500) {
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
  if (e.shiftKey && e.ctrlKey && e.key === "D") {
    showOverlay("died");
    e.preventDefault();
  }
  if (e.shiftKey && e.ctrlKey && e.key === "G") {
    showOverlay("grace");
    e.preventDefault();
  }
  if (e.shiftKey && e.ctrlKey && e.key === "V") {
    showOverlay("victory");
    e.preventDefault();
  }
  if (e.shiftKey && e.ctrlKey && e.key === "F") {
    showOverlay("failed");
    e.preventDefault();
  }
  if (e.shiftKey && e.ctrlKey && e.key === "M") {
    showOverlay("malenia");
    e.preventDefault();
  }
});

/*************************
 * INITIALIZATION
 *************************/
const initializeAudio = () => {
  preloadAllSounds();
};

document.addEventListener('click', initializeAudio, { once: true, passive: true });
document.addEventListener('keydown', initializeAudio, { once: true, passive: true });
document.addEventListener('mousemove', initializeAudio, { once: true, passive: true });
document.addEventListener('scroll', initializeAudio, { once: true, passive: true });

setTimeout(preloadAllSounds, 1000);

console.log("Elden Overlay: Initialization complete");

} // end sensitive page check
} // end guard
