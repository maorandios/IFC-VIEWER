# PowerShell script to view server logs
# This will show the backend.log file if it exists, or help you find the server console

Write-Host "Checking for log files..." -ForegroundColor Yellow

if (Test-Path "backend.log") {
    Write-Host "Found backend.log - Opening in Notepad..." -ForegroundColor Green
    notepad backend.log
} else {
    Write-Host "No backend.log file found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The server console output is in the terminal where you ran the server." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To capture logs to a file, run the server with:" -ForegroundColor Cyan
    Write-Host "  .\run_with_logs.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Or to see logs in real-time, run:" -ForegroundColor Cyan
    Write-Host "  .\run_visible.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Press any key to open a new PowerShell window to check the server..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    
    # Open a new PowerShell window
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; Write-Host 'Server console output would appear here if server is running.' -ForegroundColor Yellow; Write-Host 'If server is running, look for the terminal window where you started it.' -ForegroundColor Cyan; Write-Host ''; Write-Host 'To start server with visible logs, run:' -ForegroundColor Green; Write-Host '  .\run_visible.ps1' -ForegroundColor White; Write-Host ''; Write-Host 'Press any key to close...' -ForegroundColor Yellow; $null = `$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')"
}







