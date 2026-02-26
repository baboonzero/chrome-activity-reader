param(
  [switch]$RunAutomatedTests
)

$ErrorActionPreference = "Stop"

function Write-Section($title) {
  Write-Host ""
  Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Assert-Path($path) {
  if (-not (Test-Path $path)) {
    throw "Missing required path: $path"
  }
}

Write-Section "Chrome Activity Reader - Acceptance Helper"

Assert-Path "manifest.json"
Assert-Path "docs/testing/manual-acceptance-checklist.md"

Write-Host "Project root: $(Get-Location)"
Write-Host "Checklist: docs/testing/manual-acceptance-checklist.md"

if ($RunAutomatedTests) {
  Write-Section "Running Automated Test Loop"
  npm run test:all
}

Write-Section "Manual Acceptance Steps"
Write-Host "1. Open chrome://extensions and load this folder as unpacked extension."
Write-Host "2. Open extension dashboard from toolbar action."
Write-Host "3. Execute checklist in docs/testing/manual-acceptance-checklist.md."
Write-Host "4. Record any failures and reproduce with timestamps."

Write-Section "Quick Links"
Write-Host "Dashboard URL after install:"
Write-Host "chrome-extension://<extension-id>/ui/dashboard.html"

Write-Section "Done"
Write-Host "Acceptance helper completed."
