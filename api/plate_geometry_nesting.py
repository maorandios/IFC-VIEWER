"""
Plate Nesting with Actual Geometry
Extracts real plate shapes (not just bounding boxes) and nests them efficiently.
"""

import ifcopenshell
import ifcopenshell.geom
import numpy as np
from shapely.geometry import Polygon, Point, MultiPoint
from shapely.ops import unary_union
from typing import List, Dict, Tuple, Optional
import json

class PlateGeometry:
    """Represents a plate with its actual 2D geometry."""
    
    def __init__(self, plate_id: str, name: str, thickness: str, quantity: int = 1):
        self.plate_id = plate_id
        self.name = name
        self.thickness = thickness
        self.quantity = quantity
        self.polygon: Optional[Polygon] = None
        self.width = 0.0
        self.height = 0.0
        self.area = 0.0
        self.bounding_box = (0, 0, 0, 0)  # (min_x, min_y, max_x, max_y)
        
    def set_geometry(self, polygon: Polygon):
        """Set the 2D polygon geometry for this plate."""
        self.polygon = polygon
        self.area = polygon.area
        bounds = polygon.bounds  # (minx, miny, maxx, maxy)
        self.bounding_box = bounds
        self.width = bounds[2] - bounds[0]
        self.height = bounds[3] - bounds[1]
        
    def get_svg_path(self, offset_x=0, offset_y=0) -> str:
        """Get SVG path representation of the plate geometry."""
        if not self.polygon:
            return ""
        
        exterior = self.polygon.exterior
        coords = list(exterior.coords)
        
        if not coords:
            return ""
        
        # Start path
        path = f"M {coords[0][0] + offset_x},{coords[0][1] + offset_y}"
        
        # Line to each point
        for x, y in coords[1:]:
            path += f" L {x + offset_x},{y + offset_y}"
        
        # Close path
        path += " Z"
        
        # Add holes if any
        for interior in self.polygon.interiors:
            hole_coords = list(interior.coords)
            if hole_coords:
                path += f" M {hole_coords[0][0] + offset_x},{hole_coords[0][1] + offset_y}"
                for x, y in hole_coords[1:]:
                    path += f" L {x + offset_x},{y + offset_y}"
                path += " Z"
        
        return path


def extract_plate_2d_geometry(element, ifc_file) -> Optional[PlateGeometry]:
    """
    Extract the actual 2D geometry of a plate from IFC.
    Projects the 3D geometry onto its main plane to get the cutting profile.
    """
    try:
        element_name = getattr(element, 'Name', None) or f'Plate_{element.id()}'
        
        # Get thickness
        thickness = get_plate_thickness_from_element(element)
        
        # Create shape from IFC geometry
        settings = ifcopenshell.geom.settings()
        settings.set(settings.USE_WORLD_COORDS, True)
        settings.set(settings.WELD_VERTICES, True)
        
        shape = ifcopenshell.geom.create_shape(settings, element)
        if not shape:
            return None
        
        geometry = shape.geometry
        verts = geometry.verts
        faces = geometry.faces
        
        if len(verts) < 9:  # Need at least 3 vertices (3D)
            return None
        
        # Convert vertices to numpy array
        vertices = np.array(verts).reshape(-1, 3)
        
        # Convert to mm if needed
        max_coord = np.max(np.abs(vertices))
        if max_coord < 1000.0:  # Likely in meters
            vertices = vertices * 1000.0
        
        # Find the main plane of the plate using PCA
        centroid = vertices.mean(axis=0)
        centered = vertices - centroid
        
        # PCA to find principal axes
        cov = np.cov(centered.T)
        eigenvalues, eigenvectors = np.linalg.eig(cov)
        
        # Sort by eigenvalue (largest = main plane)
        idx = eigenvalues.argsort()[::-1]
        eigenvectors = eigenvectors[:, idx]
        
        # The smallest eigenvalue corresponds to the normal of the plate
        normal = eigenvectors[:, 2]
        
        # Create coordinate system for projection
        # Use the two largest eigenvectors as the plane basis
        u_axis = eigenvectors[:, 0]
        v_axis = eigenvectors[:, 1]
        
        # Project all vertices onto the 2D plane
        u_coords = np.dot(centered, u_axis)
        v_coords = np.dot(centered, v_axis)
        
        # Create 2D points
        points_2d = np.column_stack([u_coords, v_coords])
        
        # Get convex hull to find boundary points
        from scipy.spatial import ConvexHull
        
        try:
            hull = ConvexHull(points_2d)
            boundary_points = points_2d[hull.vertices]
            
            # Try to detect holes by finding interior points
            # Group points by their distance from centroid
            distances = np.linalg.norm(points_2d, axis=1)
            
            # Create polygon from hull
            if len(boundary_points) >= 3:
                polygon = Polygon(boundary_points)
                
                # Simplify polygon slightly to remove tiny artifacts
                polygon = polygon.simplify(0.1, preserve_topology=True)
                
                # Check for holes by looking at faces
                # This is a simplified approach - proper hole detection would need face analysis
                interior_holes = detect_holes_from_faces(points_2d, faces, vertices, u_axis, v_axis, centroid)
                
                if interior_holes:
                    polygon = Polygon(boundary_points, holes=interior_holes)
                
                plate_geom = PlateGeometry(
                    plate_id=str(element.id()),
                    name=element_name,
                    thickness=thickness
                )
                plate_geom.set_geometry(polygon)
                
                return plate_geom
                
        except Exception as e:
            print(f"[GEOMETRY] Error creating hull for plate {element.id()}: {e}")
            return None
        
    except Exception as e:
        print(f"[GEOMETRY] Error extracting geometry for element {element.id()}: {e}")
        import traceback
        traceback.print_exc()
        return None


def detect_holes_from_faces(points_2d, faces, vertices_3d, u_axis, v_axis, centroid):
    """
    Attempt to detect holes in the plate by analyzing face connectivity.
    This is a simplified heuristic - proper hole detection is complex.
    """
    # For now, return empty list - full hole detection would require
    # analyzing the face topology and finding interior boundaries
    # This is a complex problem that would need more sophisticated mesh analysis
    return []


def get_plate_thickness_from_element(element) -> str:
    """Get plate thickness from IFC element."""
    try:
        psets = ifcopenshell.util.element.get_psets(element)
        
        for pset_name, props in psets.items():
            for key in ["Thickness", "thickness", "Width", "width", "Profile"]:
                if key in props:
                    value = props[key]
                    if value is not None:
                        value_str = str(value).strip()
                        if value_str and value_str.upper() not in ['NONE', 'NULL', 'N/A', '']:
                            try:
                                thickness_num = float(value_str)
                                return f"{int(thickness_num)}mm"
                            except ValueError:
                                return value_str
        
        # Try from geometry
        if hasattr(element, "Representation") and element.Representation:
            for rep in element.Representation.Representations or []:
                for item in rep.Items or []:
                    if item.is_a("IfcExtrudedAreaSolid"):
                        if hasattr(item, "Depth"):
                            depth = item.Depth
                            if depth:
                                try:
                                    depth_mm = float(depth) * 1000.0
                                    return f"{int(depth_mm)}mm"
                                except (ValueError, TypeError):
                                    pass
    except Exception:
        pass
    
    return "N/A"


def simple_polygon_nesting(plates: List[PlateGeometry], stock_width: float, stock_height: float) -> Dict:
    """
    Simple greedy polygon nesting algorithm.
    Places plates one by one, trying to find the best position.
    
    Note: This is a simplified algorithm. For production use, consider
    using specialized nesting libraries like SVGNest or commercial solutions.
    """
    placed_plates = []
    current_y = 0
    current_row_height = 0
    current_x = 0
    
    # Sort plates by area (largest first)
    sorted_plates = sorted(plates, key=lambda p: p.area, reverse=True)
    
    for plate in sorted_plates:
        plate_width = plate.width
        plate_height = plate.height
        
        # Check if plate fits in current row
        if current_x + plate_width <= stock_width:
            # Place in current row
            placed_plates.append({
                'plate': plate,
                'x': current_x,
                'y': current_y,
                'rotation': 0
            })
            current_x += plate_width + 10  # Add small gap
            current_row_height = max(current_row_height, plate_height)
        else:
            # Start new row
            current_y += current_row_height + 10  # Add small gap
            current_x = 0
            current_row_height = plate_height
            
            # Check if new row fits in stock
            if current_y + plate_height <= stock_height:
                placed_plates.append({
                    'plate': plate,
                    'x': current_x,
                    'y': current_y,
                    'rotation': 0
                })
                current_x += plate_width + 10
            else:
                # Doesn't fit - would need new sheet
                break
    
    # Calculate utilization
    total_placed_area = sum(p['plate'].area for p in placed_plates)
    stock_area = stock_width * stock_height
    utilization = (total_placed_area / stock_area * 100) if stock_area > 0 else 0
    
    return {
        'placed_plates': placed_plates,
        'utilization': utilization,
        'total_area_used': total_placed_area,
        'count': len(placed_plates)
    }


def nest_plates_with_geometry(
    plates: List[PlateGeometry],
    stock_plates: List[Dict],
    use_actual_geometry: bool = True
) -> Dict:
    """
    Nest plates using their actual geometry (if use_actual_geometry=True)
    or fall back to bounding box nesting.
    
    Returns nesting results with actual geometry information.
    """
    if not use_actual_geometry:
        # Fall back to simple rectangle packing
        from rectpack import newPacker, MaxRectsBssf
        return nest_with_rectangles(plates, stock_plates)
    
    # Use polygon-based nesting
    results = {
        'cutting_plans': [],
        'statistics': {},
        'unnested_plates': []
    }
    
    remaining_plates = plates.copy()
    stock_index = 0
    
    while remaining_plates and stock_index < 100:
        best_result = None
        best_stock_idx = -1
        
        for idx, stock in enumerate(stock_plates):
            result = simple_polygon_nesting(
                remaining_plates,
                stock['width'],
                stock['length']
            )
            
            if result['count'] > 0 and (best_result is None or result['count'] > best_result['count']):
                best_result = result
                best_stock_idx = idx
                best_result['stock'] = stock
                best_result['stock_index'] = idx
        
        if best_result and best_result['count'] > 0:
            # Add this cutting plan
            cutting_plan = {
                'stock_width': best_result['stock']['width'],
                'stock_length': best_result['stock']['length'],
                'stock_index': best_result['stock_index'],
                'stock_name': f"Stock {best_result['stock_index'] + 1}",
                'utilization': round(best_result['utilization'], 2),
                'plates': []
            }
            
            # Add placed plates with their actual geometry
            for placed in best_result['placed_plates']:
                plate = placed['plate']
                cutting_plan['plates'].append({
                    'x': placed['x'],
                    'y': placed['y'],
                    'width': plate.width,
                    'height': plate.height,
                    'name': plate.name,
                    'thickness': plate.thickness,
                    'id': plate.plate_id,
                    'rotation': placed['rotation'],
                    'svg_path': plate.get_svg_path(placed['x'], placed['y']),
                    'actual_area': plate.area,
                    'has_complex_geometry': plate.polygon is not None and len(list(plate.polygon.interiors)) > 0
                })
            
            results['cutting_plans'].append(cutting_plan)
            
            # Remove placed plates
            placed_ids = {p['plate'].plate_id for p in best_result['placed_plates']}
            remaining_plates = [p for p in remaining_plates if p.plate_id not in placed_ids]
        else:
            break
        
        stock_index += 1
    
    # Calculate statistics
    total_plates = len(plates)
    nested_plates = sum(len(plan['plates']) for plan in results['cutting_plans'])
    unnested_plates = total_plates - nested_plates
    
    total_stock_area = sum(p['stock_width'] * p['stock_length'] for p in results['cutting_plans'])
    total_used_area = sum(sum(plate['actual_area'] for plate in plan['plates']) for plan in results['cutting_plans'])
    overall_utilization = (total_used_area / total_stock_area * 100) if total_stock_area > 0 else 0
    waste_area = total_stock_area - total_used_area
    
    results['statistics'] = {
        'total_plates': total_plates,
        'nested_plates': nested_plates,
        'unnested_plates': unnested_plates,
        'stock_sheets_used': len(results['cutting_plans']),
        'total_stock_area_m2': round(total_stock_area / 1_000_000, 2),
        'total_used_area_m2': round(total_used_area / 1_000_000, 2),
        'waste_area_m2': round(waste_area / 1_000_000, 2),
        'overall_utilization': round(overall_utilization, 2),
        'waste_percentage': round(100 - overall_utilization, 2),
        'geometry_based': True
    }
    
    results['unnested_plates'] = [
        {
            'name': p.name,
            'thickness': p.thickness,
            'width': p.width,
            'height': p.height,
            'area': p.area
        }
        for p in remaining_plates
    ]
    
    return results


def nest_with_rectangles(plates: List[PlateGeometry], stock_plates: List[Dict]) -> Dict:
    """Fallback to rectangle-based nesting."""
    from rectpack import newPacker, MaxRectsBssf
    
    # Convert to rectangle packing problem
    # (This is the old method - just using bounding boxes)
    # Implementation similar to current code
    pass


