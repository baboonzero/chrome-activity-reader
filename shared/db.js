const DB_NAME = "chrome-activity-reader";
const DB_VERSION = 1;

const STORE_SESSIONS = "sessions";
const STORE_TAB_SNAPSHOT = "tab_snapshot";
const STORE_SETTINGS = "settings";

export const DEFAULT_SETTINGS = Object.freeze({
  retentionDays: 30,
  paused: false,
  excludedDomains: []
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

  return {
    retentionDays: typeof retentionDays === "number" ? retentionDays : DEFAULT_SETTINGS.retentionDays,
    paused: typeof paused === "boolean" ? paused : DEFAULT_SETTINGS.paused,
    excludedDomains: Array.isArray(excludedDomains) ? excludedDomains : [...DEFAULT_SETTINGS.excludedDomains]
  };
}

export async function updateSettings(partialSettings) {
  const db = await openDatabase();
  const current = await getSettings();
  const next = {
    ...current,
    ...partialSettings
  };

  await putSettingValueInternal(db, "retentionDays", next.retentionDays);
  await putSettingValueInternal(db, "paused", next.paused);
  await putSettingValueInternal(db, "excludedDomains", next.excludedDomains);

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
  const db = await openDatabase();
  const tx = db.transaction(STORE_SESSIONS, "readonly");
  const store = tx.objectStore(STORE_SESSIONS);
  const index = store.index("endAt");
  const range = IDBKeyRange.lowerBound(startAt);
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
      if (value.startAt <= endAt) {
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

export async function upsertTabSnapshot(snapshot) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_TAB_SNAPSHOT, "readwrite");
  tx.objectStore(STORE_TAB_SNAPSHOT).put(snapshot);
  await transactionDonePromise(tx);
}

export async function pruneSessionsOlderThan(cutoffTimestampMs) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_SESSIONS, "readwrite");
  const index = tx.objectStore(STORE_SESSIONS).index("endAt");
  const range = IDBKeyRange.upperBound(cutoffTimestampMs, true);
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
