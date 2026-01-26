# Dashboard Tab - Plate Profile Name Column Addition

## Issue
The Dashboard tab's Plates table was missing a "Profile Name" column. Plates should display their profile information (like "P:20*2190", "FLT10*100", etc.) from the IFC Description attribute, similar to what is shown in the Shipment tab and Model tab.

## Solution
Added a new "Profile Name" column to the Plates table in the Dashboard tab that displays the Description attribute from IFC plate elements.

## Changes Made

### Backend Changes (`api/main.py`)

#### 1. Extract Description Attribute (Lines 5242-5251)
Added code to extract the Description attribute from plate elements when processing them for the dashboard:

```python
# Process plates
elif element_type in ["IfcPlate", "IfcSlab"]:
    thickness = get_plate_thickness(element)
    
    # Get Description attribute (contains profile info like "P:20*2190")
    description = ""
    try:
        if hasattr(element, 'Description') and element.Description:
            description = str(element.Description).strip()
    except:
        pass
```

#### 2. Track Descriptions in Grouping (Lines 5273-5295)
Added a `descriptions` set to track all profile descriptions for grouped plates:

```python
plates_dict[group_key] = {
    # ... existing fields ...
    "descriptions": set()  # Track all descriptions (profile names) in this group
}

# Track descriptions
if description:
    plates_dict[group_key]["descriptions"].add(description)
```

#### 3. Add profile_name to API Response (Lines 5368-5393)
Added logic to include `profile_name` in the plates list response:

```python
# Get profile name from descriptions
descriptions = plate_data.get("descriptions", set())
if descriptions:
    # If there are descriptions, show them (comma separated if multiple)
    profile_name = ", ".join(sorted(descriptions))
else:
    # No description available
    profile_name = "N/A"

plates_list.append({
    "part_name": display_name,
    "assembly_mark": display_assembly,
    "thickness": plate_data["thickness"],
    "profile_name": profile_name,  # Add profile_name field
    # ... rest of fields ...
})
```

### Frontend Changes (`web/src/components/Dashboard.tsx`)

#### 1. Updated TypeScript Interface (Lines 21-31)
Added `profile_name` field to the `PlateDetail` interface:

```typescript
interface PlateDetail {
  part_name: string
  assembly_mark: string
  thickness: string
  profile_name: string  // Added
  width: number | null
  length: number | null
  weight: number
  quantity: number
  total_weight: number
  ids: number[]
}
```

#### 2. Added Column Header (Lines 419-430)
Added "Profile Name" column header to the plates table:

```tsx
<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
  Profile Name
</th>
```

#### 3. Added Data Cell (Lines 432-461)
Added the profile name data cell with green styling to distinguish it:

```tsx
<td className="px-4 py-3 text-sm font-medium text-green-600">
  {plate.profile_name}
</td>
```

#### 4. Updated Footer Colspan (Lines 464-476)
Updated the footer colspan from 6 to 7 to account for the new column.

## Results

### API Response Example
```json
{
  "part_name": "p1001",
  "assembly_mark": "P1",
  "thickness": "10mm",
  "profile_name": "FLT10*100",
  "width": 100.0,
  "length": 100.0,
  "weight": 0.79,
  "quantity": 12,
  "total_weight": 9.48
}
```

### UI Display
The Dashboard tab now shows a "Profile Name" column in the Plates table with values like:
- "FLT10*100"
- "FLT10*120"
- "FLT10*150"
- "FLT10*180"
- "P:20*2190"
- etc.

If no description is available, it displays "N/A".

## Testing
Tested with file: `Angles_And_Plate_(2).ifc`

Verified:
- ✅ API returns `profile_name` field for all plates
- ✅ Frontend builds successfully without TypeScript errors
- ✅ Multiple different profile names displayed correctly
- ✅ Graceful fallback to "N/A" when no description available

## Files Modified
- `api/main.py`: Lines 5242-5251, 5273-5295, 5368-5393
- `web/src/components/Dashboard.tsx`: Lines 21-31, 419-430, 432-461, 464-476

## Date
January 26, 2026

