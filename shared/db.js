const DB_NAME = "chrome-activity-reader";
const DB_VERSION = 2;

const STORE_SESSIONS = "sessions";
const STORE_TAB_SNAPSHOT = "tab_snapshot";
const STORE_TAB_ACTIVITY = "tab_activity";
const STORE_SETTINGS = "settings";

export const DEFAULT_SETTINGS = Object.freeze({
  retentionDays: 30,
  paused: false,
  excludedDomains: [],
  theme: "dark"
});

let dbPromise;

function openDatabase() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const sessions = db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
        sessions.createIndex("startAt", "startAt", { unique: false });
        sessions.createIndex("endAt", "endAt", { unique: false });
        sessions.createIndex("domain_startAt", ["domain", "startAt"], { unique: false });
        sessions.createIndex("url_startAt", ["url", "startAt"], { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_TAB_SNAPSHOT)) {
        db.createObjectStore(STORE_TAB_SNAPSHOT, { keyPath: "tabId" });
      }

      if (!db.objectStoreNames.contains(STORE_TAB_ACTIVITY)) {
        const activity = db.createObjectStore(STORE_TAB_ACTIVITY, { keyPath: "id" });
        activity.createIndex("openedAt", "openedAt", { unique: false });
        activity.createIndex("lastSeenAt", "lastSeenAt", { unique: false });
        activity.createIndex("domain_lastSeenAt", ["domain", "lastSeenAt"], { unique: false });
        activity.createIndex("totalFocusedSec", "totalFocusedSec", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDonePromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function normalizeSettings(input) {
  const rawRetentionDays = Number(input?.retentionDays);
  const retentionDays = Number.isFinite(rawRetentionDays)
    ? Math.max(1, Math.round(rawRetentionDays))
    : DEFAULT_SETTINGS.retentionDays;

  const paused = typeof input?.paused === "boolean" ? input.paused : DEFAULT_SETTINGS.paused;

  const excludedDomainSet = new Set(
    Array.isArray(input?.excludedDomains)
      ? input.excludedDomains
          .map((value) => String(value || "").trim().toLowerCase())
          .filter(Boolean)
      : [...DEFAULT_SETTINGS.excludedDomains]
  );

  const theme = String(input?.theme || DEFAULT_SETTINGS.theme).toLowerCase() === "light" ? "light" : "dark";

  return {
    retentionDays,
    paused,
    excludedDomains: [...excludedDomainSet],
    theme
  };
}

async function getSettingValueInternal(db, key) {
  const tx = db.transaction(STORE_SETTINGS, "readonly");
  const store = tx.objectStore(STORE_SETTINGS);
  const record = await requestToPromise(store.get(key));
  await transactionDonePromise(tx);
  return record ? record.value : undefined;
}

async function putSettingValueInternal(db, key, value) {
  const tx = db.transaction(STORE_SETTINGS, "readwrite");
  const store = tx.objectStore(STORE_SETTINGS);
  store.put({ key, value });
  await transactionDonePromise(tx);
}

function normalizeTabActivity(activity) {
  if (!activity || typeof activity !== "object") {
    throw new Error("normalizeTabActivity requires object input");
  }

  const id = String(activity.id || "").trim();
  if (!id) {
    throw new Error("Tab activity id is required");
  }

  return {
    id,
    tabId: Number(activity.tabId),
    windowId: Number(activity.windowId),
    url: String(activity.url || ""),
    title: String(activity.title || ""),
    domain: String(activity.domain || ""),
    openedAt: Number(activity.openedAt) || Date.now(),
    lastSeenAt: Number(activity.lastSeenAt) || Date.now(),
    closedAt: Number.isFinite(Number(activity.closedAt)) ? Number(activity.closedAt) : null,
    everFocused: Boolean(activity.everFocused),
    totalFocusedSec: Math.max(0, Number(activity.totalFocusedSec) || 0),
    focusCount: Math.max(0, Number(activity.focusCount) || 0),
    lastFocusedAt: Number.isFinite(Number(activity.lastFocusedAt)) ? Number(activity.lastFocusedAt) : null
  };
}

export async function initDatabase() {
  const db = await openDatabase();
  const settings = await getSettings();
  await updateSettings(settings);
  return db;
}

export async function getSettings() {
  const db = await openDatabase();

  const retentionDays = await getSettingValueInternal(db, "retentionDays");
  const paused = await getSettingValueInternal(db, "paused");
  const excludedDomains = await getSettingValueInternal(db, "excludedDomains");
  const theme = await getSettingValueInternal(db, "theme");

  return normalizeSettings({
    retentionDays,
    paused,
    excludedDomains,
    theme
  });
}

export async function updateSettings(partialSettings) {
  const db = await openDatabase();
  const current = await getSettings();
  const next = normalizeSettings({
    ...current,
    ...partialSettings
  });

  await putSettingValueInternal(db, "retentionDays", next.retentionDays);
  await putSettingValueInternal(db, "paused", next.paused);
  await putSettingValueInternal(db, "excludedDomains", next.excludedDomains);
  await putSettingValueInternal(db, "theme", next.theme);

  return next;
}

export async function resetSettingsToDefaults() {
  return updateSettings(DEFAULT_SETTINGS);
}

export async function addSession(session) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_SESSIONS, "readwrite");
  tx.objectStore(STORE_SESSIONS).put(session);
  await transactionDonePromise(tx);
  return session;
}

export async function listSessionsInRange(startAt, endAt) {
  const safeStartAt = Math.min(Number(startAt), Number(endAt));
  const safeEndAt = Math.max(Number(startAt), Number(endAt));

  if (!Number.isFinite(safeStartAt) || !Number.isFinite(safeEndAt)) {
    return [];
  }

  const db = await openDatabase();
  const tx = db.transaction(STORE_SESSIONS, "readonly");
  const store = tx.objectStore(STORE_SESSIONS);
  const index = store.index("endAt");
  const range = IDBKeyRange.bound(safeStartAt, safeEndAt);
  const sessions = [];

  await new Promise((resolve, reject) => {
    const cursorRequest = index.openCursor(range);

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }

      const value = cursor.value;
      if (value.startAt <= safeEndAt && value.endAt >= safeStartAt) {
        sessions.push(value);
      }

      cursor.continue();
    };

    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  await transactionDonePromise(tx);
  sessions.sort((a, b) => b.startAt - a.startAt);
  return sessions;
}

export async function pruneSessionsOlderThan(cutoffTimestampMs) {
  const cutoff = Number(cutoffTimestampMs);
  if (!Number.isFinite(cutoff)) {
    return 0;
  }

  const db = await openDatabase();
  const tx = db.transaction(STORE_SESSIONS, "readwrite");
  const index = tx.objectStore(STORE_SESSIONS).index("endAt");
  const range = IDBKeyRange.upperBound(cutoff, true);
  let deletedCount = 0;

  await new Promise((resolve, reject) => {
    const cursorRequest = index.openCursor(range);

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }

      cursor.delete();
      deletedCount += 1;
      cursor.continue();
    };

    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  await transactionDonePromise(tx);
  return deletedCount;
}

export async function upsertTabSnapshot(snapshot) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_TAB_SNAPSHOT, "readwrite");
  tx.objectStore(STORE_TAB_SNAPSHOT).put(snapshot);
  await transactionDonePromise(tx);
  return snapshot;
}

export async function getTabSnapshot(tabId) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_TAB_SNAPSHOT, "readonly");
  const record = await requestToPromise(tx.objectStore(STORE_TAB_SNAPSHOT).get(tabId));
  await transactionDonePromise(tx);
  return record || null;
}

export async function deleteTabSnapshot(tabId) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_TAB_SNAPSHOT, "readwrite");
  tx.objectStore(STORE_TAB_SNAPSHOT).delete(tabId);
  await transactionDonePromise(tx);
}

export async function listTabSnapshots() {
  const db = await openDatabase();
  const tx = db.transaction(STORE_TAB_SNAPSHOT, "readonly");
  const snapshots = [];

  await new Promise((resolve, reject) => {
    const cursorRequest = tx.objectStore(STORE_TAB_SNAPSHOT).openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      snapshots.push(cursor.value);
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  await transactionDonePromise(tx);
  return snapshots;
}

export async function saveTabActivity(activity) {
  const normalized = normalizeTabActivity(activity);
  const db = await openDatabase();
  const tx = db.transaction(STORE_TAB_ACTIVITY, "readwrite");
  tx.objectStore(STORE_TAB_ACTIVITY).put(normalized);
  await transactionDonePromise(tx);
  return normalized;
}

export async function getTabActivity(id) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_TAB_ACTIVITY, "readonly");
  const record = await requestToPromise(tx.objectStore(STORE_TAB_ACTIVITY).get(id));
  await transactionDonePromise(tx);
  return record || null;
}

export async function listAllTabActivities() {
  const db = await openDatabase();
  const tx = db.transaction(STORE_TAB_ACTIVITY, "readonly");
  const activities = [];

  await new Promise((resolve, reject) => {
    const cursorRequest = tx.objectStore(STORE_TAB_ACTIVITY).openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      activities.push(cursor.value);
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  await transactionDonePromise(tx);
  return activities;
}

export async function listTabActivitiesInRange(startAt, endAt) {
  const safeStartAt = Math.min(Number(startAt), Number(endAt));
  const safeEndAt = Math.max(Number(startAt), Number(endAt));

  if (!Number.isFinite(safeStartAt) || !Number.isFinite(safeEndAt)) {
    return [];
  }

  const activities = await listAllTabActivities();
  return activities.filter((item) => {
    const openedAt = Number(item.openedAt) || 0;
    const lastSeenAt = Number(item.lastSeenAt) || 0;
    return openedAt <= safeEndAt && lastSeenAt >= safeStartAt;
  });
}

export async function applyFocusToTabActivity({ activityId, durationSec, focusedAt }) {
  const id = String(activityId || "").trim();
  if (!id) {
    return null;
  }

  const base = await getTabActivity(id);
  if (!base) {
    return null;
  }

  const next = {
    ...base,
    everFocused: true,
    totalFocusedSec: Math.max(0, Number(base.totalFocusedSec) || 0) + Math.max(0, Number(durationSec) || 0),
    focusCount: Math.max(0, Number(base.focusCount) || 0) + 1,
    lastFocusedAt: Number(focusedAt) || Date.now(),
    lastSeenAt: Math.max(Number(base.lastSeenAt) || 0, Number(focusedAt) || 0)
  };

  return saveTabActivity(next);
}

export async function closeTabActivity(id, closedAt) {
  const record = await getTabActivity(id);
  if (!record) {
    return null;
  }

  const closeAtValue = Number(closedAt) || Date.now();
  return saveTabActivity({
    ...record,
    closedAt: closeAtValue,
    lastSeenAt: Math.max(Number(record.lastSeenAt) || 0, closeAtValue)
  });
}

export async function pruneTabActivitiesOlderThan(cutoffTimestampMs) {
  const cutoff = Number(cutoffTimestampMs);
  if (!Number.isFinite(cutoff)) {
    return 0;
  }

  const db = await openDatabase();
  const tx = db.transaction(STORE_TAB_ACTIVITY, "readwrite");
  const index = tx.objectStore(STORE_TAB_ACTIVITY).index("lastSeenAt");
  const range = IDBKeyRange.upperBound(cutoff, true);
  let deletedCount = 0;

  await new Promise((resolve, reject) => {
    const cursorRequest = index.openCursor(range);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      deletedCount += 1;
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  await transactionDonePromise(tx);
  return deletedCount;
}

export async function __resetDatabaseForTests() {
  if (!dbPromise) {
    return;
  }

  try {
    const db = await dbPromise;
    db.close();
  } catch {
    // Ignore reset failures in tests.
  } finally {
    dbPromise = undefined;
  }
}
