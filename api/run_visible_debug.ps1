# Run backend server with visible output for debugging nesting algorithm
# This script runs the server in the current terminal so you can see all logs

Write-Host "=== Starting Backend Server with Debug Logs ===" -ForegroundColor Green
Write-Host "Server will be available at: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server`n" -ForegroundColor Yellow

cd $PSScriptRoot

# Activate virtual environment if it exists
if (Test-Path "venv\Scripts\activate.ps1") {
    Write-Host "Activating virtual environment..." -ForegroundColor Gray
    .\venv\Scripts\activate.ps1
}

# Run the server
Write-Host "`n=== Server Starting ===`n" -ForegroundColor Green
python run.py

