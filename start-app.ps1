# Start Application from Last Git Commit
# This script ensures the app runs with the latest committed code

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  IFC2026 Application Startup" -ForegroundColor Cyan
Write-Host "  Running from last git commit" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if there are uncommitted changes
Write-Host "Checking for uncommitted changes..." -ForegroundColor Yellow
$gitStatus = git status --short

if ($gitStatus) {
    Write-Host "Found uncommitted changes:" -ForegroundColor Yellow
    Write-Host $gitStatus -ForegroundColor Gray
    Write-Host ""
    
    $response = Read-Host "Do you want to stash these changes? (Y/n)"
    if ($response -eq "" -or $response -eq "Y" -or $response -eq "y") {
        Write-Host "Stashing changes..." -ForegroundColor Yellow
        git stash push -m "Auto-stash before starting app - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        Write-Host "Changes stashed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Restoring files to last commit..." -ForegroundColor Yellow
        git restore .
        Write-Host "Files restored!" -ForegroundColor Green
    }
} else {
    Write-Host "Working directory is clean!" -ForegroundColor Green
}

Write-Host ""

# Show current commit
$currentCommit = git log -1 --format="%h - %s (%ad)" --date=format:"%Y-%m-%d %H:%M"
Write-Host "Current commit: $currentCommit" -ForegroundColor Cyan
Write-Host ""

# Stop any running instances
Write-Host "Checking for running processes..." -ForegroundColor Yellow
$pythonProcesses = Get-Process | Where-Object {$_.ProcessName -like "*python*" -and $_.Path -like "*IFC2026*"}
$nodeProcesses = Get-Process | Where-Object {$_.ProcessName -like "*node*" -and $_.Path -like "*IFC2026*"}

if ($pythonProcesses -or $nodeProcesses) {
    Write-Host "Found running processes. Stopping them..." -ForegroundColor Yellow
    if ($pythonProcesses) {
        $pythonProcesses | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
    }
    if ($nodeProcesses) {
        $nodeProcesses | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
    }
    Start-Sleep -Seconds 2
    Write-Host "Processes stopped!" -ForegroundColor Green
} else {
    Write-Host "No running processes found." -ForegroundColor Green
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Starting Backend Server..." -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# Start backend in a new window
$backendScript = @"
Write-Host "Starting Backend Server..." -ForegroundColor Green
Set-Location -Path "$PSScriptRoot\api"
.\venv\Scripts\python.exe run.py
"@

$backendScriptPath = Join-Path $env:TEMP "start-backend-$(Get-Date -Format 'yyyyMMddHHmmss').ps1"
$backendScript | Out-File -FilePath $backendScriptPath -Encoding UTF8

Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$backendScriptPath`"" -WindowStyle Normal

Write-Host "Backend starting on http://localhost:8000" -ForegroundColor Green
Write-Host ""

# Wait a bit for backend to initialize
Start-Sleep -Seconds 3

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Starting Frontend Server..." -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# Start frontend in a new window
$frontendScript = @"
Write-Host "Starting Frontend Server..." -ForegroundColor Green
Set-Location -Path "$PSScriptRoot\web"
npm run dev
"@

$frontendScriptPath = Join-Path $env:TEMP "start-frontend-$(Get-Date -Format 'yyyyMMddHHmmss').ps1"
$frontendScript | Out-File -FilePath $frontendScriptPath -Encoding UTF8

Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$frontendScriptPath`"" -WindowStyle Normal

Write-Host "Frontend starting on http://localhost:5180" -ForegroundColor Green
Write-Host ""

# Wait for servers to start
Write-Host "Waiting for servers to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Application Started Successfully!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend:  http://localhost:8000" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5180" -ForegroundColor Green
Write-Host ""
Write-Host "Open your browser and navigate to:" -ForegroundColor Yellow
Write-Host "  http://localhost:5180" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit this window (servers will keep running)..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")


