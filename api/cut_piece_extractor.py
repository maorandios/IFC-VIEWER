"""
Cut Piece Extractor for IFC Files

Extracts reliable cut piece representations from IFC elements including:
- Centerline start/end points in world coordinates
- Piece local axis (unit direction vector)
- True length along axis
- Profile type/size
- End cut planes for matching complementary slopes
"""

import numpy as np
import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element
import ifcopenshell.util.placement
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass


@dataclass
class EndCut:
    """Represents an end cut plane and angle."""
    normal: np.ndarray  # [x, y, z] unit vector in world coords
    angle_deg: float    # Angle from perpendicular (0 = square, >0 = miter)
    plane_d: float      # Plane equation: n·x + d = 0
    confidence: float   # 0-1, how confident we are in this detection
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "normal": [float(x) for x in self.normal.tolist()],
            "angle_deg": float(self.angle_deg),
            "plane_d": float(self.plane_d),
            "confidence": float(self.confidence)
        }


@dataclass
class CutPiece:
    """Complete representation of a cut piece for nesting."""
    express_id: int
    element_type: str  # "IfcBeam", "IfcColumn", "IfcMember"
    profile_key: str   # e.g. "IPE200", "RHS200x100x5"
    length: float      # True length along axis (in mm)
    axis_world: np.ndarray  # [x, y, z] unit direction vector
    start_world: np.ndarray  # [x, y, z] start point
    end_world: np.ndarray    # [x, y, z] end point
    end_cuts: Dict[str, Optional[EndCut]]  # {"start": EndCut, "end": EndCut}
    source_method: str  # "ifc_native" or "mesh_based"
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "express_id": self.express_id,
            "element_type": self.element_type,
            "profile_key": self.profile_key,
            "length": float(self.length),
            "axis_world": self.axis_world.tolist(),
            "start_world": self.start_world.tolist(),
            "end_world": self.end_world.tolist(),
            "end_cuts": {
                "start": self.end_cuts["start"].to_dict() if self.end_cuts["start"] else None,
                "end": self.end_cuts["end"].to_dict() if self.end_cuts["end"] else None
            },
            "source_method": self.source_method
        }


class CutPieceExtractor:
    """Extracts cut piece information from IFC elements."""
    
    def __init__(self, ifc_file, unit_scale: Optional[float] = None):
        self.ifc_file = ifc_file
        if ifc_file is not None:
            self.unit_scale = unit_scale or self._detect_unit_scale()
        else:
            # For temporary extractors used only for comparison
            self.unit_scale = unit_scale or 1.0
        self.tolerances = {
            "axis_colinear": 0.9995,
            "angle_deg": 1.0,
            "plane_residual_mm": 2.0 * (1000.0 if self.unit_scale == 1.0 else 1.0),  # 2mm equivalent
            "end_slice_percent": 0.01  # 1% of length
        }
        if ifc_file is not None:
            print(f"[CUT_PIECE] Initialized with unit_scale={self.unit_scale}, tolerances={self.tolerances}")
    
    def _detect_unit_scale(self) -> float:
        """Detect if IFC is in meters or mm. Returns scale factor (1.0 for meters, 0.001 for mm)."""
        if self.ifc_file is None:
            return 1.0  # Default to meters
        
        # Sample a few beams to determine typical scale
        try:
            products = self.ifc_file.by_type("IfcBeam")
            if not products:
                products = self.ifc_file.by_type("IfcColumn")
            if not products:
                return 1.0  # Default to meters
        except Exception as e:
            print(f"[CUT_PIECE] Error detecting unit scale: {e}")
            return 1.0  # Default to meters
        
        lengths = []
        for product in products[:10]:  # Sample first 10
            try:
                length = self._get_length_from_ifc(product)
                if length and length > 0:
                    lengths.append(length)
            except:
                pass
        
        if not lengths:
            return 1.0
        
        if not lengths:
            print(f"[CUT_PIECE] No lengths found, defaulting to mm (common in Tekla)")
            return 0.001  # Default to mm for Tekla exports
        
        avg_length = np.mean(lengths)
        print(f"[CUT_PIECE] Sampled lengths: {lengths[:5]}... (showing first 5)")
        print(f"[CUT_PIECE] Average length: {avg_length:.2f}")
        
        # If average length < 1.0, likely meters; if > 1000, likely mm
        # For steel beams, typical lengths are 1-20 meters (1000-20000mm)
        # So if avg_length is between 1-1000, it's ambiguous
        if avg_length < 1.0:
            print(f"[CUT_PIECE] Detected units: meters (avg length: {avg_length:.2f})")
            return 1.0  # meters
        elif avg_length > 1000:
            print(f"[CUT_PIECE] Detected units: mm (avg length: {avg_length:.2f})")
            return 0.001  # mm to meters (scale factor to convert mm to meters)
        else:
            # Ambiguous case: could be meters (e.g., 12.0 = 12m) or mm (e.g., 12.0 = 12mm)
            # For steel construction, lengths are typically 1-30 meters (1000-30000mm)
            # Tekla often exports in mm, so if value is > 10, it's likely mm (e.g., 12000mm = 12m)
            # If value is < 10, it could be meters (e.g., 9.0m) or mm (e.g., 9.0mm - too short for beam)
            if avg_length > 10.0:
                print(f"[CUT_PIECE] Ambiguous units (avg length: {avg_length:.2f}), assuming mm (common in Tekla)")
                return 0.001  # mm to meters
            else:
                print(f"[CUT_PIECE] Ambiguous units (avg length: {avg_length:.2f}), assuming meters")
                return 1.0  # meters
    
    def _get_length_from_ifc(self, element) -> Optional[float]:
        """Get length from IFC ExtrudedAreaSolid if available."""
        try:
            if not hasattr(element, "Representation") or not element.Representation:
                return None
            
            for rep in element.Representation.Representations:
                for item in rep.Items:
                    if item.is_a("IfcExtrudedAreaSolid"):
                        if hasattr(item, "Depth"):
                            return float(item.Depth)
        except:
            pass
        return None
    
    def extract_cut_piece(self, element) -> Optional[CutPiece]:
        """Extract cut piece information from an IFC element."""
        element_type = element.is_a()
        if element_type not in {"IfcBeam", "IfcColumn", "IfcMember"}:
            return None
        
        element_id = element.id()
        
        # Try IFC-native extraction first
        cut_piece = self._extract_from_ifc_native(element)
        
        # Fall back to mesh-based if IFC-native failed
        if not cut_piece:
            cut_piece = self._extract_from_mesh(element)
        
        if cut_piece:
            print(f"[CUT_PIECE] Extracted {element_id}: {cut_piece.profile_key}, length={cut_piece.length:.1f}mm, method={cut_piece.source_method}")
            if cut_piece.end_cuts["start"]:
                print(f"  Start cut: {cut_piece.end_cuts['start'].angle_deg:.1f}° (confidence: {cut_piece.end_cuts['start'].confidence:.2f})")
            if cut_piece.end_cuts["end"]:
                print(f"  End cut: {cut_piece.end_cuts['end'].angle_deg:.1f}° (confidence: {cut_piece.end_cuts['end'].confidence:.2f})")
        
        return cut_piece
    
    def _extract_from_ifc_native(self, element) -> Optional[CutPiece]:
        """Method A: Extract from IFC-native geometry (IfcExtrudedAreaSolid)."""
        try:
            if not hasattr(element, "Representation") or not element.Representation:
                return None
            
            # Get ObjectPlacement transform to world
            try:
                if not hasattr(element, "ObjectPlacement") or not element.ObjectPlacement:
                    print(f"[CUT_PIECE] Element {element.id()} has no ObjectPlacement")
                    return None
                placement_matrix = ifcopenshell.util.placement.get_local_placement(element.ObjectPlacement)
                if placement_matrix is None:
                    print(f"[CUT_PIECE] Could not get placement matrix for element {element.id()}")
                    return None
            except Exception as e:
                print(f"[CUT_PIECE] Could not get placement matrix for element {element.id()}: {e}")
                import traceback
                traceback.print_exc()
                return None
            
            # Find IfcExtrudedAreaSolid in representation (handle IfcBooleanClippingResult)
            extruded_solid = None
            
            def find_extruded_solid(item):
                """Recursively find IfcExtrudedAreaSolid, handling IfcBooleanClippingResult."""
                if item.is_a("IfcExtrudedAreaSolid"):
                    return item
                elif item.is_a("IfcBooleanClippingResult"):
                    # Check FirstOperand and SecondOperand
                    if hasattr(item, "FirstOperand") and item.FirstOperand:
                        result = find_extruded_solid(item.FirstOperand)
                        if result:
                            return result
                    if hasattr(item, "SecondOperand") and item.SecondOperand:
                        result = find_extruded_solid(item.SecondOperand)
                        if result:
                            return result
                elif hasattr(item, "Items"):
                    # Handle IfcMappedItem or similar
                    for sub_item in item.Items:
                        result = find_extruded_solid(sub_item)
                        if result:
                            return result
                return None
            
            for rep in element.Representation.Representations:
                for item in rep.Items:
                    extruded_solid = find_extruded_solid(item)
                    if extruded_solid:
                        break
                if extruded_solid:
                    break
            
            if not extruded_solid:
                print(f"[CUT_PIECE] No IfcExtrudedAreaSolid found in representation for element {element.id()}")
                return None
            
            # Get extrusion direction and depth
            if not hasattr(extruded_solid, "ExtrudedDirection") or not hasattr(extruded_solid, "Depth"):
                return None
            
            # Get local axis from ExtrudedDirection
            try:
                dir_ratios = extruded_solid.ExtrudedDirection.DirectionRatios
                local_direction = np.array([
                    float(dir_ratios[0]),
                    float(dir_ratios[1]),
                    float(dir_ratios[2])
                ])
                local_direction = local_direction / np.linalg.norm(local_direction)
            except Exception as e:
                print(f"[CUT_PIECE] Error extracting ExtrudedDirection: {e}")
                return None
            
            depth = float(extruded_solid.Depth)
            print(f"[CUT_PIECE] Raw depth from IFC: {depth}, unit_scale: {self.unit_scale}")
            
            # Smart unit detection: if depth > 100, it's likely already in mm (steel beams are typically 1-30m = 1000-30000mm)
            # If depth < 100, it could be meters (e.g., 12.0m) or mm (e.g., 12.0mm - too short for a beam)
            # For values > 100, assume mm (common in Tekla exports)
            if depth > 100.0:
                # Likely already in mm, no conversion needed
                depth_mm = depth
                print(f"[CUT_PIECE] Depth > 100, assuming mm (no conversion): {depth_mm}mm")
            elif self.unit_scale == 1.0:
                # IFC is in meters, convert to mm
                depth_mm = depth * 1000.0
                print(f"[CUT_PIECE] Converting from meters to mm: {depth}m = {depth_mm}mm")
            else:
                # IFC is already in mm (unit_scale = 0.001)
                depth_mm = depth
                print(f"[CUT_PIECE] Already in mm (no conversion): {depth_mm}mm")
            
            depth = depth_mm
            
            # Get position transform from IfcAxis2Placement3D
            local_origin = np.array([0.0, 0.0, 0.0])
            local_x = np.array([1.0, 0.0, 0.0])
            local_y = np.array([0.0, 1.0, 0.0])
            local_z = np.array([0.0, 0.0, 1.0])
            
            if hasattr(extruded_solid, "Position"):
                pos = extruded_solid.Position
                try:
                    # Extract local origin
                    if hasattr(pos, "Location") and hasattr(pos.Location, "Coordinates"):
                        coords = pos.Location.Coordinates
                        local_origin = np.array([
                            float(coords[0]),
                            float(coords[1]),
                            float(coords[2])
                        ])
                        if self.unit_scale == 1.0:  # meters
                            local_origin = local_origin * 1000.0
                    
                    # Get local axes if available
                    if hasattr(pos, "Axis") and pos.Axis:
                        axis_ratios = pos.Axis.DirectionRatios
                        local_z = np.array([
                            float(axis_ratios[0]),
                            float(axis_ratios[1]),
                            float(axis_ratios[2])
                        ])
                        local_z = local_z / np.linalg.norm(local_z)
                    
                    if hasattr(pos, "RefDirection") and pos.RefDirection:
                        ref_ratios = pos.RefDirection.DirectionRatios
                        local_x = np.array([
                            float(ref_ratios[0]),
                            float(ref_ratios[1]),
                            float(ref_ratios[2])
                        ])
                        local_x = local_x / np.linalg.norm(local_x)
                        local_y = np.cross(local_z, local_x)
                        local_y = local_y / np.linalg.norm(local_y)
                except Exception as e:
                    print(f"[CUT_PIECE] Error extracting Position: {e}")
                    # Use defaults
            
            # Compose local transform matrix
            local_matrix = np.eye(4)
            local_matrix[:3, 0] = local_x
            local_matrix[:3, 1] = local_y
            local_matrix[:3, 2] = local_z
            local_matrix[:3, 3] = local_origin
            
            # Transform to world: M_world = placement_matrix * local_matrix
            M_world = placement_matrix @ local_matrix
            
            # Transform local direction to world
            local_dir_homogeneous = np.append(local_direction, 0)  # [x, y, z, 0]
            axis_world_homogeneous = M_world @ local_dir_homogeneous
            axis_world = axis_world_homogeneous[:3]
            axis_world = axis_world / np.linalg.norm(axis_world)
            
            # Get origin in world
            origin_world = M_world[:3, 3]
            
            # Calculate endpoints
            start_world = origin_world
            end_world = origin_world + axis_world * depth
            
            # Get profile key
            profile_key = self._extract_profile_key(extruded_solid, element)
            
            # Extract end cuts (will use mesh for this)
            end_cuts = {"start": None, "end": None}
            
            cut_piece = CutPiece(
                express_id=element.id(),
                element_type=element.is_a(),
                profile_key=profile_key or "UNKNOWN",
                length=depth,
                axis_world=axis_world,
                start_world=start_world,
                end_world=end_world,
                end_cuts=end_cuts,
                source_method="ifc_native"
            )
            
            # Now extract end cuts using mesh (hybrid approach)
            cut_piece.end_cuts = self._detect_end_cuts_from_mesh(element, cut_piece)
            
            return cut_piece
            
        except Exception as e:
            element_id = element.id() if hasattr(element, 'id') else 'unknown'
            print(f"[CUT_PIECE] IFC-native extraction failed for {element_id}: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _extract_from_mesh(self, element) -> Optional[CutPiece]:
        """Method B: Extract from mesh geometry (fallback)."""
        try:
            import ifcopenshell.geom
            
            settings = ifcopenshell.geom.settings()
            settings.set(settings.USE_WORLD_COORDS, True)
            settings.set(settings.WELD_VERTICES, True)
            # USE_BREP_DATA may not be available in all ifcopenshell versions
            # Simply skip it - it's not essential for mesh extraction
            # (The Settings object raises AttributeError when accessing non-existent attributes,
            #  so we just don't try to set it)
            
            if not hasattr(element, "Representation") or not element.Representation:
                return None
            
            shape = ifcopenshell.geom.create_shape(settings, element)
            if not shape:
                return None
            
            geometry = shape.geometry
            verts = geometry.verts
            
            if len(verts) < 6:
                return None
            
            vertices = np.array(verts).reshape(-1, 3)
            
            # Check if vertices are in meters or mm by looking at coordinate magnitudes
            # Typical IFC coordinates in meters are 0-100, in mm are 0-100000
            max_coord = np.max(np.abs(vertices))
            vertices_in_meters = max_coord < 1000.0  # If max coord < 1000, likely in meters
            
            # Always use PCA for mesh-based extraction to find the actual dominant axis from geometry
            # ObjectPlacement axis can be wrong for circular/tubular beams (may give diameter instead of length)
            centroid = vertices.mean(axis=0)
            distances = vertices - centroid
            
            cov_matrix = np.cov(distances.T)
            eigenvalues, eigenvectors = np.linalg.eigh(cov_matrix)
            primary_axis_idx = np.argmax(eigenvalues)
            axis_world = eigenvectors[:, primary_axis_idx]
            axis_world = axis_world / np.linalg.norm(axis_world)
            
            # Project vertices onto axis to find start and end
            centroid = vertices.mean(axis=0)
            distances = vertices - centroid
            projections = np.dot(distances, axis_world)
            t_min = np.min(projections)
            t_max = np.max(projections)
            
            # Calculate endpoints
            start_world = centroid + axis_world * t_min
            end_world = centroid + axis_world * t_max
            
            # For sloped cuts, use linear projection onto axis instead of Euclidean distance
            # This gives the correct linear length for nesting calculations
            vec_start_to_end = end_world - start_world
            length = abs(np.dot(vec_start_to_end, axis_world))
            
            # Convert to mm if needed (vertices from ifcopenshell.geom with USE_WORLD_COORDS are usually in meters)
            # Check both coordinate magnitude and length magnitude
            if vertices_in_meters or length < 0.1:  # Likely in meters, convert to mm
                length = length * 1000.0
                start_world = start_world * 1000.0
                end_world = end_world * 1000.0
                vertices = vertices * 1000.0  # Also convert vertices for end cut detection
                print(f"[CUT_PIECE] Converted mesh-based length from meters to mm: {length:.1f}mm (max coord was {max_coord:.2f})")
            
            # Get profile key
            profile_key = self._extract_profile_key_from_element(element)
            
            # Detect end cuts (pass profile_key to help with circular beam detection)
            end_cuts, actual_length = self._detect_end_cuts_from_vertices(vertices, axis_world, start_world, end_world, length, profile_key)
            
            # Use actual length from vertices if different
            if actual_length != length:
                print(f"[CUT_PIECE] Using actual length from vertices: {actual_length:.1f}mm (was {length:.1f}mm)")
                length = actual_length
            
            return CutPiece(
                express_id=element.id(),
                element_type=element.is_a(),
                profile_key=profile_key or "UNKNOWN",
                length=length,
                axis_world=axis_world,
                start_world=start_world,
                end_world=end_world,
                end_cuts=end_cuts,
                source_method="mesh_based"
            )
            
        except Exception as e:
            element_id = element.id() if hasattr(element, 'id') else 'unknown'
            print(f"[CUT_PIECE] Mesh-based extraction failed for {element_id}: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _detect_end_cuts_from_mesh(self, element, cut_piece: CutPiece) -> Dict[str, Optional[EndCut]]:
        """Detect end cuts using mesh geometry, using known axis from IFC-native."""
        try:
            import ifcopenshell.geom
            
            settings = ifcopenshell.geom.settings()
            settings.set(settings.USE_WORLD_COORDS, True)
            settings.set(settings.WELD_VERTICES, True)
            # USE_BREP_DATA may not be available in all ifcopenshell versions
            # Simply skip it - it's not essential for mesh extraction
            # (The Settings object raises AttributeError when accessing non-existent attributes,
            #  so we just don't try to set it)
            
            shape = ifcopenshell.geom.create_shape(settings, element)
            if not shape:
                return {"start": None, "end": None}
            
            vertices = np.array(shape.geometry.verts).reshape(-1, 3)
            
            # Convert vertices to mm if needed (ifcopenshell.geom might return in meters)
            # Check if vertices are in a reasonable range for mm
            vertex_scale = 1.0
            if len(vertices) > 0:
                sample_vertex = vertices[0]
                max_coord = np.max(np.abs(sample_vertex))
                # If coordinates are very small (< 100), they're likely in meters
                if max_coord < 100:
                    vertex_scale = 1000.0  # Convert meters to mm
                    print(f"[CUT_PIECE] Vertices appear to be in meters (max coord: {max_coord:.2f}), converting to mm")
                else:
                    print(f"[CUT_PIECE] Vertices appear to be in mm (max coord: {max_coord:.2f})")
            
            vertices_mm = vertices * vertex_scale
            
            # Debug: show vertex range
            if len(vertices_mm) > 0:
                min_verts = np.min(vertices_mm, axis=0)
                max_verts = np.max(vertices_mm, axis=0)
                print(f"[CUT_PIECE] Vertex range: min={min_verts}, max={max_verts}")
                print(f"[CUT_PIECE] Start point: {cut_piece.start_world}, End point: {cut_piece.end_world}")
            
            end_cuts, actual_length = self._detect_end_cuts_from_vertices(
                vertices_mm, cut_piece.axis_world, 
                cut_piece.start_world, cut_piece.end_world, cut_piece.length,
                cut_piece.profile_key
            )
            
            # Update cut_piece length with the actual length from vertices
            if abs(actual_length - cut_piece.length) > 1.0:  # If difference is more than 1mm
                print(f"[CUT_PIECE] Updating cut_piece length from {cut_piece.length:.1f}mm to {actual_length:.1f}mm based on vertices")
                cut_piece.length = actual_length
                # Update start/end points to match actual vertices
                center = np.mean(vertices_mm, axis=0)
                projections = np.dot(vertices_mm - center, cut_piece.axis_world)
                cut_piece.start_world = vertices_mm[np.argmin(projections)]
                cut_piece.end_world = vertices_mm[np.argmax(projections)]
            
            return end_cuts
        except Exception as e:
            print(f"[CUT_PIECE] Error detecting end cuts from mesh: {e}")
            return {"start": None, "end": None}
    
    def _calculate_cross_section_dimensions(self, vertices: np.ndarray, axis_world: np.ndarray) -> tuple[float, bool]:
        """Calculate cross-section dimensions from vertices.
        
        Returns:
            (max_dimension, is_circular): Maximum dimension perpendicular to axis, and whether profile appears circular
        """
        if len(vertices) < 3:
            return 200.0, False  # Default fallback
        
        # Project vertices onto plane perpendicular to axis
        # Find two perpendicular vectors in the cross-section plane
        # Use PCA on the cross-section to find principal dimensions
        
        # Get a reference point (centroid)
        centroid = np.mean(vertices, axis=0)
        
        # Project all vertices onto plane perpendicular to axis
        # For each vertex, subtract its projection onto axis
        cross_section_points = []
        for vertex in vertices:
            vec_to_vertex = vertex - centroid
            proj_on_axis = np.dot(vec_to_vertex, axis_world) * axis_world
            point_in_cross_section = vec_to_vertex - proj_on_axis
            cross_section_points.append(point_in_cross_section)
        
        cross_section_points = np.array(cross_section_points)
        
        # Calculate bounding box in cross-section plane
        if len(cross_section_points) > 0:
            # Find two perpendicular directions in the cross-section plane
            # Use PCA to find principal directions
            if len(cross_section_points) >= 3:
                cov_matrix = np.cov(cross_section_points.T)
                eigenvalues, eigenvectors = np.linalg.eigh(cov_matrix)
                # Get the two largest eigenvalues (in cross-section plane)
                sorted_indices = np.argsort(eigenvalues)[::-1]
                
                # Project points onto principal directions
                dir1 = eigenvectors[:, sorted_indices[0]]
                dir2 = eigenvectors[:, sorted_indices[1]]
                
                proj1 = np.abs(np.dot(cross_section_points, dir1))
                proj2 = np.abs(np.dot(cross_section_points, dir2))
                
                dim1 = np.max(proj1) * 2  # Full dimension (radius to radius)
                dim2 = np.max(proj2) * 2
                
                max_dimension = max(dim1, dim2)
                
                # Check if profile appears circular (dimensions are similar and eigenvalue ratio is close to 1)
                if len(eigenvalues) >= 2 and eigenvalues[sorted_indices[1]] > 0:
                    ratio = eigenvalues[sorted_indices[0]] / eigenvalues[sorted_indices[1]]
                    # For circular profiles, ratio should be close to 1 (within 20%)
                    is_circular = abs(ratio - 1.0) < 0.2 and abs(dim1 - dim2) / max(dim1, dim2) < 0.1
                else:
                    is_circular = abs(dim1 - dim2) / max(dim1, dim2) < 0.1
                
                return max_dimension, is_circular
        
        # Fallback: use simple bounding box
        max_dist = np.max([np.linalg.norm(p) for p in cross_section_points])
        return max_dist * 2, False  # Diameter approximation
    
    def _detect_end_cuts_from_vertices(
        self, vertices: np.ndarray, axis_world: np.ndarray,
        start_world: np.ndarray, end_world: np.ndarray, length: float,
        profile_key: str = "UNKNOWN"
    ) -> tuple[Dict[str, Optional[EndCut]], float]:
        """Detect end cuts by fitting planes to end vertex slices.
        
        This method works generically for all steel profiles by:
        1. Calculating actual cross-section dimensions from geometry
        2. Scaling thresholds and tolerances based on actual size
        3. No profile-type-specific logic
        """
        # Calculate actual cross-section dimensions from geometry
        cross_section_size, is_circular = self._calculate_cross_section_dimensions(vertices, axis_world)
        
        # Use actual geometry dimensions instead of profile name parsing
        # This works for ALL profiles regardless of type
        profile_depth = cross_section_size  # Maximum dimension perpendicular to axis
        
        # Calculate threshold based on actual geometry
        # For circular profiles, vertices are spread around circumference
        if is_circular:
            # Use radius as minimum threshold
            threshold = max(length * 0.10, profile_depth / 2, self.tolerances["plane_residual_mm"])
        else:
            # For rectangular/other profiles, use percentage of length or profile depth
            # Scale threshold with profile size: larger profiles need larger thresholds
            base_threshold = max(length * self.tolerances["end_slice_percent"], 
                                self.tolerances["plane_residual_mm"])
            # For larger profiles, ensure threshold scales with cross-section size
            # Use at least 3% of cross-section size for large profiles
            if profile_depth > 100.0:
                threshold = max(base_threshold, profile_depth * 0.03)
            else:
                threshold = base_threshold
        
        print(f"[CUT_PIECE] Detecting end cuts: length={length:.1f}mm, threshold={threshold:.1f}mm")
        print(f"[CUT_PIECE] Start point: {start_world}, End point: {end_world}")
        print(f"[CUT_PIECE] Total vertices: {len(vertices)}")
        
        # Check coordinate system mismatch and calculate actual length from vertices
        actual_length = length  # Default to provided length
        if len(vertices) > 0:
            vertex_center = np.mean(vertices, axis=0)
            start_dist = np.linalg.norm(vertex_center - start_world)
            end_dist = np.linalg.norm(vertex_center - end_world)
            print(f"[CUT_PIECE] Vertex center: {vertex_center}")
            print(f"[CUT_PIECE] Distance from vertex center to start: {start_dist:.1f}mm, to end: {end_dist:.1f}mm")
            
            # If distances are huge, there's a coordinate system mismatch
            # Try to find the actual start/end from vertices instead
            if start_dist > length * 10 or end_dist > length * 10:
                print(f"[CUT_PIECE] Coordinate system mismatch detected. Finding start/end from vertices...")
                
                # CRITICAL FIX: Check if vertices are in different units than start_world/end_world
                # If start/end are in mm (large numbers) but vertices are in meters (small numbers),
                # we need to convert vertices to mm before calculating
                vertex_scale = 1.0
                max_start_end = max(np.max(np.abs(start_world)), np.max(np.abs(end_world)))
                max_vertex = np.max(np.abs(vertices))
                
                # Use ratio to detect unit mismatch (more robust than fixed thresholds)
                ratio = max_start_end / max_vertex if max_vertex > 0 else 1.0
                
                if max_start_end > 1000 and max_vertex < 1000 and ratio > 100:
                    # Start/end are in mm, vertices are in meters - convert vertices to mm
                    vertex_scale = 1000.0
                    print(f"[CUT_PIECE] Converting vertices from meters to mm (max_start_end={max_start_end:.1f}, max_vertex={max_vertex:.2f}, ratio={ratio:.1f})")
                elif max_start_end < 1000 and max_vertex > 1000 and ratio < 0.01:
                    # Start/end are in meters, vertices are in mm - convert vertices to meters
                    vertex_scale = 0.001
                    print(f"[CUT_PIECE] Converting vertices from mm to meters (max_start_end={max_start_end:.2f}, max_vertex={max_vertex:.1f}, ratio={ratio:.4f})")
                else:
                    print(f"[CUT_PIECE] No unit conversion needed (max_start_end={max_start_end:.1f}, max_vertex={max_vertex:.2f}, ratio={ratio:.1f})")
                
                # Scale vertices to match start/end coordinate system
                vertices_scaled = vertices * vertex_scale
                vertex_center_scaled = vertex_center * vertex_scale
                
                # Project all vertices onto axis to find actual start and end
                # Use the scaled vertex center as reference
                center = vertex_center_scaled
                projections = np.dot(vertices_scaled - center, axis_world)
                min_proj_idx = np.argmin(projections)
                max_proj_idx = np.argmax(projections)
                actual_start = vertices_scaled[min_proj_idx]
                actual_end = vertices_scaled[max_proj_idx]
                print(f"[CUT_PIECE] Actual start from vertices (scaled): {actual_start}")
                print(f"[CUT_PIECE] Actual end from vertices (scaled): {actual_end}")
                
                # Calculate actual length from vertices
                # Project the start and end points onto the axis to get the true length
                # Use linear projection onto axis instead of Euclidean distance
                # This gives the correct linear length for sloped cuts
                vec_start_to_end = actual_end - actual_start
                actual_length = abs(np.dot(vec_start_to_end, axis_world))
                euclidean_length = np.linalg.norm(vec_start_to_end)
                print(f"[CUT_PIECE] Calculated actual length from vertices (linear along axis): {actual_length:.1f}mm (was {length:.1f}mm from IFC, Euclidean would be {euclidean_length:.1f}mm)")
                
                # Use these instead
                start_world = actual_start
                end_world = actual_end
                # Also update vertices for later calculations
                vertices = vertices_scaled
                # Update threshold based on actual length
                threshold = max(actual_length * self.tolerances["end_slice_percent"], 
                                self.tolerances["plane_residual_mm"])
                print(f"[CUT_PIECE] Updated threshold based on actual length: {threshold:.1f}mm")
        
        # For better accuracy, especially for circular beams, find actual end vertices from extreme projections
        # Project all vertices onto axis to find the actual start and end regions
        centroid = np.mean(vertices, axis=0)
        projections = np.dot(vertices - centroid, axis_world)
        min_proj = np.min(projections)
        max_proj = np.max(projections)
        
        # Use the actual extreme points along the axis as reference
        # This is more reliable than using the calculated start_world/end_world for circular beams
        actual_start_point = centroid + axis_world * min_proj
        actual_end_point = centroid + axis_world * max_proj
        
        # ALWAYS calculate actual length from extreme vertex projections using linear projection
        # This ensures correct length for sloped cuts, regardless of coordinate system
        # The linear length is simply the difference between max and min projections
        if len(vertices) > 0:
            calculated_actual_length = max_proj - min_proj
            # Always use the calculated length from projections (most accurate for sloped cuts)
            # Only log if it's different from the original length
            if abs(calculated_actual_length - actual_length) > 0.1:
                print(f"[CUT_PIECE] Calculated actual length from vertex projections (linear along axis): {calculated_actual_length:.1f}mm (was {actual_length:.1f}mm from IFC/depth)")
                actual_length = calculated_actual_length
            else:
                # Still update it even if close, to ensure we're using the projection-based calculation
                actual_length = calculated_actual_length
        
        # Find vertices near each end
        # Use projection onto axis instead of Euclidean distance for better accuracy
        start_vertices = []
        end_vertices = []
        
        # Scale perpendicular tolerance based on actual cross-section size
        # This works generically for all profiles - larger cross-sections need more tolerance
        if is_circular:
            # For circular profiles, vertices are spread around circumference
            perp_tolerance_multiplier = 3.0
        else:
            # Scale multiplier based on actual cross-section size
            # Small profiles (< 200mm): 2.0x
            # Medium profiles (200-500mm): 2.0-4.0x
            # Large profiles (> 500mm): scales with size
            if profile_depth < 200.0:
                perp_tolerance_multiplier = 2.0
            elif profile_depth < 500.0:
                # Linear interpolation between 2.0 and 4.0
                perp_tolerance_multiplier = 2.0 + (profile_depth - 200.0) / 300.0 * 2.0
            else:
                # For very large profiles, scale with depth
                perp_tolerance_multiplier = max(4.0, profile_depth / 125.0)
        
        # Project vertices onto the axis to find which are near the ends
        for vertex in vertices:
            # Vector from actual start to vertex
            vec_from_start = vertex - actual_start_point
            # Project onto axis
            proj_start = np.dot(vec_from_start, axis_world)
            
            # Vector from actual end to vertex  
            vec_from_end = vertex - actual_end_point
            # Project onto axis (negative means before end point)
            proj_end = np.dot(vec_from_end, axis_world)
            
            # Check if vertex is near start (within threshold along axis)
            if -threshold <= proj_start <= threshold:
                # Also check perpendicular distance (should be small for end vertices)
                perp_dist = np.linalg.norm(vec_from_start - proj_start * axis_world)
                if perp_dist < threshold * perp_tolerance_multiplier:  # More lenient for circular beams
                    start_vertices.append(vertex)
            
            # Check if vertex is near end (within threshold along axis)
            if -threshold <= proj_end <= threshold:
                # Also check perpendicular distance
                perp_dist = np.linalg.norm(vec_from_end - proj_end * axis_world)
                if perp_dist < threshold * perp_tolerance_multiplier:
                    end_vertices.append(vertex)
        
        print(f"[CUT_PIECE] Found {len(start_vertices)} start vertices, {len(end_vertices)} end vertices")
        
        # If still no vertices found, try a larger threshold
        if len(start_vertices) < 3 and len(end_vertices) < 3:
            # Scale threshold based on actual cross-section size (works for all profiles)
            if is_circular:
                # For circular profiles, use radius-based threshold
                larger_threshold = max(length * 0.10, profile_depth / 2, 100.0)
            else:
                # For all other profiles, scale with cross-section size
                # Use 10% of length or 5% of cross-section size, whichever is larger
                larger_threshold = max(length * 0.10, profile_depth * 0.05, 100.0)
            
            print(f"[CUT_PIECE] No vertices found with threshold {threshold:.1f}mm, trying larger threshold {larger_threshold:.1f}mm (cross-section size: {profile_depth:.1f}mm, circular: {is_circular})")
            
            start_vertices = []
            end_vertices = []
            
            for vertex in vertices:
                vec_from_start = vertex - actual_start_point
                proj_start = np.dot(vec_from_start, axis_world)
                perp_dist_start = np.linalg.norm(vec_from_start - proj_start * axis_world)
                
                vec_from_end = vertex - actual_end_point
                proj_end = np.dot(vec_from_end, axis_world)
                perp_dist_end = np.linalg.norm(vec_from_end - proj_end * axis_world)
                
                # Scale perpendicular tolerance based on actual cross-section size
                # For larger cross-sections, vertices can be further from axis
                if is_circular:
                    # For circular profiles, use radius-based tolerance
                    perp_tolerance = max(larger_threshold * 5.0, profile_depth / 2)
                else:
                    # For all other profiles, scale with cross-section size
                    # Ensure tolerance is at least half the cross-section dimension
                    perp_tolerance = max(larger_threshold * perp_tolerance_multiplier, profile_depth * 0.5)
                
                if -larger_threshold <= proj_start <= larger_threshold and perp_dist_start < perp_tolerance:
                    start_vertices.append(vertex)
                if -larger_threshold <= proj_end <= larger_threshold and perp_dist_end < perp_tolerance:
                    end_vertices.append(vertex)
            
            print(f"[CUT_PIECE] With larger threshold: {len(start_vertices)} start vertices, {len(end_vertices)} end vertices")
        
        end_cuts = {"start": None, "end": None}
        
        if len(start_vertices) >= 3:
            end_cuts["start"] = self._fit_end_plane(
                np.array(start_vertices), actual_start_point, axis_world
            )
            if end_cuts["start"]:
                print(f"[CUT_PIECE] Start cut detected: angle={end_cuts['start'].angle_deg:.2f}°, confidence={end_cuts['start'].confidence:.2f}")
            else:
                print(f"[CUT_PIECE] Start cut detection failed (not enough vertices or plane fitting failed)")
        else:
            print(f"[CUT_PIECE] Not enough start vertices ({len(start_vertices)} < 3)")
        
        if len(end_vertices) >= 3:
            end_cuts["end"] = self._fit_end_plane(
                np.array(end_vertices), actual_end_point, axis_world
            )
            if end_cuts["end"]:
                print(f"[CUT_PIECE] End cut detected: angle={end_cuts['end'].angle_deg:.2f}°, confidence={end_cuts['end'].confidence:.2f}")
            else:
                print(f"[CUT_PIECE] End cut detection failed (not enough vertices or plane fitting failed)")
        else:
            print(f"[CUT_PIECE] Not enough end vertices ({len(end_vertices)} < 3)")
        
        return end_cuts, actual_length
    
    def _fit_end_plane(
        self, vertices: np.ndarray, end_point: np.ndarray, axis_world: np.ndarray
    ) -> Optional[EndCut]:
        """Fit a plane to end vertices using SVD (least squares)."""
        if len(vertices) < 3:
            return None
        
        # Center vertices
        centroid = vertices.mean(axis=0)
        centered = vertices - centroid
        
        # SVD to find plane normal
        try:
            U, s, Vt = np.linalg.svd(centered, full_matrices=False)
            plane_normal = Vt[-1, :]  # Last row is normal to best-fit plane
            plane_normal = plane_normal / (np.linalg.norm(plane_normal) + 1e-10)
        except Exception as e:
            print(f"[CUT_PIECE] Error in SVD: {e}")
            return None
        
        # Ensure normal points outward (away from beam interior)
        # Check sign by comparing with axis direction
        # For start end: normal should point opposite to axis
        # For end end: normal should point along axis
        if np.dot(plane_normal, axis_world) < 0:
            plane_normal = -plane_normal
        
        # Calculate angle from perpendicular
        dot_with_axis = np.abs(np.dot(plane_normal, axis_world))
        dot_with_axis = np.clip(dot_with_axis, 0, 1)
        angle_rad = np.arccos(dot_with_axis)
        angle_deg = np.degrees(angle_rad)
        
        # Calculate plane equation: n·x + d = 0
        plane_d = -np.dot(plane_normal, centroid)
        
        # Calculate confidence based on fit quality
        # Residual = average distance from vertices to plane
        residuals = np.abs(np.dot(centered, plane_normal))
        avg_residual = np.mean(residuals)
        confidence = max(0, 1.0 - (avg_residual / self.tolerances["plane_residual_mm"]))
        
        return EndCut(
            normal=plane_normal,
            angle_deg=angle_deg,
            plane_d=plane_d,
            confidence=confidence
        )
    
    def _extract_profile_key(self, extruded_solid, element) -> str:
        """Extract profile key from IfcExtrudedAreaSolid."""
        # Try to get profile name from SweptArea
        try:
            if hasattr(extruded_solid, "SweptArea"):
                swept_area = extruded_solid.SweptArea
                if hasattr(swept_area, "ProfileName"):
                    name = swept_area.ProfileName
                    if name:
                        return str(name)
        except:
            pass
        
        # Fall back to element properties
        return self._extract_profile_key_from_element(element)
    
    def _extract_profile_key_from_element(self, element) -> str:
        """Extract profile key from element properties."""
        # Try to get profile name from property sets to avoid circular dependency
        try:
            import ifcopenshell.util.element
            psets = ifcopenshell.util.element.get_psets(element)
            
            # Check common property set keys
            for pset_name, props in psets.items():
                for key in ["Profile", "ProfileName", "Shape", "Section"]:
                    if key in props:
                        value = props[key]
                        if value and str(value).strip() and str(value).upper() not in ['NONE', 'NULL', 'N/A', '']:
                            return str(value).strip()
            
            # Try Description attribute (as used in main.py)
            if hasattr(element, 'Description') and element.Description:
                desc = str(element.Description).strip()
                if desc and desc.upper() not in ['NONE', 'NULL', 'N/A', '']:
                    return desc
            
            # Try to get from geometry representation
            if hasattr(element, "Representation") and element.Representation:
                for rep in element.Representation.Representations or []:
                    for item in rep.Items or []:
                        if item.is_a("IfcExtrudedAreaSolid"):
                            if hasattr(item, "SweptArea") and item.SweptArea:
                                swept_area = item.SweptArea
                                if hasattr(swept_area, "ProfileName") and swept_area.ProfileName:
                                    profile_name = str(swept_area.ProfileName).strip()
                                    if profile_name:
                                        return profile_name
        except Exception as e:
            print(f"[CUT_PIECE] Error extracting profile key: {e}")
        
        return "UNKNOWN"
    
    def _get_estimated_profile_depth(self, profile_key: str) -> float:
        """Estimate profile depth from profile name.
        
        Returns the depth/diameter in mm for various profile types:
        - IPE400 -> 400mm
        - HEA220 -> 220mm
        - RHS250*150*6.0 -> 250mm (largest dimension)
        - Ø219.1*3 -> 219.1mm (diameter)
        """
        if not profile_key or profile_key == "UNKNOWN":
            return 400.0  # Default
        
        profile_key_upper = profile_key.upper()
        
        try:
            import re
            
            # Circular profiles: Ø219.1*3 or DIAMETER219.1
            if "Ø" in profile_key or "DIAMETER" in profile_key_upper:
                diameter_match = re.search(r'Ø\s*(\d+\.?\d*)', profile_key)
                if not diameter_match:
                    diameter_match = re.search(r'DIAMETER\s*(\d+\.?\d*)', profile_key_upper)
                if diameter_match:
                    return float(diameter_match.group(1))
            
            # IPE profiles: IPE400 -> 400
            if "IPE" in profile_key_upper:
                ipe_match = re.search(r'IPE\s*(\d+)', profile_key_upper)
                if ipe_match:
                    return float(ipe_match.group(1))
            
            # HEA/HEB profiles: HEA220 -> 220
            if "HEA" in profile_key_upper or "HEB" in profile_key_upper or "HEM" in profile_key_upper:
                hea_match = re.search(r'HE[ABM]\s*(\d+)', profile_key_upper)
                if hea_match:
                    return float(hea_match.group(1))
            
            # RHS/SHS profiles: RHS250*150*6.0 -> 250 (largest dimension)
            if "RHS" in profile_key_upper or "SHS" in profile_key_upper:
                # Try to extract all dimensions
                dims_match = re.findall(r'(\d+\.?\d*)', profile_key_upper)
                if dims_match:
                    # Return the largest dimension (usually the first one for RHS)
                    dims = [float(d) for d in dims_match]
                    return max(dims)
            
            # CHS (Circular Hollow Section): CHS219.1*3 -> 219.1
            if "CHS" in profile_key_upper:
                chs_match = re.search(r'CHS\s*(\d+\.?\d*)', profile_key_upper)
                if chs_match:
                    return float(chs_match.group(1))
            
        except Exception as e:
            print(f"[CUT_PIECE] Error estimating profile depth from '{profile_key}': {e}")
        
        # Default fallback
        return 400.0
    
    def compare_end_cuts(self, cut1: EndCut, cut2: EndCut, axis1: np.ndarray, axis2: np.ndarray) -> float:
        """Compare two end cuts for compatibility. Returns score 0-1 (1 = perfect match)."""
        # Check if axes are colinear
        axis_dot = np.abs(np.dot(axis1, axis2))
        if axis_dot < self.tolerances["axis_colinear"]:
            return 0.0  # Not colinear
        
        # Check angle similarity
        angle_diff = abs(cut1.angle_deg - cut2.angle_deg)
        if angle_diff > self.tolerances["angle_deg"]:
            return 0.0  # Angles too different
        
        # Check if normals are complementary (opposite when in same frame)
        # Project normals onto plane perpendicular to axis
        perp1 = cut1.normal - np.dot(cut1.normal, axis1) * axis1
        perp2 = cut2.normal - np.dot(cut2.normal, axis2) * axis2
        
        if np.linalg.norm(perp1) < 0.01 or np.linalg.norm(perp2) < 0.01:
            # Both are square cuts
            return 1.0 if angle_diff < 0.1 else 0.0
        
        # Normalize perpendicular components
        perp1 = perp1 / np.linalg.norm(perp1)
        perp2 = perp2 / np.linalg.norm(perp2)
        
        # For complementary cuts, perp components should be opposite
        perp_dot = np.dot(perp1, perp2)
        complementarity = (1.0 - perp_dot) / 2.0  # 1.0 if opposite, 0.0 if same
        
        # Combine factors
        angle_score = 1.0 - (angle_diff / self.tolerances["angle_deg"])
        score = (angle_score * 0.5) + (complementarity * 0.5)
        
        return max(0.0, min(1.0, score))

