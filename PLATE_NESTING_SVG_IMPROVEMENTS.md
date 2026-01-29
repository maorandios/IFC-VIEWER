# Plate Nesting SVG Display Improvements

## Changes Implemented

### 1. ✅ Removed Rotation Message
**Before:**
```
📐 Display rotated to landscape for better visibility
```

**After:**
- Message removed - cleaner display

### 2. ✅ Grouped Duplicate Plates in Table
**Before:**
```
# | Plate Name | Thickness | Width | Length | m² | Weight | Qty | Total
--|------------|-----------|-------|--------|----|---------|----|------
  | p1001-1    | 10mm      | 100   | 200    |... | 1.57   | 1  | 1.57
  | p1001-2    | 10mm      | 100   | 200    |... | 1.57   | 1  | 1.57
  | p1001-3    | 10mm      | 100   | 200    |... | 1.57   | 1  | 1.57
```

**After:**
```
#     | Plate Name | Thickness | Width | Length | m² | Weight | Qty | Total
------|------------|-----------|-------|--------|----|---------|----|------
1-3   | p1001      | 10mm      | 100   | 200    |... | 1.57   | 3  | 4.71
```

**Logic:**
- Groups plates by base name (removes `-1`, `-2`, `-3` suffix)
- Shows number range in `#` column (e.g., `1-3` or `5-8`)
- Combines quantity and total weight
- Much cleaner display for repeated plates!

### 3. ✅ Plate Numbers in SVG (Like Profile Nesting)
**Before:**
- SVG showed full plate names: `p1001-1`, `p1001-2`, etc.
- Hard to read, cluttered

**After:**
- SVG shows **plate number only**: `1`, `2`, `3`, etc.
- Numbers correspond to the `#` column in the table below
- White circle background for better visibility
- Larger, bolder font
- Similar to profile nesting stock bar display

**Visual Enhancement:**
```svg
<!-- White circle background -->
<circle cx="..." cy="..." r="..." fill="#ffffff" opacity="0.9"/>
<!-- Bold number on top -->
<text ... fontSize="larger" fontWeight="bold">5</text>
```

## Technical Details

### SVG Number Display
```typescript
// Display plate number (index + 1) instead of name
const plateNumber = idx + 1;

// White circle background for better visibility
<circle
  cx={plateX + plateWidth / 2}
  cy={plateY + plateHeight / 2}
  r={fontSize * 0.8}
  fill="#ffffff"
  opacity="0.9"
/>
<text
  x={plateX + plateWidth / 2}
  y={plateY + plateHeight / 2}
  textAnchor="middle"
  dominantBaseline="middle"
  fill="#000000"
  fontSize={fontSize * 1.2}
  fontWeight="bold"
  fontFamily="Arial, sans-serif"
>
  {plateNumber}
</text>
```

### Table Grouping Logic
```typescript
// Group plates by base name (remove -1, -2, -3 suffix)
const groupedPlates = new Map();
sheet.plates.forEach((plate, idx) => {
  // Extract base name (remove -1, -2, etc.)
  const baseName = plate.name ? plate.name.replace(/-\d+$/, '') : 'N/A';
  const key = `${baseName}_${thickness}_${width}_${height}`;
  
  if (!groupedPlates.has(key)) {
    groupedPlates.set(key, {
      baseName,
      quantity: 0,
      indices: []
    });
  }
  
  group.quantity += 1;
  group.indices.push(idx + 1);
});
```

### Number Range Display
```typescript
// Show range like "1-3" or single number "5"
{group.indices.length === 1 
  ? group.indices[0] 
  : `${group.indices[0]}-${group.indices[group.indices.length - 1]}`}
```

## Benefits

### Better Readability
- ✅ Numbers in SVG are much clearer than long plate names
- ✅ White circle background makes numbers stand out
- ✅ Easy to correlate SVG numbers with table rows

### Cleaner Table
- ✅ No repetitive rows for duplicate plates
- ✅ Quantity column shows actual count
- ✅ Total weight correctly calculated for grouped plates
- ✅ Easier to understand the cutting plan

### Consistent UX
- ✅ Similar to profile nesting display
- ✅ Professional appearance
- ✅ Reduced visual clutter

## Example Output

### SVG View
```
┌─────────────────────────────────────┐
│  ┌──┐  ┌────┐  ┌──┐                │
│  │①│  │ ② │  │③│                │
│  └──┘  └────┘  └──┘                │
│  ┌────────┐  ┌──┐  ┌──┐            │
│  │   ④   │  │⑤│  │⑥│            │
│  └────────┘  └──┘  └──┘            │
└─────────────────────────────────────┘
```

### Table Below SVG
```
#   | Plate Name | Thickness | Width | Length | Qty | Total Weight
----|------------|-----------|-------|--------|-----|-------------
1-3 | p1068      | 10mm      | 114   | 114    | 3   | 3.06 kg
4   | p1069      | 10mm      | 200   | 300    | 1   | 4.71 kg
5-6 | p1070      | 10mm      | 150   | 250    | 2   | 5.89 kg
```

Clear correlation: Number in SVG → Row in table!

## Files Modified

- ✅ `web/src/components/PlateNestingTab.tsx`
  - Removed rotation message (line ~1180)
  - Updated SVG text to show numbers with white circle background (lines ~1220-1280)
  - Added `#` column to table header
  - Implemented plate grouping logic in table body
  - Updated footer colspan for new column

## Status

✅ **Complete and Running**
- Frontend auto-reloaded with changes
- No linter errors
- Ready to test at http://localhost:5180

---

**Date:** 2026-01-29  
**Changes:** SVG number display + grouped duplicate plates in table  
**Impact:** Much cleaner and more professional plate nesting display

