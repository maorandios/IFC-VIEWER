# Model Tab and Duplicate Key Fixes

**Date:** February 2, 2026  
**Issues Fixed:**
1. Model tab not displaying 3D viewer
2. React duplicate key warning in AssembliesTab

---

## 🔴 Problem 1: Model Tab Not Displaying

### Error:
After implementing CSS-based tab hiding, the Model tab showed a blank screen with no 3D viewer.

### Root Cause:
**Three.js Initialization Issue with Hidden Elements**

The IFCViewer component uses Three.js, which requires:
1. Container element with valid dimensions
2. `clientWidth` and `clientHeight` > 0
3. Visible DOM element for WebGL context

When a component has `display: none`:
- ❌ `containerRef.current.clientWidth` = 0
- ❌ `containerRef.current.clientHeight` = 0
- ❌ Three.js WebGLRenderer fails to initialize
- ❌ Camera aspect ratio becomes `0 / 0` = NaN
- ❌ Scene doesn't render

### Solution:
**Exception for Model Tab - Use Conditional Rendering**

While all other tabs can use CSS hiding (they don't need dimensions), the Model tab with Three.js must use conditional rendering:

```typescript
// Other tabs - CSS hidden (state preserved)
<div className={`flex-1 overflow-y-auto ${activeTab === 'dashboard' ? '' : 'hidden'}`}>
  <Dashboard />
</div>

// Model tab - Conditional rendering (Three.js requirement)
{activeTab === 'model' && (
  <div className="flex-1 flex overflow-hidden">
    <IFCViewer />
  </div>
)}
```

**Trade-off:**
- ✅ Model tab works correctly
- ⚠️ Model tab loses state when switching (acceptable - 3D view reloads)
- ✅ All other 10 tabs maintain state

---

## 🔴 Problem 2: Duplicate Key Warning

### Error:
```
Warning: Encountered two children with the same key, `B10`. 
Keys should be unique so that components maintain their identity across updates.
```

### Root Cause:
**Duplicate Assembly Marks**

In `AssembliesTab.tsx`, the code used `assembly.assembly_mark` as the React key:

```typescript
filteredAssemblies.map((assembly, index) => (
  <Fragment key={assembly.assembly_mark}>  // ❌ Not unique!
    ...
  </Fragment>
))
```

**Problem:** Multiple assemblies can have the same `assembly_mark` (e.g., "B10" appears multiple times in different locations of the building).

**Why This Matters:**
- React uses keys to track component identity
- Duplicate keys confuse React's reconciliation
- Can cause incorrect rendering, duplicated elements, or omitted elements
- Performance issues with updates

### Solution:
**Unique Key Using Assembly Mark + Element ID**

Each assembly has an `ids` array containing unique element IDs. Combine `assembly_mark` with the first element ID:

```typescript
filteredAssemblies.map((assembly, index) => {
  // Create unique key using assembly_mark and first element ID
  const uniqueKey = `${assembly.assembly_mark}-${assembly.ids?.[0] || index}`;
  return (
    <Fragment key={uniqueKey}>  // ✅ Guaranteed unique!
      ...
      <tr key={`${uniqueKey}-expanded`}>  // ✅ Expanded row also unique
        ...
      </tr>
    </Fragment>
  );
})
```

**Why This Works:**
- ✅ `assembly.ids[0]` is a unique IFC element ID
- ✅ Even if two assemblies have same mark, they have different element IDs
- ✅ Fallback to `index` if `ids` is missing (shouldn't happen)
- ✅ React can properly track each assembly

---

## 📊 Technical Details

### Three.js Dimension Requirements:

```javascript
// When element is hidden (display: none):
containerRef.current.clientWidth  // = 0
containerRef.current.clientHeight // = 0

// Three.js code:
const renderer = new THREE.WebGLRenderer()
renderer.setSize(0, 0)  // ❌ Invalid!

const camera = new THREE.PerspectiveCamera(
  75,
  0 / 0,  // ❌ aspect = NaN
  0.01,
  10000
)
```

### React Key Best Practices:

**Bad Keys:**
```typescript
key={index}                    // ❌ Changes when items reorder
key={item.name}                // ❌ Not unique if duplicates exist
key={Math.random()}            // ❌ Changes every render
```

**Good Keys:**
```typescript
key={item.id}                  // ✅ Unique database ID
key={`${item.type}-${item.id}`} // ✅ Composite unique key
key={item.uniqueIdentifier}    // ✅ Any guaranteed unique value
```

---

## ✅ Files Modified

### 1. `web/src/App.tsx`
**Change:** Model tab uses conditional rendering instead of CSS hiding

```typescript
// Before:
<div className={`flex-1 flex overflow-hidden ${activeTab === 'model' ? '' : 'hidden'}`}>
  <IFCViewer />
</div>

// After:
{activeTab === 'model' && (
  <div className="flex-1 flex overflow-hidden">
    <IFCViewer />
  </div>
)}
```

### 2. `web/src/components/AssembliesTab.tsx`
**Change:** Use unique composite key for assemblies

```typescript
// Before:
filteredAssemblies.map((assembly, index) => (
  <Fragment key={assembly.assembly_mark}>

// After:
filteredAssemblies.map((assembly, index) => {
  const uniqueKey = `${assembly.assembly_mark}-${assembly.ids?.[0] || index}`;
  return (
    <Fragment key={uniqueKey}>
```

---

## 🧪 How to Test

### Test 1: Model Tab Displays
1. Upload an IFC file
2. Switch to **Model** tab
3. ✅ 3D viewer displays correctly
4. ✅ Model loads and renders
5. ✅ Can rotate, zoom, measure

### Test 2: No Console Warnings
1. Upload an IFC file with duplicate assembly marks
2. Go to **Assemblies** tab
3. Open browser console
4. ✅ No duplicate key warnings
5. ✅ All assemblies display correctly

### Test 3: Tab State Persistence (Other Tabs)
1. Go to **Profiles** tab → Search for "IPE"
2. Switch to **Plates** tab
3. Switch back to **Profiles**
4. ✅ Search term "IPE" still there
5. (Model tab will reload - this is expected and acceptable)

---

## 📝 Summary

### Problem 1 Solution:
- ✅ Model tab now uses conditional rendering (exception to CSS hiding)
- ✅ Three.js initializes with valid dimensions
- ✅ 3D viewer displays correctly
- ⚠️ Trade-off: Model tab loses state on switch (acceptable)

### Problem 2 Solution:
- ✅ Assemblies now use unique composite keys
- ✅ No React duplicate key warnings
- ✅ Proper component tracking and updates
- ✅ Better performance

### Overall Result:
- ✅ **10 out of 11 tabs** maintain state when switching
- ✅ **Model tab** works correctly (loads on demand)
- ✅ **All tabs** load data immediately when app starts
- ✅ **No console warnings**
- ✅ **Professional UX** with fast tab switching

---

## 💡 Why This Approach?

### Alternative Approaches Considered:

1. **Delay Three.js initialization until visible**
   - ❌ Complex - requires watching visibility changes
   - ❌ Error-prone - many edge cases
   - ❌ More code to maintain

2. **Use visibility: hidden instead of display: none**
   - ❌ Element still takes layout space (bad UX)
   - ❌ Affects scrolling and layout
   - ❌ Not a true "hidden" state

3. **Hack container dimensions when hidden**
   - ❌ Brittle - breaks with CSS changes
   - ❌ Still may have rendering issues
   - ❌ Feels like a workaround

4. **Chosen: Conditional rendering for Model tab only** ✅
   - ✅ Simple and clean
   - ✅ Reliable - guaranteed to work
   - ✅ Minimal trade-off (Model tab reloads)
   - ✅ Easy to understand and maintain

The Model tab reloading on switch is acceptable because:
- Users typically set up the 3D view once and don't switch often
- 3D view state (camera position, measurements) is less critical than data filters
- Simplicity and reliability > perfect state preservation for this one tab

---

## ✅ Conclusion

Both issues resolved with minimal trade-offs:
- **Model tab:** Works correctly, reloads on switch (acceptable)
- **Other tabs:** Maintain full state when switching
- **No console warnings**
- **Professional UX maintained**

The app now has the best balance of functionality, performance, and maintainability! 🎉

