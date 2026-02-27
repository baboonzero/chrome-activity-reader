# Validation Evidence - 2026-02-26

This document records real extension-runtime validation runs with screenshot/snapshot artifacts.

## Build Variant Covered

This evidence corresponds to the updated build with:

- all-web-tab lifecycle tracking
- focused-time aggregation
- `Meaningful / All tabs / Most recent` filters (historical at run time; `Most recent` was later removed as redundant)
- side panel + expand-to-full dashboard flow
- shared dark/light theme setting (dark default)

## Tooling Status

- `agent-browser` skill is installed and available.
- `agent-browser` CLI is installed (`0.15.0`).
- On this Windows host, default session may fail to start; non-default `--session` works.

## Automated Quality Gates

- `npm run test:all`: pass
  - unit: pass
  - e2e: pass
- `npm run test:smoke:extension`: pass
  - dashboard loads
  - panel loads
  - meaningful default active
  - runtime reports `retentionDays=30`

## Headed Long-Duration Multi-Window Run (Current Architecture)

- Run ID: `20260226-192909`
- Duration: 4 minutes
- Command:
  - `$env:VALIDATION_HEADED='1'; $env:VALIDATION_DURATION_MINUTES='4'; npm run test:validate:long`
- Artifact root:
  - `artifacts/validation/20260226-192909/`

Evidence produced:

- Initial dashboard screenshot:
  - `artifacts/validation/20260226-192909/screenshots/00-dashboard-initial.png`
- Initial side panel screenshot:
  - `artifacts/validation/20260226-192909/screenshots/00-panel-initial.png`
- Stepwise active-page and dashboard captures across run:
  - `artifacts/validation/20260226-192909/screenshots/*.png`
- Final 7d filter-state screenshots:
  - `99-dashboard-final-meaningful-7d.png`
  - `99-dashboard-final-all-7d.png`
  - `99-dashboard-final-recent-7d.png`
- Settings screenshot:
  - `artifacts/validation/20260226-192909/screenshots/98-settings-final.png`
- Structured logs:
  - `artifacts/validation/20260226-192909/validation-log.json`
  - `artifacts/validation/20260226-192909/validation-report.md`

Observed outcome:

- 12 multi-window steps executed.
- Runtime remained healthy:
  - `ok=true`
  - `paused=false`
  - `retentionDays=30`
  - `theme=dark`
  - `meaningfulThresholdSec=10`
- Final summary captured by filter:
  - Meaningful: `count=1`, `duration=42s`, `never-focused=0`
  - All tabs: `count=6`, `duration=42s`, `never-focused=4`
  - Most recent: `count=6`, `duration=42s`, `never-focused=4`

## Prior Baseline Runs (Legacy View Model)

Historical runs retained for traceability:

- `20260226-162944` (headless)
- `20260226-163821` (headed sanity)
- `20260226-165807` (headed 12-minute run)
- `20260226-191647` (headed run, pre-final validation script update)

These remain useful for runtime proof continuity, but current acceptance should rely on run `20260226-192909` and later.

## agent-browser Snapshot/Screenshot Proof

Example command sequence used successfully (non-default session):

```powershell
agent-browser --session car open https://www.wikipedia.org
agent-browser --session car snapshot -i
agent-browser --session car screenshot "artifacts/validation/20260226-165807/screenshots/agent-browser-wikipedia.png" --full
agent-browser --session car close
```

## Conclusion

- The updated architecture passes unit, e2e, smoke, and headed long-duration runtime validation.
- Screenshot evidence exists for side panel, dashboard, settings, and stepwise activity.
- Ready for human-in-the-loop acceptance pass.
