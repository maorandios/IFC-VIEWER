# Weight Data Update - GROSS Weight Implementation

## Summary
Updated the IFC weight extraction to prioritize **GROSS WEIGHT** over NET WEIGHT for all steel elements (beams, columns, members, plates).

## Changes Made

### Backend Changes (`api/main.py`)

#### Updated `get_element_weight()` function (lines 139-203)

**Previous behavior:**
- Searched for any "Weight" or "Mass" property without prioritization
- Often returned NET weight instead of GROSS weight

**New behavior - Priority order:**
1. **Tekla Quantity.Weight** (GROSS weight - includes waste/offcuts) ✅ **PRIMARY**
2. BaseQuantities.GrossWeight
3. Generic Weight property (from any property set)
4. BaseQuantities.NetWeight (fallback only)
5. Mass property (last resort)

### Why This Matters

**Example from testing (Beam ID 71):**
- **Tekla Quantity.Weight (GROSS):** 144.86 kg ✅ Now used
- **BaseQuantities.NetWeight:** 114.88 kg ❌ Previously used
- **Difference:** ~26% (30 kg difference)

The GROSS weight includes:
- Actual material weight
- Cutting waste
- Offcuts
- Manufacturing allowances

The NET weight only includes the final fabricated part weight.

## Impact on Application

### 1. Dashboard Component (`web/src/components/Dashboard.tsx`)
- **Total Tonnage**: Now shows GROSS weight
- **Profiles Tonnage**: Now shows GROSS weight
- **Plates Tonnage**: Now shows GROSS weight

All weight calculations use `report.profiles[].total_weight` and `report.plates[].total_weight`, which are now based on GROSS weight.

### 2. Model Viewer (`web/src/components/IFCViewer.tsx`)
- When clicking on elements, property sets are displayed
- The viewer shows all available weight properties from the IFC file
- Property sets still contain both GROSS and NET weights for reference

### 3. Reports and Analysis
- All steel analysis reports now use GROSS weight
- Assembly weights are aggregated from GROSS weights
- Profile and plate summaries use GROSS weight

## Testing

Created and ran test scripts to verify:
1. ✅ GROSS weight is correctly extracted from Tekla IFC files
2. ✅ Priority order works correctly
3. ✅ All 5 test beams returned GROSS weight (not NET)

## Files Modified

1. `api/main.py` - Updated `get_element_weight()` function

## Files Created (Temporary - Deleted)

- `api/test_gross_weight.py` (deleted)
- `api/test_gross_weight2.py` (deleted)
- `api/test_weight_extraction.py` (deleted)

## Deployment

Backend server has been restarted with the new changes:
- Backend API: http://localhost:8000 ✅ Running
- Frontend: http://localhost:5180 ✅ Running

## Verification Steps

To verify the changes are working:

1. Upload an IFC file through the web interface
2. Check the Dashboard tab - tonnage values should be higher (GROSS weight)
3. Click on any steel element in the 3D viewer
4. Check the property panel - you should see "Tekla Quantity.Weight" being used
5. Compare with previous reports if available - new weights should be ~20-30% higher

## Technical Notes

### IFC Property Structure (Tekla Export)

```
IfcBeam/IfcColumn/IfcMember/IfcPlate
├── Property Sets
│   ├── Tekla Quantity
│   │   └── Weight: 144.86 kg  ← GROSS (includes waste)
│   ├── BaseQuantities
│   │   └── NetWeight: 114.88 kg  ← NET (final part only)
│   └── Other property sets...
```

### Code Priority Logic

```python
# Priority 1: Tekla Quantity.Weight (GROSS)
if "Tekla Quantity" in psets and "Weight" in psets["Tekla Quantity"]:
    return float(psets["Tekla Quantity"]["Weight"])

# Priority 2: BaseQuantities.GrossWeight
# Priority 3: Generic Weight
# Priority 4: BaseQuantities.NetWeight (fallback)
# Priority 5: Mass
```

## Future Considerations

- If using non-Tekla IFC files, ensure they have proper GROSS weight properties
- Consider adding a UI toggle to switch between GROSS/NET weight views
- Add weight type indicator in reports (GROSS vs NET)




