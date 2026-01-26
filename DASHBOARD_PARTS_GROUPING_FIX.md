# Dashboard Parts Grouping Fix

## Issue

When expanding an assembly in the Dashboard, duplicate parts were displayed as separate rows instead of being grouped with a quantity indicator.

### Example from User's Image

Assembly C24 showed:
```
c21  | Profile | HEA180 | - | 4484.0 | 159.45
c21  | Profile | HEA180 | - | 4484.0 | 159.45
c21  | Profile | HEA180 | - | 4484.0 | 159.45
c21  | Profile | HEA180 | - | 4484.0 | 159.45
c21  | Profile | HEA180 | - | 4484.0 | 159.45
p1001| Plate   | PL16*350 | 16mm | 350.0 | 15.39
p1001| Plate   | PL16*350 | 16mm | 350.0 | 15.39
...
```

## Solution

Added client-side grouping logic in the Dashboard component to group duplicate parts and display them once with a quantity counter.

### Changes Made

**File**: `web/src/components/Dashboard.tsx`

#### 1. Added Quantity Column

```tsx
<th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
  Quantity
</th>
```

#### 2. Implemented Grouping Logic

```tsx
{(() => {
  // Group duplicate parts
  const partsMap = new Map<string, { part: any; quantity: number }>();
  
  assembly.parts.forEach(part => {
    // Create unique key based on all part properties
    const key = `${part.part_name}_${part.part_type}_${part.profile_name}_${part.thickness}_${part.length}_${part.weight}`;
    
    if (partsMap.has(key)) {
      partsMap.get(key)!.quantity += 1;
    } else {
      partsMap.set(key, { part, quantity: 1 });
    }
  });
  
  return Array.from(partsMap.values()).map(({ part, quantity }, index) => (
    <tr key={`${part.id}_${index}`}>
      {/* Display part once with quantity */}
      <td>{quantity}</td>
    </tr>
  ));
})()}
```

#### 3. Display Quantity

```tsx
<td className="px-3 py-2 text-sm text-right font-bold text-blue-600">
  {quantity}
</td>
```

## Result

### After Fix

Assembly C24 now shows:
```
Part Name | Type    | Profile Name | Thickness | Length | Weight | Quantity
c21       | Profile | HEA180       | -         | 4484.0 | 159.45 | 5
p1001     | Plate   | PL16*350     | 16mm      | 350.0  | 15.39  | 5
p1027     | Plate   | FL120*300    | 20mm      | 300.0  | 14.13  | 4
```

## Grouping Logic

Parts are considered duplicates if they have identical:
- Part Name
- Part Type (Profile/Plate)
- Profile Name
- Thickness
- Length
- Weight

## Benefits

1. **Cleaner Display**: Much fewer rows to scroll through
2. **Quick Overview**: See quantities at a glance
3. **Better Readability**: Easier to understand assembly composition
4. **Accurate Counts**: Member count and plate count remain correct in header

## Visual Comparison

### Before
```
┌─────────────────────────────────────────────────────────────────────┐
│ C24  HEA180  4484mm  944.85 kg  (5 members, 10 plates)            ▼│
├─────────────────────────────────────────────────────────────────────┤
│ Part  │ Type    │ Profile  │ Thick │ Length │ Weight │             │
│ c21   │ Profile │ HEA180   │ -     │ 4484.0 │ 159.45 │             │
│ c21   │ Profile │ HEA180   │ -     │ 4484.0 │ 159.45 │ ← Duplicate │
│ c21   │ Profile │ HEA180   │ -     │ 4484.0 │ 159.45 │ ← Duplicate │
│ c21   │ Profile │ HEA180   │ -     │ 4484.0 │ 159.45 │ ← Duplicate │
│ c21   │ Profile │ HEA180   │ -     │ 4484.0 │ 159.45 │ ← Duplicate │
│ p1001 │ Plate   │ PL16*350 │ 16mm  │ 350.0  │ 15.39  │             │
│ p1001 │ Plate   │ PL16*350 │ 16mm  │ 350.0  │ 15.39  │ ← Duplicate │
│ ...   │ ...     │ ...      │ ...   │ ...    │ ...    │             │
└─────────────────────────────────────────────────────────────────────┘
Total: 15 rows for 15 parts (many duplicates)
```

### After
```
┌────────────────────────────────────────────────────────────────────────┐
│ C24  HEA180  4484mm  944.85 kg  (5 members, 10 plates)               ▼│
├────────────────────────────────────────────────────────────────────────┤
│ Part  │ Type    │ Profile  │ Thick │ Length │ Weight │ Quantity │    │
│ c21   │ Profile │ HEA180   │ -     │ 4484.0 │ 159.45 │    5     │ ✓  │
│ p1001 │ Plate   │ PL16*350 │ 16mm  │ 350.0  │ 15.39  │    5     │ ✓  │
│ p1027 │ Plate   │ FL120*300│ 20mm  │ 300.0  │ 14.13  │    4     │ ✓  │
└────────────────────────────────────────────────────────────────────────┘
Total: 3 rows for 15 parts (grouped by unique)
```

## Technical Details

### Implementation

- **Location**: Frontend only (Dashboard.tsx)
- **Method**: Client-side grouping using Map
- **Performance**: O(n) where n = number of parts
- **Memory**: Minimal - stores one instance per unique part

### Grouping Key

```typescript
const key = `${part.part_name}_${part.part_type}_${part.profile_name}_${part.thickness}_${part.length}_${part.weight}`;
```

### Data Structure

```typescript
Map<string, {
  part: any,      // Representative part object
  quantity: number // Count of duplicates
}>
```

## Edge Cases Handled

1. **Single Part**: Quantity shows as 1
2. **All Unique**: Each part shown once with quantity 1
3. **All Duplicates**: One row with high quantity
4. **Mixed**: Some grouped, some single

## Testing Checklist

- [x] Parts with identical properties are grouped
- [x] Quantity displays correctly
- [x] Single parts show quantity 1
- [x] Alternating row colors work correctly
- [x] No TypeScript compilation errors
- [x] No linter errors

## Future Enhancements

Potential improvements:
1. Sort by quantity (highest first)
2. Highlight rows with high quantities
3. Option to "ungroup" and see all instances
4. Total quantity summary
5. Export grouped data

## Related Files

- `web/src/components/Dashboard.tsx` - Contains the grouping logic
- `DASHBOARD_ASSEMBLY_GROUPING_UPDATE.md` - Related assembly-level grouping

## Summary

The Dashboard now provides a much cleaner view of assembly parts by:
- ✅ Grouping duplicate parts
- ✅ Showing quantity for each unique part
- ✅ Reducing visual clutter
- ✅ Making assembly composition easier to understand

This fix addresses the exact issue shown in the user's screenshot where parts like "c21" and "p1001" were repeated multiple times.

