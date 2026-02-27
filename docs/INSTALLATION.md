# Chrome Activity Reader - Installation Guide

This guide explains exactly how to download, install, update, and verify the extension.

## 1. Download The Code

Choose one method.

### Method A: Download ZIP (no git)

1. Open: `https://github.com/baboonzero/chrome-activity-reader`
2. Click **Code** -> **Download ZIP**
3. Extract ZIP to a local folder

### Method B: Clone with git

```powershell
git clone https://github.com/baboonzero/chrome-activity-reader.git
cd chrome-activity-reader
```

## 2. Load As Unpacked Extension In Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the project root folder (must contain `manifest.json`)
5. Verify extension card appears as **Chrome Activity Reader**

Optional:
- Click the Chrome toolbar puzzle icon and pin **Chrome Activity Reader**

## 3. First-Run Check

1. Click the extension icon
2. Confirm side panel opens
3. Confirm default theme is dark
4. Confirm filters shown are:
   - `Meaningful`
   - `All tabs`
5. Open a few normal web tabs (`https://...`) and switch between them
6. Confirm activity appears in the extension

## 4. Update To The Latest Version

### If installed from git clone

```powershell
git pull origin main
```

### If installed from ZIP

1. Download and extract the newest ZIP
2. Replace your local folder with the new one

Then in Chrome:

1. Open `chrome://extensions`
2. Find **Chrome Activity Reader**
3. Click **Reload**

## 5. Uninstall

1. Open `chrome://extensions`
2. Find **Chrome Activity Reader**
3. Click **Remove**

## 6. Troubleshooting

### Extension does not appear after Load unpacked

- Make sure you selected the folder containing `manifest.json`
- Ensure Developer mode is enabled

### Clicking the extension icon does nothing

- Go to `chrome://extensions`
- Click **Service worker** under the extension and check for errors
- Click **Reload** on the extension and test again

### Activity list stays empty

- Tracking covers web tabs only: `http://` and `https://`
- `chrome://` pages and extension pages are intentionally excluded
- Open normal web pages and switch tabs to create activity

### Side panel button disabled

- It is disabled when side panel is already open in the same window
- Close the panel and wait a moment; the button should re-enable
