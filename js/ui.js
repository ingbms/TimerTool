function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function formatDuration(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const pad2 = (value) => String(value).padStart(2, "0");
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

function statusText(status) {
  if (status === "running") {
    return "RUNNING";
  }
  if (status === "paused") {
    return "PAUSED";
  }
  if (status === "pending") {
    return "PENDING";
  }
  if (status === "completed") {
    return "DONE";
  }
  return "STOPPED";
}

function statusClass(status) {
  if (status === "running" || status === "paused" || status === "completed" || status === "pending") {
    return status;
  }
  return "stopped";
}

function formatClockForTimezone(epochMs, timezone) {
  const useLocal = !timezone || timezone === "__local__";
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      ...(useLocal ? {} : { timeZone: timezone }),
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return formatter.format(new Date(epochMs));
  } catch (_) {
    return new Date(epochMs).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
}

function normalizeTimezoneList(rawValues) {
  const values = Array.isArray(rawValues) ? rawValues : [];
  const unique = new Set();
  const result = [];
  values.forEach((value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed === "__local__" || unique.has(trimmed)) {
      return;
    }
    unique.add(trimmed);
    result.push(trimmed);
  });
  return result.sort((left, right) => left.localeCompare(right, "en"));
}

function getAllTimezones() {
  if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
    try {
      const supported = Intl.supportedValuesOf("timeZone");
      const normalized = normalizeTimezoneList(supported);
      if (normalized.length > 0) {
        return normalized;
      }
    } catch (_) {
      // Fall through to static fallback list.
    }
  }

  if (Array.isArray(window.FALLBACK_TIMEZONES) && window.FALLBACK_TIMEZONES.length > 0) {
    return normalizeTimezoneList(window.FALLBACK_TIMEZONES);
  }

  return ["UTC"];
}

const DEFAULT_VISUAL_BELL_CONFIG = Object.freeze({
  count: 3,
  lengthMs: 330,
  pauseMs: 250,
});

function normalizeVisualBellConfig(rawConfig = {}) {
  return {
    count: clampNumber(rawConfig.count, 1, 12, DEFAULT_VISUAL_BELL_CONFIG.count),
    lengthMs: clampNumber(rawConfig.lengthMs, 10, 5000, DEFAULT_VISUAL_BELL_CONFIG.lengthMs),
    pauseMs: clampNumber(rawConfig.pauseMs, 0, 5000, DEFAULT_VISUAL_BELL_CONFIG.pauseMs),
  };
}

function timerCardTemplate(snapshot) {
  return `
    <article class="timer-card ${statusClass(snapshot.status)}" data-timer-id="${snapshot.id}">
      <div class="timer-head">
        <h3 class="timer-name" data-role="timer-name"></h3>
        <span class="status-badge ${statusClass(snapshot.status)}" data-role="timer-status"></span>
      </div>
      <div class="timer-display">
        <div class="timer-display-progress" data-role="timer-progress"></div>
        <div class="timer-display-value" data-role="timer-display">00:00:00</div>
      </div>
      <div class="timer-meta" data-role="timer-meta"></div>
      <div class="timer-controls">
        <button type="button" class="btn btn-primary" data-action="start-stop">Start</button>
        <button type="button" class="btn btn-secondary" data-action="config">Config</button>
      </div>
    </article>
  `;
}

class UIController {
  constructor({ timerManager, handlers }) {
    this.timerManager = timerManager;
    this.handlers = handlers;
    this.timezone = "__local__";
    this.globalToneDisabled = false;
    this.globalVisualBellEnabled = false;
    this.visualBellConfig = { ...DEFAULT_VISUAL_BELL_CONFIG };
    this.visualBellTimeoutsByElement = new WeakMap();

    this.gridEl = document.getElementById("timers-grid");
    this.clockLabelEl = document.getElementById("clock-label");
    this.clockEl = document.getElementById("clock-display");
    this.lastRenderedClockLabelTimezone = null;
    this.syncStatusEl = document.getElementById("sync-status");
    this.toastContainerEl = document.getElementById("toast-container");
    this.headerEl = document.querySelector(".app-header");
    this.modalEl = document.getElementById("timer-config-modal");
    this.formEl = document.getElementById("timer-config-form");
    this.fileInputEl = document.getElementById("json-file-input");
    this.timezoneSelectEl = document.getElementById("timezone-select");
    this.globalToneDisableEl = document.getElementById("global-tone-disable");
    this.globalVisualBellEl = document.getElementById("global-visual-bell");
    this.visualBellConfigBtnEl = document.getElementById("visual-bell-config-btn");
    this.visualBellConfigModalEl = document.getElementById("visual-bell-config-modal");
    this.visualBellConfigFormEl = document.getElementById("visual-bell-config-form");
    this.visualBellCountEl = document.getElementById("visual-bell-count");
    this.visualBellLengthEl = document.getElementById("visual-bell-length-ms");
    this.visualBellPauseEl = document.getElementById("visual-bell-pause-ms");
    this.formTimerIdEl = document.getElementById("config-timer-id");
    this.formModeEl = document.getElementById("config-mode");
    this.countdownFieldsEl = document.getElementById("countdown-fields");
    this.scheduleFieldsEl = document.getElementById("schedule-fields");
    this.fileUrlWrapperEl = document.getElementById("file-url-wrapper");
    this.fileMaxSecondsWrapperEl = document.getElementById("file-max-seconds-wrapper");
    this.formSoundTypeEl = document.getElementById("config-sound-type");
    this.cookieStatsButtonEl = document.getElementById("cookie-stats-button");
    this.cookiePolicyModalEl = document.getElementById("cookie-policy-modal");
    this.cookiePolicyCloseBtnEl = document.getElementById("cookie-policy-close-btn");

    this.populateTimezoneOptions();
    this.wireGlobalControls();
    this.wireVisualBellConfigControls();
    this.wirePolicyControls();
    this.wireModalControls();
    this.wireGridEvents();
  }

  wireGlobalControls() {
    document.getElementById("start-all-btn")?.addEventListener("click", () => this.handlers.startAll());
    document.getElementById("reset-all-btn")?.addEventListener("click", () => this.handlers.resetAll());
    document.getElementById("sync-now-btn")?.addEventListener("click", () => this.handlers.syncNow());
    document.getElementById("save-json-btn")?.addEventListener("click", () => this.handlers.saveJson());
    document.getElementById("load-json-btn")?.addEventListener("click", () => this.fileInputEl.click());

    this.timezoneSelectEl?.addEventListener("change", (event) => {
      this.timezone = String(event.target.value || "__local__");
      this.updateClockLabel();
      this.handlers.setTimezone(this.timezone);
    });

    const ntpIntervalInput = document.getElementById("ntp-interval-minutes");
    ntpIntervalInput.addEventListener("change", () => {
      const minutes = clampNumber(ntpIntervalInput.value, 1, 240, 30);
      ntpIntervalInput.value = String(minutes);
      this.handlers.setNtpIntervalMinutes(minutes);
    });

    this.fileInputEl.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      this.handlers.loadJsonFile(file);
      this.fileInputEl.value = "";
    });

    this.globalToneDisableEl?.addEventListener("change", (event) => {
      this.globalToneDisabled = Boolean(event.target.checked);
      this.handlers.setGlobalToneDisabled(this.globalToneDisabled);
    });

    this.globalVisualBellEl?.addEventListener("change", (event) => {
      this.globalVisualBellEnabled = Boolean(event.target.checked);
      if (!this.globalVisualBellEnabled) {
        this.clearAllVisualBellSequences();
      }
      this.handlers.setGlobalVisualBellEnabled(this.globalVisualBellEnabled);
    });
  }

  wireVisualBellConfigControls() {
    this.visualBellConfigBtnEl?.addEventListener("click", () => {
      this.openVisualBellConfigModal();
    });

    document.getElementById("visual-bell-cancel-btn")?.addEventListener("click", () => {
      this.closeVisualBellConfigModal();
    });

    this.visualBellConfigFormEl?.addEventListener("submit", (event) => {
      event.preventDefault();
      const nextConfig = normalizeVisualBellConfig({
        count: this.visualBellCountEl?.value,
        lengthMs: this.visualBellLengthEl?.value,
        pauseMs: this.visualBellPauseEl?.value,
      });
      this.visualBellConfig = nextConfig;
      this.handlers.setVisualBellConfig(nextConfig);
      this.closeVisualBellConfigModal();
      this.showToast("Visual bell config saved.");
    });

    this.visualBellConfigModalEl?.addEventListener("click", (event) => {
      const rect = this.visualBellConfigModalEl.getBoundingClientRect();
      const isOutside = (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
      if (isOutside) {
        this.closeVisualBellConfigModal();
      }
    });
  }

  wireGridEvents() {
    this.gridEl.addEventListener("click", (event) => {
      const actionButton = event.target.closest("button[data-action]");
      if (!actionButton) {
        return;
      }
      const card = actionButton.closest(".timer-card");
      if (!card) {
        return;
      }
      const timerId = Number(card.dataset.timerId);
      const action = actionButton.dataset.action;

      if (action === "start-stop") {
        this.handlers.toggleStartStop(timerId);
      } else if (action === "config") {
        this.openConfigModal(timerId);
      }
    });
  }

  wirePolicyControls() {
    this.cookieStatsButtonEl?.addEventListener("click", () => {
      this.cookiePolicyModalEl?.showModal();
    });

    this.cookiePolicyCloseBtnEl?.addEventListener("click", () => {
      this.cookiePolicyModalEl?.close();
    });

    this.cookiePolicyModalEl?.addEventListener("click", (event) => {
      const rect = this.cookiePolicyModalEl.getBoundingClientRect();
      const isOutside = (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
      if (isOutside) {
        this.cookiePolicyModalEl.close();
      }
    });
  }

  wireModalControls() {
    document.getElementById("modal-cancel-btn").addEventListener("click", () => this.closeConfigModal());
    document.getElementById("modal-reset-btn").addEventListener("click", () => {
      const timerId = Number(this.formTimerIdEl.value);
      this.handlers.resetTimer(timerId);
      this.closeConfigModal();
    });
    this.formModeEl.addEventListener("change", () => this.updateModeVisibility());
    this.formSoundTypeEl.addEventListener("change", () => this.updateSoundVisibility());

    this.formEl.addEventListener("submit", (event) => {
      event.preventDefault();
      const timerId = Number(this.formTimerIdEl.value);
      this.handlers.saveTimerConfig(timerId, this.readFormData());
      this.closeConfigModal();
    });
  }

  initialize(initialSnapshots, settings = {}) {
    this.timezone = settings.timezone || this.timezone;
    this.globalToneDisabled = Boolean(settings.globalToneDisabled);
    this.globalVisualBellEnabled = Boolean(settings.globalVisualBellEnabled);
    this.visualBellConfig = normalizeVisualBellConfig(settings.visualBellConfig);
    this.populateTimezoneOptions();
    if (this.timezoneSelectEl) {
      this.timezoneSelectEl.value = this.timezone;
    }
    if (!this.timezoneSelectEl || this.timezoneSelectEl.value !== this.timezone) {
      this.timezone = "__local__";
      if (this.timezoneSelectEl) {
        this.timezoneSelectEl.value = "__local__";
      }
    }
    this.updateClockLabel();
    if (settings.ntpIntervalMinutes) {
      document.getElementById("ntp-interval-minutes").value = String(settings.ntpIntervalMinutes);
    }
    if (this.globalToneDisableEl) {
      this.globalToneDisableEl.checked = this.globalToneDisabled;
    }
    if (this.globalVisualBellEl) {
      this.globalVisualBellEl.checked = this.globalVisualBellEnabled;
    }

    this.gridEl.innerHTML = initialSnapshots.map((snapshot) => timerCardTemplate(snapshot)).join("");
    this.renderSnapshots(initialSnapshots);
    if (settings.cookieStats) {
      this.updateCookieStats(settings.cookieStats);
    }
  }

  renderSnapshots(snapshots) {
    snapshots.forEach((snapshot) => {
      const card = this.gridEl.querySelector(`.timer-card[data-timer-id="${snapshot.id}"]`);
      if (!card) {
        return;
      }
      card.classList.remove("running", "paused", "completed", "stopped");
      card.classList.add(statusClass(snapshot.status));

      const nameEl = card.querySelector('[data-role="timer-name"]');
      const statusEl = card.querySelector('[data-role="timer-status"]');
      const displayEl = card.querySelector('[data-role="timer-display"]');
      const progressEl = card.querySelector('[data-role="timer-progress"]');
      const metaEl = card.querySelector('[data-role="timer-meta"]');
      const startStopBtn = card.querySelector('button[data-action="start-stop"]');

      nameEl.textContent = snapshot.config.name;
      statusEl.textContent = statusText(snapshot.status);
      statusEl.className = `status-badge ${statusClass(snapshot.status)}`;
      displayEl.textContent = formatDuration(snapshot.remainingMs);
      progressEl.style.width = `${snapshot.progressPercent || 0}%`;
      metaEl.textContent = snapshot.metaText || "";

      const isActive = snapshot.status === "running" || snapshot.status === "paused";
      startStopBtn.textContent = isActive ? "Stop" : "Start";
    });
  }

  updateClock(epochMs) {
    this.updateClockLabel();
    this.clockEl.textContent = formatClockForTimezone(epochMs, this.timezone);
  }

  updateClockLabel() {
    if (!this.clockLabelEl) {
      return;
    }
    const timezone = this.timezone || "__local__";
    if (this.lastRenderedClockLabelTimezone === timezone) {
      return;
    }
    this.lastRenderedClockLabelTimezone = timezone;
    this.clockLabelEl.textContent = timezone === "__local__"
      ? "Time (Local)"
      : `Time (${timezone})`;
  }

  updateSyncStatus(statusSnapshot) {
    const { lastStatus, lastSyncMs } = statusSnapshot;
    const syncTimeLabel = lastSyncMs
      ? new Date(lastSyncMs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : "--:--:--";
    let statusTextValue = "Time source: system clock";
    this.syncStatusEl.classList.remove("is-ok", "is-fallback");

    if (lastStatus === "synced") {
      statusTextValue = `Time source: NTP (last sync ${syncTimeLabel})`;
      this.syncStatusEl.classList.add("is-ok");
    } else if (lastStatus === "offline-fallback") {
      statusTextValue = "Time source: offline fallback to system clock";
      this.syncStatusEl.classList.add("is-fallback");
    } else if (lastStatus === "system-fallback") {
      statusTextValue = "Time source: NTP unreachable, using system clock";
      this.syncStatusEl.classList.add("is-fallback");
    }
    this.syncStatusEl.textContent = statusTextValue;
  }

  updateCookieStats(cookieStats = {}) {
    if (!this.cookieStatsButtonEl) {
      return;
    }
    const usedBytes = Math.max(0, Number(cookieStats.usedBytes) || 0);
    const totalBytes = Math.max(1, Number(cookieStats.totalBytes) || 1);
    const percent = Math.min(100, Math.max(0, Number(cookieStats.percentUsed) || 0));
    const usedKb = usedBytes / 1024;
    const totalKb = totalBytes / 1024;
    const label = `Cookies ${usedKb.toFixed(1)}kB of ${totalKb.toFixed(1)}kB, ${percent.toFixed(1)}%`;
    this.cookieStatsButtonEl.textContent = label;
    const source = String(cookieStats.source || "cookie");
    const sourceHint = source === "localStorage-fallback"
      ? " (localStorage fallback)"
      : "";
    this.cookieStatsButtonEl.setAttribute("aria-label", `${label}${sourceHint}. Cookie-Richtlinie anzeigen.`);
    this.cookieStatsButtonEl.title = source === "localStorage-fallback"
      ? "Cookie im aktuellen Kontext nicht lesbar, Anzeige basiert auf lokal gespeichertem Zustand."
      : "Anzeige basiert auf Cookie-Speicher.";
  }

  openConfigModal(timerId) {
    const timer = this.timerManager.getTimer(timerId);
    if (!timer) {
      return;
    }

    const cfg = timer.config;
    this.formTimerIdEl.value = String(timerId);
    document.getElementById("config-name").value = cfg.name;
    this.formModeEl.value = cfg.mode;
    document.getElementById("config-duration-seconds").value = String(Math.round(cfg.durationMs / 1000));
    document.getElementById("config-schedule-start").value = cfg.scheduleStart;
    document.getElementById("config-interval-seconds").value = String(Math.round(cfg.intervalMs / 1000));
    document.getElementById("config-offset-seconds").value = String(Math.round(cfg.offsetBeforeMs / 1000));
    document.getElementById("config-end-time").value = cfg.endTime;
    document.getElementById("config-max-triggers").value = String(cfg.maxTriggers);
    document.getElementById("config-autostart").checked = cfg.autostart;

    document.getElementById("config-sound-enabled").checked = cfg.sound.enabled;
    this.formSoundTypeEl.value = cfg.sound.type;
    document.getElementById("config-sound-file-url").value = cfg.sound.fileUrl || "";
    document.getElementById("config-sound-file-max-seconds").value = String(cfg.sound.fileMaxDurationSeconds || 0);
    document.getElementById("config-sound-frequency").value = String(cfg.sound.frequency);
    document.getElementById("config-sound-wave-type").value = cfg.sound.waveType;
    document.getElementById("config-sound-volume").value = String(cfg.sound.volume);
    document.getElementById("config-sound-duration").value = String(cfg.sound.durationMs);
    document.getElementById("config-sound-repeat-count").value = String(cfg.sound.repeatCount);
    document.getElementById("config-sound-pause-between").value = String(cfg.sound.pauseBetweenMs);

    this.updateModeVisibility();
    this.updateSoundVisibility();
    this.modalEl.showModal();
  }

  closeConfigModal() {
    this.modalEl.close();
  }

  openVisualBellConfigModal() {
    this.visualBellCountEl.value = String(this.visualBellConfig.count);
    this.visualBellLengthEl.value = String(this.visualBellConfig.lengthMs);
    this.visualBellPauseEl.value = String(this.visualBellConfig.pauseMs);
    this.visualBellConfigModalEl?.showModal();
  }

  closeVisualBellConfigModal() {
    this.visualBellConfigModalEl?.close();
  }

  populateTimezoneOptions() {
    if (!this.timezoneSelectEl) {
      return;
    }

    const previousSelection = this.timezoneSelectEl.value || this.timezone || "__local__";
    const timezoneOptions = getAllTimezones();
    this.timezoneSelectEl.innerHTML = "";

    const localOption = document.createElement("option");
    localOption.value = "__local__";
    localOption.textContent = "Local (System)";
    this.timezoneSelectEl.append(localOption);

    const fragment = document.createDocumentFragment();
    timezoneOptions.forEach((timezone) => {
      const option = document.createElement("option");
      option.value = timezone;
      option.textContent = timezone;
      fragment.append(option);
    });
    this.timezoneSelectEl.append(fragment);

    this.timezoneSelectEl.value = previousSelection;
    if (this.timezoneSelectEl.value !== previousSelection) {
      this.timezoneSelectEl.value = "__local__";
    }
  }

  updateModeVisibility() {
    const isCountdown = this.formModeEl.value === "countdown";
    this.countdownFieldsEl.hidden = !isCountdown;
    this.scheduleFieldsEl.hidden = isCountdown;
  }

  updateSoundVisibility() {
    const isFile = this.formSoundTypeEl.value === "file";
    this.fileUrlWrapperEl.hidden = !isFile;
    this.fileMaxSecondsWrapperEl.hidden = !isFile;
  }

  readFormData() {
    const mode = this.formModeEl.value;
    const durationSeconds = clampNumber(document.getElementById("config-duration-seconds").value, 1, 86400, 300);
    const intervalSeconds = clampNumber(document.getElementById("config-interval-seconds").value, 1, 86400, 300);
    const offsetSeconds = clampNumber(document.getElementById("config-offset-seconds").value, 0, 3600, 0);

    return {
      name: String(document.getElementById("config-name").value || "").trim(),
      mode,
      durationMs: durationSeconds * 1000,
      scheduleStart: document.getElementById("config-schedule-start").value || "09:00",
      intervalMs: intervalSeconds * 1000,
      offsetBeforeMs: offsetSeconds * 1000,
      endTime: document.getElementById("config-end-time").value || "",
      maxTriggers: clampNumber(document.getElementById("config-max-triggers").value, 0, 999, 0),
      autostart: Boolean(document.getElementById("config-autostart").checked),
      sound: {
        enabled: document.getElementById("config-sound-enabled").checked,
        type: this.formSoundTypeEl.value === "file" ? "file" : "beep",
        fileUrl: String(document.getElementById("config-sound-file-url").value || "").trim(),
        fileMaxDurationSeconds: clampNumber(
          document.getElementById("config-sound-file-max-seconds").value,
          0,
          86400,
          0,
        ),
        frequency: clampNumber(document.getElementById("config-sound-frequency").value, 100, 2000, 440),
        waveType: document.getElementById("config-sound-wave-type").value,
        volume: clampNumber(document.getElementById("config-sound-volume").value, 0, 1, 0.5),
        durationMs: clampNumber(document.getElementById("config-sound-duration").value, 10, 10000, 320),
        repeatCount: clampNumber(document.getElementById("config-sound-repeat-count").value, 1, 50, 2),
        pauseBetweenMs: clampNumber(document.getElementById("config-sound-pause-between").value, 0, 5000, 140),
      },
    };
  }

  showToast(message, { error = false } = {}) {
    const toast = document.createElement("div");
    toast.className = error ? "toast error" : "toast";
    toast.textContent = message;
    this.toastContainerEl.append(toast);
    setTimeout(() => {
      toast.remove();
    }, 2600);
  }

  triggerVisualBell(timerId) {
    if (!this.globalVisualBellEnabled) {
      return;
    }
    this.runVisualBellSequence(this.headerEl);
    const timerCardEl = this.gridEl.querySelector(`.timer-card[data-timer-id="${timerId}"]`);
    this.runVisualBellSequence(timerCardEl);
  }

  clearAllVisualBellSequences() {
    this.clearVisualBellSequence(this.headerEl);
    const timerCards = this.gridEl.querySelectorAll(".timer-card");
    timerCards.forEach((card) => this.clearVisualBellSequence(card));
  }

  clearVisualBellSequence(element) {
    if (!element) {
      return;
    }
    const timeoutIds = this.visualBellTimeoutsByElement.get(element) || [];
    timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
    this.visualBellTimeoutsByElement.delete(element);
    element.classList.remove("visual-bell-on");
  }

  runVisualBellSequence(element) {
    if (!element) {
      return;
    }
    this.clearVisualBellSequence(element);

    const timeoutIds = [];
    const { count, lengthMs, pauseMs } = this.visualBellConfig;
    const cycleMs = lengthMs + pauseMs;

    for (let index = 0; index < count; index += 1) {
      const startAtMs = cycleMs * index;
      const stopAtMs = startAtMs + lengthMs;

      timeoutIds.push(setTimeout(() => {
        element.classList.add("visual-bell-on");
      }, startAtMs));

      timeoutIds.push(setTimeout(() => {
        element.classList.remove("visual-bell-on");
      }, stopAtMs));
    }

    const doneAtMs = cycleMs * (count - 1) + lengthMs;
    timeoutIds.push(setTimeout(() => {
      this.clearVisualBellSequence(element);
    }, doneAtMs + 1));

    this.visualBellTimeoutsByElement.set(element, timeoutIds);
  }
}

window.formatDuration = formatDuration;
window.UIController = UIController;
