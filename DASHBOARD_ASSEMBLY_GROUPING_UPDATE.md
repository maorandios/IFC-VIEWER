# Dashboard Assembly Grouping Update

## Overview

Updated the Dashboard assemblies table to group duplicate assemblies and display them once with a quantity indicator.

## Problem Solved

**Before:** If an assembly was duplicated multiple times (e.g., Assembly A-1 appears 3 times), each instance was shown as a separate row in the assemblies list.

**After:** Duplicate assemblies are now grouped together and shown as a single row with a quantity badge (e.g., "Qty: 3").

## Changes Made

### Backend (api/main.py)

#### New Grouping Logic

1. **Assembly Signature Creation**
   - Each assembly now gets a "signature" based on its parts composition
   - Signature includes: part types, names, profiles, dimensions, and weights
   - Assemblies with identical signatures are considered duplicates

2. **Duplicate Detection**
   - Assemblies are grouped by their signature
   - Duplicates are counted and stored as `quantity`

3. **Data Structure**
   ```python
   {
     "assembly_mark": "A-1",
     "quantity": 3,  # NEW FIELD
     "parts": [...],  # Parts shown once
     "ids": [...],    # IDs from all instances
     ...
   }
   ```

#### Algorithm

```python
# Create signature for each assembly
assembly_signatures = {}

for assembly_mark, assembly_data in assemblies_dict.items():
    # Create signature from parts structure
    parts_signature = []
    for part in sorted_parts:
        part_sig = (
            part_type,
            part_name,
            profile_name,
            thickness,
            length,
            width,
            weight
        )
        parts_signature.append(part_sig)
    
    signature = tuple(parts_signature)
    
    # Group assemblies by signature
    if signature not in assembly_signatures:
        assembly_signatures[signature] = []
    assembly_signatures[signature].append(assembly_data)

# Convert to list with quantity
for signature, assemblies_group in assembly_signatures.items():
    quantity = len(assemblies_group)  # Number of duplicates
    # Use first assembly as representative
    # Collect IDs from all instances
    ...
```

### Frontend (web/src/components/Dashboard.tsx)

#### Interface Update

```typescript
interface AssemblyDetail {
  assembly_mark: string
  assembly_id: number | null
  main_profile: string
  length: number
  total_weight: number
  member_count: number
  plate_count: number
  parts: Array<any>
  ids: number[]
  quantity: number  // NEW FIELD
}
```

#### Display Update

```tsx
<div className="flex items-center space-x-4 text-left">
  <span className="text-lg font-bold text-gray-900">
    {assembly.assembly_mark}
  </span>
  
  {/* NEW: Quantity badge (only if > 1) */}
  {assembly.quantity > 1 && (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
      Qty: {assembly.quantity}
    </span>
  )}
  
  <span className="text-sm text-gray-600">{assembly.main_profile}</span>
  ...
</div>
```

## Visual Example

### Before

```
Assemblies Tab:
├─ Assembly A-1 (IPE600, 6000mm, 45.5 kg)
│  └─ [Expandable: shows parts]
├─ Assembly A-1 (IPE600, 6000mm, 45.5 kg)  ← Duplicate
│  └─ [Expandable: shows parts]
├─ Assembly A-1 (IPE600, 6000mm, 45.5 kg)  ← Duplicate
│  └─ [Expandable: shows parts]
└─ Assembly B-2 (HEA300, 4500mm, 38.2 kg)
   └─ [Expandable: shows parts]
```

### After

```
Assemblies Tab:
├─ Assembly A-1 [Qty: 3] (IPE600, 6000mm, 45.5 kg)  ← Grouped!
│  └─ [Expandable: shows parts once]
└─ Assembly B-2 (HEA300, 4500mm, 38.2 kg)
   └─ [Expandable: shows parts]
```

## UI Components

### Quantity Badge

- **Appearance**: Blue rounded pill badge
- **Position**: Next to assembly mark in header
- **Visibility**: Only shown when quantity > 1
- **Style**: `bg-blue-100 text-blue-800`
- **Text**: "Qty: X" where X is the number of duplicates

### Assembly Header Layout

```
┌─────────────────────────────────────────────────────────────┐
│ A-1  [Qty: 3]  IPE600  6000mm  45.5 kg  (2 members, 3 plates) │ ▼
└─────────────────────────────────────────────────────────────┘
```

## Benefits

1. **Cleaner Display**: Fewer rows to scroll through
2. **Better Overview**: Instantly see how many duplicates exist
3. **Reduced Clutter**: Parts shown once instead of repeated
4. **Efficient Navigation**: Easier to find unique assemblies
5. **Accurate Counts**: Total assembly count now shows unique + duplicates

## How Grouping Works

### Matching Criteria

Two assemblies are considered duplicates if they have:
- **Same parts count**
- **Same part types** (Profile/Plate)
- **Same part names**
- **Same profile names**
- **Same thicknesses** (for plates)
- **Same dimensions** (length, width)
- **Same weights**

### Edge Cases

1. **Nearly Identical**: If weights differ slightly due to rounding, assemblies are still grouped
2. **Different IDs**: Assemblies with same structure but different IFC IDs are grouped
3. **Part Order**: Part order doesn't matter (sorted before comparison)
4. **Single Instance**: If quantity = 1, no badge is shown

## Technical Details

### Backend Performance

- **Complexity**: O(n * m) where n = assemblies, m = parts per assembly
- **Memory**: Stores one representative assembly per unique structure
- **IDs**: Collects IDs from all duplicate instances

### Frontend Rendering

- **Conditional Rendering**: Badge only rendered when `quantity > 1`
- **Responsive**: Badge scales with text size
- **Accessible**: Sufficient color contrast (WCAG AA compliant)

## Testing

### Test Scenarios

1. **No Duplicates**: Assembly shown without badge
2. **2 Duplicates**: Assembly shown with "Qty: 2" badge
3. **Many Duplicates**: Assembly shown with "Qty: X" badge
4. **Mixed**: Some assemblies with duplicates, some without
5. **Expand/Collapse**: Parts displayed correctly when expanded

### Expected Behavior

- Assembly count in metrics reflects total unique assemblies
- Each grouped assembly shows parts once
- Preview button shows all IDs from all duplicate instances
- Expanding shows the parts structure once

## Migration Notes

### Backward Compatibility

- **API**: Returns new `quantity` field (defaults to 1 if not grouped)
- **Frontend**: Handles missing `quantity` gracefully (treats as 1)
- **Data**: No database changes required (computed on-the-fly)

### Future Enhancements

Potential improvements:
1. Show list of assembly IDs on hover
2. Option to "ungroup" and see all instances
3. Export grouped vs. ungrouped data
4. Color-code by quantity (e.g., high quantity = different color)
5. Statistics showing duplicate percentage

## Related Components

This update affects:
- ✅ Dashboard Tab (Assemblies section)
- ❌ Shipment Tab (still shows individual instances)
- ❌ Management Tab (still shows individual instances)

**Note**: Shipment and Management tabs intentionally show individual instances since they track per-instance status.

## Files Modified

1. `api/main.py` - Backend grouping logic
2. `web/src/components/Dashboard.tsx` - Frontend display
3. `DASHBOARD_ASSEMBLY_GROUPING_UPDATE.md` - This documentation

## Summary

The Dashboard assemblies table now provides a cleaner, more organized view by:
- ✅ Grouping duplicate assemblies
- ✅ Showing quantity badge for duplicates
- ✅ Displaying parts once per unique structure
- ✅ Maintaining all functionality (expand, preview, etc.)

This improvement makes it easier to understand the assembly structure while reducing visual clutter in the interface.

