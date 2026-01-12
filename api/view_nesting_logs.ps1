# View nesting algorithm logs in real-time
# This script shows the backend logs so you can see nesting algorithm output

Write-Host "=== Viewing Backend Logs (nesting algorithm output) ===" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop viewing logs`n" -ForegroundColor Yellow

cd $PSScriptRoot

# Check if log file exists
if (Test-Path "backend.log") {
    Write-Host "Tailing backend.log file...`n" -ForegroundColor Cyan
    Get-Content "backend.log" -Wait -Tail 50
} else {
    Write-Host "No backend.log file found. The server may be logging to console only." -ForegroundColor Yellow
    Write-Host "To see logs, run the server using: .\run_visible_debug.ps1" -ForegroundColor Cyan
}

