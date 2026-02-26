import { listSessionsInRange } from "../shared/db.js";
import { formatDuration, formatTimestamp } from "../shared/time.js";

const RANGE_TO_HOURS = {
  "1h": 1,
  "4h": 4,
  "24h": 24,
  "168h": 168
};

const state = {
  selectedRange: "1h",
  searchTerm: "",
  sessions: []
};

const timelineElement = document.querySelector("#timeline");
const emptyElement = document.querySelector("#empty");
const summaryTotalElement = document.querySelector("#summary-total");
const summaryDurationElement = document.querySelector("#summary-duration");
const searchElement = document.querySelector("#search");
const settingsButton = document.querySelector("#open-settings");

function normalize(input) {
  return String(input || "").trim().toLowerCase();
}

function buildRange() {
  const now = Date.now();
  const hours = RANGE_TO_HOURS[state.selectedRange] || 1;
  return {
    startAt: now - hours * 60 * 60 * 1000,
    endAt: now
  };
}

function filterSessions(sessions) {
  if (!state.searchTerm) {
    return sessions;
  }

  const query = normalize(state.searchTerm);
  return sessions.filter((session) => {
    const haystack = `${session.title} ${session.domain} ${session.url}`.toLowerCase();
    return haystack.includes(query);
  });
}

function renderSummary(sessions) {
  const totalDuration = sessions.reduce((sum, item) => sum + (Number(item.durationSec) || 0), 0);
  summaryTotalElement.textContent = `${sessions.length} sessions`;
  summaryDurationElement.textContent = `${formatDuration(totalDuration)} total`;
}

function createSessionListItem(session) {
  const item = document.createElement("li");
  item.className = "timeline-item";
  item.dataset.sessionId = session.id;

  const title = document.createElement("div");
  title.className = "item-title";
  title.textContent = session.title || session.url;

  const meta = document.createElement("div");
  meta.className = "item-meta";
  meta.innerHTML = `
    <span>${session.domain || "unknown domain"}</span>
    <span>${formatTimestamp(session.startAt)} → ${formatTimestamp(session.endAt)}</span>
    <span>${formatDuration(session.durationSec)}</span>
  `;

  const url = document.createElement("div");
  url.className = "item-url";
  url.textContent = session.url;

  item.append(title, meta, url);
  return item;
}

function renderTimeline(sessions) {
  timelineElement.textContent = "";

  if (sessions.length === 0) {
    emptyElement.classList.remove("hidden");
    renderSummary(sessions);
    return;
  }

  emptyElement.classList.add("hidden");
  sessions.forEach((session) => {
    timelineElement.appendChild(createSessionListItem(session));
  });
  renderSummary(sessions);
}

async function focusOrOpenSession(session) {
  const allTabs = await chrome.tabs.query({});
  const exactMatch = allTabs.find((tab) => tab.url === session.url);

  if (exactMatch && typeof exactMatch.id === "number" && typeof exactMatch.windowId === "number") {
    await chrome.windows.update(exactMatch.windowId, { focused: true });
    await chrome.tabs.update(exactMatch.id, { active: true });
    return;
  }

  await chrome.tabs.create({ url: session.url });
}

async function loadTimeline() {
  const range = buildRange();
  const sessions = await listSessionsInRange(range.startAt, range.endAt);
  state.sessions = sessions;
  renderTimeline(filterSessions(sessions));
}

function bindEvents() {
  document.querySelectorAll(".range-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      document.querySelectorAll(".range-btn").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.selectedRange = button.dataset.range;
      await loadTimeline();
    });
  });

  searchElement.addEventListener("input", () => {
    state.searchTerm = searchElement.value;
    renderTimeline(filterSessions(state.sessions));
  });

  timelineElement.addEventListener("click", async (event) => {
    const row = event.target.closest(".timeline-item");
    if (!row) {
      return;
    }

    const session = state.sessions.find((item) => item.id === row.dataset.sessionId);
    if (!session) {
      return;
    }

    await focusOrOpenSession(session);
  });

  settingsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

async function initialize() {
  bindEvents();
  await loadTimeline();
}

initialize().catch((error) => {
  console.error("Dashboard initialization failed", error);
});
