# Chrome Activity Reader - Complete Build Documentation

Last updated: 2026-02-27
Repository: https://github.com/baboonzero/chrome-activity-reader

## 1. Project Intent

Build a product that can:
- Track activity across hundreds of Chrome tabs in multiple windows.
- Show what the user worked on in time windows: 1 hour, 4 hours, 1 day, 1 week.
- Let the user click an entry and jump back to that tab (or reopen if closed).
- Keep all data local and private for MVP.

Primary product decision:
- Build as a **Chrome Extension (MV3)** instead of standalone web page or desktop-only app.

## 2. What Was The Process?

The process followed these phases:

1. Problem framing and architecture analysis.
2. Option comparison (extension vs web page vs desktop app).
3. MVP boundary definition (tab-level time activity only).
4. Design doc creation and implementation plan creation.
5. Repository initialization and baseline commits.
6. Extension scaffold implementation.
7. Test harness setup (Playwright).
8. Hardening loop (session engine extraction, runtime recovery, DB boundary controls).
9. Unit + E2E test expansion.
10. CI pipeline setup and manual acceptance assets.
11. Final verification and push to GitHub.
12. Product redesign pass: all-tab tracking, side panel UX, dark-first UI system.

All implementation was done in iterative loops:
- implement,
- test,
- fix,
- re-test,
- commit,
- push.

## 3. What Were The Actions That We Took?

Chronological execution log:

1. Created initial architecture/design artifacts:
   - `docs/plans/2026-02-26-chrome-activity-reader-design.md`
   - `docs/plans/2026-02-26-chrome-activity-reader-implementation-plan.md`

2. Initialized Git repository and committed baseline documentation.

3. Installed multi-agent/testing-support skills in local Codex skill directory:
   - `swarm-planner`
   - `parallel-task`
   - `super-swarm`
   - `playwright`

4. Enabled multi-agent feature flag in local Codex config:
   - `C:/Users/anshu/.codex/config.toml` -> `[features] multi_agents = true`

5. Implemented extension MVP foundation:
   - Manifest + service worker
   - IndexedDB data layer
   - Dashboard UI and settings UI
   - Session tracking event handling

6. Added Playwright E2E coverage for dashboard behavior.

7. Added swarm-style execution tracker:
   - `docs/plans/2026-02-26-swarm-execution-plan.md`

8. Refactored session logic into pure engine module:
   - `background/session-engine.js`

9. Added runtime recovery mechanism:
   - Persist active session runtime context to `chrome.storage.local`
   - Rehydrate on service worker boot

10. Hardened DB layer:
    - Settings normalization and safe defaults
    - Range guards
    - Deterministic retention pruning

11. Added unit tests:
    - `tests/unit/session-engine.test.js`
    - `tests/unit/db.test.js`

12. Expanded E2E tests:
    - Open existing tab vs reopen closed URL
    - Settings action from dashboard

13. Added manual acceptance assets:
    - `docs/testing/manual-acceptance-checklist.md`
    - `scripts/manual-acceptance.ps1`

14. Added GitHub Actions CI:
    - `.github/workflows/ci.yml`
    - Runs `npm run test:all` on push/PR.

15. Repeated full verification:
    - `npm run test:unit`
    - `npm run test:e2e`
    - `npm run test:all`

16. Pushed final state to GitHub `main`.

17. Installed and verified `agent-browser` skill/tooling for screenshot/snapshot-driven browser validation.

18. Ran full verification loop again:
    - `npm run test:all`
    - `npm run test:smoke:extension`

19. Executed headed long-duration multi-window validation:
    - Run ID: `20260226-165807`
    - Duration: 12 minutes
    - Steps: 36
    - Artifacts: screenshots + ARIA snapshots + JSON/markdown reports under `artifacts/validation/20260226-165807/`

20. Executed direct `agent-browser` snapshot/screenshot proof flow:
    - Non-default session workaround (`--session car`) due local default-session port conflict.
    - Captured evidence screenshot:
      - `artifacts/validation/20260226-165807/screenshots/agent-browser-wikipedia.png`

21. Updated validation evidence document:
    - `docs/testing/validation-evidence-2026-02-26.md`

22. Created approved redesign artifact for all-tab tracking + side panel:
    - `docs/plans/2026-02-26-all-tab-sidepanel-design.md`

23. Upgraded data model:
    - added `tab_activity` store and aggregation APIs in `shared/db.js`
    - retained focus segments in `sessions`
    - added shared theme setting (`dark` default)

24. Refactored service worker for dual-stream tracking:
    - tab lifecycle stream for all web tabs
    - focus segment stream for attention time
    - synchronized retention pruning across stores

25. Implemented new UX surfaces:
    - `ui/panel.html` (side panel)
    - redesigned `ui/dashboard.html` (full dashboard)
    - shared renderer/style: `ui/activity.js`, `ui/activity.css`
    - settings redesign with theme + side panel actions

26. Added visual system assets:
    - custom extension icon set (`assets/icons/*`)
    - local bundled fonts (`assets/fonts/*`)

27. Updated automated tests for new behavior model and ran:
    - `npm run test:all` (pass)
    - `npm run test:smoke:extension` (pass)

28. Executed fresh headed long-duration runtime validation:
    - Run ID: `20260226-191647`
    - Artifacts: `artifacts/validation/20260226-191647/`

29. Enhanced validation loop to capture end-state screenshots and metrics for all view filters available at that time (`Meaningful`, `All tabs`, `Most recent`), then reran headed validation:
    - Run ID: `20260226-192909`
    - All tabs proof: `count=6`, `never-focused=4`
    - Artifacts: `artifacts/validation/20260226-192909/`

30. Hardened action-click validation and fixed testing blind spot after user-reported regression:
    - extracted action-click flow to `background/action-click.js`
    - corrected all-windows panel open success criteria (`openedCount > 0`)
    - added side-panel behavior module + tests (`background/side-panel-behavior.js`, `tests/unit/side-panel-behavior.test.js`)
    - switched native side-panel behavior to `openPanelOnActionClick: true`
    - extended smoke assertions to require side-panel API availability and configured action-click behavior

31. Fixed post-release UI consistency and settings workflow regressions:
    - replaced synthetic hero badge with app icon asset on dashboard/panel/settings headers
    - corrected dashboard tagline copy to present tense ("Surface what matters")
    - fixed dark-mode settings dropdown contrast (readable select + option colors)
    - changed full-dashboard Settings action to open settings in the same tab via runtime message routing
    - extended automated coverage:
      - e2e test for theme select contrast in dark/light
      - smoke assertions for same-tab settings routing and cross-page theme sync

32. Fixed state-transition regressions and introduced transition-matrix flow testing:
    - fixed `open-side-panel` runtime route to prefer sender window and then fallback to global-open
    - fixed settings `Dashboard` action to route through runtime same-tab navigation
    - added explicit settings-page e2e coverage (`tests/e2e/settings.spec.js`)
    - added real-extension transition framework (`scripts/extension-flow-matrix-test.mjs`) with single-step + pairwise sequence validation
    - expanded smoke assertions to verify:
      - side-panel open success from dashboard and settings
      - settings/dashboard round-trip in same tab
      - unchanged tab count across round-trip sequence

33. Fixed favicon cache regression in extension tabs:
    - introduced cache-busted icon asset set (`icon-v2-*`)
    - updated manifest icons and bumped extension version to `0.1.1`
    - updated dashboard/panel/settings favicon links and header icon references
    - extended smoke assertions to require `icon-v2-32.png` favicon path in both dashboard and settings

34. Fixed cross-surface live theme sync regression:
    - added runtime theme broadcast (`theme-changed`) from service worker on `set-theme` and `settings-updated`
    - added listeners in dashboard/panel and settings pages to apply incoming theme updates live
    - synchronized settings dropdown value with runtime theme updates
    - expanded tests:
      - e2e runtime broadcast tests for dashboard and settings
      - smoke assertions for two-way live sync (`dashboard -> panel` and `panel -> dashboard/settings`)

35. Added side-panel-open state guard for full dashboard action:
    - introduced panel heartbeat + close signaling (`panel-heartbeat`, `panel-closed`) from side panel UI
    - service worker now tracks window-scoped side-panel-open state with heartbeat TTL
    - full dashboard `Open Side Panel` button now disables while panel is open in that window and re-enables after close/expiry
    - expanded tests:
      - e2e button disable/re-enable coverage in dashboard spec
      - smoke assertions for disabled-while-open and enabled-after-close behavior

36. Hardened side-panel close detection after user regression report:
    - improved panel close emission with `visibilitychange` + `pagehide` + `beforeunload` handling
    - adjusted smoke validation to assert re-enable using deterministic close signal and runtime state checks
    - revalidated full suite (`test:all`, `test:smoke:extension`, `test:flows:extension`)

37. Simplified view filtering by removing redundant `Most recent` mode:
    - verified `All tabs` and `Most recent` had identical filter/sort behavior
    - removed `Most recent` filter from dashboard and side panel UI
    - updated E2E/smoke/long-validation scripts and docs to the two-filter model (`Meaningful`, `All tabs`)
    - revalidated full suite (`test:all`, `test:smoke:extension`, `test:flows:extension`)

38. Completed end-user installation documentation:
    - expanded `README.md` with explicit GitHub download + install + update steps
    - added dedicated guide: `docs/INSTALLATION.md`
    - updated project documentation status and validation references

## 4. What Were The Decisions That We Took?

### Product/Architecture Decisions

1. **Platform:** Chrome extension (MV3) as core product.
2. **Tracking scope:** All web tabs tracked + focused-time aggregation (still no in-page click/scroll/input capture).
3. **Data storage:** IndexedDB for sessions/settings/snapshots.
4. **Retention default:** 30 days.
5. **Privacy stance:** Local-only storage; no cloud sync in MVP.
6. **UI model:** Global side panel + full dashboard + settings.
7. **Default work view:** `Meaningful` (`focused time > 10s`) with toggle for `All tabs`.
8. **Theme policy:** Dark mode default with one shared setting across side panel/full dashboard.
9. **Action-click reliability:** Enable native side-panel open-on-action-click and treat fallback-only behavior as a test smell.
10. **Flow reliability:** Treat navigation/side-panel interactions as state transitions and test them with transition-matrix automation.

### Engineering Decisions

1. Extract pure session transition logic into `background/session-engine.js`.
2. Persist runtime session state for service worker restart resilience.
3. Add separate unit tests for pure logic plus Playwright E2E for behavior.
4. Add CI pipeline to run full verification on pushes/PRs.
5. Add manual acceptance checklist/script for real Chrome validation.

## 5. What Did We Start By Building?

First implementation slice:

1. `manifest.json` with MV3 service worker and permissions.
2. `background/service-worker.js` with event listeners for tabs/windows/idle/alarms.
3. `shared/db.js` for IndexedDB stores and session/settings persistence.
4. Dashboard + Settings pages (initially):
   - `ui/dashboard.html`, `ui/dashboard.js`, `ui/dashboard.css`
   - `ui/settings.html`, `ui/settings.js`

This delivered a runnable end-to-end MVP skeleton quickly.

## 6. What Have We Built?

### Core Functionality

- Dual-stream tracking:
  - all-tab lifecycle tracking for web tabs (`http/https`)
  - focus-segment tracking for time spent
- Session end reasons (`tab_switch`, `window_blur`, `tab_closed`, `idle`, `lock`, etc.).
- Filtered activity views:
  - `Meaningful` (default, focused time >10s)
  - `All tabs` (includes `never focused`)
- Time filters:
  - 1h / 4h / 1d / 7d
- Search by title/domain/url.
- Click-to-focus existing tab with fallback to open URL when closed.
- Side panel workflow:
  - global side panel entry from action click
  - `Expand` action opens full dashboard tab
- Settings:
  - pause tracking
  - excluded domains
  - shared dark/light theme
  - retention display (30 days default)

### Reliability and Hardening

- Debounce protection for rapid repeated transitions.
- Runtime active-session persistence + recovery on worker restart.
- Deterministic settings normalization and DB range handling.
- Retention cleanup alarm and pruning logic.

### Testing

- Unit tests for session engine and DB boundaries.
- Playwright E2E tests for timeline and action flows.
- Real-extension transition-matrix tests for sequence coverage across dashboard/settings interactions.
- Combined test command (`npm run test:all`).

### Tooling/Operations

- `.gitignore`
- npm-based project scripts
- GitHub Actions CI workflow
- Manual acceptance checklist + helper script

## 7. What Have We Not Built?

Not in MVP (intentionally out of scope):

1. In-page behavior tracking (clicks, typing, scroll, content snapshots).
2. Cloud sync/account/multi-device history.
3. Cross-browser support (Edge/Firefox/Safari).
4. Advanced analytics (project clusters, AI summaries, semantic categorization).
5. Packaging/publishing flow for Chrome Web Store.
6. Formal migration/versioning strategy for future DB schema upgrades.
7. Analytics clustering/semantic work summaries.

## 8. Current Status

### Delivery Status

- MVP implementation: **complete**
- Hardening loop: **complete**
- Automated tests: **green**
- CI workflow: **configured**
- Manual acceptance assets: **present**
- End-user installation guide: **present**
- Headed long-duration runtime validation with artifacts: **complete**
- Side panel + all-tab model rollout: **complete**
- Repo pushed to GitHub: **yes**

### Quality Status

- `npm run test:unit`: passing
- `npm run test:e2e`: passing
- `npm run test:all`: passing
- `npm run test:smoke:extension`: passing
- `npm run test:flows:extension`: passing (`18/18` transition sequences)
- Cross-surface live theme sync check: passing (`dashboard->panel`, `panel->dashboard/settings`)
- Side-panel-open guard check: passing (`disabled while open`, `re-enabled after close`)
- Long-duration headed validation: passing (`runId=20260226-192909`, `allTabsCount=6`, `neverFocused=4`, `retentionDays=30`, `theme=dark`)
- Runtime sanity long-validation: passing (`runId=20260227-125812`, `allTabsCount=9`, `retentionDays=30`, `theme=dark`)
- Action-click config check: passing (`sidePanelApiAvailable=true`, `openPanelOnActionClick=true`)

### Branch/History Status

Primary commits:
- `249bc7c` Initialize project with approved MVP design and implementation plan
- `0f2e6fc` Build MV3 Chrome Activity Reader MVP scaffold
- `b1db2c7` Add Playwright test loop for dashboard behavior
- `4fb4594` Complete MVP hardening, recovery, and full test loop
- `0b49afb` Add full project documentation, CI workflow, and acceptance checklist
- `0a14196` Rename project history doc and add real extension smoke test
- `c59d30f` Add long-duration extension validation with screenshot evidence
- `6ac346b` Document headed long-run validation and agent-browser evidence
- `5ba01b2` Remove redundant Most recent view filter

## 9. File-Level Map Of What Exists

### Product

- `manifest.json`
- `background/service-worker.js`
- `background/session-engine.js`
- `background/action-click.js`
- `background/side-panel-behavior.js`
- `shared/db.js`
- `shared/time.js`
- `shared/url.js`
- `assets/icons/icon-16.png`
- `assets/icons/icon-32.png`
- `assets/icons/icon-48.png`
- `assets/icons/icon-128.png`
- `assets/icons/icon-v2-16.png`
- `assets/icons/icon-v2-32.png`
- `assets/icons/icon-v2-48.png`
- `assets/icons/icon-v2-128.png`
- `assets/fonts/space-grotesk-400.ttf`
- `assets/fonts/space-grotesk-500.ttf`
- `assets/fonts/space-grotesk-700.ttf`
- `assets/fonts/ibm-plex-sans-400.ttf`
- `assets/fonts/ibm-plex-sans-500.ttf`
- `assets/fonts/ibm-plex-sans-600.ttf`
- `ui/dashboard.html`
- `ui/panel.html`
- `ui/activity.js`
- `ui/activity.css`
- `ui/settings.html`
- `ui/settings.js`

### Tests

- `tests/unit/session-engine.test.js`
- `tests/unit/db.test.js`
- `tests/unit/action-click.test.js`
- `tests/unit/side-panel-behavior.test.js`
- `tests/e2e/dashboard.spec.js`
- `tests/e2e/settings.spec.js`
- `playwright.config.mjs`

### Documentation and Planning

- `README.md` (quick start)
- `project-history.md` (this full build document)
- `docs/INSTALLATION.md`
- `docs/APPROACH_AND_PLAN.md`
- `docs/plans/2026-02-26-chrome-activity-reader-design.md`
- `docs/plans/2026-02-26-chrome-activity-reader-implementation-plan.md`
- `docs/plans/2026-02-26-swarm-execution-plan.md`
- `docs/plans/2026-02-26-all-tab-sidepanel-design.md`
- `docs/testing/manual-acceptance-checklist.md`
- `docs/testing/validation-evidence-2026-02-26.md`

### Operations

- `.github/workflows/ci.yml`
- `scripts/extension-flow-matrix-test.mjs`
- `scripts/manual-acceptance.ps1`
- `package.json`
- `package-lock.json`
- `.gitignore`

## 10. How To Validate Right Now

1. Install dependencies:
   - `npm install`
2. Run full test loop:
   - `npm run test:all`
3. Run state-transition flow matrix:
   - `npm run test:flows:extension`
4. Download and install extension:
   - `docs/INSTALLATION.md`
5. Run manual acceptance helper:
   - `pwsh ./scripts/manual-acceptance.ps1 -RunAutomatedTests`
6. Walk through checklist:
   - `docs/testing/manual-acceptance-checklist.md`

## 11. Summary

This project has moved from concept to a tested, upgraded MVP with:
- all-tab web activity capture plus focused-time aggregation,
- side panel and full-dashboard workflows,
- meaningful/all filtering model,
- dark-first themed UI with shared theme settings,
- privacy-first local storage,
- automated and manual verification paths,
- CI on GitHub.

Latest verification cycle confirms:
- all automated suites are green,
- real extension runtime works in headed long-duration multi-window flow,
- screenshot/snapshot evidence is recorded.

The current codebase is production-ready for MVP-level internal use and ready for the next phase (publishing hardening, side panel UX, and optional richer activity intelligence).
