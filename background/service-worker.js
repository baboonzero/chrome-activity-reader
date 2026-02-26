import {
  addSession,
  getSettings,
  initDatabase,
  pruneSessionsOlderThan,
  upsertTabSnapshot
} from "../shared/db.js";
import { toDurationSeconds } from "../shared/time.js";
import { extractDomain, isExcludedDomain, isTrackableUrl, readableTitle } from "../shared/url.js";

const CLEANUP_ALARM = "retention-cleanup";
const CLEANUP_INTERVAL_MINUTES = 360;
const SWITCH_DEBOUNCE_MS = 250;

const state = {
  activeSession: null,
  focusedWindowId: chrome.windows.WINDOW_ID_NONE,
  idleState: "active",
  paused: false,
  excludedDomains: [],
  retentionDays: 30,
  lastContextFingerprint: "",
  lastContextAt: 0
};

function getDashboardUrl() {
  return chrome.runtime.getURL("ui/dashboard.html");
}

function isTrackableTab(tab) {
  if (!tab || typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    return false;
  }

  if (!isTrackableUrl(tab.url)) {
    return false;
  }

  if (isExcludedDomain(tab.url, state.excludedDomains)) {
    return false;
  }

  return true;
}

function createSession(tab) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    title: readableTitle(tab.title, tab.url),
    domain: extractDomain(tab.url),
    startAt: now,
    endAt: now,
    durationSec: 0,
    endReason: "unknown"
  };
}

async function refreshSettingsCache() {
  const settings = await getSettings();
  state.paused = Boolean(settings.paused);
  state.retentionDays = Number(settings.retentionDays) || 30;
  state.excludedDomains = Array.isArray(settings.excludedDomains) ? settings.excludedDomains : [];
}

async function endActiveSession(reason) {
  if (!state.activeSession) {
    return;
  }

  const now = Date.now();
  const completed = {
    ...state.activeSession,
    endAt: now,
    durationSec: toDurationSeconds(state.activeSession.startAt, now),
    endReason: reason
  };

  state.activeSession = null;
  state.lastContextFingerprint = "";
  state.lastContextAt = 0;

  if (!completed.url || completed.durationSec < 0) {
    return;
  }

  await addSession(completed);
}

function isDebouncedContext(tab) {
  const fingerprint = `${tab.windowId}:${tab.id}:${tab.url}`;
  const now = Date.now();
  const isDebounced =
    fingerprint === state.lastContextFingerprint && now - state.lastContextAt < SWITCH_DEBOUNCE_MS;

  state.lastContextFingerprint = fingerprint;
  state.lastContextAt = now;
  return isDebounced;
}

async function startOrSwitchSession(tab, reason) {
  if (!isTrackableTab(tab)) {
    await endActiveSession(reason);
    return;
  }

  if (isDebouncedContext(tab)) {
    return;
  }

  if (
    state.activeSession &&
    state.activeSession.tabId === tab.id &&
    state.activeSession.windowId === tab.windowId
  ) {
    state.activeSession.url = tab.url || state.activeSession.url;
    state.activeSession.title = readableTitle(tab.title, state.activeSession.url);
    state.activeSession.domain = extractDomain(state.activeSession.url);
    return;
  }

  await endActiveSession(reason);
  state.activeSession = createSession(tab);
}

async function cacheTabSnapshot(tab) {
  if (!tab || typeof tab.id !== "number") {
    return;
  }

  await upsertTabSnapshot({
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url || "",
    title: readableTitle(tab.title, tab.url),
    active: Boolean(tab.active),
    lastSeenAt: Date.now()
  });
}

async function getFocusedWindowId() {
  try {
    const lastFocused = await chrome.windows.getLastFocused();
    if (lastFocused && lastFocused.focused && typeof lastFocused.id === "number") {
      return lastFocused.id;
    }
  } catch {
    return chrome.windows.WINDOW_ID_NONE;
  }

  return chrome.windows.WINDOW_ID_NONE;
}

async function syncCurrentActiveContext(reason) {
  if (state.paused || state.idleState !== "active") {
    await endActiveSession(reason);
    return;
  }

  if (state.focusedWindowId === chrome.windows.WINDOW_ID_NONE) {
    await endActiveSession(reason);
    return;
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, windowId: state.focusedWindowId });
    const tab = tabs[0];
    if (!tab) {
      await endActiveSession(reason);
      return;
    }

    await cacheTabSnapshot(tab);
    await startOrSwitchSession(tab, reason);
  } catch {
    await endActiveSession("unknown");
  }
}

async function runRetentionCleanup() {
  const retentionDays = Math.max(1, state.retentionDays || 30);
  const cutoffTimestampMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  await pruneSessionsOlderThan(cutoffTimestampMs);
}

async function initializeExtension(reason) {
  await initDatabase();
  await refreshSettingsCache();

  await chrome.alarms.clear(CLEANUP_ALARM);
  await chrome.alarms.create(CLEANUP_ALARM, { periodInMinutes: CLEANUP_INTERVAL_MINUTES });

  await runRetentionCleanup();

  state.focusedWindowId = await getFocusedWindowId();
  await syncCurrentActiveContext(`init_${reason}`);
}

chrome.runtime.onInstalled.addListener(() => {
  initializeExtension("install").catch((error) => {
    console.error("Initialization failed on install", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  initializeExtension("startup").catch((error) => {
    console.error("Initialization failed on startup", error);
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: getDashboardUrl() });
});

chrome.tabs.onActivated.addListener(() => {
  syncCurrentActiveContext("tab_switch").catch((error) => {
    console.error("Failed to sync on tab activation", error);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  cacheTabSnapshot(tab).catch((error) => {
    console.error("Failed to cache tab snapshot", error);
  });

  if (
    state.activeSession &&
    tabId === state.activeSession.tabId &&
    typeof changeInfo.url === "string" &&
    isTrackableUrl(changeInfo.url)
  ) {
    state.activeSession.url = changeInfo.url;
    state.activeSession.domain = extractDomain(changeInfo.url);
  }

  if (state.activeSession && tabId === state.activeSession.tabId && typeof changeInfo.title === "string") {
    state.activeSession.title = readableTitle(changeInfo.title, state.activeSession.url);
  }

  if (tab.active && tab.windowId === state.focusedWindowId && (changeInfo.url || changeInfo.status === "complete")) {
    syncCurrentActiveContext("navigation").catch((error) => {
      console.error("Failed to sync on navigation", error);
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.activeSession && tabId === state.activeSession.tabId) {
    endActiveSession("tab_closed")
      .then(() => syncCurrentActiveContext("tab_closed"))
      .catch((error) => {
        console.error("Failed to handle tab close", error);
      });
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    state.focusedWindowId = chrome.windows.WINDOW_ID_NONE;
    endActiveSession("window_blur").catch((error) => {
      console.error("Failed to end session on window blur", error);
    });
    return;
  }

  state.focusedWindowId = windowId;
  syncCurrentActiveContext("window_focus").catch((error) => {
    console.error("Failed to sync on window focus", error);
  });
});

chrome.idle.onStateChanged.addListener((newState) => {
  state.idleState = newState;
  if (newState === "active") {
    syncCurrentActiveContext("idle_back_active").catch((error) => {
      console.error("Failed to resume after idle", error);
    });
    return;
  }

  const reason = newState === "locked" ? "lock" : "idle";
  endActiveSession(reason).catch((error) => {
    console.error("Failed to end session on idle", error);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== CLEANUP_ALARM) {
    return;
  }

  runRetentionCleanup().catch((error) => {
    console.error("Retention cleanup failed", error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "settings-updated") {
    refreshSettingsCache()
      .then(async () => {
        if (state.paused) {
          await endActiveSession("tracking_paused");
        } else {
          await syncCurrentActiveContext("settings_updated");
        }
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error("Failed to refresh settings", error);
        sendResponse({ ok: false, error: String(error) });
      });
    return true;
  }

  if (message?.type === "get-runtime-status") {
    sendResponse({
      ok: true,
      activeSession: state.activeSession,
      paused: state.paused,
      retentionDays: state.retentionDays,
      idleState: state.idleState
    });
    return false;
  }

  return false;
});

initializeExtension("worker_start").catch((error) => {
  console.error("Initialization failed on worker start", error);
});
