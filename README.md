# Chrome Activity Reader

Chrome extension MVP that tracks tab-level activity and shows what you worked on over the last 1 hour, 4 hours, 1 day, and 7 days.

For complete project history, architecture decisions, execution timeline, built/not-built scope, and current status, see:
- `project-history.md`

## MVP Features

- Tracks active tab sessions across Chrome windows.
- Captures session start/end time, URL, title, domain, and duration.
- Dashboard timeline with filters: `1h`, `4h`, `24h`, `7d`.
- Click timeline entry to focus existing tab or open URL if closed.
- Local-only storage (IndexedDB), no cloud sync.
- Retention defaults to 30 days.
- Settings for pause tracking and excluded domains.

## Load Extension (Developer Mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder:
   - `C:\Users\anshu\Downloads\AI Projects\Chrome Activity Reader`

## Use

- Click extension icon to open dashboard.
- Open Options from extension details page to manage settings.

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

Includes:
- Unit tests for session engine transitions and IndexedDB retention/query boundaries.
- Playwright dashboard tests for timeline filters, focus/open behavior, and settings action.

## Notes

- MVP tracks tab/window focus activity only.
- No content script and no in-page interaction capture.
