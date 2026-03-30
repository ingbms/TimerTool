const COOKIE_KEY = "timertool_state";
const EXPORT_VERSION = "1.0.0";

function getCookie(name) {
  const encoded = `${encodeURIComponent(name)}=`;
  const entries = document.cookie ? document.cookie.split("; ") : [];
  for (const entry of entries) {
    if (entry.startsWith(encoded)) {
      return decodeURIComponent(entry.slice(encoded.length));
    }
  }
  return "";
}

function setCookie(name, value, maxAgeSeconds = 31536000) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}

function toTimestampLabel(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

class StorageService {
  saveState(stateObject) {
    const serialized = JSON.stringify({
      version: EXPORT_VERSION,
      savedAt: new Date().toISOString(),
      ...stateObject,
    });
    setCookie(COOKIE_KEY, serialized);
  }

  loadState() {
    const serialized = getCookie(COOKIE_KEY);
    if (!serialized) {
      return null;
    }
    try {
      return JSON.parse(serialized);
    } catch (_) {
      return null;
    }
  }

  clearState() {
    setCookie(COOKIE_KEY, "", 0);
  }

  exportToJson(stateObject) {
    return JSON.stringify(
      {
        exportVersion: EXPORT_VERSION,
        exportDate: new Date().toISOString(),
        ...stateObject,
      },
      null,
      2,
    );
  }

  triggerJsonDownload(stateObject) {
    const json = this.exportToJson(stateObject);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `timertool-config-${toTimestampLabel()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  importFromJsonText(jsonText) {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("JSON payload is invalid.");
    }
    if (!Array.isArray(parsed.timers)) {
      throw new Error("Missing timers array in JSON.");
    }
    return parsed;
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsText(file);
    });
  }
}

window.StorageService = StorageService;
