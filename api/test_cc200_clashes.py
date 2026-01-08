#!/usr/bin/env python3
"""Test clash detection for CC200-5-30-100 against all other elements"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from main import IFC_DIR
import ifcopenshell
import ifcopenshell.geom
import trimesh
import numpy as np

filename = "out3.ifc"
file_path = IFC_DIR / filename

ifc_file = ifcopenshell.open(str(file_path))
settings = ifcopenshell.geom.settings()
settings.set(settings.USE_WORLD_COORDS, True)
settings.set(settings.WELD_VERTICES, True)

# Find CC200-5-30-100
cc200_element = None
products = ifc_file.by_type("IfcProduct")
for product in products:
    desc = str(getattr(product, 'Description', None) or '')
    if 'CC200-5-30-100' in desc:
        cc200_element = product
        print(f"Found CC200-5-30-100: ID {product.id()}, Type: {product.is_a()}")
        break

if not cc200_element:
    print("CC200-5-30-100 not found!")
    sys.exit(1)

# Extract CC200 geometry
try:
    shape = ifcopenshell.geom.create_shape(settings, cc200_element)
    geometry = shape.geometry
    vertices = np.array(geometry.verts).reshape(-1, 3)
    faces = np.array(geometry.faces).reshape(-1, 3)
    mesh_cc200 = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    print(f"CC200 mesh: {len(mesh_cc200.vertices)} vertices, {len(mesh_cc200.faces)} faces")
    print(f"CC200 bounds: {mesh_cc200.bounds}")
except Exception as e:
    print(f"Error extracting CC200 geometry: {e}")
    sys.exit(1)

# Check against all other elements
print("\nChecking CC200-5-30-100 against all other elements...")
print("=" * 60)

clashes_found = []
for product in products:
    if product.id() == cc200_element.id():
        continue
    
    try:
        element_type = product.is_a()
        product_id = product.id()
        name = getattr(product, 'Name', None) or ''
        tag = getattr(product, 'Tag', None) or ''
        desc = getattr(product, 'Description', None) or ''
        element_name = str(name) if name else str(tag) if tag else f"{element_type}_{product_id}"
        
        if not hasattr(product, "Representation") or not product.Representation:
            continue
        
        shape = ifcopenshell.geom.create_shape(settings, product)
        if not shape:
            continue
        
        geometry = shape.geometry
        verts = geometry.verts
        faces = geometry.faces
        
        if len(verts) == 0 or len(faces) == 0:
            continue
        
        vertices = np.array(verts).reshape(-1, 3)
        face_indices = np.array(faces).reshape(-1, 3)
        mesh = trimesh.Trimesh(vertices=vertices, faces=face_indices, process=False)
        
        if mesh.is_empty:
            continue
        
        # Check bounding box overlap
        bbox1 = mesh_cc200.bounds
        bbox2 = mesh.bounds
        bbox1_min, bbox1_max = bbox1
        bbox2_min, bbox2_max = bbox2
        
        bbox_overlaps = not (bbox1_max[0] < bbox2_min[0] or bbox2_max[0] < bbox1_min[0] or
                            bbox1_max[1] < bbox2_min[1] or bbox2_max[1] < bbox1_min[1] or
                            bbox1_max[2] < bbox2_min[2] or bbox2_max[2] < bbox1_min[2])
        
        if not bbox_overlaps:
            continue
        
        # Check intersection
        has_clash = False
        clash_method = ""
        
        # Calculate overlap volume
        overlap_min = np.maximum(bbox1_min, bbox2_min)
        overlap_max = np.minimum(bbox1_max, bbox2_max)
        overlap_size = overlap_max - overlap_min
        overlap_volume = np.prod(overlap_size)
        bbox1_volume = np.prod(bbox1_max - bbox1_min)
        bbox2_volume = np.prod(bbox2_max - bbox2_min)
        min_volume = min(bbox1_volume, bbox2_volume)
        overlap_ratio = overlap_volume / min_volume if min_volume > 0 else 0
        
        # If overlap is significant, it's likely a clash
        if overlap_ratio > 0.1:  # 10% overlap
            has_clash = True
            clash_method = f"bbox overlap ({overlap_ratio*100:.1f}%)"
        
        # Method 1: intersection()
        if not has_clash:
            try:
                intersection = mesh_cc200.intersection(mesh)
                if intersection and not intersection.is_empty:
                    has_clash = True
                    clash_method = "intersection"
            except Exception as e:
                # If intersection fails, try other methods
                pass
        
        # Method 2: contains check
        if not has_clash:
            try:
                sample = mesh.vertices[::max(1, len(mesh.vertices) // 10)]
                inside_count = 0
                for point in sample[:20]:
                    try:
                        if mesh_cc200.contains([point])[0]:
                            inside_count += 1
                    except:
                        pass
                if inside_count >= 2:
                    has_clash = True
                    clash_method = f"contains ({inside_count} vertices)"
            except:
                pass
        
        # Method 3: reverse contains
        if not has_clash:
            try:
                sample = mesh_cc200.vertices[::max(1, len(mesh_cc200.vertices) // 10)]
                inside_count = 0
                for point in sample[:20]:
                    try:
                        if mesh.contains([point])[0]:
                            inside_count += 1
                    except:
                        pass
                if inside_count >= 2:
                    has_clash = True
                    clash_method = f"reverse contains ({inside_count} vertices)"
            except:
                pass
        
        # Method 4: Point sampling in overlap region
        if not has_clash and bbox_overlaps:
            try:
                overlap_min = np.maximum(bbox1_min, bbox2_min)
                overlap_max = np.minimum(bbox1_max, bbox2_max)
                overlap_size = overlap_max - overlap_min
                
                points_inside_both = 0
                for _ in range(20):
                    point = overlap_min + np.random.random(3) * overlap_size
                    try:
                        in_cc200 = mesh_cc200.contains([point])[0]
                        in_other = mesh.contains([point])[0]
                        if in_cc200 and in_other:
                            points_inside_both += 1
                    except:
                        pass
                
                if points_inside_both > 0:
                    has_clash = True
                    clash_method = f"overlap sampling ({points_inside_both} points)"
            except:
                pass
        
        if has_clash:
            clashes_found.append({
                'id': product_id,
                'name': element_name,
                'tag': tag,
                'type': element_type,
                'method': clash_method,
                'overlap_ratio': overlap_ratio
            })
            print(f"\nCLASH FOUND:")
            print(f"  Element: {element_name} (ID: {product_id})")
            print(f"  Tag: {tag}")
            print(f"  Type: {element_type}")
            print(f"  Method: {clash_method}")
            print(f"  Overlap ratio: {overlap_ratio*100:.2f}%")
            print(f"  CC200 bounds: {bbox1_min} to {bbox1_max}")
            print(f"  Other bounds: {bbox2_min} to {bbox2_max}")
            print(f"  Overlap region: {overlap_min} to {overlap_max}")
    
    except Exception as e:
        continue

print(f"\n\nTotal clashes found: {len(clashes_found)}")
if clashes_found:
    print("\nSummary:")
    for clash in clashes_found:
        print(f"  - {clash['name']} (ID: {clash['id']}, Tag: {clash['tag']}) - {clash['method']}")

