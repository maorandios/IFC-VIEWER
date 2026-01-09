# PowerShell script to view backend logs in a new window
# This opens a new terminal window that shows backend logs in real-time

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $scriptPath "backend.log"
$nestingLogFile = Join-Path $scriptPath "nesting_debug.log"

Write-Host "Opening backend log viewer in a new window..." -ForegroundColor Cyan
Write-Host ""
Write-Host "This window will show:" -ForegroundColor Yellow
Write-Host "  - Backend server logs (if backend.log exists)" -ForegroundColor White
Write-Host "  - Nesting debug logs (if nesting_debug.log exists)" -ForegroundColor White
Write-Host "  - Real-time updates as they occur" -ForegroundColor White
Write-Host ""

# Create a PowerShell script to run in the new window
$watchScript = @"
`$Host.UI.RawUI.WindowTitle = "Backend Logs Viewer"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backend Logs Viewer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Watching for log files..." -ForegroundColor Yellow
Write-Host ""

cd '$scriptPath'

`$backendLog = '$logFile'
`$nestingLog = '$nestingLogFile'

# Function to show last N lines of a file
function Show-LastLines {
    param([string]`$file, [int]`$lines = 50)
    if (Test-Path `$file) {
        Write-Host "`n=== Last `$lines lines of `$(Split-Path -Leaf `$file) ===" -ForegroundColor Green
        Get-Content `$file -Tail `$lines -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host `$_ -ForegroundColor Gray
        }
    }
}

# Show initial content
if (Test-Path `$backendLog) {
    Write-Host "Found backend.log - showing last 50 lines:" -ForegroundColor Green
    Show-LastLines `$backendLog 50
} else {
    Write-Host "backend.log not found yet. Waiting for backend to start..." -ForegroundColor Yellow
}

if (Test-Path `$nestingLog) {
    Write-Host "`nFound nesting_debug.log - showing last 50 lines:" -ForegroundColor Green
    Show-LastLines `$nestingLog 50
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Watching for new log entries..." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop watching" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor Cyan

# Watch for changes
while (`$true) {
    Start-Sleep -Seconds 1
    
    if (Test-Path `$backendLog) {
        `$newLines = Get-Content `$backendLog -Tail 5 -ErrorAction SilentlyContinue
        if (`$newLines) {
            foreach (`$line in `$newLines) {
                if (`$line -match '\[UPLOAD\]|\[ERROR\]|\[ANALYZE\]|ERROR|Exception|Traceback') {
                    Write-Host `$line -ForegroundColor Red
                } elseif (`$line -match '\[NESTING\]') {
                    Write-Host `$line -ForegroundColor Yellow
                } else {
                    Write-Host `$line -ForegroundColor White
                }
            }
        }
    }
    
    if (Test-Path `$nestingLog) {
        `$newLines = Get-Content `$nestingLog -Tail 5 -ErrorAction SilentlyContinue
        if (`$newLines) {
            foreach (`$line in `$newLines) {
                if (`$line -match 'ERROR|Exception|Traceback') {
                    Write-Host `$line -ForegroundColor Red
                } elseif (`$line -match '\[NESTING\]') {
                    Write-Host `$line -ForegroundColor Yellow
                } else {
                    Write-Host `$line -ForegroundColor Cyan
                }
            }
        }
    }
}
"@

# Save the watch script temporarily
$tempScript = Join-Path $env:TEMP "watch_backend_logs.ps1"
$watchScript | Out-File -FilePath $tempScript -Encoding UTF8

# Open a new PowerShell window with the watch script
Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$tempScript`""

Write-Host "Log viewer window opened!" -ForegroundColor Green
Write-Host ""
Write-Host "Note: If the backend is not writing to log files," -ForegroundColor Yellow
Write-Host "you may need to restart it with logging enabled." -ForegroundColor Yellow
Write-Host ""
Write-Host "To restart backend with logging, run:" -ForegroundColor Cyan
Write-Host "  .\run_with_logs.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Or to run in a visible window (shows all output):" -ForegroundColor Cyan
Write-Host "  .\run_visible.ps1" -ForegroundColor White

