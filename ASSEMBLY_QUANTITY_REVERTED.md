# Assembly Quantity Display - Reverted to Original

## Summary

All assembly quantity grouping features have been reverted back to the original behavior.

## What Was Reverted

### Backend Changes (api/main.py)

**Removed:**
- Assembly grouping by structure
- Signature-based duplicate detection
- Quantity calculation logic
- Complex grouping code (~100 lines)

**Restored:**
- Simple iteration through assemblies_dict
- Each assembly instance tracked separately
- No grouping or counting

### Frontend Changes (Dashboard.tsx)

**Removed:**
- `quantity` field from AssemblyDetail interface
- Quantity badge display `[Qty: X]`
- Conditional rendering logic for badge

**Restored:**
- Clean assembly header without quantity
- Original simple display

## Current Behavior

### Assemblies Display

Each assembly instance is shown as a separate row:

```
Dashboard Assemblies Tab:
├─ B54  HEA180  4484mm  944.85 kg  (5 members, 10 plates)
├─ B72  HEA180  4484mm  944.85 kg  (5 members, 10 plates)
├─ B72  HEA180  4484mm  944.85 kg  (5 members, 10 plates)
├─ B72  HEA180  4484mm  944.85 kg  (5 members, 10 plates)
│  ... (17 more B72 instances)
├─ C24  HEA180  4484mm  944.85 kg  (5 members, 10 plates)
└─ ...
```

### Parts Display (Kept)

**Important:** The parts grouping within each assembly was KEPT:
- When you expand an assembly, duplicate parts are still grouped
- Parts show with quantity column
- This feature remains unchanged

Example when expanding B72:
```
B72  HEA180  4484mm  944.85 kg
├─ Part c21    HEA180     4484.0mm  159.45kg  Qty: 1
├─ Part p1001  PL16*350   350.0mm   15.39kg   Qty: 1
└─ Part p1027  FL120*300  300.0mm   14.13kg   Qty: 1
```

## What Remains

These features are still active:
1. ✅ Parts grouping within assemblies (with quantity)
2. ✅ Assembly expand/collapse functionality
3. ✅ 3D preview for assemblies
4. ✅ All other dashboard features

## Code Changes

### Backend: api/main.py (Line ~5402)

**Reverted from:**
```python
# Complex grouping logic
assembly_signatures = {}
for assembly_id_key, assembly_data in assemblies_dict.items():
    # Create signature
    # Group by signature
    # Calculate quantities
    # ...
```

**Back to:**
```python
# Simple iteration
assemblies_list = []
for assembly_id_key, assembly_data in assemblies_dict.items():
    # Calculate main profile
    # Add to list
    # No grouping
```

### Frontend: Dashboard.tsx

**Reverted from:**
```tsx
interface AssemblyDetail {
  ...
  quantity: number  // Removed
}

<span className="text-lg font-bold">{assembly.assembly_mark}</span>
<span className="badge">Qty: {assembly.quantity}</span>  // Removed
```

**Back to:**
```tsx
interface AssemblyDetail {
  ...
  // No quantity field
}

<span className="text-lg font-bold">{assembly.assembly_mark}</span>
// No badge
```

## Files Modified

1. `api/main.py` - Reverted assembly grouping logic
2. `web/src/components/Dashboard.tsx` - Removed quantity display
3. `ASSEMBLY_QUANTITY_REVERTED.md` - This documentation

## Reasons for Revert

User requested to revert the assembly quantity display changes and return to the original behavior where each assembly instance is shown separately without grouping or quantity counting.

## Testing

- [x] Backend starts without errors
- [x] Frontend compiles without errors
- [x] Each assembly instance shown separately
- [x] No quantity badges displayed
- [x] Parts grouping still works within assemblies
- [x] Expand/collapse still works

## Before vs After Revert

### Before Revert (with quantity)
```
B72 [Qty: 20]  HEA180  4484mm  (single row, grouped)
```

### After Revert (original)
```
B72  HEA180  4484mm  (instance 1)
B72  HEA180  4484mm  (instance 2)
...
B72  HEA180  4484mm  (instance 20)
```
*20 separate rows, no grouping*

## Summary

✅ **Reverted successfully!**

The Dashboard assemblies table is back to its original behavior:
- Each assembly instance displayed separately
- No quantity counting or grouping
- Parts within assemblies still grouped (feature kept)
- All other functionality intact

Refresh your browser to see the changes!

