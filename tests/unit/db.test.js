import assert from "node:assert/strict";
import test from "node:test";

import { IDBKeyRange, indexedDB } from "fake-indexeddb";

import {
  __resetDatabaseForTests,
  addSession,
  applyFocusToTabActivity,
  getSettings,
  initDatabase,
  listSessionsInRange,
  listTabActivitiesInRange,
  pruneSessionsOlderThan,
  pruneTabActivitiesOlderThan,
  saveTabActivity,
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

test("normalizes settings and enforces minimum retention with theme", async () => {
  const result = await updateSettings({
    retentionDays: 0,
    paused: "not-a-bool",
    excludedDomains: ["Example.com", " example.com ", "", "docs.example.com"],
    theme: "light"
  });

  assert.equal(result.retentionDays, 1);
  assert.equal(result.paused, false);
  assert.equal(result.theme, "light");
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

test("stores and filters tab activities in range", async () => {
  await saveTabActivity({
    id: "activity-old",
    tabId: 1,
    windowId: 1,
    url: "https://example.com/old",
    title: "Old",
    domain: "example.com",
    openedAt: 1_000,
    lastSeenAt: 2_000,
    everFocused: false,
    totalFocusedSec: 0
  });

  await saveTabActivity({
    id: "activity-new",
    tabId: 2,
    windowId: 1,
    url: "https://example.com/new",
    title: "New",
    domain: "example.com",
    openedAt: 6_000,
    lastSeenAt: 7_000,
    everFocused: true,
    totalFocusedSec: 12
  });

  const result = await listTabActivitiesInRange(5_000, 8_000);
  assert.deepEqual(
    result.map((item) => item.id),
    ["activity-new"]
  );
});

test("applies focus duration to tab activity aggregates", async () => {
  await saveTabActivity({
    id: "activity-focus",
    tabId: 10,
    windowId: 2,
    url: "https://example.com/focus",
    title: "Focus",
    domain: "example.com",
    openedAt: 10_000,
    lastSeenAt: 10_000,
    everFocused: false,
    totalFocusedSec: 0,
    focusCount: 0
  });

  const updated = await applyFocusToTabActivity({
    activityId: "activity-focus",
    durationSec: 14,
    focusedAt: 11_200
  });

  assert.equal(updated.everFocused, true);
  assert.equal(updated.totalFocusedSec, 14);
  assert.equal(updated.focusCount, 1);
  assert.equal(updated.lastFocusedAt, 11_200);
  assert.equal(updated.lastSeenAt, 11_200);
});

test("prunes old session and tab activity data", async () => {
  await addSession({
    id: "session-old",
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
    id: "session-new",
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

  await saveTabActivity({
    id: "activity-old",
    tabId: 1,
    windowId: 1,
    url: "https://example.com/old",
    title: "Old",
    domain: "example.com",
    openedAt: 1_000,
    lastSeenAt: 2_000,
    everFocused: false,
    totalFocusedSec: 0
  });
  await saveTabActivity({
    id: "activity-new",
    tabId: 2,
    windowId: 1,
    url: "https://example.com/new",
    title: "New",
    domain: "example.com",
    openedAt: 10_000,
    lastSeenAt: 11_000,
    everFocused: true,
    totalFocusedSec: 8
  });

  const deletedSessions = await pruneSessionsOlderThan(5_000);
  const deletedActivities = await pruneTabActivitiesOlderThan(5_000);
  assert.equal(deletedSessions, 1);
  assert.equal(deletedActivities, 1);

  const sessions = await listSessionsInRange(0, 20_000);
  const activities = await listTabActivitiesInRange(0, 20_000);
  assert.deepEqual(
    sessions.map((item) => item.id),
    ["session-new"]
  );
  assert.deepEqual(
    activities.map((item) => item.id),
    ["activity-new"]
  );
});

test("returns empty list for invalid range inputs", async () => {
  const sessions = await listSessionsInRange(Number.NaN, Number.NaN);
  const tabActivities = await listTabActivitiesInRange(Number.NaN, Number.NaN);
  assert.deepEqual(sessions, []);
  assert.deepEqual(tabActivities, []);
});
