import {
  addSession,
  applyFocusToTabActivity,
  closeTabActivity,
  deleteTabSnapshot,
  getSettings,
  getTabActivity,
  getTabSnapshot,
  initDatabase,
  listTabSnapshots,
  pruneSessionsOlderThan,
  pruneTabActivitiesOlderThan,
  saveTabActivity,
  updateSettings,
  upsertTabSnapshot
} from "../shared/db.js";
import { createSessionEngine } from "./session-engine.js";
import { extractDomain, isExcludedDomain, isTrackableUrl, readableTitle } from "../shared/url.js";

const CLEANUP_ALARM = "retention-cleanup";
const CLEANUP_INTERVAL_MINUTES = 360;
const RUNTIME_STORAGE_KEY = "runtime_state_v2";
const FOCUS_MEANINGFUL_THRESHOLD_SEC = 10;

const state = {
  focusedWindowId: chrome.windows.WINDOW_ID_NONE,
  idleState: "active",
  paused: false,
  excludedDomains: [],
  retentionDays: 30,
  theme: "dark"
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

function createActivityId(tabId, now = Date.now()) {
  return `${now}-${tabId}-${crypto.randomUUID().slice(0, 8)}`;
}

function buildTabActivityRecord(tab, now) {
  return {
    id: createActivityId(tab.id, now),
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url || "",
    title: readableTitle(tab.title, tab.url),
    domain: extractDomain(tab.url),
    openedAt: now,
    lastSeenAt: now,
    closedAt: null,
    everFocused: false,
    totalFocusedSec: 0,
    focusCount: 0,
    lastFocusedAt: null
  };
}

async function refreshSettingsCache() {
  const settings = await getSettings();
  state.paused = Boolean(settings.paused);
  state.retentionDays = Number(settings.retentionDays) || 30;
  state.excludedDomains = Array.isArray(settings.excludedDomains) ? settings.excludedDomains : [];
  state.theme = String(settings.theme || "dark") === "light" ? "light" : "dark";
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

  if (endedSession.activityId) {
    await applyFocusToTabActivity({
      activityId: endedSession.activityId,
      durationSec: endedSession.durationSec,
      focusedAt: endedSession.endAt
    });
  }
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

async function closeTrackedContextForTabId(tabId, now = Date.now()) {
  const snapshot = await getTabSnapshot(tabId);
  if (!snapshot) {
    return null;
  }

  await closeTabActivity(snapshot.activityId, now);
  await deleteTabSnapshot(tabId);
  return snapshot;
}

async function ensureTrackedContext(tab, reason, now = Date.now()) {
  if (!tab || typeof tab.id !== "number") {
    return null;
  }

  const existingSnapshot = await getTabSnapshot(tab.id);
  const trackable = isTrackableTab(tab);

  if (!trackable) {
    if (existingSnapshot) {
      await closeTrackedContextForTabId(tab.id, now);
    }
    return null;
  }

  if (!existingSnapshot) {
    const created = buildTabActivityRecord(tab, now);
    await saveTabActivity(created);
    const snapshot = {
      tabId: tab.id,
      windowId: tab.windowId,
      url: tab.url || "",
      title: readableTitle(tab.title, tab.url),
      activityId: created.id,
      active: Boolean(tab.active),
      lastSeenAt: now
    };
    await upsertTabSnapshot(snapshot);
    return snapshot;
  }

  if (existingSnapshot.url !== (tab.url || "")) {
    await closeTrackedContextForTabId(tab.id, now);

    const created = buildTabActivityRecord(tab, now);
    await saveTabActivity(created);
    const snapshot = {
      tabId: tab.id,
      windowId: tab.windowId,
      url: tab.url || "",
      title: readableTitle(tab.title, tab.url),
      activityId: created.id,
      active: Boolean(tab.active),
      lastSeenAt: now
    };
    await upsertTabSnapshot(snapshot);

    const activeSession = getActiveSession();
    if (activeSession && activeSession.tabId === tab.id) {
      await endActiveSession("navigation");
    }

    return snapshot;
  }

  const currentActivity = await getTabActivity(existingSnapshot.activityId);
  if (currentActivity) {
    await saveTabActivity({
      ...currentActivity,
      tabId: tab.id,
      windowId: tab.windowId,
      url: tab.url || currentActivity.url,
      title: readableTitle(tab.title, tab.url),
      domain: extractDomain(tab.url || currentActivity.url),
      lastSeenAt: now,
      closedAt: null
    });
  }

  const refreshedSnapshot = {
    ...existingSnapshot,
    windowId: tab.windowId,
    url: tab.url || existingSnapshot.url,
    title: readableTitle(tab.title, tab.url),
    active: Boolean(tab.active),
    lastSeenAt: now
  };

  await upsertTabSnapshot(refreshedSnapshot);
  return refreshedSnapshot;
}

async function ensureTrackedContextsForOpenTabs(reason) {
  const tabs = await chrome.tabs.query({});
  const seenTabIds = new Set();

  for (const tab of tabs) {
    seenTabIds.add(tab.id);
    await ensureTrackedContext(tab, reason);
  }

  const snapshots = await listTabSnapshots();
  for (const snapshot of snapshots) {
    if (!seenTabIds.has(snapshot.tabId)) {
      await closeTrackedContextForTabId(snapshot.tabId);
    }
  }
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

function enrichTabWithActivity(tab, snapshot) {
  return {
    ...tab,
    activityId: snapshot?.activityId || ""
  };
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

    const snapshot = await ensureTrackedContext(tab, reason);
    if (!snapshot) {
      await endActiveSession(reason);
      return;
    }

    await startOrSwitchSession(enrichTabWithActivity(tab, snapshot), reason);
  } catch {
    await endActiveSession("unknown");
  }
}

async function runRetentionCleanup() {
  const retentionDays = Math.max(1, state.retentionDays || 30);
  const cutoffTimestampMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  await pruneSessionsOlderThan(cutoffTimestampMs);
  await pruneTabActivitiesOlderThan(cutoffTimestampMs);

  const snapshots = await listTabSnapshots();
  await Promise.all(
    snapshots.map(async (snapshot) => {
      const record = await getTabActivity(snapshot.activityId);
      if (!record || (Number(record.lastSeenAt) || 0) < cutoffTimestampMs) {
        await deleteTabSnapshot(snapshot.tabId);
      }
    })
  );
}

async function openPanelForAllWindows() {
  if (!chrome.sidePanel?.open) {
    return false;
  }

  const windows = await chrome.windows.getAll({ populate: false });
  await Promise.all(
    windows
      .filter((windowEntry) => typeof windowEntry.id === "number")
      .map(async (windowEntry) => {
        try {
          await chrome.sidePanel.open({ windowId: windowEntry.id });
        } catch {
          // Ignore non-supported window types or gesture mismatches.
        }
      })
  );

  return true;
}

async function initializeSidePanelBehavior() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }

  try {
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: false
    });
  } catch (error) {
    console.warn("Unable to configure side panel behavior", error);
  }
}

async function initializeExtension(reason) {
  await initDatabase();
  await refreshSettingsCache();
  await loadRuntimeState();
  await initializeSidePanelBehavior();
  await ensureTrackedContextsForOpenTabs(`bootstrap_${reason}`);

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
  openPanelForAllWindows().catch((error) => {
    console.error("Failed to open side panel", error);
  });
});

chrome.tabs.onCreated.addListener((tab) => {
  ensureTrackedContext(tab, "tab_created").catch((error) => {
    console.error("Failed to track created tab", error);
  });
});

chrome.tabs.onActivated.addListener(() => {
  syncCurrentActiveContext("tab_switch").catch((error) => {
    console.error("Failed to sync on tab activation", error);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  ensureTrackedContext(tab, "tab_updated").catch((error) => {
    console.error("Failed to track updated tab", error);
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

  closeTrackedContextForTabId(tabId)
    .then(async () => {
      if (activeSession && tabId === activeSession.tabId) {
        await endActiveSession("tab_closed");
        await syncCurrentActiveContext("tab_closed");
      }
    })
    .catch((error) => {
      console.error("Failed to handle tab close", error);
    });
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
        await ensureTrackedContextsForOpenTabs("settings_updated");
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

  if (message?.type === "set-theme") {
    updateSettings({ theme: message.theme })
      .then(async (settings) => {
        state.theme = settings.theme;
        sendResponse({ ok: true, theme: settings.theme });
      })
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "open-full-dashboard") {
    chrome.tabs.create({ url: getDashboardUrl() });
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "open-side-panel") {
    openPanelForAllWindows()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "get-runtime-status") {
    const runtimeState = sessionEngine.readState();
    sendResponse({
      ok: true,
      activeSession: runtimeState.activeSession,
      paused: state.paused,
      retentionDays: state.retentionDays,
      idleState: state.idleState,
      theme: state.theme,
      meaningfulThresholdSec: FOCUS_MEANINGFUL_THRESHOLD_SEC
    });
    return false;
  }

  return false;
});

initializeExtension("worker_start").catch((error) => {
  console.error("Initialization failed on worker start", error);
});
