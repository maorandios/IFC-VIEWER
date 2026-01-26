# Server Testing Guide - PROBLEM SOLVED! 🎉

## The Problem You Were Experiencing

When you tried to "test the server", it appeared to **hang** or get stuck. Here's what was actually happening:

### Root Cause
**The server was ALREADY running on port 8000!**

When you tried to start the server again (for testing), it would:
1. Try to bind to port 8000
2. Fail because port 8000 was already in use
3. Either hang waiting for the port, or fail silently
4. Give you no clear feedback about what was wrong

This made it seem like the server was "stuck" when actually it was just unable to start because another instance was already running.

## Solution: New Management Scripts

I've created 4 PowerShell scripts to help you manage the server properly:

### 1. `check_server.ps1` - Check if server is running
```powershell
C:\IFC2026\api\check_server.ps1
```
Shows:
- ✅ Whether the server is running on port 8000
- 📊 Process details (PID, memory usage, start time)
- 🐍 All Python processes currently running

### 2. `test_server.ps1` - Test if server is responding
```powershell
C:\IFC2026\api\test_server.ps1
```
Tests:
- 🔌 If port 8000 is listening
- 🌐 If the server responds to HTTP requests
- ✅ Health check endpoint (`/api/health`)

Output: Either "SERVER IS WORKING!" or error message

### 3. `stop_server.ps1` - Stop the running server
```powershell
C:\IFC2026\api\stop_server.ps1
```
Safely stops the server running on port 8000

### 4. `restart_server.ps1` - Restart the server
```powershell
C:\IFC2026\api\restart_server.ps1
```
Stops the old server (if running) and starts a new one

## Recommended Workflow

### Before Starting the Server
```powershell
# 1. Check if server is already running
C:\IFC2026\api\check_server.ps1
```

### If Server is Already Running
```powershell
# Option A: Just test if it's working
C:\IFC2026\api\test_server.ps1

# Option B: Stop it first, then start fresh
C:\IFC2026\api\stop_server.ps1
C:\IFC2026\api\run_visible.ps1

# Option C: Restart it in one command
C:\IFC2026\api\restart_server.ps1
```

### If Server is NOT Running
```powershell
# Start it normally
C:\IFC2026\api\run_visible.ps1
```

### After Making Code Changes
```powershell
# Restart to load new code
C:\IFC2026\api\restart_server.ps1
```

## Current Status

As of now:
- ✅ **Server IS running** (PID: 25536, started at 12:09:39 PM)
- ✅ **Server IS responding** to HTTP requests
- ✅ Health check passes: `{"status":"ok"}`
- 💾 Memory usage: ~121 MB

## Common Scenarios

### "I want to test if the server works"
```powershell
C:\IFC2026\api\test_server.ps1
```

### "I made code changes and want to reload"
```powershell
C:\IFC2026\api\restart_server.ps1
```

### "The server seems stuck"
```powershell
# 1. Check if it's actually running
C:\IFC2026\api\check_server.ps1

# 2. Try to test it
C:\IFC2026\api\test_server.ps1

# 3. If stuck, force restart
C:\IFC2026\api\restart_server.ps1
```

### "I want to see server logs"
```powershell
# Use your existing log scripts
C:\IFC2026\api\view_logs.ps1
# or
C:\IFC2026\api\show_logs.ps1
```

## Technical Details

### Why Did It Seem to Hang?

1. **Port Conflict**: When a process tries to bind to an already-used port, it can:
   - Block indefinitely waiting for the port
   - Fail with error code 10048 (WSAEADDRINUSE)
   - Give unclear error messages

2. **Silent Failures**: In some cases, the startup process would fail but not show a clear error, making it appear "stuck"

3. **Multiple Python Processes**: You had 2 Python processes running (PIDs 20188 and 25536), both started at the same time

### How the Scripts Work

- **Port Detection**: Uses `netstat -ano | findstr :8000` to find processes using port 8000
- **Process Management**: Uses PowerShell's `Get-Process` and `Stop-Process`
- **Health Check**: HTTP GET request to `/api/health` endpoint
- **Timeout Protection**: 5-second timeout on HTTP requests

## Troubleshooting

### Server won't stop
```powershell
# Find all Python processes
Get-Process | Where-Object { $_.ProcessName -like "*python*" }

# Stop a specific one
Stop-Process -Id <PID> -Force
```

### Port still in use after stopping
```powershell
# Wait a few seconds and check again
Start-Sleep -Seconds 3
netstat -ano | findstr :8000
```

### Server starts but doesn't respond
```powershell
# Check the backend logs
C:\IFC2026\api\view_logs.ps1

# Look for errors in api/backend.log
```

## Summary

✅ **Your server was never broken!** It was just already running.

✅ **You now have proper tools** to check, test, stop, and restart the server.

✅ **No more "hanging"** - you'll get clear feedback about what's happening.

🎯 **Next time**: Before starting the server, run `check_server.ps1` to see if it's already running!

