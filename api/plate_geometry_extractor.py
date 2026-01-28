"""
Plate Geometry Extraction for Optimized Nesting
Extracts actual 2D plate shapes from IFC 3D geometry.
"""

import ifcopenshell
import ifcopenshell.geom
import numpy as np
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
from scipy.spatial import ConvexHull
from typing import Optional, Tuple, List
import traceback


class PlateGeometry:
    """Represents a plate with its actual 2D geometry."""
    
    def __init__(self, element_id: int, name: str, thickness: str):
        self.element_id = element_id
        self.name = name
        self.thickness = thickness
        self.polygon: Optional[Polygon] = None
        self.width = 0.0
        self.length = 0.0
        self.area = 0.0
        self.bounding_box = (0, 0, 0, 0)  # (min_x, min_y, max_x, max_y)
        
    def set_geometry(self, polygon: Polygon):
        """Set the 2D polygon geometry for this plate."""
        if not polygon or polygon.is_empty:
            return
            
        self.polygon = polygon
        self.area = polygon.area
        bounds = polygon.bounds  # (minx, miny, maxx, maxy)
        self.bounding_box = bounds
        self.width = bounds[2] - bounds[0]
        self.length = bounds[3] - bounds[1]
        
    def get_svg_path(self, offset_x=0, offset_y=0) -> str:
        """Get SVG path representation of the plate geometry."""
        if not self.polygon or self.polygon.is_empty:
            return ""
        
        # Exterior boundary
        exterior = self.polygon.exterior
        coords = list(exterior.coords)
        
        if not coords:
            return ""
        
        # Start path
        path_parts = [f"M {coords[0][0] + offset_x:.2f},{coords[0][1] + offset_y:.2f}"]
        
        # Line to each point
        for x, y in coords[1:]:
            path_parts.append(f"L {x + offset_x:.2f},{y + offset_y:.2f}")
        
        # Close path
        path_parts.append("Z")
        
        # Add holes if any
        for interior in self.polygon.interiors:
            hole_coords = list(interior.coords)
            if hole_coords:
                path_parts.append(f"M {hole_coords[0][0] + offset_x:.2f},{hole_coords[0][1] + offset_y:.2f}")
                for x, y in hole_coords[1:]:
                    path_parts.append(f"L {x + offset_x:.2f},{y + offset_y:.2f}")
                path_parts.append("Z")
        
        return " ".join(path_parts)
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization."""
        return {
            'element_id': self.element_id,
            'name': self.name,
            'thickness': self.thickness,
            'width': round(self.width, 2),
            'length': round(self.length, 2),
            'area': round(self.area, 2),
            'bounding_box': self.bounding_box,
            'has_geometry': self.polygon is not None,
            'has_holes': len(list(self.polygon.interiors)) > 0 if self.polygon else False
        }


def extract_plate_2d_geometry(element, settings=None) -> Optional[PlateGeometry]:
    """
    Extract the actual 2D geometry of a plate from IFC element.
    Projects the 3D geometry onto its main plane to get the cutting profile.
    
    Args:
        element: IFC element (IfcPlate)
        settings: Optional geometry settings
        
    Returns:
        PlateGeometry object or None if extraction fails
    """
    try:
        element_id = element.id()
        element_name = getattr(element, 'Name', None) or f'Plate_{element_id}'
        
        # Get thickness from properties
        thickness = extract_thickness(element)
        
        # Create geometry settings if not provided
        if settings is None:
            settings = ifcopenshell.geom.settings()
            settings.set(settings.USE_WORLD_COORDS, True)
            settings.set(settings.WELD_VERTICES, True)
        
        # Create shape from IFC geometry
        try:
            shape = ifcopenshell.geom.create_shape(settings, element)
        except Exception as shape_error:
            print(f"[GEOM] Failed to create shape for plate {element_id}: {shape_error}")
            return None
        
        if not shape:
            return None
        
        geometry = shape.geometry
        verts = geometry.verts
        faces = geometry.faces
        
        if len(verts) < 9:  # Need at least 3 vertices (3 coords each)
            return None
        
        # Convert vertices to numpy array
        vertices = np.array(verts).reshape(-1, 3)
        
        # Convert to mm if in meters
        max_coord = np.max(np.abs(vertices))
        if max_coord < 1000.0:  # Likely in meters
            vertices = vertices * 1000.0
        
        # Determine plate orientation - find thickness axis
        bbox_min = vertices.min(axis=0)
        bbox_max = vertices.max(axis=0)
        dimensions = bbox_max - bbox_min
        thickness_axis = np.argmin(dimensions)
        
        print(f"[GEOM] Plate {element_id} dims: X={dimensions[0]:.1f}, Y={dimensions[1]:.1f}, Z={dimensions[2]:.1f}, thickness_axis={thickness_axis}")
        
        # Project using faces for accurate geometry with holes
        if len(faces) >= 3:
            faces_array = np.array(faces).reshape(-1, 3)
            polygon = project_with_faces_aligned(vertices, faces_array, thickness_axis)
        else:
            polygon = project_to_aligned_plane(vertices, thickness_axis)
        
        if polygon and not polygon.is_empty and polygon.is_valid:
            plate_geom = PlateGeometry(element_id, element_name, thickness)
            plate_geom.set_geometry(polygon)
            
            print(f"[GEOM] Extracted geometry for {element_name}: "
                  f"{plate_geom.width:.1f}x{plate_geom.length:.1f}mm, "
                  f"area={plate_geom.area:.0f}mm², "
                  f"holes={len(list(polygon.interiors))}")
            
            return plate_geom
        else:
            print(f"[GEOM] Invalid polygon for plate {element_id}")
            return None
        
    except Exception as e:
        print(f"[GEOM] Error extracting geometry for element {element.id() if hasattr(element, 'id') else 'unknown'}: {e}")
        traceback.print_exc()
        return None


def project_to_2d_plane(vertices: np.ndarray) -> Optional[Polygon]:
    """
    Project 3D vertices onto their main 2D plane using PCA.
    
    Args:
        vertices: Nx3 array of 3D coordinates
        
    Returns:
        Shapely Polygon or None
    """
    try:
        if len(vertices) < 3:
            return None
        
        # Center the points
        centroid = vertices.mean(axis=0)
        centered = vertices - centroid
        
        # PCA to find principal axes
        cov = np.cov(centered.T)
        eigenvalues, eigenvectors = np.linalg.eig(cov)
        
        # Sort by eigenvalue (largest first)
        idx = eigenvalues.argsort()[::-1]
        eigenvalues = eigenvalues[idx]
        eigenvectors = eigenvectors[:, idx]
        
        # Use the two largest eigenvectors as the plane basis
        u_axis = eigenvectors[:, 0]
        v_axis = eigenvectors[:, 1]
        
        # Project all vertices onto the 2D plane
        u_coords = np.dot(centered, u_axis)
        v_coords = np.dot(centered, v_axis)
        
        # Create 2D points
        points_2d = np.column_stack([u_coords, v_coords])
        
        # Remove duplicate points
        unique_points = np.unique(points_2d, axis=0)
        
        if len(unique_points) < 3:
            return None
        
        # Get convex hull
        try:
            hull = ConvexHull(unique_points)
            boundary_points = unique_points[hull.vertices]
            
            # Create polygon
            polygon = Polygon(boundary_points)
            
            # Simplify slightly to remove tiny artifacts
            polygon = polygon.simplify(0.5, preserve_topology=True)
            
            # Buffer slightly to clean up geometry
            polygon = polygon.buffer(0.1)
            
            if polygon.is_valid and not polygon.is_empty:
                return polygon
            else:
                return None
                
        except Exception as hull_error:
            print(f"[GEOM] ConvexHull error: {hull_error}")
            # Fallback: try creating polygon directly from points
            try:
                polygon = Polygon(unique_points)
                if polygon.is_valid:
                    return polygon.simplify(0.5, preserve_topology=True)
            except:
                pass
            return None
        
    except Exception as e:
        print(f"[GEOM] Error in 2D projection: {e}")
        return None


def project_to_aligned_plane(vertices: np.ndarray, thickness_axis: int) -> Optional[Polygon]:
    """
    Project vertices to 2D by removing the thickness axis.
    This keeps the plate aligned to world axes (not tilted).
    
    Args:
        vertices: Nx3 array of 3D vertices
        thickness_axis: 0=X, 1=Y, 2=Z (axis to remove)
    
    Returns:
        Shapely Polygon
    """
    try:
        # Project by removing thickness axis
        if thickness_axis == 0:  # Remove X, keep Y-Z
            points_2d = vertices[:, [1, 2]]
        elif thickness_axis == 1:  # Remove Y, keep X-Z  
            points_2d = vertices[:, [0, 2]]
        else:  # Remove Z, keep X-Y
            points_2d = vertices[:, [0, 1]]
        
        # Remove duplicates
        unique_points = np.unique(points_2d, axis=0)
        
        if len(unique_points) < 3:
            return None
        
        # Use convex hull as fallback
        hull = ConvexHull(unique_points)
        boundary_points = unique_points[hull.vertices]
        polygon = Polygon(boundary_points)
        
        if polygon.is_valid:
            return polygon.simplify(0.5, preserve_topology=True)
        return None
        
    except Exception as e:
        print(f"[GEOM] Error in aligned projection: {e}")
        return None


def project_with_faces_aligned(vertices: np.ndarray, faces: np.ndarray, thickness_axis: int) -> Optional[Polygon]:
    """
    Project 3D mesh to 2D using face information to preserve exact geometry including holes.
    Aligns to world axes (not tilted).
    
    Args:
        vertices: Nx3 array of 3D vertices
        faces: Mx3 array of triangle face indices
        thickness_axis: 0=X, 1=Y, 2=Z (axis to remove)
    
    Returns:
        Shapely Polygon with holes
    """
    try:
        from shapely.ops import unary_union
        from shapely.geometry import Polygon as ShapelyPolygon
        
        # Project vertices to 2D
        if thickness_axis == 0:  # Remove X, keep Y-Z
            points_2d = vertices[:, [1, 2]]
        elif thickness_axis == 1:  # Remove Y, keep X-Z
            points_2d = vertices[:, [0, 2]]
        else:  # Remove Z, keep X-Y
            points_2d = vertices[:, [0, 1]]
        
        print(f"[GEOM] Projecting {len(faces)} faces to 2D")
        
        # Convert each triangular face to a polygon
        face_polygons = []
        for face in faces:
            try:
                tri_points = points_2d[face]
                
                # Check if triangle has area
                p1, p2, p3 = tri_points[0], tri_points[1], tri_points[2]
                area = 0.5 * abs((p2[0] - p1[0]) * (p3[1] - p1[1]) - (p3[0] - p1[0]) * (p2[1] - p1[1]))
                
                if area > 0.01:  # Skip degenerate triangles
                    tri_poly = ShapelyPolygon(tri_points)
                    if tri_poly.is_valid:
                        face_polygons.append(tri_poly)
            except:
                continue
        
        if not face_polygons:
            print(f"[GEOM] No valid face polygons, using fallback")
            return project_to_aligned_plane(vertices, thickness_axis)
        
        print(f"[GEOM] Created {len(face_polygons)} valid face polygons")
        
        # Merge all triangles into one polygon (automatically detects holes)
        merged = unary_union(face_polygons)
        
        print(f"[GEOM] Merged result type: {merged.geom_type}")
        
        # Handle different result types
        if merged.geom_type == 'Polygon':
            num_holes = len(list(merged.interiors))
            print(f"[GEOM] Single polygon with {num_holes} holes, area={merged.area:.0f}")
            return merged
            
        elif merged.geom_type == 'MultiPolygon':
            # Take largest polygon, treat others as holes if they're inside
            polys = list(merged.geoms)
            polys.sort(key=lambda p: p.area, reverse=True)
            outer = polys[0]
            
            # Find holes
            holes = []
            for poly in polys[1:]:
                if outer.contains(poly.centroid):
                    holes.append(list(poly.exterior.coords))
            
            if holes:
                print(f"[GEOM] MultiPolygon: using largest with {len(holes)} holes")
                return ShapelyPolygon(outer.exterior.coords, holes=holes)
            else:
                print(f"[GEOM] MultiPolygon: using largest polygon only")
                return outer
        else:
            print(f"[GEOM] Unexpected type {merged.geom_type}, using fallback")
            return project_to_aligned_plane(vertices, thickness_axis)
        
    except Exception as e:
        print(f"[GEOM] Error in face-based projection: {e}")
        traceback.print_exc()
        return project_to_aligned_plane(vertices, thickness_axis)


def extract_thickness(element) -> str:
    """Extract plate thickness from IFC element properties."""
    try:
        import ifcopenshell.util.element
        psets = ifcopenshell.util.element.get_psets(element)
        
        # Check property sets for thickness
        for pset_name, props in psets.items():
            for key in ["Thickness", "thickness", "Width", "width", "Profile", "NominalThickness"]:
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
        
        # Try from geometry representation
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


def extract_all_plate_geometries(ifc_file, selected_element_ids=None) -> List[PlateGeometry]:
    """
    Extract geometry for all plates in an IFC file.
    
    Args:
        ifc_file: Opened IFC file object
        selected_element_ids: Optional list of element IDs to extract (None = all)
        
    Returns:
        List of PlateGeometry objects
    """
    print(f"[GEOM] Starting plate geometry extraction...")
    
    geometries = []
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    settings.set(settings.WELD_VERTICES, True)
    
    plates = ifc_file.by_type("IfcPlate")
    print(f"[GEOM] Found {len(plates)} plates in IFC file")
    
    for element in plates:
        element_id = element.id()
        
        # Skip if we have a selection and this isn't in it
        if selected_element_ids is not None and element_id not in selected_element_ids:
            continue
        
        plate_geom = extract_plate_2d_geometry(element, settings)
        
        if plate_geom:
            geometries.append(plate_geom)
    
    print(f"[GEOM] Successfully extracted {len(geometries)} plate geometries")
    
    return geometries


def create_bounding_box_geometry(width: float, length: float, element_id: int, 
                                 name: str, thickness: str) -> PlateGeometry:
    """
    Create a simple rectangular geometry (fallback when extraction fails).
    
    Args:
        width: Plate width in mm
        length: Plate length in mm
        element_id: Element ID
        name: Plate name
        thickness: Plate thickness
        
    Returns:
        PlateGeometry with rectangular polygon
    """
    plate_geom = PlateGeometry(element_id, name, thickness)
    
    # Create rectangle
    rectangle = Polygon([
        (0, 0),
        (width, 0),
        (width, length),
        (0, length)
    ])
    
    plate_geom.set_geometry(rectangle)
    
    return plate_geom

