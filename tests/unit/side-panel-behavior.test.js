import assert from "node:assert/strict";
import test from "node:test";

import { configureOpenOnActionClick } from "../../background/side-panel-behavior.js";

test("configures native side-panel open on action click when API is available", async () => {
  const calls = [];

  const result = await configureOpenOnActionClick(async (options) => {
    calls.push(options);
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, "configured");
  assert.deepEqual(calls, [{ openPanelOnActionClick: true }]);
});

test("returns not supported when setPanelBehavior is unavailable", async () => {
  const result = await configureOpenOnActionClick(undefined);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "not_supported");
});

test("returns failed result when setPanelBehavior throws", async () => {
  const result = await configureOpenOnActionClick(async () => {
    throw new Error("panel config failure");
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "set_panel_behavior_failed");
  assert.match(result.error, /panel config failure/);
});
