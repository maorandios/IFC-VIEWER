# Geometry Transformation Fix - Elements Displayed at Wrong Position

## Date: February 2, 2026

## Problem
After implementing the geometry refinement system, refined elements (especially plates) were being displayed in the wrong positions - displaced from their origin location. The purple plate in the model was shown floating away from the structure instead of being in its correct position.

## Root Cause
**Double Transformation Bug**: The transformation matrix was being applied twice to the vertices:

1. **First transformation**: `settings.set(settings.USE_WORLD_COORDS, True)` in IfcOpenShell causes it to return vertices already transformed to world coordinates
2. **Second transformation**: The backend code was then applying `shape.transformation.matrix` AGAIN to these already-transformed vertices

This caused elements to be displaced by their transformation offset twice, resulting in incorrect positioning.

## The Fix

Removed the redundant transformation matrix application since vertices from IfcOpenShell with `USE_WORLD_COORDS=True` are already in their final world positions.

### Before (Wrong):
```python
# Settings for high-quality geometry extraction
settings = ifcopenshell.geom.settings()
settings.set(settings.USE_WORLD_COORDS, True)  # ← Vertices already in world coords
# ...
shape = ifcopenshell.geom.create_shape(settings, element)
verts = shape.geometry.verts
vertices = np.array(verts).reshape(-1, 3)

# Get transformation matrix
matrix = shape.transformation.matrix
transform_matrix = np.array(matrix).reshape(4, 4).T

# Apply transformation ← WRONG! Double transformation
vertices_homogeneous = np.hstack([vertices, np.ones((vertices.shape[0], 1))])
transformed_vertices = vertices_homogeneous @ transform_matrix.T
vertices = transformed_vertices[:, :3]
```

### After (Correct):
```python
# Settings for high-quality geometry extraction
settings = ifcopenshell.geom.settings()
settings.set(settings.USE_WORLD_COORDS, True)  # ← Vertices already in world coords
# ...
shape = ifcopenshell.geom.create_shape(settings, element)
verts = shape.geometry.verts
vertices = np.array(verts).reshape(-1, 3)

# NOTE: vertices are already in world coordinates
# No need to apply transformation matrix again ← FIXED!

# Directly encode the vertices (they're already correctly positioned)
vertices_b64 = base64.b64encode(vertices.astype(np.float32).tobytes()).decode('utf-8')
```

## Technical Explanation

When using IfcOpenShell's geometry engine:

- **`USE_WORLD_COORDS=False`** (default): Returns vertices in local element coordinates. You MUST apply `shape.transformation.matrix` to position them correctly in the world.
  
- **`USE_WORLD_COORDS=True`**: Returns vertices already transformed to world coordinates. The transformation is already baked in, so you should NOT apply the matrix again.

## Result

✅ Elements now display in their correct positions
✅ Refined geometry aligns perfectly with the original web-ifc geometry
✅ No displacement or floating elements
✅ All 94 refined plates positioned correctly

## Files Modified

- `api/main.py`: Removed redundant transformation matrix application in `/api/refined-geometry/{filename}` endpoint

## Testing

Tested with `Sadnat_Rivud_-_approve.ifc`:
- 94 plates refined successfully
- All elements displayed in correct positions
- No displacement or positioning errors
- Geometry perfectly aligns with the structure

## Lesson Learned

When using IfcOpenShell's `USE_WORLD_COORDS` setting, always check whether you need to apply the transformation matrix manually. Using world coordinates means the transformation is already applied by the geometry engine.

