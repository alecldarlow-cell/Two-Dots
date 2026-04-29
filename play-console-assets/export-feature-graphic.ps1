# Exports feature-graphic.html to feature-graphic.png at exactly 1024x500.
#
# Drives headless Chromium (Edge first, then Chrome) so you don't have to
# fiddle with DevTools "Capture node screenshot". The HTML is loaded with
# ?export so it strips the grey letterbox and instruction overlay, giving
# an edge-to-edge 1024x500 capture.
#
# Usage from the project root:
#   pwsh .\play-console-assets\export-feature-graphic.ps1
# or from inside this folder:
#   pwsh .\export-feature-graphic.ps1

$ErrorActionPreference = 'Stop'

$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$html  = Join-Path $here 'feature-graphic.html'
$png   = Join-Path $here 'feature-graphic.png'

if (-not (Test-Path $html)) {
    throw "feature-graphic.html not found at $html"
}

# Find a Chromium binary. Edge is preferred because it ships with Windows.
$candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) {
    throw "Could not locate Edge or Chrome. Install one, or run the manual DevTools export described in README.md."
}
Write-Host "Using browser: $browser"

# file:/// URL with ?export so the page enters export mode.
# Resolve-Path returns a PathInfo; PS 5.1 can't auto-cast that to [Uri], so
# pull the .Path string explicitly before constructing the Uri.
$absPath = (Resolve-Path $html).Path
$fileUrl = ([Uri]$absPath).AbsoluteUri + '?export'

# Old screenshot, if any, gets overwritten so confusion is impossible
if (Test-Path $png) { Remove-Item $png -Force }

# --virtual-time-budget gives Google Fonts time to load before capture.
# --hide-scrollbars stops the captured image from including a scrollbar gutter.
$args = @(
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    '--virtual-time-budget=3000',
    '--window-size=1024,500',
    "--screenshot=$png",
    $fileUrl
)

& $browser @args | Out-Null

if (-not (Test-Path $png)) {
    throw "Headless screenshot did not produce $png. Try the manual DevTools path in README.md."
}

# Verify dimensions
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($png)
$w = $img.Width; $h = $img.Height
$img.Dispose()

if ($w -ne 1024 -or $h -ne 500) {
    Write-Warning "Output is $w x $h, expected 1024 x 500. Inspect the file before uploading."
} else {
    Write-Host "OK: feature-graphic.png is exactly 1024 x 500."
}

Write-Host "Saved: $png"
