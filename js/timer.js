const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TIMERS = 4;
const DEFAULT_MAX_TRIGGER_REPLAY = 1;

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

function parseHHMM(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) {
    return null;
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function normalizeTimerTimezone(timezone) {
  const value = String(timezone || "__local__").trim();
  return value || "__local__";
}

const timezonePartFormatterCache = new Map();

function getTimezonePartFormatter(timezone) {
  const normalized = normalizeTimerTimezone(timezone);
  const cacheKey = normalized;
  if (timezonePartFormatterCache.has(cacheKey)) {
    return timezonePartFormatterCache.get(cacheKey);
  }
  const options = {
    ...(normalized === "__local__" ? {} : { timeZone: normalized }),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  };
  const formatter = new Intl.DateTimeFormat("en-GB", options);
  timezonePartFormatterCache.set(cacheKey, formatter);
  return formatter;
}

function getWallClockParts(epochMs, timezone = "__local__") {
  const normalized = normalizeTimerTimezone(timezone);
  if (normalized === "__local__") {
    const date = new Date(epochMs);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }

  const values = {};
  getTimezonePartFormatter(normalized).formatToParts(new Date(epochMs)).forEach((part) => {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  });

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour === 24 ? 0 : values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function addWallDays(dateParts, days) {
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + days, 12, 0, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function wallPartsMatch(parts, expected) {
  return parts.year === expected.year
    && parts.month === expected.month
    && parts.day === expected.day
    && parts.hour === expected.hour
    && parts.minute === expected.minute;
}

function wallTimeToEpochMs(wallTime, timezone = "__local__") {
  const normalized = normalizeTimerTimezone(timezone);
  if (normalized === "__local__") {
    return new Date(wallTime.year, wallTime.month - 1, wallTime.day, wallTime.hour, wallTime.minute, 0, 0).getTime();
  }

  const targetWallUtcMs = Date.UTC(wallTime.year, wallTime.month - 1, wallTime.day, wallTime.hour, wallTime.minute, 0, 0);
  let epochMs = targetWallUtcMs;
  for (let i = 0; i < 5; i += 1) {
    const parts = getWallClockParts(epochMs, normalized);
    const representedWallUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0, 0);
    const timezoneOffsetMs = representedWallUtcMs - epochMs;
    const nextEpochMs = targetWallUtcMs - timezoneOffsetMs;
    if (Math.abs(nextEpochMs - epochMs) < 1) {
      epochMs = nextEpochMs;
      break;
    }
    epochMs = nextEpochMs;
  }

  if (wallPartsMatch(getWallClockParts(epochMs, normalized), wallTime)) {
    return epochMs;
  }

  for (let minuteOffset = 1; minuteOffset <= 180; minuteOffset += 1) {
    const candidateMs = epochMs + minuteOffset * 60 * 1000;
    const parts = getWallClockParts(candidateMs, normalized);
    if (
      parts.year === wallTime.year
      && parts.month === wallTime.month
      && parts.day === wallTime.day
      && (parts.hour > wallTime.hour || (parts.hour === wallTime.hour && parts.minute >= wallTime.minute))
    ) {
      return candidateMs;
    }
  }

  return epochMs;
}

function setTimeOnDate(baseEpochMs, hhmm, timezone = "__local__") {
  const time = parseHHMM(hhmm);
  if (!time) {
    return baseEpochMs;
  }
  const dateParts = getWallClockParts(baseEpochMs, timezone);
  return wallTimeToEpochMs({
    year: dateParts.year,
    month: dateParts.month,
    day: dateParts.day,
    hour: time.hour,
    minute: time.minute,
  }, timezone);
}

function setTimeOnNextWallDate(baseEpochMs, hhmm, timezone = "__local__") {
  const time = parseHHMM(hhmm);
  if (!time) {
    return baseEpochMs;
  }
  const nextDateParts = addWallDays(getWallClockParts(baseEpochMs, timezone), 1);
  return wallTimeToEpochMs({
    year: nextDateParts.year,
    month: nextDateParts.month,
    day: nextDateParts.day,
    hour: time.hour,
    minute: time.minute,
  }, timezone);
}

function formatTimeForTimezone(epochMs, timezone = "__local__") {
  const normalized = normalizeTimerTimezone(timezone);
  try {
    return new Intl.DateTimeFormat("en-GB", {
      ...(normalized === "__local__" ? {} : { timeZone: normalized }),
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).format(new Date(epochMs));
  } catch (_) {
    return new Date(epochMs).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
}
function formatNumberWithFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMaxTriggerReplay(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_TRIGGER_REPLAY;
  }
  return Math.max(1, Math.min(20, Math.round(parsed)));
}

function defaultSoundConfig() {
  return {
    enabled: true,
    type: "beep",
    fileUrl: "",
    fileMaxDurationSeconds: 0,
    frequency: 440,
    waveType: "sine",
    volume: 0.25,
    durationMs: 250,
    repeatCount: 1,
    pauseBetweenMs: 0,
  };
}

const DEFAULT_TIMER_PRESETS = Object.freeze([
  {
    name: "Timer 5m",
    mode: "schedule",
    scheduleStart: "08:45",
    intervalMs: 300 * 1000,
    offsetBeforeMs: 2 * 1000,
    endTime: "22:45",
    maxTriggers: 0,
    autostart: false,
    sound: {
      enabled: true,
      type: "beep",
      frequency: 440,
      volume: 0.25,
      durationMs: 250,
      repeatCount: 1,
      pauseBetweenMs: 0,
      waveType: "sine",
      fileUrl: "",
      fileMaxDurationSeconds: 0,
    },
  },
  {
    name: "Timer 15m",
    mode: "schedule",
    scheduleStart: "08:45",
    intervalMs: 900 * 1000,
    offsetBeforeMs: 4 * 1000,
    endTime: "22:45",
    maxTriggers: 0,
    autostart: false,
    sound: {
      enabled: true,
      type: "beep",
      frequency: 880,
      volume: 0.25,
      durationMs: 150,
      repeatCount: 1,
      pauseBetweenMs: 0,
      waveType: "sine",
      fileUrl: "",
      fileMaxDurationSeconds: 0,
    },
  },
  {
    name: "Timer 30m",
    mode: "schedule",
    scheduleStart: "08:45",
    intervalMs: 1800 * 1000,
    offsetBeforeMs: 6 * 1000,
    endTime: "22:45",
    maxTriggers: 0,
    autostart: false,
    sound: {
      enabled: true,
      type: "beep",
      frequency: 1720,
      volume: 0.25,
      durationMs: 10,
      repeatCount: 1,
      pauseBetweenMs: 0,
      waveType: "sine",
      fileUrl: "",
      fileMaxDurationSeconds: 0,
    },
  },
  {
    name: "Timer 60m",
    mode: "schedule",
    scheduleStart: "08:45",
    intervalMs: 3600 * 1000,
    offsetBeforeMs: 10 * 1000,
    endTime: "22:45",
    maxTriggers: 0,
    autostart: false,
    sound: {
      enabled: true,
      type: "beep",
      frequency: 2220,
      volume: 0.25,
      durationMs: 10,
      repeatCount: 1,
      pauseBetweenMs: 0,
      waveType: "sine",
      fileUrl: "",
      fileMaxDurationSeconds: 0,
    },
  },
]);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getDefaultPresetByIndex(index) {
  const preset = DEFAULT_TIMER_PRESETS[index] || {};
  return deepClone(preset);
}

function normalizeTimerConfig(rawConfig = {}, id = 0) {
  const soundRaw = rawConfig.sound || {};
  const config = {
    id,
    name: String(rawConfig.name || `Timer ${id + 1}`).trim().slice(0, 30) || `Timer ${id + 1}`,
    mode: rawConfig.mode === "schedule" ? "schedule" : "countdown",
    durationMs: clampNumber(rawConfig.durationMs, 1000, DAY_MS, 5 * 60 * 1000),
    scheduleStart: isValidHHMM(rawConfig.scheduleStart) ? rawConfig.scheduleStart : "09:00",
    intervalMs: clampNumber(rawConfig.intervalMs, 1000, DAY_MS, 5 * 60 * 1000),
    offsetBeforeMs: clampNumber(rawConfig.offsetBeforeMs, 0, 60 * 60 * 1000, 0),
    endTime: isValidHHMM(rawConfig.endTime) ? rawConfig.endTime : "",
    maxTriggers: clampNumber(rawConfig.maxTriggers, 0, 999, 0),
    autostart: Boolean(rawConfig.autostart ?? false),
    sound: {
      ...defaultSoundConfig(),
      ...soundRaw,
      enabled: Boolean(soundRaw.enabled ?? true),
      type: soundRaw.type === "file" ? "file" : "beep",
      fileUrl: String(soundRaw.fileUrl || "").trim(),
      fileMaxDurationSeconds: clampNumber(soundRaw.fileMaxDurationSeconds, 0, 86400, 0),
      frequency: clampNumber(soundRaw.frequency, 100, 2000, 440),
      waveType: ["sine", "square", "triangle", "sawtooth"].includes(soundRaw.waveType)
        ? soundRaw.waveType
        : "sine",
      volume: clampNumber(soundRaw.volume, 0, 1, 0.5),
      durationMs: clampNumber(soundRaw.durationMs, 10, 10000, 250),
      repeatCount: clampNumber(soundRaw.repeatCount, 1, 50, 1),
      pauseBetweenMs: clampNumber(soundRaw.pauseBetweenMs, 0, 5000, 0),
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
    autoPendingAtMs: 0,
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

  start(nowMs, { timezone = "__local__" } = {}) {
    if (this.runtime.status === "running") {
      return;
    }
    if (this.runtime.status === "paused") {
      this.resume(nowMs);
      return;
    }

    this.runtime = createRuntimeState();
    
    // For schedule mode with autostart, go to pending state first
    if (this.config.mode === "schedule" && this.config.autostart) {
      this.runtime.status = "pending";
      this.runtime.startedAtMs = nowMs;
      const schedule = this.computeSchedule(nowMs, { includeBaseTrigger: true, timezone });
      if (schedule) {
        this.runtime.nextTriggerMs = schedule.nextTriggerMs;
        this.runtime.endAtMs = schedule.endAtMs;
      }
      // Stay pending even if schedule is null (time outside window)
      return;
    }

    this.runtime.status = "running";
    this.runtime.startedAtMs = nowMs;

    if (this.config.mode === "countdown") {
      this.runtime.countdownTargetMs = nowMs + this.config.durationMs;
      return;
    }

    const schedule = this.computeSchedule(nowMs, { timezone });
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

  enterAutostartPending(nowMs) {
    this.runtime.status = "pending";
    this.runtime.autoPendingAtMs = nowMs;
    this.runtime.nextTriggerMs = null;
    this.runtime.endAtMs = null;
  }

  computeSchedule(nowMs, { includeBaseTrigger = false, timezone = "__local__" } = {}) {
    const baseMs = setTimeOnDate(nowMs, this.config.scheduleStart, timezone);
    const firstTriggerMs = includeBaseTrigger ? baseMs : baseMs + this.config.intervalMs;

    let nextTriggerMs = firstTriggerMs;
    if (nowMs > firstTriggerMs) {
      const elapsedSinceFirst = nowMs - firstTriggerMs;
      const jump = Math.floor(elapsedSinceFirst / this.config.intervalMs) + 1;
      nextTriggerMs = firstTriggerMs + jump * this.config.intervalMs;
    }

    let endAtMs = null;
    if (this.config.endTime) {
      endAtMs = setTimeOnDate(baseMs, this.config.endTime, timezone);
      if (endAtMs <= baseMs) {
        endAtMs = setTimeOnNextWallDate(baseMs, this.config.endTime, timezone);
      }
    }

    if (Number.isFinite(endAtMs) && nextTriggerMs - this.config.offsetBeforeMs > endAtMs) {
      return null;
    }
    return { nextTriggerMs, endAtMs };
  }


  reschedule(nowMs, { timezone = "__local__" } = {}) {
    if (this.config.mode !== "schedule") {
      return;
    }
    if (this.runtime.status !== "running" && this.runtime.status !== "pending") {
      return;
    }
    const schedule = this.computeSchedule(nowMs, {
      includeBaseTrigger: this.runtime.status === "pending",
      timezone,
    });
    if (!schedule) {
      this.runtime.nextTriggerMs = null;
      this.runtime.endAtMs = null;
      if (this.runtime.status === "running") {
        this.runtime.status = this.config.autostart ? "pending" : "completed";
        this.runtime.completedAtMs = nowMs;
      }
      return;
    }
    this.runtime.nextTriggerMs = schedule.nextTriggerMs;
    this.runtime.endAtMs = schedule.endAtMs;
  }
  formatMeta(nowMs, { timezone = "__local__" } = {}) {
    if (this.config.mode === "countdown") {
      if (this.runtime.status === "completed") {
        return `Triggers: ${this.runtime.triggerCount}`;
      }
      return `Countdown: ${Math.round(this.config.durationMs / 1000)}s`;
    }
    const endLabel = this.config.endTime || "--:--";
    const remainingTriggers = this.config.maxTriggers === 0
      ? "unlimited"
      : Math.max(0, this.config.maxTriggers - this.runtime.triggerCount);
    
    const autostartLabel = this.config.autostart ? " | Autostart ✓" : "";
    
    if (this.runtime.status === "pending") {
      return `Pending autostart at ${this.config.scheduleStart} | Interval: ${Math.round(this.config.intervalMs / 1000)}s | End: ${endLabel}${autostartLabel}`;
    }
    
    if (this.runtime.status === "running") {
      const effectiveTriggerMs = Number.isFinite(this.runtime.nextTriggerMs)
        ? this.runtime.nextTriggerMs - this.config.offsetBeforeMs
        : null;
      const next = Number.isFinite(effectiveTriggerMs)
        ? formatTimeForTimezone(effectiveTriggerMs, timezone)
        : "--:--:--";
      const slotLabel = this.config.offsetBeforeMs > 0 && Number.isFinite(this.runtime.nextTriggerMs)
        ? ` | Slot: ${formatTimeForTimezone(this.runtime.nextTriggerMs, timezone)}`
        : "";
      return `Next alarm: ${next}${slotLabel} | End: ${endLabel} | Remaining: ${remainingTriggers}${autostartLabel}`;
    }
    return `Start: ${this.config.scheduleStart} | Interval: ${Math.round(this.config.intervalMs / 1000)}s | End: ${endLabel}${autostartLabel}`;
  }

  snapshot(nowMs, { timezone = "__local__" } = {}) {
    let remainingMs = 0;
    let progressPercent = 0;
    let progressBaseMs = this.config.durationMs;
    if (this.config.mode === "countdown") {
      remainingMs = Math.max(0, this.runtime.countdownTargetMs - nowMs);
      progressBaseMs = this.config.durationMs;
    } else if (this.runtime.nextTriggerMs !== null) {
      remainingMs = Math.max(0, (this.runtime.nextTriggerMs - this.config.offsetBeforeMs) - nowMs);
      progressBaseMs = this.config.intervalMs;
    }
    if (this.runtime.status === "running" || this.runtime.status === "paused") {
      progressPercent = Math.min(100, Math.max(0, (remainingMs / Math.max(1, progressBaseMs)) * 100));
    }
    return {
      id: this.id,
      config: this.config,
      status: this.runtime.status,
      triggerCount: this.runtime.triggerCount,
      remainingMs,
      progressPercent,
      nextTriggerMs: this.runtime.nextTriggerMs,
      effectiveTriggerMs: Number.isFinite(this.runtime.nextTriggerMs)
        ? this.runtime.nextTriggerMs - this.config.offsetBeforeMs
        : null,
      endAtMs: this.runtime.endAtMs,
      metaText: this.formatMeta(nowMs, { timezone }),
    };
  }

  tick(nowMs, { maxTriggerReplay = DEFAULT_MAX_TRIGGER_REPLAY, timezone = "__local__" } = {}) {
    const events = [];
    
    // Handle autostart pending state for schedule timers
    if (this.config.mode === "schedule" && this.config.autostart) {
      // Compute the base time and end time for today
      const baseMs = setTimeOnDate(nowMs, this.config.scheduleStart, timezone);
      let endMs = null;
      if (this.config.endTime) {
        endMs = setTimeOnDate(baseMs, this.config.endTime, timezone);
        if (endMs <= baseMs) {
          // End time is tomorrow
          endMs = setTimeOnNextWallDate(baseMs, this.config.endTime, timezone);
        }
      }
      
      if (this.runtime.status === "pending") {
        const isPendingLockedForCurrentWindow = this.runtime.autoPendingAtMs > 0
          && this.runtime.autoPendingAtMs >= baseMs
          && (!Number.isFinite(endMs) || this.runtime.autoPendingAtMs < endMs);
        if (isPendingLockedForCurrentWindow) {
          return { events, snapshot: this.snapshot(nowMs, { timezone }) };
        }

        // Initialize schedule times if not already set (first time entering pending)
        if (!Number.isFinite(this.runtime.nextTriggerMs)) {
          const schedule = this.computeSchedule(nowMs, { includeBaseTrigger: true, timezone });
          if (schedule) {
            this.runtime.nextTriggerMs = schedule.nextTriggerMs;
            this.runtime.endAtMs = schedule.endAtMs;
          }
        }

        const activationMs = baseMs - this.config.offsetBeforeMs;
        // Transition to running once activation time is reached (base time minus offset)
        if (nowMs >= activationMs && (!Number.isFinite(endMs) || nowMs < endMs)) {
          this.runtime.status = "running";
          this.runtime.autoPendingAtMs = 0;
        } else {
          // Stay pending, don't process triggers
          return { events, snapshot: this.snapshot(nowMs, { timezone }) };
        }
      } else if (this.runtime.status === "running") {
        // Transition back to pending if we've reached the end time
        if (Number.isFinite(endMs) && nowMs >= endMs) {
          this.enterAutostartPending(nowMs);
          return { events, snapshot: this.snapshot(nowMs, { timezone }) };
        }
      }
    }
    
    if (this.runtime.status !== "running") {
      return { events, snapshot: this.snapshot(nowMs, { timezone }) };
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
      return { events, snapshot: this.snapshot(nowMs, { timezone }) };
    }

    if (this.runtime.status === "running" && Number.isFinite(this.runtime.nextTriggerMs)) {
      const replayBudget = normalizeMaxTriggerReplay(maxTriggerReplay);
      let replayed = 0;

      while (this.runtime.status === "running" && Number.isFinite(this.runtime.nextTriggerMs)) {
        const effectiveTriggerMs = this.runtime.nextTriggerMs - this.config.offsetBeforeMs;
        if (nowMs < effectiveTriggerMs) {
          break;
        }

        if (replayed >= replayBudget) {
          // Skip remaining overdue intervals beyond replay budget and resync to the next future trigger.
          const elapsedSinceCurrentEffectiveMs = Math.max(0, nowMs - effectiveTriggerMs);
          const intervalsToAdvance = Math.floor(elapsedSinceCurrentEffectiveMs / this.config.intervalMs) + 1;
          const fastForwardTriggerMs = this.runtime.nextTriggerMs + (intervalsToAdvance * this.config.intervalMs);

          if (
            Number.isFinite(this.runtime.endAtMs)
            && fastForwardTriggerMs - this.config.offsetBeforeMs > this.runtime.endAtMs
          ) {
            if (this.config.autostart) {
              this.enterAutostartPending(nowMs);
            } else {
              this.runtime.status = "completed";
              this.runtime.completedAtMs = nowMs;
            }
          } else {
            this.runtime.nextTriggerMs = fastForwardTriggerMs;
          }
          break;
        }

        if (!this.canTriggerAgain()) {
          this.runtime.status = "completed";
          this.runtime.completedAtMs = nowMs;
          break;
        }

        this.runtime.triggerCount += 1;
        events.push({ type: "trigger", timerId: this.id, triggerAtMs: nowMs });
        replayed += 1;

        if (!this.canTriggerAgain()) {
          this.runtime.status = "completed";
          this.runtime.completedAtMs = nowMs;
          break;
        }

        const nextTriggerMs = this.runtime.nextTriggerMs + this.config.intervalMs;
        if (Number.isFinite(this.runtime.endAtMs) && nextTriggerMs - this.config.offsetBeforeMs > this.runtime.endAtMs) {
          // For autostart timers, go back to pending instead of completed.
          if (this.config.autostart) {
            this.enterAutostartPending(nowMs);
          } else {
            this.runtime.status = "completed";
            this.runtime.completedAtMs = nowMs;
          }
          break;
        }

        this.runtime.nextTriggerMs = nextTriggerMs;
      }
    }

    return { events, snapshot: this.snapshot(nowMs, { timezone }) };
  }
}

class TimerManager {
  constructor({ maxTimers = MAX_TIMERS, maxTriggerReplay = DEFAULT_MAX_TRIGGER_REPLAY } = {}) {
    this.maxTimers = clampNumber(maxTimers, 1, MAX_TIMERS, MAX_TIMERS);
    this.maxTriggerReplay = normalizeMaxTriggerReplay(maxTriggerReplay);
    this.defaultConfigs = Array.from({ length: this.maxTimers }, (_, index) => getDefaultPresetByIndex(index));
    this.timers = Array.from(
      { length: this.maxTimers },
      (_, index) => new Timer(index, this.defaultConfigs[index] || {}),
    );
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

  getDefaultConfig(timerId) {
    if (timerId < 0 || timerId >= this.maxTimers) {
      return {};
    }
    return deepClone(this.defaultConfigs[timerId] || {});
  }

  getAllSnapshots(nowMs = Date.now(), { timezone = "__local__" } = {}) {
    return this.timers.map((timer) => timer.snapshot(nowMs, { timezone }));
  }

  updateTimerConfig(timerId, configPatch) {
    const timer = this.getTimer(timerId);
    if (!timer) {
      return;
    }
    timer.setConfig(configPatch);
    this.emit("timer-config-updated", { timerId, config: timer.config });
  }

  startTimer(timerId, nowMs, { timezone = "__local__" } = {}) {
    const timer = this.getTimer(timerId);
    if (!timer) {
      return;
    }
    timer.start(nowMs, { timezone });
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

  resetTimerToDefault(timerId) {
    const timer = this.getTimer(timerId);
    if (!timer) {
      return;
    }
    timer.setConfig(this.getDefaultConfig(timerId));
    this.emit("timer-status-changed", { timerId, status: timer.runtime.status });
  }

  startAll(nowMs, { timezone = "__local__" } = {}) {
    this.timers.forEach((timer) => timer.start(nowMs, { timezone }));
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

  resetAllToDefaults() {
    this.timers.forEach((timer, index) => {
      timer.setConfig(this.getDefaultConfig(index));
    });
    this.emit("all-status-changed", { action: "resetAllToDefaults" });
  }

  setMaxTriggerReplay(value) {
    this.maxTriggerReplay = normalizeMaxTriggerReplay(value);
  }
  recalculateSchedules(nowMs, { timezone = "__local__" } = {}) {
    this.timers.forEach((timer) => timer.reschedule(nowMs, { timezone }));
    this.emit("all-status-changed", { action: "recalculateSchedules" });
  }
  tick(nowMs, { timezone = "__local__" } = {}) {
    const snapshots = [];
    for (const timer of this.timers) {
      const result = timer.tick(nowMs, { maxTriggerReplay: this.maxTriggerReplay, timezone });
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
      this.timers[i].setConfig(this.getDefaultConfig(i));
    }
    this.emit("configs-imported", { count: Math.min(rawTimers.length, this.maxTimers) });
  }
}

window.MAX_TIMERS = MAX_TIMERS;
window.normalizeTimerConfig = normalizeTimerConfig;
window.TimerManager = TimerManager;
