// Guard: this file may be injected multiple times (service worker sleeps/restarts).
// Prevent duplicate event listeners.
if (globalThis.__eldenOverlayInjected) {
  // Already initialized in this tab.
} else {
  globalThis.__eldenOverlayInjected = true;

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
    // Played from the extension (offscreen) so it works reliably without page gesture.
    sound: null
  },
  victory: {
    text: "GREAT RUNE RESTORED",
    color: "#d4af37",
    sound: "victory.mp3"
  },
  failed: {
    text: "FOUL TARNISHED",
    color: "#c2a14d",
    // Default boss line for failure.
    sound: "morgott.mp3"
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
});

// Allow the popup/background to manually trigger overlays/sounds on the current page.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "ELDEN_TRIGGER") return;

  const { action, stateKey, customText } = msg;

  if (action === "overlay") {
    showOverlay(stateKey, customText);
    sendResponse?.({ ok: true });
    return;
  }

  if (action === "sound") {
    playSound(stateKey);
    sendResponse?.({ ok: true });
    return;
  }

  sendResponse?.({ ok: false, error: "unknown_action" });
});

/*************************
 * HELPERS
 *************************/

const localPlaySound = (file) => {
  try {
    const audio = new Audio(chrome.runtime.getURL(`sounds/${file}`));
    audio.volume = settings.volume;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
};

const playSound = (file) => {
  // Prefer offscreen playback (reliable), but fall back to in-page audio if the
  // service worker/offscreen document isn't available for some reason.
  try {
    chrome.runtime.sendMessage({ type: "PLAY_SOUND", file }, () => {
      if (chrome.runtime.lastError) {
        localPlaySound(file);
      }
    });
  } catch {
    localPlaySound(file);
  }
};

/*************************
 * OVERLAY
 *************************/
function showOverlay(stateKey, customText, opts = {}) {
  const state = STATES[stateKey];
  if (!state) return;

  const immediate = Boolean(opts.immediate);

  // Prevent re-entrancy while we have pending timeouts / an overlay on screen.
  if (overlayPending || document.getElementById("elden-overlay")) return;
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

  // Append to <html> rather than <body> so we're less affected by sites that
  // transform/contain the body (which can break fixed positioning).
  (document.documentElement || document.body).appendChild(overlay);

  // On unload, requestAnimationFrame may never fire. For that case, show instantly.
  if (immediate) {
    overlay.classList.add("show");
  } else {
    requestAnimationFrame(() => overlay.classList.add("show"));
  }

  if (state.sound) playSound(state.sound);

  // During unload, timers may not fire; in that case we just leave it.
  if (immediate) return;

  const visibleMs = stateKey === "grace" ? 2400 : 1800;
  setTimeout(() => {
    overlay.classList.remove("show");
    overlay.classList.add("hide");
    setTimeout(() => {
      overlay.remove();
      overlayPending = false;
    }, 350);
  }, visibleMs);
}

/*************************
 * SOUND TRIGGERS
 *************************/

// Field validation failure (blank required fields, invalid email, etc.)
// This fires on most sites that use native HTML5 validation.
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

  // Use all boss sounds: Morgott usually, Malenia on streaks.
  if (failStreak >= 3) {
    playSound("malenia.mp3");
  } else {
    playSound("morgott.mp3");
  }

  showOverlay("failed");
};

// Field validation failure (blank required fields, invalid email, etc.)
// This fires on most sites that use native HTML5 validation.
document.addEventListener("invalid", () => triggerFailed(), true);

// Also catch "leave blank" on required fields when the user tabs/clicks away.
document.addEventListener(
  "blur",
  (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
    if (!el.required) return;

    // For checkboxes/radios, validity is handled by native constraints; for text-like inputs check value.
    if (typeof el.checkValidity === "function" && !el.checkValidity()) {
      triggerFailed();
    }
  },
  true
);

// On tab close / refresh: best-effort "YOU DIED" overlay on the *current* tab.
// Note: browsers may still not paint during unload in some cases.
const onLeavingPage = () => {
  try {
    showOverlay("died", settings.customText, { immediate: true });
  } catch {
    // ignore
  }
};

window.addEventListener("beforeunload", onLeavingPage);
window.addEventListener("pagehide", onLeavingPage);

// Gmail send → Victory
document.addEventListener("click", e => {
  if (!location.hostname.includes("mail.google.com")) return;
  if (!(e.target instanceof Element)) return;
  const sendBtn = e.target.closest('div[role="button"][data-tooltip^="Send"]');
  if (sendBtn) showOverlay("victory");
});

// Form submit
document.addEventListener(
  "submit",
  (e) => {
    const form = e.target;

    if (!form.checkValidity()) {
      e.preventDefault();
      triggerFailed();
      return;
    }
    failStreak = 0;
    showOverlay("victory");
  },
  true
);

// Debug boss voice keys
document.addEventListener("keydown", e => {
  if (e.key === "M") playSound("malenia.mp3");
  if (e.key === "G") playSound("morgott.mp3");
  if (e.key === "O") playSound("morgott.mp3");
});

} // end guard wrapper
