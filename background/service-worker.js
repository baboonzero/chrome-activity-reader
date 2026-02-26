import {
  addSession,
  getSettings,
  initDatabase,
  pruneSessionsOlderThan,
  upsertTabSnapshot
} from "../shared/db.js";
import { createSessionEngine } from "./session-engine.js";
import { isExcludedDomain, isTrackableUrl, readableTitle } from "../shared/url.js";

const CLEANUP_ALARM = "retention-cleanup";
const CLEANUP_INTERVAL_MINUTES = 360;
const RUNTIME_STORAGE_KEY = "runtime_state_v1";

const state = {
  focusedWindowId: chrome.windows.WINDOW_ID_NONE,
  idleState: "active",
  paused: false,
  excludedDomains: [],
  retentionDays: 30
};

const sessionEngine = createSessionEngine({
  debounceMs: 250,
  isTrackableTab
});

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

async function refreshSettingsCache() {
  const settings = await getSettings();
  state.paused = Boolean(settings.paused);
  state.retentionDays = Number(settings.retentionDays) || 30;
  state.excludedDomains = Array.isArray(settings.excludedDomains) ? settings.excludedDomains : [];
}

function getActiveSession() {
  return sessionEngine.readState().activeSession;
}

async function persistRuntimeState() {
  const runtimeState = sessionEngine.exportRuntimeState();
  if (runtimeState.activeSession) {
    await chrome.storage.local.set({
      [RUNTIME_STORAGE_KEY]: runtimeState
    });
    return;
  }

  await chrome.storage.local.remove(RUNTIME_STORAGE_KEY);
}

async function loadRuntimeState() {
  const stored = await chrome.storage.local.get(RUNTIME_STORAGE_KEY);
  const runtimeState = stored?.[RUNTIME_STORAGE_KEY];
  if (!runtimeState) {
    return false;
  }

  return sessionEngine.hydrateRuntimeState(runtimeState);
}

async function storeEndedSession(endedSession) {
  if (!endedSession || !endedSession.url || endedSession.durationSec < 0) {
    return;
  }

  await addSession(endedSession);
}

async function endActiveSession(reason) {
  const endedSession = sessionEngine.endActiveSession(reason);
  await persistRuntimeState();
  await storeEndedSession(endedSession);
  return endedSession;
}

async function startOrSwitchSession(tab, reason) {
  const result = sessionEngine.startOrSwitchSession(tab, reason);
  await persistRuntimeState();
  await storeEndedSession(result.endedSession);
  return result;
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
  await loadRuntimeState();

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

  const activeSessionChanged = sessionEngine.updateActiveSessionMetadata(tabId, changeInfo);
  if (activeSessionChanged) {
    persistRuntimeState().catch((error) => {
      console.error("Failed to persist runtime state on metadata update", error);
    });
  }

  if (tab && tab.active && tab.windowId === state.focusedWindowId && (changeInfo.url || changeInfo.status === "complete")) {
    syncCurrentActiveContext("navigation").catch((error) => {
      console.error("Failed to sync on navigation", error);
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const activeSession = getActiveSession();
  if (activeSession && tabId === activeSession.tabId) {
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
    const runtimeState = sessionEngine.readState();
    sendResponse({
      ok: true,
      activeSession: runtimeState.activeSession,
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
