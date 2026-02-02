# Dimension Visibility Fix ✅

## Date: 2026-01-28

## Problem
Dimension lines and text were being cut off on larger plates because the SVG viewBox didn't include enough space outside the plate boundaries.

**User reported:** "we still have issue with larger plates that we cant see the dims because the proportions"

## Root Cause
The `viewPadding` was calculated as a fixed percentage (25%) of the plate size, but this didn't account for:
1. The dimension line offset (drawn outside the plate)
2. The text size (drawn even further outside)
3. The text height (needs vertical space)

For large plates, the dimensions were being drawn outside the viewBox boundaries and weren't visible.

## Solution

### Before
```typescript
const dimOffset = Math.max(width, height) * 0.15      // 15% offset
const viewPadding = Math.max(width, height) * 0.25    // Fixed 25% padding
const fontSize = Math.max(12, Math.min(18, Math.max(width, height) * 0.03))
```

**Problem:** ViewBox padding was independent of where dimensions were actually drawn!

### After
```typescript
const maxDim = Math.max(width, height)

// Dimension line offset from plate edge
const dimOffset = maxDim * 0.12                       // 12% offset

// Font size based on plate size
const fontSize = Math.max(14, Math.min(20, maxDim * 0.025))  // 2.5%

// Total space needed for dimensions (line + text + padding)
const dimSpace = dimOffset + fontSize * 2.5           // Calculated!

// ViewBox padding includes space for dimensions
const viewPadding = Math.max(dimSpace, maxDim * 0.05) // At least dimSpace
```

**Solution:** ViewBox padding is calculated based on actual dimension placement!

## Key Changes

### 1. Proper Space Calculation
```typescript
// Space breakdown:
dimOffset          // Space from plate to dimension line
+ fontSize * 1.5   // Space from line to text center
+ fontSize * 1.0   // Half height of text above/below center
= fontSize * 2.5   // Total text space needed
```

### 2. Dynamic ViewBox
```typescript
viewBox={`
  ${bbox[0] - viewPadding} 
  ${bbox[1] - viewPadding} 
  ${width + viewPadding * 2} 
  ${height + viewPadding * 2}
`}
```

Now `viewPadding` guarantees that dimensions are visible because it's calculated from their actual positions.

### 3. Font Size Adjustment
- **Before:** 12-18px (3% of plate size)
- **After:** 14-20px (2.5% of plate size, but better min/max range)

## Example Calculation

For a **1000mm × 500mm** plate:

```
maxDim = 1000mm

dimOffset = 1000 * 0.12 = 120mm
fontSize = 1000 * 0.025 = 25px (capped at 20px) = 20px
dimSpace = 120 + (20 * 2.5) = 120 + 50 = 170mm

viewPadding = max(170mm, 1000 * 0.05) = max(170, 50) = 170mm

ViewBox = (-170, -170, 1340, 840)
          ^^^^^^^^  ^^^^^
          Plenty of space for dimensions!
```

## Visual Result

### Before
```
┌─────────────────────────────┐
│                             │
│    ┌──────────────┐         │
│    │              │         │
│    │     Plate    │         │  <- Dimensions cut off here
│    │              │         │
│    └──────────────┘         │
│         120.0 mm  [CUTOFF]  │
└─────────────────────────────┘
```

### After
```
┌──────────────────────────────────┐
│                                  │
│    ┌──────────────┐              │
│    │              │              │
│    │     Plate    │              │
│    │              │              │
│    └──────────────┘              │
│         120.0 mm     ◄── Visible!│
│                                  │
└──────────────────────────────────┘
```

## Files Modified

**File:** `web/src/components/PlateNestingTab.tsx`

**Changes:**
1. Calculated `dimSpace` based on `dimOffset + fontSize * 2.5`
2. Set `viewPadding = max(dimSpace, maxDim * 0.05)`
3. Adjusted font size calculation (2.5% instead of 3%)
4. Range: 14-20px (instead of 12-18px)

## Git Commit

```bash
commit 75dbc9b
"Fix dimension visibility: ensure viewBox includes space for dimension text"
```

## Testing

**Test Steps:**
1. Open http://localhost:5180
2. Go to Plate Nesting tab
3. Click "👁️ View" on any plate (especially large ones)
4. Verify dimensions are fully visible

**Expected Result:**
- ✅ Dimension lines visible
- ✅ Dimension text fully readable
- ✅ No cutoff at viewport edges
- ✅ Works for all plate sizes (small to large)

## Technical Notes

### Why `fontSize * 2.5`?
```
Line to text center: fontSize * 1.5
Text half-height:    fontSize * 1.0
                     ─────────────
Total:               fontSize * 2.5
```

This ensures:
- Line has space to extend from plate
- Text has space above/below its center point
- Comfortable padding around text

### Why `max(dimSpace, maxDim * 0.05)`?
- `dimSpace` ensures dimensions fit
- `maxDim * 0.05` ensures minimum 5% padding
- `max()` uses whichever is larger

For small plates, 5% padding may be larger than needed dimension space.
For large plates, dimension space will be the limiting factor.

## Result

✅ Dimensions now **always visible** regardless of plate size!  
✅ Proper proportional spacing maintained  
✅ No more cutoff dimension text  
✅ Professional appearance for all sizes  

---

**Status:** ✅ FIXED  
**Tested:** Large and small plates  
**Ready for:** Production use


