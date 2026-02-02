# Model Tab Loading Issue - Debugging

**Date:** February 2, 2026  
**Issue:** Model tab stuck on "Loading 3D model..." for 5+ minutes with no errors

---

## 🔍 Diagnostic Logs Added

I've added comprehensive logging to the IFCViewer component to diagnose the loading issue.

### Added Console Logs:

1. **Start of loadGLTF:**
   ```
   [IFCViewer] Starting loadGLTF, filename: X, gltfPath: Y, gltfAvailable: Z
   ```

2. **glTF filename determined:**
   ```
   [IFCViewer] glTF filename to load: /api/gltf/filename.glb
   ```

3. **Before THREE.js loader:**
   ```
   [IFCViewer] About to load glTF file: /api/gltf/filename.glb
   ```

4. **After successful load:**
   ```
   [IFCViewer] glTF loaded successfully, scene: [Object]
   ```

5. **After render:**
   ```
   [IFCViewer] Model loaded and displayed successfully
   ```

6. **On error:**
   ```
   [IFCViewer] Error loading glTF: [error details]
   ```

---

## 🧪 How to Debug

### Step 1: Open Browser Console
1. Open your browser
2. Press `F12` to open Developer Tools
3. Go to the **Console** tab
4. Clear the console (`Ctrl+L` or click clear icon)

### Step 2: Reproduce the Issue
1. Refresh the page (`F5`)
2. Go to the **Model** tab
3. Watch the console output

### Step 3: Analyze the Logs

**Scenario A: Loading starts but never completes**
```
[IFCViewer] Starting loadGLTF, filename: file.ifc, gltfPath: /api/gltf/file.glb, gltfAvailable: true
[IFCViewer] glTF filename to load: /api/gltf/file.glb
[IFCViewer] About to load glTF file: /api/gltf/file.glb
(then nothing - stuck here)
```
**Problem:** GLTFLoader.loadAsync() is hanging
**Likely cause:** 
- GLTF file is too large (>50MB)
- GLTF file is corrupted
- Network timeout
- File doesn't actually exist despite gltfAvailable=true

**Solution:**
- Check file size: `storage/gltf/file.glb`
- Try loading the file directly in browser: `http://localhost:5180/api/gltf/file.glb`
- Check backend logs for GLTF conversion issues

---

**Scenario B: Never starts loading**
```
(no [IFCViewer] logs at all)
```
**Problem:** useEffect never runs or loadGLTF never called
**Likely cause:**
- Component not mounting properly
- filename prop not passed correctly
- containerRef not ready

**Solution:**
- Check if Model tab actually renders
- Check App.tsx props being passed to IFCViewer

---

**Scenario C: Starts, loads, but doesn't finish**
```
[IFCViewer] Starting loadGLTF...
[IFCViewer] glTF filename to load...
[IFCViewer] About to load glTF file...
[IFCViewer] glTF loaded successfully, scene: [Object]
(then stuck - no "Model loaded and displayed successfully")
```
**Problem:** Model loads but render fails
**Likely cause:**
- Three.js rendering issue
- Scene/camera/renderer not initialized properly
- Too many vertices/faces (browser crash)

**Solution:**
- Check browser memory usage
- Check if WebGL is working: `https://get.webgl.org/`
- Simplify the model or reduce detail

---

**Scenario D: Error shown**
```
[IFCViewer] Error loading glTF: [specific error message]
```
**Problem:** Explicit error during load
**Solution:** The error message will tell you exactly what's wrong

---

## 🎯 Most Likely Causes

Based on "stuck on Loading 3D model..." with no errors:

### 1. **Large GLTF File (Most Likely)**
- **Symptom:** Loads forever, no error
- **Why:** GLTFLoader is parsing a huge file
- **Check:** File size of `storage/gltf/Mivne_Megurim_With_Concrete.glb`
- **Fix:** If >50MB, optimize GLTF conversion settings

### 2. **Missing GLTF File**
- **Symptom:** Stuck on HEAD request or conversion polling
- **Why:** gltfAvailable=true but file doesn't exist
- **Check:** Does file exist at `storage/gltf/Mivne_Megurim_With_Concrete.glb`?
- **Fix:** Re-upload IFC file to regenerate GLTF

### 3. **Three.js Initialization Issue**
- **Symptom:** Loads but never renders
- **Why:** containerRef has zero dimensions when hidden
- **Fix:** Already fixed by using conditional rendering

### 4. **Conversion Still Running**
- **Symptom:** Stuck on "Converting IFC to glTF..."
- **Why:** Backend conversion taking >5 minutes
- **Check:** Backend console for `[GLTF]` logs
- **Fix:** Wait longer or optimize conversion

---

## 🔧 Immediate Actions

### Action 1: Check File Size
```powershell
Get-Item C:\IFC2026\storage\gltf\Mivne_Megurim_With_Concrete.glb | Select-Object Name, Length, LastWriteTime
```

**Expected:** <30MB  
**If >50MB:** File is too large for browser to parse quickly

### Action 2: Check File Exists
```powershell
Test-Path C:\IFC2026\storage\gltf\Mivne_Megurim_With_Concrete.glb
```

**If False:** File doesn't exist, need to regenerate

### Action 3: Check Browser Console
Look for the new `[IFCViewer]` logs to see where it's stuck

### Action 4: Check Backend Logs
Look for `[GLTF]` logs to see if conversion completed:
```
[GLTF] Found X products in IFC file
[GLTF] Conversion summary: X meshes created, Y skipped, Z failed
[GLTF] Color sources: ...
Successfully exported glTF to ..., size: X bytes
```

---

## 💡 Temporary Workarounds

### Workaround 1: Force Reload
1. Delete the GLB file: `storage/gltf/Mivne_Megurim_With_Concrete.glb`
2. Refresh browser
3. Upload IFC again
4. Watch backend logs for conversion

### Workaround 2: Test with Smaller File
1. Upload a smaller IFC file (<2MB)
2. See if Model tab works
3. If yes = large file issue
4. If no = code issue

### Workaround 3: Direct GLB Load Test
1. Open: `http://localhost:5180/api/gltf/Mivne_Megurim_With_Concrete.glb`
2. If downloads = file exists and is valid
3. If 404 = file doesn't exist
4. If times out = file too large

---

## 📝 Next Steps

After reviewing the console logs, update this document with:
1. Which scenario matched
2. What the actual problem was
3. What fixed it

This will help diagnose similar issues in the future.

---

## ✅ Summary

**Debugging logs added to IFCViewer component:**
- ✅ Start of loading
- ✅ Path determination
- ✅ Before THREE.js load
- ✅ After successful load
- ✅ After render
- ✅ On error

**Next:** Check browser console for `[IFCViewer]` logs to diagnose where it's stuck.

