# Quick Start - Troubleshooting Guide

## Current Status
✅ Backend is running on port 8000
✅ Frontend is running on port 5180

## Access the Application

**Open your browser and go to:**
```
http://localhost:5180
```

**NOT** `http://localhost:5173` (that's the old port)

## If the page doesn't load:

### 1. Check Browser Console
- Press `F12` to open Developer Tools
- Go to the "Console" tab
- Look for any red error messages
- Share the error messages if you see any

### 2. Check Network Tab
- In Developer Tools, go to "Network" tab
- Refresh the page
- Look for any failed requests (red entries)
- Check if `/api/health` returns 200 OK

### 3. Verify Services are Running

**Backend (Terminal 1):**
```powershell
cd api
.\venv\Scripts\python.exe run.py
```
Should see: `Uvicorn running on http://0.0.0.0:8000`

**Frontend (Terminal 2):**
```powershell
cd web
npm run dev
```
Should see: `Local: http://localhost:5180/`

### 4. Common Issues

**Blank white page:**
- Check browser console for JavaScript errors
- Try hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Clear browser cache

**CORS errors:**
- Make sure backend is running on port 8000
- Check that `api/main.py` has port 5180 in CORS origins

**"Cannot GET /" error:**
- Make sure you're accessing `http://localhost:5180` (not 5173)
- Frontend dev server should be running

## Restart Services

If you need to restart:

**Stop services:**
- Press `Ctrl+C` in both terminal windows

**Start Backend:**
```powershell
cd api
.\venv\Scripts\python.exe run.py
```

**Start Frontend:**
```powershell
cd web
npm run dev
```

## Still Not Working?

1. Check if ports are in use:
   ```powershell
   netstat -ano | findstr ":8000"
   netstat -ano | findstr ":5180"
   ```

2. Try different ports if needed:
   - Edit `api/run.py` to change backend port
   - Edit `web/vite.config.ts` to change frontend port
   - Update CORS in `api/main.py` to match

3. Check for missing dependencies:
   ```powershell
   cd web
   npm install
   
   cd ..\api
   .\venv\Scripts\pip.exe install -r requirements.txt
   ```











