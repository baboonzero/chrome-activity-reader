# Manual Acceptance Checklist

Date: 2026-02-26
Scope: Chrome Activity Reader MVP acceptance in a real Chrome session.

## 1. Preconditions

- Chrome installed.
- Extension loaded via `chrome://extensions` using **Load unpacked** from project root.
- Developer mode enabled.
- No critical extension errors in service worker console.

## 2. Baseline Validation

1. Click extension action icon.
2. Confirm dashboard opens.
3. Confirm default range is `Last 1h`.
4. Confirm summary section and timeline render without runtime errors.

Expected:
- Dashboard visible and interactive.
- No red errors in extension background console.

## 3. Session Tracking Behavior

1. Open 3+ tabs across at least 2 windows.
2. Switch active tabs every 5-10 seconds for 1-2 minutes.
3. Return to dashboard.

Expected:
- New timeline rows appear with title, domain, URL, and duration.
- Entries reflect active focus changes.
- No obviously overlapping sessions for the same focused interval.

## 4. Range Filters and Search

1. On dashboard, click filters `1h`, `4h`, `1d`, `7d`.
2. Use search input with domain text and title text.

Expected:
- Filter switch updates timeline content.
- Search reduces visible rows correctly.
- Summary counts and total duration update with filtered set.

## 5. Navigation Actions

1. Click a timeline row whose tab is still open.
2. Close a tracked tab.
3. Click its row again.

Expected:
- Open tab: window/tab is focused.
- Closed tab: URL opens in a new tab.

## 6. Settings and Privacy Controls

1. Open settings.
2. Enable `Pause tracking`.
3. Switch tabs for ~30 seconds.
4. Disable `Pause tracking`.
5. Add excluded domain (for example `example.com`) and save.
6. Browse excluded domain, then return to dashboard.

Expected:
- While paused, no new sessions should be recorded.
- After resume, tracking continues.
- Excluded domain activity is not added.

## 7. Retention and Restart Recovery

1. Confirm retention displayed as 30 days in settings.
2. Inspect service worker logs and trigger worker restart (from extension page).
3. Continue browsing and verify timeline continuity.

Expected:
- Retention stays at 30 days unless changed in code/config.
- Worker restart does not break subsequent session capture.

## 8. Acceptance Criteria

MVP accepted when all below are true:
- Tab-level sessions are captured accurately enough for practical use.
- Dashboard supports 1h/4h/1d/7d visibility.
- Click-through navigation to active/closed tabs works.
- Pause + exclusion controls behave as expected.
- Automated tests pass (`npm run test:all`).
