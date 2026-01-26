# Check if server is already running
Write-Host "Checking for running server on port 8000..." -ForegroundColor Cyan

$port8000 = netstat -ano | findstr ":8000.*LISTENING"
if ($port8000) {
    Write-Host "`nServer is ALREADY RUNNING on port 8000:" -ForegroundColor Green
    Write-Host $port8000
    
    # Extract PID from netstat output
    $procId = ($port8000 -split '\s+')[-1]
    
    # Get process details
    try {
        $proc = Get-Process -Id $procId -ErrorAction Stop
        Write-Host "`nProcess Details:" -ForegroundColor Yellow
        Write-Host "  PID: $procId"
        Write-Host "  Name: $($proc.ProcessName)"
        Write-Host "  Start Time: $($proc.StartTime)"
        Write-Host "  Memory: $([math]::Round($proc.WorkingSet64/1MB, 2)) MB"
    } catch {
        Write-Host "  PID: $procId (process details unavailable)" -ForegroundColor Red
    }
    
    Write-Host "`nTo stop the server, run: .\stop_server.ps1" -ForegroundColor Cyan
} else {
    Write-Host "`nNo server running on port 8000" -ForegroundColor Red
    Write-Host "To start the server, run: .\run_visible.ps1" -ForegroundColor Cyan
}

Write-Host "`n" + ("=" * 60)
Write-Host "All Python processes:" -ForegroundColor Cyan
Get-Process | Where-Object { $_.ProcessName -like "*python*" } | Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize

