# PowerShell script to watch nesting logs in real-time
# This opens a window that shows [NESTING] logs

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "NESTING Logs Viewer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Watching for [NESTING] logs..." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# Check if backend.log exists
if (Test-Path "backend.log") {
    # Show last 100 lines with NESTING, then tail
    Write-Host "Showing recent [NESTING] logs:" -ForegroundColor Green
    Write-Host ""
    Get-Content "backend.log" -Tail 100 | Where-Object { $_ -match "\[NESTING\]" } | ForEach-Object {
        Write-Host $_ -ForegroundColor Green
    }
    Write-Host ""
    Write-Host "----------------------------------------" -ForegroundColor DarkGray
    Write-Host "Waiting for new [NESTING] logs..." -ForegroundColor Yellow
    Write-Host ""
    
    # Tail the log file and filter for NESTING logs
    Get-Content "backend.log" -Wait -Tail 0 | Where-Object { $_ -match "\[NESTING\]" } | ForEach-Object {
        Write-Host $_ -ForegroundColor Green
    }
} else {
    Write-Host "No backend.log file found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The server needs to be running with logging enabled." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To start server with logging, run in another terminal:" -ForegroundColor Yellow
    Write-Host "  cd api" -ForegroundColor White
    Write-Host "  .\run_with_logs.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Then come back here to see the logs." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press any key to exit..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

