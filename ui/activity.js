import { getSettings, listTabActivitiesInRange } from "../shared/db.js";
import { formatDuration } from "../shared/time.js";

const RANGE_TO_HOURS = {
  "1h": 1,
  "4h": 4,
  "24h": 24,
  "168h": 168
};

const REFRESH_INTERVAL_MS = 3000;

const state = {
  selectedView: "meaningful",
  selectedRange: "1h",
  searchTerm: "",
  theme: "dark",
  meaningfulThresholdSec: 10,
  allActivities: [],
  visibleActivities: []
};

const bodyElement = document.body;
const listElement = document.querySelector("#activity-list");
const emptyElement = document.querySelector("#empty");
const summaryTotalElement = document.querySelector("#summary-total");
const summaryDurationElement = document.querySelector("#summary-duration");
const summaryNeverFocusedElement = document.querySelector("#summary-never-focused");
const searchElement = document.querySelector("#search");
const openSettingsButton = document.querySelector("#open-settings");
const expandDashboardButton = document.querySelector("#expand-dashboard");
const openSidePanelButton = document.querySelector("#open-side-panel");
const themeToggleButton = document.querySelector("#theme-toggle");

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

function getRecencyLabel(timestampMs) {
  const deltaSec = Math.max(0, Math.round((Date.now() - Number(timestampMs || 0)) / 1000));
  if (deltaSec < 60) {
    return "just now";
  }
  if (deltaSec < 3600) {
    return `${Math.floor(deltaSec / 60)}m ago`;
  }
  if (deltaSec < 24 * 3600) {
    return `${Math.floor(deltaSec / 3600)}h ago`;
  }
  return `${Math.floor(deltaSec / (24 * 3600))}d ago`;
}

function getOpenedLabel(activity) {
  return new Date(activity.openedAt).toLocaleString();
}

function applyTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  bodyElement.dataset.theme = state.theme;
}

async function toggleTheme() {
  const nextTheme = state.theme === "dark" ? "light" : "dark";
  try {
    const response = await chrome.runtime.sendMessage({
      type: "set-theme",
      theme: nextTheme
    });

    if (response?.ok) {
      applyTheme(response.theme);
      return;
    }
  } catch {
    // Fall back to local theme flip if runtime message fails.
  }

  applyTheme(nextTheme);
}

function updateSummary(activities) {
  const totalFocusedSec = activities.reduce((sum, activity) => sum + (Number(activity.totalFocusedSec) || 0), 0);
  const neverFocusedCount = activities.filter((activity) => !activity.everFocused && (Number(activity.totalFocusedSec) || 0) === 0).length;
  summaryTotalElement.textContent = String(activities.length);
  summaryDurationElement.textContent = formatDuration(totalFocusedSec);
  summaryNeverFocusedElement.textContent = String(neverFocusedCount);
}

function searchFilter(activities) {
  if (!state.searchTerm) {
    return activities;
  }

  const needle = normalize(state.searchTerm);
  return activities.filter((activity) => {
    const haystack = `${activity.title} ${activity.domain} ${activity.url}`.toLowerCase();
    return haystack.includes(needle);
  });
}

function applyViewFilter(activities) {
  if (state.selectedView === "meaningful") {
    return activities.filter((activity) => Number(activity.totalFocusedSec) > state.meaningfulThresholdSec);
  }

  return activities;
}

function sortActivities(activities) {
  if (state.selectedView === "meaningful") {
    activities.sort((a, b) => {
      const focusDelta = (Number(b.totalFocusedSec) || 0) - (Number(a.totalFocusedSec) || 0);
      if (focusDelta !== 0) {
        return focusDelta;
      }
      return (Number(b.lastSeenAt) || 0) - (Number(a.lastSeenAt) || 0);
    });
    return activities;
  }

  activities.sort((a, b) => (Number(b.lastSeenAt) || 0) - (Number(a.lastSeenAt) || 0));
  return activities;
}

function toScorePercent(activity, maxFocused) {
  if (maxFocused <= 0) {
    return 3;
  }

  const value = Number(activity.totalFocusedSec) || 0;
  return Math.max(3, Math.round((value / maxFocused) * 100));
}

function buildChips(activity) {
  const chips = [];
  const focusedSec = Number(activity.totalFocusedSec) || 0;

  if (!activity.everFocused && focusedSec === 0) {
    chips.push('<span class="state-chip never-focused">never focused</span>');
  }

  if (focusedSec > state.meaningfulThresholdSec) {
    chips.push('<span class="state-chip meaningful">meaningful</span>');
  }

  if (activity.closedAt) {
    chips.push('<span class="state-chip closed-state">closed</span>');
  } else {
    chips.push('<span class="state-chip open-state">open</span>');
  }

  return chips.join("");
}

function createActivityItem(activity, maxFocusedSec) {
  const item = document.createElement("li");
  item.className = "activity-item";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "activity-button";
  button.dataset.activityId = activity.id;

  const title = activity.title || activity.url || "Untitled tab";
  const domain = activity.domain || "unknown domain";
  const focusedSec = Number(activity.totalFocusedSec) || 0;
  const scorePercent = toScorePercent(activity, maxFocusedSec);

  button.innerHTML = `
    <div class="item-top">
      <p class="item-title">${title}</p>
      <div class="chips">${buildChips(activity)}</div>
    </div>
    <p class="item-domain">${domain}</p>
    <p class="item-url">${activity.url || "n/a"}</p>
    <div class="item-metrics">
      <span>Focused ${formatDuration(focusedSec)}</span>
      <span>Seen ${getRecencyLabel(activity.lastSeenAt)}</span>
      <span>Opened ${getOpenedLabel(activity)}</span>
    </div>
    <div class="score-bar">
      <div class="score-fill" style="width: ${scorePercent}%"></div>
    </div>
  `;

  item.appendChild(button);
  return item;
}

async function focusOrOpenActivity(activity) {
  const allTabs = await chrome.tabs.query({});

  const byIdAndUrl = allTabs.find(
    (tab) => typeof tab.id === "number" && tab.id === activity.tabId && tab.url === activity.url
  );

  const byUrl = allTabs.find((tab) => tab.url === activity.url);
  const targetTab = byIdAndUrl || byUrl;

  if (targetTab && typeof targetTab.id === "number" && typeof targetTab.windowId === "number") {
    await chrome.windows.update(targetTab.windowId, { focused: true });
    await chrome.tabs.update(targetTab.id, { active: true });
    return;
  }

  await chrome.tabs.create({ url: activity.url });
}

function render(activities) {
  listElement.textContent = "";
  updateSummary(activities);

  if (activities.length === 0) {
    emptyElement.classList.remove("hidden");
    return;
  }

  emptyElement.classList.add("hidden");

  const maxFocusedSec = activities.reduce((max, activity) => Math.max(max, Number(activity.totalFocusedSec) || 0), 0);
  activities.forEach((activity) => {
    listElement.appendChild(createActivityItem(activity, maxFocusedSec));
  });
}

function applyFiltersAndRender() {
  const bySearch = searchFilter(state.allActivities);
  const byView = applyViewFilter(bySearch);
  const sorted = sortActivities([...byView]);
  state.visibleActivities = sorted;
  render(sorted);
}

async function loadActivities() {
  const range = buildRange();
  const activities = await listTabActivitiesInRange(range.startAt, range.endAt);
  state.allActivities = activities;
  applyFiltersAndRender();
}

function markActiveChip(selector, selectedValue, datasetKey) {
  document.querySelectorAll(selector).forEach((element) => {
    const value = element.dataset[datasetKey];
    element.classList.toggle("active", value === selectedValue);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedView = button.dataset.view;
      markActiveChip("[data-view]", state.selectedView, "view");
      applyFiltersAndRender();
    });
  });

  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedRange = button.dataset.range;
      markActiveChip("[data-range]", state.selectedRange, "range");
      await loadActivities();
    });
  });

  searchElement.addEventListener("input", () => {
    state.searchTerm = searchElement.value;
    applyFiltersAndRender();
  });

  themeToggleButton?.addEventListener("click", () => {
    toggleTheme().catch((error) => {
      console.error("Theme toggle failed", error);
    });
  });

  openSettingsButton?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  expandDashboardButton?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "open-full-dashboard" });
  });

  openSidePanelButton?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "open-side-panel" });
  });

  listElement.addEventListener("click", async (event) => {
    const button = event.target.closest(".activity-button");
    if (!button) {
      return;
    }

    const activity = state.visibleActivities.find((item) => item.id === button.dataset.activityId);
    if (!activity) {
      return;
    }

    await focusOrOpenActivity(activity);
  });
}

async function bootstrapRuntimeSettings() {
  try {
    const runtime = await chrome.runtime.sendMessage({ type: "get-runtime-status" });
    if (runtime?.ok) {
      state.meaningfulThresholdSec = Number(runtime.meaningfulThresholdSec) || 10;
      if (runtime.theme) {
        applyTheme(runtime.theme);
      }
    }
  } catch {
    // Ignore runtime bootstrap failures.
  }

  const settings = await getSettings();
  applyTheme(settings.theme || "dark");
}

let refreshTimerId = null;

function startAutoRefresh() {
  if (refreshTimerId) {
    clearInterval(refreshTimerId);
  }

  refreshTimerId = setInterval(() => {
    loadActivities().catch((error) => {
      console.error("Auto refresh failed", error);
    });
  }, REFRESH_INTERVAL_MS);
}

async function initialize() {
  await bootstrapRuntimeSettings();
  bindEvents();
  await loadActivities();
  startAutoRefresh();
}

initialize().catch((error) => {
  console.error("Activity UI initialization failed", error);
});
