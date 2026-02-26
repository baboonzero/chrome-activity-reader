# Chrome Activity Reader — Approach Analysis & Plan

## 1. What You Want (Recap)

- **Scope:** All Chrome tabs across all Chrome windows on your machine.
- **Read-only:** Know what’s happening in each tab; no need to edit tab content.
- **History:** View activity over **1 hour**, **4 hours**, **1 day**, **1 week**.
- **Actions:** Click a link in the reader to **go to that tab** (focus it).
- **Persistence:** When a new tab is opened, store it and track:
  - When the action started
  - What you were doing on that page last (title, URL, optional snippet)
- **Single place:** One “control surface” to see everything and jump to any tab.

---

## 2. Can a “Plain Web Page” Do This?

**No.** A normal web page (e.g. `https://my-dashboard.com`) cannot:

- Enumerate Chrome tabs or windows
- Read tab titles, URLs, or last-accessed times
- Focus or switch to another tab

Browsers isolate web pages from Chrome’s internal tab/window list for security and privacy. So “just a web page” cannot be the primary way to read or control tabs. Any solution that uses a “controller page” must get its data from either:

- A **Chrome extension** (which has the right APIs), or  
- A **desktop app** that talks to Chrome (e.g. via CDP), with Chrome started in a special mode.

So the real choice is: **Chrome extension** vs **desktop app** (with the “page” being the extension’s UI or the app’s window).

---

## 3. Option A: Chrome Extension

**How it works**

- Install a Chrome extension that has the `tabs` permission (and optionally “scripting” / “activeTab” for optional content reading).
- A **background service worker** (or event page) uses `chrome.tabs` to:
  - List all tabs: `chrome.tabs.query({})` → all tabs in all windows (id, url, title, lastAccessed, windowId).
  - Listen for new/updated/closed/activated tabs: `chrome.tabs.onCreated`, `onUpdated`, `onRemoved`, `onActivated`.
- The extension stores **activity events** (tab opened, tab focused, title/URL changed) with timestamps in `chrome.storage.local` (or IndexedDB for larger history).
- A **dashboard UI** (extension page or side panel) shows:
  - Time filters: last 1 hour, 4 hours, 1 day, 1 week.
  - List/timeline of activity (e.g. “Tab X focused at 2:30 PM”, “New tab: Article title”).
  - Clicking an item calls `chrome.tabs.update(tabId, { active: true })` and `chrome.windows.update(windowId, { focused: true })` to bring that tab to the front.

**“What we were doing on that page last”**

- **Always available:** URL + page title (from `chrome.tabs`). No content script needed.
- **Optional:** Short text snippet (e.g. first 200 chars of visible text or meta description) via a **content script** that runs on the page and sends a message to the extension. This adds complexity and can be phased in later.

**Pros**

- No change to how you start Chrome (no flags, no remote debugging).
- One-time install; works with your existing hundreds of tabs and multiple windows.
- Full access to tab list, URLs, titles, last-accessed time, and ability to focus any tab.
- Dashboard can be an extension page (e.g. `chrome-extension://id/dashboard.html`) or the **Side Panel** (quick access from toolbar).
- Fits “lives on top of my machine” as something always available inside Chrome.

**Cons**

- “What we were doing” beyond title/URL requires optional content scripts and messaging.
- UI is inside Chrome (extension page or side panel), not a separate native window (unless you later add a small desktop companion that just opens the extension’s page).

---

## 4. Option B: Desktop App (e.g. Electron / Tauri)

**How it works**

- A desktop app connects to Chrome via the **Chrome DevTools Protocol (CDP)**.
- Chrome must be started with **remote debugging** enabled, e.g.  
  `chrome.exe --remote-debugging-port=9222`  
  (or a shortcut that always launches Chrome this way).
- The app uses CDP to:
  - Discover targets: `Target.getTargets()` → all open tabs/pages.
  - Get metadata and, if needed, attach to a page to get content (e.g. for “what we were doing”).
  - Activate a tab by attaching and using CDP (e.g. bring target to front).
- The app window is your “controller page” and can look like a normal desktop app.

**Pros**

- Native window, can look and feel like a standalone “Activity Reader” app.
- Can get richer content per tab via CDP if you need it later.

**Cons**

- **Requires Chrome to be launched with `--remote-debugging-port=9222`** (or another port). Many users don’t want to change how they start Chrome or keep a debugging port open.
- More moving parts: Chrome launch method, CDP client, security considerations (who can connect to 9222).
- Overkill if the main need is “list tabs, show history, jump to tab” — the extension already does that without any Chrome launch changes.

---

## 5. Option C: Hybrid (Extension + Optional Desktop Launcher)

- **Core:** Chrome extension (as in Option A) does all tab listing, history, and “go to tab.”
- **Optional:** A tiny desktop app or shortcut that only opens the extension’s dashboard page in Chrome (e.g. `chrome-extension://id/dashboard.html`). No CDP needed; the app is just a launcher.

This keeps the implementation simple (extension-only) while still giving a “desktop” entry point if you want it.

---

## 6. Recommendation

**Use a Chrome extension as the main (and initially only) product.**

Reasons:

1. **No Chrome launch changes** — Works with your current workflow and hundreds of tabs across windows.
2. **Enough API surface** — `chrome.tabs` gives you all tabs, URLs, titles, `lastAccessed`, and the ability to focus any tab; that’s enough for “see what’s happening” and “click to go there.”
3. **“What we were doing”** — Start with **URL + title + last-accessed/focus time**; add optional snippet later via content script if you need it.
4. **Single control surface** — The extension’s dashboard (page or side panel) is that one place to see 1h / 4h / 1d / 1w and jump to any tab.
5. **Simpler than a desktop app** — No CDP, no port, no special Chrome startup.

Use a **desktop app** only if you later need a standalone window without opening Chrome’s extension UI, or need CDP-specific features; you can add a small launcher that opens the extension page (Option C) first.

---

## 7. High-Level Architecture (Extension)

```
┌─────────────────────────────────────────────────────────────────┐
│  Chrome Activity Reader Extension                                │
├─────────────────────────────────────────────────────────────────┤
│  Background (service worker)                                     │
│  - chrome.tabs.query({}) → snapshot all tabs                    │
│  - Listen: onCreated, onUpdated, onRemoved, onActivated          │
│  - Build “activity” events: { tabId, windowId, url, title,       │
│      lastActiveAt, type: 'opened'|'focused'|'updated' }          │
│  - Persist in chrome.storage.local (or IndexedDB)               │
│  - Expose: getActivity(period) for dashboard                    │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard (extension page or side panel)                       │
│  - Time range: 1h | 4h | 1d | 1w                                │
│  - List/timeline of activities (grouped by time, deduped)        │
│  - Each row: favicon, title, URL, time, “Go to tab”              │
│  - On click → chrome.tabs.update + chrome.windows.update         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Implementation Plan

### Phase 1: Core extension (MVP)

1. **Scaffold**
   - `manifest.json` (Manifest V3): permissions `tabs`, `storage`; background service worker; optional side panel or extension page for dashboard.
   - Background script:
     - On install/start: one-time `chrome.tabs.query({})`, create initial activity records.
     - Listen to `tabs.onCreated`, `onUpdated`, `onRemoved`, `onActivated`; for each, create an activity event (tabId, windowId, url, title, timestamp, type).
     - Store events in `chrome.storage.local` with a simple schema (e.g. array of events, or by tabId with last N events). Optionally cap total events (e.g. last 5000) to avoid unbounded growth.
   - Define “last active” per tab: either Chrome’s `tab.lastAccessed` or the timestamp of the last `onActivated`/`onUpdated` we saw.

2. **Storage shape (example)**
   - `activities`: array of `{ tabId, windowId, url, title, lastActiveAt, type }`.
   - On each event: append (and optionally trim old entries by date).
   - Or key by `tabId`, value = `{ url, title, windowId, lastActiveAt, history: [...] }` and merge on update.

3. **Dashboard UI**
   - Single HTML page (or side panel): tabs or buttons for **1h | 4h | 1d | 1w**.
   - Call background (via `chrome.runtime.sendMessage`) to `getActivity({ period })`; background reads storage, filters by `lastActiveAt`, returns list (deduplicated by tab, keeping latest per tab).
   - Render list: favicon (from URL), title, URL (truncated), time; click → `chrome.tabs.update(tabId, { active: true }); chrome.windows.update(windowId, { focused: true })`.
   - Optional: “Open dashboard in new tab” from popup or toolbar.

4. **Polish**
   - Handle closed tabs: when user clicks a row, check tab still exists; if not, show “Tab closed” and optionally remove from list.
   - Optional: “Refresh” to re-sync from current `chrome.tabs.query({})` and fix any missed events.

### Phase 2: Better “what we were doing”

- Add optional **content script** (injected into selected pages or all): on load or on blur, send to extension a short snippet (e.g. `document.title`, `meta[name=description]`, or first 200 chars of `document.body.innerText`). Store snippet with the activity. Show snippet in dashboard rows.
- Consider performance: inject only when dashboard is open or on a small subset of tabs if needed.

### Phase 3 (optional): Desktop launcher

- Small Electron/Tauri app or script that opens `chrome-extension://<id>/dashboard.html` in the default browser (Chrome). No CDP; just “open this URL” so the extension page appears in Chrome.

---

## 9. Tech Choices (Concrete)

- **Manifest:** V3 (required for new extensions).
- **Background:** Service worker; use `chrome.storage.local` first; move to IndexedDB if you need more than ~5MB or complex queries.
- **Dashboard:** Vanilla JS + CSS, or a small framework (e.g. Preact) if you prefer components. No build step required for MVP.
- **Icons:** Simple 16/48/128 icons for the extension.

---

## 10. Summary

| Goal                         | Approach        | Notes                                                |
|-----------------------------|-----------------|------------------------------------------------------|
| See all tabs, all windows   | Chrome extension| `chrome.tabs.query({})`                              |
| Track when and what         | Extension       | Events + storage; “what” = title + URL (+ snippet)   |
| History 1h / 4h / 1d / 1w   | Extension       | Filter stored events by time range                   |
| Click to go to tab          | Extension       | `chrome.tabs.update` + `chrome.windows.update`       |
| No Chrome launch changes    | Extension       | Desktop app would need `--remote-debugging-port`     |

**Recommendation:** Build the **Chrome Activity Reader as a Chrome extension** with a dashboard (extension page or side panel), and add an optional desktop launcher later if you want a separate window entry point. Next step is to implement Phase 1 (scaffold + background listener + storage + dashboard with time ranges and “go to tab”).
