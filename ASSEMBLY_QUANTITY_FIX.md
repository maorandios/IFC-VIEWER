# Assembly Quantity Fix - Critical Bug Resolution

## The Problem

When viewing assemblies in the Dashboard, the quantity was showing incorrectly.

### User's Report: Assembly B72

- **Expected**: B72 appears 20 times → Should show `Qty: 20` with parts listed once
- **Actual**: B72 showed `Qty: 1` but parts were listed 20 times

### Root Cause

In `api/main.py`, the `assemblies_dict` dictionary used **`assembly_mark`** as the key:

```python
# WRONG - merges all instances with same mark
if assembly_mark not in assemblies_dict:
    assemblies_dict[assembly_mark] = {...}

assemblies_dict[assembly_mark]["parts"].append(...)
```

**What happened:**
1. First B72 instance encountered → creates entry in `assemblies_dict["B72"]`
2. Second B72 instance → appends parts to existing `assemblies_dict["B72"]`
3. Third through 20th B72 → keep appending parts to same entry
4. Result: ONE assembly entry with 20x the parts

**Then the grouping logic:**
- Looked at `assemblies_dict` → found only 1 B72 entry
- Calculated quantity = 1 (wrong!)
- But parts showed 20 items (because they were accumulated)

## The Solution

Changed the dictionary key from `assembly_mark` to `assembly_id` (unique IFC identifier):

```python
# CORRECT - tracks each instance separately
if assembly_id not in assemblies_dict:
    assemblies_dict[assembly_id] = {
        "assembly_mark": assembly_mark,  # Still store the mark
        "assembly_id": assembly_id,
        ...
    }

assemblies_dict[assembly_id]["parts"].append(...)
```

**What happens now:**
1. First B72 instance (ID: 12345) → creates `assemblies_dict[12345]`
2. Second B72 instance (ID: 12346) → creates `assemblies_dict[12346]`
3. All 20 B72 instances tracked separately with IDs: 12345, 12346, ..., 12364
4. Grouping logic sees 20 separate B72 assemblies
5. Groups them by structure → Quantity = 20 ✓
6. Parts shown once from representative assembly ✓

## Changes Made

### File: `api/main.py`

#### Change 1: Profile Assembly Tracking (Line ~5220)
```python
# BEFORE
if assembly_mark not in assemblies_dict:
    assemblies_dict[assembly_mark] = {...}
assemblies_dict[assembly_mark]["parts"].append(...)
assemblies_dict[assembly_mark]["member_count"] += 1

# AFTER
if assembly_id not in assemblies_dict:
    assemblies_dict[assembly_id] = {...}
assemblies_dict[assembly_id]["parts"].append(...)
assemblies_dict[assembly_id]["member_count"] += 1
```

#### Change 2: Plate Assembly Tracking (Line ~5302)
```python
# BEFORE
if assembly_mark not in assemblies_dict:
    assemblies_dict[assembly_mark] = {...}
assemblies_dict[assembly_mark]["parts"].append(...)
assemblies_dict[assembly_mark]["plate_count"] += 1

# AFTER
if assembly_id not in assemblies_dict:
    assemblies_dict[assembly_id] = {...}
assemblies_dict[assembly_id]["parts"].append(...)
assemblies_dict[assembly_id]["plate_count"] += 1
```

#### Change 3: Dictionary Iteration (Line ~5406)
```python
# BEFORE
for assembly_mark, assembly_data in assemblies_dict.items():

# AFTER
for assembly_id_key, assembly_data in assemblies_dict.items():
```

## How It Works Now

### Data Flow

1. **IFC Parsing**
   ```
   IFC File
   ├─ Element 1 (part of Assembly B72, ID: 12345)
   ├─ Element 2 (part of Assembly B72, ID: 12345)
   ├─ Element 3 (part of Assembly B72, ID: 12346)  ← Different instance
   └─ Element 4 (part of Assembly B72, ID: 12346)
   ```

2. **Assembly Dictionary** (using assembly_id as key)
   ```python
   assemblies_dict = {
       12345: {
           "assembly_mark": "B72",
           "parts": [Element 1, Element 2],
           ...
       },
       12346: {
           "assembly_mark": "B72",
           "parts": [Element 3, Element 4],
           ...
       },
       ...
       12364: {
           "assembly_mark": "B72",
           "parts": [...],
           ...
       }
   }
   # 20 separate entries for B72
   ```

3. **Grouping by Structure**
   ```python
   # All 20 B72 instances have identical parts structure
   assembly_signatures = {
       signature_B72: [
           {assembly_id: 12345, assembly_mark: "B72"},
           {assembly_id: 12346, assembly_mark: "B72"},
           ...
           {assembly_id: 12364, assembly_mark: "B72"}
       ]  # 20 instances
   }
   ```

4. **Final Output**
   ```json
   {
       "assembly_mark": "B72",
       "quantity": 20,  // ✓ Correct!
       "parts": [...],   // From first instance only
       "ids": [...]      // All IDs from all 20 instances
   }
   ```

## Result

### Before Fix
```
B72  [Qty: 1]  HEA180  4484mm
├─ Part c21  HEA180  4484.0mm  159.45kg  Qty: 20  ← Parts accumulated
├─ Part p1001  PL16*350  350.0mm  15.39kg  Qty: 20
└─ Part p1027  FL120*300  300.0mm  14.13kg  Qty: 20
```
**Problem**: Quantity wrong, parts multiplied

### After Fix
```
B72  [Qty: 20]  HEA180  4484mm  ← Correct quantity!
├─ Part c21  HEA180  4484.0mm  159.45kg  Qty: 1  ← Parts shown once
├─ Part p1001  PL16*350  350.0mm  15.39kg  Qty: 1
└─ Part p1027  FL120*300  300.0mm  14.13kg  Qty: 1
```
**Fixed**: Quantity correct, parts shown once per assembly structure

## Technical Details

### Assembly ID vs Assembly Mark

- **assembly_id**: Unique IFC identifier (e.g., 12345, 12346)
  - Every assembly instance has a different ID
  - Used in IFC file to uniquely identify elements
  - Guaranteed unique

- **assembly_mark**: User-defined label (e.g., "B72", "A-1")
  - Multiple instances can have the same mark
  - Used for grouping similar assemblies
  - Not unique (intentionally - for duplicates)

### Why This Matters

In IFC files, assemblies with the same mark (e.g., B72) are intentional duplicates:
- Same design
- Same parts
- Different locations
- Different IFC IDs

We need to:
1. Track each instance separately (by ID)
2. Group identical instances (by structure)
3. Count the duplicates (quantity)
4. Display parts once (from representative)

## Impact on Other Endpoints

This fix affects only the **Dashboard details endpoint**:
- `/api/dashboard-details/{filename}`

Other endpoints unchanged:
- `/api/shipment-assemblies/{filename}` - Still shows individual instances (correct)
- `/api/management-assemblies/{filename}` - Still shows individual instances (correct)

## Testing Verified

- [x] Assembly with 1 instance: Shows Qty: 1
- [x] Assembly with 20 instances: Shows Qty: 20
- [x] Parts not duplicated within assembly view
- [x] Total assembly count accurate
- [x] Backend starts without errors
- [x] Frontend displays correctly

## Summary

**Problem**: Using `assembly_mark` as key merged all duplicate assemblies, causing wrong quantity counts.

**Solution**: Using `assembly_id` as key tracks each instance separately, then groups by structure to calculate correct quantities.

**Result**: Assembly B72 with 20 instances now correctly shows `[Qty: 20]` with parts listed once!

🎉 **Bug Fixed!**

