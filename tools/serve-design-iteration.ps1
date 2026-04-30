# Serve design iteration tool over HTTP so Babel-standalone can XHR-load
# the JSX files. Required because browsers block file:// XHR.
#
# Also rebuilds the shared geometry bundle (src/features/game/world/geometry
# → tools/design-iteration/world/geometry-bundle.js) before serving, so the
# iteration tool always sees the latest production geometry. Source-of-truth
# is the TypeScript modules in src; the bundle is generated.
#
# Usage:
#   .\tools\serve-design-iteration.ps1            # default port 8080
#   .\tools\serve-design-iteration.ps1 -Port 9000 # custom port
#
# Stops with Ctrl+C. Hot reload: just refresh the browser after editing
# tools\design-iteration\world\theme-*.js. If you edit a geometry .ts file,
# re-run `npm run build:geometry` (or restart this script) to rebuild the
# bundle, then refresh.

param(
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $PSScriptRoot 'design-iteration'
if (-not (Test-Path $dir)) {
    Write-Error "Iteration tool not found at $dir. Run .\tools\copy-design-iteration.ps1 first."
    exit 1
}

Write-Host "=== rebuilding shared geometry bundle ===" -ForegroundColor Cyan
Push-Location $repo
try {
    npm run build:geometry
    if ($LASTEXITCODE -ne 0) { throw "geometry bundle build failed" }
}
finally {
    Pop-Location
}
Write-Host ""

Write-Host "Serving $dir at http://localhost:$Port" -ForegroundColor Green
Write-Host "Open Earth.html or Moon.html. Stop with Ctrl+C." -ForegroundColor Gray
Write-Host ""

# -o opens default browser; -c-1 disables cache so theme edits show on refresh.
npx http-server $dir -p $Port -o -c-1
