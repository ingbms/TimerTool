const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TIMERS = 5;

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function isValidHHMM(value) {
  if (typeof value !== "string") {
    return false;
  }
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value.trim());
}

function setTimeOnDate(baseEpochMs, hhmm) {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) {
    return baseEpochMs;
  }
  const result = new Date(baseEpochMs);
  result.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return result.getTime();
}

function formatNumberWithFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultSoundConfig() {
  return {
    enabled: true,
    type: "beep",
    fileUrl: "",
    frequency: 440,
    waveType: "sine",
    volume: 0.5,
    durationMs: 320,
    repeatCount: 2,
    pauseBetweenMs: 140,
  };
}

function normalizeTimerConfig(rawConfig = {}, id = 0) {
  const soundRaw = rawConfig.sound || {};
  const config = {
    id,
    name: String(rawConfig.name || `Timer ${id + 1}`).trim().slice(0, 30) || `Timer ${id + 1}`,
    mode: rawConfig.mode === "schedule" ? "schedule" : "countdown",
    durationMs: clampNumber(rawConfig.durationMs, 1000, DAY_MS, 5 * 60 * 1000),
    scheduleStart: isValidHHMM(rawConfig.scheduleStart) ? rawConfig.scheduleStart : "11:00",
    intervalMs: clampNumber(rawConfig.intervalMs, 1000, DAY_MS, 5 * 60 * 1000),
    offsetBeforeMs: clampNumber(rawConfig.offsetBeforeMs, 0, 60 * 60 * 1000, 0),
    endTime: isValidHHMM(rawConfig.endTime) ? rawConfig.endTime : "",
    maxTriggers: clampNumber(rawConfig.maxTriggers, 0, 999, 1),
    sound: {
      ...defaultSoundConfig(),
      ...soundRaw,
      enabled: Boolean(soundRaw.enabled ?? true),
      type: soundRaw.type === "file" ? "file" : "beep",
      fileUrl: String(soundRaw.fileUrl || "").trim(),
      frequency: clampNumber(soundRaw.frequency, 100, 2000, 440),
      waveType: ["sine", "square", "triangle", "sawtooth"].includes(soundRaw.waveType)
        ? soundRaw.waveType
        : "sine",
      volume: clampNumber(soundRaw.volume, 0, 1, 0.5),
      durationMs: clampNumber(soundRaw.durationMs, 50, 10000, 320),
      repeatCount: clampNumber(soundRaw.repeatCount, 1, 50, 2),
      pauseBetweenMs: clampNumber(soundRaw.pauseBetweenMs, 0, 5000, 140),
    },
  };
  return config;
}

function createRuntimeState() {
  return {
    status: "stopped",
    startedAtMs: 0,
    pausedAtMs: 0,
    completedAtMs: 0,
    countdownTargetMs: 0,
    nextTriggerMs: null,
    endAtMs: null,
    triggerCount: 0,
  };
}

class Timer {
  constructor(id, rawConfig = {}) {
    this.id = id;
    this.config = normalizeTimerConfig(rawConfig, id);
    this.runtime = createRuntimeState();
  }

  setConfig(rawConfig = {}) {
    this.config = normalizeTimerConfig({ ...this.config, ...rawConfig }, this.id);
    this.reset();
  }

  reset() {
    this.runtime = createRuntimeState();
  }

  canTriggerAgain() {
    return this.config.maxTriggers === 0 || this.runtime.triggerCount < this.config.maxTriggers;
  }

  start(nowMs) {
    if (this.runtime.status === "running") {
      return;
    }
    if (this.runtime.status === "paused") {
      this.resume(nowMs);
      return;
    }

    this.runtime = createRuntimeState();
    this.runtime.status = "running";
    this.runtime.startedAtMs = nowMs;

    if (this.config.mode === "countdown") {
      this.runtime.countdownTargetMs = nowMs + this.config.durationMs;
      return;
    }

    const schedule = this.computeSchedule(nowMs);
    if (!schedule) {
      this.runtime.status = "completed";
      this.runtime.completedAtMs = nowMs;
      return;
    }

    this.runtime.nextTriggerMs = schedule.nextTriggerMs;
    this.runtime.endAtMs = schedule.endAtMs;
  }

  pause(nowMs) {
    if (this.runtime.status !== "running") {
      return;
    }
    this.runtime.status = "paused";
    this.runtime.pausedAtMs = nowMs;
  }

  resume(nowMs) {
    if (this.runtime.status !== "paused") {
      return;
    }
    const pausedDurationMs = Math.max(0, nowMs - this.runtime.pausedAtMs);
    this.runtime.status = "running";
    this.runtime.pausedAtMs = 0;

    if (this.config.mode === "countdown") {
      this.runtime.countdownTargetMs += pausedDurationMs;
      return;
    }

    if (Number.isFinite(this.runtime.nextTriggerMs)) {
      this.runtime.nextTriggerMs += pausedDurationMs;
    }
    if (Number.isFinite(this.runtime.endAtMs)) {
      this.runtime.endAtMs += pausedDurationMs;
    }
  }

  stop() {
    this.reset();
  }

  computeSchedule(nowMs) {
    const baseMs = setTimeOnDate(nowMs, this.config.scheduleStart);
    const firstTriggerMs = baseMs + this.config.intervalMs;

    let nextTriggerMs = firstTriggerMs;
    if (nowMs > firstTriggerMs) {
      const elapsedSinceFirst = nowMs - firstTriggerMs;
      const jump = Math.floor(elapsedSinceFirst / this.config.intervalMs) + 1;
      nextTriggerMs = firstTriggerMs + jump * this.config.intervalMs;
    }

    let endAtMs = null;
    if (this.config.endTime) {
      endAtMs = setTimeOnDate(baseMs, this.config.endTime);
      if (endAtMs <= baseMs) {
        endAtMs += DAY_MS;
      }
    }

    if (Number.isFinite(endAtMs) && nextTriggerMs - this.config.offsetBeforeMs > endAtMs) {
      return null;
    }
    return { nextTriggerMs, endAtMs };
  }

  formatMeta(nowMs) {
    if (this.config.mode === "countdown") {
      if (this.runtime.status === "completed") {
        return `Ausloesungen: ${this.runtime.triggerCount}`;
      }
      return `Countdown: ${Math.round(this.config.durationMs / 1000)}s`;
    }
    const endLabel = this.config.endTime || "--:--";
    const remainingTriggers = this.config.maxTriggers === 0
      ? "unbegrenzt"
      : Math.max(0, this.config.maxTriggers - this.runtime.triggerCount);
    if (this.runtime.status === "running") {
      const next = this.runtime.nextTriggerMs
        ? new Date(this.runtime.nextTriggerMs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "--:--:--";
      return `Naechster: ${next} | Ende: ${endLabel} | Rest: ${remainingTriggers}`;
    }
    return `Start: ${this.config.scheduleStart} | Intervall: ${Math.round(this.config.intervalMs / 1000)}s | Ende: ${endLabel}`;
  }

  snapshot(nowMs) {
    let remainingMs = 0;
    if (this.config.mode === "countdown") {
      remainingMs = Math.max(0, this.runtime.countdownTargetMs - nowMs);
    } else if (this.runtime.nextTriggerMs !== null) {
      remainingMs = Math.max(0, (this.runtime.nextTriggerMs - this.config.offsetBeforeMs) - nowMs);
    }
    return {
      id: this.id,
      config: this.config,
      status: this.runtime.status,
      triggerCount: this.runtime.triggerCount,
      remainingMs,
      nextTriggerMs: this.runtime.nextTriggerMs,
      endAtMs: this.runtime.endAtMs,
      metaText: this.formatMeta(nowMs),
    };
  }

  tick(nowMs) {
    const events = [];
    if (this.runtime.status !== "running") {
      return { events, snapshot: this.snapshot(nowMs) };
    }

    if (this.config.mode === "countdown") {
      if (nowMs >= this.runtime.countdownTargetMs) {
        if (this.canTriggerAgain()) {
          this.runtime.triggerCount += 1;
          events.push({ type: "trigger", timerId: this.id, triggerAtMs: nowMs });
        }
        this.runtime.status = "completed";
        this.runtime.completedAtMs = nowMs;
      }
      return { events, snapshot: this.snapshot(nowMs) };
    }

    while (this.runtime.status === "running" && Number.isFinite(this.runtime.nextTriggerMs)) {
      const effectiveTriggerMs = this.runtime.nextTriggerMs - this.config.offsetBeforeMs;
      if (nowMs < effectiveTriggerMs) {
        break;
      }
      if (!this.canTriggerAgain()) {
        this.runtime.status = "completed";
        this.runtime.completedAtMs = nowMs;
        break;
      }
      this.runtime.triggerCount += 1;
      events.push({ type: "trigger", timerId: this.id, triggerAtMs: nowMs });

      if (!this.canTriggerAgain()) {
        this.runtime.status = "completed";
        this.runtime.completedAtMs = nowMs;
        break;
      }

      const nextTriggerMs = this.runtime.nextTriggerMs + this.config.intervalMs;
      if (Number.isFinite(this.runtime.endAtMs) && nextTriggerMs - this.config.offsetBeforeMs > this.runtime.endAtMs) {
        this.runtime.status = "completed";
        this.runtime.completedAtMs = nowMs;
        break;
      }
      this.runtime.nextTriggerMs = nextTriggerMs;
    }

    return { events, snapshot: this.snapshot(nowMs) };
  }
}

class TimerManager {
  constructor({ maxTimers = MAX_TIMERS } = {}) {
    this.maxTimers = clampNumber(maxTimers, 1, MAX_TIMERS, MAX_TIMERS);
    this.timers = Array.from({ length: this.maxTimers }, (_, index) => new Timer(index, {}));
    this.listeners = new Map();
  }

  on(eventName, listener) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(listener);
    return () => this.listeners.get(eventName)?.delete(listener);
  }

  emit(eventName, payload) {
    const bucket = this.listeners.get(eventName);
    if (!bucket) {
      return;
    }
    bucket.forEach((listener) => listener(payload));
  }

  getTimer(timerId) {
    return this.timers.find((timer) => timer.id === timerId) || null;
  }

  getAllSnapshots(nowMs = Date.now()) {
    return this.timers.map((timer) => timer.snapshot(nowMs));
  }

  updateTimerConfig(timerId, configPatch) {
    const timer = this.getTimer(timerId);
    if (!timer) {
      return;
    }
    timer.setConfig(configPatch);
    this.emit("timer-config-updated", { timerId, config: timer.config });
  }

  startTimer(timerId, nowMs) {
    const timer = this.getTimer(timerId);
    if (!timer) {
      return;
    }
    timer.start(nowMs);
    this.emit("timer-status-changed", { timerId, status: timer.runtime.status });
  }

  pauseTimer(timerId, nowMs) {
    const timer = this.getTimer(timerId);
    if (!timer) {
      return;
    }
    timer.pause(nowMs);
    this.emit("timer-status-changed", { timerId, status: timer.runtime.status });
  }

  resumeTimer(timerId, nowMs) {
    const timer = this.getTimer(timerId);
    if (!timer) {
      return;
    }
    timer.resume(nowMs);
    this.emit("timer-status-changed", { timerId, status: timer.runtime.status });
  }

  stopTimer(timerId) {
    const timer = this.getTimer(timerId);
    if (!timer) {
      return;
    }
    timer.stop();
    this.emit("timer-status-changed", { timerId, status: timer.runtime.status });
  }

  startAll(nowMs) {
    this.timers.forEach((timer) => timer.start(nowMs));
    this.emit("all-status-changed", { action: "startAll" });
  }

  pauseAll(nowMs) {
    this.timers.forEach((timer) => timer.pause(nowMs));
    this.emit("all-status-changed", { action: "pauseAll" });
  }

  resumeAll(nowMs) {
    this.timers.forEach((timer) => timer.resume(nowMs));
    this.emit("all-status-changed", { action: "resumeAll" });
  }

  stopAll() {
    this.timers.forEach((timer) => timer.stop());
    this.emit("all-status-changed", { action: "stopAll" });
  }

  tick(nowMs) {
    const snapshots = [];
    for (const timer of this.timers) {
      const result = timer.tick(nowMs);
      snapshots.push(result.snapshot);
      for (const event of result.events) {
        const payload = {
          ...event,
          timerName: timer.config.name,
          timerConfig: timer.config,
          triggerCount: timer.runtime.triggerCount,
        };
        this.emit("timer-triggered", payload);
      }
    }
    return snapshots;
  }

  exportConfigs() {
    return this.timers.map((timer) => timer.config);
  }

  importConfigs(rawTimers) {
    if (!Array.isArray(rawTimers)) {
      return;
    }
    rawTimers.slice(0, this.maxTimers).forEach((raw, index) => {
      const timer = this.timers[index];
      timer.setConfig(raw);
    });
    for (let i = rawTimers.length; i < this.maxTimers; i += 1) {
      this.timers[i].setConfig({});
    }
    this.emit("configs-imported", { count: Math.min(rawTimers.length, this.maxTimers) });
  }
}

window.MAX_TIMERS = MAX_TIMERS;
window.normalizeTimerConfig = normalizeTimerConfig;
window.TimerManager = TimerManager;
