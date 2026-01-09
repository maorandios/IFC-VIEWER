# PowerShell script to run the backend in a new visible window
# This opens a new terminal window where you can see all backend logs

# Get the directory where this script is located
$scriptPath = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
Set-Location $scriptPath

Write-Host "Opening backend in a new visible window..." -ForegroundColor Cyan
Write-Host ""
Write-Host "You will see all backend logs in the new window." -ForegroundColor Yellow
Write-Host "Close that window to stop the server." -ForegroundColor Yellow
Write-Host ""

# Open a new PowerShell window and run the backend
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$scriptPath'; `$Host.UI.RawUI.WindowTitle = 'Backend Server - Port 8000'; Write-Host '========================================' -ForegroundColor Cyan; Write-Host 'Backend Server' -ForegroundColor Cyan; Write-Host '========================================' -ForegroundColor Cyan; Write-Host ''; Write-Host 'Starting server on http://0.0.0.0:8000' -ForegroundColor Green; Write-Host 'All logs will appear below:' -ForegroundColor Yellow; Write-Host '========================================' -ForegroundColor Cyan; Write-Host ''; .\venv\Scripts\python.exe run.py"
)

Write-Host "Backend server window opened!" -ForegroundColor Green
Write-Host ""
Write-Host "The server is running in the new window." -ForegroundColor Yellow
Write-Host "You can see all logs there in real-time." -ForegroundColor Yellow

