# Chrome Activity Reader: All-Tab Tracking + Global Side Panel Design

Date: 2026-02-26  
Status: APPROVED

## 1. Goals

1. Track all `http/https` tabs, including tabs never focused.
2. Default dashboard view: `Meaningful` (focused time strictly greater than 10 seconds).
3. Add toggle views:
   - `Meaningful`
   - `All tabs`
   - `Most recent`
4. Add global side panel UX:
   - Action click opens side panel
   - Side panel stays open while navigating
   - `Expand` opens full dashboard tab
5. Dark mode by default, with one shared theme setting across side panel and full dashboard.
6. Preserve 30-day default retention.

## 2. Confirmed Product Decisions

1. `All tabs` includes entries with `0s` focused time labeled `never focused`.
2. Side panel behavior is global; user uses action click to open and can navigate from panel.
3. Expand action opens full dashboard in a tab.
4. Meaningful threshold is `> 10s`.
5. Theme is one global setting for both panel and full views.
6. Clicking rows keeps side panel open.
7. Tracking scope remains web-only (`http/https`).
8. Sorting defaults:
   - `Meaningful`: highest focused time first
   - `All tabs`: newest first
   - `Most recent`: newest first

## 3. Architecture

### 3.1 Tracking Model

Two-stream model:

1. Tab lifecycle stream:
   - captures open/update/close state for every tracked tab context
2. Focus stream:
   - captures focused segments and durations

### 3.2 Storage Model

IndexedDB stores:

1. `sessions`:
   - focus segments (historical, immutable once written)
2. `tab_activity`:
   - one record per tracked tab context with aggregate metrics
3. `tab_snapshot`:
   - runtime mapping `tabId -> active tracked context`
4. `settings`:
   - paused, exclusions, retention, theme

## 4. Behavior Rules

1. Track only `http/https`.
2. When trackable tab appears and has no snapshot mapping:
   - create new `tab_activity` record
   - write `tab_snapshot` mapping
3. When a mapped tab URL changes:
   - close previous activity record
   - create new activity record for new URL
4. On focus transitions:
   - end previous focus segment
   - write to `sessions`
   - increment activity totals on associated `tab_activity`
5. `never focused`:
   - `totalFocusedSec === 0` and `everFocused === false`
6. Retention:
   - prune old sessions and tab activity older than cutoff
   - clear stale snapshots

## 5. UI Design

1. Primary surface: side panel (`ui/panel.html`).
2. Full dashboard surface: `ui/dashboard.html`.
3. Shared rendering logic and style system.
4. Dark-first design with configurable light mode.
5. Filters:
   - View mode (`Meaningful`, `All tabs`, `Most recent`)
   - Range (`1h`, `4h`, `24h`, `7d`)
   - Search
6. Row chips:
   - `never focused`
   - `open`/`closed`
   - focus duration

## 6. Multi-Agent Review Summary

### Skeptic / Challenger Findings

1. Risk: active-only tracking misses background-opened tabs.
   - Resolution: add lifecycle tracking and snapshot mapping.
2. Risk: URL changes collapse into one record and hide prior work.
   - Resolution: split tab contexts on URL change.

### Constraint Guardian Findings

1. Risk: retention pruning could orphan mappings.
   - Resolution: coordinated cleanup of activity and snapshot stores.
2. Risk: service worker restart can lose active segment context.
   - Resolution: preserve runtime focus state in storage and rehydrate.

### User Advocate Findings

1. Risk: noisy timeline obscures meaningful work.
   - Resolution: default `Meaningful` view with explicit threshold.
2. Risk: inconsistent theme between views.
   - Resolution: single shared theme setting.

### Integrator / Arbiter Disposition

Disposition: APPROVED  
Rationale: review objections resolved with bounded scope and no feature drift.

## 7. Decision Log

1. Decision: move from focused-session-only to event-based dual stream.
   - Alternatives: patch current model, polling model.
   - Why: dual stream supports both all-tab completeness and meaningful ranking.
2. Decision: dark mode default.
   - Alternative: follow system/light default.
   - Why: explicit user request and dashboard readability.
3. Decision: extension side panel as primary UI.
   - Alternative: full-page only.
   - Why: user requested in-tab column workflow.
4. Decision: avoid Chrome trademark icon usage.
   - Alternative: Chrome logo derivative.
   - Why: safer branding and clearer product identity.

## 8. Implementation Notes

`writing-plans` skill is not present in available skills for this workspace.  
Fallback: proceed with local implementation loop using this approved design as source of truth.
