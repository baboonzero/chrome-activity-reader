# Validation Evidence - 2026-02-26

This document records real extension-runtime validation runs with screenshot/snapshot artifacts.

## Tooling Status

- `agent-browser` skill is installed and available in this environment.
- `agent-browser` CLI is installed (`agent-browser 0.15.0`).
- Runtime caveat on this machine:
  - Default session (`default`) maps to a blocked Windows TCP port.
  - Working approach: run `agent-browser` with an explicit non-default session (example: `--session car`).

## Run 1: Long-Duration Multi-Window (Headless)

- Run ID: `20260226-162944`
- Duration: 8 minutes
- Command: `npm run test:validate:long`
- Artifact root:
  - `artifacts/validation/20260226-162944/`
- Evidence:
  - 40+ screenshots across checkpoints
  - ARIA snapshots
  - JSON run log + markdown report

Observed outcome:
- Extension loaded and multi-window/tab switching executed.
- Runtime status remained healthy (`ok=true`, `retentionDays=30`).
- Final runtime idle state was `idle`, and final timeline count was `0`.

Interpretation:
- In headless mode, idle-state behavior can suppress effective session capture.

## Run 2: Real Extension Runtime (Headed) Sanity

- Run ID: `20260226-163821`
- Duration: 2 minutes
- Command:
  - `$env:VALIDATION_HEADED='1'; $env:VALIDATION_DURATION_MINUTES='2'; npm run test:validate:long`
- Artifact root:
  - `artifacts/validation/20260226-163821/`
- Evidence:
  - Screenshots at checkpoints
  - ARIA snapshots
  - JSON run log + markdown report

Observed outcome:
- Extension loaded in headed Chromium with unpacked extension.
- Timeline recorded sessions (`timelineCount=1`).
- Runtime status healthy (`ok=true`, `paused=false`, `retentionDays=30`).

## Run 3: Full Long-Duration Multi-Window (Headed)

- Run ID: `20260226-165807`
- Duration: 12 minutes
- Command:
  - `$env:VALIDATION_HEADED='1'; $env:VALIDATION_DURATION_MINUTES='12'; npm run test:validate:long`
- Artifact root:
  - `artifacts/validation/20260226-165807/`
- Evidence:
  - 70+ screenshots across steps plus final dashboard/settings captures
  - ARIA snapshots every third step
  - JSON run log + markdown report

Observed outcome:
- 36 multi-window steps executed.
- Final dashboard 7d summary:
  - `timelineCount=10`
  - `summaryTotal=10 sessions`
  - `summaryDuration=10s total`
- Runtime healthy at completion:
  - `ok=true`
  - `paused=false`
  - `retentionDays=30`

## agent-browser Snapshot/Screenshot Proof

Command run (non-default session):

```powershell
agent-browser --session car open https://www.wikipedia.org
agent-browser --session car snapshot -i
agent-browser --session car screenshot "artifacts/validation/20260226-165807/screenshots/agent-browser-wikipedia.png" --full
agent-browser --session car close
```

Proof artifact:
- `artifacts/validation/20260226-165807/screenshots/agent-browser-wikipedia.png`

## Additional Runtime Proof

- Full automated quality gate:
  - `npm run test:all` (unit + e2e): pass
- Real extension smoke:
  - `npm run test:smoke:extension`: pass
  - Runtime response confirms `retentionDays=30`

## Conclusion

- Automated test suites are green.
- Extension runtime validation with long-duration multi-window activity is complete.
- Screenshot/snapshot evidence is present under `artifacts/validation/*`.
- `agent-browser` is usable for snapshot/screenshot capture with explicit session naming on this host.
