#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Quick launcher for auto-git-push script
#>

Write-Host "Starting Auto Git Push..." -ForegroundColor Green
Write-Host "This will automatically commit and push all code changes to GitHub." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

& "$PSScriptRoot\auto-git-push.ps1"

