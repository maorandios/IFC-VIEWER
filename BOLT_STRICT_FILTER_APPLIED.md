# Bolt Strict Filter Applied - Exact Length Match Only

## Updated Filter Logic

**Rule:** Only display bolts where the length specified in the bolt name **exactly matches** the actual bolt length parameter.

### Simple & Strict Approach

No ratio calculations. No percentage thresholds. Just exact matching.

## Logic

```
IF bolt_name contains M{diameter}*{expected_length}
AND actual bolt_length == expected_length
THEN: Display the bolt ✅

OTHERWISE: Skip it (it's a hole or partial bolt) ❌
```

## Examples

### ✅ KEPT (Displayed in Bolts Tab)
- `BOLTM20*100` with actual length `100mm` → ✅ EXACT MATCH
- `BOLTM16*60` with actual length `60mm` → ✅ EXACT MATCH
- `BOLTM30*90` with actual length `90mm` → ✅ EXACT MATCH

### ❌ FILTERED (Not Displayed)
- `BOLTM20*40` with actual length `20mm` → ❌ Does NOT match (20 ≠ 40)
- `BOLTM20*100` with actual length `50mm` → ❌ Does NOT match (50 ≠ 100)
- `BOLTM16*25` with actual length `10mm` → ❌ Does NOT match (10 ≠ 25)

## Code Changes

### File: `api/main.py`
**Lines:** 5190-5204

```python
# STRICT FILTER: Only show bolts where the length in the name matches actual length
# Bolt name format: BOLTM{diameter}*{length}
# Example: BOLTM20*100 means diameter 20mm, length 100mm
# Only display if actual bolt_length equals the length specified in the name
if bolt_name and bolt_length:
    import re
    # Parse expected length from bolt name (e.g., "BOLTM20*100" -> 100)
    match = re.search(r'[*xX](\d+)', bolt_name)
    if match:
        expected_length = float(match.group(1))
        # Only keep bolts where actual length matches expected length
        # Example: BOLTM20*100 with actual length 100mm -> KEEP
        #          BOLTM20*40 with actual length 20mm -> SKIP (hole only)
        #          BOLTM20*100 with actual length 50mm -> SKIP (partial/hole)
        if bolt_length != expected_length:
            continue
```

## Your Specific Case

**Before:**
- `BOLTM20*40` with length `20mm` → **SHOWN** ❌ (incorrect)

**After:**
- `BOLTM20*40` with length `20mm` → **HIDDEN** ✅ (correct!)
  - Expected: 40mm
  - Actual: 20mm
  - 20 ≠ 40 → Filtered out

## Benefits of This Approach

1. ✅ **Simple:** No complex calculations or thresholds
2. ✅ **Strict:** Only real, full-length bolts are displayed
3. ✅ **Reliable:** Bolt holes (with shortened lengths) are always filtered
4. ✅ **Accurate:** Matches Tekla's bolt naming convention exactly

## How to Test

1. Go to **http://localhost:5180**
2. **Re-upload your IFC file** or refresh the dashboard
3. Navigate to the **Bolts tab**
4. Verify:
   - `BOLTM20*40` with 20mm length is **GONE** ✅
   - Only bolts with matching name/length appear
   - Total bolt count should be significantly reduced

## Status

✅ **Backend Restarted** - Process ID: 26252  
✅ **Running on:** http://localhost:8000  
✅ **Frontend Running:** http://localhost:5180  
✅ **Filter Active:** Exact length matching only

---

**Date:** 2026-01-29  
**Change:** Simplified bolt filtering to exact name/length matching  
**Previous:** Ratio-based filtering (50-60% threshold)  
**Current:** Strict equality check (name length = actual length)

