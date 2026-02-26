export async function configureOpenOnActionClick(setPanelBehavior) {
  if (typeof setPanelBehavior !== "function") {
    return {
      ok: false,
      reason: "not_supported"
    };
  }

  try {
    await setPanelBehavior({
      openPanelOnActionClick: true
    });

    return {
      ok: true,
      reason: "configured"
    };
  } catch (error) {
    return {
      ok: false,
      reason: "set_panel_behavior_failed",
      error: String(error)
    };
  }
}
