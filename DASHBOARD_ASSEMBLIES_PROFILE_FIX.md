# Dashboard Tab - Assemblies Table Profile Name Column Addition

## Issue
In the Dashboard tab's Assemblies section, when you expand an assembly to see its parts, the plate parts were showing "N/A" or only showing thickness in the "Profile/Thickness" column. They should display their full profile information (like "FLT10*120", "P:20*2190") from the IFC Description attribute.

## Solution
Split the "Profile/Thickness" column into two separate columns: "Profile Name" and "Thickness". Now both profiles and plates display their profile names, and plates additionally show their thickness.

## Changes Made

### Backend Changes (`api/main.py`)

#### Modified Line 5312-5322
Added `profile_name` field to plate parts when adding them to assemblies:

**Before:**
```python
assemblies_dict[assembly_mark]["parts"].append({
    "id": element_id,
    "part_name": part_name,
    "thickness": thickness,
    "width": width_rounded,
    "length": length_rounded,
    "weight": round(weight, 2),
    "part_type": "plate"
})
```

**After:**
```python
assemblies_dict[assembly_mark]["parts"].append({
    "id": element_id,
    "part_name": part_name,
    "thickness": thickness,
    "profile_name": description if description else "N/A",  # Add profile_name from Description
    "width": width_rounded,
    "length": length_rounded,
    "weight": round(weight, 2),
    "part_type": "plate"
})
```

### Frontend Changes (`web/src/components/Dashboard.tsx`)

#### 1. Updated Table Headers (Lines 530-537)
Split the combined "Profile/Thickness" column into two separate columns:

**Before:**
```tsx
<th>Profile/Thickness</th>
```

**After:**
```tsx
<th>Profile Name</th>
<th>Thickness</th>
```

#### 2. Updated Table Data Cells (Lines 539-556)
Changed from showing profile OR thickness in one column, to showing both in separate columns:

**Before:**
```tsx
<td className="px-3 py-2 text-sm text-blue-600">
  {part.part_type === 'profile' ? part.profile_name : part.thickness}
</td>
```

**After:**
```tsx
<td className="px-3 py-2 text-sm font-medium text-green-600">
  {part.profile_name || 'N/A'}
</td>
<td className="px-3 py-2 text-sm text-blue-600">
  {part.part_type === 'plate' ? part.thickness : '-'}
</td>
```

## Results

### API Response Example
Assembly parts now include `profile_name` for both profiles and plates:

```json
{
  "assembly_mark": "AN1",
  "parts": [
    {
      "id": 2734,
      "part_name": "an1001",
      "profile_name": "L150X150X15",
      "length": 1000.0,
      "weight": 33.56,
      "part_type": "profile"
    },
    {
      "id": 1205,
      "part_name": "1",
      "thickness": "10mm",
      "profile_name": "FLT10*120",
      "width": 120.0,
      "length": 120.0,
      "weight": 1.03,
      "part_type": "plate"
    }
  ]
}
```

### UI Display
The Assemblies table now shows:

| Part Name | Type    | **Profile Name** | **Thickness** | Length | Weight |
|-----------|---------|------------------|---------------|--------|--------|
| an1001    | Profile | L150X150X15      | -             | 1000.0 | 33.56  |
| 1         | Plate   | **FLT10*120**    | 10mm          | 120.0  | 1.03   |

**Key improvements:**
- ✅ Profile names shown in **green** for visibility
- ✅ Plates now display their full profile (e.g., "FLT10*120") instead of "N/A"
- ✅ Thickness shown separately for plates only
- ✅ Profiles show "-" for thickness (not applicable)

## Testing
Tested with file: `Angles_And_Plate_(2).ifc`

Verified:
- ✅ API returns `profile_name` for all parts (both profiles and plates)
- ✅ Frontend builds successfully
- ✅ Assembly AN1 shows correct profile names for both angle profiles and plates
- ✅ Plates display both profile name ("FLT10*120") and thickness ("10mm")

## Files Modified
- `api/main.py`: Lines 5312-5322
- `web/src/components/Dashboard.tsx`: Lines 530-537, 539-556

## Summary of All Profile Name Fixes

Now profile names are displayed correctly in **three locations**:

1. ✅ **Shipment Tab** - Main Profile column shows plate profiles
2. ✅ **Dashboard Tab - Plates Table** - Profile Name column added
3. ✅ **Dashboard Tab - Assemblies Table** - Profile Name column added (separate from Thickness)

## Date
January 26, 2026



