# Plate Nesting Number Display Improvements

## Changes Implemented

### 1. ✅ Clearer Numbers in SVG (No White Background)
**Before:**
- Numbers with white circle background
- Smaller font size
- Less visible

**After:**
- **Larger font:** `fontSize * 2` (doubled size)
- **White fill with black stroke:** Creates clear outline effect
- **`paintOrder="stroke"`:** Stroke drawn first, then fill on top
- **Bold font:** Maximum readability
- **No background circle:** Cleaner, simpler appearance

```typescript
<text
  fill="#ffffff"           // White text
  stroke="#000000"         // Black outline
  strokeWidth={fontSize * 0.1}  // Thin outline
  paintOrder="stroke"      // Stroke first, then fill
  fontSize={fontSize * 2}  // Double size!
  fontWeight="bold"
>
  {plateRowNumber}
</text>
```

### 2. ✅ Sequential Row Numbering (1, 2, 3, 4...)
**Before:**
```
# Column showed ranges:
1-3   | p1001 (grouped 3 plates)
4-6   | p1068 (grouped 3 plates)
7     | p1069 (single plate)
```

**After:**
```
# Column shows sequential numbers:
1 | p1001 (qty: 3)
2 | p1068 (qty: 3)
3 | p1069 (qty: 1)
```

### 3. ✅ Perfect SVG ↔ Table Correlation
**The numbers in the SVG now match the row numbers in the table!**

**SVG Display:**
```
┌────────────────────────────┐
│  ┌──┐  ┌──┐  ┌──┐          │
│  │1│  │1│  │1│  ← All show "1"
│  └──┘  └──┘  └──┘          │
│  ┌────┐  ┌────┐            │
│  │ 2 │  │ 2 │    ← All show "2"
│  └────┘  └────┘            │
│  ┌──┐                      │
│  │3│        ← Shows "3"    │
│  └──┘                      │
└────────────────────────────┘
```

**Table Below:**
```
# | Plate Name | ... | Qty
--|------------|-----|----
1 | p1001      | ... | 3    ← Plates showing "1" in SVG
2 | p1068      | ... | 2    ← Plates showing "2" in SVG
3 | p1069      | ... | 1    ← Plates showing "3" in SVG
```

Perfect match! Each number in the SVG corresponds to exactly one row in the table.

## Technical Implementation

### SVG Number Calculation
```typescript
// Calculate which table row this plate belongs to
let plateRowNumber = 1;
const seenKeys = new Set();

for (let i = 0; i <= idx; i++) {
  const p = plan.plates[i];
  const bn = p.name ? p.name.replace(/-\d+$/, '') : 'N/A';
  const k = `${bn}_${p.thickness}_${p.width}_${p.height}`;
  
  if (!seenKeys.has(k)) {
    if (k === key) {
      break;  // Found our row!
    }
    seenKeys.add(k);
    plateRowNumber++;
  }
}
```

**Logic:**
- Groups plates by base name (removes `-1`, `-2` suffix)
- Counts unique groups encountered up to current plate
- Returns the row number for display

### Table Row Numbering
```typescript
let rowNumber = 1;
const rows = [];

for (const group of groupedPlates.values()) {
  rows.push(
    <tr key={rowNumber}>
      <td>{rowNumber}</td>  // Simple sequential number
      <td>{group.baseName}</td>
      <td>{group.quantity}</td>  // Shows how many
      ...
    </tr>
  );
  rowNumber++;
}
```

## Visual Improvements

### Text Rendering
- **Font Size:** 2x larger than before
- **White fill + Black stroke:** Maximum contrast
- **Paint order:** Stroke rendered first for clean outline
- **No background:** Cleaner, professional look

### Example
```
Before: Small "1" in white circle (hard to see on light gray)
After:  Large bold "1" with black outline (crystal clear!)
```

## Benefits

### ✅ Better Readability
- Numbers are much larger and easier to see
- Black outline ensures visibility on any background color
- No distracting background shapes

### ✅ Simple Numbering
- Sequential: 1, 2, 3, 4... (not 1-3, 4-6, etc.)
- Easy to understand
- Direct correlation between SVG and table

### ✅ Clear Correlation
- See number "2" in SVG → Look at row #2 in table
- No mental math required
- Instant reference

## Files Modified

- ✅ `web/src/components/PlateNestingTab.tsx`
  - Removed white circle background
  - Increased font size to `fontSize * 2`
  - Added white fill with black stroke for clarity
  - Implemented row number calculation for SVG
  - Changed table to use sequential numbering (1, 2, 3...)
  - Numbers in SVG now match table row numbers

## Status

✅ **Complete and Live**
- Frontend auto-reloaded
- No linter errors
- Ready to test at http://localhost:5180

---

**Date:** 2026-01-29  
**Changes:** Clearer SVG numbers + sequential table numbering  
**Impact:** Much better readability and perfect SVG-table correlation


