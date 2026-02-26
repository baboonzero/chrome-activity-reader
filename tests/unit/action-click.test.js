import assert from "node:assert/strict";
import test from "node:test";

import { executeActionClick } from "../../background/action-click.js";

test("uses focused window first, then best-effort global open", async () => {
  const calls = [];

  const result = await executeActionClick({
    getFocusedWindowId: async () => 7,
    openPanelForWindow: async (windowId) => {
      calls.push(["openPanelForWindow", windowId]);
      return true;
    },
    openPanelForAllWindows: async () => {
      calls.push(["openPanelForAllWindows"]);
      return true;
    },
    openDashboardTab: async () => {
      calls.push(["openDashboardTab"]);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "panel_focused_window");
  assert.equal(result.focusedWindowId, 7);
  assert.deepEqual(calls, [
    ["openPanelForWindow", 7],
    ["openPanelForAllWindows"]
  ]);
});

test("falls back to all-windows open when focused-window open fails", async () => {
  const calls = [];

  const result = await executeActionClick({
    getFocusedWindowId: async () => 22,
    openPanelForWindow: async (windowId) => {
      calls.push(["openPanelForWindow", windowId]);
      return false;
    },
    openPanelForAllWindows: async () => {
      calls.push(["openPanelForAllWindows"]);
      return true;
    },
    openDashboardTab: async () => {
      calls.push(["openDashboardTab"]);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "panel_all_windows");
  assert.equal(result.focusedWindowId, 22);
  assert.deepEqual(calls, [
    ["openPanelForWindow", 22],
    ["openPanelForAllWindows"]
  ]);
});

test("falls back to dashboard when panel open fails everywhere", async () => {
  const calls = [];

  const result = await executeActionClick({
    getFocusedWindowId: async () => 4,
    openPanelForWindow: async (windowId) => {
      calls.push(["openPanelForWindow", windowId]);
      return false;
    },
    openPanelForAllWindows: async () => {
      calls.push(["openPanelForAllWindows"]);
      return false;
    },
    openDashboardTab: async () => {
      calls.push(["openDashboardTab"]);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "dashboard_fallback");
  assert.equal(result.focusedWindowId, 4);
  assert.deepEqual(calls, [
    ["openPanelForWindow", 4],
    ["openPanelForAllWindows"],
    ["openDashboardTab"]
  ]);
});

test("continues when focused window lookup throws", async () => {
  const calls = [];

  const result = await executeActionClick({
    getFocusedWindowId: async () => {
      throw new Error("no focused window");
    },
    openPanelForWindow: async () => {
      calls.push(["openPanelForWindow"]);
      return false;
    },
    openPanelForAllWindows: async () => {
      calls.push(["openPanelForAllWindows"]);
      return true;
    },
    openDashboardTab: async () => {
      calls.push(["openDashboardTab"]);
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "panel_all_windows");
  assert.equal(result.focusedWindowId, null);
  assert.deepEqual(calls, [["openPanelForAllWindows"]]);
});
