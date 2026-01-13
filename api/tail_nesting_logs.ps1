# PowerShell script to tail nesting logs in real-time
# This will show [NESTING] logs as they appear

Set-Location $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "NESTING Logs - Real-time Viewer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Filtering for [NESTING] logs..." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# Check if backend.log exists
if (Test-Path "backend.log") {
    # Tail the log file and filter for NESTING logs
    Get-Content "backend.log" -Wait -Tail 50 | Where-Object { $_ -match "\[NESTING\]" } | ForEach-Object {
        Write-Host $_ -ForegroundColor Green
    }
} else {
    Write-Host "No backend.log file found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The server needs to be running with logging enabled." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To start server with logging, run:" -ForegroundColor Yellow
    Write-Host "  .\run_with_logs.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Or to see all logs in real-time:" -ForegroundColor Yellow
    Write-Host "  .\run_visible.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Press any key to exit..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

