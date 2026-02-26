export async function executeActionClick({
  getFocusedWindowId,
  openPanelForWindow,
  openPanelForAllWindows,
  openDashboardTab
}) {
  let focusedWindowId = null;
  try {
    focusedWindowId = await getFocusedWindowId();
  } catch {
    focusedWindowId = null;
  }

  let openedFromFocusedWindow = false;
  if (typeof focusedWindowId === "number") {
    openedFromFocusedWindow = await openPanelForWindow(focusedWindowId);
  }

  if (openedFromFocusedWindow) {
    // Best-effort global open to honor the global side panel requirement.
    await openPanelForAllWindows().catch(() => {});
    return {
      ok: true,
      mode: "panel_focused_window",
      focusedWindowId
    };
  }

  const openedAnyWindow = await openPanelForAllWindows();
  if (openedAnyWindow) {
    return {
      ok: true,
      mode: "panel_all_windows",
      focusedWindowId
    };
  }

  await openDashboardTab();
  return {
    ok: true,
    mode: "dashboard_fallback",
    focusedWindowId
  };
}
