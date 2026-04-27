# Two Dots - Android Emulator Setup (v4)
# Uses cmdline-tools v20 (installed by Android Studio) which supports SDK XML v4
$ErrorActionPreference = "Continue"
$sdk = "C:\Users\chloe\AppData\Local\Android\Sdk"

# Find newest sdkmanager - latest-2 has v20, latest has older
$toolsDirs = @(
    "$sdk\cmdline-tools\latest-2\bin",
    "$sdk\cmdline-tools\latest\bin"
)
$toolsDir = $null
foreach ($d in $toolsDirs) {
    if (Test-Path "$d\sdkmanager.bat") { $toolsDir = $d; break }
}
if (-not $toolsDir) {
    Write-Host "ERROR: Cannot find sdkmanager.bat" -ForegroundColor Red
    Read-Host "Press Enter to exit"; exit 1
}
Write-Host "Using tools at: $toolsDir" -ForegroundColor Green

Push-Location $toolsDir

Write-Host "=== Step 1: Accept licenses ===" -ForegroundColor Cyan
"y`ny`ny`ny`ny`ny`ny`n" | .\sdkmanager.bat --licenses --sdk_root="$sdk" 2>&1 | Out-Null

Write-Host "=== Step 2: Install emulator + system image ===" -ForegroundColor Cyan
.\sdkmanager.bat --sdk_root="$sdk" "emulator" "system-images;android-33;google_apis;x86_64"

Write-Host "=== Step 3: Create AVD ===" -ForegroundColor Cyan
$env:ANDROID_SDK_ROOT = $sdk
$env:ANDROID_HOME = $sdk
echo "no" | .\avdmanager.bat create avd -n TwoDots -k "system-images;android-33;google_apis;x86_64" --device "pixel_4" --force

Pop-Location

Write-Host "=== Step 4: Launch emulator ===" -ForegroundColor Cyan
$emuExe = "$sdk\emulator\emulator.exe"
if (Test-Path $emuExe) {
    Start-Process $emuExe -ArgumentList "-avd TwoDots -no-snapshot -gpu swiftshader_indirect"
    Write-Host "Emulator launched! Boot takes ~90 seconds." -ForegroundColor Green
} else {
    Write-Host "emulator.exe not found at $emuExe" -ForegroundColor Red
    $asEmu = "C:\Program Files\Android\Android Studio\emulator\emulator.exe"
    if (Test-Path $asEmu) {
        Start-Process $asEmu -ArgumentList "-avd TwoDots -no-snapshot -gpu swiftshader_indirect"
        Write-Host "Launched from Android Studio bundle!" -ForegroundColor Green
    } else {
        Write-Host "Emulator not found. Use Android Studio Virtual Device Manager." -ForegroundColor Yellow
    }
}

Read-Host "Press Enter to close"
