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

    const dashboardPage = await context.newPage();
    await dashboardPage.goto(dashboardUrl, { waitUntil: "domcontentloaded" });

    const heading = await dashboardPage.textContent("h1");
    const timelineCount = await dashboardPage.locator("#timeline").count();
    const status = await dashboardPage.evaluate(async () =>
      chrome.runtime.sendMessage({ type: "get-runtime-status" })
    );

    const settingsPage = await context.newPage();
    await settingsPage.goto(settingsUrl, { waitUntil: "domcontentloaded" });
    const settingsHeading = await settingsPage.textContent("h1");

    const result = {
      extensionId,
      dashboardHeading: heading,
      timelinePresent: timelineCount > 0,
      runtimeStatusOk: status?.ok === true,
      retentionDays: status?.retentionDays,
      paused: status?.paused,
      settingsHeading
    };

    console.log(JSON.stringify(result, null, 2));

    if (
      result.dashboardHeading !== "Chrome Activity Reader" ||
      !result.timelinePresent ||
      result.runtimeStatusOk !== true ||
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
