# web-ifc Feature Guide

## Overview

A new **experimental web-ifc viewer** has been added to the application, allowing you to load and display IFC files natively in the browser without GLTF conversion.

## How to Use

### Accessing the Feature

1. **Upload an IFC file** (or use an existing one)
2. Navigate to the **Model** tab
3. Look for the **toggle switch** in the top-right corner
4. Toggle between:
   - **GLTF** (default, current production viewer)
   - **web-ifc** (experimental, native IFC loading)

### What's Different?

#### GLTF Viewer (Current/Default)
- ✅ Fully featured (measurement, clipping, filtering)
- ✅ Pre-converted geometry (fast rendering)
- ⚠️ Requires server-side conversion wait time
- ⚠️ Extra storage (IFC + GLB files)

#### web-ifc Viewer (Experimental)
- ✅ Native IFC loading (no conversion)
- ✅ Direct geometry from IFC file
- ✅ Faster initial load (no waiting for conversion)
- ✅ Same metadata from your API
- ⚠️ Basic features only (no measurement/clipping yet)
- ⚠️ Selection and filtering coming soon

## What to Test

### Geometry Quality Comparison

Compare the visual quality between both viewers:

1. **Plates with holes**: Check if bolt holes are displayed correctly
2. **Profile accuracy**: Verify I-beams, channels, HSS profiles
3. **Bolt geometry**: Check fasteners display properly
4. **Complex cuts**: Look at notched or coped members

### Performance

- Note the loading time difference
- Check smoothness of rotation/zoom
- Test with different file sizes

### Color Accuracy

- Compare element colors between viewers
- Check if fasteners are gold/brown
- Verify type-based colors (beams, plates, etc.)

## Technical Details

### Architecture

**GLTF Viewer:**
```
IFC File → Backend (Python/IfcOpenShell) → GLTF Conversion → Frontend (Three.js/GLTFLoader)
```

**web-ifc Viewer:**
```
IFC File → Frontend (WebAssembly/web-ifc) → Three.js Geometry
                ↓
         Backend API (metadata only)
```

### Metadata Loading

Both viewers use the same metadata source:
- `/api/assembly-mapping/{filename}` - Assembly marks, element types, profiles, thicknesses
- Product IDs are matched between geometry and metadata

### Geometry Settings

The web-ifc viewer uses:
- Native IFC geometry extraction
- Automatic vertex normal computation
- Type-based material colors
- Shadow casting enabled
- Double-sided rendering (for complex geometry)

## Current Limitations

The web-ifc viewer is **experimental** and currently lacks:

- ❌ Click selection (coming soon)
- ❌ Assembly grouping selection
- ❌ Measurement tool
- ❌ Clipping planes
- ❌ Filtering by type/assembly
- ❌ Edge lines (wireframe overlay)

These features will be added incrementally as we test and refine the web-ifc implementation.

## Troubleshooting

### "Failed to load IFC file"
- Check that the IFC file is valid
- Try switching back to GLTF viewer
- Check browser console for detailed errors

### Geometry looks wrong
- Some IFC files may have coordinate system issues
- Try refreshing and reloading the file
- Report specific issues with screenshots

### Slow loading
- Large IFC files (>50MB) may be slower with web-ifc
- Consider using GLTF viewer for very large models
- Check browser performance in DevTools

## Feedback

When testing the web-ifc viewer, note:

1. **Visual quality**: Is geometry clean and accurate?
2. **Loading speed**: Faster/slower than GLTF?
3. **Missing features**: What do you need most?
4. **Bugs**: Any rendering issues or errors?

## Next Steps

If web-ifc proves successful:

1. Add selection and filtering features
2. Implement measurement tools
3. Add edge line rendering
4. Make it the default viewer
5. Remove GLTF conversion (simplify architecture)

The goal is to have a **single, clean, fast IFC viewer** that displays native geometry without conversion overhead.

