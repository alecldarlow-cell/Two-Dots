# verify.ps1 — Two Dots: typecheck + lint + tests
#
# Usage:
#   .\verify.ps1
#
# If PowerShell blocks the script with an execution-policy error, run:
#   powershell -ExecutionPolicy Bypass -File .\verify.ps1

$repo = 'C:\Claude\Two Dots\two-dots'

if (-not (Test-Path -LiteralPath $repo)) {
    Write-Host "Repo not found: $repo" -ForegroundColor Red
    exit 1
}
Set-Location -LiteralPath $repo

Write-Host ""
Write-Host "=== Two Dots verify ===" -ForegroundColor Cyan
Write-Host "Repo: $repo"
Write-Host ""

function Run-Step($name, $step) {
    Write-Host "--- $name ---" -ForegroundColor Cyan
    & $step
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "FAIL: $name (exit $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "PASS: $name" -ForegroundColor Green
    Write-Host ""
}

Run-Step 'typecheck' { npm run typecheck }
Run-Step 'lint'      { npm run lint }
Run-Step 'test'      { npm test }

Write-Host "All green." -ForegroundColor Green
