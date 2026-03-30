function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class AudioController {
  constructor() {
    this.audioContext = null;
    this.activeOscillators = new Set();
    this.activeAudioElements = new Set();
  }

  get isSupported() {
    return Boolean(window.AudioContext || window.webkitAudioContext);
  }

  ensureContext() {
    if (!this.isSupported) {
      return null;
    }
    if (!this.audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new Ctx();
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => undefined);
    }
    return this.audioContext;
  }

  async play(soundConfig = {}) {
    if (!soundConfig.enabled) {
      return;
    }
    const burstCount = clampNumber(soundConfig.repeatCount, 1, 50, 1);
    const pauseBetweenMs = clampNumber(soundConfig.pauseBetweenMs, 0, 5000, 200);

    for (let i = 0; i < burstCount; i += 1) {
      if (soundConfig.type === "file" && soundConfig.fileUrl) {
        await this.playFileOnce(soundConfig);
      } else {
        await this.playBeep(soundConfig);
      }
      if (i + 1 < burstCount && pauseBetweenMs > 0) {
        await sleep(pauseBetweenMs);
      }
    }
  }

  playBeep(soundConfig = {}) {
    const context = this.ensureContext();
    if (!context) {
      return Promise.resolve();
    }

    const frequency = clampNumber(soundConfig.frequency, 100, 2000, 440);
    const volume = clampNumber(soundConfig.volume, 0, 1, 0.5);
    const durationMs = clampNumber(soundConfig.durationMs, 10, 10000, 260);
    const waveType = ["sine", "square", "triangle", "sawtooth"].includes(soundConfig.waveType)
      ? soundConfig.waveType
      : "sine";

    return new Promise((resolve) => {
      const now = context.currentTime;
      const durationSeconds = durationMs / 1000;
      const osc = context.createOscillator();
      const gain = context.createGain();

      osc.type = waveType;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.01);
      gain.gain.linearRampToValueAtTime(0, now + durationSeconds);

      osc.connect(gain);
      gain.connect(context.destination);
      this.activeOscillators.add(osc);

      osc.onended = () => {
        this.activeOscillators.delete(osc);
        resolve();
      };
      osc.start(now);
      osc.stop(now + durationSeconds);
    });
  }

  playFileOnce(soundConfig = {}) {
    const url = String(soundConfig.fileUrl || "").trim();
    if (!url) {
      return Promise.resolve();
    }

    const volume = clampNumber(soundConfig.volume, 0, 1, 0.5);
    const durationMs = clampNumber(soundConfig.durationMs, 10, 60000, 1000);

    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = volume;
      audio.currentTime = 0;
      this.activeAudioElements.add(audio);

      let timeoutId = null;
      const cleanup = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        audio.pause();
        this.activeAudioElements.delete(audio);
        resolve();
      };

      audio.addEventListener("ended", cleanup, { once: true });
      audio.addEventListener("error", cleanup, { once: true });

      timeoutId = setTimeout(cleanup, durationMs + 120);
      audio.play().catch(cleanup);
    });
  }

  stopAll() {
    this.activeOscillators.forEach((osc) => {
      try {
        osc.stop();
      } catch (_) {
        return undefined;
      }
      return undefined;
    });
    this.activeOscillators.clear();

    this.activeAudioElements.forEach((audio) => {
      audio.pause();
    });
    this.activeAudioElements.clear();
  }
}

window.AudioController = AudioController;
