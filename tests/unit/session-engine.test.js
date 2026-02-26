import assert from "node:assert/strict";
import test from "node:test";

import { createSessionEngine } from "../../background/session-engine.js";

function isTrackableTab(tab) {
  return Boolean(tab && tab.url && tab.url.startsWith("https://"));
}

function makeTab(partial = {}) {
  return {
    id: 1,
    windowId: 1,
    url: "https://example.com",
    title: "Example",
    ...partial
  };
}

test("starts a session and switches to a new session with a completed previous one", () => {
  let now = 1_000;
  let idCounter = 0;

  const engine = createSessionEngine({
    isTrackableTab,
    nowProvider: () => now,
    idGenerator: () => `session-${++idCounter}`
  });

  const first = engine.startOrSwitchSession(makeTab({ id: 10, windowId: 2 }), "init");
  assert.equal(first.transition, "switched_or_started");
  assert.equal(first.endedSession, null);
  assert.equal(first.activeSession.id, "session-1");
  assert.equal(first.activeSession.startAt, 1_000);

  now = 5_500;
  const second = engine.startOrSwitchSession(makeTab({ id: 20, windowId: 2, url: "https://docs.example.com" }), "tab_switch");
  assert.equal(second.transition, "switched_or_started");
  assert.ok(second.endedSession);
  assert.equal(second.endedSession.id, "session-1");
  assert.equal(second.endedSession.endReason, "tab_switch");
  assert.equal(second.endedSession.startAt, 1_000);
  assert.equal(second.endedSession.endAt, 5_500);
  assert.equal(second.endedSession.durationSec, 5);
  assert.equal(second.activeSession.id, "session-2");
});

test("updates same-session metadata without ending it", () => {
  let now = 10_000;
  const engine = createSessionEngine({
    isTrackableTab,
    nowProvider: () => now,
    idGenerator: () => "session-fixed"
  });

  engine.startOrSwitchSession(makeTab({ id: 99, title: "First title" }), "init");
  const updateResult = engine.startOrSwitchSession(
    makeTab({ id: 99, title: "Updated title", url: "https://example.com/next" }),
    "navigation"
  );

  assert.equal(updateResult.transition, "updated_same_session");
  assert.equal(updateResult.endedSession, null);
  assert.equal(updateResult.activeSession.id, "session-fixed");
  assert.equal(updateResult.activeSession.title, "Updated title");
  assert.equal(updateResult.activeSession.url, "https://example.com/next");
});

test("debounces rapid duplicate context transitions", () => {
  let now = 2_000;
  const engine = createSessionEngine({
    isTrackableTab,
    debounceMs: 250,
    nowProvider: () => now,
    idGenerator: () => "session-1"
  });

  engine.startOrSwitchSession(makeTab(), "init");
  now = 2_100;
  const debounced = engine.startOrSwitchSession(makeTab(), "tab_switch");

  assert.equal(debounced.transition, "noop_debounced");
  assert.equal(debounced.changed, false);
  assert.equal(debounced.endedSession, null);
  assert.equal(debounced.activeSession.id, "session-1");
});

test("ends active session when context becomes non-trackable", () => {
  let now = 3_000;
  const engine = createSessionEngine({
    isTrackableTab,
    nowProvider: () => now,
    idGenerator: () => "session-1"
  });

  engine.startOrSwitchSession(makeTab(), "init");
  now = 6_200;
  const transition = engine.startOrSwitchSession(
    makeTab({ url: "chrome://settings" }),
    "navigation_non_trackable"
  );

  assert.equal(transition.transition, "ended_non_trackable");
  assert.ok(transition.endedSession);
  assert.equal(transition.endedSession.durationSec, 3);
  assert.equal(transition.activeSession, null);
});

test("hydrates runtime state and keeps the original session start on worker restore", () => {
  let now = 4_000;
  const firstEngine = createSessionEngine({
    isTrackableTab,
    nowProvider: () => now,
    idGenerator: () => "session-restore"
  });

  firstEngine.startOrSwitchSession(makeTab({ id: 7, windowId: 8, url: "https://example.com/restore" }), "init");
  const runtimeState = firstEngine.exportRuntimeState();

  now = 9_500;
  const restoredEngine = createSessionEngine({
    isTrackableTab,
    nowProvider: () => now,
    idGenerator: () => "session-new"
  });

  const hydrated = restoredEngine.hydrateRuntimeState(runtimeState);
  assert.equal(hydrated, true);

  const transition = restoredEngine.startOrSwitchSession(
    makeTab({ id: 7, windowId: 8, url: "https://example.com/restore", title: "Restored title" }),
    "worker_resume"
  );

  assert.equal(transition.transition, "updated_same_session");
  assert.equal(transition.endedSession, null);
  assert.equal(transition.activeSession.id, "session-restore");
  assert.equal(transition.activeSession.startAt, 4_000);
  assert.equal(transition.activeSession.title, "Restored title");
});
