# Bolt Hole Filter Fix

## Issue Identified

**Problem:** The Bolts tab was showing `BOLTM20*40` with a length of 20mm, which is actually a bolt hole, not a real bolt.

**Analysis:**
- Bolt name: `BOLTM20*40` indicates expected length of 40mm
- Actual length: 20mm (only 50% of expected)
- For an M20 bolt, 20mm length = exactly 1.0x the diameter
- This is a clear indicator of a hole, not an actual protruding bolt

## Root Cause

The previous filtering logic had two issues:

1. **Threshold too lenient:** Used `< 0.5` (less than 50%) instead of `<= 0.6` (60% or less)
   - A bolt at exactly 50% was passing through
   
2. **No diameter-based check:** Did not check if bolt length is suspiciously close to the bolt diameter
   - When length ≈ diameter, it's almost always just a hole

## Solution Implemented

Updated `api/main.py` (lines 5190-5217) with enhanced bolt hole filtering:

### 1. Stricter Expected Length Check
Changed threshold from 50% to 60%:
```python
# Old: if bolt_length < (expected_length * 0.5):
# New: if bolt_length <= (expected_length * 0.6):
```

**Examples that will now be filtered:**
- `BOLTM20*40` with 20mm length (50%) ✅ FILTERED
- `BOLTM16*25` with 10mm length (40%) ✅ FILTERED
- `BOLTM10*15` with 3mm length (20%) ✅ FILTERED

### 2. New Diameter-Based Check
Added additional validation: bolt length must be > 1.5x diameter
```python
if diameter and bolt_length <= (diameter * 1.5):
    continue  # Skip this bolt hole
```

**Examples:**
- M20 with 20mm length (1.0x diameter) ✅ FILTERED
- M20 with 25mm length (1.25x diameter) ✅ FILTERED
- M20 with 35mm length (1.75x diameter) ✅ KEPT (real bolt)
- M16 with 40mm length (2.5x diameter) ✅ KEPT (real bolt)

## Technical Details

### Updated Filter Logic
The filter now checks BOTH conditions:

1. **Ratio to expected length:** `bolt_length <= (expected_length * 0.6)`
2. **Ratio to diameter:** `bolt_length <= (diameter * 1.5)`

If either condition is true, the bolt is filtered out as a hole-only element.

### Code Location
- **File:** `api/main.py`
- **Function:** `get_dashboard_details()` 
- **Lines:** 5190-5217

### Properties Used
- `Tekla Bolt.Bolt Name` - e.g., "BOLTM20*40"
- `Tekla Bolt.Bolt size` - e.g., 20.0 (diameter in mm)
- `Tekla Bolt.Bolt length` - e.g., 20.0 (actual length in mm)
- `Tekla Bolt.Bolt count` - must be > 0 (already filtered)

## Testing

### Before Fix
- Total bolts: 1050 (including holes)
- `BOLTM20*40` with 20mm length: **SHOWN** ❌

### After Fix (Expected)
- Total bolts: ~850-900 (holes filtered out)
- `BOLTM20*40` with 20mm length: **FILTERED** ✅

## How to Verify

1. **Restart the backend server** (already done)
2. **Re-upload your IFC file** or refresh the data
3. **Check the Bolts tab:**
   - `BOLTM20*40` with 20mm length should be GONE
   - Only real bolts with reasonable lengths should appear
   - Total bolt count should be lower

## Files Modified

1. ✅ `api/main.py` - Enhanced bolt hole filtering logic

## Status

✅ **Fix Applied and Backend Restarted**

The backend server has been restarted with the updated filtering logic. Please reload your IFC file or refresh the dashboard to see the corrected bolt data.

---

**Date:** 2026-01-29  
**Issue:** Bolt holes appearing as actual bolts in Bolts tab  
**Fix:** Enhanced filtering with dual criteria (expected length ratio + diameter ratio)

