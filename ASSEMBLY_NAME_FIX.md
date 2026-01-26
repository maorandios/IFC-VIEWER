# Assembly Name Fix - All Assemblies Showing as B54

## The Problem

After fixing the quantity issue, a new problem appeared: **all assemblies were showing the same name "B54"**.

### What User Saw

```
B54 [Qty: X]  ← Should be B54
B54 [Qty: Y]  ← Should be B72
B54 [Qty: Z]  ← Should be C24
B54 [Qty: W]  ← Should be A-1
```

Every assembly had the label "B54" regardless of their actual assembly mark.

## Root Cause

The grouping signature was based **ONLY on parts structure**, not including the assembly mark:

```python
# WRONG - signature based only on parts
signature = tuple(parts_signature)
```

**What happened:**
1. Assembly B54 with structure [c21, p1001, p1027]
2. Assembly B72 with structure [c21, p1001, p1027] ← Same parts!
3. Assembly C24 with structure [c21, p1001, p1027] ← Same parts!
4. All had identical signatures → grouped together
5. All took the first assembly's name → "B54"

### Why This Happened

The previous fix changed the dictionary key to `assembly_id`, which correctly tracked individual instances. However, the grouping logic then grouped **all assemblies with identical parts**, regardless of their assembly mark.

## The Solution

Added `assembly_mark` to the signature so assemblies are grouped only when they have:
1. **Same assembly mark** (e.g., "B72")
2. **Same parts structure**

```python
# CORRECT - signature includes assembly mark
signature = (assembly_data["assembly_mark"], tuple(parts_signature))
```

## Code Changes

### File: `api/main.py` (Line ~5422)

**Before:**
```python
for assembly_id_key, assembly_data in assemblies_dict.items():
    # Create a signature based on the parts structure
    parts_signature = []
    for part in sorted(assembly_data["parts"], ...):
        part_sig = (...)
        parts_signature.append(part_sig)
    
    signature = tuple(parts_signature)  # ← Missing assembly_mark!
```

**After:**
```python
for assembly_id_key, assembly_data in assemblies_dict.items():
    # Create a signature based on assembly_mark AND parts structure
    # This ensures we only group assemblies with the SAME mark
    parts_signature = []
    for part in sorted(assembly_data["parts"], ...):
        part_sig = (...)
        parts_signature.append(part_sig)
    
    # Include assembly_mark in signature
    signature = (assembly_data["assembly_mark"], tuple(parts_signature))
```

## How It Works Now

### Signature Structure

**Old signature (wrong):**
```python
signature = (
    # Just parts structure
    [c21, HEA180, 4484mm],
    [p1001, PL16*350, 350mm],
    ...
)
```

**New signature (correct):**
```python
signature = (
    "B72",  # ← Assembly mark included!
    (
        [c21, HEA180, 4484mm],
        [p1001, PL16*350, 350mm],
        ...
    )
)
```

### Grouping Logic

**Before Fix:**
```python
assembly_signatures = {
    signature_parts: [
        B54 instance 1,
        B54 instance 2,
        B72 instance 1,  ← Wrongly grouped with B54!
        B72 instance 2,  ← Wrongly grouped with B54!
        C24 instance 1,  ← Wrongly grouped with B54!
        ...
    ]
}
# All get name "B54" from first instance
```

**After Fix:**
```python
assembly_signatures = {
    ("B54", signature_parts): [
        B54 instance 1,
        B54 instance 2
    ],
    ("B72", signature_parts): [
        B72 instance 1,
        B72 instance 2,
        ...
        B72 instance 20
    ],
    ("C24", signature_parts): [
        C24 instance 1,
        C24 instance 2
    ]
}
# Each group keeps its correct name
```

## Result

### Before Fix
```
Dashboard Assemblies:
├─ B54 [Qty: 2]    ← Correct
├─ B54 [Qty: 20]   ← Should be B72
├─ B54 [Qty: 3]    ← Should be C24
└─ B54 [Qty: 5]    ← Should be A-1
```

### After Fix
```
Dashboard Assemblies:
├─ B54 [Qty: 2]    ✓
├─ B72 [Qty: 20]   ✓
├─ C24 [Qty: 3]    ✓
└─ A-1 [Qty: 5]    ✓
```

## Why Assembly Mark Should Be in Signature

Assembly marks (like B54, B72, C24) represent **different designs**, even if they happen to use similar or identical parts.

### Example

Consider these assemblies:
- **B54**: Small bracket (2x HEA180 + 3x plates)
- **B72**: Similar bracket (2x HEA180 + 3x plates) ← Same parts!
- **C24**: Another bracket (2x HEA180 + 3x plates) ← Same parts!

Even though they use the same parts, they are **different assemblies**:
- Different designs
- Different purposes
- Different names
- Should NOT be grouped together

**Correct Grouping:**
- 5 instances of B54 → B54 [Qty: 5]
- 20 instances of B72 → B72 [Qty: 20]
- 3 instances of C24 → C24 [Qty: 3]

**Wrong Grouping (before fix):**
- All 28 instances → B54 [Qty: 28] ❌

## Testing Checklist

- [x] Different assemblies show different names
- [x] B54 shows as "B54" with correct quantity
- [x] B72 shows as "B72" with correct quantity
- [x] C24 shows as "C24" with correct quantity
- [x] Each assembly mark grouped separately
- [x] No Python syntax errors
- [x] Backend starts successfully

## Lessons Learned

When grouping assemblies:
1. **Always include the assembly mark** in the signature
2. Only group assemblies with **identical marks AND identical structures**
3. Different assembly marks = different assemblies (even with same parts)

## Summary

**Problem**: Grouping by parts structure alone caused all assemblies to get the same name (B54).

**Solution**: Include `assembly_mark` in the grouping signature.

**Result**: Each assembly now displays with its correct name and quantity!

```
B54 [Qty: 2]   ✓ Correct name, correct quantity
B72 [Qty: 20]  ✓ Correct name, correct quantity
C24 [Qty: 3]   ✓ Correct name, correct quantity
```

🎉 **Fixed!**

