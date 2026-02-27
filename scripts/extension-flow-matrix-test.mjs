import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { chromium } from "playwright";

function invariant(condition, message, context = {}) {
  if (!condition) {
    const error = new Error(message);
    error.context = context;
    throw error;
  }
}

function isDashboardUrl(urlString) {
  return String(urlString || "").endsWith("/ui/dashboard.html");
}

function isSettingsUrl(urlString) {
  return String(urlString || "").endsWith("/ui/settings.html");
}

async function runtimeStatus(page) {
  return page.evaluate(async () => chrome.runtime.sendMessage({ type: "get-runtime-status" }));
}

async function ensureState(page, state, urls) {
  if (state === "dashboard" && !isDashboardUrl(page.url())) {
    await page.goto(urls.dashboard, { waitUntil: "domcontentloaded" });
  }

  if (state === "settings" && !isSettingsUrl(page.url())) {
    await page.goto(urls.settings, { waitUntil: "domcontentloaded" });
  }
}

async function assertThemeSynced(page) {
  const runtime = await runtimeStatus(page);
  const bodyTheme = await page.getAttribute("body", "data-theme");
  const themeInput = await page.locator("#theme").count().then(async (count) => {
    if (!count) {
      return null;
    }
    return page.inputValue("#theme");
  });

  invariant(runtime?.ok === true, "runtime status not ok", { runtime });
  invariant(bodyTheme === runtime.theme, "body theme out of sync with runtime", {
    bodyTheme,
    runtimeTheme: runtime.theme
  });
  if (themeInput !== null) {
    invariant(themeInput === runtime.theme, "theme select value out of sync with runtime", {
      themeInput,
      runtimeTheme: runtime.theme
    });
  }
}

async function transitionOpenSettings({ page, context }) {
  const beforeCount = context.pages().length;
  await page.click("#open-settings");
  await page.waitForURL((url) => isSettingsUrl(url.toString()), { timeout: 5_000 });
  const afterCount = context.pages().length;
  await assertThemeSynced(page);
  invariant(afterCount === beforeCount, "open-settings should not create a new tab from dashboard", {
    beforeCount,
    afterCount
  });
}

async function transitionOpenDashboard({ page, context }) {
  const beforeCount = context.pages().length;
  await page.click("#open-dashboard");
  await page.waitForURL((url) => isDashboardUrl(url.toString()), { timeout: 5_000 });
  const afterCount = context.pages().length;
  invariant(afterCount === beforeCount, "open-dashboard should not create a new tab from settings", {
    beforeCount,
    afterCount
  });
}

async function transitionOpenSidePanel({ page }) {
  const button = page.locator("#open-side-panel");
  const isDisabled = await button.isDisabled();
  if (!isDisabled) {
    await page.click("#open-side-panel");
    await page.waitForTimeout(250);
  }

  const runtime = await runtimeStatus(page);
  const result = runtime?.lastOpenSidePanelResult;

  if (isDisabled) {
    invariant(runtime?.sidePanelOpenForWindow === true, "open-side-panel disabled without an open side panel", {
      runtime
    });
    return;
  }

  invariant(result?.ok === true, "open-side-panel did not report success", { runtime });
  invariant(["sender_window", "all_windows"].includes(result?.mode), "unexpected open-side-panel mode", { mode: result?.mode });
}

async function transitionToggleTheme({ page }) {
  const before = await page.getAttribute("body", "data-theme");
  await page.click("#theme-toggle");
  await page.waitForTimeout(250);
  const after = await page.getAttribute("body", "data-theme");
  invariant(before !== after, "theme did not toggle", { before, after });
}

async function executeTransition(transition, ctx) {
  if (transition.action === "open-settings") {
    await transitionOpenSettings(ctx);
    return;
  }
  if (transition.action === "open-dashboard") {
    await transitionOpenDashboard(ctx);
    return;
  }
  if (transition.action === "open-side-panel") {
    await transitionOpenSidePanel(ctx);
    return;
  }
  if (transition.action === "toggle-theme") {
    await transitionToggleTheme(ctx);
    return;
  }

  throw new Error(`Unknown action: ${transition.action}`);
}

function sequenceName(sequence) {
  return sequence.map((step) => `${step.from}:${step.action}->${step.to}`).join(" | ");
}

async function run() {
  const extensionPath = process.cwd();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "car-flow-matrix-"));

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
    const urls = {
      dashboard: `chrome-extension://${extensionId}/ui/dashboard.html`,
      settings: `chrome-extension://${extensionId}/ui/settings.html`
    };

    const page = await context.newPage();
    await page.goto(urls.dashboard, { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      await chrome.runtime.sendMessage({ type: "set-theme", theme: "dark" });
    });
    await page.reload({ waitUntil: "domcontentloaded" });

    const transitions = [
      { from: "dashboard", action: "open-settings", to: "settings" },
      { from: "dashboard", action: "open-side-panel", to: "dashboard" },
      { from: "dashboard", action: "toggle-theme", to: "dashboard" },
      { from: "settings", action: "open-dashboard", to: "dashboard" },
      { from: "settings", action: "open-side-panel", to: "settings" }
    ];

    const sequences = transitions.map((transition) => [transition]);
    for (const first of transitions) {
      for (const second of transitions.filter((candidate) => candidate.from === first.to)) {
        sequences.push([first, second]);
      }
    }

    const results = [];

    for (const sequence of sequences) {
      await page.evaluate(async () => {
        await chrome.runtime.sendMessage({ type: "set-theme", theme: "dark" });
      });
      await ensureState(page, sequence[0].from, urls);
      await page.reload({ waitUntil: "domcontentloaded" });

      const stepResults = [];
      let failed = false;
      let error = null;

      for (const transition of sequence) {
        try {
          await executeTransition(transition, { page, context, urls });
          await ensureState(page, transition.to, urls);
          stepResults.push({
            action: transition.action,
            from: transition.from,
            to: transition.to,
            ok: true,
            url: page.url()
          });
        } catch (transitionError) {
          failed = true;
          error = {
            message: String(transitionError?.message || transitionError),
            context: transitionError?.context || null
          };
          stepResults.push({
            action: transition.action,
            from: transition.from,
            to: transition.to,
            ok: false,
            error
          });
          break;
        }
      }

      results.push({
        sequence: sequenceName(sequence),
        ok: !failed,
        steps: stepResults,
        error
      });
    }

    const summary = {
      extensionId,
      sequenceCount: results.length,
      passed: results.filter((entry) => entry.ok).length,
      failed: results.filter((entry) => !entry.ok).length,
      failures: results.filter((entry) => !entry.ok)
    };

    console.log(JSON.stringify({ summary, results }, null, 2));

    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await context.close();
  }
}

run().catch((error) => {
  console.error("Extension flow matrix test failed:", error);
  process.exitCode = 1;
});
