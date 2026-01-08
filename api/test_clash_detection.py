#!/usr/bin/env python3
"""Test script to debug clash detection for specific elements"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from main import IFC_DIR
import ifcopenshell
import ifcopenshell.geom
import trimesh
import numpy as np

def test_clash_detection(filename):
    """Test clash detection for specific elements"""
    file_path = IFC_DIR / filename
    
    if not file_path.exists():
        print(f"File not found: {file_path}")
        return
    
    print(f"Testing clash detection for: {filename}")
    print("=" * 60)
    
    ifc_file = ifcopenshell.open(str(file_path))
    
    # Settings for geometry extraction
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    settings.set(settings.WELD_VERTICES, True)
    settings.set(settings.DISABLE_OPENING_SUBTRACTIONS, False)
    
    # Find target elements
    target_names = ['CC200-5-30-100', 'b38', 'b39', 'CC200', 'B38', 'B39']
    target_elements = []
    
    products = ifc_file.by_type("IfcProduct")
    print(f"\nTotal products: {len(products)}")
    
    # First, list all element names to see what we have
    print("\nListing all element names/tags:")
    all_names = []
    for product in products[:50]:  # First 50
        element_type = product.is_a()
        product_id = product.id()
        name = getattr(product, 'Name', None) or ''
        tag = getattr(product, 'Tag', None) or ''
        desc = getattr(product, 'Description', None) or ''
        element_name = str(name) if name else str(tag) if tag else f"{element_type}_{product_id}"
        all_names.append((element_name, product_id, element_type, str(desc)))
        if len(all_names) <= 20:  # Print first 20
            print(f"  ID {product_id}: Name='{name}', Tag='{tag}', Desc='{desc}', Type={element_type}")
    
    print(f"\nSearching for target elements...")
    print("Searching for b38 and b39...")
    for product in products:
        element_type = product.is_a()
        product_id = product.id()
        name = getattr(product, 'Name', None) or ''
        tag = getattr(product, 'Tag', None) or ''
        desc = getattr(product, 'Description', None) or ''
        element_name = str(name) if name else str(tag) if tag else f"{element_type}_{product_id}"
        
        # Check if this is a target element (check name, tag, description)
        search_text = f"{name} {tag} {desc}".upper()
        for target in target_names:
            if target.upper() in search_text:
                target_elements.append({
                    'product': product,
                    'product_id': product_id,
                    'element_name': element_name,
                    'element_type': element_type,
                    'name': name,
                    'tag': tag,
                    'description': desc
                })
                print(f"\nFound target element: {element_name} (ID: {product_id}, Type: {element_type})")
                print(f"  Name: '{name}', Tag: '{tag}', Description: '{desc}'")
                break
        
        # Also check if tag is exactly 'b38' or 'b39' (case insensitive)
        if tag and tag.lower() in ['b38', 'b39']:
            if not any(e['product_id'] == product_id for e in target_elements):
                target_elements.append({
                    'product': product,
                    'product_id': product_id,
                    'element_name': element_name,
                    'element_type': element_type,
                    'name': name,
                    'tag': tag,
                    'description': desc
                })
                print(f"\nFound target element by tag: {element_name} (ID: {product_id}, Type: {element_type})")
                print(f"  Name: '{name}', Tag: '{tag}', Description: '{desc}'")
    
    if len(target_elements) < 2:
        print(f"\nERROR: Only found {len(target_elements)} target elements. Need at least 2.")
        print("Searching for similar names...")
        for product in products:
            name = getattr(product, 'Name', None) or ''
            tag = getattr(product, 'Tag', None) or ''
            element_name = str(name) if name else str(tag) if tag else ''
            if 'CC200' in element_name.upper() or 'B38' in element_name.upper() or 'B39' in element_name.upper():
                print(f"  - {element_name} (ID: {product.id()}, Type: {product.is_a()})")
        return
    
    # Extract geometries for target elements
    print(f"\nExtracting geometries...")
    element_meshes = []
    element_info = []
    
    for elem_data in target_elements:
        product = elem_data['product']
        product_id = elem_data['product_id']
        
        try:
            if not hasattr(product, "Representation") or not product.Representation:
                print(f"  {elem_data['element_name']}: No representation")
                continue
            
            shape = ifcopenshell.geom.create_shape(settings, product)
            if not shape:
                print(f"  {elem_data['element_name']}: Failed to create shape")
                continue
            
            geometry = shape.geometry
            verts = geometry.verts
            faces = geometry.faces
            
            if len(verts) == 0 or len(faces) == 0:
                print(f"  {elem_data['element_name']}: No vertices or faces")
                continue
            
            vertices = np.array(verts).reshape(-1, 3)
            face_indices = np.array(faces).reshape(-1, 3)
            
            mesh = trimesh.Trimesh(vertices=vertices, faces=face_indices, process=False)
            
            if mesh.is_empty:
                print(f"  {elem_data['element_name']}: Empty mesh")
                continue
            
            print(f"  {elem_data['element_name']}: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces")
            print(f"    Bounds: {mesh.bounds}")
            print(f"    Centroid: {mesh.centroid}")
            print(f"    Is watertight: {mesh.is_watertight}")
            
            element_meshes.append(mesh)
            element_info.append(elem_data)
            
        except Exception as e:
            print(f"  {elem_data['element_name']}: Error - {e}")
            import traceback
            traceback.print_exc()
    
    if len(element_meshes) < 2:
        print(f"\nERROR: Only extracted {len(element_meshes)} meshes. Need at least 2.")
        return
    
    # Test clash detection between pairs
    print(f"\nTesting clash detection between {len(element_meshes)} elements...")
    print("=" * 60)
    
    for i in range(len(element_meshes)):
        for j in range(i + 1, len(element_meshes)):
            mesh1 = element_meshes[i]
            mesh2 = element_meshes[j]
            info1 = element_info[i]
            info2 = element_info[j]
            
            print(f"\nChecking: {info1['element_name']} <-> {info2['element_name']}")
            print("-" * 60)
            
            # Bounding box check
            bbox1 = mesh1.bounds
            bbox2 = mesh2.bounds
            bbox1_min, bbox1_max = bbox1
            bbox2_min, bbox2_max = bbox2
            
            bbox_overlaps = not (bbox1_max[0] < bbox2_min[0] or bbox2_max[0] < bbox1_min[0] or
                                bbox1_max[1] < bbox2_min[1] or bbox2_max[1] < bbox1_min[1] or
                                bbox1_max[2] < bbox2_min[2] or bbox2_max[2] < bbox1_min[2])
            
            print(f"Bounding boxes overlap: {bbox_overlaps}")
            if bbox_overlaps:
                overlap_min = np.maximum(bbox1_min, bbox2_min)
                overlap_max = np.minimum(bbox1_max, bbox2_max)
                overlap_size = overlap_max - overlap_min
                overlap_volume = np.prod(overlap_size)
                print(f"  Overlap volume: {overlap_volume:.6f}")
            
            # Method 1: intersects()
            try:
                intersects_result = mesh1.intersects(mesh2)
                print(f"mesh1.intersects(mesh2): {intersects_result}")
            except Exception as e:
                print(f"mesh1.intersects(mesh2): ERROR - {e}")
                intersects_result = False
            
            # Method 2: contains check
            print("Testing contains check...")
            sample1 = mesh1.vertices[::max(1, len(mesh1.vertices) // 10)]
            sample2 = mesh2.vertices[::max(1, len(mesh2.vertices) // 10)]
            
            inside_1_in_2 = 0
            inside_2_in_1 = 0
            
            for point in sample1[:20]:  # Test first 20
                try:
                    if mesh2.contains([point])[0]:
                        inside_1_in_2 += 1
                except:
                    pass
            
            for point in sample2[:20]:  # Test first 20
                try:
                    if mesh1.contains([point])[0]:
                        inside_2_in_1 += 1
                except:
                    pass
            
            print(f"  Vertices from {info1['element_name']} inside {info2['element_name']}: {inside_1_in_2}/{len(sample1[:20])}")
            print(f"  Vertices from {info2['element_name']} inside {info1['element_name']}: {inside_2_in_1}/{len(sample2[:20])}")
            
            # Method 3: Point sampling in overlap region
            if bbox_overlaps:
                print("Testing point sampling in overlap region...")
                overlap_min = np.maximum(bbox1_min, bbox2_min)
                overlap_max = np.minimum(bbox1_max, bbox2_max)
                overlap_size = overlap_max - overlap_min
                
                points_inside_both = 0
                for _ in range(20):
                    point = overlap_min + np.random.random(3) * overlap_size
                    try:
                        in_mesh1 = mesh1.contains([point])[0]
                        in_mesh2 = mesh2.contains([point])[0]
                        if in_mesh1 and in_mesh2:
                            points_inside_both += 1
                    except:
                        pass
                
                print(f"  Points inside both meshes: {points_inside_both}/20")
            
            # Summary
            print(f"\nSUMMARY:")
            print(f"  Bounding boxes overlap: {bbox_overlaps}")
            print(f"  Intersects: {intersects_result}")
            print(f"  Contains check (1->2): {inside_1_in_2} vertices")
            print(f"  Contains check (2->1): {inside_2_in_1} vertices")
            
            is_clash = (intersects_result or 
                       inside_1_in_2 >= 2 or 
                       inside_2_in_1 >= 2 or
                       (bbox_overlaps and points_inside_both > 0))
            
            print(f"  CLASH DETECTED: {is_clash}")

if __name__ == "__main__":
    # Get filename from command line or use default
    if len(sys.argv) > 1:
        filename = sys.argv[1]
    else:
        # Try to find the most recent IFC file
        ifc_files = list(IFC_DIR.glob("*.ifc")) + list(IFC_DIR.glob("*.IFC"))
        if ifc_files:
            filename = ifc_files[-1].name
            print(f"Using most recent file: {filename}")
        else:
            print("No IFC files found. Please specify filename.")
            sys.exit(1)
    
    test_clash_detection(filename)

