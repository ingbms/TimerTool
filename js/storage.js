const COOKIE_CHUNK_PREFIX = "timertool_state_chunk_";
const COOKIE_CHUNK_COUNT_KEY = "timertool_state_chunk_count";
const LOCAL_STORAGE_KEY = "timertool_state_v1";
const COOKIE_CHUNK_SIZE = 3500;
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

function removeCookie(name) {
  setCookie(name, "", 0);
}

function removeChunkedCookies() {
  const chunkCount = Number(getCookie(COOKIE_CHUNK_COUNT_KEY) || 0);
  for (let i = 0; i < chunkCount; i += 1) {
    removeCookie(`${COOKIE_CHUNK_PREFIX}${i}`);
  }
  removeCookie(COOKIE_CHUNK_COUNT_KEY);
}

function writeChunkedCookie(value) {
  removeChunkedCookies();
  if (!value) {
    return;
  }
  const chunks = [];
  for (let i = 0; i < value.length; i += COOKIE_CHUNK_SIZE) {
    chunks.push(value.slice(i, i + COOKIE_CHUNK_SIZE));
  }
  chunks.forEach((chunk, index) => {
    setCookie(`${COOKIE_CHUNK_PREFIX}${index}`, chunk);
  });
  setCookie(COOKIE_CHUNK_COUNT_KEY, String(chunks.length));
}

function readChunkedCookie() {
  const chunkCount = Number(getCookie(COOKIE_CHUNK_COUNT_KEY) || 0);
  if (!Number.isFinite(chunkCount) || chunkCount <= 0) {
    return "";
  }
  let data = "";
  for (let i = 0; i < chunkCount; i += 1) {
    const chunk = getCookie(`${COOKIE_CHUNK_PREFIX}${i}`);
    if (!chunk) {
      return "";
    }
    data += chunk;
  }
  return data;
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
    writeChunkedCookie(serialized);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
    } catch (_) {
      return undefined;
    }
    return undefined;
  }

  loadState() {
    const cookieSerialized = readChunkedCookie();
    try {
      if (cookieSerialized) {
        return JSON.parse(cookieSerialized);
      }
    } catch (_) {
      // Fall through to localStorage fallback.
    }
    try {
      const localSerialized = localStorage.getItem(LOCAL_STORAGE_KEY) || "";
      if (!localSerialized) {
        return null;
      }
      return JSON.parse(localSerialized);
    } catch (_) {
      return null;
    }
  }

  clearState() {
    removeChunkedCookies();
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (_) {
      return undefined;
    }
    return undefined;
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
