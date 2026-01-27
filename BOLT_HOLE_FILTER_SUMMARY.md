# Bolt Hole-Only Filter - Implementation Summary

## ✅ Filter Implemented!

The Bolts tab now filters out "hole-only" bolts that are used only to model holes (with hidden bolts).

---

## 🎯 **The Problem**

In Tekla Structures and other BIM software:
- Engineers sometimes need to model **holes only** without actual bolts
- To do this, they create a bolt but **hide it** (used only for hole creation)
- These hidden bolts still export to IFC as `IfcMechanicalFastener`
- They were appearing in the Bolts tab as if they were real bolts
- This inflated bolt counts and confused procurement

---

## 🔍 **Detection Method**

In Tekla Structures, hole-only bolts are identified by the **`Bolt count`** property:

```
Tekla Bolt Property Set:
├─ Bolt count: 0     ← Hole only (bolt hidden)
├─ Bolt count: 1     ← Actual bolt
└─ Bolt count: > 1   ← Multiple bolts in assembly
```

### **The Filter:**
```python
bolt_count = tekla_bolt.get("Bolt count", 1)

if bolt_count == 0:
    continue  # Skip hole-only bolts
```

---

## ✅ **What Was Implemented**

### **Backend Change (api/main.py):**

**Added:**
1. Extract `Bolt count` from "Tekla Bolt" property set
2. Check if `Bolt count == 0`
3. If zero, skip the bolt (don't add to bolts_dict)
4. Only process bolts with `Bolt count > 0`

**Code Location:**
```python
# Extract bolt data from Tekla Bolt property set
if "Tekla Bolt" in psets:
    tekla_bolt = psets["Tekla Bolt"]
    bolt_count = tekla_bolt.get("Bolt count", 1)
    
    # Skip hole-only bolts (Bolt count = 0)
    if bolt_count == 0:
        continue  # ← Filter applied here
```

---

## 📊 **Impact**

### **Before Filter:**
- Hole-only bolts appeared in Bolts tab
- Inflated bolt quantities
- Confused procurement/BOM
- Mixed actual bolts with modeling-only elements

### **After Filter:**
- Only actual bolts displayed (`Bolt count > 0`)
- Accurate quantities for procurement
- Clean BOM data
- Hole-only bolts silently filtered out

---

## 🧪 **Test Results**

**Test File:** `Mulan_-_Sloped_Gal_25.01_R4_-_U400.ifc`

```
Total IfcMechanicalFastener: 822
Bolts with count = 0 (holes): 0
Bolts with count > 0 (actual): 822

Result: No holes in this file, all bolts are real
Filter: Ready for files with hole-only bolts
```

**Note:** This particular file doesn't have hole-only bolts, but the filter is now in place for files that do.

---

## 🎯 **Use Cases**

This filter is essential for:

1. **Fabrication Shops**: Need accurate bolt counts for ordering
2. **BOM Generation**: Must exclude modeling artifacts
3. **Procurement**: Accurate quantities for purchasing
4. **Cost Estimation**: Only count real bolts, not holes
5. **Quality Control**: Verify actual bolt specifications

---

## 📝 **Technical Details**

### **Default Behavior:**
- If `Bolt count` is missing: Assume `1` (actual bolt)
- If `Bolt count` is `0`: Skip (hole only)
- If `Bolt count` is `> 0`: Include (actual bolt)

### **Property Set:**
```
"Tekla Bolt" Property Set Properties:
├─ Bolt Name: e.g., "BOLTM20*40"
├─ Bolt size: e.g., 24.0
├─ Bolt length: e.g., 20.0
├─ Bolt standard: e.g., "8.8XOX"
├─ Bolt count: 0 = hole only, >0 = actual bolt  ← KEY FIELD
├─ Nut count: Number of nuts
├─ Washer count: Number of washers
└─ ... other properties
```

### **Filter Logic:**
```
FOR EACH IfcMechanicalFastener:
    IF has "Tekla Bolt" property set:
        IF Bolt count == 0:
            SKIP (hole only)
        ELSE:
            PROCESS (actual bolt)
    ELSE:
        PROCESS (assume actual bolt if no Tekla data)
```

---

## ⚠️ **Important Notes**

1. **Safe Default**: If `Bolt count` is missing, we assume `1` (actual bolt)
   - This prevents accidentally filtering out real bolts from other software

2. **Tekla-Specific**: This filter works for Tekla Structures exports
   - Other BIM software may use different conventions

3. **No Frontend Changes**: Filter is server-side only
   - Client doesn't need to know about filtered bolts

4. **Silent Filtering**: No warnings or messages
   - Hole-only bolts are simply excluded from results

---

## 🔄 **Backend Server**

✅ **Restarted** with the new filter applied

---

## 🎉 **Result**

**The Bolts tab now shows only ACTUAL bolts!**

- ✅ Hole-only bolts are filtered out
- ✅ Accurate quantities for procurement
- ✅ Clean BOM data
- ✅ No user action required
- ✅ Works automatically for all IFC files

---

## 📖 **For Users**

**No action needed!** The filter works automatically.

When you load an IFC file:
- Actual bolts → Displayed in Bolts tab
- Hole-only bolts → Silently filtered out
- You see only real bolts that need to be procured

**Refresh your browser (Ctrl+R)** to use the updated backend with the filter!

---

## ✅ **Implementation Complete**

The hole-only bolt filter is now active and ready to prevent modeling artifacts from appearing in your Bolts tab!

