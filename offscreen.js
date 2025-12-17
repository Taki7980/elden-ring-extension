let currentAudio = null;

const play = async (file, volume = 0.8) => {
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    const audio = new Audio(chrome.runtime.getURL(`sounds/${file}`));
    audio.volume = volume;
    currentAudio = audio;

    await audio.play();
  } catch {
    // ignore
  }
};

chrome.storage.sync.get({ volume: 0.8 }, ({ volume }) => {
  // keep a default volume; updates are read on each play as well.
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "OFFSCREEN_PLAY") return;

  chrome.storage.sync.get({ volume: 0.8 }, ({ volume }) => {
    void play(msg.file, volume);
  });
});
