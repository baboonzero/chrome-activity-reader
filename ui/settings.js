import { DEFAULT_SETTINGS, getSettings, updateSettings } from "../shared/db.js";

const pausedElement = document.querySelector("#paused");
const excludedDomainsElement = document.querySelector("#excluded-domains");
const retentionDaysElement = document.querySelector("#retention-days");
const themeElement = document.querySelector("#theme");
const statusElement = document.querySelector("#status");
const saveButton = document.querySelector("#save");
const openDashboardButton = document.querySelector("#open-dashboard");
const openSidePanelButton = document.querySelector("#open-side-panel");

function parseExcludedDomains(input) {
  const seen = new Set();
  const lines = String(input || "")
    .split(/\r?\n/g)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  for (const domain of lines) {
    seen.add(domain);
  }

  return [...seen];
}

function applyTheme(theme) {
  document.body.dataset.theme = theme === "light" ? "light" : "dark";
}

function syncThemeUi(theme) {
  const normalized = theme === "light" ? "light" : "dark";
  applyTheme(normalized);
  themeElement.value = normalized;
}

function renderStatus(message, isError = false) {
  statusElement.textContent = message;
  if (isError) {
    statusElement.style.color = "#f7b267";
    return;
  }
  statusElement.style.color = "";
}

async function loadSettings() {
  const settings = await getSettings();
  pausedElement.checked = Boolean(settings.paused);
  excludedDomainsElement.value = (settings.excludedDomains || []).join("\n");
  retentionDaysElement.textContent = String(settings.retentionDays || DEFAULT_SETTINGS.retentionDays);
  syncThemeUi(settings.theme || DEFAULT_SETTINGS.theme);
}

async function saveSettings() {
  saveButton.disabled = true;
  renderStatus("Saving...");

  try {
    const nextSettings = {
      paused: pausedElement.checked,
      excludedDomains: parseExcludedDomains(excludedDomainsElement.value),
      theme: themeElement.value
    };

    const saved = await updateSettings(nextSettings);
    retentionDaysElement.textContent = String(saved.retentionDays);
    applyTheme(saved.theme);

    await chrome.runtime.sendMessage({ type: "settings-updated" });
    renderStatus("Settings saved.");
  } catch (error) {
    renderStatus(`Failed to save settings: ${String(error)}`, true);
  } finally {
    saveButton.disabled = false;
  }
}

function bindEvents() {
  saveButton.addEventListener("click", () => {
    saveSettings();
  });

  themeElement.addEventListener("change", () => {
    applyTheme(themeElement.value);
  });

  openDashboardButton.addEventListener("click", async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "open-dashboard" });
      if (!response?.ok) {
        renderStatus("Failed to open dashboard.", true);
      }
    } catch (error) {
      renderStatus(`Failed to open dashboard: ${String(error)}`, true);
    }
  });

  openSidePanelButton.addEventListener("click", async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "open-side-panel" });
      if (!response?.ok) {
        renderStatus("Unable to open side panel from this context.", true);
        return;
      }
      renderStatus("Side panel opened.");
    } catch (error) {
      renderStatus(`Failed to open side panel: ${String(error)}`, true);
    }
  });
}

function bindRuntimeListeners() {
  chrome.runtime?.onMessage?.addListener?.((message) => {
    if (message?.type === "theme-changed") {
      syncThemeUi(message.theme);
    }
  });
}

async function initialize() {
  await loadSettings();
  bindRuntimeListeners();
  bindEvents();
}

initialize().catch((error) => {
  renderStatus(`Failed to load settings: ${String(error)}`, true);
});
