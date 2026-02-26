# Validation Evidence - 2026-02-26

This document records real extension-runtime validation runs with screenshot/snapshot evidence.

## Tooling Decision

- Intended skill for snapshots/screenshots: `agent-browser`.
- Environment status: `agent-browser` CLI was not installed (`command not found`).
- Fallback used: Playwright extension-runtime scripts:
  - `scripts/extension-smoke-test.mjs`
  - `scripts/long-duration-extension-validation.mjs`

## Run 1: Long-Duration Multi-Window (Headless)

- Run ID: `20260226-162944`
- Duration: 8 minutes
- Command: `npm run test:validate:long`
- Artifact root:
  - `artifacts/validation/20260226-162944/`
- Evidence:
  - 40+ screenshots across step checkpoints
  - 8 structured ARIA snapshots
  - JSON run log + markdown report

Observed outcome:
- Extension loaded and multi-window/tab switching actions executed.
- Runtime status remained healthy (`ok=true`, `retentionDays=30`).
- Final runtime idle state was `idle`, and final timeline count was `0`.

Interpretation:
- In headless automation, idle-state behavior can suppress effective session capture.

## Run 2: Real Extension Runtime (Headed) Sanity Validation

- Run ID: `20260226-163821`
- Duration: 2 minutes
- Command:
  - `$env:VALIDATION_HEADED='1'; $env:VALIDATION_DURATION_MINUTES='2'; npm run test:validate:long`
- Artifact root:
  - `artifacts/validation/20260226-163821/`
- Evidence:
  - Screenshots at each checkpoint
  - ARIA snapshots
  - JSON run log + markdown report

Observed outcome:
- Extension loaded in headed Chromium with unpacked extension.
- Timeline recorded at least one session (`timelineCount=1`).
- Runtime status healthy (`ok=true`, `paused=false`, `retentionDays=30`).

## Additional Runtime Proof

- Smoke command:
  - `npm run test:smoke:extension`
- Evidence output (JSON):
  - dashboard heading found
  - timeline container present
  - runtime message responded with retention=30
  - settings page loaded

## Conclusion

- Automated quality gates are green (`test:unit`, `test:e2e`, `test:all`).
- Real extension-runtime execution with screenshot evidence is complete.
- For strict “real-user long-duration” sign-off, run headed long validation while actively using the machine:
  - `$env:VALIDATION_HEADED='1'; $env:VALIDATION_DURATION_MINUTES='10'; npm run test:validate:long`
  - then review artifacts in `artifacts/validation/<run-id>/`.
