# Geometry Refinement System - Implementation Guide

## Overview

The Geometry Refinement System provides **selective visual enhancement** of IFC elements in the 3D viewer by replacing inaccurate web-ifc geometry with high-quality server-side geometry for critical elements like plates and cut steel parts.

## Architecture

### Component Stack

```
┌─────────────────────────────────────────┐
│   FastIFCViewer (React Component)      │
│   - Initial fast load via web-ifc       │
│   - Triggers background refinement      │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   GeometryRefinementService (TS)       │
│   - Identifies elements needing refine  │
│   - Manages fetch/replace process       │
│   - Preserves mesh state & interaction  │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   Backend API Endpoint                  │
│   POST /api/refined-geometry/{filename} │
│   - Uses IfcOpenShell with GEOM         │
│   - Applies boolean operations          │
│   - Returns high-quality geometry       │
└─────────────────────────────────────────┘
```

## How It Works

### Phase 1: Fast Initial Load (Unchanged)

1. **User uploads IFC file**
2. **FastIFCViewer loads model using web-ifc WASM**
   - Loads in ~2-5 seconds (depending on model size)
   - All elements rendered with web-ifc geometry
   - User can immediately interact with model

### Phase 2: Background Refinement (New)

3. **GeometryRefinementService activates** after initial load completes
4. **Identifies elements** that need visual refinement:
   - `IfcPlate` - plates with holes, cutouts, and complex shapes
   - `IfcMember` with cut/notch/cope keywords - complex cut parts
   - Extensible via refinement rules

5. **Fetches high-quality geometry** from server in batches:
   - POST request with element IDs
   - Server uses IfcOpenShell with boolean operations enabled
   - Returns geometry as base64-encoded Float32Array/Uint32Array

6. **Seamlessly replaces meshes** in the scene:
   - Creates new THREE.Mesh with refined geometry
   - Preserves material, transformation, hierarchy
   - Preserves selection state and interaction
   - Updates internal mappings (expressID ↔ mesh)
   - Disposes old geometry to free memory

7. **User experience**:
   - No visible reload or scene reset
   - Camera position unchanged
   - Selection and hover continue to work
   - Refined elements now show accurate geometry

## Implementation Details

### Backend API: `/api/refined-geometry/{filename}`

**Request:**
```json
{
  "element_ids": [123, 456, 789]
}
```

**Response:**
```json
{
  "geometries": [
    {
      "element_id": 123,
      "element_type": "IfcPlate",
      "element_name": "Plate_P-1",
      "element_tag": "P-1",
      "vertices": "base64_encoded_float32array",
      "indices": "base64_encoded_uint32array",
      "vertex_count": 2456,
      "face_count": 1024
    }
  ],
  "count": 1
}
```

**IfcOpenShell Settings:**
- `USE_WORLD_COORDS`: True (consistent coordinate system)
- `WELD_VERTICES`: True (optimize geometry)
- `DISABLE_OPENING_SUBTRACTIONS`: False (apply boolean cuts)
- `APPLY_DEFAULT_MATERIALS`: True

### Frontend Service: `GeometryRefinementService`

**Key Methods:**

```typescript
// Identify elements that need refinement
identifyElementsNeedingRefinement(
  meshes: THREE.Mesh[],
  meshToExpressIdMap: Map<THREE.Mesh, number>,
  ifcApi: WebIFC.IfcAPI,
  modelId: number
): number[]

// Fetch refined geometry from server
fetchRefinedGeometry(
  elementIds: number[]
): Promise<RefinedGeometry[]>

// Replace mesh while preserving state
replaceMeshGeometry(
  oldMesh: THREE.Mesh,
  refinedGeom: RefinedGeometry,
  scene: THREE.Scene
): MeshRefinementResult

// Complete refinement workflow
refineGeometry(
  meshes: THREE.Mesh[],
  meshToExpressIdMap: Map<THREE.Mesh, number>,
  expressIdToMeshesMap: Map<number, THREE.Mesh[]>,
  ifcApi: WebIFC.IfcAPI,
  modelId: number,
  scene: THREE.Scene,
  onProgress?: (current: number, total: number) => void
): Promise<MeshRefinementResult[]>
```

## Refinement Rules

Rules determine which elements need refinement. They are prioritized (higher = refine first).

### Default Rules

```typescript
export const DEFAULT_REFINEMENT_RULES: RefinementRule[] = [
  {
    // IfcPlate - plates often have missing cuts and holes
    shouldRefine: (elementType: string) => 
      elementType === 'IFCPLATE',
    priority: 100
  },
  {
    // IfcMember with complex cuts
    shouldRefine: (elementType: string, _elementId: number, properties?: any) => {
      if (elementType !== 'IFCMEMBER') return false
      
      const name = properties?.name?.toLowerCase() || ''
      const tag = properties?.tag?.toLowerCase() || ''
      const text = name + ' ' + tag
      
      const complexKeywords = ['cut', 'notch', 'cope', 'chamfer', 'bevel', 'slot']
      return complexKeywords.some(keyword => text.includes(keyword))
    },
    priority: 80
  }
]
```

### Custom Rules

You can add custom rules by extending the array:

```typescript
const customRules = [
  ...DEFAULT_REFINEMENT_RULES,
  {
    shouldRefine: (elementType, elementId, properties) => {
      // Custom logic
      return elementType === 'IFCBEAM' && properties?.name?.includes('TRUSS')
    },
    priority: 60
  }
]

const service = new GeometryRefinementService({
  filename: 'model.ifc',
  refinementRules: customRules
})
```

## State Preservation

The system preserves all mesh properties during replacement:

| Property | Preserved? | How |
|----------|-----------|-----|
| Material | ✅ Yes | Reused from old mesh |
| Position | ✅ Yes | Copied via `.copy()` |
| Rotation | ✅ Yes | Copied via `.copy()` |
| Scale | ✅ Yes | Copied via `.copy()` |
| Matrix | ✅ Yes | Copied via `.copy()` |
| Hierarchy | ✅ Yes | Parent reference maintained |
| Visibility | ✅ Yes | Direct property copy |
| Selection | ✅ Yes | Internal maps updated |
| expressID | ✅ Yes | Mapping updated |
| User Data | ✅ Yes | Copied with `refined: true` flag |
| Shadows | ✅ Yes | castShadow/receiveShadow copied |

## Performance Characteristics

### Initial Load
- **Time**: ~2-5 seconds (model size dependent)
- **Method**: web-ifc WASM (client-side)
- **Quality**: Fast approximation

### Refinement
- **Time**: ~5-15 seconds (element count dependent)
- **Method**: IfcOpenShell GEOM (server-side)
- **Quality**: High-fidelity with boolean operations
- **Batch size**: 20 elements per request
- **Background**: Yes (non-blocking)

### Memory
- Old geometry disposed after replacement
- Materials reused (not duplicated)
- Typical overhead: ~10-20% for refined elements

## Testing & Verification

### Visual Quality Checks

1. **Load a model with plates/cut parts**
2. **Observe initial load** - should be fast (~2-5s)
3. **Watch for refinement progress** - "Refining geometry..." message
4. **Compare geometry**:
   - **Before**: Simplified plates, missing holes
   - **After**: Accurate outlines, visible cuts, proper shapes

### Interaction Tests

1. **Selection**:
   - Click refined elements
   - Should highlight correctly
   - Context menu should show correct data

2. **Hover**:
   - Hover over refined elements
   - Should respond identically to non-refined

3. **Filtering**:
   - Apply profile/assembly filters
   - Refined elements should hide/show correctly

4. **Camera**:
   - Camera position should not change during refinement
   - Zoom/pan/rotate should work seamlessly

### Console Checks

Look for these log messages:

```
✅ Loaded 1234 elements with accurate geometry
[Refinement] Starting geometry refinement for 1234 meshes...
[Refinement] Identified 45 elements for refinement
[Refinement] Fetched 45/45 refined geometries
[Refinement] Replaced mesh for element 12345 (IfcPlate)
[Refinement] ✅ Successfully refined 45 elements
```

## Extending the System

### Add New Element Types

To refine additional element types, add a rule:

```typescript
{
  shouldRefine: (elementType) => 
    elementType === 'IFCBEAM' || elementType === 'IFCCOLUMN',
  priority: 50
}
```

### Custom Detection Logic

Use element properties for fine-grained control:

```typescript
{
  shouldRefine: (elementType, elementId, properties) => {
    // Only refine beams longer than 10m
    if (elementType !== 'IFCBEAM') return false
    const length = properties?.length || 0
    return length > 10000 // mm
  },
  priority: 70
}
```

### Batch Size Tuning

Adjust batch size for performance:

```typescript
const service = new GeometryRefinementService({
  filename: 'model.ifc',
  refinementRules: DEFAULT_REFINEMENT_RULES
})

// Access private property via service instance
service['batchSize'] = 50 // Larger batches = fewer requests
```

## Troubleshooting

### Issue: Refinement not starting

**Symptoms**: Model loads but no refinement messages
**Causes**:
- No elements match refinement rules
- IFC API not initialized
- Backend not responding

**Solutions**:
1. Check browser console for errors
2. Verify backend is running: `http://localhost:8000/api/health`
3. Check refinement rules match element types in model

### Issue: Geometry looks wrong after refinement

**Symptoms**: Refined elements appear distorted or misplaced
**Causes**:
- Coordinate system mismatch
- Transformation not preserved
- Geometry data corruption

**Solutions**:
1. Check backend logs for geometry errors
2. Verify IfcOpenShell settings (WORLD_COORDS = True)
3. Ensure transformation matrices are copied

### Issue: Selection broken after refinement

**Symptoms**: Can't click on refined elements
**Causes**:
- Mesh mappings not updated
- Event handlers not reattached

**Solutions**:
1. Verify `meshToExpressIdRef` is updated
2. Verify `expressIdToMeshesRef` is updated
3. Check raycasting setup in click handler

### Issue: Memory leak during refinement

**Symptoms**: Browser memory grows, becomes slow
**Causes**:
- Old geometry not disposed
- Materials duplicated

**Solutions**:
1. Verify `oldMesh.geometry.dispose()` is called
2. Reuse materials, don't clone
3. Monitor memory in Chrome DevTools

## API Reference

### GeometryRefinementService

```typescript
constructor(config: RefinementConfig)
```

**RefinementConfig:**
```typescript
interface RefinementConfig {
  filename: string
  refinementRules: RefinementRule[]
}
```

**RefinementRule:**
```typescript
interface RefinementRule {
  shouldRefine: (
    elementType: string,
    elementId: number,
    properties?: any
  ) => boolean
  priority: number
}
```

## Success Criteria ✅

- [x] Fast initial load (unchanged)
- [x] Accurate geometry for plates and cut parts
- [x] No visual artifacts or duplicate elements
- [x] Seamless visual swap (no reload)
- [x] Consistent interaction (selection, hover)
- [x] State preservation (camera, filters)
- [x] Future-proof (extensible rules)
- [x] No logic duplication (business logic unchanged)

## Future Enhancements

### Potential Improvements

1. **Progressive refinement**
   - Refine visible elements first
   - Defer off-screen elements

2. **Caching**
   - Cache refined geometry in localStorage
   - Skip refetch if geometry unchanged

3. **LOD (Level of Detail)**
   - Use simple geometry when zoomed out
   - Switch to refined geometry when zoomed in

4. **Worker threads**
   - Move geometry processing to Web Workers
   - Keep main thread responsive

5. **Compression**
   - Compress geometry data for network transfer
   - Use draco/meshoptimizer compression

## Conclusion

The Geometry Refinement System provides the best of both worlds:
- **Fast initial load** via web-ifc WASM
- **Accurate visual representation** via selective server-side refinement

The system is transparent to the rest of the application - business logic, reports, nesting, and quantities continue to work unchanged. Only the visual representation is enhanced.

**Result**: Professional-quality 3D visualization with consumer-grade load times.



