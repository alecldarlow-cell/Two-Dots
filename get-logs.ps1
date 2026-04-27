# Pulls 5 seconds of React Native JS logs from the connected Android device
$outFile = "$PSScriptRoot\rn-logs.txt"
Write-Host "Capturing RN logs for 5 seconds -> $outFile"
$proc = Start-Process -FilePath "adb" -ArgumentList "logcat -s ReactNativeJS:V *:S" `
    -RedirectStandardOutput $outFile -NoNewWindow -PassThru
Start-Sleep -Seconds 5
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
$count = (Get-Content $outFile -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
Write-Host "Done. $count lines written to $outFile"
