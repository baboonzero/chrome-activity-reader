# Plan: Chrome Activity Reader MVP Completion (Swarm Loop)

**Generated**: 2026-02-26
**Goal**: Complete remaining MVP hardening, testing, and release-readiness in one execution loop.

## Overview

This plan closes the remaining gaps from the approved MVP scope:
- deterministic session behavior under service-worker lifecycle events,
- robust retention/query behavior,
- automated tests for state logic and data boundaries,
- documentation for repeatable verification.

## Prerequisites

- Node.js 22+
- npm 10+
- Playwright Chromium installed (`npx playwright install chromium`)
- Chrome extension loadable from local project root

## Dependency Graph

```text
T1 ──┬── T2 ──┬── T4 ──┐
     │        └── T5 ──┤
     └── T3 ───────────┤
T6 ────────────────────┘
```

## Tasks

### T1: Gap Audit and Execution Baseline
- **depends_on**: []
- **location**: `background/service-worker.js`, `shared/db.js`, `docs/plans/`
- **description**: Validate current implementation against MVP definition and establish concrete completion checklist.
- **validation**: Checklist exists and all subsequent tasks map to identified gaps.
- **status**: Completed
- **log**: Baseline audit performed; key gaps found: service-worker recovery persistence, explicit unit tests for session logic/retention boundaries, and stronger completion docs.
- **files edited/created**: `docs/plans/2026-02-26-swarm-execution-plan.md`

### T2: Session Engine Hardening with Recovery
- **depends_on**: [T1]
- **location**: `background/service-worker.js`, `background/session-engine.js`
- **description**: Extract deterministic session transition logic into a dedicated module and add runtime-state persistence/recovery for worker restart/suspension scenarios.
- **validation**: No overlapping session transitions in logic tests; active session recovery path exists and is invoked on worker boot.
- **status**: Completed
- **log**: Extracted reusable `session-engine` module, integrated with service worker, and added runtime state persistence to `chrome.storage.local` for worker restart recovery without losing active session continuity.
- **files edited/created**: `background/session-engine.js`, `background/service-worker.js`

### T3: Storage/Query Hardening
- **depends_on**: [T1]
- **location**: `shared/db.js`
- **description**: Strengthen query and retention logic with explicit range guarantees and safe defaults for settings hydration.
- **validation**: Range query returns only in-window overlapping sessions; retention prune behavior is deterministic around cutoffs.
- **status**: Completed
- **log**: Added strict settings normalization (retention minimum, pause coercion, excluded domain cleanup/deduplication), range-input guards, and deterministic range/prune behavior for IndexedDB queries.
- **files edited/created**: `shared/db.js`

### T4: Unit Tests for Session + DB Boundaries
- **depends_on**: [T2]
- **location**: `tests/unit/`, `package.json`
- **description**: Add automated unit tests for session transition rules and IndexedDB range/retention behaviors.
- **validation**: Unit suite passes and covers session start/switch/end/restore plus db query and prune edges.
- **status**: Completed
- **log**: Added node test suite for session transition determinism and db boundaries, including restore behavior and retention pruning edge cases. Added script support and fake-indexeddb dev dependency.
- **files edited/created**: `tests/unit/session-engine.test.js`, `tests/unit/db.test.js`, `package.json`, `package-lock.json`

### T5: Playwright End-to-End Test Expansion
- **depends_on**: [T2]
- **location**: `tests/e2e/dashboard.spec.js`
- **description**: Expand browser tests for settings actions and open-tab vs reopen-url behavior.
- **validation**: E2E suite passes and verifies timeline actions and settings navigation flow.
- **status**: Completed
- **log**: Expanded dashboard E2E coverage to include reopen-url fallback and settings action from dashboard controls while preserving existing filter and focus tests.
- **files edited/created**: `tests/e2e/dashboard.spec.js`

### T6: Docs + Final Verification Loop
- **depends_on**: [T4, T5, T3]
- **location**: `README.md`, `docs/plans/2026-02-26-swarm-execution-plan.md`
- **description**: Run complete test loop, capture outcomes, and update final docs/checklist.
- **validation**: `npm run test:unit` and `npm run test:e2e` both pass; plan marked complete.
- **status**: Completed
- **log**: Ran full automated loop (`npm run test:all`) successfully and updated project docs with complete verification commands and coverage notes.
- **files edited/created**: `README.md`, `docs/plans/2026-02-26-swarm-execution-plan.md`

## Parallel Execution Groups

| Wave | Tasks | Can Start When |
|------|-------|----------------|
| 1 | T1 | Immediately |
| 2 | T2, T3 | T1 complete |
| 3 | T4, T5 | T2 complete |
| 4 | T6 | T3, T4, T5 complete |

## Test Strategy

- **Unit**
  - Session transition determinism (start/switch/end/recovery).
  - Session overlap prevention and reason mapping.
  - IndexedDB query boundaries for 1h/4h/24h/7d windows.
  - Retention cutoff pruning behavior.
- **End-to-End (Playwright)**
  - Timeline render + filter + range switching.
  - Focus existing open tab vs open closed URL.
  - Settings page navigation interaction.
- **Manual smoke**
  - Load unpacked extension.
  - Verify background worker starts cleanly.
  - Verify live sessions appear in dashboard after tab switching.

## Risks & Mitigations

- **MV3 worker lifecycle interruptions**
  - Persist runtime session context and rehydrate on worker boot.
- **Chrome API absence in test runtime**
  - Keep session engine pure and unit-testable; stub chrome APIs in e2e.
- **IndexedDB differences across environments**
  - Use fake-indexeddb in unit tests and keep db operations simple and index-driven.
