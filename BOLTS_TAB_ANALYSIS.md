# Bolts Tab - Feasibility Analysis

## Executive Summary

**✅ YES - A Bolts tab is HIGHLY FEASIBLE and recommended!**

The analysis of the IFC file `Mulan_-_Sloped_Gal_25.01_R4_-_U400.ifc` shows excellent data availability for bolts and fasteners.

---

## Data Availability

### 1. **Standard IFC Fasteners Found**
- **822 IfcMechanicalFastener entities** detected
- **184 additional fastener-like elements** (anchor rods, etc.)
- **Total: 1,006 unique fasteners/bolts**

### 2. **Data Available from Tekla Bolt Property Set**

Each `IfcMechanicalFastener` contains a **"Tekla Bolt"** property set with rich data:

```
Property Set: Tekla Bolt
├─ Bolt Name: "BOLTM20*40"
├─ Bolt standard: "8.8XOX"
├─ Bolt size: 24.0 (mm)
├─ Bolt length: 20.0 (mm)
├─ Bolt count: 1
├─ Bolt hole diameter: 24.0 (mm)
├─ Location: "Site"
├─ Nut name: "NUTM20-GR8-HEX"
├─ Nut type: "GR8-HEX"
├─ Nut count: 0
├─ Washer name: "WASHERM20-FLAT-E"
├─ Washer type: "FLAT-E"
├─ Washer diameter: 20.0 (mm)
├─ Washer count: 0
├─ Slotted hole x: 0.0
└─ Slotted hole y: 0.0
```

### 3. **Additional Fasteners (Non-standard)**
Found in other IFC types (IfcBeam, etc.) with fastener keywords:
- **Anchor Rods**: "ANCHOR ROD ADIT MTPX M16X220"
- Can be identified by name/tag/description keywords

---

## Proposed Bolts Tab Structure

### **Main Table Columns:**

| Column | Data Source | Example |
|--------|-------------|---------|
| **Bolt Name** | Tekla Bolt > "Bolt Name" or Name attribute | BOLTM20*40 |
| **Bolt Type** | IFC Type | IfcMechanicalFastener |
| **Size (mm)** | Tekla Bolt > "Bolt size" | 24.0 |
| **Length (mm)** | Tekla Bolt > "Bolt length" | 20.0 |
| **Standard** | Tekla Bolt > "Bolt standard" | 8.8XOX |
| **Location** | Tekla Bolt > "Location" | Site / Factory |
| **Quantity** | Count of identical bolts | 15 |
| **Assembly** | Related assembly (via spatial structure) | A-123 |
| **Preview** | 3D view button | [View 3D] |

### **Optional Expandable Details:**
When row is expanded, show:
- **Nut Information**: Name, Type, Count
- **Washer Information**: Name, Type, Diameter, Count
- **Hole Information**: Diameter, Slotted hole dimensions
- **Weight**: If available in property sets

---

## Implementation Approach

### **Backend Changes Needed:**

1. **New API Endpoint**: `/api/dashboard-details/{filename}` (already exists)
   - Add `bolts` array to response (similar to profiles and plates)

2. **Data Extraction Logic**:
   ```python
   # Identify bolts
   - IfcMechanicalFastener entities
   - IfcFastener entities
   - Elements with fastener keywords in name/tag/description
   
   # Extract data
   - Get "Tekla Bolt" property set
   - Extract bolt name, size, length, standard
   - Get assembly association
   - Group identical bolts and count quantity
   ```

3. **Grouping Strategy**:
   Group bolts by: `(bolt_name, size, length, standard)` to get quantities

### **Frontend Changes Needed:**

1. **New Component**: `BoltsTab.tsx`
   - Similar structure to ProfilesTab and PlatesTab
   - Summary cards at top (total bolts, % of project, quantity)
   - Filterable table with search
   - 3D preview functionality

2. **Add Tab**: In `App.tsx`, add "Bolts" tab next to Profiles and Plates

---

## Benefits of Adding Bolts Tab

1. **Complete Project Overview**: Users can see ALL components (assemblies, profiles, plates, AND bolts)
2. **Bolt Management**: Track bolt specifications and quantities for procurement
3. **Quality Control**: Verify correct bolt types are specified
4. **Cost Estimation**: Calculate bolt costs based on quantities
5. **BOM Generation**: Include fasteners in Bill of Materials
6. **Site vs Factory**: Track which bolts are for site vs factory assembly

---

## Example Data Structure

### Backend Response:
```json
{
  "profiles": [...],
  "plates": [...],
  "assemblies": [...],
  "bolts": [
    {
      "bolt_name": "BOLTM20*40",
      "bolt_type": "IfcMechanicalFastener",
      "size": 24.0,
      "length": 20.0,
      "standard": "8.8XOX",
      "location": "Site",
      "quantity": 156,
      "nut_name": "NUTM20-GR8-HEX",
      "nut_type": "GR8-HEX",
      "washer_name": "WASHERM20-FLAT-E",
      "washer_type": "FLAT-E",
      "assembly_marks": ["A-1", "A-2", "B-3"],
      "ids": [84, 109, 115, ...]
    },
    {
      "bolt_name": "ANCHOR ROD ADIT MTPX M16X220",
      "bolt_type": "IfcBeam",
      "size": 16.0,
      "length": 220.0,
      "standard": "ADIT MTPX",
      "location": "Site",
      "quantity": 48,
      "ids": [4922, 4949, ...]
    }
  ]
}
```

---

## Recommendations

### **Phase 1: Basic Implementation** ✅ Recommended
- Add Bolts tab with main table showing:
  - Bolt name, size, length, standard, quantity
  - Filter by bolt name, size, standard
  - 3D preview
  - Summary cards (total quantity, unique types)

### **Phase 2: Advanced Features** (Optional)
- Expandable rows showing nut/washer details
- Assembly filtering (show bolts in specific assembly)
- Export bolt list to Excel/CSV
- Bolt weight calculation (if data available)
- Group by assembly

### **Phase 3: Advanced Analytics** (Future)
- Bolt usage heatmap
- Cost estimation (with price database)
- Compliance checking (verify standards)

---

## Technical Notes

1. **Existing Infrastructure**: The codebase already has:
   - `FASTENER_TYPES` constant defined
   - `is_fastener_like()` function for detection
   - Fastener counting in place
   - Fastener color coding in 3D viewer

2. **Minimal Backend Changes**: Most of the detection logic exists, just needs:
   - Data collection and grouping
   - Adding bolts array to response

3. **Frontend Pattern**: Can follow exact same pattern as ProfilesTab and PlatesTab

---

## Conclusion

**The Bolts tab is not only feasible but highly recommended!**

- ✅ Rich data available in IFC files
- ✅ Clear use case and value proposition
- ✅ Existing infrastructure in place
- ✅ Consistent with current UI patterns
- ✅ Low implementation effort (2-3 hours)

**Recommendation: Proceed with Phase 1 implementation**

