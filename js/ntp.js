const DEFAULT_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 4500;

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

class NtpSynchronizer {
  constructor({
    enabled = true,
    syncIntervalMs = DEFAULT_SYNC_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}) {
    this.enabled = Boolean(enabled);
    this.syncIntervalMs = Number(syncIntervalMs) || DEFAULT_SYNC_INTERVAL_MS;
    this.timeoutMs = Number(timeoutMs) || DEFAULT_TIMEOUT_MS;
    this.offsetMs = 0;
    this.lastSyncMs = 0;
    this.lastStatus = "system";
    this.lastError = "";
    this.syncTimerId = null;
    this.listeners = new Set();
    this.sources = [fetchWorldTimeApi, fetchTimeApiIo];
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
      offsetMs: this.offsetMs,
      lastSyncMs: this.lastSyncMs,
      lastStatus: this.lastStatus,
      lastError: this.lastError,
      syncIntervalMs: this.syncIntervalMs,
    };
  }

  now() {
    return Date.now() + this.offsetMs;
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
        const serverEpochMs = await withTimeout((signal) => source(signal), this.timeoutMs);
        const localEpochMs = Date.now();
        this.offsetMs = serverEpochMs - localEpochMs;
        this.lastSyncMs = localEpochMs;
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
