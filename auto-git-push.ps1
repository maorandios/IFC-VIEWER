#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Automatically commits and pushes code changes to GitHub when files are modified.
.DESCRIPTION
    Watches for file changes in the project and automatically commits and pushes them.
    Uses a debounce mechanism to avoid too many commits.
#>

$ErrorActionPreference = "Continue"

# Configuration
$WATCH_DIR = $PSScriptRoot
$DEBOUNCE_SECONDS = 5  # Wait 5 seconds after last change before committing
$GIT_BRANCH = "main"

# Files/patterns to ignore (already in .gitignore, but we check here too)
$IGNORE_PATTERNS = @(
    "node_modules",
    "venv",
    "__pycache__",
    ".git",
    "dist",
    "*.log",
    "storage/ifc",
    "storage/reports",
    "storage/gltf"
)

# Track last change time
$lastChangeTime = Get-Date
$commitTimer = $null
$isCommitting = $false

function Test-ShouldIgnore {
    param([string]$filePath)
    
    foreach ($pattern in $IGNORE_PATTERNS) {
        if ($filePath -like "*$pattern*") {
            return $true
        }
    }
    return $false
}

function Invoke-GitCommitAndPush {
    if ($isCommitting) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Already committing, skipping..." -ForegroundColor Yellow
        return
    }
    
    $isCommitting = $true
    
    try {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Checking for changes..." -ForegroundColor Cyan
        
        # Check if there are any changes
        $status = git status --porcelain
        if (-not $status) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] No changes to commit." -ForegroundColor Gray
            return
        }
        
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Changes detected! Committing and pushing..." -ForegroundColor Green
        
        # Show what changed
        $changedFiles = ($status | Measure-Object -Line).Lines
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $changedFiles file(s) changed" -ForegroundColor Cyan
        
        # Add all changes
        git add .
        
        # Create commit message with timestamp and file count
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $commitMessage = "Auto-commit: $changedFiles file(s) changed at $timestamp"
        
        # Commit
        git commit -m $commitMessage
        
        # Push
        git push origin $GIT_BRANCH
        
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ Successfully pushed to GitHub!" -ForegroundColor Green
    }
    catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✗ Error: $_" -ForegroundColor Red
    }
    finally {
        $isCommitting = $false
    }
}

function On-FileChanged {
    param($sourceEventArgs)
    
    $filePath = $sourceEventArgs.FullPath
    $changeType = $sourceEventArgs.ChangeType
    
    # Check if we should ignore this file
    if (Test-ShouldIgnore -filePath $filePath) {
        return
    }
    
    # Update last change time
    $script:lastChangeTime = Get-Date
    
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] File changed: $changeType - $filePath" -ForegroundColor Yellow
    
    # Cancel previous timer if exists
    if ($commitTimer) {
        $commitTimer.Dispose()
    }
    
    # Create new timer to commit after debounce period
    $script:commitTimer = New-Object System.Timers.Timer
    $commitTimer.Interval = $DEBOUNCE_SECONDS * 1000
    $commitTimer.AutoReset = $false
    $commitTimer.Add_Elapsed({
        Invoke-GitCommitAndPush
    })
    $commitTimer.Start()
}

# Main script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Auto Git Push - File Watcher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Watching: $WATCH_DIR" -ForegroundColor Cyan
Write-Host "Debounce: $DEBOUNCE_SECONDS seconds" -ForegroundColor Cyan
Write-Host "Branch: $GIT_BRANCH" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create file system watcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $WATCH_DIR
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

# Register event handlers
Register-ObjectEvent -InputObject $watcher -EventName "Changed" -Action { On-FileChanged $EventArgs } | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName "Created" -Action { On-FileChanged $EventArgs } | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName "Deleted" -Action { On-FileChanged $EventArgs } | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName "Renamed" -Action { On-FileChanged $EventArgs } | Out-Null

# Keep script running
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] Stopping watcher..." -ForegroundColor Yellow
    $watcher.EnableRaisingEvents = $false
    $watcher.Dispose()
    if ($commitTimer) {
        $commitTimer.Dispose()
    }
}

