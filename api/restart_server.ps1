# Restart the server (stop if running, then start)
Write-Host "Restarting server..." -ForegroundColor Cyan
Write-Host ("=" * 60)

# Stop any running server
Write-Host "`nStep 1: Stopping existing server..." -ForegroundColor Yellow
& "$PSScriptRoot\stop_server.ps1"

Start-Sleep -Seconds 2

# Start the server
Write-Host "`nStep 2: Starting server..." -ForegroundColor Yellow
Write-Host ("=" * 60)

cd $PSScriptRoot
.\venv\Scripts\python.exe run.py

