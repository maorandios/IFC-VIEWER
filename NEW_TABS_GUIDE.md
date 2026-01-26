# New Tabs User Guide

## Overview
The application now has three dedicated tabs for viewing detailed data about profiles, plates, and assemblies. Each tab includes powerful search and filter capabilities.

---

## 📊 Dashboard Tab
**What it shows**: High-level overview of the entire project

### Cards Displayed
1. **Total Tonnage** - Overall weight in tonnes
2. **Profiles Tonnage** - Weight of all profile elements
3. **Plates Tonnage** - Weight of all plate elements
4. **Quantity of Assemblies** - Total number of assemblies
5. **Quantity of Single Parts** - Total individual parts count

### Purpose
Quick overview and project metrics at a glance.

---

## 📏 Profiles Tab
**What it shows**: All profile elements (beams, columns, members)

### Search & Filter Options
- **Free Text Search**: Search across part names, profile names, assemblies, lengths, weights
- **Profile Name Filter**: Filter by specific profile types (HEA200, IPE300, etc.)
- **Assembly Filter**: Filter by specific assembly names

### Table Columns
- Part Name
- Assembly
- Profile Name
- Length (mm)
- Weight (kg)
- Quantity (grouped duplicates)
- Total Weight (kg)
- Preview (3D button)

### Features
- Click any column header to sort
- Click "View 3D" to preview individual profile
- Footer shows totals for filtered results
- Result counter: "Showing X of Y profiles"
- "Clear All" button to reset filters

---

## 📋 Plates Tab
**What it shows**: All plate elements

### Search & Filter Options
- **Free Text Search**: Search across part names, thickness, profile names, assemblies, dimensions
- **Thickness Filter**: Filter by specific thickness values
- **Assembly Filter**: Filter by specific assembly names

### Table Columns
- Plate Name
- Assembly
- Thickness
- Profile Name
- Width (mm)
- Length (mm)
- Weight (kg)
- Quantity (grouped duplicates)
- Total Weight (kg)
- Preview (3D button)

### Features
- Click any column header to sort
- Click "View 3D" to preview individual plate
- Footer shows totals for filtered results
- Result counter: "Showing X of Y plates"
- "Clear All" button to reset filters

---

## 🏗️ Assemblies Tab
**What it shows**: All assemblies with expandable component details

### Search & Filter Options
- **Free Text Search**: Search across assembly marks, profiles, lengths, weights
- **Main Profile Filter**: Filter by main profile type
- **Assembly Name Filter**: Filter by specific assembly names

### Assembly Card Layout
Each assembly shows:
- **Assembly Mark** (e.g., B72, C24)
- **Main Profile** (primary structural element)
- **Length** (overall assembly length in mm)
- **Total Weight** (in kg)
- **Component Count** (X members, Y plates)
- **View 3D Button** (preview entire assembly)

### Expandable Details
Click on any assembly to expand and see:
- **Part Name** - Individual component names
- **Type** - Profile or Plate
- **Profile Name** - Structural profile designation
- **Thickness** - For plates only
- **Length** - Component length in mm
- **Weight** - Individual component weight in kg
- **Quantity** - Number of identical parts (auto-grouped)

### Features
- Click assembly header to expand/collapse
- Parts with identical properties are automatically grouped
- Click "View 3D" to preview entire assembly in 3D viewer
- Result counter: "Showing X of Y assemblies"
- "Clear All" button to reset filters

---

## Common Features Across All Tabs

### Search
- Type in the search box to filter results in real-time
- Search looks across ALL fields in the table
- Case-insensitive matching
- Clear search with the ✕ button

### Filters
- Use dropdowns to filter by specific properties
- Filters combine with search (AND logic)
- "All" option shows everything
- Filters update instantly

### Clear All Button
- Resets all filters and search
- Returns to showing all data
- Located in top-right of filter section

### Result Counter
Every tab shows: "Showing X of Y [items]"
- X = number of items matching current filters
- Y = total number of items in the file

### 3D Preview
- Click "View 3D" on any row/assembly
- Opens modal with 3D viewer
- Shows only selected element(s)
- Can rotate, zoom, pan
- Close with ✕ button

### Loading States
- Spinner shown while data loads
- "Loading profiles/plates/assemblies..." message
- Automatic retry on error

---

## Tips for Best Use

### Finding Specific Items
1. Start with **search** for quick text matching
2. Add **filters** to narrow by type/assembly
3. Use **Clear All** to start over

### Viewing Components
1. Go to **Assemblies** tab
2. Use filters to find your assembly
3. Click to **expand** and see all parts
4. Parts are auto-grouped by identical properties

### Checking Weights
1. Apply your filters/search
2. Look at **footer totals** (updates automatically)
3. Shows both count and total weight

### Comparing Profile Types
1. Go to **Profiles** tab
2. Use **Profile Name** filter dropdown
3. See all profiles of that type
4. Check quantities and weights in footer

### Finding Heavy Plates
1. Go to **Plates** tab
2. Use **Thickness** filter for thick plates
3. Sort by weight (click column header)
4. Check totals in footer

---

## Performance Notes

- Each tab loads data independently
- First load may take a moment
- Subsequent views are cached
- Filters run client-side (instant)
- 3D previews load on demand

---

## Troubleshooting

### "No data available"
- Make sure an IFC file is uploaded
- Check that steel report was generated
- Try reloading the file

### Filters not working
- Check if search box has text (clear it)
- Click "Clear All" to reset
- Refresh the page

### 3D preview not loading
- Check browser console for errors
- Make sure file is still uploaded
- Try closing and reopening preview

---

## Navigation Flow

Recommended workflow:
1. **Model Tab** → Upload IFC file
2. **Dashboard Tab** → Check overall metrics
3. **Profiles/Plates/Assemblies Tabs** → Dive into details
4. **Nesting Tab** → Plan cutting
5. **Shipment Tab** → Organize shipping
6. **Management Tab** → Track production

Each tab is independent - jump to any tab as needed!

