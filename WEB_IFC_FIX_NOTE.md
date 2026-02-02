# web-ifc Viewer Fix

## Issue Found
The web-ifc viewer was showing "Found 0 IFC products" because it was trying to query for `WebIFC.IFCPRODUCT` which is an abstract type that web-ifc doesn't directly query.

## Solution
Changed the approach to query for specific IFC element types:
- `IFCBEAM`
- `IFCCOLUMN`
- `IFCMEMBER`
- `IFCPLATE`
- `IFCFASTENER`
- `IFCMECHANICALFASTENER`
- `IFCWALL`
- `IFCSLAB`
- And other structural elements

This matches how web-ifc expects to be queried - by specific concrete types rather than abstract parent types.

## Changes Made
Updated `IFCViewerWebIFC.tsx` to:
1. Query for each specific element type
2. Collect all product IDs into a single array
3. Process geometry for each product

## Expected Result
The viewer should now find all 467 elements (matching the assembly mapping count) and display the full 3D model.

## Testing
1. Refresh the browser
2. Toggle to web-ifc viewer
3. You should now see the model loading and displaying properly
4. Console should show: `[WebIFC] Found X elements of type Y` for each type
5. Console should show: `[WebIFC] Found 467 IFC products in total` (or similar count)
6. The 3D model should appear in the viewport

