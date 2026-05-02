# Serve design iteration tool over HTTP so Babel-standalone can XHR-load
# the JSX files. Required because browsers block file:// XHR.
#
# Usage:
#   .\tools\serve-design-iteration.ps1            # default port 8080
#   .\tools\serve-design-iteration.ps1 -Port 9000 # custom port
#
# Stops with Ctrl+C. Hot reload: just refresh the browser after editing
# tools\design-iteration\world\theme-*.js or any other source file.

param(
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'

$dir = Join-Path $PSScriptRoot 'design-iteration'
if (-not (Test-Path $dir)) {
    Write-Error "Iteration tool not found at $dir. Run .\tools\copy-design-iteration.ps1 first."
    exit 1
}

Write-Host "Serving $dir at http://localhost:$Port" -ForegroundColor Green
Write-Host "Open Earth.html or Moon.html. Stop with Ctrl+C." -ForegroundColor Gray
Write-Host ""

# -o opens default browser; -c-1 disables cache so theme edits show on refresh.
npx http-server $dir -p $Port -o -c-1
