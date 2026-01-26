# Dashboard Tab - Assembly Header Profile Name Fix

## Issue
In the Dashboard tab's Assemblies section, the assembly header (title) was showing "N/A" for plate-only assemblies, even though the individual parts within the assembly correctly displayed their profile names (e.g., "PL20*320", "FLT10*100").

## Root Cause
The `main_profile` calculation in the `/api/dashboard-details/` endpoint only looked at profile-type parts (beams, columns, members) and didn't have fallback logic for plate-only assemblies. When an assembly contained only plates and no structural profiles, it would default to "N/A".

## Solution
Added the same fallback logic that was already implemented in the shipment endpoint: when no profiles are found, use the most common plate `profile_name` (from Description attribute) as the `main_profile`.

## Changes Made

### Backend Changes (`api/main.py`)

#### Modified Lines 5419-5426
Added plate profile fallback logic after checking for profile-type parts:

**Before:**
```python
# Get the profile with the longest length (main structural member)
if profile_counts:
    main_profile = max(profile_counts.items(), 
                     key=lambda x: (x[1]["max_length"], x[1]["count"]))[0]
    max_length = profile_counts[main_profile]["max_length"]

# Collect all IDs from parts in this assembly
assembly_ids = [part["id"] for part in assembly_data["parts"]]
```

**After:**
```python
# Get the profile with the longest length (main structural member)
if profile_counts:
    main_profile = max(profile_counts.items(), 
                     key=lambda x: (x[1]["max_length"], x[1]["count"]))[0]
    max_length = profile_counts[main_profile]["max_length"]
else:
    # No profiles found - this is a plate-only assembly
    # Try to use profile_name from plates first, otherwise fall back to thickness
    plate_profiles = {}
    for part in assembly_data["parts"]:
        if part["part_type"] == "plate":
            profile_name = part.get("profile_name", "")
            if profile_name and profile_name != "N/A":
                plate_profiles[profile_name] = plate_profiles.get(profile_name, 0) + 1
    
    if plate_profiles:
        # Get the most common profile name
        most_common_profile = max(plate_profiles.items(), key=lambda x: x[1])[0]
        main_profile = most_common_profile
    else:
        # Fallback to thickness if no profile name available
        plate_thickness_counts = {}
        for part in assembly_data["parts"]:
            if part["part_type"] == "plate":
                thickness = part.get("thickness", "N/A")
                plate_thickness_counts[thickness] = plate_thickness_counts.get(thickness, 0) + 1
        
        if plate_thickness_counts:
            # Get the most common thickness
            most_common_thickness = max(plate_thickness_counts.items(), key=lambda x: x[1])[0]
            main_profile = f"Plate {most_common_thickness}"

# Collect all IDs from parts in this assembly
assembly_ids = [part["id"] for part in assembly_data["parts"]]
```

## Results

### API Response Example
**Before:**
```json
{
  "assembly_mark": "P1",
  "main_profile": "N/A",          ← Was showing N/A
  "member_count": 0,
  "plate_count": 12
}
```

**After:**
```json
{
  "assembly_mark": "P1",
  "main_profile": "FLT10*100",    ← Now shows correct profile!
  "member_count": 0,
  "plate_count": 12
}
```

### UI Display
The assembly header now correctly displays the plate profile:

**Before:**
```
P1    N/A    173.20 kg    (0 members, 12 plates)
```

**After:**
```
P1    FLT10*100    173.20 kg    (0 members, 12 plates)
```

## Testing
Tested with file: `Angles_And_Plate_(2).ifc`

Verified plate-only assemblies:
- ✅ P1 assembly: `main_profile: "FLT10*100"` (was "N/A")
- ✅ P2 assembly: `main_profile: "FLT10*70"` (was "N/A")

Mixed assemblies (with both profiles and plates) continue to work correctly:
- ✅ AN1 assembly: `main_profile: "L150X150X15"` (unchanged, still correct)

## Files Modified
- `api/main.py`: Lines 5419-5450 (added plate profile fallback logic)

## Complete Fix Summary

All profile name issues are now resolved across the application:

1. ✅ **Shipment Tab** → Main Profile shows plate profiles
2. ✅ **Dashboard Tab → Plates Table** → Profile Name column added
3. ✅ **Dashboard Tab → Assemblies Table** → Profile Name column added
4. ✅ **Dashboard Tab → Assembly Headers** → Main profile shows plate profiles (not "N/A")

## Date
January 26, 2026


