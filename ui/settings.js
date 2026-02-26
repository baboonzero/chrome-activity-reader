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

function renderStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.style.color = isError ? "#f7b267" : "";
}

async function loadSettings() {
  const settings = await getSettings();
  pausedElement.checked = Boolean(settings.paused);
  excludedDomainsElement.value = (settings.excludedDomains || []).join("\n");
  retentionDaysElement.textContent = String(settings.retentionDays || DEFAULT_SETTINGS.retentionDays);
  themeElement.value = settings.theme || DEFAULT_SETTINGS.theme;
  applyTheme(themeElement.value);
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

  openDashboardButton.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("ui/dashboard.html") });
  });

  openSidePanelButton.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "open-side-panel" });
  });
}

async function initialize() {
  await loadSettings();
  bindEvents();
}

initialize().catch((error) => {
  renderStatus(`Failed to load settings: ${String(error)}`, true);
});
