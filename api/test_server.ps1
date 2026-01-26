# Test if the server is responding
Write-Host "Testing server connection..." -ForegroundColor Cyan

# First check if port is listening
$port8000 = netstat -ano | findstr ":8000.*LISTENING"
if (-not $port8000) {
    Write-Host "ERROR: No server running on port 8000" -ForegroundColor Red
    Write-Host "Start the server first with: .\run_visible.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "Port 8000 is listening. Testing HTTP connection..." -ForegroundColor Green

try {
    # Use Invoke-RestMethod instead of Invoke-WebRequest (works better in non-interactive mode)
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
    
    Write-Host "`nSERVER IS WORKING!" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor White
} catch {
    Write-Host "`nERROR: Server is not responding" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nThe server process may be stuck. Try restarting with: .\restart_server.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n" + ("=" * 60)
Write-Host "Server details:" -ForegroundColor Cyan
& "$PSScriptRoot\check_server.ps1"

