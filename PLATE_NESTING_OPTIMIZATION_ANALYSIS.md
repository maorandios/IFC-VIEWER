# Plate Nesting Optimization Analysis 📊

## Date: 2026-01-28

## Current Problem

User reports: *"The report looks not optimized. Maybe you don't display the SVG correct and it looks like we can fit in sheets more plates rather than starting a new pattern."*

## Current Algorithm Analysis

### What's Being Used Now

**File:** `api/main.py` - `/api/generate-plate-nesting/{filename}`

```python
# Current implementation
packer = newPacker(rotation=False, pack_algo=MaxRectsBssf)
packer.add_bin(stock['width'], stock['length'])

for plate in remaining_plates:
    packer.add_rect(plate['width'], plate['length'], rid=plate['id'])

packer.pack()
```

**Library:** `rectpack` (MaxRects Binary Search First Fit algorithm)

### Current Limitations

1. **❌ No Rotation**
   ```python
   rotation=False  # Plates can't be rotated 90°
   ```
   - Many plates could fit if rotated
   - Wastes space when plate orientation doesn't match stock

2. **❌ Single-Pass Algorithm**
   - Tries to pack once
   - No optimization iterations
   - No "what-if" scenarios

3. **❌ Poor Stock Selection**
   - Tries each stock size independently
   - Picks first one that fits most plates
   - Doesn't consider utilization percentage

4. **❌ No Plate Grouping**
   - Doesn't group similar-sized plates
   - Doesn't try different sorting strategies
   - Just uses whatever order they come in

5. **❌ Limited Algorithm Choice**
   - Only uses `MaxRectsBssf`
   - Other algorithms might perform better
   - No comparison between algorithms

### Geometry-Based Nesting

**File:** `api/polygon_nesting.py`

```python
def greedy_nesting(plates, stock_width, stock_length, gap=5.0):
    # Sort plates by area (largest first)
    sorted_plates = sorted(plates, key=lambda p: p.area, reverse=True)
    
    # Simple row-based placement
    current_x = gap
    current_y = gap
    row_height = 0
    
    for plate in sorted_plates:
        # Try to place in current row
        if current_x + plate_width + gap <= stock_width:
            place_plate(...)
            current_x += plate_width + gap
        # Try next row
        elif current_y + row_height + gap + plate_height <= stock_length:
            current_y += row_height + gap
            current_x = gap
            place_plate(...)
```

**Problems:**
- ❌ Very basic left-to-right, top-to-bottom placement
- ❌ No intelligent space filling
- ❌ Doesn't consider gaps between plates
- ❌ No rotation support
- ❌ No backtracking

## Visualization Issues

### SVG Display Problems

Looking at the nesting visualization code, there might be issues:

1. **Scaling Issues**
   - Plates might appear smaller/larger than actual
   - Stock boundaries might be incorrect
   - Gap spacing might not be visible

2. **Coordinate System**
   - SVG uses top-left origin
   - Nesting algorithm might use different origin
   - Transformations might be incorrect

3. **Overlapping Detection**
   - No visual indication if plates overlap
   - Hard to verify packing correctness

## Recommended Improvements

### Priority 1: Enable Rotation

```python
# Change from:
packer = newPacker(rotation=False, pack_algo=MaxRectsBssf)

# To:
packer = newPacker(rotation=True, pack_algo=MaxRectsBssf)
```

**Expected Improvement:** 15-30% better utilization

### Priority 2: Try Multiple Algorithms

```python
algorithms = [
    MaxRectsBssf,   # Binary Search First Fit
    MaxRectsBl,     # Bottom-Left
    MaxRectsBaf,    # Best Area Fit
    MaxRectsBlsf,   # Bottom-Left Sort Fit
]

best_result = None
for algo in algorithms:
    packer = newPacker(rotation=True, pack_algo=algo)
    # ... pack and evaluate
    if better_than(result, best_result):
        best_result = result
```

**Expected Improvement:** 5-15% better utilization

### Priority 3: Better Sorting Strategies

```python
sorting_strategies = [
    lambda p: p.area,                          # Largest area first
    lambda p: max(p.width, p.length),          # Longest dimension first
    lambda p: min(p.width, p.length),          # Shortest dimension first
    lambda p: p.width * p.length,              # Area (redundant but try)
    lambda p: p.width / p.length,              # Aspect ratio
]

for sort_key in sorting_strategies:
    sorted_plates = sorted(plates, key=sort_key, reverse=True)
    # ... try packing
```

**Expected Improvement:** 5-10% better utilization

### Priority 4: Multi-Pass Optimization

```python
def optimize_nesting(plates, stock_configs, iterations=10):
    best_result = None
    
    for i in range(iterations):
        # Try different approaches
        if i < 3:
            # First 3: Try different algorithms
            algo = algorithms[i]
        elif i < 6:
            # Next 3: Try different sorting
            shuffle(plates)  # Random order
        else:
            # Last 4: Try different rotations
            force_rotation = random.choice([True, False])
        
        result = pack_with_settings(...)
        
        if better_than(result, best_result):
            best_result = result
    
    return best_result
```

**Expected Improvement:** 10-20% better utilization

### Priority 5: Gap Optimization

Currently using fixed 5mm gap. Could optimize:

```python
# Try different gap sizes
gaps = [2, 5, 10]  # mm

for gap in gaps:
    result = pack_with_gap(plates, gap)
    # Smaller gap = more plates, but tighter cutting
```

**Expected Improvement:** 3-8% better utilization

### Priority 6: Stock Selection Intelligence

```python
def select_best_stock(remaining_plates, stock_configs):
    # Calculate total area needed
    total_area = sum(p.area for p in remaining_plates)
    
    # Find stock with best utilization potential
    candidates = []
    for stock in stock_configs:
        stock_area = stock.width * stock.length
        potential_util = (total_area / stock_area) * 100
        
        if potential_util > 50:  # Only if >50% utilization possible
            candidates.append((stock, potential_util))
    
    # Sort by potential utilization
    candidates.sort(key=lambda x: x[1], reverse=True)
    
    return candidates[0][0] if candidates else stock_configs[0]
```

**Expected Improvement:** 5-10% better stock usage

## Implementation Plan

### Phase 1: Quick Wins (30 minutes)

1. ✅ Enable rotation: `rotation=True`
2. ✅ Try all 4 MaxRects algorithms
3. ✅ Pick best result

**Expected:** 20-40% improvement

### Phase 2: Sorting Optimization (1 hour)

1. ✅ Implement multiple sorting strategies
2. ✅ Test each strategy
3. ✅ Pick best combination

**Expected:** Additional 10-15% improvement

### Phase 3: Multi-Pass (2 hours)

1. ✅ Implement iterative optimization
2. ✅ Add different packing strategies
3. ✅ Score and compare results

**Expected:** Additional 10-20% improvement

### Phase 4: Visualization Fix (1 hour)

1. ✅ Verify SVG coordinates
2. ✅ Add rotation visualization
3. ✅ Show utilization percentage
4. ✅ Highlight gaps/waste

**Expected:** Better user confidence in results

## Success Metrics

### Current Performance (Estimated)
- Utilization: 50-60%
- Rotation: No
- Algorithms: 1 (MaxRectsBssf)
- Optimization: None

### Target Performance
- Utilization: 75-85%
- Rotation: Yes
- Algorithms: 4 (try all, pick best)
- Optimization: Multi-pass with iterations

### Improvement Goals
- ✅ 30-50% better utilization
- ✅ Fewer stock sheets needed
- ✅ Less waste
- ✅ Rotation for better fit
- ✅ Visual confidence in results

## Testing Strategy

1. **Benchmark Current**
   - Run nesting on sample file
   - Record: sheets used, utilization%, waste

2. **Apply Rotation**
   - Enable rotation
   - Compare results

3. **Add Algorithms**
   - Try all 4 algorithms
   - Compare best vs current

4. **Full Optimization**
   - Multi-pass with all improvements
   - Final comparison

5. **Visual Verification**
   - Check SVG display matches algorithm
   - Verify no overlaps
   - Confirm dimensions

## Recommendation

**Start with Phase 1** - Quick wins with rotation and multiple algorithms. This will give immediate 20-40% improvement with minimal code changes.

Then evaluate if Phase 2-4 are needed based on results.

---

**Next Steps:**
1. Review current nesting results with user
2. Implement rotation + multi-algorithm
3. Test and compare
4. Deploy if satisfactory


