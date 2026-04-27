# Creates minimal placeholder PNG assets required by app.config.ts.
# Uses System.Drawing — no npm packages needed.
# Run once from the two-dots directory before `npm run android`.

Add-Type -AssemblyName System.Drawing

$assetsDir = Join-Path $PSScriptRoot "assets"
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

$bgColor = [System.Drawing.Color]::FromArgb(7, 7, 15)  # #07070f — matches app background

$files = @{
    "icon.png"          = @{ w = 1024; h = 1024 }
    "splash.png"        = @{ w = 1284; h = 2778 }
    "adaptive-icon.png" = @{ w = 1024; h = 1024 }
}

foreach ($name in $files.Keys) {
    $dims = $files[$name]
    $bmp = New-Object System.Drawing.Bitmap($dims.w, $dims.h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear($bgColor)
    $g.Dispose()
    $outPath = Join-Path $assetsDir $name
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created $outPath"
}

Write-Host "Done. All placeholder assets written to assets/."
