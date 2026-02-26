# Chrome Activity Reader

Chrome extension MVP that tracks tab-level activity and shows what you worked on over the last 1 hour, 4 hours, 1 day, and 7 days.

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

## Notes

- MVP tracks tab/window focus activity only.
- No content script and no in-page interaction capture.
