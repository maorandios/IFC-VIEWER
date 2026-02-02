# Web-IFC Enhanced Viewer Features

## Overview

The web-ifc viewer has been enhanced with all the essential features from the GLTF viewer, providing a complete viewing experience with faster loading times.

## New File

**`web/src/components/IFCViewerWebIFC_Enhanced.tsx`**
- Enhanced version of the web-ifc viewer with full feature parity to GLTF viewer
- Replaces the basic `IFCViewerWebIFC.tsx` component

## Features Implemented

### ✅ 1. Selection System
- **Parts Mode**: Click to select individual parts
- **Assemblies Mode**: Click to select entire assemblies
- Visual feedback with green highlight on selected elements
- Selection state tracked for other operations

### ✅ 2. Measurement Tool
- **📏 Measure Button**: Toggle measurement mode on/off
- Click two points on the model to measure distance
- Displays distance in millimeters with arrow visualization
- Red dots mark measurement points
- Blue arrows show measurement direction and length
- **🗑️ Clear Measurements Button**: Remove all measurements
- Support for multiple measurements simultaneously
- Labels automatically positioned in 3D space

### ✅ 3. Visibility Controls
All buttons work with current selection (parts or assemblies):

- **Transparent**: Make selected elements semi-transparent (20% opacity)
- **Hide**: Hide selected elements completely
- **Hide All Except**: Hide everything except selected elements
- **Show All**: Restore all elements to visible with original materials

### ✅ 4. Screenshot Functionality
- **💾 Save**: Save current view as PNG file
  - Automatically names file with timestamp
  - Downloads directly to user's computer
  
- **📋 Copy**: Copy screenshot to clipboard
  - Can be pasted directly into other applications
  - Uses modern Clipboard API

### ✅ 5. Control Panel UI
Clean, modern control panel in top-left corner with:
- Selection mode toggles (Parts/Assemblies)
- Measurement tools
- Screenshot buttons
- Visibility controls
- Consistent styling with GLTF viewer
- Disabled state for buttons that require selection

### ✅ 6. Status Indicators
Bottom-left info badges show:
- "web-ifc viewer (enhanced)" badge
- Mesh count (e.g., "150 meshes loaded")
- Measurement mode indicator (pulsing when active)
- Selection count (e.g., "5 selected")

## Features NOT Implemented (Out of Scope)

### ❌ Markup Tools
- Pencil, arrow, cloud, text annotations
- Reason: Complex canvas overlay system, rarely used feature
- Can be added later if needed

### ❌ Clipping Planes
- Section plane controls for cutting through model
- Reason: Complex 3D math and UI, less frequently used
- Can be added later if needed

## Technical Implementation

### Key Changes from Basic web-ifc Viewer

1. **Selection System**
   - Added raycaster for mouse picking
   - Track selected meshes and product IDs
   - Support for assembly-based selection using `assembly_id`
   - Visual feedback with emissive materials

2. **Measurement Tool**
   - Two-point measurement system
   - Three.js ArrowHelper for visualization
   - HTML labels positioned in 3D space
   - Store multiple measurements

3. **Material Management**
   - Store original materials in `userData.originalMaterial`
   - Support for transparency and visibility toggling
   - Proper material cloning to avoid shared state

4. **Screenshot Capture**
   - Uses `preserveDrawingBuffer: true` on WebGLRenderer
   - Converts canvas to data URL for saving/copying
   - Modern Clipboard API for copy functionality

### Integration with App.tsx

Updated `App.tsx` to:
- Import `IFCViewerWebIFC_Enhanced` instead of `IFCViewerWebIFC`
- Pass `enableMeasurement={true}` and `enableClipping={false}` props
- Maintains same toggle system for switching between GLTF and web-ifc viewers

## Usage

1. **Toggle to web-ifc mode** using the GLTF ⟷ web-ifc switch in the header
2. **Model loads with correct colors and positions** (from previous fixes)
3. **Use Parts/Assemblies toggle** to switch selection modes
4. **Click elements** to select them (green highlight)
5. **Use toolbar buttons** to:
   - Measure distances
   - Hide/show/make transparent
   - Capture screenshots

## Benefits

- ✅ **Fast Loading**: No GLTF conversion required
- ✅ **Accurate Geometry**: Direct IFC geometry with correct colors
- ✅ **Full Features**: Measurement, selection, visibility control
- ✅ **Clean UI**: Same look and feel as GLTF viewer
- ✅ **Easy Screenshots**: Save and copy functionality built-in

## Testing Checklist

- [x] Parts selection works
- [x] Assembly selection works
- [x] Measurement tool creates arrows and labels
- [x] Clear measurements removes all measurements
- [x] Transparent button works
- [x] Hide button works
- [x] Hide All Except works
- [x] Show All restores everything
- [x] Save screenshot downloads PNG
- [x] Copy screenshot to clipboard works
- [x] Info badges update correctly
- [x] Buttons disable when no selection

## Future Enhancements (Optional)

If needed, these can be added later:
- Context menu with element info (right-click)
- Markup tools (pencil, arrow, cloud, text)
- Clipping planes for section views
- Filter integration (profile types, plate thickness, assembly marks)
- Element property display panel

