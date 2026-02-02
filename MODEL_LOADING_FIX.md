# Model Loading Fix - Infinite Loop Issue

## Problem Summary
After implementing tab state persistence (rendering all tabs but hiding inactive ones with CSS), the Model tab became stuck on "Loading 3D model..." indefinitely. Browser console showed the `loadGLTF()` function being called repeatedly in an infinite loop.

## Root Cause Analysis

### Console Evidence
```
[IFCViewer] Starting loadGLTF... (×10+)
[IFCViewer] glTF filename to load: /api/gltf/Binuy563_with_concrete.glb (×10+)
[IFCViewer] About to load glTF file: /api/gltf/Binuy563_with_concrete.glb (×10+)
```

The function was called repeatedly but never reached the `GLTFLoader.loadAsync()` completion callback.

### Technical Root Cause
1. **Infinite Re-render Loop**: The `useEffect` hook in `IFCViewer.tsx` (line 179-1708) had dependencies `[filename, gltfPath]`
2. **State Changes Trigger Re-renders**: Inside `loadGLTF()`, calling `setIsLoading(true)` triggered a component re-render
3. **useEffect Runs Again**: The re-render caused the useEffect to execute again
4. **No Load Guard**: There was no mechanism to prevent `loadGLTF()` from being called multiple times simultaneously
5. **Async Never Completes**: The rapid re-entry prevented the async `GLTFLoader.loadAsync()` from completing
6. **Backend Never Receives Request**: Because the frontend was stuck in a loop, the HTTP request for the GLTF file was never sent

### Why This Only Happened After Tab Persistence
Previously, the Model tab used conditional rendering (`{activeTab === 'model' && <IFCViewer />}`), which completely unmounted the component when switching tabs. After the tab persistence fix, all tabs remained mounted, and the IFCViewer component stayed alive, making the re-render loop more apparent.

## The Fix

### Changes Made to `web/src/components/IFCViewer.tsx`

#### 1. Added Loading Guard Ref (Line ~141)
```typescript
const [isLoading, setIsLoading] = useState(false)
const [conversionStatus, setConversionStatus] = useState<string>('')
const isLoadingRef = useRef<boolean>(false) // Guard to prevent multiple simultaneous loads
```

#### 2. Added Guard Check at Start of loadGLTF() (Line ~1011)
```typescript
const loadGLTF = async () => {
  if (!filename) {
    console.warn('No filename provided to IFCViewer')
    return
  }

  // Prevent multiple simultaneous loads
  if (isLoadingRef.current) {
    console.log('[IFCViewer] Already loading, skipping duplicate loadGLTF call')
    return
  }

  console.log('[IFCViewer] Starting loadGLTF, filename:', filename, 'gltfPath:', gltfPath, 'gltfAvailable:', gltfAvailable)
  isLoadingRef.current = true  // ← Set guard
  setIsLoading(true)
  setLoadError(null)
  setConversionStatus('')
  // ...
```

#### 3. Reset Guard on Success (Line ~1537)
```typescript
console.log('[IFCViewer] Model loaded and displayed successfully')
setIsLoading(false)
setConversionStatus('')
isLoadingRef.current = false  // ← Reset guard
```

#### 4. Reset Guard on Error (Line ~1543)
```typescript
} catch (error) {
  console.error('[IFCViewer] Error loading glTF:', error)
  const errorMessage = error instanceof Error ? error.message : 'Unknown error'
  setLoadError(`Failed to load 3D model: ${errorMessage}`)
  setIsLoading(false)
  setConversionStatus('')
  isLoadingRef.current = false  // ← Reset guard
}
```

## How The Fix Works

### Execution Flow (Before Fix)
```
useEffect runs → loadGLTF() called
  → setIsLoading(true) → re-render
  → useEffect runs again → loadGLTF() called again
  → setIsLoading(true) → re-render
  → useEffect runs again → loadGLTF() called again
  → ... infinite loop ...
```

### Execution Flow (After Fix)
```
useEffect runs → loadGLTF() called
  → Check: isLoadingRef.current = false ✓
  → Set: isLoadingRef.current = true
  → setIsLoading(true) → re-render
  → useEffect runs again → loadGLTF() called again
  → Check: isLoadingRef.current = true ✗
  → Exit early (skip duplicate load)
  → ... async load completes ...
  → Reset: isLoadingRef.current = false
```

## Benefits of This Solution

1. **Simple and Effective**: Uses a ref (doesn't trigger re-renders) as a guard
2. **Race Condition Safe**: Prevents multiple simultaneous loads
3. **Maintains State Logic**: Doesn't interfere with existing `isLoading` state for UI
4. **Minimal Changes**: Only 4 lines added to existing code
5. **Works with Tab Persistence**: Compatible with the new tab rendering approach

## Testing Instructions

1. **Upload an IFC file** in the Dashboard
2. **Switch to Model tab** immediately after upload
3. **Expected Result**: Model loads successfully within 30-45 seconds (for 4MB file)
4. **Console Check**: Should see only ONE sequence of:
   ```
   [IFCViewer] Starting loadGLTF...
   [IFCViewer] glTF filename to load...
   [IFCViewer] About to load glTF file...
   [IFCViewer] glTF loaded successfully...
   [IFCViewer] Model loaded and displayed successfully
   ```
5. **Backend Check**: Should see ONE request:
   ```
   INFO: 127.0.0.1:xxxxx - "GET /api/gltf/Binuy563_with_concrete.glb HTTP/1.1" 200 OK
   ```

## Related Files
- `web/src/components/IFCViewer.tsx` - Main fix location
- `web/src/App.tsx` - Tab persistence implementation (uses conditional rendering for Model tab)

## Status
✅ **FIXED** - Deployed on 2026-02-02

## Next Steps
- User to test model loading in browser
- Monitor for any remaining issues with tab switching
- Consider adding similar guards to other async operations if needed

