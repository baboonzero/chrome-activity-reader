# Chrome Activity Reader MVP Design

Date: 2026-02-26
Status: Approved

## 1. Problem Statement

The user works with hundreds of Chrome tabs spread across multiple windows and loses track of active work context over time. The product should provide a timeline view of recent browser activity so the user can see what they worked on and jump back quickly.

## 2. Goals

- Track tab-level activity across all Chrome windows.
- Show history for last 1 hour, 4 hours, 1 day, and 1 week.
- Let user click timeline entries to focus open tabs or reopen closed pages.
- Keep activity locally on the machine.
- Use a default retention period of 30 days.

## 3. Non-Goals (MVP)

- No in-page behavior capture (no clicks, text input, scroll details).
- No content editing or automation on tabs.
- No cross-browser support.
- No cloud sync.

## 4. Approaches Considered

## A. Chrome extension (recommended)

Pros:
- Direct access to tab and window lifecycle events.
- Reliable, real-time tracking for multiple windows and high tab count.
- Native actions to focus tabs/windows from a timeline UI.

Cons:
- Works only in Chrome.
- MV3 service worker lifecycle requires robust state restoration.

## B. Standalone web page

Pros:
- Easy to host and iterate UI.

Cons:
- Cannot access all local Chrome tabs/events due to browser sandbox.
- Still requires extension bridge, so not sufficient by itself.

## C. Desktop app only

Pros:
- Can evolve into cross-app activity tracking later.

Cons:
- Harder setup and maintenance for stable Chrome introspection.
- More complexity for MVP without clear advantage over extension.

Decision: Build MVP as a Chrome MV3 extension with a dashboard page (and optional side panel).

## 5. System Architecture

## 5.1 Components

- `service_worker`:
  - Listens to Chrome events.
  - Maintains active session state.
  - Writes activity sessions to IndexedDB.
  - Performs retention cleanup.
- `dashboard` (`chrome-extension://.../dashboard.html`):
  - Displays timeline.
  - Filter presets: 1h, 4h, 24h, 7d.
  - Search and click-to-focus/open actions.
- `settings`:
  - Pause/resume tracking.
  - Domain exclusions.
  - Retention display (default 30 days).

## 5.2 Required Chrome APIs

- `tabs`: tab create/update/remove, query existing tabs.
- `windows`: focus and window lifecycle signals.
- `webNavigation`: committed navigation URL changes.
- `idle`: detect idle/locked state and end active sessions cleanly.
- `storage`: lightweight settings storage (or store settings in IndexedDB).

## 5.3 Permissions (MVP)

- `"tabs"`
- `"webNavigation"`
- `"idle"`
- `"storage"`

No host permissions needed for MVP tab-level tracking.

## 6. Session Tracking Model

## 6.1 Session Definition

A session represents a contiguous interval where one tab is actively focused in a focused Chrome window while user is not idle/locked.

Session fields:
- `id` (string/uuid)
- `tabId` (number, may be stale after browser restart)
- `windowId` (number)
- `url` (string)
- `title` (string)
- `domain` (string)
- `startAt` (unix ms)
- `endAt` (unix ms)
- `durationSec` (integer)
- `endReason` (`tab_switch`, `window_blur`, `tab_closed`, `idle`, `lock`, `shutdown`, `unknown`)

## 6.2 State Machine

- Start session when:
  - a tab becomes active in focused window and user is active.
- End current session when:
  - active tab changes,
  - focused window changes away,
  - tab closes,
  - user becomes idle/locked,
  - extension/browser lifecycle requires checkpoint.
- Start a new session after end event if another active tab is eligible.

Rules:
- Never allow overlapping sessions.
- Ignore events that do not change effective active context.
- Debounce rapid event bursts.

## 7. Storage Design

Use IndexedDB for high-volume event/session data.

## 7.1 Object Stores

- `sessions`
  - key: `id`
  - indexes:
    - `startAt`
    - `endAt`
    - `domain_startAt`
    - `url_startAt`
- `tab_snapshot`
  - key: `tabId` (latest known metadata)
- `settings`
  - key/value settings (`retentionDays`, `excludedDomains`, `paused`)

## 7.2 Retention

- Default `retentionDays = 30`.
- Cleanup job runs on extension startup and periodically (for example every 6 hours).
- Cleanup deletes sessions where `endAt < now - 30 days`.

## 8. Timeline UX

## 8.1 Views

- Preset range filters:
  - `Last 1h`
  - `Last 4h`
  - `Last 24h`
  - `Last 7d`
- Chronological timeline with:
  - page title
  - domain
  - start/end time
  - duration

## 8.2 Actions

On item click:
- Query currently open tabs by URL/window context.
- If match found, focus window and activate tab.
- Else open URL in new tab.

## 8.3 Optional Enhancements (post-MVP)

- Domain/category summaries.
- Session grouping by project/window.
- Pinned “resume work” collections.

## 9. Error Handling and Reliability

- On service worker restart, restore last active session state from persisted checkpoint.
- Guard against missing tabs/windows caused by race conditions.
- Fallback end reason `unknown` if exact cause cannot be determined.
- Validate URLs and skip unsupported schemes (`chrome://`, extension pages) unless user enables them.

## 10. Privacy and Security

- Local-only by default (no remote sync in MVP).
- No page content capture.
- No keystroke or form-data tracking.
- Incognito disabled unless user opts in.
- Clear settings to pause tracking or exclude domains.

## 11. Performance Considerations

- Write completed sessions, not every transient event.
- Batch non-critical writes when possible.
- Keep memory state minimal (single active session + small cache).
- Indexed queries for fast time-window filtering.

## 12. Test Strategy

## Unit tests

- Session state machine transitions.
- Duration and end-reason correctness.
- Retention pruning.
- Filter query boundaries for 1h/4h/24h/7d.

## Integration/manual tests

- Multi-window switching with hundreds of tabs.
- Rapid tab switching and window focus thrash.
- Browser sleep/resume and idle/lock behavior.
- Click-to-focus existing tab and fallback open URL.

## 13. Success Criteria (MVP)

- Timeline accurately reflects active tab sessions with no overlaps.
- Filter queries load quickly for last 7 days on heavy usage.
- Click navigation succeeds for open tabs and closed tabs.
- Retention cleanup maintains 30-day local history cap.

## 14. Risks and Mitigations

- MV3 worker suspension:
  - Mitigation: checkpoint active session state frequently and recover on wake.
- Event ordering/races:
  - Mitigation: deterministic state machine and idempotent transitions.
- Very high tab churn:
  - Mitigation: debounce and ignore no-op transitions.

## 15. Implementation Readiness

Design is approved for implementation with scope fixed to tab-level activity and 30-day retention.
