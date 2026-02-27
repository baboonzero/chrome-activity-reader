import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { chromium } from "playwright";

async function run() {
  const extensionPath = process.cwd();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "car-ext-"));

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
    }

    const extensionId = new URL(serviceWorker.url()).host;
    const dashboardUrl = `chrome-extension://${extensionId}/ui/dashboard.html`;
    const panelUrl = `chrome-extension://${extensionId}/ui/panel.html`;

    const dashboardPage = await context.newPage();
    await dashboardPage.goto(dashboardUrl, { waitUntil: "domcontentloaded" });
    const dashboardFaviconHref = await dashboardPage.getAttribute('link[rel="icon"]', "href");
    const dashboardThemeInitial = await dashboardPage.getAttribute("body", "data-theme");

    const heading = await dashboardPage.textContent("h1");
    const activityListCount = await dashboardPage.locator("#activity-list").count();
    const defaultViewActive = await dashboardPage.locator('[data-view="meaningful"].active').count();
    const status = await dashboardPage.evaluate(async () =>
      chrome.runtime.sendMessage({ type: "get-runtime-status" })
    );
    const actionClickSimulation = await dashboardPage.evaluate(async () =>
      chrome.runtime.sendMessage({ type: "debug-trigger-action-click" })
    );

    const panelPage = await context.newPage();
    await panelPage.goto(panelUrl, { waitUntil: "domcontentloaded" });
    const panelViewCount = await panelPage.locator('[data-view]').count();
    const panelThemeInitial = await panelPage.getAttribute("body", "data-theme");
    const initialPageCount = context.pages().length;

    const dashboardSidePanelButton = dashboardPage.locator("#open-side-panel");
    const canRequestDashboardSidePanelOpen = await dashboardSidePanelButton.isEnabled();
    if (canRequestDashboardSidePanelOpen) {
      await dashboardPage.click("#open-side-panel");
      await dashboardPage.waitForTimeout(250);
    }
    const runtimeAfterDashboardSidePanel = await dashboardPage.evaluate(async () =>
      chrome.runtime.sendMessage({ type: "get-runtime-status" })
    );

    await dashboardPage.click("#theme-toggle");
    await dashboardPage.waitForTimeout(250);
    const dashboardThemeAfterToggle = await dashboardPage.getAttribute("body", "data-theme");
    await panelPage.waitForFunction(() => document.body?.dataset?.theme === "light", null, { timeout: 5_000 });
    const panelThemeAfterDashboardToggle = await panelPage.getAttribute("body", "data-theme");

    await dashboardPage.click("#open-settings");
    await dashboardPage.waitForURL((url) => url.toString().endsWith("/ui/settings.html"), { timeout: 5_000 });
    const settingsHeading = await dashboardPage.textContent("h1");
    const settingsOpenedInCurrentTab = dashboardPage.url().endsWith("/ui/settings.html");
    const settingsFaviconHref = await dashboardPage.getAttribute('link[rel="icon"]', "href");
    const pageCountAfterOpenSettings = context.pages().length;

    await dashboardPage.click("#open-side-panel");
    await dashboardPage.waitForTimeout(250);
    const runtimeAfterSettingsSidePanel = await dashboardPage.evaluate(async () =>
      chrome.runtime.sendMessage({ type: "get-runtime-status" })
    );

    await dashboardPage.click("#open-dashboard");
    await dashboardPage.waitForURL((url) => url.toString().endsWith("/ui/dashboard.html"), { timeout: 5_000 });
    const dashboardOpenedInCurrentTab = dashboardPage.url().endsWith("/ui/dashboard.html");
    const pageCountAfterBackToDashboard = context.pages().length;

    await panelPage.click("#theme-toggle");
    await panelPage.waitForTimeout(250);
    const panelThemeAfterPanelToggle = await panelPage.getAttribute("body", "data-theme");
    await dashboardPage.waitForFunction(() => document.body?.dataset?.theme === "dark", null, { timeout: 5_000 });
    const dashboardThemeAfterPanelToggle = await dashboardPage.getAttribute("body", "data-theme");
    const sidePanelButtonDisabledWhenPanelOpen = await dashboardPage.locator("#open-side-panel").isDisabled();

    const dashboardWindowId = await dashboardPage.evaluate(async () => {
      const win = await chrome.windows.getCurrent();
      return win?.id;
    });
    await dashboardPage.evaluate(async (windowId) => {
      await chrome.runtime.sendMessage({ type: "panel-closed", windowId });
    }, dashboardWindowId);
    await panelPage.close();
    await dashboardPage.waitForFunction(() => document.querySelector("#open-side-panel")?.disabled === false, null, {
      timeout: 15_000
    });
    const sidePanelButtonEnabledAfterPanelClose = !(await dashboardPage.locator("#open-side-panel").isDisabled());

    await dashboardPage.click("#open-settings");
    await dashboardPage.waitForURL((url) => url.toString().endsWith("/ui/settings.html"), { timeout: 5_000 });
    await dashboardPage.waitForFunction(
      () =>
        document.body?.dataset?.theme === "dark" &&
        document.querySelector("#theme")?.value === "dark",
      null,
      { timeout: 5_000 }
    );
    const settingsTheme = await dashboardPage.getAttribute("body", "data-theme");
    const settingsThemeValue = await dashboardPage.inputValue("#theme");
    const themeSelectContrast = await dashboardPage.evaluate(() => {
      const select = document.querySelector("#theme");
      if (!select) {
        return 0;
      }

      const parseRgb = (value) => {
        const matches = String(value).match(/\d+(\.\d+)?/g);
        if (!matches || matches.length < 3) {
          return [0, 0, 0];
        }
        return matches.slice(0, 3).map((part) => Number(part));
      };

      const luminance = ([r, g, b]) => {
        const toLinear = (channel) => {
          const value = channel / 255;
          if (value <= 0.03928) {
            return value / 12.92;
          }
          return ((value + 0.055) / 1.055) ** 2.4;
        };

        return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
      };

      const styles = window.getComputedStyle(select);
      const fg = parseRgb(styles.color);
      const bg = parseRgb(styles.backgroundColor);
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
    });

    const result = {
      extensionId,
      dashboardHeading: heading,
      activityListPresent: activityListCount > 0,
      defaultViewActive: defaultViewActive > 0,
      panelViewToggleCount: panelViewCount,
      actionClickSimulation,
      runtimeStatusOk: status?.ok === true,
      retentionDays: status?.retentionDays,
      paused: status?.paused,
      sidePanelApiAvailable: status?.sidePanelApiAvailable,
      openPanelOnActionClick: status?.openPanelOnActionClick,
      dashboardThemeInitial,
      panelThemeInitial,
      panelThemeAfterDashboardToggle,
      panelThemeAfterPanelToggle,
      dashboardThemeAfterPanelToggle,
      sidePanelButtonDisabledWhenPanelOpen,
      sidePanelButtonEnabledAfterPanelClose,
      runtimeAfterDashboardSidePanel,
      runtimeAfterSettingsSidePanel,
      dashboardFaviconHref,
      settingsFaviconHref,
      settingsHeading,
      settingsOpenedInCurrentTab,
      pageCountAfterOpenSettings,
      dashboardOpenedInCurrentTab,
      pageCountAfterBackToDashboard,
      pageCountUnchangedOnSettingsRoundTrip:
        pageCountAfterOpenSettings === initialPageCount && pageCountAfterBackToDashboard === initialPageCount,
      dashboardThemeAfterToggle,
      settingsTheme,
      settingsThemeValue,
      themeSelectContrast
    };

    console.log(JSON.stringify(result, null, 2));

    const dashboardSidePanelRuntimeValid =
      result.runtimeAfterDashboardSidePanel?.sidePanelOpenForWindow === true &&
      (
        !result.runtimeAfterDashboardSidePanel?.lastOpenSidePanelResult ||
        (
          result.runtimeAfterDashboardSidePanel?.lastOpenSidePanelResult?.ok === true &&
          ["sender_window", "all_windows"].includes(result.runtimeAfterDashboardSidePanel?.lastOpenSidePanelResult?.mode)
        )
      );

    const settingsSidePanelRuntimeValid =
      result.runtimeAfterSettingsSidePanel?.lastOpenSidePanelResult?.ok === true &&
      ["sender_window", "all_windows"].includes(result.runtimeAfterSettingsSidePanel?.lastOpenSidePanelResult?.mode);

    if (
      result.dashboardHeading !== "Chrome Activity Reader" ||
      !result.activityListPresent ||
      !result.defaultViewActive ||
      result.panelViewToggleCount < 2 ||
      !result.actionClickSimulation?.ok ||
      !["panel_focused_window", "panel_all_windows", "dashboard_fallback"].includes(result.actionClickSimulation?.mode) ||
      result.runtimeStatusOk !== true ||
      result.sidePanelApiAvailable !== true ||
      result.openPanelOnActionClick !== true ||
      !String(result.dashboardFaviconHref || "").includes("icon-v2-32.png") ||
      !String(result.settingsFaviconHref || "").includes("icon-v2-32.png") ||
      dashboardSidePanelRuntimeValid !== true ||
      settingsSidePanelRuntimeValid !== true ||
      result.settingsOpenedInCurrentTab !== true ||
      result.dashboardOpenedInCurrentTab !== true ||
      result.pageCountUnchangedOnSettingsRoundTrip !== true ||
      result.dashboardThemeInitial !== "dark" ||
      result.panelThemeInitial !== "dark" ||
      result.dashboardThemeAfterToggle !== "light" ||
      result.panelThemeAfterDashboardToggle !== "light" ||
      result.panelThemeAfterPanelToggle !== "dark" ||
      result.dashboardThemeAfterPanelToggle !== "dark" ||
      result.sidePanelButtonDisabledWhenPanelOpen !== true ||
      result.sidePanelButtonEnabledAfterPanelClose !== true ||
      result.settingsTheme !== "dark" ||
      result.settingsThemeValue !== "dark" ||
      Number(result.themeSelectContrast || 0) < 4.5 ||
      result.settingsHeading !== "Settings"
    ) {
      process.exitCode = 1;
    }
  } finally {
    await context.close();
  }
}

run().catch((error) => {
  console.error("Extension smoke test failed:", error);
  process.exitCode = 1;
});
