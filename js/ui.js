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

    this.gridEl = document.getElementById("timers-grid");
    this.clockEl = document.getElementById("clock-display");
    this.syncStatusEl = document.getElementById("sync-status");
    this.toastContainerEl = document.getElementById("toast-container");
    this.modalEl = document.getElementById("timer-config-modal");
    this.formEl = document.getElementById("timer-config-form");
    this.fileInputEl = document.getElementById("json-file-input");
    this.globalToneDisableEl = document.getElementById("global-tone-disable");
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

    this.wireGlobalControls();
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

    const timezoneSelect = document.getElementById("timezone-select");
    timezoneSelect.addEventListener("change", (event) => {
      this.timezone = String(event.target.value || "__local__");
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
    const timezoneSelect = document.getElementById("timezone-select");
    timezoneSelect.value = this.timezone;
    if (timezoneSelect.value !== this.timezone) {
      this.timezone = "__local__";
      timezoneSelect.value = "__local__";
    }
    if (settings.ntpIntervalMinutes) {
      document.getElementById("ntp-interval-minutes").value = String(settings.ntpIntervalMinutes);
    }
    if (this.globalToneDisableEl) {
      this.globalToneDisableEl.checked = this.globalToneDisabled;
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
    this.clockEl.textContent = formatClockForTimezone(epochMs, this.timezone);
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
}

window.formatDuration = formatDuration;
window.UIController = UIController;
