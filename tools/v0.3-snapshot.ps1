# v0.3-worlds snapshot — one-line git commit for accepted iteration changes.
#
# Usage:
#   .\tools\v0.3-snapshot.ps1 "moon point 3 — crater field rewrite"
#   .\tools\v0.3-snapshot.ps1 "earth point 5 — bird wing-flap fix"
#
# Stages everything and commits with a "round 6: <message>" prefix so
# history is readable and grep-able. No checkpoints lost — git owns it now.

param(
    [Parameter(Mandatory = $true)]
    [string]$Message
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$status = git status --short
if (-not $status) {
    Write-Host "Nothing to commit." -ForegroundColor Yellow
    exit 0
}

Write-Host "Staging:" -ForegroundColor Cyan
Write-Host $status

git add -A
git commit -m "round 6: $Message"

Write-Host ""
Write-Host "Snapshot committed. Inspect: git log --oneline -5" -ForegroundColor Green
