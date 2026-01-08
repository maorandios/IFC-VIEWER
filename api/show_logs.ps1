# PowerShell script to show server logs
# This will help you view the server console output

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Server Log Viewer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if backend.log exists
if (Test-Path "backend.log") {
    Write-Host "Found backend.log file!" -ForegroundColor Green
    Write-Host "Opening in Notepad..." -ForegroundColor Yellow
    Write-Host ""
    notepad backend.log
} else {
    Write-Host "No backend.log file found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The server console output is in the terminal window where you started the server." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To capture logs to a file, you can:" -ForegroundColor Yellow
    Write-Host "  1. Stop the current server (Ctrl+C)" -ForegroundColor White
    Write-Host "  2. Run: .\run_with_logs.ps1" -ForegroundColor White
    Write-Host "     This will save all output to backend.log" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or to see logs in real-time in a visible window:" -ForegroundColor Yellow
    Write-Host "  .\run_visible.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Press any key to open a new terminal window..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    
    # Open a new PowerShell window with instructions
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; Write-Host 'Server Console Logs' -ForegroundColor Cyan; Write-Host '====================' -ForegroundColor Cyan; Write-Host ''; Write-Host 'If the server is running, look for the terminal window where you started it.' -ForegroundColor Yellow; Write-Host 'All [NESTING] logs will appear there.' -ForegroundColor Yellow; Write-Host ''; Write-Host 'To restart server with logging:' -ForegroundColor Green; Write-Host '  .\run_with_logs.ps1' -ForegroundColor White; Write-Host ''; Write-Host 'Press any key to close...' -ForegroundColor Gray; `$null = `$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')"
}







