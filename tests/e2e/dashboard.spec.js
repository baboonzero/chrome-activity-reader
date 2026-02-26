import { expect, test } from "@playwright/test";

const DB_NAME = "chrome-activity-reader";

function makeSession(partial) {
  return {
    id: crypto.randomUUID(),
    tabId: 1,
    windowId: 1,
    url: "https://example.com",
    title: "Example",
    domain: "example.com",
    startAt: Date.now() - 30_000,
    endAt: Date.now() - 5_000,
    durationSec: 25,
    endReason: "tab_switch",
    ...partial
  };
}

async function clearSessions(page) {
  await page.evaluate(async ({ name }) => {
    const request = indexedDB.open(name);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      const request = tx.objectStore("sessions").clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
  }, { name: DB_NAME });
}

async function seedSessions(page, sessions) {
  await page.evaluate(async ({ name, sessionsToInsert }) => {
    const request = indexedDB.open(name);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      const store = tx.objectStore("sessions");

      for (const session of sessionsToInsert) {
        store.put(session);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    db.close();
  }, { name: DB_NAME, sessionsToInsert: sessions });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__queryResult = [];
    window.__calls = [];

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
        sendMessage: async () => {
          window.__calls.push({ api: "runtime.sendMessage" });
          return { ok: true };
        },
        getURL: (path) => `chrome-extension://test/${path}`
      }
    };
  });
});

test("renders timeline, filters by search, and focuses an existing tab", async ({ page }) => {
  const now = Date.now();
  const sessions = [
    makeSession({
      id: "session-1",
      tabId: 11,
      windowId: 3,
      url: "https://example.com/task",
      title: "Task board",
      domain: "example.com",
      startAt: now - 5 * 60_000,
      endAt: now - 2 * 60_000,
      durationSec: 180
    }),
    makeSession({
      id: "session-2",
      tabId: 20,
      windowId: 4,
      url: "https://docs.google.com/document/d/abc",
      title: "Project notes",
      domain: "docs.google.com",
      startAt: now - 20 * 60_000,
      endAt: now - 10 * 60_000,
      durationSec: 600
    })
  ];

  await page.goto("/ui/dashboard.html");
  await clearSessions(page);
  await seedSessions(page, sessions);
  await page.reload();

  await expect(page.locator(".timeline-item")).toHaveCount(2);
  await expect(page.locator("#summary-total")).toHaveText("2 sessions");

  await page.fill("#search", "docs.google");
  await expect(page.locator(".timeline-item")).toHaveCount(1);
  await expect(page.locator(".item-title")).toContainText("Project notes");

  await page.fill("#search", "task board");
  await page.evaluate(() => {
    window.__queryResult = [{ id: 11, windowId: 3, url: "https://example.com/task" }];
  });
  await page.click(".timeline-item");

  const calls = await page.evaluate(() => window.__calls);
  expect(calls.some((item) => item.api === "windows.update")).toBeTruthy();
  expect(calls.some((item) => item.api === "tabs.update")).toBeTruthy();
});

test("supports range switching between 1h and 4h views", async ({ page }) => {
  const now = Date.now();
  const sessions = [
    makeSession({
      id: "session-recent",
      url: "https://example.com/recent",
      title: "Recent tab",
      domain: "example.com",
      startAt: now - 10 * 60_000,
      endAt: now - 8 * 60_000,
      durationSec: 120
    }),
    makeSession({
      id: "session-older",
      url: "https://example.com/older",
      title: "Older tab",
      domain: "example.com",
      startAt: now - 3 * 60 * 60_000,
      endAt: now - 3 * 60 * 60_000 + 180_000,
      durationSec: 180
    })
  ];

  await page.goto("/ui/dashboard.html");
  await clearSessions(page);
  await seedSessions(page, sessions);
  await page.reload();

  await expect(page.locator(".timeline-item")).toHaveCount(1);
  await expect(page.locator(".item-title")).toContainText("Recent tab");

  await page.click('[data-range="4h"]');
  await expect(page.locator(".timeline-item")).toHaveCount(2);
});
