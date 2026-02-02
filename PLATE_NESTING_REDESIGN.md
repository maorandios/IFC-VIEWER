# Plate Nesting Tab Redesign - Expandable View Structure

## Overview
Redesigned the Cutting Plans section in the Plate Nesting tab to use an expandable view structure similar to the Profile Nesting display, with improved data organization and grayscale SVG visualization.

## Changes Implemented

### 1. ✅ Expandable Stock Plate Groups
**New Structure:**
- Stock plates are now grouped by size and thickness
- Each group is collapsible/expandable with a header showing:
  - **Stock Plate Size**: e.g., "1000 × 2000 mm"
  - **Quantity**: Number of sheets of this size/thickness

**Benefits:**
- Better organization when multiple stock sizes are used
- Easy to see at a glance how many sheets of each size are needed
- Similar UX to the Profile Nesting tab

### 2. ✅ Sheet-Level Details Header
Each individual sheet within a stock group now displays comprehensive metrics:

| Column | Description |
|--------|-------------|
| **Sheet #** | Sequential sheet number |
| **Size** | Width × Length in mm |
| **Thickness** | Plate thickness |
| **Plates** | Number of plates nested on this sheet |
| **Plates Weight** | Total weight of nested plates (kg) |
| **Utilization** | Percentage of sheet area used |
| **Waste (m²)** | Unused area in square meters |
| **Waste (kg)** | Weight of wasted material |

**Formula Used:**
```javascript
Waste kg = (Stock Volume - Used Volume) × Steel Density
Steel Density = 0.00000785 kg/mm³
```

### 3. ✅ Grayscale SVG Visualization
**Color Scheme Changed:**
- **Before**: Colorful plates (blue, green, orange, red, purple, pink)
- **After**: Grayscale gradient (dark gray to light gray)

**New Grayscale Palette:**
```javascript
['#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db']
// Dark gray → Medium gray → Light gray
```

**Visual Improvements:**
- Stock plate background: `#e5e7eb` (light gray)
- Plate borders: `#000000` (black) for clarity
- Fill opacity: `0.5` for better contrast
- Clean, professional appearance suitable for technical drawings

### 4. ✅ Clean Plate Names in SVG
**Name Cleaning Function:**
```javascript
const cleanPlateName = (name: string) => {
  // Remove special characters and extra spaces
  return name.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();
}
```

**Improvements:**
- Removed special characters (e.g., `*`, `#`, `@`, etc.)
- Consolidated multiple spaces into single spaces
- Trimmed leading/trailing whitespace
- Names are now cleaner and more readable in the SVG
- Font: Arial, sans-serif with font-weight 600

### 5. ✅ Detailed Plates Table
**New table for each sheet showing:**

| Column | Description |
|--------|-------------|
| **Plate Name** | Clean plate identifier |
| **Thickness** | Plate thickness |
| **Width (mm)** | Plate width |
| **Length (mm)** | Plate length (height in SVG) |
| **m²** | Plate area in square meters |
| **Weight (kg)** | Individual plate weight |
| **Qty** | Quantity (always 1 per entry) |
| **Total Weight (kg)** | Total weight for this plate |

**Footer Row:**
- Shows totals for area, quantity, and total weight
- Makes it easy to verify the sheet metrics

## Technical Implementation

### New State Management
```typescript
const [expandedStockGroups, setExpandedStockGroups] = useState<Set<string>>(new Set())
```

### New Helper Function
```typescript
groupCuttingPlansByStock(): 
  - Groups cutting plans by stock size and thickness
  - Calculates waste metrics for each sheet
  - Returns organized structure for rendering
```

### File Modified
- `web/src/components/PlateNestingTab.tsx`

## Visual Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Cutting Plans                                                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ ▼ Stock Plate: 1000 × 2000 mm                    Quantity: 3│
│   Thickness: 10mm                                             │
│   ┌───────────────────────────────────────────────────────┐ │
│   │ Sheet #1 | 1000×2000 | 10mm | 12 plates | 85% | ...   │ │
│   ├───────────────────────────────────────────────────────┤ │
│   │ [SVG Visualization - Grayscale]                        │ │
│   ├───────────────────────────────────────────────────────┤ │
│   │ Plates Table: Name | Thickness | Width | Length | ...  │ │
│   │ p1068  | 10mm | 114.0 | 114.0 | 0.0130 | 1.02 | 1 |.. │ │
│   │ ...                                                     │ │
│   └───────────────────────────────────────────────────────┘ │
│   ┌───────────────────────────────────────────────────────┐ │
│   │ Sheet #2 | 1000×2000 | 10mm | 15 plates | 90% | ...   │ │
│   │ ...                                                     │ │
│   └───────────────────────────────────────────────────────┘ │
│                                                               │
│ ▶ Stock Plate: 1250 × 2500 mm                    Quantity: 2│
│   Thickness: 12mm                                             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Benefits

### User Experience
- ✅ **Better Organization**: Stock plates grouped logically
- ✅ **More Information**: Waste metrics prominently displayed
- ✅ **Professional Look**: Grayscale SVG suitable for technical documentation
- ✅ **Cleaner Display**: Plate names without special characters
- ✅ **Complete Data**: Detailed table shows all plate information
- ✅ **Similar UX**: Consistent with Profile Nesting tab

### Data Clarity
- ✅ Easy to see waste per sheet
- ✅ Clear weight calculations
- ✅ Material utilization metrics visible
- ✅ Quick identification of stock requirements

## Usage

1. Navigate to **Plate Nesting** tab
2. Select plates and configure stock
3. Generate nesting plan
4. In the **Cutting Plans** section:
   - Click on a stock group header to expand/collapse
   - View sheet-level metrics in the header
   - See grayscale SVG visualization
   - Review detailed plates table below each sheet

## Status

✅ All changes implemented and linter-clean  
✅ Backend still running on port 8000  
✅ Frontend auto-reloading on port 5180

---

**Date:** 2026-01-29  
**Component:** PlateNestingTab.tsx  
**Type:** UI/UX Redesign  
**Impact:** Cutting Plans section restructured with expandable groups


