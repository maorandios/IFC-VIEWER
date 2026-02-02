# Application Startup Guide

## Overview

This guide explains how to properly start the IFC2026 application from the last git commit, ensuring you always run the correct version with all the latest changes.

## The Problem

When you have uncommitted changes in your working directory, the running application will use those modified files instead of the last committed version. This can lead to:
- Missing features that were committed
- Unexpected behavior from partially implemented changes
- Confusion about what code is actually running

## The Solution: Startup Scripts

We've created PowerShell scripts that automatically ensure you're running from the last git commit.

---

## Quick Reference

### Start the Application
```powershell
.\start-app.ps1
```
*Prompts you to stash or discard uncommitted changes*

**OR**

```powershell
.\start-app-auto.ps1
```
*Automatically discards uncommitted changes without prompting*

### Stop the Application
```powershell
.\stop-app.ps1
```

### Restart the Application
```powershell
.\restart-app.ps1
```

---

## Detailed Script Descriptions

### `start-app.ps1` (Interactive)

**What it does:**
1. ✅ Checks for uncommitted changes
2. ✅ **Asks you** if you want to stash or discard them
3. ✅ Shows the current commit you'll be running
4. ✅ Stops any running servers
5. ✅ Starts backend in a new window (port 8000)
6. ✅ Starts frontend in a new window (port 5180)
7. ✅ Displays URLs to access the application

**When to use:**
- When you have uncommitted work you want to save (it will stash it)
- When you're unsure about your uncommitted changes
- First time running the app

**Example output:**
```
================================================
  IFC2026 Application Startup
  Running from last git commit
================================================

Checking for uncommitted changes...
Found uncommitted changes:
 M web/src/components/Dashboard.tsx
 M api/main.py

Do you want to stash these changes? (Y/n): Y
Stashing changes...
Changes stashed successfully!

Current commit: 073b042 - Restructure: Move tables to dedicated tabs with search/filter (2026-01-26 14:20)

Starting Backend Server...
Backend starting on http://localhost:8000

Starting Frontend Server...
Frontend starting on http://localhost:5180

================================================
  Application Started Successfully!
================================================

Backend:  http://localhost:8000
Frontend: http://localhost:5180

Open your browser and navigate to:
  http://localhost:5180
```

### `start-app-auto.ps1` (Automatic)

**What it does:**
1. ✅ Checks for uncommitted changes
2. ✅ **Automatically discards** them without asking
3. ✅ Shows the current commit you'll be running
4. ✅ Stops any running servers
5. ✅ Starts backend in a new window (port 8000)
6. ✅ Starts frontend in a new window (port 5180)
7. ✅ Displays URLs to access the application

**When to use:**
- When you want a quick restart without prompts
- When you don't care about uncommitted changes
- In automated workflows

⚠️ **Warning:** This will discard any uncommitted changes!

### `stop-app.ps1`

**What it does:**
1. Finds all Python processes related to IFC2026
2. Finds all Node processes related to IFC2026
3. Stops them gracefully

**When to use:**
- When you want to stop the application without restarting
- Before manual maintenance
- When servers are unresponsive

### `restart-app.ps1`

**What it does:**
1. Runs `stop-app.ps1`
2. Runs `start-app.ps1`

**When to use:**
- Quick shortcut to restart the entire application
- After making changes to configuration files

---

## Understanding Git States

### Clean Working Directory
```
✅ No uncommitted changes
✅ Code matches last commit
✅ Scripts will start immediately
```

### Uncommitted Changes
```
⚠️ Modified files in working directory
⚠️ Code differs from last commit
⚠️ Scripts will ask what to do (or auto-discard)
```

### After Stashing
```
✅ Changes saved in git stash
✅ Working directory clean
✅ Can restore stash later with: git stash pop
```

---

## Common Scenarios

### Scenario 1: First Time Startup
```powershell
# Clone the repo and run
git clone <repo-url>
cd IFC2026
.\start-app.ps1
```
Result: Starts cleanly from last commit ✅

### Scenario 2: You Made Changes But Want to Test Last Commit
```powershell
# You modified files but want to run the committed version
.\start-app.ps1
# Choose 'Y' to stash changes
# App runs from last commit
# Later, restore your changes:
git stash pop
```

### Scenario 3: Quick Restart During Development
```powershell
# You're testing and want to restart quickly
.\restart-app.ps1
# Stops and starts the app from last commit
```

### Scenario 4: Committed New Code, Want to Run It
```powershell
# You committed changes and pushed
git add .
git commit -m "Added new feature"
git push

# Now start the app
.\start-app.ps1
# Will run your new commit ✅
```

---

## Troubleshooting

### "Port already in use"
**Solution:** Run `.\stop-app.ps1` first, then `.\start-app.ps1`

### "Process cannot be found"
**Solution:** Processes may have already stopped. Just run `.\start-app.ps1`

### "Git command not found"
**Solution:** Make sure Git is installed and in your PATH

### "Backend won't start"
**Check:**
1. Is Python virtual environment set up? `cd api; .\venv\Scripts\activate`
2. Are dependencies installed? `pip install -r requirements.txt`
3. Is port 8000 free? `netstat -ano | findstr :8000`

### "Frontend won't start"
**Check:**
1. Are Node modules installed? `cd web; npm install`
2. Is port 5180 free? `netstat -ano | findstr :5180`

---

## Best Practices

1. ✅ **Always use `start-app.ps1` or `start-app-auto.ps1`** instead of manual startup
2. ✅ **Commit your changes** before running the app in production
3. ✅ **Use `git stash`** to save work-in-progress before testing
4. ✅ **Run `stop-app.ps1`** before manually starting servers
5. ✅ **Check `git log -1`** to verify what commit you're running

---

## Advanced: What Happens Behind the Scenes

### When You Run `start-app.ps1`:

1. **Git Status Check**
   ```powershell
   git status --short
   ```
   Lists all modified/added/deleted files

2. **Restore or Stash**
   ```powershell
   # If you choose to restore:
   git restore .
   
   # If you choose to stash:
   git stash push -m "Auto-stash - timestamp"
   ```

3. **Show Current Commit**
   ```powershell
   git log -1 --format="%h - %s (%ad)"
   ```

4. **Find and Stop Processes**
   ```powershell
   Get-Process | Where-Object {...}
   Stop-Process -Id $proc.Id -Force
   ```

5. **Start Backend**
   ```powershell
   cd api
   .\venv\Scripts\python.exe run.py
   ```

6. **Start Frontend**
   ```powershell
   cd web
   npm run dev
   ```

---

## Summary

**To run the app from the last git commit:**
```powershell
.\start-app.ps1
```

**To stop the app:**
```powershell
.\stop-app.ps1
```

**That's it!** These scripts ensure you always run the correct version. 🚀



