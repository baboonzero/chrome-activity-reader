import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__calls = [];
    window.__messageResponses = {
      "open-dashboard": { ok: true, mode: "same_tab" },
      "open-side-panel": { ok: true, mode: "sender_window" },
      "settings-updated": { ok: true }
    };

    window.chrome = {
      tabs: {
        create: async (options) => {
          window.__calls.push({ api: "tabs.create", options });
          return {};
        }
      },
      runtime: {
        sendMessage: async (message) => {
          window.__calls.push({ api: "runtime.sendMessage", message });
          const type = message?.type;
          return window.__messageResponses[type] || { ok: true };
        },
        getURL: (path) => `chrome-extension://test/${path}`
      }
    };
  });
});

test("settings dashboard action routes via runtime and does not create a new tab directly", async ({ page }) => {
  await page.goto("/ui/settings.html");
  await page.click("#open-dashboard");

  const calls = await page.evaluate(() => window.__calls);
  expect(
    calls.some((item) => item.api === "runtime.sendMessage" && item.message?.type === "open-dashboard")
  ).toBeTruthy();
  expect(calls.some((item) => item.api === "tabs.create")).toBeFalsy();
});

test("settings side panel action shows error status when runtime returns failure", async ({ page }) => {
  await page.goto("/ui/settings.html");

  await page.evaluate(() => {
    window.__messageResponses["open-side-panel"] = {
      ok: false,
      mode: "failed"
    };
  });

  await page.click("#open-side-panel");
  await expect(page.locator("#status")).toHaveText("Unable to open side panel from this context.");
});

test("settings side panel action shows success status when opened", async ({ page }) => {
  await page.goto("/ui/settings.html");

  await page.evaluate(() => {
    window.__messageResponses["open-side-panel"] = {
      ok: true,
      mode: "sender_window"
    };
  });

  await page.click("#open-side-panel");
  await expect(page.locator("#status")).toHaveText("Side panel opened.");
});
