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
  - `Most recent`: recency-first ordering
- Time range filters: `1h`, `4h`, `24h`, `7d`
- Global side panel UI (dark mode default) with:
  - Search
  - Theme toggle (shared with full dashboard)
  - `Expand` to full dashboard tab
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
2. Use `Meaningful / All tabs / Most recent` filters.
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
- Run long-duration multi-window validation with artifact capture:
  - `npm run test:validate:long`
  - Optional headed mode:
    - PowerShell: `$env:VALIDATION_HEADED='1'; npm run test:validate:long`
  - Optional duration override:
    - PowerShell: `$env:VALIDATION_DURATION_MINUTES='10'; npm run test:validate:long`

Includes:
- Unit tests for session engine transitions, activity aggregation, and retention boundaries.
- Playwright tests for meaningful/all/recent views, ranking, and focus/open behavior.
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
