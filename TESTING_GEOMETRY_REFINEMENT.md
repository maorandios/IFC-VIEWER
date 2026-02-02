# Testing Guide - Geometry Refinement System

## Pre-Test Checklist

- [x] Backend running on port 8000
- [ ] Frontend running on port 5180
- [ ] Browser DevTools open (F12) for console monitoring
- [ ] IFC file with plates ready for upload

## Test Procedure

### Test 1: Fast Initial Load (Baseline)

**Objective**: Verify web-ifc fast loading still works

**Steps:**
1. Open browser: `http://localhost:5180`
2. Upload an IFC file
3. Start timer when upload completes
4. Note when 3D model appears

**Expected Results:**
- ✅ Model loads in 2-5 seconds
- ✅ All elements visible
- ✅ Camera auto-fits to model
- ✅ No errors in console

**Console Messages:**
```
✅ Loaded [N] elements with accurate geometry
```

---

### Test 2: Background Refinement Trigger

**Objective**: Verify refinement process starts automatically

**Steps:**
1. After initial load completes (Test 1)
2. Watch browser console
3. Observe loading progress indicator

**Expected Results:**
- ✅ Console shows: `[Refinement] Starting geometry refinement...`
- ✅ Console shows: `[Refinement] Identified [N] elements for refinement`
- ✅ Loading indicator shows: "Refining geometry... X/Y"
- ✅ No UI freeze during refinement

**Console Messages:**
```
[Refinement] Starting geometry refinement for 1234 meshes...
[Refinement] Identified 45 elements for refinement
```

---

### Test 3: Geometry Fetch & Processing

**Objective**: Verify server communication and geometry processing

**Steps:**
1. Watch Network tab in DevTools
2. Look for POST requests to `/api/refined-geometry/`
3. Verify response contains geometry data

**Expected Results:**
- ✅ POST requests to `/api/refined-geometry/{filename}`
- ✅ Response status: 200 OK
- ✅ Response contains `geometries` array
- ✅ Console shows: `[Refinement] Fetched X/Y refined geometries`

**Network Request:**
```
POST /api/refined-geometry/model.ifc
Request: {"element_ids": [123, 456, 789, ...]}
Response: {"geometries": [...], "count": 20}
```

**Console Messages:**
```
[Refinement] Fetched 45/45 refined geometries
[Refined] Generated geometry for IfcPlate #12345: 2456 verts, 1024 faces
```

---

### Test 4: Mesh Replacement

**Objective**: Verify seamless geometry replacement

**Steps:**
1. Watch 3D viewer during refinement
2. Note if camera moves or scene resets
3. Check if elements disappear/reappear

**Expected Results:**
- ✅ Camera position unchanged
- ✅ No visible "pop" or reload
- ✅ Elements gradually improve (if watching closely)
- ✅ Console shows: `[Refinement] Replaced mesh for element X`

**Console Messages:**
```
[Refinement] Replaced mesh for element 12345 (IfcPlate)
[Refinement] Replaced mesh for element 12346 (IfcPlate)
...
[Refinement] ✅ Successfully refined 45 elements
```

---

### Test 5: Visual Quality Comparison

**Objective**: Verify visual improvement in refined elements

**Steps:**
1. **Before refinement** (first 5 seconds):
   - Zoom into a plate element
   - Look for holes, cutouts, notches
   - Take mental note or screenshot

2. **After refinement** (after ~10-15 seconds):
   - Return to same plate
   - Compare visual quality
   - Check for accurate geometry

**Expected Results:**

**Before (web-ifc):**
- ❌ Simplified rectangles for plates
- ❌ Missing holes
- ❌ Missing cutouts
- ❌ Straight edges where cuts should be

**After (refined):**
- ✅ Accurate plate outlines
- ✅ Visible bolt holes
- ✅ Visible cutouts/notches
- ✅ Accurate edge shapes

---

### Test 6: Selection Preservation

**Objective**: Verify selection works on refined elements

**Steps:**
1. Wait for refinement to complete
2. Click on a refined plate element
3. Verify highlight appears
4. Right-click for context menu
5. Verify element data is correct

**Expected Results:**
- ✅ Element highlights on click (yellow)
- ✅ Context menu appears on right-click
- ✅ Element data shows correct:
  - Element type (IfcPlate)
  - Element ID (expressID)
  - Element name/tag
  - Properties

---

### Test 7: Interaction Consistency

**Objective**: Verify all interactions work identically

**Steps:**
1. **Hover Test**:
   - Hover over refined elements
   - Verify cursor changes
   - Verify hover highlight (if implemented)

2. **Multi-Selection Test**:
   - Ctrl+Click multiple elements (including refined ones)
   - Verify all highlight together

3. **Filter Test**:
   - Go to Dashboard/Profiles tab
   - Apply a filter to hide plates
   - Verify refined plates disappear
   - Clear filter
   - Verify refined plates reappear

**Expected Results:**
- ✅ All interactions work identically
- ✅ No difference between refined and non-refined elements
- ✅ Filters apply correctly
- ✅ Selection persists through filter changes

---

### Test 8: Camera & Navigation

**Objective**: Verify camera remains stable during refinement

**Steps:**
1. **During refinement**:
   - Zoom in/out
   - Pan (middle-mouse drag)
   - Rotate (left-mouse drag)
   - Note smoothness

2. **Before/After comparison**:
   - Position camera at specific angle before refinement
   - Note camera position
   - Wait for refinement
   - Verify camera hasn't moved

**Expected Results:**
- ✅ Camera position unchanged during refinement
- ✅ Smooth navigation during refinement
- ✅ No jumps or resets
- ✅ Orbit center unchanged

---

### Test 9: Performance & Memory

**Objective**: Verify no performance degradation

**Steps:**
1. **Before upload**:
   - Open Performance Monitor (Chrome: Shift+Esc)
   - Note baseline memory usage

2. **After initial load**:
   - Note memory increase (expected)
   - Check FPS (should be 60)

3. **During refinement**:
   - Monitor memory (shouldn't spike excessively)
   - Check FPS (should stay ~60)

4. **After refinement**:
   - Note final memory (should stabilize)
   - Verify no ongoing memory growth

**Expected Results:**
- ✅ Memory increases during load (normal)
- ✅ Memory stabilizes after refinement
- ✅ FPS stays ~60 throughout
- ✅ No memory leaks (slow growth over time)

**Acceptable Memory Profile:**
```
Before upload: ~200MB
After load: ~400-600MB (depends on model)
After refinement: ~450-700MB (10-20% overhead)
5 minutes later: Stable (no leak)
```

---

### Test 10: Error Handling

**Objective**: Verify graceful error handling

**Test 10a: Backend Offline**
1. Stop backend server
2. Upload IFC file
3. Verify initial load still works (web-ifc)
4. Verify refinement fails gracefully

**Expected:**
- ✅ Initial load works (web-ifc doesn't need backend)
- ✅ Refinement fails with console error
- ✅ No UI crash
- ✅ User can still interact with model

**Test 10b: Invalid Element IDs**
1. Modify code to request non-existent IDs
2. Upload file
3. Verify error handling

**Expected:**
- ✅ Console error message
- ✅ Refinement continues for valid elements
- ✅ No crash

---

## Success Criteria Summary

### Visual Quality ✅
- [ ] Plates show accurate outlines
- [ ] Bolt holes visible
- [ ] Cutouts/notches visible
- [ ] Matches desktop viewer quality

### Performance ✅
- [ ] Initial load: 2-5 seconds
- [ ] Refinement: 5-15 seconds
- [ ] No UI freeze
- [ ] Stable memory usage

### Interaction ✅
- [ ] Selection works
- [ ] Hover works
- [ ] Context menu works
- [ ] Filters work

### State Preservation ✅
- [ ] Camera unchanged
- [ ] Selection preserved
- [ ] Transformations preserved
- [ ] Hierarchy preserved

### User Experience ✅
- [ ] Seamless (no reload)
- [ ] Progress indication
- [ ] No artifacts
- [ ] Fast initial load

---

## Troubleshooting

### Issue: No refinement messages in console

**Check:**
1. Is backend running? `http://localhost:8000/api/health`
2. Are there plates in the model?
3. Check Network tab for failed requests
4. Check backend logs for errors

### Issue: Refinement fails with 500 error

**Check:**
1. Backend logs: `api/backend.log`
2. Does IfcOpenShell work? Test: `python -c "import ifcopenshell.geom"`
3. Is IFC file valid?

### Issue: Visual quality not improved

**Check:**
1. Did refinement complete? Look for success message
2. Are you looking at plate elements?
3. Did mesh replacement occur? Look for "Replaced mesh" messages
4. Check if geometry data was received (Network tab)

### Issue: Selection broken

**Check:**
1. Browser console for JavaScript errors
2. Verify `meshToExpressIdRef` updated (add console.log)
3. Verify raycasting still works on other elements
4. Check if event listeners still attached

---

## Test Report Template

```
## Geometry Refinement Test Report

Date: [DATE]
Tester: [NAME]
Browser: [Chrome/Firefox/Edge + Version]
Model: [IFC filename]
Model Size: [N elements, M MB]

### Results

| Test | Status | Notes |
|------|--------|-------|
| Fast Initial Load | ✅/❌ | [time] |
| Background Refinement | ✅/❌ | [issues] |
| Geometry Fetch | ✅/❌ | [requests] |
| Mesh Replacement | ✅/❌ | [count] |
| Visual Quality | ✅/❌ | [comparison] |
| Selection | ✅/❌ | [works?] |
| Interaction | ✅/❌ | [issues] |
| Camera Stability | ✅/❌ | [moved?] |
| Performance | ✅/❌ | [FPS, memory] |
| Error Handling | ✅/❌ | [graceful?] |

### Console Logs

[Paste relevant console output]

### Screenshots

[Before/After comparison]

### Issues Found

1. [Issue description]
2. [Issue description]

### Overall Assessment

- Visual Quality: [1-10]
- Performance: [1-10]
- User Experience: [1-10]
- Stability: [1-10]

### Recommendation

✅ Ready for production
⚠️ Minor issues, proceed with caution
❌ Not ready, needs fixes

### Additional Notes

[Any other observations]
```

---

## Next Steps After Testing

1. **If all tests pass ✅**:
   - Mark as production-ready
   - Document in user guide
   - Consider optional enhancements

2. **If issues found ⚠️**:
   - Document issues in detail
   - Prioritize fixes
   - Re-test after fixes

3. **Performance optimization 🚀**:
   - Profile with large models (5000+ elements)
   - Tune batch size if needed
   - Consider progressive refinement

4. **User feedback 👥**:
   - Get real user testing
   - Collect visual quality feedback
   - Iterate based on feedback

---

Good luck with testing! 🎉



