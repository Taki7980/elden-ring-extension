// Enhanced offscreen.js with detailed logging
console.log("Offscreen document loaded");

const audioCache = {};
let currentAudio = null;

const preloadSounds = async () => {
  const sounds = ["died.mp3", "grace.mp3", "victory.mp3", "malenia.mp3", "morgott.mp3"];
  
  console.log("Starting audio preload...");
  
  for (const sound of sounds) {
    try {
      const url = chrome.runtime.getURL(`sounds/${sound}`);
      console.log(`Preloading: ${sound} from ${url}`);
      
      const audio = new Audio(url);
      audio.preload = "auto";
      
      // Wait for audio to be ready
      await new Promise((resolve, reject) => {
        audio.addEventListener('canplaythrough', () => {
          console.log(`✓ ${sound} loaded successfully`);
          resolve();
        }, { once: true });
        
        audio.addEventListener('error', (e) => {
          console.error(`✗ ${sound} failed to load:`, e, audio.error);
          reject(e);
        }, { once: true });
        
        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
      
      audioCache[sound] = audio;
    } catch (err) {
      console.error(`Failed to preload ${sound}:`, err);
    }
  }
  
  console.log("Audio preload complete. Cached files:", Object.keys(audioCache));
};

// Preload on startup
preloadSounds().catch(err => {
  console.error("Preload failed:", err);
});

const play = async (file, volume = 0.8) => {
  console.log(`Play request: ${file} at volume ${volume}`);
  
  try {
    // Stop current audio if playing
    if (currentAudio) {
      console.log("Stopping current audio");
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    // Use cached audio or create new
    let audio = audioCache[file];
    if (!audio) {
      console.log(`${file} not in cache, creating new Audio`);
      const url = chrome.runtime.getURL(`sounds/${file}`);
      console.log(`Audio URL: ${url}`);
      audio = new Audio(url);
      audioCache[file] = audio;
    }

    // Reset to beginning if already played
    audio.currentTime = 0;
    audio.volume = volume;
    currentAudio = audio;

    console.log(`Playing ${file}...`);
    await audio.play();
    console.log(`✓ ${file} playing successfully`);
    
    // Log when audio ends
    audio.addEventListener('ended', () => {
      console.log(`${file} finished playing`);
    }, { once: true });
    
  } catch (err) {
    console.error(`Audio playback failed for ${file}:`, err);
    console.error("Error details:", {
      name: err.name,
      message: err.message,
      code: err.code
    });
  }
};

// Listen for play requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("Offscreen received message:", msg);
  
  if (!msg || msg.type !== "OFFSCREEN_PLAY") {
    console.log("Message ignored - wrong type");
    return;
  }

  chrome.storage.sync.get({ volume: 0.8 }, ({ volume }) => {
    console.log(`Playing with volume: ${volume}`);
    play(msg.file, volume)
      .then(() => {
        console.log("Play promise resolved");
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error("Play promise rejected:", err);
        sendResponse({ success: false, error: err.message });
      });
  });
  
  return true; // Keep message channel open
});

// Test audio capability on load
setTimeout(() => {
  console.log("Running audio capability test...");
  const testAudio = new Audio(chrome.runtime.getURL("sounds/died.mp3"));
  testAudio.volume = 0.01; // Very quiet test
  testAudio.play()
    .then(() => {
      console.log("✓ Audio test successful - system can play audio");
      testAudio.pause();
    })
    .catch(err => {
      console.error("✗ Audio test failed:", err);
      console.error("This may indicate browser audio restrictions");
    });
}, 1000);

console.log("Offscreen script initialized");
