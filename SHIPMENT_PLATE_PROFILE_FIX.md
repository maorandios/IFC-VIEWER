# Shipment Tab - Plate Profile Display Fix

## Issue
In the Shipment tab table, assemblies that are plates were displaying "N/A" for the Main Profile column. However, in the Model tab, when right-clicking on a plate and viewing its info, the correct profile name was shown under the "Description" field (e.g., "P:20*2190", "FLT10*100").

## Root Cause
The `/api/shipment-assemblies/` endpoint was only extracting the `thickness` for plates (e.g., "10mm") but not the full profile description from the IFC element's `Description` attribute. When determining the `main_profile` for plate-only assemblies, it was using only the thickness instead of the full profile information.

## Solution
Modified `api/main.py` in the `/api/shipment-assemblies/` endpoint:

### 1. Extract Description Attribute for Plates (Lines 5511-5533)
Added code to extract the `Description` attribute from plate elements and store it alongside the thickness:

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
    
    assemblies_by_id[assembly_id]["parts"].append({
        "id": element_id,
        "weight": weight,
        "thickness": thickness,
        "description": description,  # Store Description for use in main_profile
        "part_type": "plate"
    })
```

### 2. Use Description for Plate-Only Assemblies (Lines 5546-5572)
Updated the logic to prioritize the Description field when determining the `main_profile` for plate-only assemblies:

```python
else:
    # No profiles found - this is a plate-only assembly
    # Try to use Description first (e.g., "P:20*2190"), otherwise fall back to thickness
    plate_descriptions = {}
    for part in assembly_data["parts"]:
        if part["part_type"] == "plate":
            description = part.get("description", "")
            if description:
                plate_descriptions[description] = plate_descriptions.get(description, 0) + 1
    
    if plate_descriptions:
        # Get the most common description
        most_common_description = max(plate_descriptions.items(), key=lambda x: x[1])[0]
        main_profile = most_common_description
    else:
        # Fallback to thickness if no description available
        # ... (existing thickness logic)
```

## Results
After the fix, plate-only assemblies now correctly display their profile information:

### Before:
- P1 assembly: `main_profile: "N/A"` or `main_profile: "Plate 10mm"`
- P2 assembly: `main_profile: "N/A"` or `main_profile: "Plate 10mm"`

### After:
- P1 assembly: `main_profile: "FLT10*100"`
- P2 assembly: `main_profile: "FLT10*70"`

## Testing
Tested with file: `Angles_And_Plate_(2).ifc`

API response confirmed:
```json
{
  "assembly_mark": "P1",
  "assembly_id": 2478,
  "main_profile": "FLT10*100",  // ✅ Now shows profile instead of "N/A"
  "member_count": 0,
  "plate_count": 1
}
```

## Files Modified
- `api/main.py`: Lines 5511-5572 (in `/api/shipment-assemblies/` endpoint)

## Date
January 26, 2026

