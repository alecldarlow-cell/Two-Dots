# Copy design iteration tool from Design Files/ into engine repo.
# Run once when you want to version-control the iteration UI alongside the branch.
#
# Source: C:\Claude\Two Dots\Design Files (design's working folder)
# Dest:   C:\Claude\Two Dots\two-dots\tools\design-iteration (engine repo, branch-versioned)
#
# Iteration: just open Design Files\Earth.html or Moon.html in a browser
# directly -- no need to wait until after the copy.

$ErrorActionPreference = 'Stop'

$src = 'C:\Claude\Two Dots\Design Files'
$dst = 'C:\Claude\Two Dots\two-dots\tools\design-iteration'

if (-not (Test-Path $src)) { throw "Source folder not found: $src" }

New-Item -ItemType Directory -Path $dst              -Force | Out-Null
New-Item -ItemType Directory -Path "$dst\frames"     -Force | Out-Null
New-Item -ItemType Directory -Path "$dst\world"      -Force | Out-Null

$files = @(
    @{ from = 'Earth.html';                     to = 'Earth.html' }
    @{ from = 'Moon.html';                      to = 'Moon.html' }
    @{ from = 'app.jsx';                        to = 'app.jsx' }
    @{ from = 'frames\ios-frame.jsx';           to = 'frames\ios-frame.jsx' }
    @{ from = 'frames\tweaks-panel.jsx';        to = 'frames\tweaks-panel.jsx' }
    @{ from = 'world\theme-schema.js';          to = 'world\theme-schema.js' }
    @{ from = 'world\theme-moon.js';            to = 'world\theme-moon.js' }
    @{ from = 'world\theme-earth.js';           to = 'world\theme-earth.js' }
    @{ from = 'world\world-renderer.jsx';       to = 'world\world-renderer.jsx' }
    @{ from = 'world\game-overlay.jsx';         to = 'world\game-overlay.jsx' }
)

foreach ($f in $files) {
    $srcPath = Join-Path $src $f.from
    $dstPath = Join-Path $dst $f.to
    if (-not (Test-Path $srcPath)) {
        Write-Warning "Missing source: $srcPath"
        continue
    }
    Copy-Item -LiteralPath $srcPath -Destination $dstPath -Force
    Write-Host "  $($f.from)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Copied to $dst" -ForegroundColor Green
Write-Host "Open $dst\Earth.html or $dst\Moon.html in a browser to iterate."
Write-Host ""
Write-Host "Authoring loop:"
Write-Host "  1. Edit world\theme-earth.js (or theme-moon.js) - colors, yPct, particle counts"
Write-Host "  2. Refresh the browser; tweaks panel reflects changes"
Write-Host "  3. When the look is locked, port to src\features\game\world\themes\earth.ts"
Write-Host "  4. Re-run .\tools\v0.3-checks.ps1 to verify Skia compiles and tests pass"
