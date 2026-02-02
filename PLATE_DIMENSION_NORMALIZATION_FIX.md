# Plate Dimension Normalization Fix

## Issue
The IFC modeler sometimes defines the same plate with width and length swapped. For example:
- `p1060` might be defined as `90.0 x 367.9 mm` in some instances
- `p1060` might be defined as `367.9 x 90.0 mm` in other instances

These are physically the same plate (same area, same material), just with dimensions reversed. However, the application was treating them as different plates and creating separate rows in the table, assigning different colors, and counting them separately.

## Root Cause
The plate grouping key was created using the exact dimensions as provided:
```typescript
const key = `${baseName}_${plate.thickness}_${plate.width}_${plate.height}`;
```

This meant:
- `p1060_10mm_90_367.9` → Group 1
- `p1060_10mm_367.9_90` → Group 2 (treated as different!)

## Solution
Implemented dimension normalization by sorting the width and height dimensions before creating the grouping key. This ensures plates with swapped dimensions are recognized as the same plate.

### Implementation

1. **Created helper function** `createPlateGroupKey()`:
```typescript
const createPlateGroupKey = (baseName: string, thickness: string, width: number, height: number): string => {
  // Sort dimensions to normalize (smaller first, larger second)
  // This ensures plates with swapped dimensions are treated as the same
  const [dim1, dim2] = [width, height].sort((a, b) => a - b);
  return `${baseName}_${thickness}_${dim1}_${dim2}`;
}
```

Now both orientations create the same key:
- `p1060_10mm_90_367.9` ✓
- `p1060_10mm_90_367.9` ✓ (normalized from 367.9_90)

2. **Updated all grouping locations**:
   - SVG color mapping creation
   - SVG rendering loop
   - Detailed plates table grouping

3. **Normalized display dimensions**:
   When storing plate dimensions for display in the table, we also normalize them:
```typescript
const [dim1, dim2] = [plate.width, plate.height].sort((a, b) => a - b);
groupedPlates.set(key, {
  baseName,
  thickness: plate.thickness,
  width: dim1,  // Always smaller dimension
  height: dim2, // Always larger dimension
  // ... other properties
});
```

## Benefits

1. **Correct grouping**: Plates with swapped dimensions are now correctly recognized as the same plate
2. **Accurate quantities**: The quantity column shows the total count of all instances, regardless of dimension order
3. **Consistent colors**: All instances of the same plate (regardless of dimension order) get the same color in the SVG
4. **Cleaner table**: Eliminates duplicate rows for the same plate with swapped dimensions
5. **Better material tracking**: More accurate plate counts for procurement and cutting

## Example
**Before the fix:**
```
Row 2: p1060, 10mm, 90.0 x 367.9, Qty: 11
Row 3: p1060, 10mm, 367.9 x 90.0, Qty: 13
Row 4: p1070, 10mm, 200.0 x 150.0, Qty: 6
Row 5: p1070, 10mm, 150.0 x 200.0, Qty: 6
```

**After the fix:**
```
Row 2: p1060, 10mm, 90.0 x 367.9, Qty: 24
Row 3: p1070, 10mm, 150.0 x 200.0, Qty: 12
```

## Files Modified
- `c:\IFC2026\web\src\components\PlateNestingTab.tsx`
  - Added `createPlateGroupKey()` helper function
  - Updated 3 locations where grouping keys are created
  - Added dimension normalization when storing group data

## Date
2026-01-29


