# PowerShell script to show backend logs in a new window
# This opens a new terminal window that displays backend logs

# Get the directory where this script is located
$scriptPath = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$logFile = Join-Path $scriptPath "backend.log"
$nestingLogFile = Join-Path $scriptPath "nesting_debug.log"

Write-Host "Opening log viewer window..." -ForegroundColor Cyan
Write-Host ""

# Create a PowerShell script to run in the new window
$watchScript = @"
`$Host.UI.RawUI.WindowTitle = "Backend Logs Viewer"
Clear-Host
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backend Logs Viewer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

cd '$scriptPath'

`$backendLog = '$logFile'
`$nestingLog = '$nestingLogFile'

# Show initial content
Write-Host "Checking for log files..." -ForegroundColor Yellow
Write-Host ""

if (Test-Path `$backendLog) {
    Write-Host "Found backend.log" -ForegroundColor Green
    Write-Host "Showing last 100 lines:" -ForegroundColor Yellow
    Write-Host "----------------------------------------" -ForegroundColor Gray
    Get-Content `$backendLog -Tail 100 -ErrorAction SilentlyContinue | ForEach-Object {
        if (`$_ -match 'ERROR|Exception|Traceback|Failed') {
            Write-Host `$_ -ForegroundColor Red
        } elseif (`$_ -match '\[UPLOAD\]|\[ANALYZE\]') {
            Write-Host `$_ -ForegroundColor Cyan
        } else {
            Write-Host `$_ -ForegroundColor White
        }
    }
    Write-Host "----------------------------------------" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "backend.log not found." -ForegroundColor Yellow
    Write-Host "The backend may not be writing to a log file." -ForegroundColor Yellow
    Write-Host ""
}

if (Test-Path `$nestingLog) {
    Write-Host "Found nesting_debug.log" -ForegroundColor Green
    Write-Host "Showing last 100 lines:" -ForegroundColor Yellow
    Write-Host "----------------------------------------" -ForegroundColor Gray
    Get-Content `$nestingLog -Tail 100 -ErrorAction SilentlyContinue | ForEach-Object {
        if (`$_ -match 'ERROR|Exception|Traceback|Failed') {
            Write-Host `$_ -ForegroundColor Red
        } elseif (`$_ -match '\[NESTING\]') {
            Write-Host `$_ -ForegroundColor Yellow
        } else {
            Write-Host `$_ -ForegroundColor White
        }
    }
    Write-Host "----------------------------------------" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "nesting_debug.log not found." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "To see real-time logs, restart backend with:" -ForegroundColor Yellow
Write-Host "  .\run_with_logs.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Or run backend in visible window:" -ForegroundColor Yellow
Write-Host "  .\run_backend_visible.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to close this window..." -ForegroundColor Gray
`$null = `$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
"@

# Save the watch script temporarily
$tempScript = Join-Path $env:TEMP "show_backend_logs_$(Get-Random).ps1"
$watchScript | Out-File -FilePath $tempScript -Encoding UTF8

# Open a new PowerShell window with the watch script
Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$tempScript`""

Write-Host "Log viewer window opened!" -ForegroundColor Green
Write-Host ""
Write-Host "Note: If logs are not being written to files," -ForegroundColor Yellow
Write-Host "you may need to restart the backend with logging enabled." -ForegroundColor Yellow

