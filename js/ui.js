function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function formatDuration(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalTenths = Math.floor(safeMs / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const pad2 = (value) => String(value).padStart(2, "0");
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${tenths}`;
}

function statusText(status) {
  if (status === "running") {
    return "RUNNING";
  }
  if (status === "paused") {
    return "PAUSED";
  }
  if (status === "completed") {
    return "DONE";
  }
  return "STOPPED";
}

function statusClass(status) {
  if (status === "running" || status === "paused" || status === "completed") {
    return status;
  }
  return "stopped";
}

function formatClockForTimezone(epochMs, timezone) {
  const useLocal = !timezone || timezone === "__local__";
  try {
    const formatter = new Intl.DateTimeFormat("de-DE", {
      ...(useLocal ? {} : { timeZone: timezone }),
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const base = formatter.format(new Date(epochMs));
    const tenth = Math.floor((epochMs % 1000) / 100);
    return `${base}.${tenth}`;
  } catch (_) {
    const fallback = new Date(epochMs).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const tenth = Math.floor((epochMs % 1000) / 100);
    return `${fallback}.${tenth}`;
  }
}

function timerCardTemplate(snapshot) {
  return `
    <article class="timer-card ${statusClass(snapshot.status)}" data-timer-id="${snapshot.id}">
      <div class="timer-head">
        <h3 class="timer-name" data-role="timer-name"></h3>
        <span class="status-badge ${statusClass(snapshot.status)}" data-role="timer-status"></span>
      </div>
      <div class="timer-display" data-role="timer-display">00:00:00.0</div>
      <div class="timer-meta" data-role="timer-meta"></div>
      <div class="timer-controls">
        <button type="button" class="btn btn-primary" data-action="start">Start</button>
        <button type="button" class="btn btn-secondary" data-action="pause-resume">Pause</button>
        <button type="button" class="btn btn-secondary" data-action="reset">Reset</button>
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

    this.gridEl = document.getElementById("timers-grid");
    this.clockEl = document.getElementById("clock-display");
    this.syncStatusEl = document.getElementById("sync-status");
    this.toastContainerEl = document.getElementById("toast-container");
    this.modalEl = document.getElementById("timer-config-modal");
    this.formEl = document.getElementById("timer-config-form");
    this.fileInputEl = document.getElementById("json-file-input");
    this.formTimerIdEl = document.getElementById("config-timer-id");
    this.formModeEl = document.getElementById("config-mode");
    this.countdownFieldsEl = document.getElementById("countdown-fields");
    this.scheduleFieldsEl = document.getElementById("schedule-fields");
    this.fileUrlWrapperEl = document.getElementById("file-url-wrapper");
    this.formSoundTypeEl = document.getElementById("config-sound-type");

    this.wireGlobalControls();
    this.wireModalControls();
    this.wireGridEvents();
  }

  wireGlobalControls() {
    document.getElementById("start-all-btn").addEventListener("click", () => this.handlers.startAll());
    document.getElementById("pause-all-btn").addEventListener("click", () => this.handlers.pauseAll());
    document.getElementById("resume-all-btn").addEventListener("click", () => this.handlers.resumeAll());
    document.getElementById("reset-all-btn").addEventListener("click", () => this.handlers.resetAll());
    document.getElementById("sync-now-btn").addEventListener("click", () => this.handlers.syncNow());
    document.getElementById("save-json-btn").addEventListener("click", () => this.handlers.saveJson());
    document.getElementById("load-json-btn").addEventListener("click", () => this.fileInputEl.click());

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

      if (action === "start") {
        this.handlers.startTimer(timerId);
      } else if (action === "pause-resume") {
        this.handlers.togglePauseResume(timerId);
      } else if (action === "reset") {
        this.handlers.resetTimer(timerId);
      } else if (action === "config") {
        this.openConfigModal(timerId);
      }
    });
  }

  wireModalControls() {
    document.getElementById("modal-cancel-btn").addEventListener("click", () => this.closeConfigModal());
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
    const timezoneSelect = document.getElementById("timezone-select");
    timezoneSelect.value = this.timezone;
    if (timezoneSelect.value !== this.timezone) {
      this.timezone = "__local__";
      timezoneSelect.value = "__local__";
    }
    if (settings.ntpIntervalMinutes) {
      document.getElementById("ntp-interval-minutes").value = String(settings.ntpIntervalMinutes);
    }

    this.gridEl.innerHTML = initialSnapshots.map((snapshot) => timerCardTemplate(snapshot)).join("");
    this.renderSnapshots(initialSnapshots);
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
      const metaEl = card.querySelector('[data-role="timer-meta"]');
      const pauseResumeBtn = card.querySelector('button[data-action="pause-resume"]');

      nameEl.textContent = snapshot.config.name;
      statusEl.textContent = statusText(snapshot.status);
      statusEl.className = `status-badge ${statusClass(snapshot.status)}`;
      displayEl.textContent = formatDuration(snapshot.remainingMs);
      metaEl.textContent = snapshot.metaText || "";

      pauseResumeBtn.textContent = snapshot.status === "paused" ? "Resume" : "Pause";
    });
  }

  updateClock(epochMs) {
    this.clockEl.textContent = formatClockForTimezone(epochMs, this.timezone);
  }

  updateSyncStatus(statusSnapshot) {
    const { lastStatus, lastSyncMs } = statusSnapshot;
    const syncTimeLabel = lastSyncMs
      ? new Date(lastSyncMs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : "--:--:--";
    let statusTextValue = "Zeitquelle: Systemzeit";
    this.syncStatusEl.classList.remove("is-ok", "is-fallback");

    if (lastStatus === "synced") {
      statusTextValue = `Zeitquelle: NTP (letzter Sync ${syncTimeLabel})`;
      this.syncStatusEl.classList.add("is-ok");
    } else if (lastStatus === "offline-fallback") {
      statusTextValue = "Zeitquelle: Offline fallback auf Systemzeit";
      this.syncStatusEl.classList.add("is-fallback");
    } else if (lastStatus === "system-fallback") {
      statusTextValue = "Zeitquelle: NTP nicht erreichbar, nutze Systemzeit";
      this.syncStatusEl.classList.add("is-fallback");
    }
    this.syncStatusEl.textContent = statusTextValue;
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

    document.getElementById("config-sound-enabled").checked = cfg.sound.enabled;
    this.formSoundTypeEl.value = cfg.sound.type;
    document.getElementById("config-sound-file-url").value = cfg.sound.fileUrl || "";
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
      scheduleStart: document.getElementById("config-schedule-start").value || "11:00",
      intervalMs: intervalSeconds * 1000,
      offsetBeforeMs: offsetSeconds * 1000,
      endTime: document.getElementById("config-end-time").value || "",
      maxTriggers: clampNumber(document.getElementById("config-max-triggers").value, 0, 999, 1),
      sound: {
        enabled: document.getElementById("config-sound-enabled").checked,
        type: this.formSoundTypeEl.value === "file" ? "file" : "beep",
        fileUrl: String(document.getElementById("config-sound-file-url").value || "").trim(),
        frequency: clampNumber(document.getElementById("config-sound-frequency").value, 100, 2000, 440),
        waveType: document.getElementById("config-sound-wave-type").value,
        volume: clampNumber(document.getElementById("config-sound-volume").value, 0, 1, 0.5),
        durationMs: clampNumber(document.getElementById("config-sound-duration").value, 50, 10000, 320),
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
