# Startup Scripts Added - Summary

## What Was Done

Created PowerShell scripts to ensure the application always runs from the last git commit, preventing issues where uncommitted changes cause missing features or unexpected behavior.

## Problem Solved

**Before:** When running the app manually with uncommitted changes in the working directory, the app would use those modified files instead of the last committed version. This caused:
- Missing features (like the Profiles, Plates, Assemblies, and Management tabs)
- Confusion about what code is actually running
- Inconsistent behavior between sessions

**After:** Using the startup scripts automatically ensures you're running the exact code from the last git commit.

## New Files Created

### 1. `start-app.ps1` (Interactive Startup)
- Checks for uncommitted changes
- Prompts user to stash or discard them
- Shows current commit
- Stops any running servers
- Starts backend and frontend in separate windows
- **Use this for normal development**

### 2. `start-app-auto.ps1` (Automatic Startup)
- Same as `start-app.ps1` but automatically discards uncommitted changes
- No prompts or user interaction needed
- **Use this for quick restarts**

### 3. `stop-app.ps1` (Stop All Servers)
- Finds and stops all Python and Node processes related to IFC2026
- Clean shutdown of both backend and frontend
- **Use this to stop the app**

### 4. `restart-app.ps1` (Quick Restart)
- Stops the app using `stop-app.ps1`
- Starts the app using `start-app.ps1`
- **Use this for quick restarts**

### 5. `APP_STARTUP_GUIDE.md` (Documentation)
- Complete guide on using the startup scripts
- Troubleshooting section
- Common scenarios and best practices
- Behind-the-scenes explanation

## Documentation Updated

### `README.md`
Added "Quick Start (Recommended)" section at the top with:
- Instructions to use `.\start-app.ps1`
- What the script does
- Links to other scripts
- Moved manual setup below

### `QUICKSTART.md`
Added "Easiest Way" section at the top with:
- Quick command: `.\start-app.ps1`
- Benefits of using the script
- Links to other scripts

## How to Use

### Start the Application
```powershell
.\start-app.ps1
```

Then open your browser to: **http://localhost:5180**

### Stop the Application
```powershell
.\stop-app.ps1
```

### Restart the Application
```powershell
.\restart-app.ps1
```

## What the Scripts Do

1. ✅ Check for uncommitted changes
2. ✅ Restore files to last commit (with option to stash)
3. ✅ Show which commit will run
4. ✅ Stop any running servers
5. ✅ Start backend on port 8000
6. ✅ Start frontend on port 5180
7. ✅ Open in separate windows for easy monitoring

## Benefits

- **Consistency**: Always run from a known git commit
- **No Missing Features**: Uncommitted deletions won't affect running app
- **Easy Debugging**: Know exactly what code version is running
- **Clean Restarts**: Proper shutdown and startup sequence
- **User Friendly**: Clear output messages and color coding
- **Documented**: Comprehensive guide for all scenarios

## Technical Details

### How It Ensures Correct Version

```powershell
# 1. Check for changes
git status --short

# 2. If changes exist, restore to last commit
git restore .

# 3. Verify commit
git log -1 --format="%h - %s (%ad)"

# 4. Start servers with clean code
```

### Process Management

- Uses `Get-Process` to find running Python/Node processes
- Filters by command line to only stop IFC2026-related processes
- Force stops processes to ensure clean shutdown
- Waits for proper startup sequence

### Window Management

- Backend and frontend run in separate PowerShell windows
- Windows stay open to show logs
- Easy to monitor both services
- Simple to stop with Ctrl+C

## Example Session

```powershell
PS C:\IFC2026> .\start-app.ps1
================================================
  IFC2026 Application Startup
  Running from last git commit
================================================

Checking for uncommitted changes...
Found uncommitted changes - Restoring to last commit...
Files restored!

Current commit: 073b042 - Restructure: Move tables to dedicated tabs (2026-01-26 14:20)

Stopping any running processes...
Processes stopped!

================================================
  Starting Backend Server...
================================================
Backend starting on http://localhost:8000

================================================
  Starting Frontend Server...
================================================
Frontend starting on http://localhost:5180

================================================
  Application Started Successfully!
================================================

Backend:  http://localhost:8000
Frontend: http://localhost:5180

Open your browser and navigate to:
  http://localhost:5180
```

## Future Enhancements

Possible additions:
- Health check verification after startup
- Automatic browser opening
- Log file creation and monitoring
- Git pull before starting (optional)
- Configuration file for ports and settings

## Related Documentation

- `APP_STARTUP_GUIDE.md` - Complete usage guide
- `README.md` - Project overview with quick start
- `QUICKSTART.md` - Quick setup instructions
- `START_HERE.md` - Troubleshooting guide

## Commit Message

```
Add startup scripts to ensure app runs from last git commit

- Created start-app.ps1 for interactive startup
- Created start-app-auto.ps1 for automatic startup
- Created stop-app.ps1 to stop all servers
- Created restart-app.ps1 for quick restarts
- Added APP_STARTUP_GUIDE.md with complete documentation
- Updated README.md with Quick Start section
- Updated QUICKSTART.md with script instructions

These scripts solve the issue where uncommitted changes
caused the app to run with modified files instead of the
last committed version, leading to missing features.
```

---

**Status**: ✅ Ready to commit and use

**Recommended**: Test `.\start-app.ps1` to verify everything works as expected, then commit these changes.


