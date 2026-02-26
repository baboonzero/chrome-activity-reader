import { extractDomain, readableTitle } from "../shared/url.js";

function defaultIdGenerator() {
  return crypto.randomUUID();
}

function defaultNowProvider() {
  return Date.now();
}

function normalizeSessionShape(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const startAt = Number(input.startAt);
  const endAt = Number(input.endAt);
  const durationSec = Number(input.durationSec);

  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
    return null;
  }

  return {
    id: String(input.id || defaultIdGenerator()),
    activityId: String(input.activityId || ""),
    tabId: Number(input.tabId),
    windowId: Number(input.windowId),
    url: String(input.url || ""),
    title: readableTitle(input.title, input.url),
    domain: extractDomain(input.url),
    startAt,
    endAt,
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    endReason: String(input.endReason || "unknown")
  };
}

function createSessionFromTab(tab, now, idGenerator) {
  return {
    id: idGenerator(),
    activityId: String(tab.activityId || ""),
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

function buildFingerprint(tab) {
  return `${tab.windowId}:${tab.id}:${tab.url || ""}`;
}

function toDurationSeconds(startAt, endAt) {
  return Math.max(0, Math.round((endAt - startAt) / 1000));
}

export function createSessionEngine({
  isTrackableTab,
  debounceMs = 250,
  idGenerator = defaultIdGenerator,
  nowProvider = defaultNowProvider
}) {
  if (typeof isTrackableTab !== "function") {
    throw new Error("createSessionEngine requires isTrackableTab callback");
  }

  const state = {
    activeSession: null,
    lastContextFingerprint: "",
    lastContextAt: 0
  };

  function readState() {
    return {
      activeSession: state.activeSession ? { ...state.activeSession } : null,
      lastContextFingerprint: state.lastContextFingerprint,
      lastContextAt: state.lastContextAt
    };
  }

  function writeState(nextState) {
    state.activeSession = nextState.activeSession ? { ...nextState.activeSession } : null;
    state.lastContextFingerprint = String(nextState.lastContextFingerprint || "");
    state.lastContextAt = Number(nextState.lastContextAt) || 0;
  }

  function exportRuntimeState() {
    return readState();
  }

  function hydrateRuntimeState(runtimeState) {
    if (!runtimeState || typeof runtimeState !== "object") {
      return false;
    }

    const activeSession = normalizeSessionShape(runtimeState.activeSession);
    writeState({
      activeSession,
      lastContextFingerprint: runtimeState.lastContextFingerprint || "",
      lastContextAt: runtimeState.lastContextAt || 0
    });

    return true;
  }

  function isDebounced(tab, now) {
    const fingerprint = buildFingerprint(tab);
    const isDuplicate =
      fingerprint === state.lastContextFingerprint && now - state.lastContextAt < debounceMs;

    state.lastContextFingerprint = fingerprint;
    state.lastContextAt = now;
    return isDuplicate;
  }

  function endActiveSession(reason, now = nowProvider(), { clearContext = true } = {}) {
    if (!state.activeSession) {
      return null;
    }

    const endedSession = {
      ...state.activeSession,
      endAt: now,
      durationSec: toDurationSeconds(state.activeSession.startAt, now),
      endReason: reason
    };

    state.activeSession = null;

    if (clearContext) {
      state.lastContextFingerprint = "";
      state.lastContextAt = 0;
    }

    if (!endedSession.url) {
      return null;
    }

    return endedSession;
  }

  function startOrSwitchSession(tab, reason, now = nowProvider()) {
    if (!isTrackableTab(tab)) {
      const endedSession = endActiveSession(reason, now);
      return {
        changed: Boolean(endedSession),
        endedSession,
        activeSession: null,
        transition: endedSession ? "ended_non_trackable" : "noop_non_trackable"
      };
    }

    if (isDebounced(tab, now)) {
      return {
        changed: false,
        endedSession: null,
        activeSession: state.activeSession ? { ...state.activeSession } : null,
        transition: "noop_debounced"
      };
    }

    if (
      state.activeSession &&
      state.activeSession.tabId === tab.id &&
      state.activeSession.windowId === tab.windowId
    ) {
      state.activeSession.url = tab.url || state.activeSession.url;
      state.activeSession.title = readableTitle(tab.title, state.activeSession.url);
      state.activeSession.domain = extractDomain(state.activeSession.url);
      state.activeSession.activityId = String(tab.activityId || state.activeSession.activityId || "");

      return {
        changed: true,
        endedSession: null,
        activeSession: { ...state.activeSession },
        transition: "updated_same_session"
      };
    }

    const endedSession = endActiveSession(reason, now, { clearContext: false });
    state.activeSession = createSessionFromTab(tab, now, idGenerator);

    return {
      changed: true,
      endedSession,
      activeSession: { ...state.activeSession },
      transition: "switched_or_started"
    };
  }

  function updateActiveSessionMetadata(tabId, changeInfo) {
    if (!state.activeSession || state.activeSession.tabId !== tabId) {
      return false;
    }

    if (typeof changeInfo?.url === "string" && changeInfo.url) {
      state.activeSession.url = changeInfo.url;
      state.activeSession.domain = extractDomain(changeInfo.url);
    }

    if (typeof changeInfo?.title === "string" && changeInfo.title) {
      state.activeSession.title = readableTitle(changeInfo.title, state.activeSession.url);
    }

    return true;
  }

  return {
    readState,
    writeState,
    exportRuntimeState,
    hydrateRuntimeState,
    endActiveSession,
    startOrSwitchSession,
    updateActiveSessionMetadata
  };
}
