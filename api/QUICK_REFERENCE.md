# Quick Reference - Server Management Scripts

## One-Line Commands

### Check if server is running
```powershell
C:\IFC2026\api\check_server.ps1
```

### Test if server is responding  
```powershell
C:\IFC2026\api\test_server.ps1
```

### Stop the server
```powershell
C:\IFC2026\api\stop_server.ps1
```

### Restart the server
```powershell
C:\IFC2026\api\restart_server.ps1
```

### Start the server (if not running)
```powershell
C:\IFC2026\api\run_visible.ps1
```

---

## Common Scenarios

**"Is the server running?"**
```powershell
C:\IFC2026\api\check_server.ps1
```

**"Does the server work?"**
```powershell
C:\IFC2026\api\test_server.ps1
```

**"I changed code, reload it"**
```powershell
C:\IFC2026\api\restart_server.ps1
```

**"Kill the server"**
```powershell
C:\IFC2026\api\stop_server.ps1
```

---

## Current Status
- ✅ Server is running (PID 25536)
- ✅ Server is responding to requests
- 🔌 Port: 8000
- 🌐 URL: http://localhost:8000

For detailed troubleshooting, see: [SERVER_TESTING_GUIDE.md](../SERVER_TESTING_GUIDE.md)

