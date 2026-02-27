# Chrome Activity Reader

Chrome extension that tracks all web tabs (`http/https`) and surfaces attention-weighted activity across the last 1 hour, 4 hours, 1 day, and 7 days.

For complete project history, architecture decisions, execution timeline, built/not-built scope, and current status, see:
- `project-history.md`

## Features

- Dual tracking model:
  - Tab lifecycle tracking for all web tabs (including never-focused tabs)
  - Focus-segment tracking for true time-spent
- View filters:
  - `Meaningful` (default): focused time `> 10s`
  - `All tabs`: includes `never focused` entries
- Time range filters: `1h`, `4h`, `24h`, `7d`
- Global side panel UI (dark mode default) with:
  - Search
  - Theme toggle (shared with full dashboard, live sync across open views)
  - `Expand` to full dashboard tab
  - Full-dashboard `Open Side Panel` button auto-disables while panel is already open in that window
- Click any entry to focus an existing tab or open it if already closed.
- Local-only storage (IndexedDB), no cloud sync.
- Retention defaults to 30 days.
- Settings for pause tracking, excluded domains, and shared theme.

## Load Extension (Developer Mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder:
   - `C:\Users\anshu\Downloads\AI Projects\Chrome Activity Reader`

## Use

1. Click extension icon to open the side panel.
2. Use `Meaningful / All tabs` filters.
3. Click `Expand` in side panel to open full dashboard tab.
4. Open Options/Settings to manage privacy and theme.

## Test Loop (Playwright)

1. Install dependencies:
   - `npm install`
2. Install browser binaries:
   - `npx playwright install chromium`
3. Run end-to-end tests:
   - `npm run test:e2e`

## Full Verification Loop

- Run unit and E2E suites together:
  - `npm run test:all`
- Run unpacked-extension smoke test in Chromium:
  - `npm run test:smoke:extension`
- Run extension state-transition flow matrix (single + pairwise action sequences):
  - `npm run test:flows:extension`
- Run long-duration multi-window validation with artifact capture:
  - `npm run test:validate:long`
  - Optional headed mode:
    - PowerShell: `$env:VALIDATION_HEADED='1'; npm run test:validate:long`
  - Optional duration override:
    - PowerShell: `$env:VALIDATION_DURATION_MINUTES='10'; npm run test:validate:long`

Includes:
- Unit tests for session engine transitions, activity aggregation, and retention boundaries.
- Playwright tests for meaningful/all views, ranking, and focus/open behavior.
- Real-extension flow-matrix checks for navigation/state transitions:
  - `Dashboard -> Settings` same-tab navigation
  - `Settings -> Dashboard` same-tab navigation
  - `Open Side Panel` success from dashboard and settings
  - Theme toggle and cross-surface theme sync
- Timestamped screenshots and accessibility snapshots for long-run validation evidence.
- Detailed evidence log:
  - `docs/testing/validation-evidence-2026-02-26.md`

## agent-browser Snapshot Proof

Example workflow (with explicit session name):

```powershell
agent-browser --session car open https://www.wikipedia.org
agent-browser --session car snapshot -i
agent-browser --session car screenshot ".\\artifacts\\agent-browser-proof.png" --full
agent-browser --session car close
```

If `default` session fails to start on Windows, use a non-default `--session` name.

## Notes

- Tracking scope is web tabs only (`http/https`), not `chrome://` or extension pages.
- No content-script capture of in-page click/typing/scroll behavior.
