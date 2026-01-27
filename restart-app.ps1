# Restart Application
# This script stops the running app and starts it fresh from the last git commit

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Restarting IFC2026 Application" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Stop the app
Write-Host "Stopping application..." -ForegroundColor Yellow
& "$PSScriptRoot\stop-app.ps1"

Write-Host ""
Write-Host "Starting application..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Start the app
& "$PSScriptRoot\start-app.ps1"


