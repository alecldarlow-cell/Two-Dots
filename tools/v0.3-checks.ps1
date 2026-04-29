# v0.3-worlds — local verification + branch setup
#
# Run from any cwd. Drops you on feat/v0.3-worlds with the new scaffold staged,
# runs tsc + jest, opens the world preview.
#
# Usage:
#   PS> Set-ExecutionPolicy -Scope Process Bypass    # one-time, if blocked
#   PS> .\tools\v0.3-checks.ps1
#
# Stop on first error so you don't pile broken state on top of broken state.
$ErrorActionPreference = 'Stop'

$repo = 'C:\Claude\Two Dots\two-dots'
Set-Location $repo

Write-Host "`n=== branch state ===" -ForegroundColor Cyan
git fetch origin
git status --short
$current = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "currently on: $current"

# Cut feat/v0.3-worlds from main if not already on it.
if ($current -ne 'feat/v0.3-worlds') {
    Write-Host "`n=== cutting feat/v0.3-worlds from main ===" -ForegroundColor Cyan
    git checkout main
    git pull --ff-only
    git checkout -b feat/v0.3-worlds
} else {
    Write-Host "already on feat/v0.3-worlds, skipping cut"
}

Write-Host "`n=== staging new + modified files ===" -ForegroundColor Cyan
git add -A
git status --short

Write-Host "`n=== npm run typecheck (schema gate: 'as const satisfies WorldTheme') ===" -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }

Write-Host "`n=== npm run lint (eslint --max-warnings 0) ===" -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) { throw "lint failed" }

Write-Host "`n=== npm test (vitest run) ===" -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) { throw "tests failed" }

Write-Host "`n=== opening world preview ===" -ForegroundColor Cyan
Start-Process "$repo\tools\world-preview.html"

Write-Host "`nAll checks passed. Suggested commit:" -ForegroundColor Green
Write-Host "  git commit -m 'feat(v0.3): scaffold WorldRenderer + Moon theme + useCurrentPlanet'"
Write-Host ""
Write-Host "When the side-by-side diff against WORLD_SYSTEM_REFERENCE/ passes," -ForegroundColor Green
Write-Host "tag v0.3.0-worlds-moon at the merge commit."
