# Plate Nesting Multi-Step - Quick Start Guide

## ✅ Ready to Use!

**Frontend:** http://localhost:5180  
**Backend:** http://localhost:8000

---

## 🎯 New Multi-Step Workflow

The Plate Nesting tab now works like the Profile Nesting tab with a clear 3-step process:

```
┌─────────────────────────────────────────────────────────┐
│  Step 1          Step 2              Step 3             │
│  Select Plates → Stock Configuration → Nesting Report   │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Step-by-Step Instructions

### **STEP 1: SELECT PLATES** 🔲

What you see:
- Table with all plates from your IFC model
- Checkboxes to select which plates to nest
- Search and filter options
- Selection counter

What to do:
1. Review the plates table
2. **Deselect** any plates you don't want to nest (all are selected by default)
3. Use **Search** to find specific plates
4. Use **Thickness Filter** to narrow down options
5. Click **"Next: Configure Stock →"** button

✅ Tip: Click on a table row to toggle selection

---

### **STEP 2: CONFIGURE STOCK** 📐

What you see:
- Default stock sizes already configured:
  - Stock 1: **1000mm × 2000mm**
  - Stock 2: **1250mm × 2500mm**
  - Stock 3: **1500mm × 3000mm**

What to do:
1. Review the default stock sizes
2. **Edit** dimensions if needed (click in the input fields)
3. **Add** more stock sizes if needed (up to 5 total)
4. **Remove** unwanted stock sizes
5. Click **"Generate Nesting Plan →"** button

✅ Tip: Use standard sizes you can actually purchase from suppliers

---

### **STEP 3: NESTING REPORT** 📊

What you see:
- **Statistics Cards**: Total plates, stock sheets used, utilization %, waste %
- **BOM Table**: Bill of materials with quantities and areas
- **Cutting Plans**: Visual SVG diagrams showing plate placement
- **Sheet Selector**: Switch between different stock sheets

What to do:
1. Review the statistics (higher utilization = better efficiency)
2. Check the BOM for material ordering
3. View each cutting plan visualization
4. Click **"📥 Export PDF"** to download the complete report
5. Click **"← Back"** to adjust stock sizes
6. Click **"🔄 Reset"** to start completely fresh

✅ Tip: Different colors represent different plate thicknesses

---

## 🎨 Visual Guide

### Header (Always Visible)
```
┌─────────────────────────────────────────────────────┐
│ Plate Nesting Optimization                          │
│                                                      │
│ [Step 1: Select Plates] → [Step 2: ...] → [Step 3: ...]│
│   (Blue = Current Step, Gray = Other Steps)         │
│                                                      │
│                     [← Back] [📥 Export] [🔄 Reset] │
└─────────────────────────────────────────────────────┘
```

### Step 1 Layout
```
┌─────────────────────────────────────────────────────┐
│ Select Plates to Nest                               │
│                                                      │
│ [Search] [Thickness Filter]                         │
│ X selected of Y plates (Z pieces)  [Select All]     │
│                                                      │
│ ☑️ Checkbox | Plate Name | Assembly | ...           │
│ ☑️ Checkbox | Plate Name | Assembly | ...           │
│ ☐ Checkbox | Plate Name | Assembly | ...           │
│                                                      │
│                         [Next: Configure Stock →]   │
└─────────────────────────────────────────────────────┘
```

### Step 2 Layout
```
┌─────────────────────────────────────────────────────┐
│ Configure Stock Plates                              │
│                                              [+ Add] │
│                                                      │
│ Stock 1:  [1000] × [2000] mm        [Remove]       │
│ Stock 2:  [1250] × [2500] mm        [Remove]       │
│ Stock 3:  [1500] × [3000] mm        [Remove]       │
│                                                      │
│ Summary:                                            │
│ • X plate types selected                            │
│ • Y stock sizes configured                          │
│                                                      │
│ [← Back to Selection]  [Generate Nesting Plan →]   │
└─────────────────────────────────────────────────────┘
```

### Step 3 Layout
```
┌─────────────────────────────────────────────────────┐
│ Nesting Results                                     │
│                                                      │
│ [Total Plates] [Stock Sheets] [Utilization] [Waste]│
│      150           12            87.5%        12.5% │
│                                                      │
│ Bill of Materials (BOM)                             │
│ | Dimensions | Thickness | Qty | Area |            │
│ | 500 × 300  | 10mm     | 45  | 6.75m² |           │
│                                                      │
│ Cutting Plans                                       │
│ [Sheet 1] [Sheet 2] [Sheet 3] ...                  │
│                                                      │
│ ┌─────────────────────────────┐                    │
│ │ [Colored rectangles showing  │                    │
│ │  plate placement on stock]   │                    │
│ └─────────────────────────────┘                    │
│                                                      │
│ Plates in this sheet: [colored badges]              │
└─────────────────────────────────────────────────────┘
```

---

## 🔧 Button Guide

| Button | Where | What It Does |
|--------|-------|--------------|
| **Next: Configure Stock →** | Step 1 | Moves to stock configuration (requires ≥1 plate selected) |
| **← Back to Selection** | Step 2 | Returns to plate selection (keeps selections) |
| **Generate Nesting Plan →** | Step 2 | Runs optimization algorithm and shows results |
| **← Back** | Step 3 | Returns to stock configuration |
| **📥 Export PDF** | Step 3 | Downloads complete nesting report |
| **🔄 Reset** | Any Step | Clears everything and starts over |
| **Select All** / **Deselect All** | Step 1 | Toggles all filtered plates |
| **Clear Filters** | Step 1 | Resets search and thickness filter |
| **+ Add Stock Size** | Step 2 | Adds a new stock plate configuration |
| **Remove** | Step 2 | Removes a stock plate size |

---

## ⚡ Quick Tips

1. **Start Fresh**: Click Reset to clear everything
2. **Save Time**: Most plates are auto-selected, just deselect unwanted ones
3. **Filter First**: Use thickness filter to focus on specific materials
4. **Stock Sizes Matter**: Use realistic sizes you can purchase
5. **Check Utilization**: Aim for >80% utilization for efficiency
6. **Compare Sheets**: Different stock sizes may give better results
7. **Export Results**: PDF includes everything you need for production

---

## 🚨 Common Issues

**"Please select at least one plate to nest"**
- Solution: Check at least one plate in Step 1

**Low utilization percentage (<60%)**
- Try adding larger stock sizes
- Select more plates to nest together
- Consider different stock dimensions

**No plates showing in table**
- Make sure your IFC file contains IfcPlate elements
- Check that the file is loaded correctly

**Nesting takes too long**
- Normal for large projects (100+ plates)
- Be patient, algorithm is working
- Consider selecting fewer plates

---

## 📱 Keyboard Shortcuts

- **Enter** (in search field): Apply search
- **Escape**: Clear search or close dialogs
- **Click table row**: Toggle plate selection
- **Space** (on checkbox): Toggle selection

---

## 🎉 What's New

✨ Multi-step wizard interface (like Profile Nesting)  
✨ Clear step navigation with progress indicators  
✨ Default stock sizes: 1000×2000, 1250×2500, 1500×3000  
✨ Better error handling and validation  
✨ Improved visual design and consistency  
✨ One task at a time = easier to use  

---

## 🆘 Need Help?

1. Click **Reset** to start over
2. Follow the steps in order (can't skip ahead)
3. Check selection counter to verify plates are selected
4. Review default stock sizes before generating
5. Adjust and regenerate if results aren't optimal

**Enjoy optimized plate nesting!** 🎯



