# Plate Nesting Multi-Step Form Update

**Date:** 2026-01-27  
**Update:** Redesigned as multi-step workflow matching Profile Nesting pattern

## Overview
The Plate Nesting tab has been completely redesigned to follow the same multi-step form pattern as the Profile Nesting feature, providing a cleaner and more intuitive user experience.

## Multi-Step Workflow

### Step 1: Select Plates
- Users select which plates they want to nest
- Table displays all available plates from the IFC model
- Checkboxes for individual selection
- Select All / Deselect All functionality
- Search and filter by thickness
- Real-time selection counter
- Shows total pieces selected
- All plates auto-selected by default

### Step 2: Configure Stock
- Users define available stock plate sizes
- Default stock sizes: **1000×2000mm**, **1250×2500mm**, **1500×3000mm**
- Add up to 5 different stock sizes
- Edit dimensions (width × length in mm)
- Remove unwanted sizes
- Summary shows selection overview

### Step 3: Nesting Report
- Displays optimization results
- Statistics cards (Total Plates, Stock Sheets, Utilization, Waste)
- Bill of Materials (BOM) table
- Visual cutting plans with SVG diagrams
- Switch between different stock sheets
- Color-coded plates by thickness
- Export to PDF functionality

## UI/UX Improvements

### Step Navigation Header
- Clear step indicators at the top
- Active step highlighted in blue
- Inactive steps shown in gray
- Arrow indicators between steps
- Progress tracking at a glance

### Navigation Buttons
- **Back Button**: Navigate to previous step
- **Next Button**: Proceed to next step (disabled if no plates selected)
- **Reset Button**: Start over from scratch
- **Export PDF**: Download report (available in results step)

### Consistent Design
- Matches Profile Nesting tab styling
- Same color scheme and button styles
- Consistent spacing and typography
- Responsive layout for all screen sizes

## Default Stock Plates
Changed from previous defaults to:
1. **Stock 1**: 1000mm × 2000mm
2. **Stock 2**: 1250mm × 2500mm
3. **Stock 3**: 1500mm × 3000mm

These are standard industry sizes commonly available for purchase.

## Key Features

### Smart Workflow
- Can't proceed without selecting plates
- Validation at each step
- Error messages displayed clearly
- Loading states during processing
- Back navigation preserves selections

### Data Persistence
- Selections maintained when navigating back
- Stock configuration preserved
- Results kept until reset

### Reset Functionality
- Clears all selections
- Resets stock plates to defaults
- Returns to Step 1
- Clears any errors
- Fresh start with one click

## Technical Implementation

### State Management
```typescript
type Step = 'selectPlates' | 'configureStock' | 'results'
const [currentStep, setCurrentStep] = useState<Step>('selectPlates')
```

### Step Navigation
- `handleNext()` - Validates and moves forward
- `handleBack()` - Returns to previous step
- `handleReset()` - Clears everything and starts over

### Step-Specific Content
- Conditional rendering based on `currentStep`
- Each step has its own dedicated UI
- Clean separation of concerns

## User Flow

1. **Start** → User opens Plate Nesting tab
2. **Step 1** → Select plates from table (filtered/searched as needed)
3. **Click "Next"** → Validates selection (must have at least 1 plate)
4. **Step 2** → Configure stock sizes (add/edit/remove)
5. **Click "Generate Nesting"** → Calls API with selections
6. **Step 3** → View results with statistics, BOM, and visual plans
7. **Export PDF** → (Optional) Download complete report
8. **Back/Reset** → Navigate or start fresh

## Benefits of Multi-Step Design

✅ **Clearer User Journey** - Users know exactly where they are in the process  
✅ **Reduced Cognitive Load** - Focus on one task at a time  
✅ **Better Validation** - Check requirements at each step  
✅ **Improved Error Handling** - Errors shown at relevant step  
✅ **Professional Look** - Matches industry-standard wizard patterns  
✅ **Consistency** - Same pattern as Profile Nesting  
✅ **Mobile Friendly** - Steps work well on smaller screens  

## Files Modified
- `web/src/components/PlateNestingTab.tsx` - Complete rewrite with multi-step pattern

## Servers Running
- **Frontend:** http://localhost:5180
- **Backend:** http://localhost:8000

## Testing Instructions

1. Navigate to http://localhost:5180
2. Upload an IFC file with plates
3. Go to "Plate Nesting" tab
4. **Step 1**: Verify plate selection table appears
   - Test Select All / Deselect All
   - Test search and filters
   - Test individual checkbox selection
5. **Step 2**: Click "Next: Configure Stock"
   - Verify default stock sizes (1000×2000, 1250×2500, 1500×3000)
   - Test adding new stock size
   - Test editing dimensions
   - Test removing stock size
6. **Step 3**: Click "Generate Nesting Plan"
   - Wait for processing
   - Verify results display with statistics
   - Check BOM table
   - View cutting plans visualization
   - Switch between different sheets
   - Test PDF export
7. **Navigation**: Test Back and Reset buttons throughout

## Comparison with Previous Version

### Before (Single Page)
- All steps visible at once
- Confusing layout with multiple sections
- No clear workflow
- Hard to validate inputs

### After (Multi-Step Form)
- ✨ One step at a time
- ✨ Clear step indicators
- ✨ Guided workflow
- ✨ Validation at each step
- ✨ Better UX overall

## Next Steps (Optional Enhancements)
- Save/load stock configurations
- Remember last used settings
- Add rotation support in nesting
- Export cutting plans as DXF/SVG
- Manual adjustment of plate placement
- Cost calculations based on material prices


