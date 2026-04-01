function getPersistPayload(timerManager, ui, ntp) {
  return {
    timers: timerManager.exportConfigs(),
    settings: {
      timezone: ui.timezone,
      ntpIntervalMs: ntp.syncIntervalMs,
      globalToneDisabled: Boolean(ui.globalToneDisabled),
      globalVisualBellEnabled: Boolean(ui.globalVisualBellEnabled),
      visualBellConfig: ui.visualBellConfig,
      maxTriggerReplay: timerManager.maxTriggerReplay,
    },
  };
}

function normalizeVisualBellConfig(rawConfig = {}) {
  const toSafeInt = (value, min, max, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
  };

  return {
    count: toSafeInt(rawConfig.count, 1, 12, 3),
    lengthMs: toSafeInt(rawConfig.lengthMs, 10, 5000, 330),
    pauseMs: toSafeInt(rawConfig.pauseMs, 0, 5000, 250),
  };
}

function normalizeIntervalMinutes(rawMinutes) {
  const parsed = Number(rawMinutes);
  if (!Number.isFinite(parsed)) {
    return window.DEFAULT_SYNC_INTERVAL_MS / 60000;
  }
  return Math.max(1, Math.min(240, Math.round(parsed)));
}

function normalizeMaxTriggerReplay(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.max(1, Math.min(20, Math.round(parsed)));
}

function ensureDependencies() {
  const required = [
    "TimerManager",
    "UIController",
    "NtpSynchronizer",
    "DEFAULT_SYNC_INTERVAL_MS",
    "AudioController",
    "StorageService",
  ];
  const missing = required.filter((name) => !(name in window));
  if (missing.length > 0) {
    throw new Error(`Missing JS dependencies: ${missing.join(", ")}`);
  }
}

const SOURCE_FILES_FOR_TIMESTAMP = [
  "index.html",
  "css/style.css",
  "css/animations.css",
  "js/main.js",
  "js/timer.js",
  "js/ui.js",
  "js/ntp.js",
  "js/audio.js",
  "js/storage.js",
  "timertool-config-Minutes_European.json",
  "timertool-config-Minutes_European-new.json",
  "timertool-config-voices-german.json",
  "timertool-config-voices-german-market-open-audio.json",
];

function formatIsoLocalWithOffset(epochMs) {
  const date = new Date(epochMs);
  const pad2 = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());

  const offsetMinutesTotal = -date.getTimezoneOffset();
  const offsetSign = offsetMinutesTotal >= 0 ? "+" : "-";
  const offsetHours = pad2(Math.floor(Math.abs(offsetMinutesTotal) / 60));
  const offsetMinutes = pad2(Math.abs(offsetMinutesTotal) % 60);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
}

function normalizeSourcePath(rawPath) {
  const cleaned = String(rawPath || "").trim();
  if (!cleaned) {
    return "";
  }
  const withoutHash = cleaned.split("#")[0];
  const withoutQuery = withoutHash.split("?")[0];
  return withoutQuery.replace(/^\.\//, "");
}

function collectTimestampSourcePaths() {
  const paths = new Set(SOURCE_FILES_FOR_TIMESTAMP.map((path) => normalizeSourcePath(path)));

  document.querySelectorAll('script[src], link[rel="stylesheet"][href]').forEach((element) => {
    const rawValue = element.getAttribute("src") || element.getAttribute("href") || "";
    const normalizedPath = normalizeSourcePath(rawValue);
    if (normalizedPath) {
      paths.add(normalizedPath);
    }
  });

  return Array.from(paths).filter(Boolean);
}

function parseHttpDateHeaderMs(value) {
  const epochMs = Date.parse(String(value || ""));
  return Number.isFinite(epochMs) ? epochMs : null;
}

async function getSourceLastModifiedMs(path) {
  const cacheBust = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestUrl = `${path}?v=${cacheBust}`;

  const attempt = async (method) => {
    const response = await fetch(requestUrl, { method, cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const lastModifiedMs = parseHttpDateHeaderMs(response.headers.get("last-modified"));
    if (Number.isFinite(lastModifiedMs)) {
      return lastModifiedMs;
    }
    return null;
  };

  try {
    const headResult = await attempt("HEAD");
    if (Number.isFinite(headResult)) {
      return headResult;
    }
  } catch (_) {
    // Continue with GET fallback below.
  }

  try {
    return await attempt("GET");
  } catch (_) {
    return null;
  }
}

async function updateBuildTimestamp() {
  const timestampEl = document.getElementById("build-timestamp");
  if (!timestampEl) {
    return;
  }

  let bestEpochMs = 0;
  const sourcePaths = collectTimestampSourcePaths();
  const sourceTimes = await Promise.all(sourcePaths.map((path) => getSourceLastModifiedMs(path)));
  sourceTimes.forEach((epochMs) => {
    if (Number.isFinite(epochMs) && epochMs > bestEpochMs) {
      bestEpochMs = epochMs;
    }
  });
  if (!Number.isFinite(bestEpochMs) || bestEpochMs <= 0) {
    bestEpochMs = Date.parse(String(document.lastModified || ""));
  }
  if (!Number.isFinite(bestEpochMs) || bestEpochMs <= 0) {
    bestEpochMs = Date.now();
  }

  timestampEl.textContent = formatIsoLocalWithOffset(bestEpochMs);
  timestampEl.setAttribute("datetime", new Date(bestEpochMs).toISOString());
}

async function init() {
  ensureDependencies();

  const storageService = new window.StorageService();
  const audioController = new window.AudioController();

  const savedState = storageService.loadState();
  const savedSettings = savedState && typeof savedState === "object" ? savedState.settings || {} : {};
  const timerManager = new window.TimerManager({
    maxTimers: 4,
    maxTriggerReplay: normalizeMaxTriggerReplay(savedSettings.maxTriggerReplay),
  });
  if (Array.isArray(savedState && savedState.timers) && savedState.timers.length > 0) {
    timerManager.importConfigs(savedState.timers);
  } else {
    timerManager.resetAllToDefaults();
  }

  const initialIntervalMs = Number(savedSettings.ntpIntervalMs) || window.DEFAULT_SYNC_INTERVAL_MS;
  const ntp = new window.NtpSynchronizer({ enabled: true, syncIntervalMs: initialIntervalMs });
  let ui = null;

  const persistState = () => {
    if (!ui) {
      return;
    }
    storageService.saveState(getPersistPayload(timerManager, ui, ntp));
    ui.updateCookieStats(storageService.getCookieStorageStats());
  };

  ui = new window.UIController({
    timerManager,
    handlers: {
      startTimer: (timerId) => {
        timerManager.startTimer(timerId, ntp.now());
        persistState();
      },
      toggleStartStop: (timerId) => {
        const timer = timerManager.getTimer(timerId);
        if (!timer) {
          return;
        }
        const isActive = timer.runtime.status === "running" || timer.runtime.status === "paused";
        if (isActive) {
          timerManager.stopTimer(timerId);
        } else {
          timerManager.startTimer(timerId, ntp.now());
        }
        persistState();
      },
      resetTimer: (timerId) => {
        timerManager.resetTimerToDefault(timerId);
        persistState();
        ui.showToast(`Timer ${timerId + 1} reset to default.`);
      },
      saveTimerConfig: (timerId, configPatch) => {
        timerManager.updateTimerConfig(timerId, configPatch);
        persistState();
        ui.showToast(`Timer ${timerId + 1} saved.`);
      },
      startAll: () => {
        timerManager.startAll(ntp.now());
        persistState();
      },
      resetAll: () => {
        const confirmed = window.confirm("Reset all timers?");
        if (!confirmed) {
          return;
        }
        timerManager.resetAllToDefaults();
        persistState();
        ui.showToast("All timers reset to defaults.");
      },
      syncNow: async () => {
        const ok = await ntp.syncNow();
        ui.showToast(ok ? "NTP sync successful." : "NTP unavailable. System clock active.", { error: !ok });
      },
      setTimezone: (timezone) => {
        ui.timezone = timezone || "__local__";
        persistState();
      },
      setGlobalToneDisabled: (disabled) => {
        ui.globalToneDisabled = Boolean(disabled);
        if (ui.globalToneDisabled) {
          audioController.stopAll();
        }
        persistState();
      },
      setGlobalVisualBellEnabled: (enabled) => {
        ui.globalVisualBellEnabled = Boolean(enabled);
        if (!ui.globalVisualBellEnabled) {
          ui.clearAllVisualBellSequences();
        }
        persistState();
      },
      setVisualBellConfig: (config) => {
        ui.visualBellConfig = normalizeVisualBellConfig(config);
        persistState();
      },
      setNtpIntervalMinutes: (minutes) => {
        const safeMinutes = normalizeIntervalMinutes(minutes);
        ntp.setSyncIntervalMs(safeMinutes * 60 * 1000);
        persistState();
      },
      saveJson: () => {
        const payload = getPersistPayload(timerManager, ui, ntp);
        storageService.triggerJsonDownload(payload);
        ui.showToast("JSON exported.");
      },
      loadJsonFile: async (file) => {
        try {
          const text = await storageService.readFileAsText(file);
          const parsed = storageService.importFromJsonText(text);
          timerManager.importConfigs(parsed.timers || []);

          const timezone = String((parsed.settings && parsed.settings.timezone) || "__local__");
          ui.timezone = timezone;
          document.getElementById("timezone-select").value = timezone;
          if (document.getElementById("timezone-select").value !== timezone) {
            ui.timezone = "__local__";
            document.getElementById("timezone-select").value = "__local__";
          }

          const intervalMs = Number(parsed.settings && parsed.settings.ntpIntervalMs) || ntp.syncIntervalMs;
          ntp.setSyncIntervalMs(intervalMs);
          document.getElementById("ntp-interval-minutes").value = String(Math.round(intervalMs / 60000));

          const maxTriggerReplay = normalizeMaxTriggerReplay(parsed.settings && parsed.settings.maxTriggerReplay);
          timerManager.setMaxTriggerReplay(maxTriggerReplay);

          const globalToneDisabled = Boolean(parsed.settings && parsed.settings.globalToneDisabled);
          ui.globalToneDisabled = globalToneDisabled;
          const globalToneDisableEl = document.getElementById("global-tone-disable");
          if (globalToneDisableEl) {
            globalToneDisableEl.checked = globalToneDisabled;
          }
          if (globalToneDisabled) {
            audioController.stopAll();
          }

          const globalVisualBellEnabled = Boolean(parsed.settings && parsed.settings.globalVisualBellEnabled);
          ui.globalVisualBellEnabled = globalVisualBellEnabled;
          const globalVisualBellEl = document.getElementById("global-visual-bell");
          if (globalVisualBellEl) {
            globalVisualBellEl.checked = globalVisualBellEnabled;
          }
          if (!globalVisualBellEnabled) {
            ui.clearAllVisualBellSequences();
          }

          ui.visualBellConfig = normalizeVisualBellConfig(parsed.settings && parsed.settings.visualBellConfig);

          persistState();
          ui.showToast("JSON imported.");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ui.showToast(`Import failed: ${message}`, { error: true });
        }
      },
    },
  });

  ui.initialize(timerManager.getAllSnapshots(ntp.now()), {
    timezone: String(savedSettings.timezone || "__local__"),
    ntpIntervalMinutes: Math.round(initialIntervalMs / 60000),
    globalToneDisabled: Boolean(savedSettings.globalToneDisabled),
    globalVisualBellEnabled: Boolean(savedSettings.globalVisualBellEnabled),
    visualBellConfig: normalizeVisualBellConfig(savedSettings.visualBellConfig),
    cookieStats: storageService.getCookieStorageStats(),
  });

  persistState();

  ntp.onStatusChange((status) => ui.updateSyncStatus(status));

  timerManager.on("timer-triggered", (payload) => {
    if (!ui.globalToneDisabled) {
      audioController.play(payload.timerConfig.sound).catch(() => undefined);
    }
    ui.triggerVisualBell(payload.timerId);
    ui.showToast(`${payload.timerName} triggered (#${payload.triggerCount}).`);
  });

  let lastUiPaintMs = 0;
  function mainLoop() {
    const nowMs = ntp.now();
    const snapshots = timerManager.tick(nowMs);

    if (!lastUiPaintMs || nowMs - lastUiPaintMs >= 80) {
      ui.renderSnapshots(snapshots);
      ui.updateClock(nowMs);
      lastUiPaintMs = nowMs;
    }
    requestAnimationFrame(mainLoop);
  }

  requestAnimationFrame(mainLoop);
  ntp.start().catch(() => undefined);
  ui.updateSyncStatus(ntp.getStatusSnapshot());
  updateBuildTimestamp().catch(() => undefined);
}

init().catch((error) => {
  console.error("TimerTool failed to initialize", error);
  const message = error instanceof Error ? error.message : String(error);
  alert(`TimerTool could not start: ${message}`);
});
