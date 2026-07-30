const DEFAULT_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_MAX_TRUSTED_OFFSET_MS = 5 * 60 * 1000;
const DEFAULT_MAX_SLEW_RATE_MS_PER_SECOND = 100;

function getMonotonicMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function withTimeout(promise, timeoutMs) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  return promise(controller.signal).finally(() => clearTimeout(timerId));
}

async function fetchWorldTimeApi(signal) {
  const response = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC", { signal });
  if (!response.ok) {
    throw new Error(`worldtimeapi status ${response.status}`);
  }
  const payload = await response.json();
  if (typeof payload.unixtime !== "number") {
    throw new Error("worldtimeapi missing unixtime");
  }
  return payload.unixtime * 1000;
}

async function fetchTimeApiIo(signal) {
  const response = await fetch("https://timeapi.io/api/Time/current/zone?timeZone=UTC", { signal });
  if (!response.ok) {
    throw new Error(`timeapi.io status ${response.status}`);
  }
  const payload = await response.json();
  const dateTime = typeof payload.dateTime === "string" ? payload.dateTime : "";
  const epoch = Date.parse(dateTime.endsWith("Z") ? dateTime : `${dateTime}Z`);
  if (!Number.isFinite(epoch)) {
    throw new Error("timeapi.io invalid dateTime");
  }
  return epoch;
}

async function fetchGetTimeApiDev(signal) {
  const response = await fetch("https://gettimeapi.dev/v1/time?timezone=UTC", { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`gettimeapi.dev status ${response.status}`);
  }
  const payload = await response.json();
  const epoch = typeof payload.timestamp === "number"
    ? payload.timestamp * 1000
    : Date.parse(String(payload.iso8601 || ""));
  if (!Number.isFinite(epoch)) {
    throw new Error("gettimeapi.dev invalid timestamp");
  }
  return epoch;
}

async function fetchSameOriginHttpDate(signal) {
  const requestUrl = `./index.html?time-sync=${Date.now()}`;
  let lastError = "";
  for (const method of ["HEAD", "GET"]) {
    try {
      const response = await fetch(requestUrl, { method, cache: "no-store", signal });
      if (!response.ok) {
        throw new Error(`same-origin time status ${response.status}`);
      }
      const epoch = Date.parse(response.headers.get("date") || "");
      if (Number.isFinite(epoch)) {
        return epoch;
      }
      throw new Error("same-origin time missing Date header");
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError || "same-origin time unavailable");
}

class NtpSynchronizer {
  constructor({
    enabled = true,
    syncIntervalMs = DEFAULT_SYNC_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxTrustedOffsetMs = DEFAULT_MAX_TRUSTED_OFFSET_MS,
    maxSlewRateMsPerSecond = DEFAULT_MAX_SLEW_RATE_MS_PER_SECOND,
  } = {}) {
    this.enabled = Boolean(enabled);
    this.syncIntervalMs = Number(syncIntervalMs) || DEFAULT_SYNC_INTERVAL_MS;
    this.timeoutMs = Number(timeoutMs) || DEFAULT_TIMEOUT_MS;
    this.maxTrustedOffsetMs = Number(maxTrustedOffsetMs) || DEFAULT_MAX_TRUSTED_OFFSET_MS;
    this.maxSlewRateMsPerSecond = Math.max(1, Number(maxSlewRateMsPerSecond) || DEFAULT_MAX_SLEW_RATE_MS_PER_SECOND);
    this.offsetMs = 0;
    this.targetOffsetMs = 0;
    this.lastOffsetUpdateMonoMs = getMonotonicMs();
    this.lastSyncMs = 0;
    this.lastStatus = "system";
    this.lastError = "";
    this.syncTimerId = null;
    this.listeners = new Set();
    this.sources = [fetchSameOriginHttpDate, fetchGetTimeApiDev, fetchWorldTimeApi, fetchTimeApiIo];
  }

  onStatusChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitStatus() {
    const snapshot = this.getStatusSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  getStatusSnapshot() {
    return {
      enabled: this.enabled,
      offsetMs: this.getCurrentOffsetMs(),
      targetOffsetMs: this.targetOffsetMs,
      lastSyncMs: this.lastSyncMs,
      lastStatus: this.lastStatus,
      lastError: this.lastError,
      syncIntervalMs: this.syncIntervalMs,
    };
  }

  getCurrentOffsetMs() {
    const nowMonoMs = getMonotonicMs();
    const elapsedMs = Math.max(0, nowMonoMs - this.lastOffsetUpdateMonoMs);
    this.lastOffsetUpdateMonoMs = nowMonoMs;

    const remainingCorrectionMs = this.targetOffsetMs - this.offsetMs;
    if (remainingCorrectionMs === 0) {
      return this.offsetMs;
    }

    const maxAdjustmentMs = (elapsedMs / 1000) * this.maxSlewRateMsPerSecond;
    if (Math.abs(remainingCorrectionMs) <= maxAdjustmentMs) {
      this.offsetMs = this.targetOffsetMs;
    } else {
      this.offsetMs += Math.sign(remainingCorrectionMs) * maxAdjustmentMs;
    }
    return this.offsetMs;
  }

  setTargetOffsetMs(targetOffsetMs) {
    this.getCurrentOffsetMs();
    this.targetOffsetMs = targetOffsetMs;
  }

  now() {
    return Date.now() + this.getCurrentOffsetMs();
  }

  setSyncIntervalMs(syncIntervalMs) {
    const nextValue = Math.max(60 * 1000, Number(syncIntervalMs) || DEFAULT_SYNC_INTERVAL_MS);
    this.syncIntervalMs = nextValue;
    if (this.syncTimerId !== null) {
      clearInterval(this.syncTimerId);
      this.syncTimerId = setInterval(() => {
        this.syncNow();
      }, this.syncIntervalMs);
    }
    this.emitStatus();
  }

  async start() {
    if (!this.enabled) {
      this.lastStatus = "disabled";
      this.emitStatus();
      return;
    }
    await this.syncNow();
    if (this.syncTimerId !== null) {
      clearInterval(this.syncTimerId);
    }
    this.syncTimerId = setInterval(() => {
      this.syncNow();
    }, this.syncIntervalMs);
  }

  stop() {
    if (this.syncTimerId !== null) {
      clearInterval(this.syncTimerId);
      this.syncTimerId = null;
    }
    this.lastStatus = "stopped";
    this.emitStatus();
  }

  async measureOffset(source) {
    const requestLocalMs = Date.now();
    const requestMonoMs = getMonotonicMs();
    const serverEpochMs = await withTimeout((signal) => source(signal), this.timeoutMs);
    const responseMonoMs = getMonotonicMs();
    const roundTripMs = Math.max(0, responseMonoMs - requestMonoMs);
    const estimatedLocalAtServerMs = requestLocalMs + (roundTripMs / 2);
    return serverEpochMs - estimatedLocalAtServerMs;
  }

  async syncNow() {
    if (!this.enabled) {
      this.lastStatus = "disabled";
      this.emitStatus();
      return false;
    }

    if (!navigator.onLine) {
      this.lastStatus = "offline-fallback";
      this.lastError = "offline";
      this.emitStatus();
      return false;
    }

    for (const source of this.sources) {
      try {
        const nextOffsetMs = await this.measureOffset(source);
        if (Math.abs(nextOffsetMs) > this.maxTrustedOffsetMs) {
          throw new Error(`time source offset ${Math.round(nextOffsetMs / 1000)}s exceeds trusted limit`);
        }
        this.setTargetOffsetMs(nextOffsetMs);
        this.lastSyncMs = Date.now();
        this.lastStatus = "synced";
        this.lastError = "";
        this.emitStatus();
        return true;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
      }
    }

    this.lastStatus = "system-fallback";
    this.emitStatus();
    return false;
  }
}

window.DEFAULT_SYNC_INTERVAL_MS = DEFAULT_SYNC_INTERVAL_MS;
window.NtpSynchronizer = NtpSynchronizer;
