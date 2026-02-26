# Chrome Activity Reader MVP Implementation Plan

Date: 2026-02-26
Depends on: `docs/plans/2026-02-26-chrome-activity-reader-design.md`

## 1. Scope

Implement Chrome MV3 extension MVP that tracks tab-level activity and provides timeline views for 1h/4h/24h/7d with 30-day retention.

## 2. Milestones

## Milestone 1: Extension skeleton and baseline wiring

Tasks:
- Create extension structure:
  - `manifest.json`
  - `src/background/`
  - `src/dashboard/`
  - `src/settings/`
  - `src/shared/`
- Configure MV3 service worker and required permissions.
- Add build/dev scripts (if using bundler) or static extension layout (if plain JS/TS).

Acceptance criteria:
- Extension loads in Chrome developer mode.
- Service worker starts without errors.
- Dashboard page opens from extension action.

## Milestone 2: Session engine and event capture

Tasks:
- Implement event adapter for `tabs`, `windows`, `webNavigation`, `idle`.
- Implement deterministic session state machine:
  - start session on eligible focus,
  - end on switch/blur/close/idle/lock.
- Add debounce/idempotence guards for event bursts.
- Add recovery path on worker restart.

Acceptance criteria:
- No overlapping sessions under rapid tab/window switches.
- Session `durationSec` and `endReason` are valid.
- Worker restart does not lose active-context continuity.

## Milestone 3: IndexedDB persistence and retention

Tasks:
- Define IndexedDB schema (`sessions`, `tab_snapshot`, `settings`).
- Create repository layer for writes/queries.
- Add retention cleanup scheduler (startup + periodic).
- Add settings defaults:
  - `retentionDays = 30`
  - `paused = false`
  - `excludedDomains = []`

Acceptance criteria:
- Completed sessions persist and can be queried by time ranges.
- Cleanup removes records older than 30 days.
- Settings persist across browser restarts.

## Milestone 4: Dashboard timeline UX

Tasks:
- Build timeline UI with filters: `1h`, `4h`, `24h`, `7d`.
- Add list rows with title/domain/start/end/duration.
- Add search by title/domain.
- Implement click action:
  - focus open tab if found,
  - otherwise open URL in new tab.

Acceptance criteria:
- Filter switching updates results correctly.
- Timeline renders quickly for 7-day range.
- Click action reliably jumps to live tab or opens URL.

## Milestone 5: Settings and privacy controls

Tasks:
- Build settings UI:
  - pause/resume tracking,
  - excluded domains editor,
  - retention display and description.
- Apply exclusions in session engine.
- Ensure unsupported/internal URLs are filtered by default.

Acceptance criteria:
- Paused state stops new session writes.
- Excluded domains do not generate tracked sessions.
- User can re-enable tracking without restart.

## Milestone 6: Hardening and release candidate

Tasks:
- Add unit tests for state machine, query boundaries, retention.
- Run manual stress test with high tab/window count.
- Fix race conditions and performance issues.
- Prepare readme and install/use notes.

Acceptance criteria:
- Core tests pass.
- Manual scenarios pass (multi-window, rapid switches, idle/lock).
- No major console/runtime errors during 60+ minute session.

## 3. Task Order and Dependencies

1. Milestone 1
2. Milestone 2 (depends on 1)
3. Milestone 3 (depends on 2)
4. Milestone 4 (depends on 3)
5. Milestone 5 (depends on 3,4)
6. Milestone 6 (depends on all prior)

## 4. Definition of Done

- Extension tracks tab-level sessions accurately.
- Dashboard supports 1h/4h/24h/7d navigation history.
- Click-through navigation works for open and closed tabs.
- Default retention is 30 days with cleanup enforced.
- Privacy scope remains tab metadata only, local storage only.

## 5. Suggested First Implementation Slice

Smallest end-to-end slice:
1. Minimal extension skeleton.
2. Track active-tab start/end to memory.
3. Persist sessions to IndexedDB.
4. Render raw session list in dashboard.
5. Add 1h filter and click-to-open.

This slice should be completed before styling or advanced settings.
