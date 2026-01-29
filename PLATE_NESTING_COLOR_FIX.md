# Plate Nesting Color Differentiation Fix

## Issue
The grayscale color differentiation for plates in the SVG visualization was not working correctly. Despite having 8 unique plates in a sheet, only 2 colors were being displayed. This was due to hash collisions in the color assignment algorithm.

## Root Cause
The previous implementation used a simple hash function on the plate name:
```typescript
const hash = baseName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
return grayscaleColors[hash % grayscaleColors.length];
```

This caused multiple different plate names to hash to the same value modulo the number of colors, resulting in duplicate colors for different plates.

## Solution
Replaced the hash-based color assignment with a deterministic row-based color assignment:

1. **Created a color mapping system**: During the plate grouping phase, each unique plate group (identified by `baseName_thickness_width_height`) is assigned a sequential row number.

2. **Assigned colors based on row numbers**: Each row number maps directly to a grayscale color from a predefined palette, ensuring that:
   - Row 1 → Color 1 (`#e0e0e0`)
   - Row 2 → Color 2 (`#c0c0c0`)
   - Row 3 → Color 3 (`#a0a0a0`)
   - ... and so on

3. **Expanded color palette**: Defined 16 distinct grayscale colors to support more unique plates per sheet:
   ```typescript
   const grayscaleColors = [
     '#e0e0e0', // Very light gray (1)
     '#c0c0c0', // Light gray (2)
     '#a0a0a0', // Medium light gray (3)
     '#909090', // Medium gray (4)
     '#707070', // Medium dark gray (5)
     '#606060', // Dark gray (6)
     '#505050', // Darker gray (7)
     '#404040', // Very dark gray (8)
     '#d5d5d5', // Alt light 1
     '#b5b5b5', // Alt light 2
     '#959595', // Alt medium 1
     '#858585', // Alt medium 2
     '#757575', // Alt dark 1
     '#656565', // Alt dark 2
     '#555555', // Alt darker 1
     '#454545', // Alt darker 2
   ];
   ```

## Implementation Details

### File Modified
- `c:\IFC2026\web\src\components\PlateNestingTab.tsx`

### Key Changes

1. **Enhanced mapping creation** (lines ~1212-1249):
   - Added `plateToColorMap` to store color assignments
   - Assign colors sequentially based on row numbers
   - Ensured consistency between row numbers and colors

2. **Direct color calculation** (lines ~1280-1287):
   - Calculate `plateRowNumber` for each plate instance
   - Use row number to directly index into the grayscale color array
   - Removed dependency on hash functions

3. **Removed old color function**:
   - Removed `getColorForPlateName()` function as it's no longer needed
   - Colors are now calculated inline based on row numbers

## Benefits

1. **Guaranteed uniqueness**: Each unique plate type gets a different color (up to 16 unique types per sheet)
2. **Consistency**: All instances of the same plate (e.g., p1001-1, p1001-2) have the same color
3. **Visual correlation**: The color in the SVG directly corresponds to the row number in the table below
4. **No collisions**: Sequential assignment eliminates hash collision issues
5. **Predictability**: Colors are assigned deterministically in the order plates appear

## Testing
After refreshing the browser, the plate nesting visualization should now display:
- 8 unique plates with 8 different grayscale colors
- All instances of the same plate (e.g., multiple copies) in the same color
- Clear visual differentiation between different plate types

## Date
2026-01-29

