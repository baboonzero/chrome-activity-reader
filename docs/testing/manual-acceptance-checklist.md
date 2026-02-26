# Manual Acceptance Checklist

Date: 2026-02-26  
Scope: Chrome Activity Reader side-panel and full-dashboard acceptance in a real Chrome session.

## 1. Preconditions

- Chrome installed.
- Extension loaded via `chrome://extensions` using **Load unpacked** from project root.
- Developer mode enabled.
- No critical extension errors in service worker console.

## 2. Side Panel Baseline

1. Click extension action icon.
2. Confirm side panel opens (column layout, full height).
3. Confirm default view is `Meaningful`.
4. Confirm default theme is dark.

Expected:
- Side panel renders and is interactive.
- No runtime errors in extension console.

## 3. Global Side Panel and Expand

1. Open at least 2 Chrome windows.
2. Click extension action icon and verify panel access across windows.
3. In panel, click `Expand`.

Expected:
- Side panel workflow is available in the current browsing context.
- `Expand` opens full dashboard in a new tab.

## 4. All-Tab Tracking and View Filters

1. Open 6+ tabs across windows (mixed dwell times).
2. Leave one tab open but never focused.
3. Switch among several tabs and spend >10 seconds on at least two.
4. In panel/dashboard, switch between:
   - `Meaningful`
   - `All tabs`
   - `Most recent`

Expected:
- `Meaningful` only shows entries with focused time >10s.
- `All tabs` includes `never focused` entries.
- `Most recent` orders newest activity first.

## 5. Range + Search

1. Toggle `1h`, `4h`, `1d`, `7d`.
2. Search by domain and title text.
3. Clear search box.

Expected:
- Result set updates correctly by range.
- Search filters list and summary metrics.
- Clearing search restores unfiltered results for selected view/range.

## 6. Row Navigation Behavior

1. Click row for an open tab.
2. Close one tracked tab, then click its row.
3. Confirm side panel remains open after row clicks.

Expected:
- Open row: focuses existing window/tab.
- Closed row: opens URL in new tab.
- Side panel remains visible.

## 7. Theme + Settings

1. Open settings.
2. Toggle theme to light and save.
3. Verify both panel and full dashboard switch to light.
4. Toggle back to dark and save.

Expected:
- Theme is shared across panel and full views.
- Dark is default on fresh load.

## 8. Privacy Controls and Retention

1. Enable `Pause tracking`.
2. Switch tabs for ~30 seconds.
3. Disable `Pause tracking`.
4. Add excluded domain (example `example.com`) and save.
5. Browse excluded domain.

Expected:
- While paused, no new focus activity is added.
- After resume, tracking continues.
- Excluded domains are not tracked.
- Retention remains 30 days by default.

## 9. Service Worker Restart Resilience

1. From `chrome://extensions`, restart service worker.
2. Continue browsing and revisit panel/dashboard.

Expected:
- Tracker resumes without fatal state corruption.
- New activity still appears.

## 10. Acceptance Criteria

Accepted when all are true:

- Side panel workflow behaves as designed.
- All-tab tracking includes `never focused` entries.
- Meaningful filter threshold (`>10s`) works.
- Most recent filter and range controls work.
- Theme synchronization works across views.
- Automated tests pass (`npm run test:all` and `npm run test:smoke:extension`).
