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
    const settingsUrl = `chrome-extension://${extensionId}/ui/settings.html`;
    const panelUrl = `chrome-extension://${extensionId}/ui/panel.html`;

    const dashboardPage = await context.newPage();
    await dashboardPage.goto(dashboardUrl, { waitUntil: "domcontentloaded" });

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

    const settingsPage = await context.newPage();
    await settingsPage.goto(settingsUrl, { waitUntil: "domcontentloaded" });
    const settingsHeading = await settingsPage.textContent("h1");

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
      settingsHeading
    };

    console.log(JSON.stringify(result, null, 2));

    if (
      result.dashboardHeading !== "Chrome Activity Reader" ||
      !result.activityListPresent ||
      !result.defaultViewActive ||
      result.panelViewToggleCount < 3 ||
      !result.actionClickSimulation?.ok ||
      !["panel_focused_window", "panel_all_windows", "dashboard_fallback"].includes(result.actionClickSimulation?.mode) ||
      result.runtimeStatusOk !== true ||
      result.sidePanelApiAvailable !== true ||
      result.openPanelOnActionClick !== true ||
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
