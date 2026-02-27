import { expect, test } from "@playwright/test";

const DB_NAME = "chrome-activity-reader";

function makeActivity(partial = {}) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    tabId: 1,
    windowId: 1,
    url: "https://example.com",
    title: "Example",
    domain: "example.com",
    openedAt: now - 30_000,
    lastSeenAt: now - 5_000,
    closedAt: null,
    everFocused: true,
    totalFocusedSec: 18,
    focusCount: 1,
    lastFocusedAt: now - 7_000,
    ...partial
  };
}

async function clearActivityStore(page) {
  await page.evaluate(async ({ name }) => {
    const request = indexedDB.open(name);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise((resolve, reject) => {
      const tx = db.transaction(["tab_activity", "sessions", "settings"], "readwrite");
      tx.objectStore("tab_activity").clear();
      tx.objectStore("sessions").clear();
      tx.objectStore("settings").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    db.close();
  }, { name: DB_NAME });
}

async function seedActivities(page, activities) {
  await page.evaluate(async ({ name, activitiesToInsert }) => {
    const request = indexedDB.open(name);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise((resolve, reject) => {
      const tx = db.transaction("tab_activity", "readwrite");
      const store = tx.objectStore("tab_activity");
      for (const activity of activitiesToInsert) {
        store.put(activity);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    db.close();
  }, { name: DB_NAME, activitiesToInsert: activities });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__queryResult = [];
    window.__calls = [];
    window.__runtimeMessageListener = null;

    window.chrome = {
      tabs: {
        query: async () => window.__queryResult,
        update: async (tabId, options) => {
          window.__calls.push({ api: "tabs.update", tabId, options });
          return {};
        },
        create: async (options) => {
          window.__calls.push({ api: "tabs.create", options });
          return {};
        }
      },
      windows: {
        update: async (windowId, options) => {
          window.__calls.push({ api: "windows.update", windowId, options });
          return {};
        }
      },
      runtime: {
        openOptionsPage: async () => {
          window.__calls.push({ api: "runtime.openOptionsPage" });
          return {};
        },
        onMessage: {
          addListener: (listener) => {
            window.__runtimeMessageListener = listener;
          }
        },
        sendMessage: async (message) => {
          window.__calls.push({ api: "runtime.sendMessage", message });
          if (message?.type === "get-runtime-status") {
            return { ok: true, meaningfulThresholdSec: 10, theme: "dark" };
          }
          if (message?.type === "set-theme") {
            return { ok: true, theme: message.theme };
          }
          return { ok: true };
        },
        getURL: (path) => `chrome-extension://test/${path}`
      }
    };
  });
});

test("default meaningful view ranks by focused time and supports search", async ({ page }) => {
  const now = Date.now();
  const activities = [
    makeActivity({
      id: "meaningful-high",
      title: "High focus tab",
      url: "https://example.com/high",
      totalFocusedSec: 120,
      lastSeenAt: now - 20_000
    }),
    makeActivity({
      id: "meaningful-low",
      title: "Low focus tab",
      url: "https://example.com/low",
      totalFocusedSec: 11,
      lastSeenAt: now - 1_000
    }),
    makeActivity({
      id: "never-focused",
      title: "Background open tab",
      url: "https://example.com/background",
      everFocused: false,
      totalFocusedSec: 0,
      lastSeenAt: now - 500
    })
  ];

  await page.goto("/ui/dashboard.html");
  await clearActivityStore(page);
  await seedActivities(page, activities);
  await page.reload();

  await expect(page.locator(".activity-item")).toHaveCount(2);
  await expect(page.locator("#summary-total")).toHaveText("2");
  await expect(page.locator(".activity-item").first()).toContainText("High focus tab");

  await page.fill("#search", "low focus");
  await expect(page.locator(".activity-item")).toHaveCount(1);
  await expect(page.locator(".activity-item").first()).toContainText("Low focus tab");
});

test("all tabs view includes never-focused and focuses existing tab", async ({ page }) => {
  const now = Date.now();
  const activities = [
    makeActivity({
      id: "never-focused",
      tabId: 100,
      windowId: 5,
      title: "Background open tab",
      url: "https://example.com/background",
      everFocused: false,
      totalFocusedSec: 0,
      lastSeenAt: now - 500
    }),
    makeActivity({
      id: "normal-focused",
      tabId: 101,
      windowId: 3,
      title: "Normal focused tab",
      url: "https://example.com/focused",
      everFocused: true,
      totalFocusedSec: 14,
      lastSeenAt: now - 2_000
    })
  ];

  await page.goto("/ui/dashboard.html");
  await clearActivityStore(page);
  await seedActivities(page, activities);
  await page.reload();

  await page.click('[data-view="all"]');
  await expect(page.locator(".activity-item")).toHaveCount(2);
  await expect(page.locator(".activity-item").first()).toContainText("never focused");

  await page.evaluate(() => {
    window.__queryResult = [{ id: 100, windowId: 5, url: "https://example.com/background" }];
  });
  await page.click(".activity-button");

  const calls = await page.evaluate(() => window.__calls);
  expect(calls.some((item) => item.api === "windows.update")).toBeTruthy();
  expect(calls.some((item) => item.api === "tabs.update")).toBeTruthy();
});

test("most recent view handles navigation actions and routes settings through runtime", async ({ page }) => {
  const now = Date.now();
  const activities = [
    makeActivity({
      id: "closed",
      tabId: 202,
      title: "Closed tab",
      url: "https://example.com/closed",
      closedAt: now - 2_000,
      lastSeenAt: now - 2_000
    })
  ];

  await page.goto("/ui/dashboard.html");
  await clearActivityStore(page);
  await seedActivities(page, activities);
  await page.reload();

  await page.evaluate(() => {
    window.__queryResult = [];
  });

  await page.click('[data-view="recent"]');
  await page.click(".activity-button");
  await page.click("#open-settings");
  await page.click("#open-side-panel");

  const calls = await page.evaluate(() => window.__calls);
  expect(
    calls.some((item) => item.api === "tabs.create" && item.options?.url === "https://example.com/closed")
  ).toBeTruthy();
  expect(
    calls.some(
      (item) =>
        item.api === "runtime.sendMessage" &&
        item.message?.type === "open-settings" &&
        item.message?.surface === "full"
    )
  ).toBeTruthy();
  expect(calls.some((item) => item.api === "runtime.sendMessage" && item.message?.type === "open-side-panel")).toBeTruthy();
});

test("settings theme select maintains readable contrast in dark and light modes", async ({ page }) => {
  await page.goto("/ui/settings.html");

  const contrastRatios = await page.evaluate(() => {
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

    const getRatio = () => {
      const select = document.querySelector("#theme");
      const styles = window.getComputedStyle(select);
      const fg = parseRgb(styles.color);
      const bg = parseRgb(styles.backgroundColor);
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    };

    const darkRatio = getRatio();
    const themeSelect = document.querySelector("#theme");
    themeSelect.value = "light";
    themeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const lightRatio = getRatio();

    return { darkRatio, lightRatio };
  });

  expect(contrastRatios.darkRatio).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatios.lightRatio).toBeGreaterThanOrEqual(4.5);
});

test("dashboard applies broadcast theme updates from runtime", async ({ page }) => {
  await page.goto("/ui/dashboard.html");
  await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");

  await page.evaluate(() => {
    if (typeof window.__runtimeMessageListener === "function") {
      window.__runtimeMessageListener({ type: "theme-changed", theme: "light" }, {}, () => {});
    }
  });

  await expect(page.locator("body")).toHaveAttribute("data-theme", "light");
});
