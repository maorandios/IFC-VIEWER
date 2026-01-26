# Stop the server running on port 8000
Write-Host "Stopping server on port 8000..." -ForegroundColor Cyan

$port8000 = netstat -ano | findstr ":8000.*LISTENING"
if ($port8000) {
    # Extract PID from netstat output
    $procId = ($port8000 -split '\s+')[-1]
    
    Write-Host "Found server process (PID: $procId)" -ForegroundColor Yellow
    
    try {
        Stop-Process -Id $procId -Force -ErrorAction Stop
        Write-Host "Server stopped successfully!" -ForegroundColor Green
        Start-Sleep -Seconds 1
        
        # Verify it's stopped
        $stillRunning = netstat -ano | findstr ":8000.*LISTENING"
        if ($stillRunning) {
            Write-Host "Warning: Port 8000 is still in use" -ForegroundColor Red
        } else {
            Write-Host "Port 8000 is now free" -ForegroundColor Green
        }
    } catch {
        Write-Host "Error stopping process: $_" -ForegroundColor Red
    }
} else {
    Write-Host "No server running on port 8000" -ForegroundColor Red
}

# Show all remaining Python processes
Write-Host "`n" + ("=" * 60)
Write-Host "Remaining Python processes:" -ForegroundColor Cyan
$pythonProcs = Get-Process | Where-Object { $_.ProcessName -like "*python*" }
if ($pythonProcs) {
    $pythonProcs | Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize
} else {
    Write-Host "No Python processes running" -ForegroundColor Green
}

