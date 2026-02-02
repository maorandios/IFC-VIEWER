# Plate Nesting - Quick Start Guide

## ✅ Application is Running!

- **Frontend:** http://localhost:5180
- **Backend:** http://localhost:8000

## 🚀 How to Use Plate Nesting

### Step-by-Step Instructions:

1. **Open the Application**
   - Navigate to: http://localhost:5180
   - Upload your IFC file (if not already loaded)

2. **Go to Plate Nesting Tab**
   - Click on the "Plate Nesting" tab in the navigation

3. **Select Plates to Nest (Step 1)**
   - You'll see a table with all plates from your model
   - All plates are selected by default
   - **Deselect** plates you don't want to nest by clicking the checkbox
   - Use **filters** to narrow down by thickness or search
   - Click **Select All / Deselect All** to quickly change selection

4. **Configure Stock Plates (Step 2)**
   - Default stock sizes are already configured:
     - Stock 1: 3000mm × 1500mm
     - Stock 2: 2500mm × 1250mm
   - **Add** more stock sizes (up to 5 total) by clicking "+ Add Stock Size"
   - **Edit** dimensions by typing in the input fields
   - **Remove** unwanted stock sizes

5. **Generate Nesting Plan (Step 3)**
   - Review the summary showing selected plates and stock sizes
   - Click **"Generate Nesting Plan"** button
   - Wait for the algorithm to run (may take a few seconds)

6. **Review Results**
   - **Statistics**: See utilization, waste, and material usage
   - **BOM**: Bill of materials with quantities and areas
   - **Cutting Plans**: Visual representation of how plates fit on stock
   - Switch between different stock sheets using the tabs

7. **Export to PDF (Optional)**
   - Click **"Export to PDF"** button to download the nesting plan
   - PDF includes all cutting plans, BOM, and statistics

## 💡 Tips:

- **Better Results**: Select similar thickness plates together for better nesting
- **Stock Sizes**: Configure stock sizes that match what you can actually purchase
- **Visual Review**: Use the SVG visualization to verify plate placement
- **Color Coding**: Different colors represent different thicknesses

## ⚠️ Troubleshooting:

**Problem:** No plates shown in table
- **Solution:** Make sure your IFC file is loaded and contains IfcPlate elements

**Problem:** Nesting fails or shows error
- **Solution:** Ensure at least one plate is selected and stock sizes are configured

**Problem:** Poor utilization percentage
- **Solution:** Try different stock plate sizes or select more plates to nest together

## 📊 Understanding Results:

- **Utilization %**: How much of the stock plate is used (higher is better)
- **Waste %**: How much material is wasted (lower is better)
- **Stock Sheets Used**: Number of stock plates needed
- **Nested Plates**: Number of plates successfully placed
- **Unnested Plates**: Plates that didn't fit (if any)

## 🎯 What Was Fixed:

1. ✅ Added plate selection table (missing in original)
2. ✅ Checkboxes to select which plates to nest
3. ✅ Fixed backend 500 error (installed rectpack library)
4. ✅ Clear 3-step workflow
5. ✅ Better error handling and user feedback
6. ✅ Filters and search functionality
7. ✅ Selection summary and counters

Enjoy your optimized plate nesting! 🎉



