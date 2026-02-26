import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { chromium } from "playwright";

function formatRunId(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeJson(filePath, data) {
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function run() {
  const durationMinutes = Number(process.env.VALIDATION_DURATION_MINUTES || 8);
  const dwellMs = Number(process.env.VALIDATION_DWELL_MS || 20_000);
  const headed = process.env.VALIDATION_HEADED === "1";

  const startedAt = new Date();
  const runId = formatRunId(startedAt);
  const artifactsDir = path.join(process.cwd(), "artifacts", "validation", runId);
  const screenshotsDir = path.join(artifactsDir, "screenshots");
  const snapshotsDir = path.join(artifactsDir, "snapshots");
  ensureDir(screenshotsDir);
  ensureDir(snapshotsDir);

  const extensionPath = process.cwd();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "car-long-validation-"));

  const runLog = {
    runId,
    startedAt: startedAt.toISOString(),
    durationMinutes,
    dwellMs,
    headed,
    artifactsDir,
    extensionId: null,
    plannedTargets: [
      "https://example.com",
      "https://www.wikipedia.org",
      "https://news.ycombinator.com",
      "https://openai.com",
      "https://developer.mozilla.org",
      "https://github.com"
    ],
    steps: [],
    finalSummary: null
  };

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: !headed,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker", { timeout: 20_000 });
    }

    const extensionId = new URL(serviceWorker.url()).host;
    runLog.extensionId = extensionId;

    const dashboardUrl = `chrome-extension://${extensionId}/ui/dashboard.html`;
    const settingsUrl = `chrome-extension://${extensionId}/ui/settings.html`;

    const dashboardPage = await context.newPage();
    await dashboardPage.goto(dashboardUrl, { waitUntil: "domcontentloaded" });
    await dashboardPage.screenshot({
      path: path.join(screenshotsDir, "00-dashboard-initial.png"),
      fullPage: true
    });

    // Create and seed a multi-window browsing setup using extension APIs.
    const bootstrap = await dashboardPage.evaluate(async (targets) => {
      const createWindow = (url) =>
        new Promise((resolve, reject) => {
          chrome.windows.create({ url }, (window) => {
            const error = chrome.runtime.lastError;
            if (error) {
              reject(new Error(error.message));
              return;
            }
            resolve(window);
          });
        });

      const createTab = (windowId, url) =>
        new Promise((resolve, reject) => {
          chrome.tabs.create({ windowId, url }, (tab) => {
            const error = chrome.runtime.lastError;
            if (error) {
              reject(new Error(error.message));
              return;
            }
            resolve(tab);
          });
        });

      const windowA = await createWindow(targets[0]);
      const windowB = await createWindow(targets[4]);
      await createTab(windowA.id, targets[1]);
      await createTab(windowA.id, targets[2]);
      await createTab(windowB.id, targets[3]);
      await createTab(windowB.id, targets[5]);

      const tabs = await chrome.tabs.query({});
      return {
        windowAId: windowA.id,
        windowBId: windowB.id,
        totalTabs: tabs.length
      };
    }, runLog.plannedTargets);

    runLog.bootstrap = bootstrap;

    const startMs = Date.now();
    const maxDurationMs = Math.max(1, durationMinutes) * 60_000;
    let stepIndex = 0;

    while (Date.now() - startMs < maxDurationMs) {
      const targetPrefix = runLog.plannedTargets[stepIndex % runLog.plannedTargets.length];
      const now = new Date();
      const timestampToken = formatRunId(now);

      const stepResult = await dashboardPage.evaluate(async (prefix) => {
        const tabs = await chrome.tabs.query({});
        const targetTab = tabs.find((tab) => typeof tab.url === "string" && tab.url.startsWith(prefix));
        if (!targetTab) {
          return {
            ok: false,
            reason: "target_tab_not_found",
            prefix,
            tabCount: tabs.length
          };
        }

        await chrome.windows.update(targetTab.windowId, { focused: true });
        await chrome.tabs.update(targetTab.id, { active: true });

        const runtime = await chrome.runtime.sendMessage({ type: "get-runtime-status" });
        const focusedActiveTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const focusedActiveTab = focusedActiveTabs[0] || null;

        return {
          ok: true,
          prefix,
          activatedTabId: targetTab.id,
          activatedWindowId: targetTab.windowId,
          activatedUrl: targetTab.url,
          activatedTitle: targetTab.title,
          focusedActiveTab,
          runtime
        };
      }, targetPrefix);

      const stepRecord = {
        stepIndex: stepIndex + 1,
        at: now.toISOString(),
        targetPrefix,
        result: stepResult
      };

      const activeUrl = stepResult?.focusedActiveTab?.url || stepResult?.activatedUrl || "";
      const activePage = context
        .pages()
        .find((page) => !page.url().startsWith("chrome-extension://") && activeUrl && page.url() === activeUrl);

      if (activePage) {
        await activePage.screenshot({
          path: path.join(screenshotsDir, `${String(stepIndex + 1).padStart(2, "0")}-${timestampToken}-active.png`),
          fullPage: false
        });

        if ((stepIndex + 1) % 3 === 0) {
          const ariaSnapshot = await activePage.locator("body").ariaSnapshot();
          await fs.promises.writeFile(
            path.join(
              snapshotsDir,
              `${String(stepIndex + 1).padStart(2, "0")}-${timestampToken}-active-aria.txt`
            ),
            String(ariaSnapshot),
            "utf8"
          );
        }
      }

      if ((stepIndex + 1) % 2 === 0) {
        await dashboardPage.goto(dashboardUrl, { waitUntil: "domcontentloaded" });
        await dashboardPage.screenshot({
          path: path.join(
            screenshotsDir,
            `${String(stepIndex + 1).padStart(2, "0")}-${timestampToken}-dashboard.png`
          ),
          fullPage: true
        });
      }

      runLog.steps.push(stepRecord);
      stepIndex += 1;
      await sleep(dwellMs);
    }

    await dashboardPage.goto(dashboardUrl, { waitUntil: "domcontentloaded" });
    await dashboardPage.click('[data-range="168h"]');
    await dashboardPage.waitForTimeout(800);
    await dashboardPage.screenshot({
      path: path.join(screenshotsDir, "99-dashboard-final-7d.png"),
      fullPage: true
    });

    const finalSummary = await dashboardPage.evaluate(async (settingsPageUrl) => {
      const timelineCount = document.querySelectorAll(".timeline-item").length;
      const summaryTotal = document.querySelector("#summary-total")?.textContent?.trim() || "";
      const summaryDuration = document.querySelector("#summary-duration")?.textContent?.trim() || "";
      const runtime = await chrome.runtime.sendMessage({ type: "get-runtime-status" });
      const allTabs = await chrome.tabs.query({});

      return {
        timelineCount,
        summaryTotal,
        summaryDuration,
        runtime,
        allTabCount: allTabs.length,
        settingsPageUrl
      };
    }, settingsUrl);

    const settingsPage = await context.newPage();
    await settingsPage.goto(settingsUrl, { waitUntil: "domcontentloaded" });
    await settingsPage.screenshot({
      path: path.join(screenshotsDir, "98-settings-final.png"),
      fullPage: true
    });

    runLog.finalSummary = finalSummary;
    runLog.completedAt = new Date().toISOString();
    await writeJson(path.join(artifactsDir, "validation-log.json"), runLog);

    const reportLines = [
      "# Long-Duration Extension Validation Report",
      "",
      `- Run ID: ${runId}`,
      `- Started: ${runLog.startedAt}`,
      `- Completed: ${runLog.completedAt}`,
      `- Duration (minutes): ${durationMinutes}`,
      `- Dwell per step (ms): ${dwellMs}`,
      `- Extension ID: ${extensionId}`,
      `- Steps executed: ${runLog.steps.length}`,
      "",
      "## Final Summary",
      "",
      `- Timeline item count (7d view): ${finalSummary.timelineCount}`,
      `- Summary total: ${finalSummary.summaryTotal}`,
      `- Summary duration: ${finalSummary.summaryDuration}`,
      `- Runtime status OK: ${Boolean(finalSummary.runtime?.ok)}`,
      `- Runtime paused: ${String(finalSummary.runtime?.paused)}`,
      `- Runtime retentionDays: ${String(finalSummary.runtime?.retentionDays)}`,
      `- Browser tab count at end: ${finalSummary.allTabCount}`,
      "",
      "## Artifact Paths",
      "",
      `- Log JSON: \`artifacts/validation/${runId}/validation-log.json\``,
      `- Screenshots: \`artifacts/validation/${runId}/screenshots/\``,
      `- Accessibility snapshots: \`artifacts/validation/${runId}/snapshots/\``,
      "",
      "## Notes",
      "",
      "- This run uses real unpacked-extension runtime in Chromium with extension APIs.",
      "- Multi-window behavior is driven through extension APIs (`chrome.windows` and `chrome.tabs`).",
      "- Screenshots were captured throughout the session and at final dashboard/settings state."
    ];

    await fs.promises.writeFile(
      path.join(artifactsDir, "validation-report.md"),
      reportLines.join("\n"),
      "utf8"
    );

    console.log(JSON.stringify({
      ok: true,
      runId,
      artifactsDir,
      stepsExecuted: runLog.steps.length,
      finalSummary
    }, null, 2));
  } finally {
    await context.close();
  }
}

run().catch((error) => {
  console.error("Long-duration extension validation failed:", error);
  process.exitCode = 1;
});
