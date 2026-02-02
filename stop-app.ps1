# Stop Application
# This script stops all running backend and frontend servers

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Stopping IFC2026 Application" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Find and stop Python processes (Backend)
Write-Host "Stopping backend server..." -ForegroundColor Yellow
$pythonProcesses = Get-Process | Where-Object {$_.ProcessName -eq "python" -or $_.ProcessName -eq "pythonw"}

if ($pythonProcesses) {
    $stopped = 0
    foreach ($proc in $pythonProcesses) {
        try {
            # Check if it's related to our project
            $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
            if ($cmdLine -like "*IFC2026*" -or $cmdLine -like "*run.py*") {
                Stop-Process -Id $proc.Id -Force -ErrorAction Stop
                $stopped++
            }
        } catch {
            # Silently continue if we can't stop the process
        }
    }
    if ($stopped -gt 0) {
        Write-Host "  Stopped $stopped Python process(es)" -ForegroundColor Green
    } else {
        Write-Host "  No backend processes found" -ForegroundColor Gray
    }
} else {
    Write-Host "  No backend processes found" -ForegroundColor Gray
}

# Find and stop Node processes (Frontend)
Write-Host "Stopping frontend server..." -ForegroundColor Yellow
$nodeProcesses = Get-Process | Where-Object {$_.ProcessName -eq "node"}

if ($nodeProcesses) {
    $stopped = 0
    foreach ($proc in $nodeProcesses) {
        try {
            # Check if it's related to our project
            $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
            if ($cmdLine -like "*IFC2026*" -or $cmdLine -like "*vite*") {
                Stop-Process -Id $proc.Id -Force -ErrorAction Stop
                $stopped++
            }
        } catch {
            # Silently continue if we can't stop the process
        }
    }
    if ($stopped -gt 0) {
        Write-Host "  Stopped $stopped Node process(es)" -ForegroundColor Green
    } else {
        Write-Host "  No frontend processes found" -ForegroundColor Gray
    }
} else {
    Write-Host "  No frontend processes found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Application stopped!" -ForegroundColor Green
Write-Host ""

Start-Sleep -Seconds 2



