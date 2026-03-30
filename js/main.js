function getPersistPayload(timerManager, ui, ntp) {
  return {
    timers: timerManager.exportConfigs(),
    settings: {
      timezone: ui.timezone,
      ntpIntervalMs: ntp.syncIntervalMs,
    },
  };
}

function normalizeIntervalMinutes(rawMinutes) {
  const parsed = Number(rawMinutes);
  if (!Number.isFinite(parsed)) {
    return window.DEFAULT_SYNC_INTERVAL_MS / 60000;
  }
  return Math.max(1, Math.min(240, Math.round(parsed)));
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

async function init() {
  ensureDependencies();

  const storageService = new window.StorageService();
  const audioController = new window.AudioController();
  const timerManager = new window.TimerManager({ maxTimers: 5 });

  const savedState = storageService.loadState();
  const savedSettings = savedState && typeof savedState === "object" ? savedState.settings || {} : {};
  if (Array.isArray(savedState && savedState.timers)) {
    timerManager.importConfigs(savedState.timers);
  }

  const initialIntervalMs = Number(savedSettings.ntpIntervalMs) || window.DEFAULT_SYNC_INTERVAL_MS;
  const ntp = new window.NtpSynchronizer({ enabled: true, syncIntervalMs: initialIntervalMs });

  const ui = new window.UIController({
    timerManager,
    handlers: {
      startTimer: (timerId) => {
        timerManager.startTimer(timerId, ntp.now());
        storageService.saveState(getPersistPayload(timerManager, ui, ntp));
      },
      togglePauseResume: (timerId) => {
        const timer = timerManager.getTimer(timerId);
        if (!timer) {
          return;
        }
        if (timer.runtime.status === "running") {
          timerManager.pauseTimer(timerId, ntp.now());
        } else if (timer.runtime.status === "paused") {
          timerManager.resumeTimer(timerId, ntp.now());
        } else {
          timerManager.startTimer(timerId, ntp.now());
        }
        storageService.saveState(getPersistPayload(timerManager, ui, ntp));
      },
      resetTimer: (timerId) => {
        timerManager.stopTimer(timerId);
        storageService.saveState(getPersistPayload(timerManager, ui, ntp));
      },
      saveTimerConfig: (timerId, configPatch) => {
        timerManager.updateTimerConfig(timerId, configPatch);
        storageService.saveState(getPersistPayload(timerManager, ui, ntp));
        ui.showToast(`Timer ${timerId + 1} gespeichert`);
      },
      startAll: () => {
        timerManager.startAll(ntp.now());
        storageService.saveState(getPersistPayload(timerManager, ui, ntp));
      },
      pauseAll: () => {
        timerManager.pauseAll(ntp.now());
        storageService.saveState(getPersistPayload(timerManager, ui, ntp));
      },
      resumeAll: () => {
        timerManager.resumeAll(ntp.now());
        storageService.saveState(getPersistPayload(timerManager, ui, ntp));
      },
      resetAll: () => {
        const confirmed = window.confirm("Alle Timer wirklich zuruecksetzen?");
        if (!confirmed) {
          return;
        }
        timerManager.stopAll();
        storageService.saveState(getPersistPayload(timerManager, ui, ntp));
        ui.showToast("Alle Timer wurden zurueckgesetzt.");
      },
      syncNow: async () => {
        const ok = await ntp.syncNow();
        ui.showToast(ok ? "NTP Sync erfolgreich." : "NTP nicht erreichbar, Systemzeit aktiv.", { error: !ok });
      },
      setTimezone: (timezone) => {
        ui.timezone = timezone || "__local__";
        storageService.saveState(getPersistPayload(timerManager, ui, ntp));
      },
      setNtpIntervalMinutes: (minutes) => {
        const safeMinutes = normalizeIntervalMinutes(minutes);
        ntp.setSyncIntervalMs(safeMinutes * 60 * 1000);
        storageService.saveState(getPersistPayload(timerManager, ui, ntp));
      },
      saveJson: () => {
        const payload = getPersistPayload(timerManager, ui, ntp);
        storageService.triggerJsonDownload(payload);
        ui.showToast("JSON exportiert.");
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

          storageService.saveState(getPersistPayload(timerManager, ui, ntp));
          ui.showToast("JSON importiert.");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ui.showToast(`Import fehlgeschlagen: ${message}`, { error: true });
        }
      },
    },
  });

  ui.initialize(timerManager.getAllSnapshots(ntp.now()), {
    timezone: "__local__",
    ntpIntervalMinutes: Math.round(initialIntervalMs / 60000),
  });

  ntp.onStatusChange((status) => ui.updateSyncStatus(status));

  timerManager.on("timer-triggered", (payload) => {
    audioController.play(payload.timerConfig.sound).catch(() => undefined);
    ui.showToast(`${payload.timerName} ausgeloest (#${payload.triggerCount}).`);
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
}

init().catch((error) => {
  console.error("TimerTool failed to initialize", error);
  const message = error instanceof Error ? error.message : String(error);
  alert(`TimerTool konnte nicht gestartet werden: ${message}`);
});
