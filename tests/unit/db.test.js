import assert from "node:assert/strict";
import test from "node:test";

import { IDBKeyRange, indexedDB } from "fake-indexeddb";

import {
  __resetDatabaseForTests,
  addSession,
  getSettings,
  initDatabase,
  listSessionsInRange,
  pruneSessionsOlderThan,
  updateSettings
} from "../../shared/db.js";

const DB_NAME = "chrome-activity-reader";

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;

async function deleteDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

test.beforeEach(async () => {
  await __resetDatabaseForTests();
  await deleteDatabase();
  await initDatabase();
});

test.after(async () => {
  await __resetDatabaseForTests();
  await deleteDatabase();
});

test("normalizes settings and enforces minimum retention", async () => {
  const result = await updateSettings({
    retentionDays: 0,
    paused: "not-a-bool",
    excludedDomains: ["Example.com", " example.com ", "", "docs.example.com"]
  });

  assert.equal(result.retentionDays, 1);
  assert.equal(result.paused, false);
  assert.deepEqual(result.excludedDomains, ["example.com", "docs.example.com"]);

  const readBack = await getSettings();
  assert.deepEqual(readBack, result);
});

test("returns only sessions overlapping requested time window and sorts newest first", async () => {
  await addSession({
    id: "a",
    tabId: 1,
    windowId: 1,
    url: "https://example.com/a",
    title: "A",
    domain: "example.com",
    startAt: 1_000,
    endAt: 5_000,
    durationSec: 4,
    endReason: "tab_switch"
  });
  await addSession({
    id: "b",
    tabId: 2,
    windowId: 1,
    url: "https://example.com/b",
    title: "B",
    domain: "example.com",
    startAt: 6_000,
    endAt: 7_000,
    durationSec: 1,
    endReason: "tab_switch"
  });
  await addSession({
    id: "c",
    tabId: 3,
    windowId: 1,
    url: "https://example.com/c",
    title: "C",
    domain: "example.com",
    startAt: 8_000,
    endAt: 9_000,
    durationSec: 1,
    endReason: "tab_switch"
  });

  const windowSessions = await listSessionsInRange(4_500, 7_500);
  assert.deepEqual(
    windowSessions.map((item) => item.id),
    ["b", "a"]
  );
});

test("prunes sessions older than cutoff and keeps newer sessions", async () => {
  await addSession({
    id: "old",
    tabId: 1,
    windowId: 1,
    url: "https://example.com/old",
    title: "Old",
    domain: "example.com",
    startAt: 1_000,
    endAt: 2_000,
    durationSec: 1,
    endReason: "tab_switch"
  });
  await addSession({
    id: "new",
    tabId: 2,
    windowId: 1,
    url: "https://example.com/new",
    title: "New",
    domain: "example.com",
    startAt: 10_000,
    endAt: 11_000,
    durationSec: 1,
    endReason: "tab_switch"
  });

  const deletedCount = await pruneSessionsOlderThan(5_000);
  assert.equal(deletedCount, 1);

  const remaining = await listSessionsInRange(0, 20_000);
  assert.deepEqual(
    remaining.map((item) => item.id),
    ["new"]
  );
});

test("returns empty list for invalid range inputs", async () => {
  const sessions = await listSessionsInRange(Number.NaN, Number.NaN);
  assert.deepEqual(sessions, []);
});
