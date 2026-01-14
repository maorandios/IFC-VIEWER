from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from pathlib import Path
import ifcopenshell
import ifcopenshell.util.element
import json
from typing import Dict, List, Any
import os
import asyncio
import re
import traceback

# Try to import ifcopenshell.geom if available (for geometry operations)
try:
    import ifcopenshell.geom
    HAS_GEOM = True
except ImportError:
    HAS_GEOM = False

app = FastAPI(title="IFC Steel Analysis API")

# Global exception handlers to prevent server crashes
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors."""
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and return proper error response."""
    # Don't catch HTTPException or RequestValidationError (handled above)
    if isinstance(exc, (StarletteHTTPException, RequestValidationError)):
        raise exc
    
    error_msg = str(exc)
    error_trace = traceback.format_exc()
    print(f"[ERROR] Unhandled exception in {request.url.path}: {error_msg}")
    print(f"[ERROR] Traceback:\n{error_trace}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {error_msg}"}
    )

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5180", "http://0.0.0.0:5180"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage paths
STORAGE_DIR = Path(__file__).parent.parent / "storage"
IFC_DIR = STORAGE_DIR / "ifc"
REPORTS_DIR = STORAGE_DIR / "reports"
GLTF_DIR = STORAGE_DIR / "gltf"

# Create directories if they don't exist
IFC_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
GLTF_DIR.mkdir(parents=True, exist_ok=True)

# Steel element types
STEEL_TYPES = {"IfcBeam", "IfcColumn", "IfcMember", "IfcPlate"}
FASTENER_TYPES = {"IfcFastener", "IfcMechanicalFastener"}
PROXY_TYPES = {"IfcProxy", "IfcBuildingElementProxy"}

# Control nesting logs - set to False to suppress [NESTING] log messages
ENABLE_NESTING_LOGS = False

def nesting_log(*args, **kwargs):
    """Print nesting log messages only if ENABLE_NESTING_LOGS is True."""
    if ENABLE_NESTING_LOGS:
        print(*args, **kwargs)


def sanitize_filename(filename: str) -> str:
    """Sanitize filename for Windows compatibility.
    
    Removes or replaces characters that are invalid on Windows filesystems.
    """
    # Remove or replace invalid characters for Windows
    # Invalid chars: < > : " / \ | ? *
    invalid_chars = r'[<>:"/\\|?*]'
    sanitized = re.sub(invalid_chars, '_', filename)
    
    # Remove leading/trailing spaces and dots (Windows doesn't allow these)
    sanitized = sanitized.strip(' .')
    
    # Replace multiple spaces/underscores with single underscore
    sanitized = re.sub(r'[_\s]+', '_', sanitized)
    
    # Ensure filename is not empty
    if not sanitized:
        sanitized = "uploaded_file"
    
    # Ensure it still has .ifc extension
    if not sanitized.endswith(('.ifc', '.IFC')):
        # Try to preserve original extension
        original_ext = Path(filename).suffix
        if original_ext:
            sanitized = sanitized + original_ext
        else:
            sanitized = sanitized + '.ifc'
    
    return sanitized


def get_element_weight(element) -> float:
    """Get weight of an IFC element in kg."""
    try:
        psets = ifcopenshell.util.element.get_psets(element)
        for pset_name, props in psets.items():
            if "Weight" in props:
                weight = props["Weight"]
                if isinstance(weight, (int, float)):
                    return float(weight)
            if "Mass" in props:
                mass = props["Mass"]
                if isinstance(mass, (int, float)):
                    return float(mass)
    except:
        pass
    
    # Try to get from material
    try:
        materials = ifcopenshell.util.element.get_materials(element)
        for material in materials:
            if hasattr(material, "HasProperties"):
                for prop in material.HasProperties or []:
                    if hasattr(prop, "Name") and prop.Name in ["Weight", "Mass"]:
                        if hasattr(prop, "NominalValue") and prop.NominalValue:
                            return float(prop.NominalValue.wrappedValue)
    except:
        pass
    
    return 0.0


def get_assembly_info(element) -> tuple[str, int | None]:
    """Get assembly mark and assembly object ID from element.
    
    Returns: (assembly_mark, assembly_id)
    - assembly_mark: The mark/name of the assembly (e.g., "B1")
    - assembly_id: The IFC object ID of the specific assembly instance (None if not found)
    
    In Tekla Structures:
    - Parts have a part number (P1, P2, etc.) - this is NOT the assembly mark
    - Parts belong to an assembly with an assembly mark (B1, B2, etc.)
    - Multiple instances of the same assembly type (e.g., multiple "B1") should be distinguished by assembly_id
    """
    assembly_id = None
    
    # CRITICAL: First check if this element is part of an assembly via IfcRelAggregates
    # This is the most reliable way - parts are aggregated into assemblies
    try:
        if hasattr(element, 'Decomposes'):
            for rel in element.Decomposes or []:
                if rel.is_a('IfcRelAggregates'):
                    # This element is a part, the relating object is the assembly
                    assembly = rel.RelatingObject
                    if assembly:
                        assembly_id = assembly.id()  # Store the assembly instance ID
                        
                        # Get assembly mark from the assembly object
                        # Try Tag first (most common in Tekla)
                        if hasattr(assembly, 'Tag') and assembly.Tag:
                            tag = str(assembly.Tag).strip()
                            if tag and tag.upper() not in ['NONE', 'NULL', '']:
                                return (tag, assembly_id)
                        
                        # Try Name
                        if hasattr(assembly, 'Name') and assembly.Name:
                            name = str(assembly.Name).strip()
                            if name and name.upper() not in ['NONE', 'NULL', '']:
                                return (name, assembly_id)
                        
                        # Try property sets on the assembly
                        try:
                            psets = ifcopenshell.util.element.get_psets(assembly)
                            for pset_name, props in psets.items():
                                for key in ["AssemblyMark", "Assembly Mark", "Mark", "Tag"]:
                                    if key in props:
                                        value = props[key]
                                        if value is not None:
                                            value_str = str(value).strip()
                                            if value_str and value_str.upper() not in ['NONE', 'NULL', 'N/A', '']:
                                                return (value_str, assembly_id)
                        except:
                            pass
    except Exception as e:
        print(f"[ASSEMBLY_INFO] Error checking Decomposes for element {element.id() if hasattr(element, 'id') else 'unknown'}: {e}")
        pass
    
    # Check if this element IS an assembly (IfcElementAssembly)
    try:
        if element.is_a('IfcElementAssembly'):
            # This is an assembly, get its mark
            assembly_id = element.id()
            if hasattr(element, 'Tag') and element.Tag:
                tag = str(element.Tag).strip()
                if tag and tag.upper() not in ['NONE', 'NULL', '']:
                    return (tag, assembly_id)
            if hasattr(element, 'Name') and element.Name:
                name = str(element.Name).strip()
                if name and name.upper() not in ['NONE', 'NULL', '']:
                    return (name, assembly_id)
    except:
        pass
    
    # Try property sets - but be careful to distinguish assembly mark from part number
    try:
        psets = ifcopenshell.util.element.get_psets(element)
        
        # Priority: Look for assembly-specific property sets first
        for pset_name, props in psets.items():
            pset_lower = pset_name.lower()
            
            # If property set name suggests assembly (not part)
            if 'assembly' in pset_lower and 'part' not in pset_lower:
                for key in ["AssemblyMark", "Assembly Mark", "Mark", "Tag"]:
                    if key in props:
                        value = props[key]
                        if value is not None:
                            value_str = str(value).strip()
                            if value_str and value_str.upper() not in ['NONE', 'NULL', 'N/A', '']:
                                return (value_str, assembly_id)
            
            # Check for assembly mark in any property set (but skip if it looks like a part number)
            for key in ["AssemblyMark", "Assembly Mark"]:
                if key in props:
                    value = props[key]
                    if value is not None:
                        value_str = str(value).strip()
                        if value_str and value_str.upper() not in ['NONE', 'NULL', 'N/A', '']:
                            # Skip if it looks like a part number (starts with P followed by number)
                            if not (value_str.upper().startswith('P') and len(value_str) <= 3 and value_str[1:].isdigit()):
                                return (value_str, assembly_id)
    except Exception as e:
        print(f"[ASSEMBLY_INFO] Error getting psets for element {element.id() if hasattr(element, 'id') else 'unknown'}: {e}")
        pass
    
    # Last resort: check Tag/Name, but be careful - Tag might be part number, not assembly mark
    try:
        if hasattr(element, 'Tag') and element.Tag:
            tag = str(element.Tag).strip()
            if tag and tag.upper() not in ['NONE', 'NULL', '']:
                # If tag looks like an assembly mark (B1, B2, etc.) not a part number (P1, P2)
                # Assembly marks are often longer or have different patterns
                if not (tag.upper().startswith('P') and len(tag) <= 3 and tag[1:].isdigit()):
                    return (tag, assembly_id)
    except:
        pass
    
    return ("N/A", None)


def infer_profile_from_dimensions(height_mm: float, width_mm: float) -> str:
    """Infer profile name from height and width dimensions.
    
    Common steel profiles:
    - IPE series: height matches profile number (e.g., IPE400 = 400mm height)
    - HEA/HEB series: height matches profile number
    - UPN/UPE series: height matches profile number
    """
    # Round to nearest standard profile size
    height_rounded = round(height_mm / 10) * 10  # Round to nearest 10mm
    
    # IPE series (I-beams) - common dimensions
    # Height is the profile number, width is typically around 40-50% of height for standard IPE
    ipe_profiles = {
        (80, 46): "IPE80", (100, 55): "IPE100", (120, 64): "IPE120",
        (140, 73): "IPE140", (160, 82): "IPE160", (180, 91): "IPE180",
        (200, 100): "IPE200", (220, 110): "IPE220", (240, 120): "IPE240",
        (270, 135): "IPE270", (300, 150): "IPE300", (330, 160): "IPE330",
        (360, 170): "IPE360", (400, 180): "IPE400", (450, 190): "IPE450",
        (500, 200): "IPE500", (550, 210): "IPE550", (600, 220): "IPE600",
        (750, 263): "IPE750", (750, 267): "IPE750x137", (800, 268): "IPE800"
    }
    
    # Check if dimensions match known IPE profile
    height_key = int(height_rounded)
    width_key = int(round(width_mm / 5) * 5)  # Round width to nearest 5mm
    
    # Try exact match first
    if (height_key, width_key) in ipe_profiles:
        return ipe_profiles[(height_key, width_key)]
    
    # Try height-only match (width can vary slightly)
    for (h, w), profile in ipe_profiles.items():
        if abs(height_key - h) <= 5:  # Within 5mm
            if abs(width_key - w) <= 10:  # Width within 10mm
                return profile
    
    # If height matches a standard IPE size, use it
    if 80 <= height_key <= 1000 and height_key % 10 == 0:
        # Check if width is in reasonable range for IPE (typically 40-50% of height)
        if 0.35 * height_key <= width_key <= 0.55 * height_key:
            return f"IPE{int(height_key)}"
    
    # HEA/HEB series (wide flange beams)
    # Similar to IPE but wider flanges
    if 0.55 * height_key <= width_key <= 0.75 * height_key:
        if 100 <= height_key <= 1000 and height_key % 10 == 0:
            return f"HEA{int(height_key)}"  # Could be HEA or HEB, default to HEA
    
    return "N/A"


def get_assembly_mark(element) -> str:
    """Get assembly mark from element properties (backward compatibility).
    
    This is a wrapper around get_assembly_info that only returns the mark.
    """
    mark, _ = get_assembly_info(element)
    return mark


def get_profile_name(element) -> str:
    """Get profile name from element.
    
    Checks multiple sources:
    1. Property sets (Profile, ProfileName, Shape, CrossSection, etc.)
    2. Geometry representation (IfcExtrudedAreaSolid with IfcProfileDef)
    3. Tekla-specific property sets (including dimension-based inference)
    4. Element attributes
    """
    # First, try Description attribute (Tekla stores profile name here, e.g., "HEA220")
    try:
        if hasattr(element, 'Description') and element.Description:
            desc = str(element.Description).strip()
            if desc and desc.upper() not in ['NONE', 'NULL', 'N/A', '']:
                # Check if Description looks like a profile name (e.g., "HEA220", "IPE400")
                # Profile names typically start with letters and contain numbers
                if any(prefix in desc.upper() for prefix in ['IPE', 'HEA', 'HEB', 'HEM', 'UPN', 'UPE', 'L', 'PL', 'RHS', 'CHS', 'SHS', 'W', 'C', 'T']):
                    return desc
                # Or if it's a short alphanumeric string (likely a profile name)
                if len(desc) <= 20 and desc[0].isalpha():
                    return desc
    except Exception as e:
        print(f"[PROFILE] Error getting Description for element {element.id() if hasattr(element, 'id') else 'unknown'}: {e}")
        pass
    
    # Second, try property sets (most common in Tekla Structures)
    try:
        psets = ifcopenshell.util.element.get_psets(element)
        
        # Check all property sets for profile-related keys
        for pset_name, props in psets.items():
            # Check common profile property names
            for key in ["Profile", "ProfileName", "Shape", "CrossSection", "Section", 
                       "ProfileType", "Profile_Type", "NominalSize", "Size", "Profile",
                       "Cross_Section", "Section_Type", "Steel_Profile"]:
                if key in props:
                    value = props[key]
                    if value and str(value).strip() and str(value).upper() not in ['NONE', 'NULL', 'N/A', '']:
                        profile_str = str(value).strip()
                        # Clean up common prefixes/suffixes
                        profile_str = profile_str.replace('PROFILE_', '').replace('_PROFILE', '')
                        return profile_str
            
    except Exception as e:
        print(f"[PROFILE] Error getting psets for element {element.id() if hasattr(element, 'id') else 'unknown'}: {e}")
        pass
    
    # Helper function to extract profile from representation items
    def extract_profile_from_representation_item(item):
        """Recursively extract profile from representation item."""
        if not item:
            return None
        
        # Handle IfcBooleanClippingResult - traverse to FirstOperand (this is common in Tekla exports)
        if item.is_a("IfcBooleanClippingResult"):
            if hasattr(item, "FirstOperand") and item.FirstOperand:
                result = extract_profile_from_representation_item(item.FirstOperand)
                if result:
                    return result
            # Also check SecondOperand if FirstOperand doesn't have it
            if hasattr(item, "SecondOperand") and item.SecondOperand:
                result = extract_profile_from_representation_item(item.SecondOperand)
                if result:
                    return result
        
        # Handle IfcExtrudedAreaSolid
        if item.is_a("IfcExtrudedAreaSolid"):
            if hasattr(item, "SweptArea") and item.SweptArea:
                swept_area = item.SweptArea
                
                # Check IfcIShapeProfileDef (most common for I-beams like IPE)
                if swept_area.is_a("IfcIShapeProfileDef"):
                    # ProfileName is the most reliable source
                    if hasattr(swept_area, "ProfileName") and swept_area.ProfileName:
                        profile_name = str(swept_area.ProfileName).strip()
                        if profile_name and profile_name.upper() not in ['NONE', 'NULL', 'N/A', '']:
                            return profile_name
                
                # Check IfcParameterizedProfileDef
                if swept_area.is_a("IfcParameterizedProfileDef"):
                    if hasattr(swept_area, "ProfileName") and swept_area.ProfileName:
                        profile_name = str(swept_area.ProfileName).strip()
                        if profile_name and profile_name.upper() not in ['NONE', 'NULL', 'N/A', '']:
                            return profile_name
                    if hasattr(swept_area, "ProfileType"):
                        profile_type = swept_area.ProfileType
                        if profile_type:
                            profile_type_str = str(profile_type).strip()
                            if profile_type_str and profile_type_str.upper() not in ['NONE', 'NULL', 'N/A', '']:
                                return profile_type_str
                
                # Check other profile types - try ProfileName first, then ProfileType
                for profile_attr in ["ProfileName", "ProfileType"]:
                    if hasattr(swept_area, profile_attr):
                        value = getattr(swept_area, profile_attr)
                        if value:
                            value_str = str(value).strip()
                            if value_str and value_str.upper() not in ['NONE', 'NULL', 'N/A', '']:
                                return value_str
        
        # Handle IfcMappedItem - traverse to MappingSource
        if item.is_a("IfcMappedItem"):
            if hasattr(item, "MappingSource") and item.MappingSource:
                if hasattr(item.MappingSource, "MappedRepresentation"):
                    mapped_rep = item.MappingSource.MappedRepresentation
                    if hasattr(mapped_rep, "Items"):
                        for sub_item in mapped_rep.Items or []:
                            result = extract_profile_from_representation_item(sub_item)
                            if result:
                                return result
        
        return None
    
    # Try to get from geometry representation
    try:
        if hasattr(element, "Representation") and element.Representation:
            for rep in element.Representation.Representations or []:
                # Check all representation types, not just Body
                for item in rep.Items or []:
                    profile = extract_profile_from_representation_item(item)
                    if profile and profile != "N/A":
                        return profile
    except Exception as e:
        print(f"[PROFILE] Error getting profile from geometry for element {element.id() if hasattr(element, 'id') else 'unknown'}: {e}")
        pass
    
    # Try using ifcopenshell geometry utilities to extract profile (alternative method)
    try:
        if HAS_GEOM:
            # Try to get profile from shape representation
            settings = ifcopenshell.geom.settings()
            shape = ifcopenshell.geom.create_shape(settings, element)
            if shape:
                # Check if shape has profile information
                if hasattr(shape, "geometry") and hasattr(shape.geometry, "profile"):
                    profile = shape.geometry.profile
                    if profile and hasattr(profile, "ProfileName"):
                        return str(profile.ProfileName).strip()
    except Exception as e:
        # Silently fail - this is a fallback method
        pass
    
    # Try element attributes directly
    try:
        if hasattr(element, "Profile") and element.Profile:
            if hasattr(element.Profile, "ProfileName"):
                profile_name = element.Profile.ProfileName
                if profile_name and str(profile_name).strip():
                    return str(profile_name).strip()
    except:
        pass
    
    # Last resort: check Tag or Name for profile-like patterns
    try:
        tag = getattr(element, 'Tag', None)
        if tag:
            tag_str = str(tag).strip()
            # Check if tag looks like a profile (e.g., "IPE400", "HEA200")
            if any(prefix in tag_str.upper() for prefix in ['IPE', 'HEA', 'HEB', 'HEM', 'UPN', 'UPE', 'L', 'PL', 'RHS', 'CHS', 'SHS']):
                return tag_str
    except:
        pass
    
    return "N/A"


def get_plate_thickness(element) -> str:
    """Get plate thickness or profile from element.
    
    Checks multiple sources:
    1. Property sets (Thickness, Profile, ThicknessProfile, etc.)
    2. Tekla-specific property sets (Tekla Quantity, etc.)
    3. Geometry representation (if available)
    """
    try:
        psets = ifcopenshell.util.element.get_psets(element)
        
        # Check all property sets for thickness-related keys
        for pset_name, props in psets.items():
            # Check common thickness property names
            # NOTE: In Tekla, plate thickness is often stored as "Width" in property sets
            for key in ["Thickness", "thickness", "ThicknessProfile", "thickness_profile", 
                       "Profile", "profile", "PlateThickness", "plate_thickness",
                       "NominalThickness", "nominal_thickness", "ThicknessValue",
                       "Width", "width"]:  # Added Width - Tekla stores thickness as Width
                if key in props:
                    value = props[key]
                    if value is not None:
                        value_str = str(value).strip()
                        if value_str and value_str.upper() not in ['NONE', 'NULL', 'N/A', '']:
                            # If it's a number, add "mm" suffix
                            try:
                                thickness_num = float(value_str)
                                return f"{int(thickness_num)}mm"
                            except ValueError:
                                # If it's already a string like "12mm" or "PL10", return as-is
                                return value_str
        
        # Check Tekla Quantity property set specifically (common in Tekla exports)
        if "Tekla Quantity" in psets:
            tekla_qty = psets["Tekla Quantity"]
            # Tekla Quantity might have thickness in Height or Width for plates
            # For plates, Width is often the thickness dimension
            for key in ["Width", "Thickness", "Height"]:  # Width first - most common in Tekla
                if key in tekla_qty:
                    value = tekla_qty[key]
                    if value is not None:
                        try:
                            thickness_num = float(value)
                            # For plates, thickness is usually the smallest dimension (often Width)
                            return f"{int(thickness_num)}mm"
                        except (ValueError, TypeError):
                            pass
    except Exception as e:
        print(f"[PLATE_THICKNESS] Error getting psets for element {element.id() if hasattr(element, 'id') else 'unknown'}: {e}")
        pass
    
    # Try to get from geometry representation (if available)
    try:
        if hasattr(element, "Representation") and element.Representation:
            for rep in element.Representation.Representations or []:
                for item in rep.Items or []:
                    # For plates, thickness might be in the swept area depth
                    if item.is_a("IfcExtrudedAreaSolid"):
                        if hasattr(item, "Depth"):
                            depth = item.Depth
                            if depth:
                                try:
                                    depth_mm = float(depth) * 1000.0  # Convert from meters to mm
                                    return f"{int(depth_mm)}mm"
                                except (ValueError, TypeError):
                                    pass
    except Exception as e:
        print(f"[PLATE_THICKNESS] Error getting thickness from geometry for element {element.id() if hasattr(element, 'id') else 'unknown'}: {e}")
        pass
    
    return "N/A"


def analyze_ifc(file_path: Path) -> Dict[str, Any]:
    """Analyze IFC file and extract steel information."""
    print(f"[ANALYZE] ===== STARTING ANALYSIS FOR {file_path.name} =====")
    try:
        ifc_file = ifcopenshell.open(str(file_path))
        print(f"[ANALYZE] IFC file opened successfully")
    except Exception as e:
        print(f"[ANALYZE] ERROR: Failed to open IFC file: {e}")
        raise Exception(f"Failed to open IFC file: {str(e)}")
    
    assemblies: Dict[str, Dict[str, Any]] = {}
    profiles: Dict[str, Dict[str, Any]] = {}
    plates: Dict[str, Dict[str, Any]] = {}
    
    total_weight = 0.0
    
    # Iterate through all elements
    for element in ifc_file.by_type("IfcProduct"):
        element_type = element.is_a()
        
        if element_type in STEEL_TYPES:
            weight = get_element_weight(element)
            total_weight += weight
            
            # Assembly grouping
            assembly_mark = get_assembly_mark(element)
            if assembly_mark not in assemblies:
                assemblies[assembly_mark] = {
                    "assembly_mark": assembly_mark,
                    "total_weight": 0.0,
                    "member_count": 0,
                    "plate_count": 0
                }
            
            assemblies[assembly_mark]["total_weight"] += weight
            
            if element_type == "IfcPlate":
                assemblies[assembly_mark]["plate_count"] += 1
            else:
                assemblies[assembly_mark]["member_count"] += 1
            
            # Profile grouping (for beams, columns, members)
            # Merge all parts with same profile name regardless of type (beam/column/member)
            if element_type in {"IfcBeam", "IfcColumn", "IfcMember"}:
                profile_name = get_profile_name(element)
                # Normalize profile name (strip whitespace, handle case) to ensure consistent merging
                if profile_name:
                    profile_name = profile_name.strip()
                else:
                    profile_name = None
                
                # Use profile_name as key to merge all types with same profile
                profile_key = profile_name
                
                # Debug: Log ALL profile extractions to see what's happening
                if profile_name:
                    print(f"[ANALYZE] Element {element.id()}: type={element_type}, profile_name='{profile_name}', profile_key='{profile_key}', existing_keys={list(profiles.keys())}")
                
                if not profile_key:
                    # Skip elements without profile names
                    continue
                
                if profile_key not in profiles:
                    # First time seeing this profile - create new entry
                    profiles[profile_key] = {
                        "profile_name": profile_name,
                        "element_type": element_type.replace("Ifc", "").lower(),  # Set initial type
                        "piece_count": 0,
                        "total_weight": 0.0
                    }
                    print(f"[ANALYZE] Created new profile group: '{profile_name}' (type: {profiles[profile_key]['element_type']})")
                else:
                    # Profile already exists - check if we're merging different types
                    existing_type = profiles[profile_key].get("element_type")
                    current_type = element_type.replace("Ifc", "").lower()
                    
                    print(f"[ANALYZE] Profile '{profile_name}' already exists (type: {existing_type}), current element type: {current_type}")
                    
                    if existing_type != current_type:
                        # Different element type - mark as merged
                        if existing_type != "mixed":
                            print(f"[ANALYZE] *** MERGING {element_type} into existing profile '{profile_name}' (was {existing_type}, now mixed) ***")
                            profiles[profile_key]["element_type"] = "mixed"
                        else:
                            print(f"[ANALYZE] Adding {element_type} to already-mixed profile '{profile_name}'")
                    else:
                        print(f"[ANALYZE] Same type ({current_type}), just incrementing count")
                
                profiles[profile_key]["piece_count"] += 1
                profiles[profile_key]["total_weight"] += weight
            
            # Plate grouping
            if element_type == "IfcPlate":
                thickness = get_plate_thickness(element)
                plate_key = f"{thickness}"
                
                # Debug: Log first few plate thickness extractions
                if len(plates) < 5:
                    print(f"[ANALYZE] Element {element.id()}: type={element_type}, thickness={thickness}")
                
                if plate_key not in plates:
                    plates[plate_key] = {
                        "thickness_profile": thickness,
                        "piece_count": 0,
                        "total_weight": 0.0
                    }
                
                plates[plate_key]["piece_count"] += 1
                plates[plate_key]["total_weight"] += weight
    
    # Convert to lists
    assembly_list = list(assemblies.values())
    profile_list = list(profiles.values())
    plate_list = list(plates.values())
    
    # Debug: Log merged profiles
    print(f"[ANALYZE] ===== ANALYSIS COMPLETE =====")
    print(f"[ANALYZE] Total profiles after merging: {len(profile_list)}")
    for profile in profile_list:
        element_type_display = profile.get('element_type', 'N/A')
        if element_type_display == "mixed":
            element_type_display = "MIXED (merged)"
        print(f"[ANALYZE] Profile: {profile['profile_name']}, type: {element_type_display}, pieces: {profile['piece_count']}")
    print(f"[ANALYZE] ===== END ANALYSIS =====")
    
    return {
        "total_tonnage": round(total_weight / 1000.0, 2),  # Convert kg to tonnes
        "assemblies": assembly_list,
        "profiles": profile_list,
        "plates": plate_list
    }


@app.post("/api/upload")
async def upload_ifc(file: UploadFile = File(...)):
    """Upload an IFC file."""
    print("=" * 60)
    print("[UPLOAD] ===== UPLOAD ENDPOINT CALLED =====")
    print(f"[UPLOAD] File: {file.filename}")
    print("=" * 60)
    try:
        if not file.filename or not file.filename.endswith((".ifc", ".IFC")):
            raise HTTPException(status_code=400, detail="File must be an IFC file")
        
        # Sanitize filename for Windows compatibility
        safe_filename = sanitize_filename(file.filename)
        print(f"[UPLOAD] Received upload request: {file.filename} -> sanitized to: {safe_filename}")
        
        file_path = IFC_DIR / safe_filename
        
        # Save file
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="File is empty")
        
        with open(file_path, "wb") as f:
            f.write(content)
        
        print(f"[UPLOAD] File saved: {file_path}, size: {len(content)} bytes")
        
        # Analyze IFC
        print(f"[UPLOAD] About to call analyze_ifc for: {file_path}")
        try:
            report = analyze_ifc(file_path)
            print(f"[UPLOAD] analyze_ifc completed successfully. Report has {len(report.get('profiles', []))} profiles")
            
            # Save report
            report_path = REPORTS_DIR / f"{safe_filename}.json"
            with open(report_path, "w", encoding='utf-8') as f:
                json.dump(report, f, indent=2)
            
            # Convert to glTF synchronously (for now, to catch errors)
            gltf_filename = f"{Path(safe_filename).stem}.glb"
            gltf_path = GLTF_DIR / gltf_filename
            
            gltf_available = False
            conversion_error = None
            
            # Always force regeneration: delete existing glb if present
            if gltf_path.exists():
                try:
                    gltf_path.unlink()
                    print(f"[UPLOAD] Existing glTF removed to force regeneration: {gltf_path}")
                except Exception as e:
                    print(f"[UPLOAD] Warning: could not delete existing glTF {gltf_path}: {e}")
            
            # Try conversion, but don't block upload if it fails
            try:
                print(f"[UPLOAD] Starting glTF conversion for {safe_filename}...")
                convert_ifc_to_gltf(file_path, gltf_path)
                gltf_available = gltf_path.exists()
                if gltf_available:
                    print(f"[UPLOAD] glTF conversion completed: {gltf_path}")
                else:
                    print(f"[UPLOAD] WARNING: glTF conversion completed but file not found: {gltf_path}")
            except Exception as e:
                conversion_error = str(e)
                print(f"[UPLOAD] ERROR: glTF conversion failed: {e}")
                import traceback
                traceback.print_exc()
                # Don't fail the upload, just log the error
            
            # Log profiles in the report being returned
            print(f"[UPLOAD] Report contains {len(report.get('profiles', []))} profiles:")
            for profile in report.get('profiles', []):
                print(f"[UPLOAD]   - {profile.get('profile_name')} (type: {profile.get('element_type', 'N/A')}, pieces: {profile.get('piece_count', 0)})")
            
            response_data = {
                "filename": safe_filename,  # Return sanitized filename
                "original_filename": file.filename,  # Keep original for display
                "report": report,
                "gltf_available": bool(gltf_available),  # Ensure it's always a boolean
                "gltf_path": f"/api/gltf/{gltf_filename}",  # Always include this
            }
            if conversion_error:
                response_data["conversion_error"] = str(conversion_error)
            
            print(f"[UPLOAD] ===== UPLOAD COMPLETE =====")
            
            return JSONResponse(response_data)
        except Exception as e:
            # Clean up file on error
            if file_path.exists():
                file_path.unlink()
            error_msg = f"Error analyzing IFC: {str(e)}"
            print(f"[UPLOAD] {error_msg}")
            import traceback
            print(f"[UPLOAD] Full traceback:")
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Failed to analyze IFC: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Upload failed: {str(e)}"
        print(f"[UPLOAD] {error_msg}")
        import traceback
        print(f"[UPLOAD] Full traceback:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.get("/api/report/{filename}")
async def get_report(filename: str):
    """Get report for a specific IFC file."""
    from urllib.parse import unquote
    decoded_filename = unquote(filename)
    report_path = REPORTS_DIR / f"{decoded_filename}.json"
    
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    
    with open(report_path, "r") as f:
        report = json.load(f)
    
    # Debug: Log profiles in the report
    print(f"[REPORT] Loading report for {decoded_filename}")
    print(f"[REPORT] Total profiles in report: {len(report.get('profiles', []))}")
    for profile in report.get('profiles', [])[:10]:  # Log first 10
        print(f"[REPORT] Profile: {profile.get('profile_name')}, type: {profile.get('element_type')}, pieces: {profile.get('piece_count')}")
    
    return JSONResponse(report)


@app.get("/api/ifc/{filename}")
@app.head("/api/ifc/{filename}")
async def get_ifc_file(filename: str):
    """Serve IFC file for viewer."""
    file_path = IFC_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="IFC file not found")
    
    return FileResponse(
        file_path,
        media_type="application/octet-stream",
        filename=filename
    )


@app.get("/api/export/{filename}/{report_type}")
async def export_report(filename: str, report_type: str):
    """Export report as CSV."""
    if report_type not in ["assemblies", "profiles", "plates"]:
        raise HTTPException(status_code=400, detail="Invalid report type")
    
    report_path = REPORTS_DIR / f"{filename}.json"
    
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    
    with open(report_path, "r") as f:
        report = json.load(f)
    
    import csv
    import io
    
    output = io.StringIO()
    
    if report_type == "assemblies":
        writer = csv.DictWriter(output, fieldnames=["assembly_mark", "total_weight", "member_count", "plate_count"])
        writer.writeheader()
        writer.writerows(report["assemblies"])
    elif report_type == "profiles":
        writer = csv.DictWriter(output, fieldnames=["profile_name", "element_type", "piece_count", "total_weight"])
        writer.writeheader()
        writer.writerows(report["profiles"])
    elif report_type == "plates":
        writer = csv.DictWriter(output, fieldnames=["thickness_profile", "piece_count", "total_weight"])
        writer.writeheader()
        writer.writerows(report["plates"])
    
    from fastapi.responses import Response
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}_{report_type}.csv"'}
    )


def convert_ifc_to_gltf(ifc_path: Path, gltf_path: Path) -> bool:
    """Convert IFC file to glTF format using IfcOpenShell and trimesh."""
    try:
        import ifcopenshell.geom
        import trimesh
        import numpy as np
        
        ifc_file = ifcopenshell.open(str(ifc_path))
        
        # Settings for geometry extraction
        # Use WORLD_COORDS to get consistent coordinate system
        settings = ifcopenshell.geom.settings()
        settings.set(settings.USE_WORLD_COORDS, True)  # Use world coordinates for consistency
        settings.set(settings.WELD_VERTICES, True)
        settings.set(settings.DISABLE_OPENING_SUBTRACTIONS, False)
        
        print(f"[GLTF] Using WORLD coordinates, preserving original IFC axis orientation")
        
        # Helpers for color extraction
        def normalize_rgb(rgb_tuple):
            """Normalize RGB tuple that may be 0-1 or 0-255 to 0-255 ints."""
            if rgb_tuple is None or len(rgb_tuple) < 3:
                return None
            # detect range
            max_v = max(rgb_tuple[0], rgb_tuple[1], rgb_tuple[2])
            if max_v is None:
                return None
            if max_v <= 1.0:
                return (int(rgb_tuple[0] * 255), int(rgb_tuple[1] * 255), int(rgb_tuple[2] * 255))
            else:
                return (int(rgb_tuple[0]), int(rgb_tuple[1]), int(rgb_tuple[2]))

        def extract_style_color(style_obj):
            """Try to extract an RGB color tuple (0-255) from a style-like object or dict."""
            try:
                if style_obj is None:
                    return None
                # Dict-like
                if isinstance(style_obj, dict):
                    # Common keys used by IfcOpenShell styles
                    for key in ["DiffuseColor", "diffuse", "Color", "color", "surfacecolor", "surface_color"]:
                        if key in style_obj:
                            col = style_obj[key]
                            if isinstance(col, (list, tuple)) and len(col) >= 3:
                                return normalize_rgb(col)
                    # Sometimes nested under "surface"
                    if "surface" in style_obj and isinstance(style_obj["surface"], dict):
                        col = style_obj["surface"].get("color")
                        if isinstance(col, (list, tuple)) and len(col) >= 3:
                            return normalize_rgb(col)
                else:
                    # Attribute-style access
                    for attr in ["DiffuseColor", "diffuse", "Color", "color", "SurfaceColour", "surfacecolor"]:
                        if hasattr(style_obj, attr):
                            col = getattr(style_obj, attr)
                            if isinstance(col, (list, tuple)) and len(col) >= 3:
                                return normalize_rgb(col)
                            # If SurfaceColour is an IFC entity with Red/Green/Blue
                            if hasattr(col, "Red") and hasattr(col, "Green") and hasattr(col, "Blue"):
                                return normalize_rgb((col.Red, col.Green, col.Blue))
                    # Direct component attributes
                    if all(hasattr(style_obj, c) for c in ["Red", "Green", "Blue"]):
                        return normalize_rgb((style_obj.Red, style_obj.Green, style_obj.Blue))
            except Exception:
                return None
            return None

        # Color extraction from IFC elements using IfcOpenShell utilities and manual traversal
        def is_fastener_like(product):
            """Return True if this IFC product is a fastener element.
            
            Handles both standard IFC fastener entities and Tekla Structures-specific patterns.
            Tekla may export fasteners as IfcBeam, IfcColumn, or other types with specific names/tags.
            """
            element_type = product.is_a()
            
            # Standard IFC fastener entities
            fastener_entities = {
                "IfcFastener",
                "IfcMechanicalFastener",
            }
            if element_type in fastener_entities:
                return True
            
            # Tekla Structures often exports fasteners as other types with specific names/tags
            try:
                name = (getattr(product, 'Name', None) or '').lower()
                desc = (getattr(product, 'Description', None) or '').lower()
                tag = (getattr(product, 'Tag', None) or '').lower()
                
                # Check for fastener keywords in name/description/tag
                fastener_keywords = ['bolt', 'nut', 'washer', 'fastener', 'screw', 'anchor', 'mechanical']
                text_content = name + ' ' + desc + ' ' + tag
                if any(kw in text_content for kw in fastener_keywords):
                    print(f"[GLTF] Detected fastener by name/tag: {element_type} (ID: {product.id()}), Name='{name}', Tag='{tag}'")
                    return True
                
                # Check Tekla-specific property sets
                try:
                    psets = ifcopenshell.util.element.get_psets(product)
                    for pset_name in psets.keys():
                        pset_lower = pset_name.lower()
                        if 'bolt' in pset_lower or 'fastener' in pset_lower or 'mechanical' in pset_lower:
                            print(f"[GLTF] Detected fastener by property set: {element_type} (ID: {product.id()}), PSet='{pset_name}'")
                            return True
                except:
                    pass
            except Exception as e:
                # If any error occurs, just continue with standard detection
                pass
            
            return False

        def get_element_color(product):
            """Get color for IFC element - try to extract from IFC, fallback to type-based defaults."""
            element_type = product.is_a()

            # Dark brown-gold for all fastener-like elements
            if is_fastener_like(product):
                return (139, 105, 20)  # Dark brown-gold (0x8B6914 in RGB)
            
            # Try to extract actual color from IFC element using IfcOpenShell utilities
            try:
                import ifcopenshell.util.style
                style = ifcopenshell.util.style.get_style(product)
                if style and hasattr(style, "Styles"):
                    for rendering in style.Styles or []:
                        if rendering.is_a('IfcSurfaceStyleRendering') and rendering.SurfaceColour:
                            rgb = normalize_rgb((rendering.SurfaceColour.Red, rendering.SurfaceColour.Green, rendering.SurfaceColour.Blue))
                            if rgb:
                                print(f"[GLTF] Extracted color from style for {element_type} (ID: {product.id()}): RGB{rgb}")
                                return rgb
                        # Some styles may expose color differently
                        maybe_rgb = extract_style_color(rendering)
                        if maybe_rgb:
                            print(f"[GLTF] Extracted color from style (alt) for {element_type} (ID: {product.id()}): RGB{maybe_rgb}")
                            return maybe_rgb
            except Exception:
                pass
            
            # Try to get color from presentation style assignments
            try:
                if hasattr(product, 'HasAssignments'):
                    for assignment in product.HasAssignments or []:
                        if assignment.is_a('IfcStyledItem'):
                            for style in assignment.Styles or []:
                                if style.is_a('IfcSurfaceStyle'):
                                    for rendering in style.Styles or []:
                                        if rendering.is_a('IfcSurfaceStyleRendering') and rendering.SurfaceColour:
                                            rgb = normalize_rgb((rendering.SurfaceColour.Red, rendering.SurfaceColour.Green, rendering.SurfaceColour.Blue))
                                            if rgb:
                                                print(f"[GLTF] Extracted color from assignment for {element_type} (ID: {product.id()}): RGB{rgb}")
                                                return rgb
                                        maybe_rgb = extract_style_color(rendering)
                                        if maybe_rgb:
                                            print(f"[GLTF] Extracted color from assignment (alt) for {element_type} (ID: {product.id()}): RGB{maybe_rgb}")
                                            return maybe_rgb
            except Exception:
                pass
            
            # Try to get color from material styles and representation items
            try:
                materials = ifcopenshell.util.element.get_materials(product)
                for material in materials:
                    if hasattr(material, 'HasRepresentation'):
                        for rep in material.HasRepresentation or []:
                            if rep.is_a('IfcStyledRepresentation'):
                                for item in rep.Items or []:
                                    if item.is_a('IfcStyledItem'):
                                        for style in item.Styles or []:
                                            if style.is_a('IfcSurfaceStyle'):
                                                for rendering in style.Styles or []:
                                                    if rendering.is_a('IfcSurfaceStyleRendering') and rendering.SurfaceColour:
                                                        rgb = normalize_rgb((rendering.SurfaceColour.Red, rendering.SurfaceColour.Green, rendering.SurfaceColour.Blue))
                                                        if rgb:
                                                            print(f"[GLTF] Extracted color from material for {element_type} (ID: {product.id()}): RGB{rgb}")
                                                            return rgb
                                                    maybe_rgb = extract_style_color(rendering)
                                                    if maybe_rgb:
                                                        print(f"[GLTF] Extracted color from material (alt) for {element_type} (ID: {product.id()}): RGB{maybe_rgb}")
                                                        return maybe_rgb
            except Exception:
                pass

            # Try to walk the product representation tree for styled items
            try:
                if hasattr(product, "Representation") and product.Representation:
                    for rep in product.Representation.Representations or []:
                        for item in rep.Items or []:
                            styled_items = []
                            if item.is_a("IfcStyledItem"):
                                styled_items.append(item)
                            if hasattr(item, "StyledByItem"):
                                styled_items.extend(item.StyledByItem or [])
                            for s_item in styled_items:
                                for style in s_item.Styles or []:
                                    if style.is_a('IfcSurfaceStyle'):
                                        for rendering in style.Styles or []:
                                            if rendering.is_a('IfcSurfaceStyleRendering') and rendering.SurfaceColour:
                                                rgb = normalize_rgb((rendering.SurfaceColour.Red, rendering.SurfaceColour.Green, rendering.SurfaceColour.Blue))
                                                if rgb:
                                                    print(f"[GLTF] Extracted color from representation for {element_type} (ID: {product.id()}): RGB{rgb}")
                                                    return rgb
                                            maybe_rgb = extract_style_color(rendering)
                                            if maybe_rgb:
                                                print(f"[GLTF] Extracted color from representation (alt) for {element_type} (ID: {product.id()}): RGB{maybe_rgb}")
                                                return maybe_rgb
            except Exception:
                pass
            
            # Fallback to type-based color map if no color found in IFC
            color_map = {
                "IfcBeam": (180, 180, 220),      # Light blue-gray
                "IfcColumn": (150, 200, 220),    # Light blue
                "IfcMember": (200, 180, 150),    # Light brown
                "IfcPlate": (220, 200, 180),     # Light tan
                # Gold-yellow for IFC fastener entities
                "IfcFastener": (139, 105, 20),  # Dark brown-gold
                "IfcMechanicalFastener": (139, 105, 20),  # Dark brown-gold
                "IfcBuildingElementProxy": (200, 200, 200),  # Light gray
            }
            
            # Default steel color (light gray-blue)
            default_color = (190, 190, 220)
            return color_map.get(element_type, default_color)
        
        # Collect all meshes from IFC products
        meshes = []
        product_ids = []
        assembly_marks = []  # Store assembly marks for each mesh
        failed_count = 0
        skipped_count = 0
        
        # Get all products with geometry
        products = ifc_file.by_type("IfcProduct")
        print(f"[GLTF] Found {len(products)} products in IFC file")
        
        for product in products:
            try:
                element_type = product.is_a()
                
                # Try to create geometry - don't skip if Representation check fails
                # Some IFC files have geometry in different structures
                shape = None
                try:
                    shape = ifcopenshell.geom.create_shape(settings, product)
                except Exception as shape_error:
                    # If local coords fail, try world coords as fallback
                    try:
                        alt_settings = ifcopenshell.geom.settings()
                        alt_settings.set(alt_settings.USE_WORLD_COORDS, True)
                        alt_settings.set(alt_settings.WELD_VERTICES, True)
                        shape = ifcopenshell.geom.create_shape(alt_settings, product)
                    except:
                        skipped_count += 1
                        if skipped_count <= 5:  # Only log first few
                            print(f"[GLTF] Could not create shape for {element_type} (ID: {product.id()}): {shape_error}")
                        continue
                
                if not shape:
                    skipped_count += 1
                    continue
                
                # Get geometry data
                try:
                    verts = shape.geometry.verts
                    faces = shape.geometry.faces
                    # Try to get colors from geometry if available
                    colors = None
                    if hasattr(shape.geometry, 'colors') and shape.geometry.colors:
                        colors = shape.geometry.colors
                    elif hasattr(shape.geometry, 'materials') and shape.geometry.materials:
                        # materials may encode color indices; store for later use
                        colors = shape.geometry.materials
                    elif hasattr(shape, 'styles') and shape.styles:
                        # Try to get colors from styles
                        try:
                            colors = shape.styles
                        except:
                            pass
                except Exception as e:
                    print(f"[GLTF] Error getting geometry data: {e}")
                    failed_count += 1
                    continue
                
                if not verts or not faces or len(verts) == 0 or len(faces) == 0:
                    skipped_count += 1
                    continue
                
                # Reshape vertices (every 3 floats is a vertex)
                try:
                    vertices = np.array(verts).reshape(-1, 3)
                    # Use vertices as-is - preserve original IFC coordinate system
                except Exception as e:
                    print(f"[GLTF] Error reshaping vertices: {e}")
                    failed_count += 1
                    continue
                
                # Reshape faces (every 3 ints is a face)
                try:
                    face_indices = np.array(faces).reshape(-1, 3)
                except Exception as e:
                    print(f"[GLTF] Error reshaping faces: {e}")
                    failed_count += 1
                    continue
                
                # Validate geometry
                if vertices.shape[0] < 3 or face_indices.shape[0] < 1:
                    skipped_count += 1
                    continue
                
                # Check if this is a fastener FIRST - before processing any colors
                # This prevents extracting black colors from geometry for fasteners
                is_fastener = is_fastener_like(product)
                
                # Get assembly mark for this product - store it for later use
                assembly_mark = get_assembly_mark(product)
                
                # Get color for this element - try geometry colors first, then IFC extraction, then fallback
                color_rgb = None
                use_geometry_colors = False
                
                # Skip geometry color extraction for fasteners - they always get gold
                if is_fastener:
                    colors = None  # Don't use any geometry colors for fasteners
                    print(f"[GLTF] Skipping geometry color extraction for fastener product {product.id()}")
                
                # First, try to get color from geometry (if IfcOpenShell extracted it)
                if colors is not None and len(colors) > 0:
                    try:
                        color_array = np.array(colors)
                        avg_color = None
                        # Determine if colors are per-vertex or per-face
                        if color_array.ndim >= 2 and color_array.shape[1] >= 3:
                            if len(color_array) >= len(vertices):
                                # Per-vertex colors
                                avg_color = color_array[:len(vertices)].mean(axis=0)
                                use_geometry_colors = True
                            elif len(color_array) >= len(face_indices):
                                # Per-face colors
                                avg_color = color_array[:len(face_indices)].mean(axis=0)
                                use_geometry_colors = True
                        elif color_array.ndim == 1 and len(color_array) >= 3:
                            avg_color = color_array[:3]
                            use_geometry_colors = True
                        elif isinstance(colors, list) and len(colors) > 0:
                            maybe = extract_style_color(colors[0])
                            if maybe:
                                color_rgb = maybe
                        if avg_color is not None and len(avg_color) >= 3:
                            # Normalize 0-1 or 0-255 to 0-255
                            color_rgb = normalize_rgb((avg_color[0], avg_color[1], avg_color[2]))
                            if color_rgb:
                                print(f"[GLTF] Using geometry color for product {product.id()}: {color_rgb} (use_geometry_colors={use_geometry_colors})")
                    except Exception as e:
                        print(f"[GLTF] Warning: Could not parse geometry colors: {e}")
                
                # If still no color, try material definitions from geometry
                if color_rgb is None:
                    try:
                        mats = getattr(shape.geometry, "materials", None)
                        mat_ids = getattr(shape.geometry, "material_ids", None)
                        if mats and mat_ids and len(mat_ids) > 0:
                            first_id = mat_ids[0]
                            if isinstance(mats, (list, tuple)) and len(mats) > first_id:
                                mat = mats[first_id]
                                try:
                                    col = mat.get_color()
                                    if col is not None:
                                        # Try r/g/b attributes (call if needed)
                                        if hasattr(col, "r") and hasattr(col, "g") and hasattr(col, "b"):
                                            rv = col.r() if callable(col.r) else col.r
                                            gv = col.g() if callable(col.g) else col.g
                                            bv = col.b() if callable(col.b) else col.b
                                            color_rgb = normalize_rgb((rv, gv, bv))
                                        # Try components (call if needed)
                                        if color_rgb is None and hasattr(col, "components"):
                                            comps = col.components() if callable(col.components) else col.components
                                            if comps is not None and len(comps) >= 3:
                                                color_rgb = normalize_rgb((comps[0], comps[1], comps[2]))
                                        # If color supports red/green/blue methods
                                        if color_rgb is None and hasattr(col, "red") and callable(col.red):
                                            color_rgb = normalize_rgb((col.red(), col.green(), col.blue()))
                                        # If color exposes components directly
                                        if color_rgb is None and hasattr(col, "Colour"):
                                            c = col.Colour
                                            color_rgb = normalize_rgb((c[0], c[1], c[2]))
                                        if color_rgb is None and hasattr(col, "colour"):
                                            c = col.colour
                                            color_rgb = normalize_rgb((c[0], c[1], c[2]))

                                    # If material color is effectively black, treat as no color so we fall back
                                    if color_rgb is not None:
                                        if color_rgb[0] < 5 and color_rgb[1] < 5 and color_rgb[2] < 5:
                                            # Reset to None so get_element_color (type-based map) is used instead
                                            print(f"[GLTF] Ignoring near-black material color for product {product.id()}: {color_rgb}")
                                            color_rgb = None
                                        else:
                                            print(f"[GLTF] Using material color for product {product.id()}: {color_rgb}")
                                except Exception as e:
                                    print(f"[GLTF] Warning: material color read failed for product {product.id()}: {e}")
                    except Exception as e:
                        print(f"[GLTF] Warning: Could not parse geometry materials: {e}")
                
                # If no geometry color, try IFC extraction (but skip for fasteners - they get gold)
                if color_rgb is None and not is_fastener:
                    color_rgb = get_element_color(product)
                    if color_rgb != (190, 190, 220):  # Not default color
                        print(f"[GLTF] Using extracted IFC color for product {product.id()}: {color_rgb}")
                
                # If this is a fastener-like element, always force the gold color
                if is_fastener:
                    color_rgb = (139, 105, 20)  # Dark brown-gold
                    use_geometry_colors = False
                    # Ensure colors is None so we don't use any black geometry colors
                    colors = None
                    print(f"[GLTF] Forcing gold color for fastener product {product.id()}")
                
                # Create trimesh object
                try:
                    mesh = trimesh.Trimesh(vertices=vertices, faces=face_indices)
                except Exception as e:
                    print(f"[GLTF] Error creating trimesh: {e}")
                    failed_count += 1
                    continue
                
                if mesh.vertices.shape[0] > 0 and mesh.faces.shape[0] > 0:
                    # Apply material color using trimesh visual
                    # Convert RGB (0-255) to normalized (0-1) for trimesh material
                    color_normalized = [c / 255.0 for c in color_rgb]
                    
                    # Create PBR material with color - ensure it's properly set
                    try:
                        # For fasteners, ALWAYS use gold color in material, regardless of geometry colors
                        # For non-fasteners, if geometry provided explicit colors, keep material white to let vertex colors show naturally.
                        if is_fastener:
                            # Force gold color for fasteners
                            base_color_factor = color_normalized + [1.0]  # Dark brown-gold color (139, 105, 20) normalized
                            print(f"[GLTF] Setting baseColorFactor to gold for fastener product {product.id()}: {base_color_factor}")
                        else:
                            base_color_factor = [1.0, 1.0, 1.0, 1.0] if use_geometry_colors else color_normalized + [1.0]
                        material = trimesh.visual.material.PBRMaterial(
                            baseColorFactor=base_color_factor,  # RGBA
                            metallicFactor=0.2,
                            roughnessFactor=0.8,
                            doubleSided=True  # Ensure both sides are visible
                        )
                        # Tag material with IFC element type so viewer can detect fasteners etc.
                        # If this is a fastener (detected by name/tag even if not IfcFastener entity), tag it specially
                        try:
                            if is_fastener:
                                # Tag as fastener so frontend can detect it
                                material.name = "IfcFastener_Detected"
                            else:
                                material.name = str(element_type)
                        except Exception:
                            pass
                        mesh.visual.material = material
                        # Also set colors when geometry provided them; prefer per-face if available, otherwise per-vertex, otherwise uniform
                        # CRITICAL: Skip ALL vertex/face color setting for fasteners - they use material color only
                        if use_geometry_colors and colors is not None and not is_fastener:
                            try:
                                color_array = np.array(colors)
                                # Case 1: per-face colors
                                if color_array.ndim >= 2 and color_array.shape[0] == len(face_indices) and color_array.shape[1] >= 3:
                                    face_colors = []
                                    for fc in color_array:
                                        if fc[0] > 1.0 or fc[1] > 1.0 or fc[2] > 1.0:
                                            face_colors.append([fc[0], fc[1], fc[2], 255.0])
                                        else:
                                            face_colors.append([fc[0] * 255.0, fc[1] * 255.0, fc[2] * 255.0, 255.0])
                                    mesh.visual.face_colors = np.array(face_colors)
                                    print(f"[GLTF] Applied per-face colors for product {product.id()} (faces={len(face_colors)})")
                                # Case 2: per-vertex colors
                                elif color_array.ndim >= 2 and color_array.shape[0] >= len(vertices) and color_array.shape[1] >= 3:
                                    vertex_colors = []
                                    for i in range(len(vertices)):
                                        c = color_array[i]
                                        if c[0] > 1.0 or c[1] > 1.0 or c[2] > 1.0:
                                            vertex_colors.append([c[0]/255.0, c[1]/255.0, c[2]/255.0, 1.0])
                                        else:
                                            vertex_colors.append([c[0], c[1], c[2], 1.0])
                                    mesh.visual.vertex_colors = np.array(vertex_colors)
                                    print(f"[GLTF] Applied per-vertex colors for product {product.id()} (count={len(vertex_colors)})")
                                # Case 3: list of style dicts matching faces
                                elif isinstance(colors, list) and len(colors) == len(face_indices):
                                    face_colors = []
                                    for fc in colors:
                                        maybe = extract_style_color(fc)
                                        if maybe:
                                            face_colors.append([maybe[0], maybe[1], maybe[2], 255])
                                        else:
                                            face_colors.append([color_rgb[0], color_rgb[1], color_rgb[2], 255])
                                    mesh.visual.face_colors = np.array(face_colors)
                                    print(f"[GLTF] Applied per-face style colors for product {product.id()} (faces={len(face_colors)})")
                                else:
                                    # fallback to uniform - but NOT for fasteners
                                    if not is_fastener:
                                        mesh.visual.vertex_colors = np.tile(color_normalized + [1.0], (len(mesh.vertices), 1))
                                    else:
                                        print(f"[GLTF] Skipping uniform vertex colors for fastener product {product.id()} - using material color only")
                            except Exception as e:
                                print(f"[GLTF] Warning: Could not apply geometry-driven colors, using uniform: {e}")
                                # Don't set vertex colors for fasteners - let material color show through
                                if not is_fastener:
                                    mesh.visual.vertex_colors = np.tile(color_normalized + [1.0], (len(mesh.vertices), 1))
                                else:
                                    print(f"[GLTF] Skipping vertex colors in exception handler for fastener product {product.id()} - using material color only")
                        else:
                            # Use uniform color for all vertices
                            # For fasteners, DON'T set vertex colors - let material color show through
                            if is_fastener:
                                # Don't set vertex colors for fasteners - material color will be used
                                # This prevents black vertex colors from overriding the gold material
                                print(f"[GLTF] Skipping vertex colors for fastener product {product.id()} - using material color only")
                            else:
                                mesh.visual.vertex_colors = np.tile(color_normalized + [1.0], (len(mesh.vertices), 1))
                    except Exception as e:
                        # Fallback: use simple material with color
                        print(f"[GLTF] Warning: Could not set PBR material for product {product.id()}, using SimpleMaterial: {e}")
                        try:
                            # For fasteners, ensure gold color even in fallback
                            if is_fastener:
                                color_rgb = (139, 105, 20)  # Dark brown-gold
                            material = trimesh.visual.material.SimpleMaterial(
                                diffuse=list(color_rgb) + [255],  # RGBA
                                doubleSided=True
                            )
                            try:
                                if is_fastener:
                                    material.name = "IfcFastener_Detected"
                                else:
                                    material.name = str(element_type)
                            except Exception:
                                pass
                            mesh.visual.material = material
                            # Set vertex colors as backup - but NOT for fasteners (let material show)
                            if is_fastener:
                                # Don't set vertex colors - material color will be used
                                print(f"[GLTF] Skipping vertex colors in fallback for fastener product {product.id()} - using material color only")
                            else:
                                mesh.visual.vertex_colors = np.tile(color_rgb + [255], (len(mesh.vertices), 1))
                        except Exception as e2:
                            # Last resort: set vertex colors directly - but NOT for fasteners
                            print(f"[GLTF] Warning: Could not set material, using vertex colors only: {e2}")
                            # For fasteners, we still don't want vertex colors - they should use material
                            if not is_fastener:
                                mesh.visual.vertex_colors = np.tile(color_rgb + [255], (len(mesh.vertices), 1))
                            else:
                                print(f"[GLTF] Skipping vertex colors in last resort for fastener product {product.id()} - using material color only")
                    
                    # CRITICAL: For fasteners, explicitly clear ANY existing vertex/face colors before export
                    # This ensures the glTF file doesn't contain vertex colors that override the material
                    if is_fastener:
                        # Clear vertex colors if they exist - do this multiple ways to be sure
                        if hasattr(mesh.visual, 'vertex_colors'):
                            mesh.visual.vertex_colors = None
                            # Also try to delete the attribute if it exists
                            if hasattr(mesh.visual, '__dict__') and 'vertex_colors' in mesh.visual.__dict__:
                                del mesh.visual.__dict__['vertex_colors']
                            print(f"[GLTF] Cleared vertex_colors for fastener product {product.id()}")
                        # Clear face colors if they exist
                        if hasattr(mesh.visual, 'face_colors'):
                            mesh.visual.face_colors = None
                            if hasattr(mesh.visual, '__dict__') and 'face_colors' in mesh.visual.__dict__:
                                del mesh.visual.__dict__['face_colors']
                            print(f"[GLTF] Cleared face_colors for fastener product {product.id()}")
                        # Ensure material color is set correctly - FORCE it to gold
                        try:
                            if hasattr(mesh.visual, 'material') and mesh.visual.material:
                                # Force gold color in material
                                gold_normalized = [139/255.0, 105/255.0, 20/255.0, 1.0]  # Dark brown-gold
                                if hasattr(mesh.visual.material, 'baseColorFactor'):
                                    mesh.visual.material.baseColorFactor = gold_normalized
                                    print(f"[GLTF] FORCED baseColorFactor to gold for fastener product {product.id()}: {gold_normalized}")
                                # Also try to set color directly if the material supports it
                                if hasattr(mesh.visual.material, 'color'):
                                    try:
                                        mesh.visual.material.color = gold_normalized[:3]
                                        print(f"[GLTF] Set material.color to gold for fastener product {product.id()}")
                                    except:
                                        pass
                        except Exception as e:
                            print(f"[GLTF] Warning: Could not update material for fastener product {product.id()}: {e}")
                        # Final verification
                        if hasattr(mesh.visual, 'vertex_colors') and mesh.visual.vertex_colors is not None:
                            print(f"[GLTF] WARNING: vertex_colors still exist for fastener product {product.id()} after clearing!")
                        if hasattr(mesh.visual, 'face_colors') and mesh.visual.face_colors is not None:
                            print(f"[GLTF] WARNING: face_colors still exist for fastener product {product.id()} after clearing!")
                    
                    # Store assembly mark and product info in mesh metadata and name
                    try:
                        # Store in mesh metadata (trimesh supports this)
                        if not hasattr(mesh, 'metadata'):
                            mesh.metadata = {}
                        mesh.metadata['product_id'] = product.id()
                        mesh.metadata['assembly_mark'] = assembly_mark
                        mesh.metadata['element_type'] = element_type
                        
                        # Also store in mesh name for easy access (format: "elementType_productID_assemblyMark")
                        # Replace problematic characters in assembly mark for filename safety
                        safe_assembly_mark = str(assembly_mark).replace('/', '_').replace('\\', '_').replace(' ', '_').replace(':', '_')
                        mesh_name = f"{element_type}_{product.id()}_{safe_assembly_mark}"
                        mesh.metadata['mesh_name'] = mesh_name
                        
                        # Set the mesh name - this will be preserved in glTF export
                        # trimesh doesn't directly support setting mesh.name, but we can use it in the scene
                        # For now, we'll rely on metadata and extract it during export
                    except Exception as e:
                        print(f"[GLTF] Warning: Could not store metadata for product {product.id()}: {e}")
                    
                    meshes.append(mesh)
                    product_ids.append(product.id())
                    assembly_marks.append(assembly_mark)
                else:
                    skipped_count += 1
            except Exception as e:
                # Skip products that fail to convert
                failed_count += 1
                if failed_count <= 5:  # Only log first few
                    print(f"[GLTF] Warning: Failed to convert product {product.id() if hasattr(product, 'id') else 'unknown'}: {e}")
                continue
        
        print(f"[GLTF] Conversion summary: {len(meshes)} meshes created, {skipped_count} skipped, {failed_count} failed")
        
        if not meshes:
            error_msg = f"No valid geometry found in IFC file. Processed {len(products)} products, {skipped_count} skipped, {failed_count} failed."
            if len(products) == 0:
                error_msg += " No products found in file."
            elif skipped_count == len(products):
                error_msg += " All products were skipped (no geometry representation)."
            print(f"[GLTF] ERROR: {error_msg}")
            raise Exception(error_msg)
        
        # CRITICAL: For fasteners, recreate meshes with completely clean geometry (no vertex/face colors)
        # This ensures the glTF exporter has NO color data to include
        print(f"[GLTF] Cleaning fastener meshes before export...")
        cleaned_meshes = []
        for i, mesh in enumerate(meshes):
            product_id = product_ids[i] if i < len(product_ids) else None
            # Check if this is a fastener by material name
            is_fastener_mesh = False
            if hasattr(mesh, 'visual') and mesh.visual and hasattr(mesh.visual, 'material'):
                mat = mesh.visual.material
                if hasattr(mat, 'name') and mat.name and 'fastener' in str(mat.name).lower():
                    is_fastener_mesh = True
            
            if is_fastener_mesh:
                # Create a COMPLETELY NEW mesh with only geometry data - no visual data at all
                print(f"[GLTF] Recreating clean mesh for fastener (product ID: {product_id})")
                clean_mesh = trimesh.Trimesh(
                    vertices=mesh.vertices.copy(),
                    faces=mesh.faces.copy(),
                    process=False  # Don't process - we want exact geometry
                )
                # Preserve metadata from original mesh
                if hasattr(mesh, 'metadata') and mesh.metadata:
                    clean_mesh.metadata = mesh.metadata.copy()
                elif product_id and i < len(assembly_marks):
                    # Reconstruct metadata if it was lost
                    clean_mesh.metadata = {
                        'product_id': product_id,
                        'assembly_mark': assembly_marks[i] if i < len(assembly_marks) else 'N/A',
                        'element_type': 'IfcFastener'
                    }
                # Now apply ONLY the material - no vertex/face colors
                gold_normalized = [235/255.0, 190/255.0, 40/255.0, 1.0]
                try:
                    material = trimesh.visual.material.PBRMaterial(
                        baseColorFactor=gold_normalized,
                        metallicFactor=0.7,
                        roughnessFactor=0.35,
                        doubleSided=True
                    )
                    material.name = "IfcFastener_Detected"
                    clean_mesh.visual.material = material
                    print(f"[GLTF] Applied clean gold material to fastener mesh (product ID: {product_id})")
                except Exception as e:
                    print(f"[GLTF] Warning: Could not set PBR material for fastener, using SimpleMaterial: {e}")
                    try:
                        material = trimesh.visual.material.SimpleMaterial(
                            diffuse=[139, 105, 20, 255],  # Dark brown-gold
                            doubleSided=True
                        )
                        material.name = "IfcFastener_Detected"
                        clean_mesh.visual.material = material
                    except Exception as e2:
                        print(f"[GLTF] Error setting SimpleMaterial for fastener: {e2}")
                
                # CRITICAL: Ensure NO vertex or face colors exist
                if hasattr(clean_mesh.visual, 'vertex_colors'):
                    clean_mesh.visual.vertex_colors = None
                if hasattr(clean_mesh.visual, 'face_colors'):
                    clean_mesh.visual.face_colors = None
                
                # Verify no colors exist
                if hasattr(clean_mesh.visual, 'vertex_colors') and clean_mesh.visual.vertex_colors is not None:
                    print(f"[GLTF] ERROR: Clean mesh still has vertex_colors for fastener (product ID: {product_id})!")
                if hasattr(clean_mesh.visual, 'face_colors') and clean_mesh.visual.face_colors is not None:
                    print(f"[GLTF] ERROR: Clean mesh still has face_colors for fastener (product ID: {product_id})!")
                
                cleaned_meshes.append(clean_mesh)
            else:
                # Non-fastener - keep as is
                cleaned_meshes.append(mesh)
        
        print(f"[GLTF] Cleaned {sum(1 for m in cleaned_meshes if hasattr(m.visual, 'material') and hasattr(m.visual.material, 'name') and m.visual.material.name and 'fastener' in str(m.visual.material.name).lower())} fastener meshes")
        
        # Export to glTF/GLB - keep meshes separate to preserve colors
        # Ensure the directory exists
        gltf_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Create a scene with all meshes (preserves individual colors)
        scene = trimesh.Scene(cleaned_meshes)
        
        # Export - trimesh will use .glb extension for binary format
        scene.export(str(gltf_path))
        
        # Verify file was created
        if not gltf_path.exists():
            raise Exception(f"glTF file was not created at {gltf_path}")
        
        print(f"Successfully exported glTF to {gltf_path}, size: {gltf_path.stat().st_size} bytes")
        return True
    except Exception as e:
        print(f"Error in glTF conversion: {str(e)}")
        import traceback
        traceback.print_exc()
        raise


@app.post("/api/convert-gltf/{filename}")
async def convert_to_gltf(filename: str):
    """Convert IFC file to glTF format."""
    # Decode URL-encoded filename (handles spaces and special characters)
    from urllib.parse import unquote
    decoded_filename = unquote(filename)
    file_path = IFC_DIR / decoded_filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="IFC file not found")
    
    gltf_filename = f"{Path(decoded_filename).stem}.glb"
    gltf_path = GLTF_DIR / gltf_filename
    
    # Check if already converted
    if gltf_path.exists():
        return JSONResponse({
            "message": "glTF file already exists",
            "filename": gltf_filename,
            "gltf_path": f"/api/gltf/{gltf_filename}"
        })
    
    try:
        # Convert IFC to glTF
        convert_ifc_to_gltf(file_path, gltf_path)
        
        return JSONResponse({
            "message": "glTF conversion successful",
            "filename": gltf_filename,
            "gltf_path": f"/api/gltf/{gltf_filename}"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")


@app.head("/api/gltf/{filename}")
@app.get("/api/gltf/{filename}")
async def get_gltf_file(filename: str):
    """Serve glTF/GLB file for viewer."""
    # Decode URL-encoded filename (handles spaces and special characters)
    from urllib.parse import unquote
    decoded_filename = unquote(filename)
    file_path = GLTF_DIR / decoded_filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="glTF file not found")
    
    # Determine media type based on extension
    if filename.endswith('.glb'):
        media_type = "model/gltf-binary"
    else:
        media_type = "model/gltf+json"
    
    return FileResponse(
        file_path,
        media_type=media_type,
        filename=filename
    )


def analyze_fastener_structure(ifc_path: Path):
    """Analyze how Tekla Structures exports fasteners in IFC."""
    import ifcopenshell
    import ifcopenshell.util.element
    from collections import Counter
    
    ifc_file = ifcopenshell.open(str(ifc_path))
    
    print(f"\n=== Analyzing IFC file: {ifc_path.name} ===\n")
    
    # Get all products
    all_products = ifc_file.by_type("IfcProduct")
    print(f"Total products: {len(all_products)}\n")
    
    # Count by entity type
    type_counts = Counter(p.is_a() for p in all_products)
    print("Product types (top 20):")
    for t, c in type_counts.most_common(20):
        print(f"  {t}: {c}")
    
    # Look for fastener-related entities
    print("\n=== Fastener-related entities ===")
    fastener_keywords = ['fastener', 'bolt', 'nut', 'washer', 'screw', 'anchor', 'mechanical']
    found_fasteners = []
    
    for product in all_products:
        element_type = product.is_a()
        name = getattr(product, 'Name', None) or ''
        desc = getattr(product, 'Description', None) or ''
        tag = getattr(product, 'Tag', None) or ''
        
        # Check if it's a known fastener type
        if 'Fastener' in element_type or 'FASTENER' in element_type:
            print(f"\n{element_type} (ID: {product.id()}):")
            print(f"  Name: {name}")
            print(f"  Description: {desc}")
            print(f"  Tag: {tag}")
            try:
                psets = ifcopenshell.util.element.get_psets(product)
                print(f"  Property Sets: {list(psets.keys())}")
            except:
                pass
            found_fasteners.append({
                'id': product.id(),
                'type': element_type,
                'name': name,
                'tag': tag,
                'description': desc
            })
        
        # Check if name/desc/tag contains fastener keywords
        elif any(kw in (name + desc + tag).lower() for kw in fastener_keywords):
            print(f"\nPotential fastener - {element_type} (ID: {product.id()}):")
            print(f"  Name: {name}")
            print(f"  Description: {desc}")
            print(f"  Tag: {tag}")
            try:
                psets = ifcopenshell.util.element.get_psets(product)
                print(f"  Property Sets: {list(psets.keys())}")
            except:
                pass
            found_fasteners.append({
                'id': product.id(),
                'type': element_type,
                'name': name,
                'tag': tag,
                'description': desc
            })
    
    # Check for specific Tekla properties
    print("\n=== Checking for Tekla-specific fastener properties ===")
    tekla_fasteners = []
    for product in all_products:
        try:
            psets = ifcopenshell.util.element.get_psets(product)
            for pset_name, props in psets.items():
                # Tekla often uses specific property sets
                if 'Bolt' in pset_name or 'Fastener' in pset_name or 'Mechanical' in pset_name:
                    print(f"\nFound Tekla fastener property set '{pset_name}' on {product.is_a()} (ID: {product.id()}):")
                    print(f"  Properties: {list(props.keys())}")
                    tekla_fasteners.append({
                        'id': product.id(),
                        'type': product.is_a(),
                        'pset': pset_name
                    })
        except:
            pass
    
    return {
        'total_products': len(all_products),
        'type_counts': dict(type_counts),
        'found_fasteners': found_fasteners,
        'tekla_fasteners': tekla_fasteners
    }


@app.get("/api/debug-fasteners/{filename}")
async def debug_fasteners(filename: str):
    """Debug endpoint to analyze fastener structure in IFC file."""
    from urllib.parse import unquote
    decoded_filename = unquote(filename)
    file_path = IFC_DIR / decoded_filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="IFC file not found")
    
    # Run analysis
    try:
        result = analyze_fastener_structure(file_path)
        return JSONResponse(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/api/debug-assembly/{filename}")
async def debug_assembly_structure(filename: str):
    """Debug endpoint to understand how Tekla exports assembly information."""
    from urllib.parse import unquote
    decoded_filename = unquote(filename)
    file_path = IFC_DIR / decoded_filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="IFC file not found")
    
    try:
        ifc_file = ifcopenshell.open(str(file_path))
        
        # Get a sample of products to inspect
        products = list(ifc_file.by_type("IfcProduct"))[:10]  # First 10 products
        
        debug_info = []
        for product in products:
            try:
                product_info = {
                    "id": product.id(),
                    "type": product.is_a(),
                    "tag": getattr(product, 'Tag', None),
                    "name": getattr(product, 'Name', None),
                    "description": getattr(product, 'Description', None),
                    "property_sets": {},
                    "relationships": []
                }
                
                # Get all property sets
                try:
                    psets = ifcopenshell.util.element.get_psets(product)
                    for pset_name, props in psets.items():
                        product_info["property_sets"][pset_name] = dict(props)
                except:
                    pass
                
                # Check relationships
                try:
                    if hasattr(product, 'HasAssignments'):
                        for assignment in product.HasAssignments or []:
                            rel_info = {
                                "type": assignment.is_a(),
                                "related_objects": []
                            }
                            if hasattr(assignment, 'RelatedObjects'):
                                for obj in assignment.RelatedObjects or []:
                                    rel_info["related_objects"].append({
                                        "id": obj.id(),
                                        "type": obj.is_a(),
                                        "tag": getattr(obj, 'Tag', None),
                                        "name": getattr(obj, 'Name', None)
                                    })
                            product_info["relationships"].append(rel_info)
                    
                    # Check IfcRelAggregates (parts to assembly)
                    if hasattr(product, 'Decomposes'):
                        for rel in product.Decomposes or []:
                            if rel.is_a('IfcRelAggregates'):
                                product_info["relationships"].append({
                                    "type": "IfcRelAggregates (part of assembly)",
                                    "relating_object": {
                                        "id": rel.RelatingObject.id() if rel.RelatingObject else None,
                                        "type": rel.RelatingObject.is_a() if rel.RelatingObject else None,
                                        "tag": getattr(rel.RelatingObject, 'Tag', None) if rel.RelatingObject else None,
                                        "name": getattr(rel.RelatingObject, 'Name', None) if rel.RelatingObject else None
                                    }
                                })
                    
                    # Check IfcRelContainedInSpatialStructure
                    if hasattr(product, 'ContainedInStructure'):
                        for rel in product.ContainedInStructure or []:
                            if rel.is_a('IfcRelContainedInSpatialStructure'):
                                product_info["relationships"].append({
                                    "type": "IfcRelContainedInSpatialStructure",
                                    "relating_structure": {
                                        "id": rel.RelatingStructure.id() if rel.RelatingStructure else None,
                                        "type": rel.RelatingStructure.is_a() if rel.RelatingStructure else None,
                                        "tag": getattr(rel.RelatingStructure, 'Tag', None) if rel.RelatingStructure else None,
                                        "name": getattr(rel.RelatingStructure, 'Name', None) if rel.RelatingStructure else None
                                    }
                                })
                except Exception as e:
                    product_info["relationship_error"] = str(e)
                
                debug_info.append(product_info)
            except Exception as e:
                debug_info.append({
                    "id": product.id() if hasattr(product, 'id') else 'unknown',
                    "error": str(e)
                })
        
        return JSONResponse({
            "total_products": len(list(ifc_file.by_type("IfcProduct"))),
            "sample_products": debug_info
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Debug failed: {str(e)}")


@app.get("/api/inspect-entity")
async def inspect_entity(filename: str, entity_id: int):
    """Inspect a specific IFC entity by ID."""
    from urllib.parse import unquote
    decoded_filename = unquote(filename)
    file_path = IFC_DIR / decoded_filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="IFC file not found")
    
    try:
        ifc_file = ifcopenshell.open(str(file_path))
        
        # Try to get entity by ID
        try:
            entity = ifc_file.by_id(entity_id)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Entity with ID {entity_id} not found: {str(e)}")
        
        element_type = entity.is_a()
        name = getattr(entity, 'Name', None) or ''
        tag = getattr(entity, 'Tag', None) or ''
        desc = getattr(entity, 'Description', None) or ''
        
        # Check if it's a fastener using the same logic as is_fastener_like
        is_fastener = False
        fastener_method = None
        
        # Check standard IFC fastener entities
        if element_type in {"IfcFastener", "IfcMechanicalFastener"}:
            is_fastener = True
            fastener_method = "entity_type"
        else:
            # Check name/tag/description
            fastener_keywords = ['bolt', 'nut', 'washer', 'fastener', 'screw', 'anchor', 'mechanical']
            text_content = (name + ' ' + desc + ' ' + tag).lower()
            if any(kw in text_content for kw in fastener_keywords):
                is_fastener = True
                fastener_method = "name/tag"
            else:
                # Check property sets
                try:
                    import ifcopenshell.util.element
                    psets = ifcopenshell.util.element.get_psets(entity)
                    for pset_name in psets.keys():
                        pset_lower = pset_name.lower()
                        if 'bolt' in pset_lower or 'fastener' in pset_lower or 'mechanical' in pset_lower:
                            is_fastener = True
                            fastener_method = f"property_set: {pset_name}"
                            break
                except:
                    pass
        
        # Get property sets
        psets = {}
        try:
            import ifcopenshell.util.element
            psets = ifcopenshell.util.element.get_psets(entity)
        except:
            pass
        
        # Get materials
        materials_info = []
        try:
            materials = ifcopenshell.util.element.get_materials(entity)
            for mat in materials:
                materials_info.append({
                    'name': getattr(mat, 'Name', None) or '',
                    'type': mat.is_a() if hasattr(mat, 'is_a') else 'unknown'
                })
        except:
            pass
        
        # Try to get color from IFC
        color_info = None
        try:
            import ifcopenshell.util.style
            style = ifcopenshell.util.style.get_style(entity)
            if style:
                # Try to extract color
                if hasattr(style, "Styles"):
                    for rendering in style.Styles or []:
                        if rendering.is_a('IfcSurfaceStyleRendering') and rendering.SurfaceColour:
                            color_info = {
                                'red': rendering.SurfaceColour.Red,
                                'green': rendering.SurfaceColour.Green,
                                'blue': rendering.SurfaceColour.Blue
                            }
                            break
        except:
            pass
        
        return JSONResponse({
            'entity_id': entity_id,
            'element_type': element_type,
            'name': name,
            'tag': tag,
            'description': desc,
            'is_fastener': is_fastener,
            'fastener_detection_method': fastener_method,
            'property_sets': list(psets.keys()),
            'materials': materials_info,
            'color_info': color_info
        })
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Inspection failed: {str(e)}")


@app.get("/api/assembly-mapping/{filename}")
async def get_assembly_mapping(filename: str):
    """Get assembly mapping for a specific IFC file."""
    from urllib.parse import unquote
    decoded_filename = unquote(filename)
    file_path = IFC_DIR / decoded_filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="IFC file not found")
    
    try:
        ifc_file = ifcopenshell.open(str(file_path))
        
        # Build mapping: product_id -> assembly info (mark + assembly_id)
        mapping = {}
        products = ifc_file.by_type("IfcProduct")
        
        # Statistics
        found_count = 0
        not_found_count = 0
        sample_not_found = []
        
        for product in products:
            try:
                product_id = product.id()
                assembly_mark, assembly_id = get_assembly_info(product)
                element_type = product.is_a()
                
                mapping_entry = {
                    "assembly_mark": assembly_mark,
                    "assembly_id": assembly_id,  # Store assembly instance ID
                    "element_type": element_type
                }
                
                # Add profile_name for beams, columns, members
                if element_type in {"IfcBeam", "IfcColumn", "IfcMember"}:
                    profile_name = get_profile_name(product)
                    mapping_entry["profile_name"] = profile_name
                
                # Add plate_thickness for plates
                if element_type == "IfcPlate":
                    plate_thickness = get_plate_thickness(product)
                    mapping_entry["plate_thickness"] = plate_thickness
                
                mapping[product_id] = mapping_entry
                
                if assembly_mark != "N/A":
                    found_count += 1
                else:
                    not_found_count += 1
                    # Collect a few samples for debugging
                    if len(sample_not_found) < 5:
                        try:
                            psets = ifcopenshell.util.element.get_psets(product)
                            sample_not_found.append({
                                "id": product_id,
                                "type": element_type,
                                "tag": getattr(product, 'Tag', None),
                                "name": getattr(product, 'Name', None),
                                "psets": list(psets.keys()) if psets else []
                            })
                        except:
                            pass
            except Exception as e:
                print(f"[ASSEMBLY_MAPPING] Error processing product: {e}")
                continue
        
        print(f"[ASSEMBLY_MAPPING] Found {found_count} products with assembly marks, {not_found_count} without")
        if sample_not_found:
            print(f"[ASSEMBLY_MAPPING] Sample products without assembly marks: {sample_not_found}")
        
        return JSONResponse(mapping)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get assembly mapping: {str(e)}")


@app.get("/api/nesting/{filename}")
async def generate_nesting(filename: str, stock_lengths: str, profiles: str):
    """Generate nesting optimization report for selected profiles with slope-aware cutting.
    
    Args:
        filename: IFC filename
        stock_lengths: Comma-separated list of stock lengths in mm (e.g., "6000,12000")
        profiles: Comma-separated list of profile names to nest (e.g., "IPE200,HEA300")
    """
    import sys
    import traceback
    
    # Force output to be flushed immediately
    sys.stdout.flush()
    sys.stderr.flush()
    
    nesting_log("=" * 60, flush=True)
    nesting_log("[NESTING] ===== NESTING REQUEST RECEIVED =====", flush=True)
    nesting_log(f"[NESTING] Filename: {filename}", flush=True)
    nesting_log(f"[NESTING] Stock lengths: {stock_lengths}", flush=True)
    nesting_log(f"[NESTING] Profiles: {profiles}", flush=True)
    nesting_log("=" * 60, flush=True)
    
    try:
        from urllib.parse import unquote
        decoded_filename = unquote(filename)
        file_path = IFC_DIR / decoded_filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="IFC file not found")
        nesting_log(f"[NESTING] Starting slope-aware nesting generation for {filename}")
        nesting_log(f"[NESTING] Stock lengths: {stock_lengths}")
        nesting_log(f"[NESTING] Selected profiles: {profiles}")
        
        # Parse stock lengths and sort in ascending order (shortest first)
        # This ensures we prioritize using shorter bars (6m) before longer ones (12m) to minimize waste
        stock_lengths_list = sorted([float(x.strip()) for x in stock_lengths.split(',') if x.strip()], reverse=False)
        if not stock_lengths_list:
            raise HTTPException(status_code=400, detail="At least one stock length is required")
        
        # Parse selected profiles and normalize them (remove element_type prefix if present)
        # This merges parts with same profile name regardless of type (beam/column/member)
        def extract_base_profile_name(profile_key: str) -> str:
            """Extract base profile name, removing element_type prefix if present.
            
            Examples:
            - "beam_IPE100" -> "IPE100"
            - "column_IPE100" -> "IPE100"
            - "IfcBeam_IPE100" -> "IPE100"
            - "IPE100" -> "IPE100"
            """
            if not profile_key:
                return profile_key
            
            # Check if it has a prefix like "beam_", "column_", "member_"
            for prefix in ["beam_", "column_", "member_"]:
                if profile_key.startswith(prefix):
                    return profile_key[len(prefix):]
            
            # Also check for "IfcBeam_", "IfcColumn_", "IfcMember_" prefixes
            for prefix in ["IfcBeam_", "IfcColumn_", "IfcMember_"]:
                if profile_key.startswith(prefix):
                    return profile_key[len(prefix):]
            
            return profile_key
        
        raw_selected_profiles = [x.strip() for x in profiles.split(',') if x.strip()]
        if not raw_selected_profiles:
            raise HTTPException(status_code=400, detail="At least one profile is required")
        
        # Normalize profile names and create a mapping from base name to all variants
        base_profile_names = set()
        profile_name_mapping = {}  # base_name -> list of original names
        
        for raw_profile in raw_selected_profiles:
            base_name = extract_base_profile_name(raw_profile)
            base_profile_names.add(base_name)
            if base_name not in profile_name_mapping:
                profile_name_mapping[base_name] = []
            profile_name_mapping[base_name].append(raw_profile)
        
        selected_profiles = list(base_profile_names)
        
        nesting_log(f"[NESTING] Parsed stock lengths: {stock_lengths_list}")
        nesting_log(f"[NESTING] Raw selected profiles: {raw_selected_profiles}")
        nesting_log(f"[NESTING] Normalized base profile names: {selected_profiles}")
        nesting_log(f"[NESTING] Profile name mapping: {profile_name_mapping}")
        
        # Open IFC file
        ifc_file = ifcopenshell.open(str(file_path))
        nesting_log(f"[NESTING] Opened IFC file: {decoded_filename}")
        
        # Import cut piece extractor for slope detection
        extractor = None
        try:
            nesting_log(f"[NESTING] Attempting to import CutPieceExtractor...")
            from cut_piece_extractor import CutPieceExtractor
            nesting_log(f"[NESTING] CutPieceExtractor imported successfully")
            extractor = CutPieceExtractor(ifc_file)
            nesting_log(f"[NESTING] CutPieceExtractor initialized successfully for slope-aware nesting")
        except ImportError as e:
            nesting_log(f"[NESTING] Warning: cut_piece_extractor not available (ImportError: {e}), falling back to basic nesting")
            import traceback
            traceback.print_exc()
            extractor = None
        except Exception as e:
            nesting_log(f"[NESTING] Warning: Could not initialize CutPieceExtractor: {e}, falling back to basic nesting")
            import traceback
            traceback.print_exc()
            extractor = None
        
        # Extract parts for selected profiles with slope information
        parts_by_profile: Dict[str, List[Dict[str, Any]]] = {}
        
        for element in ifc_file.by_type("IfcProduct"):
            element_type = element.is_a()
            
            # Only process steel elements (beams, columns, members)
            if element_type not in {"IfcBeam", "IfcColumn", "IfcMember"}:
                continue
            
            # Get profile name from element (this should return base name like "IPE100")
            profile_name_from_element = get_profile_name(element)
            
            # Extract base profile name (for nesting, we merge all types with same profile name)
            # This handles cases where profile_name might have a prefix or not
            base_profile_name = extract_base_profile_name(profile_name_from_element)
            
            # Debug logging for first few elements
            if len(parts_by_profile) < 3 or base_profile_name in selected_profiles:
                nesting_log(f"[NESTING] Element {element.id()}: type={element_type}, profile_from_element={profile_name_from_element}, base_profile={base_profile_name}, in_selected={base_profile_name in selected_profiles}")
            
            # Skip if base profile name is not in selected profiles
            if base_profile_name not in selected_profiles:
                continue
            
            # Try to extract cut piece with slope information
            cut_piece = None
            length_mm = 0.0
            start_angle = None
            end_angle = None
            start_has_slope = False
            end_has_slope = False
            
            if extractor:
                try:
                    nesting_log(f"[NESTING] Attempting to extract cut piece for element {element.id()}")
                    cut_piece = extractor.extract_cut_piece(element)
                    if cut_piece:
                        nesting_log(f"[NESTING] Successfully extracted cut piece for element {element.id()}")
                        length_mm = cut_piece.length
                        nesting_log(f"[NESTING]   Length: {length_mm:.1f}mm")
                        
                        if cut_piece.end_cuts["start"]:
                            start_angle = cut_piece.end_cuts["start"].angle_deg
                            start_confidence = cut_piece.end_cuts["start"].confidence
                            
                            # Generic convention detection (same as frontend):
                            # If angle is between 60-120°, treat as ABS convention (90° = straight)
                            # Otherwise treat as DEV convention (0° = straight)
                            abs_angle = abs(start_angle)
                            if 60 <= abs_angle <= 120:
                                # ABSOLUTE convention: 90° = straight
                                deviation_from_straight = abs(start_angle - 90.0)
                            else:
                                # DEVIATION convention: 0° = straight
                                deviation_from_straight = abs_angle
                            
                            # Only consider it a slope if:
                            # 1. Deviation from straight is significant (> 5°)
                            # 2. Confidence is high enough (> 0.5) to trust the measurement
                            start_has_slope = deviation_from_straight > 5.0 and start_confidence > 0.5
                            nesting_log(f"[NESTING]   Start cut: {start_angle:.2f}° (deviation from straight: {deviation_from_straight:.2f}°, has_slope={start_has_slope}, confidence={start_confidence:.2f})")
                        else:
                            nesting_log(f"[NESTING]   Start cut: None")
                        
                        if cut_piece.end_cuts["end"]:
                            end_angle = cut_piece.end_cuts["end"].angle_deg
                            end_confidence = cut_piece.end_cuts["end"].confidence
                            
                            # Generic convention detection (same as frontend):
                            # If angle is between 60-120°, treat as ABS convention (90° = straight)
                            # Otherwise treat as DEV convention (0° = straight)
                            abs_angle = abs(end_angle)
                            if 60 <= abs_angle <= 120:
                                # ABSOLUTE convention: 90° = straight
                                deviation_from_straight = abs(end_angle - 90.0)
                            else:
                                # DEVIATION convention: 0° = straight
                                deviation_from_straight = abs_angle
                            
                            # Only consider it a slope if:
                            # 1. Deviation from straight is significant (> 5°)
                            # 2. Confidence is high enough (> 0.5) to trust the measurement
                            end_has_slope = deviation_from_straight > 5.0 and end_confidence > 0.5
                            nesting_log(f"[NESTING]   End cut: {end_angle:.2f}° (deviation from straight: {deviation_from_straight:.2f}°, has_slope={end_has_slope}, confidence={end_confidence:.2f})")
                        else:
                            nesting_log(f"[NESTING]   End cut: None")
                    else:
                        nesting_log(f"[NESTING] Cut piece extraction returned None for element {element.id()}")
                except Exception as e:
                    nesting_log(f"[NESTING] Error extracting cut piece for element {element.id()}: {e}")
                    import traceback
                    traceback.print_exc()
            else:
                nesting_log(f"[NESTING] No extractor available for element {element.id()}")
            
            # Fallback: get length from geometry or properties if cut_piece extraction failed
            if length_mm == 0:
                try:
                    # First, try to get length from property sets
                    psets = ifcopenshell.util.element.get_psets(element)
                    for pset_name, props in psets.items():
                        for key in ["Length", "length", "L", "l", "NominalLength", "LengthValue"]:
                            if key in props:
                                length_val = props[key]
                                if isinstance(length_val, (int, float)):
                                    # Check if it's already in mm (if > 100, assume mm, else assume m)
                                    if length_val > 100:
                                        length_mm = float(length_val)
                                    else:
                                        length_mm = float(length_val) * 1000.0  # Convert m to mm
                                    break
                        if length_mm > 0:
                            break
                    
                    # If still no length, try to calculate from geometry
                    if length_mm == 0 and HAS_GEOM:
                        try:
                            try:
                                import numpy as np
                                has_numpy = True
                            except ImportError:
                                has_numpy = False
                                nesting_log(f"[NESTING] NumPy not available, skipping geometry-based length calculation")
                            
                            if has_numpy:
                                settings = ifcopenshell.geom.settings()
                                settings.set(settings.USE_WORLD_COORDS, True)
                                shape = ifcopenshell.geom.create_shape(settings, element)
                                if shape and shape.geometry:
                                    # Get bounding box to calculate length
                                    verts = shape.geometry.verts
                                    if len(verts) >= 3:
                                        vertices = np.array(verts).reshape(-1, 3)
                                        # Calculate length as max dimension (usually the longest axis)
                                        bbox_min = vertices.min(axis=0)
                                        bbox_max = vertices.max(axis=0)
                                        dimensions = bbox_max - bbox_min
                                        # For linear elements, the length is typically the largest dimension
                                        length_mm = float(np.max(dimensions)) * 1000.0  # Convert to mm
                        except Exception as geom_error:
                            nesting_log(f"[NESTING] Geometry extraction failed for element {element.id()}: {geom_error}")
                    
                    # If still no length, use a default estimate based on weight
                    if length_mm == 0:
                        weight = get_element_weight(element)
                        # Rough estimate: assume 50-100 kg/m for steel profiles (conservative)
                        if weight > 0:
                            # Use 75 kg/m as average for steel profiles
                            length_mm = (weight / 75.0) * 1000.0  # Rough estimate in mm
                        else:
                            length_mm = 1000.0  # Default 1m
                    
                except Exception as e:
                    nesting_log(f"[NESTING] Error getting length for element {element.id()}: {e}")
                    length_mm = 1000.0  # Default fallback
            
            # Get assembly mark
            assembly_mark = get_assembly_mark(element)
            
            # Get element name/tag
            element_name = None
            if hasattr(element, 'Tag') and element.Tag:
                element_name = str(element.Tag)
            elif hasattr(element, 'Name') and element.Name:
                element_name = str(element.Name)
            
            # Get Reference from property sets (this is what shows in the right-click panel)
            reference = None
            try:
                psets = ifcopenshell.util.element.get_psets(element)
                # Search through all property sets for "Reference" (case-insensitive)
                for pset_name, props in psets.items():
                    props_dict = dict(props)
                    # Try exact match first
                    if 'Reference' in props_dict:
                        ref_value = props_dict['Reference']
                        if ref_value and str(ref_value).strip() and str(ref_value).upper() not in ['NONE', 'NULL', 'N/A', '']:
                            reference = str(ref_value).strip()
                            break
                    # Try case-insensitive match
                    for key, value in props_dict.items():
                        if key.lower() == 'reference':
                            if value and str(value).strip() and str(value).upper() not in ['NONE', 'NULL', 'N/A', '']:
                                reference = str(value).strip()
                                break
                    if reference:
                        break
            except Exception as e:
                nesting_log(f"[NESTING] Error getting Reference from property sets for element {element.id()}: {e}")
                pass
            
            # Store part with slope information
            # Use base_profile_name for grouping (merges beam/column/member with same profile)
            if base_profile_name not in parts_by_profile:
                parts_by_profile[base_profile_name] = []
                nesting_log(f"[NESTING] Created new profile group: {base_profile_name}")
            
            part_data = {
                "product_id": element.id(),
                "profile_name": base_profile_name,  # Use base name for nesting grouping
                "original_profile_name": profile_name_from_element,  # Keep original from element for reference
                "element_type": element_type,
                "length": length_mm,
                "assembly_mark": assembly_mark if assembly_mark != "N/A" else None,
                "element_name": element_name,
                "reference": reference,
                "start_angle": float(start_angle) if start_angle is not None else None,
                "end_angle": float(end_angle) if end_angle is not None else None,
                "start_has_slope": bool(start_has_slope),
                "end_has_slope": bool(end_has_slope)
                # Note: cut_piece.to_dict() removed to avoid JSON serialization issues with numpy arrays
            }
            
            parts_by_profile[base_profile_name].append(part_data)
        
        # Log parts found and show merging summary
        nesting_log(f"[NESTING] Found parts by profile (after merging by base profile name):")
        for prof_name, prof_parts in parts_by_profile.items():
            # Count element types in this merged group
            element_types = {}
            for part in prof_parts:
                elem_type = part.get("element_type", "Unknown")
                element_types[elem_type] = element_types.get(elem_type, 0) + 1
            
            type_summary = ", ".join([f"{k}: {v}" for k, v in element_types.items()])
            nesting_log(f"[NESTING]   {prof_name}: {len(prof_parts)} parts total (merged from: {type_summary})")
        
        # Check if we found any parts
        if not parts_by_profile:
            raise HTTPException(
                status_code=400, 
                detail=f"No parts found for selected profiles: {selected_profiles}. Make sure the profiles exist in the IFC file."
            )
        
        # Generate nesting for each profile
        profile_nestings = []
        total_stock_bars = 0
        total_waste = 0.0
        total_parts = 0
        
        for profile_name, parts in parts_by_profile.items():
            if not parts:
                nesting_log(f"[NESTING] Warning: No parts found for profile {profile_name}")
                continue
            
            nesting_log(f"[NESTING] Processing {len(parts)} parts for profile {profile_name}")
            
            # Separate parts by slope characteristics
            parts_with_slopes = [p for p in parts if p.get("start_has_slope") or p.get("end_has_slope")]
            parts_without_slopes = [p for p in parts if not p.get("start_has_slope") and not p.get("end_has_slope")]
            
            nesting_log(f"[NESTING]   Parts with slopes: {len(parts_with_slopes)}")
            nesting_log(f"[NESTING]   Parts without slopes: {len(parts_without_slopes)}")
            
            # Debug: Log slope information for each part (especially for IPE600)
            if profile_name == "IPE600":
                nesting_log(f"[NESTING]   IPE600 parts details:")
                for p in parts:
                    nesting_log(f"[NESTING]     Part {p.get('product_id')}: length={p.get('length'):.1f}mm, "
                          f"start_slope={p.get('start_has_slope')} ({p.get('start_angle')}°), "
                          f"end_slope={p.get('end_has_slope')} ({p.get('end_angle')}°)")
            
            # Bin packing algorithm with slope-aware pairing
            cutting_patterns = []
            stock_lengths_used: Dict[float, int] = {}
            rejected_parts = []  # Track parts that cannot be nested (exceed stock length)
            
            remaining_parts = parts.copy()
            max_iterations = len(parts) * 10  # Safety limit
            iteration_count = 0
            
            while remaining_parts and iteration_count < max_iterations:
                iteration_count += 1
                nesting_log(f"[NESTING] === WHILE LOOP ITERATION {iteration_count} - {len(remaining_parts)} parts remaining ===")
                
                # Find best stock length for remaining parts
                # Strategy: Use 6M bars only if all remaining parts that fit in 6M can be packed into 6M
                # Otherwise, use 12M bars to minimize waste
                best_stock = None
                
                # Find the largest remaining part
                largest_part_length = max(p["length"] for p in remaining_parts)
                
                # Get the shortest and longest stock lengths
                shortest_stock = min(stock_lengths_list)
                longest_stock = max(stock_lengths_list)
                
                # First, check if any parts exceed the longest stock - these cannot be nested
                if largest_part_length > longest_stock:
                    # Parts exceed longest stock - cannot nest these parts
                    oversized_parts = [p for p in remaining_parts if p["length"] > longest_stock]
                    nesting_log(f"[NESTING] ERROR: {len(oversized_parts)} parts exceed longest stock ({longest_stock:.0f}mm):")
                    for p in oversized_parts:
                        product_id = p.get('product_id')
                        part_id = product_id or p.get('reference') or p.get('element_name') or 'unknown'
                        # Get reference and element_name, handling None and empty strings
                        reference = p.get('reference')
                        if reference and isinstance(reference, str) and not reference.strip():
                            reference = None
                        element_name = p.get('element_name')
                        if element_name and isinstance(element_name, str) and not element_name.strip():
                            element_name = None
                        nesting_log(f"[NESTING]   - Part {part_id}: {p['length']:.1f}mm > {longest_stock:.0f}mm, reference={reference}, element_name={element_name}")
                        # Add to rejected parts list
                        rejected_parts.append({
                            "product_id": product_id,
                            "part_id": part_id,
                            "reference": reference,
                            "element_name": element_name,
                            "length": p['length'],
                            "stock_length": longest_stock,
                            "reason": f"Part length ({p['length']:.1f}mm) exceeds longest available stock ({longest_stock:.0f}mm)"
                        })
                    # Remove oversized parts from remaining_parts to prevent infinite loop
                    for p in oversized_parts:
                        if p in remaining_parts:
                            remaining_parts.remove(p)
                    # If all parts were oversized, break
                    if not remaining_parts:
                        nesting_log(f"[NESTING] All parts exceed stock length. Cannot nest.")
                        break
                    # Recalculate largest part length after removing oversized parts
                    if remaining_parts:
                        largest_part_length = max(p["length"] for p in remaining_parts)
                
                # Find the best stock for remaining parts
                # STRATEGY: Choose the stock length that minimizes waste
                # CRITICAL: Check if parts fit TOGETHER in one bar, not just individually
                nesting_log(f"[NESTING] === ENTERING NEW STOCK SELECTION LOGIC (Iteration {iteration_count}) ===")
                best_stock = None
                total_length_all_remaining = sum(p["length"] for p in remaining_parts)
                
                # Estimate potential kerf needed between parts
                # Some boundaries might need kerf (3mm) if parts can't share boundaries
                # Use worst-case estimate: assume all boundaries need kerf (3mm per gap)
                # This ensures we don't claim parts fit when they actually don't
                num_parts = len(remaining_parts)
                # Worst case: if we have N parts, we need (N-1) kerf gaps of 3mm each
                # Use maximum kerf to be conservative and prevent overfitting
                estimated_kerf = max(0, (num_parts - 1) * 3.0) if num_parts > 1 else 0.0
                total_length_with_kerf = total_length_all_remaining + estimated_kerf
                
                # Get stock lengths (assuming 6m and 12m are available)
                shortest_stock = min(stock_lengths_list)
                longest_stock = max(stock_lengths_list)
                
                # CRITICAL: Check if all parts fit TOGETHER in one bar (not just individually)
                # Account for potential kerf when checking if parts fit
                # Check if total length (with kerf estimate) fits in longest stock (12m)
                all_fit_together_in_longest = total_length_with_kerf <= longest_stock
                
                # Check if total length (with kerf estimate) fits in shortest stock (6m)
                all_fit_together_in_shortest = total_length_with_kerf <= shortest_stock
                
                # Also check if individual parts fit (for validation)
                parts_fitting_longest = [p for p in remaining_parts if p["length"] <= longest_stock]
                all_parts_individually_fit_longest = len(parts_fitting_longest) == len(remaining_parts)
                
                parts_fitting_shortest = [p for p in remaining_parts if p["length"] <= shortest_stock]
                all_parts_individually_fit_shortest = len(parts_fitting_shortest) == len(remaining_parts)
                
                # DEBUG: Log the decision process
                nesting_log(f"[NESTING] === STOCK SELECTION DEBUG ===")
                part_details = []
                for p in remaining_parts:
                    part_id = p.get("product_id") or "unknown"
                    part_details.append(f"{part_id}({p['length']:.0f}mm)")
                nesting_log(f"[NESTING] Remaining parts ({len(remaining_parts)}): {', '.join(part_details)}")
                nesting_log(f"[NESTING] Total length: {total_length_all_remaining:.1f}mm")
                nesting_log(f"[NESTING] Estimated kerf: {estimated_kerf:.1f}mm (for {num_parts} parts)")
                nesting_log(f"[NESTING] Total length with kerf estimate: {total_length_with_kerf:.1f}mm")
                nesting_log(f"[NESTING] Shortest stock: {shortest_stock:.0f}mm, Longest stock: {longest_stock:.0f}mm")
                nesting_log(f"[NESTING] All fit together in {longest_stock:.0f}mm: {all_fit_together_in_longest} ({total_length_with_kerf:.1f}mm <= {longest_stock:.0f}mm)")
                nesting_log(f"[NESTING] All fit together in {shortest_stock:.0f}mm: {all_fit_together_in_shortest} ({total_length_with_kerf:.1f}mm <= {shortest_stock:.0f}mm)")
                nesting_log(f"[NESTING] All parts individually fit in {longest_stock:.0f}mm: {all_parts_individually_fit_longest}")
                nesting_log(f"[NESTING] All parts individually fit in {shortest_stock:.0f}mm: {all_parts_individually_fit_shortest}")
                
                # NEW: Evaluate all stock lengths where ALL remaining parts fit together
                # STRATEGY: Prefer longer stocks first (12m before 6m)
                # Only use shorter stocks when leftover parts are <= shorter stock length
                # CRITICAL: Account for kerf when checking if parts fit together
                candidate_stocks = []
                for stock_len in sorted(stock_lengths_list, reverse=True):  # Check longer stocks first
                    # Check if parts fit together accounting for kerf estimate
                    all_fit_together_in_stock = total_length_with_kerf <= stock_len
                    all_parts_individually_fit_stock = all(
                        p["length"] <= stock_len for p in remaining_parts
                    )
                    if all_fit_together_in_stock and all_parts_individually_fit_stock:
                        # Use total_length_all_remaining for waste calculation (kerf is part of the fit check, not waste)
                        waste = stock_len - total_length_all_remaining
                        waste_pct = (waste / stock_len * 100) if stock_len > 0 else 0
                        candidate_stocks.append((stock_len, waste, waste_pct))

                if candidate_stocks:
                    # NEW STRATEGY: Prefer longer stocks first (12m before 6m)
                    # Sort by stock length descending (longer first), then by waste ascending
                    # This ensures we fill longer bars first, only using shorter bars for leftovers
                    candidate_stocks.sort(key=lambda x: (-x[0], x[1]))  # Negative for descending stock length
                    best_stock, best_waste, best_waste_pct = candidate_stocks[0]
                    
                    # Check if we should use a shorter stock instead
                    # Only use shorter stock if ALL remaining parts fit in shorter stock
                    if len(candidate_stocks) > 1:
                        longer_stock = candidate_stocks[0][0]  # Already sorted descending (longest first)
                        shorter_stock = candidate_stocks[-1][0]  # Shortest candidate
                        
                        # If ALL remaining parts fit in shorter stock (accounting for kerf), use shorter stock to minimize waste
                        if total_length_with_kerf <= shorter_stock:
                            # All parts fit in shorter stock - use it to minimize waste
                            best_stock = shorter_stock
                            best_waste = shorter_stock - total_length_all_remaining
                            best_waste_pct = (best_waste / shorter_stock * 100) if shorter_stock > 0 else 0
                            print(
                                f"[NESTING] DECISION: Using {best_stock:.0f}mm stock (shorter preferred for leftovers): "
                                f"all {len(remaining_parts)} parts fit in shorter stock "
                                f"(total: {total_length_all_remaining:.1f}mm, "
                                f"waste: {best_waste:.1f}mm, {best_waste_pct:.1f}%)"
                            )
                        else:
                            # Not all parts fit in shorter stock - use longer stock and fill it
                            best_stock = longer_stock
                            print(
                                f"[NESTING] DECISION: Using {best_stock:.0f}mm stock (longer preferred): "
                                f"all {len(remaining_parts)} parts fit together "
                                f"(total: {total_length_all_remaining:.1f}mm, "
                                f"waste: {best_waste:.1f}mm, {best_waste_pct:.1f}%)"
                            )
                    else:
                        # Only one candidate stock
                        print(
                            f"[NESTING] DECISION: Using {best_stock:.0f}mm stock: "
                            f"all {len(remaining_parts)} parts fit together "
                            f"(total: {total_length_all_remaining:.1f}mm, "
                            f"waste: {best_waste:.1f}mm, {best_waste_pct:.1f}%)"
                        )
                
                # If no stock fits all parts together in one bar, choose the best stock for the largest part by minimum waste
                if best_stock is None:
                    nesting_log(f"[NESTING] WARNING: No stock selected yet - parts don't all fit together in one bar")
                    nesting_log(f"[NESTING]   - all_fit_together_in_longest: {all_fit_together_in_longest}")
                    nesting_log(f"[NESTING]   - all_parts_individually_fit_longest: {all_parts_individually_fit_longest}")
                    nesting_log(f"[NESTING]   - all_fit_together_in_shortest: {all_fit_together_in_shortest}")
                    nesting_log(f"[NESTING]   - all_parts_individually_fit_shortest: {all_parts_individually_fit_shortest}")
                    
                    candidate_for_largest = []
                    for stock_len in sorted(stock_lengths_list, reverse=True):  # Check longer stocks first
                        if largest_part_length <= stock_len:
                            waste_for_largest = stock_len - largest_part_length
                            waste_pct_for_largest = (waste_for_largest / stock_len * 100) if stock_len > 0 else 0
                            candidate_for_largest.append((stock_len, waste_for_largest, waste_pct_for_largest))
                    
                    if candidate_for_largest:
                        # Sort by stock length descending (longer first), then by waste ascending
                        # This prefers longer stocks first, only using shorter stocks when needed
                        candidate_for_largest.sort(key=lambda x: (-x[0], x[1]))  # Negative for descending stock length
                        best_stock, best_waste_largest, best_waste_pct_largest = candidate_for_largest[0]
                        print(
                            f"[NESTING] FALLBACK: Using {best_stock:.0f}mm stock for largest part "
                            f"({largest_part_length:.1f}mm, waste: {best_waste_largest:.1f}mm, "
                            f"{best_waste_pct_largest:.1f}%) - longer stock preferred"
                        )
                    else:
                        print(
                            f"[NESTING] ERROR: No stock length fits the largest part ({largest_part_length:.1f}mm). "
                            f"Available stocks: {stock_lengths_list}"
                        )
                        # Skip this iteration - parts will remain in remaining_parts
                        break
                
                # Final safety check
                if best_stock is None:
                    nesting_log(f"[NESTING] ERROR: No stock length fits the largest part ({largest_part_length:.1f}mm). Available stocks: {stock_lengths_list}")
                    # Skip this iteration - parts will remain in remaining_parts
                    break
                
                # CRITICAL: Filter out parts that exceed best_stock BEFORE pairing
                # This prevents oversized parts from being nested
                valid_parts_for_this_stock = [p for p in remaining_parts if p["length"] <= best_stock]
                if not valid_parts_for_this_stock:
                    nesting_log(f"[NESTING] No parts fit in selected stock {best_stock:.0f}mm. Skipping this iteration.")
                    break
                
                # Sort valid parts by length descending so longest pieces are placed first
                valid_parts_for_this_stock.sort(key=lambda p: p["length"], reverse=True)
                
                # Create a pattern for this stock bar
                pattern_parts = []
                current_length = 0.0  # Tracks actual material used (accounts for shared cuts)
                total_parts_length = 0.0  # Tracks sum of individual part lengths (for waste calculation)
                cut_position = 0.0
                parts_to_remove = []
                tolerance_mm = 0.1  # Minimal tolerance for floating point errors only - define early for use in loops
                pending_complementary_pair = None  # Track a complementary pair that needs to be paired in this pattern
                stock_to_use = best_stock  # Initialize stock_to_use to best_stock (will be overridden for complementary pairs if needed)
                
                # Strategy: Try to pair parts with complementary slopes first
                # When pairing, check ALL available stock lengths to find the best fit
                # Then fill remaining space with other parts
                
                # Step 1: Try to find complementary slope pairs (only from valid parts)
                # For IPE600 and other large profiles, prioritize finding complementary pairs first
                # First, find all complementary pairs and check which stock length they fit in
                complementary_pairs = []
                # Only consider valid parts that fit in best_stock
                if len(valid_parts_for_this_stock) >= 2:
                    for i, part1 in enumerate(valid_parts_for_this_stock):
                        # CRITICAL CHECK: Ensure current_length hasn't already exceeded best_stock
                        # This prevents trying to add more pairs when current_length is already too high
                        if current_length > best_stock + tolerance_mm:
                            nesting_log(f"[NESTING] BREAK OUTER LOOP: current_length {current_length:.1f}mm already exceeds stock {best_stock:.0f}mm - stopping complementary pair search")
                            break  # Break out of outer loop to prevent adding more pairs
                        
                        if part1 in parts_to_remove:
                            continue
                        
                        # Check if part1 has a slope
                        part1_start_slope = part1.get("start_has_slope", False)
                        part1_end_slope = part1.get("end_has_slope", False)
                        part1_start_angle = part1.get("start_angle")
                        part1_end_angle = part1.get("end_angle")
                        
                        if not (part1_start_slope or part1_end_slope):
                            continue  # Skip parts without slopes for pairing
                        
                        # Try to find a complementary part (only from valid parts)
                        for j, part2 in enumerate(valid_parts_for_this_stock[i+1:], start=i+1):
                            if part2 in parts_to_remove:
                                continue
                            
                            # Check if part2 has a complementary slope
                            part2_start_slope = part2.get("start_has_slope", False)
                            part2_end_slope = part2.get("end_has_slope", False)
                            part2_start_angle = part2.get("start_angle")
                            part2_end_angle = part2.get("end_angle")
                            
                            # Check for complementary slopes
                            # Complementary means: one part's start slope matches another's end slope (or vice versa)
                            # with opposite angles (e.g., 45° and -45°, or 30° and -30°)
                            # When cutting from the same stock bar, complementary slopes can be paired to minimize waste
                            is_complementary = False
                            pairing_type = None
                            
                            # Case 1: part1 start slope with part2 end slope
                            if part1_start_slope and part2_end_slope and part1_start_angle is not None and part2_end_angle is not None:
                                # For complementary cuts, angles should be opposite (e.g., 45° and -45°)
                                # Or we can use same angle if cutting from opposite ends
                                angle1_abs = abs(part1_start_angle)
                                angle2_abs = abs(part2_end_angle)
                                angle_diff = abs(angle1_abs - angle2_abs)
                                
                                # Check if angles are similar (within 5 degrees) - they can be paired
                                # The actual complementarity depends on how they're oriented in the stock bar
                                if angle_diff < 5.0 and angle1_abs > 1.0:  # Both have significant slopes
                                    is_complementary = True
                                    pairing_type = "start_end"
                            
                            # Case 2: part1 end slope with part2 start slope
                            if not is_complementary and part1_end_slope and part2_start_slope and part1_end_angle is not None and part2_start_angle is not None:
                                angle1_abs = abs(part1_end_angle)
                                angle2_abs = abs(part2_start_angle)
                                angle_diff = abs(angle1_abs - angle2_abs)
                                
                                if angle_diff < 5.0 and angle1_abs > 1.0:  # Both have significant slopes
                                    is_complementary = True
                                    pairing_type = "end_start"
                            
                            # Case 2b: part1 end slope with part2 end slope (if angles are similar, can be paired by reversing one)
                            # This handles cases where both parts have end cuts that can be complementary
                            if not is_complementary and part1_end_slope and part2_end_slope and part1_end_angle is not None and part2_end_angle is not None:
                                angle1_abs = abs(part1_end_angle)
                                angle2_abs = abs(part2_end_angle)
                                angle_diff = abs(angle1_abs - angle2_abs)
                                
                                # If both have similar end cut angles, they can be paired
                                # One part's end cut becomes the start cut for the pair
                                if angle_diff < 5.0 and angle1_abs > 1.0:  # Both have significant slopes
                                    is_complementary = True
                                    pairing_type = "end_end"
                            
                            # Case 3: Both parts have slopes on both ends - check all combinations
                            if not is_complementary:
                                # Try part1 start with part2 start (if angles are opposite)
                                if part1_start_slope and part2_start_slope and part1_start_angle is not None and part2_start_angle is not None:
                                    angle1_abs = abs(part1_start_angle)
                                    angle2_abs = abs(part2_start_angle)
                                    angle_diff = abs(angle1_abs - angle2_abs)
                                    # Check if angles are opposite (one positive, one negative, similar magnitude)
                                    if angle_diff < 5.0 and angle1_abs > 1.0:
                                        # Check if they have opposite signs (complementary)
                                        if (part1_start_angle > 0 and part2_start_angle < 0) or (part1_start_angle < 0 and part2_start_angle > 0):
                                            is_complementary = True
                                            pairing_type = "start_start"
                                
                                # Try part1 end with part2 end (if angles are similar, can be paired)
                                # When both parts have end cuts with similar angles, one can be reversed
                                # to create a complementary pair (end of part1 becomes start of part2)
                                if not is_complementary and part1_end_slope and part2_end_slope and part1_end_angle is not None and part2_end_angle is not None:
                                    angle1_abs = abs(part1_end_angle)
                                    angle2_abs = abs(part2_end_angle)
                                    angle_diff = abs(angle1_abs - angle2_abs)
                                    # If angles are similar (within 5°), they can be paired
                                    # One part's end cut can serve as the other's start cut
                                    if angle_diff < 5.0 and angle1_abs > 1.0:
                                        is_complementary = True
                                        pairing_type = "end_end"
                            
                            # If complementary, try to pair them
                            if is_complementary:
                                # For complementary slopes, calculate the actual length needed
                                # The sloped cuts share the same cut area, so total length is less than sum
                                length1 = part1["length"]
                                length2 = part2["length"]
                                
                                # Get the angle for the complementary cut
                                # The angle depends on the pairing type:
                                # - end_start: use part1_end_angle and part2_start_angle
                                # - start_end: use part1_start_angle and part2_end_angle
                                # - end_end: use part1_end_angle and part2_end_angle
                                # - start_start: use part1_start_angle and part2_start_angle
                                if pairing_type == "end_start":
                                    angle1_val = part1_end_angle
                                    angle2_val = part2_start_angle
                                elif pairing_type == "start_end":
                                    angle1_val = part1_start_angle
                                    angle2_val = part2_end_angle
                                elif pairing_type == "end_end":
                                    angle1_val = part1_end_angle
                                    angle2_val = part2_end_angle
                                elif pairing_type == "start_start":
                                    angle1_val = part1_start_angle
                                    angle2_val = part2_start_angle
                                else:
                                    # Fallback: use any available angle
                                    angle1_val = part1_start_angle if part1_start_angle is not None else part1_end_angle
                                    angle2_val = part2_start_angle if part2_start_angle is not None else part2_end_angle
                                
                                # Use the angle that's actually being paired (should be the same for complementary cuts)
                                angle_for_calculation = angle1_val if angle1_val is not None else angle2_val
                                
                                # For complementary slopes, estimate the overlap
                                # The overlap depends on the angle and profile depth
                                # For IPE profiles, approximate depth is typically 200-600mm
                                # For a 41.72° cut, the overlap is approximately: depth / tan(angle)
                                # But since we're cutting from the same stock, the actual length needed
                                # is approximately: length1 + length2 - (cut_depth / sin(angle))
                                
                                # Estimate profile depth from profile name - generic for all profile types
                                # Use CutPieceExtractor's method for generic profile depth estimation
                                # This handles all profile types: IPE, HEA, RHS, SHS, CHS, Pipes (Ø), etc.
                                profile_name = part1.get("profile_name", "UNKNOWN")
                                if extractor:
                                    estimated_profile_depth = extractor._get_estimated_profile_depth(profile_name)
                                else:
                                    # Fallback: use simple regex-based detection if extractor is not available
                                    estimated_profile_depth = 400.0  # Default
                                    profile_name_upper = profile_name.upper()
                                    import re
                                    # Try to extract depth/diameter from common patterns
                                    if "IPE" in profile_name_upper:
                                        match = re.search(r'IPE\s*(\d+)', profile_name_upper)
                                        if match:
                                            estimated_profile_depth = float(match.group(1))
                                    elif "HEA" in profile_name_upper or "HEB" in profile_name_upper or "HEM" in profile_name_upper:
                                        match = re.search(r'HE[ABM]\s*(\d+)', profile_name_upper)
                                        if match:
                                            estimated_profile_depth = float(match.group(1))
                                    elif "RHS" in profile_name_upper or "SHS" in profile_name_upper:
                                        match = re.findall(r'(\d+\.?\d*)', profile_name_upper)
                                        if match:
                                            estimated_profile_depth = max([float(d) for d in match])
                                    elif "Ø" in profile_name or "DIAMETER" in profile_name_upper or "CHS" in profile_name_upper:
                                        # Try to extract diameter from circular profiles like Ø219.1*3
                                        # First try with Ø symbol
                                        match = re.search(r'Ø\s*(\d+\.?\d*)', profile_name)
                                        if not match:
                                            # Try DIAMETER keyword
                                            match = re.search(r'DIAMETER\s*(\d+\.?\d*)', profile_name_upper)
                                        if not match:
                                            # Try CHS format
                                            match = re.search(r'CHS\s*(\d+\.?\d*)', profile_name_upper)
                                        if not match:
                                            # Fallback: extract first number (should be diameter)
                                            match = re.search(r'(\d+\.?\d*)', profile_name)
                                        if match:
                                            estimated_profile_depth = float(match.group(1))
                                
                                # GENERIC CALCULATION: Works for ALL profile types (IPE, HEA, RHS, SHS, CHS, Pipes, etc.)
                                # For complementary slopes, calculate the shared material length
                                # This is a simple geometric calculation that works universally
                                
                                nesting_log(f"[NESTING] Profile detection: name='{profile_name}', depth={estimated_profile_depth:.1f}mm")
                                
                                # Initialize shared_linear_slopes_length
                                shared_linear_slopes_length = 0.0
                                
                                if angle_for_calculation is not None and abs(angle_for_calculation) > 1.0:
                                    import math
                                    angle_rad = abs(angle_for_calculation) * (math.pi / 180.0)
                                    
                                    # CORRECTED FORMULA: For complementary cuts, the shared material is the linear overlap
                                    # along the cutting axis (the green X in the user's diagram)
                                    # Generic formula for ALL profile types: shared_length = depth * tan(angle)
                                    # This gives the linear projection along the cutting axis for the shared material
                                    
                                    if angle_rad > 0.01:
                                        # Use depth * tan(angle) for all profile types (IPE, HEA, RHS, SHS, circular, etc.)
                                        shared_linear_slopes_length = estimated_profile_depth * math.tan(angle_rad)
                                        
                                        # Safety check: shared length cannot exceed the smaller part length
                                        max_shared = min(length1, length2) * 0.9  # Max 90% of smaller part
                                        if shared_linear_slopes_length > max_shared:
                                            shared_linear_slopes_length = max_shared
                                            nesting_log(f"[NESTING] Capped shared length to {shared_linear_slopes_length:.1f}mm (90% of smaller part)")
                                    else:
                                        shared_linear_slopes_length = 0.0
                                    
                                    # Calculate combined length using actual geometric shared length
                                    # IMPORTANT: Do NOT adjust shared length to fit stock - use only geometric calculation
                                    combined_length = length1 + length2 - shared_linear_slopes_length
                                    
                                    if combined_length < 0:
                                        # Safety: if shared length is larger than sum, cap it
                                        max_shared = min(length1, length2) * 0.5
                                        if shared_linear_slopes_length > max_shared:
                                            nesting_log(f"[NESTING] Warning: Shared length ({shared_linear_slopes_length:.1f}mm) too large, capping to {max_shared:.1f}mm")
                                            shared_linear_slopes_length = max_shared
                                            combined_length = length1 + length2 - shared_linear_slopes_length
                                    
                                    nesting_log(f"[NESTING] Complementary slopes: angle={angle_for_calculation:.1f}°, depth={estimated_profile_depth:.1f}mm")
                                    nesting_log(f"[NESTING]   Part 1: {length1:.1f}mm, Part 2: {length2:.1f}mm")
                                    nesting_log(f"[NESTING]   Shared: {shared_linear_slopes_length:.1f}mm (depth * tan(angle) = {estimated_profile_depth:.1f} * tan({angle_for_calculation:.1f}°))")
                                    nesting_log(f"[NESTING]   Combined: {length1:.1f} + {length2:.1f} - {shared_linear_slopes_length:.1f} = {combined_length:.1f}mm")
                                else:
                                    # Fallback: use linear sum if angle is not available
                                    combined_length = length1 + length2
                                    # shared_linear_slopes_length is already 0.0 from initialization
                                
                                angle1_str = f"{angle1_val:.1f}°" if angle1_val is not None else "N/A"
                                angle2_str = f"{angle2_val:.1f}°" if angle2_val is not None else "N/A"
                                
                                # Check ALL available stock lengths to see if this pair fits
                                # Use minimal tolerance only for floating point rounding errors
                                # CRITICAL: Parts must fit within stock length - no tolerance for exceeding stock
                                best_stock_for_pair = None
                                
                                # FIXED: Find the LONGEST stock that fits to minimize number of bars
                                # Prefer longer stock (12M) when pair fits, to minimize number of bars
                                # Use minimal tolerance (0.1mm) only for floating point rounding errors
                                tolerance_mm = 0.1  # Minimal tolerance for floating point errors only
                                
                                for stock_len in sorted(stock_lengths_list, reverse=True):  # Check longer stocks first (12M before 6M)
                                    if combined_length <= stock_len + tolerance_mm:
                                        # Additional strict check: combined_length must not exceed stock_len
                                        if combined_length > stock_len:
                                            nesting_log(f"[NESTING] REJECTING pair: combined_length {combined_length:.1f}mm exceeds stock {stock_len:.0f}mm (tolerance {tolerance_mm:.1f}mm is only for rounding)")
                                            continue
                                        best_stock_for_pair = stock_len
                                        waste = stock_len - combined_length
                                        waste_pct = (waste / stock_len * 100) if stock_len > 0 else 0
                                        nesting_log(f"[NESTING] Pair fits in {stock_len:.1f}mm stock: {combined_length:.1f}mm <= {stock_len:.1f}mm (waste: {waste:.1f}mm, {waste_pct:.1f}%) - preferring longer stock to minimize bars")
                                        break  # Use the longest stock that fits
                                
                                if best_stock_for_pair:
                                    # Calculate waste, but ensure it's not negative (due to tolerance)
                                    waste_for_pair = max(0.0, best_stock_for_pair - combined_length)
                                    # shared_linear_slopes_length is always initialized (0.0 at minimum)
                                    saved_material = shared_linear_slopes_length
                                    nesting_log(f"[NESTING] Found complementary slopes ({pairing_type}): part {part1['product_id']} ({angle1_str}) with part {part2['product_id']} ({angle2_str}) - actual length needed: {combined_length:.1f}mm (saved {saved_material:.1f}mm from shared cut), fits in stock: {best_stock_for_pair:.1f}mm (waste: {waste_for_pair:.1f}mm)")
                                else:
                                    nesting_log(f"[NESTING] Found complementary slopes ({pairing_type}): part {part1['product_id']} ({angle1_str}) with part {part2['product_id']} ({angle2_str}) - actual length needed: {combined_length:.1f}mm, doesn't fit in any stock length (max available: {max(stock_lengths_list):.1f}mm)")
                                
                                # FIXED: For complementary pairs, use the stock selected by best_stock (prefers shorter)
                                # Respect the stock selection logic that prefers shorter stock when all parts fit
                                if best_stock_for_pair:
                                    # Pair fits in a stock length - use best_stock (which prefers shorter when all fit)
                                    stock_to_use = best_stock
                                    if current_length == 0.0:
                                        # Pattern is empty - use best_stock (already selected to prefer shorter)
                                        # Only use pair's stock if it's the same as best_stock or if pair doesn't fit in best_stock
                                        if combined_length <= best_stock:
                                            # Pair fits in best_stock - use best_stock (prefers shorter)
                                            nesting_log(f"[NESTING] Using stock {best_stock:.1f}mm for complementary pair (respects shorter stock preference)")
                                        else:
                                            # Pair doesn't fit in best_stock - use pair's stock (but this shouldn't happen if best_stock is correct)
                                            stock_to_use = best_stock_for_pair
                                            nesting_log(f"[NESTING] WARNING: Pair needs {best_stock_for_pair:.1f}mm but best_stock is {best_stock:.1f}mm")
                                    else:
                                        # Pattern has parts - use best_stock (already selected)
                                        stock_to_use = best_stock
                                else:
                                    # Pair doesn't fit in any stock - use best_stock (will be rejected later)
                                    stock_to_use = best_stock
                                
                                # For complementary slopes, prioritize pairing even if it means starting a new pattern
                                # This is especially important for IPE600, IPE400 and other large profiles
                                # CRITICAL: NO TOLERANCE - must fit exactly within stock length
                                tolerance_mm = 0.1  # Minimal tolerance for floating point errors only
                                
                                # CRITICAL CHECK: Ensure current_length hasn't already exceeded best_stock
                                # Maximum optimization: 0mm margin - only use tolerance for floating point errors
                                if current_length > best_stock + tolerance_mm:
                                    nesting_log(f"[NESTING] SKIP PAIR: current_length {current_length:.1f}mm already exceeds stock {best_stock:.0f}mm - cannot add more pairs")
                                    break  # Break out of complementary pair processing
                                
                                # STRICT VALIDATION: Check if pair actually fits in stock (no tolerance)
                                if best_stock_for_pair and combined_length <= best_stock_for_pair + tolerance_mm:
                                    # Additional validation: ensure pair fits in the stock we're using
                                    if combined_length > stock_to_use:
                                        nesting_log(f"[NESTING] REJECTING pair: combined_length {combined_length:.1f}mm exceeds stock_to_use {stock_to_use:.1f}mm")
                                        continue  # Skip this pair
                                    
                                    # The pair fits in a stock bar - ALWAYS prioritize pairing complementary slopes
                                    # This is critical - never split complementary pairs
                                    if current_length == 0.0:
                                        # Pattern is empty - ALWAYS pair complementary parts (this is the most common case)
                                        nesting_log(f"[NESTING] Pattern is empty - pairing complementary parts in {best_stock_for_pair:.1f}mm stock")
                                    elif current_length + combined_length <= best_stock:
                                        # Pair fits in current pattern - STRICT: must fit exactly within stock (no tolerance)
                                        # Use strict check: current_length + combined_length must be <= best_stock (no tolerance)
                                        nesting_log(f"[NESTING] Complementary pair fits in current pattern, pairing them")
                                    else:
                                        # Pair doesn't fit in current pattern - must start new pattern to pair them
                                        nesting_log(f"[NESTING] Complementary pair doesn't fit in current pattern ({current_length:.1f}mm + {combined_length:.1f}mm > {best_stock:.0f}mm). Starting new pattern to pair them.")
                                        break
                                    
                                    # CRITICAL VALIDATION: Double-check that adding this pair won't exceed stock
                                    # Use best_stock (the actual stock length for this pattern) not stock_to_use
                                    length_after_pair = current_length + combined_length
                                    if length_after_pair > best_stock + tolerance_mm:
                                        nesting_log(f"[NESTING] REJECTING pair: Would exceed stock ({length_after_pair:.1f}mm > {best_stock:.0f}mm)")
                                        continue  # Skip this pair
                                    
                                    # If we get here, the pair fits and should be added
                                    nesting_log(f"[NESTING] Both parts fit in stock bar ({best_stock:.0f}mm), pairing them (current: {current_length:.1f}mm + combined: {combined_length:.1f}mm = {length_after_pair:.1f}mm)")
                                    # Add both parts as a complementary pair
                                    pattern_parts.append({
                                        "part": part1,
                                        "cut_position": cut_position,
                                        "length": part1["length"],
                                        "slope_info": {
                                            "start_angle": part1_start_angle,
                                            "end_angle": part1_end_angle,
                                            "start_has_slope": part1_start_slope,
                                            "end_has_slope": part1_end_slope,
                                            "has_slope": part1_start_slope or part1_end_slope
                                        }
                                    })
                                    # Store the current_length before adding the pair
                                    length_before_pair = current_length
                                    
                                    cut_position += part1["length"]
                                    
                                    # For complementary slopes, part2 starts at the shared cut position
                                    # This means part2's cut_position should account for the shared linear slopes length
                                    part2_cut_position = cut_position - shared_linear_slopes_length
                                    
                                    pattern_parts.append({
                                        "part": part2,
                                        "cut_position": part2_cut_position,
                                        "length": part2["length"],
                                        "slope_info": {
                                            "start_angle": part2_start_angle,
                                            "end_angle": part2_end_angle,
                                            "start_has_slope": part2_start_slope,
                                            "end_has_slope": part2_end_slope,
                                            "has_slope": part2_start_slope or part2_end_slope,
                                            "complementary_pair": True
                                        }
                                    })
                                    # Update cut_position to reflect where we actually are after both parts
                                    # This is part1 end + part2 length - shared_linear_slopes_length (which equals combined_length)
                                    cut_position = part2_cut_position + part2["length"]
                                    
                                    # Use combined_length directly to update current_length - this ensures accuracy
                                    # combined_length already accounts for: length1 + length2 - shared_linear_slopes_length
                                    current_length = length_before_pair + combined_length
                                    
                                    # ABSOLUTE STRICT CHECK: current_length must NEVER exceed best_stock
                                    # Use a very small epsilon to account for floating point precision, but be very strict
                                    epsilon = 0.01  # Very small epsilon for floating point comparison
                                    if current_length > best_stock + epsilon:
                                        # This should never happen if validation is correct, but catch it just in case
                                        nesting_log(f"[NESTING] ABSOLUTE REJECTION: current_length {current_length:.1f}mm exceeds stock {best_stock:.0f}mm (epsilon: {epsilon:.2f}mm) - removing pair")
                                        # Remove the parts we just added
                                        pattern_parts = [pp for pp in pattern_parts if pp.get("part") not in [part1, part2]]
                                        current_length = length_before_pair
                                        cut_position = length_before_pair  # Reset cut_position too
                                        continue  # Skip this pair
                                    
                                    # STRICT CHECK: current_length must NEVER exceed best_stock (tolerance only for floating point rounding)
                                    # If it does, reject immediately
                                    if current_length > best_stock:
                                        # This should never happen if validation is correct, but catch it just in case
                                        nesting_log(f"[NESTING] CRITICAL REJECTION: current_length {current_length:.1f}mm exceeds stock {best_stock:.0f}mm (no tolerance) - removing pair")
                                        # Remove the parts we just added
                                        pattern_parts = [pp for pp in pattern_parts if pp.get("part") not in [part1, part2]]
                                        current_length = length_before_pair
                                        cut_position = length_before_pair  # Reset cut_position too
                                        continue  # Skip this pair
                                    
                                    # IMMEDIATE CHECK: If current_length exceeds best_stock even with tolerance, reject
                                    # This should never happen if validation is correct, but catch it just in case
                                    if current_length > best_stock + tolerance_mm:
                                        nesting_log(f"[NESTING] IMMEDIATE REJECTION: current_length {current_length:.1f}mm exceeds stock {best_stock:.0f}mm immediately after calculation - removing pair")
                                        # Remove the parts we just added
                                        pattern_parts = [pp for pp in pattern_parts if pp.get("part") not in [part1, part2]]
                                        current_length = length_before_pair
                                        cut_position = length_before_pair  # Reset cut_position too
                                        continue  # Skip this pair
                                    
                                    # FINAL VALIDATION: Ensure current_length doesn't exceed stock
                                    # Use best_stock (the actual stock length for this pattern) not stock_to_use
                                    if current_length > best_stock + tolerance_mm:
                                        nesting_log(f"[NESTING] ERROR: After adding pair, current_length {current_length:.1f}mm exceeds stock {best_stock:.0f}mm - removing pair")
                                        # Remove the parts we just added
                                        pattern_parts = [pp for pp in pattern_parts if pp.get("part") not in [part1, part2]]
                                        current_length = length_before_pair
                                        continue  # Skip this pair
                                    
                                    # CRITICAL SAFETY CHECK: Double-check current_length is valid after pair addition
                                    if current_length > best_stock + tolerance_mm:
                                        nesting_log(f"[NESTING] CRITICAL ERROR: current_length {current_length:.1f}mm exceeds stock {best_stock:.0f}mm after pair validation - this should not happen!")
                                        # Force break to prevent further additions
                                        break
                                    
                                    total_parts_length += part1["length"] + part2["length"]  # Track individual part lengths (for display)
                                    
                                    nesting_log(f"[NESTING] Added complementary pair: length_before = {length_before_pair:.1f}mm, combined_length = {combined_length:.1f}mm, current_length = {current_length:.1f}mm")
                                    nesting_log(f"[NESTING]   Verification: part1={part1['length']:.1f}mm + part2={part2['length']:.1f}mm - shared={shared_linear_slopes_length:.1f}mm = {combined_length:.1f}mm")
                                    
                                    parts_to_remove.extend([part1, part2])
                                    nesting_log(f"[NESTING] Successfully paired complementary slopes - waste saved by using complementary cuts")
                                    
                                    # CRITICAL CHECK: After adding pair, verify current_length is still valid
                                    # If it exceeds best_stock, break out of outer loop to prevent adding more pairs
                                    if current_length > best_stock + tolerance_mm:
                                        nesting_log(f"[NESTING] BREAK OUTER LOOP: After adding pair, current_length {current_length:.1f}mm exceeds stock {best_stock:.0f}mm - stopping complementary pair search")
                                        break  # Break out of inner loop, and the outer loop will also stop due to the check at the beginning
                                    
                                    break  # Found a pair, move to next part
                                else:
                                    nesting_log(f"[NESTING] Complementary parts don't fit in any stock length (combined_length={combined_length:.1f}mm, max_stock={max(stock_lengths_list):.1f}mm)")
                                    # Don't break - continue looking for other pairs that might fit
                
                # Step 2: Fill remaining space with other parts (including non-sloped parts)
                # IMPORTANT: Step 1 already tried to find complementary pairs
                # Now process ALL remaining parts to ensure complete nesting for IPE500, IPE600, Ø219.1*3, etc.
                # No skipping - Step 1 handled pairing, Step 2 handles everything else
                # Only process valid parts that fit in best_stock
                
                for part in valid_parts_for_this_stock:
                    if part in parts_to_remove:
                        continue
                    
                    # Process the part - only add if it fits in the stock
                    # FIXED: Don't add parts that exceed stock length - they should have been filtered earlier
                    # Only process parts from valid_parts_for_this_stock
                    if part not in valid_parts_for_this_stock:
                        # Part was filtered out (exceeds stock) - skip it
                        continue
                    
                    # CRITICAL SAFETY CHECK: Ensure current_length hasn't already exceeded stock
                    # This prevents adding more parts when current_length is already too high
                    # Maximum optimization: 0mm margin - only use tolerance for floating point errors
                    # If current_length exceeds best_stock (even slightly), stop immediately
                    if current_length > best_stock + tolerance_mm:
                        nesting_log(f"[NESTING] SAFETY BREAK: current_length {current_length:.1f}mm already exceeds stock {best_stock:.0f}mm (tolerance: {tolerance_mm:.1f}mm) - stopping pattern")
                        break
                    
                    # CRITICAL FIX: For individual parts (not paired), always use full part length
                    part_length = part["length"]
                    
                    # CRITICAL: Check if this part can share boundary with previous part
                    # If boundaries can't be shared (non-complementary slopes), add kerf
                    kerf_mm = 0.0  # Default: no kerf if boundaries can be shared
                    
                    if len(pattern_parts) > 0:
                        # Check if previous part's end and current part's start can share boundary
                        prev_part = pattern_parts[-1]
                        prev_slope_info = prev_part.get("slope_info", {})
                        curr_slope_info = {
                            "start_angle": part.get("start_angle"),
                            "end_angle": part.get("end_angle"),
                            "start_has_slope": part.get("start_has_slope", False),
                            "end_has_slope": part.get("end_has_slope", False)
                        }
                        
                        prev_end_has_slope = prev_slope_info.get("end_has_slope", False)
                        prev_end_angle = prev_slope_info.get("end_angle")
                        curr_start_has_slope = curr_slope_info.get("start_has_slope", False)
                        curr_start_angle = curr_slope_info.get("start_angle")
                        
                        # Determine if boundaries can share
                        can_share = False
                        
                        if not prev_end_has_slope and not curr_start_has_slope:
                            # Both straight - can share
                            can_share = True
                        elif prev_end_has_slope and curr_start_has_slope:
                            # Both sloped - check if complementary
                            if prev_end_angle is not None and curr_start_angle is not None:
                                # Check if angles are complementary (opposite signs, similar magnitude)
                                angle_diff = abs(abs(prev_end_angle) - abs(curr_start_angle))
                                # If angles are within 2 degrees and have opposite signs, they're complementary
                                if angle_diff <= 2.0:
                                    # Check if they have opposite signs (complementary)
                                    if (prev_end_angle > 0 and curr_start_angle < 0) or (prev_end_angle < 0 and curr_start_angle > 0):
                                        can_share = True
                        
                        # If boundaries can't be shared, add kerf (typical kerf for steel cutting: 2-5mm)
                        if not can_share:
                            kerf_mm = 3.0  # Standard kerf for steel cutting (adjust as needed)
                            nesting_log(f"[NESTING] Parts cannot share boundary - adding {kerf_mm:.1f}mm kerf")
                    
                    # STRICT VALIDATION: Check if adding this part (with kerf if needed) would exceed stock
                    new_length = current_length + part_length + kerf_mm  # Add kerf if boundaries can't be shared
                    tolerance_mm = 0.1  # Minimal tolerance for floating point errors only
                    
                    # VALIDATION: Check if adding this part would exceed stock length
                    # Use current_length (actual material used) not total_parts_length (sum of individual lengths)
                    # current_length accounts for shared cuts from complementary slopes
                    if new_length > best_stock + tolerance_mm:
                        # Part doesn't fit - stop adding parts to this pattern
                        part_id = part.get("product_id") or part.get("reference") or part.get("element_name") or "unknown"
                        print(
                            f"[NESTING] Part {part_id} ({part_length:.1f}mm) + kerf ({kerf_mm:.1f}mm) doesn't fit: "
                            f"{current_length:.1f}mm + {part_length:.1f}mm + {kerf_mm:.1f}mm = {new_length:.1f}mm "
                            f"> {best_stock:.0f}mm (tolerance: {tolerance_mm:.1f}mm)"
                        )
                        break
                    
                    # Part fits - add it
                    pattern_parts.append({
                        "part": part,
                        "cut_position": cut_position,
                        "length": part_length,  # Store full part length
                        "slope_info": {
                            "start_angle": part.get("start_angle"),
                            "end_angle": part.get("end_angle"),
                            "start_has_slope": part.get("start_has_slope", False),
                            "end_has_slope": part.get("end_has_slope", False),
                            "has_slope": part.get("start_has_slope", False) or part.get("end_has_slope", False)
                        }
                    })
                    # CRITICAL: Add kerf to current_length if boundaries can't be shared
                    current_length = new_length  # Includes part_length + kerf_mm
                    total_parts_length += part_length  # Track individual part length (without kerf)
                    cut_position += part_length + kerf_mm  # Position includes kerf
                    parts_to_remove.append(part)
                    
                    part_id = part.get("product_id") or part.get("reference") or part.get("element_name") or "unknown"
                    nesting_log(f"[NESTING] Added part {part_id} ({part_length:.1f}mm) + kerf ({kerf_mm:.1f}mm) to pattern - current_length: {current_length:.1f}mm / {best_stock:.0f}mm, parts in pattern: {len(pattern_parts)}")
                    
                    # FINAL CHECK: Ensure current_length hasn't exceeded stock (safety check)
                    # Use tolerance to allow exact fits (when current_length == best_stock)
                    tolerance_mm_check = 0.1
                    if current_length > best_stock + tolerance_mm_check:
                        part_id = part.get("product_id") or part.get("reference") or part.get("element_name") or "unknown"
                        nesting_log(f"[NESTING] ERROR: After adding part {part_id}, current_length {current_length:.1f}mm exceeds stock {best_stock:.0f}mm - removing part")
                        # Remove the part we just added
                        pattern_parts = [pp for pp in pattern_parts if pp.get("part") != part]
                        current_length -= (part_length + kerf_mm)
                        total_parts_length -= part_length
                        if part in parts_to_remove:
                            parts_to_remove.remove(part)
                        break  # Stop adding more parts
                    elif abs(current_length - best_stock) <= tolerance_mm_check:
                        # Bar is exactly full (within tolerance) - stop adding more parts but keep this part
                        part_id = part.get("product_id") or part.get("reference") or part.get("element_name") or "unknown"
                        nesting_log(f"[NESTING] Bar is exactly full after adding part {part_id} - current_length: {current_length:.1f}mm == {best_stock:.0f}mm (within tolerance), stopping part filling")
                        break  # Stop adding more parts, but keep the part we just added
                
                # Remove used parts
                for part in parts_to_remove:
                    if part in remaining_parts:
                        remaining_parts.remove(part)
                
                if not parts_to_remove:
                    # No parts were processed - this shouldn't happen if stock selection is correct
                    # Check if there are parts that don't fit
                    if remaining_parts:
                        first_part = remaining_parts[0]
                        if first_part["length"] > best_stock:
                            nesting_log(f"[NESTING] ERROR: Cannot process part {first_part.get('product_id', 'unknown')} (length: {first_part.get('length', 0):.1f}mm) - exceeds stock {best_stock:.0f}mm")
                            # Remove it to prevent infinite loop
                            remaining_parts.remove(first_part)
                        else:
                            nesting_log(f"[NESTING] WARNING: No parts processed in iteration despite parts fitting in stock")
                            # Break to prevent infinite loop
                            break
                    else:
                        # No parts remaining - break normally
                        break
                
                # CRITICAL: Validate pattern before creating it
                # 1. Must have at least one part
                # 2. All parts must fit in stock length (individually)
                # 3. TOTAL length of all parts must not exceed stock length
                if not pattern_parts:
                    nesting_log(f"[NESTING] WARNING: Pattern has no parts - skipping pattern creation")
                    continue
                
                # Validate all parts fit in stock (individually)
                invalid_parts = []
                for pp in pattern_parts:
                    part_length = pp.get("length", 0)
                    if part_length > best_stock:
                        part_obj = pp.get("part", {})
                        part_id = part_obj.get("product_id") or part_obj.get("reference") or part_obj.get("element_name") or "unknown"
                        reference = part_obj.get("reference")
                        element_name = part_obj.get("element_name")
                        invalid_parts.append({
                            "part": part_id,
                            "reference": reference,
                            "element_name": element_name,
                            "part_obj": part_obj,
                            "length": part_length,
                            "stock": best_stock
                        })
                
                # CRITICAL: Validate TOTAL length doesn't exceed stock
                # Use tolerance to allow exact fits (when current_length == best_stock)
                tolerance_mm_validate = 0.1
                
                # Check if pattern has shared boundaries (complementary pairs)
                # If current_length < total_parts_length, there are shared boundaries that saved material
                has_shared_boundaries = current_length < total_parts_length - tolerance_mm_validate
                
                # PRIMARY VALIDATION: Always check current_length (actual material used)
                # This is the correct check for patterns with shared boundaries
                if current_length > best_stock + tolerance_mm_validate:
                    nesting_log(f"[NESTING] ERROR: Pattern total length {current_length:.1f}mm exceeds stock {best_stock:.0f}mm")
                    # List all parts in the pattern
                    part_details = []
                    for pp in pattern_parts:
                        part_obj = pp.get("part", {})
                        part_id = part_obj.get("product_id") or part_obj.get("reference") or part_obj.get("element_name") or "unknown"
                        part_length = pp.get("length", 0)
                        part_details.append(f"{part_id} ({part_length:.1f}mm)")
                    nesting_log(f"[NESTING]   Parts in pattern: {', '.join(part_details)}")
                    nesting_log(f"[NESTING]   Total current_length: {current_length:.1f}mm")
                    nesting_log(f"[NESTING]   Total parts_length: {total_parts_length:.1f}mm")
                    nesting_log(f"[NESTING]   Stock: {best_stock:.0f}mm")
                    nesting_log(f"[NESTING]   Difference: {current_length - best_stock:.1f}mm")
                    nesting_log(f"[NESTING] REJECTING this pattern - total length exceeds stock")
                    
                    # Add all parts to rejected list
                    for pp in pattern_parts:
                        part_obj = pp.get("part", {})
                        product_id = part_obj.get("product_id")
                        part_id = product_id or part_obj.get("reference") or part_obj.get("element_name") or "unknown"
                        reference = part_obj.get("reference")
                        element_name = part_obj.get("element_name")
                        part_length = pp.get("length", 0)
                        rejected_parts.append({
                            "product_id": product_id,
                            "part_id": part_id,
                            "reference": reference,
                            "element_name": element_name,
                            "length": part_length,
                            "stock_length": best_stock,
                            "reason": f"Pattern total length ({current_length:.1f}mm) exceeds stock ({best_stock:.0f}mm)"
                        })
                    
                    # Remove invalid parts from remaining_parts to prevent infinite loop
                    for pp in pattern_parts:
                        part_obj = pp.get("part")
                        if part_obj and part_obj in remaining_parts:
                            remaining_parts.remove(part_obj)
                    continue  # Skip creating this pattern
                
                # SECONDARY VALIDATION: Check total_parts_length only if there are NO shared boundaries
                # This catches the bug where parts are incorrectly combined without shared boundaries
                # If has_shared_boundaries is True, we already validated current_length above, so skip this check
                if not has_shared_boundaries and total_parts_length > best_stock + tolerance_mm_validate:
                    nesting_log(f"[NESTING] ERROR: Pattern total parts length {total_parts_length:.1f}mm exceeds stock {best_stock:.0f}mm (no shared boundaries to reduce material)")
                    part_details = []
                    for pp in pattern_parts:
                        part_obj = pp.get("part", {})
                        part_id = part_obj.get("product_id") or part_obj.get("reference") or part_obj.get("element_name") or "unknown"
                        part_length = pp.get("length", 0)
                        part_details.append(f"{part_id} ({part_length:.1f}mm)")
                    nesting_log(f"[NESTING]   Parts in pattern: {', '.join(part_details)}")
                    nesting_log(f"[NESTING]   Total parts_length (sum of all individual parts): {total_parts_length:.1f}mm")
                    nesting_log(f"[NESTING]   Current_length (no shared savings): {current_length:.1f}mm")
                    nesting_log(f"[NESTING]   Stock: {best_stock:.0f}mm")
                    nesting_log(f"[NESTING]   Difference: {total_parts_length - best_stock:.1f}mm")
                    nesting_log(f"[NESTING] REJECTING this pattern - total parts length exceeds stock (no shared boundaries)")
                    
                    # Add all parts to rejected list
                    for pp in pattern_parts:
                        part_obj = pp.get("part", {})
                        product_id = part_obj.get("product_id")
                        part_id = product_id or part_obj.get("reference") or part_obj.get("element_name") or "unknown"
                        reference = part_obj.get("reference")
                        element_name = part_obj.get("element_name")
                        part_length = pp.get("length", 0)
                        rejected_parts.append({
                            "product_id": product_id,
                            "part_id": part_id,
                            "reference": reference,
                            "element_name": element_name,
                            "length": part_length,
                            "stock_length": best_stock,
                            "reason": f"Pattern total parts length ({total_parts_length:.1f}mm) exceeds stock ({best_stock:.0f}mm) - no shared boundaries"
                        })
                    
                    # Remove invalid parts from remaining_parts to prevent infinite loop
                    for pp in pattern_parts:
                        part_obj = pp.get("part")
                        if part_obj and part_obj in remaining_parts:
                            remaining_parts.remove(part_obj)
                    continue  # Skip creating this pattern
                
                # ADDITIONAL VALIDATION: Check if current_length is unreasonably larger than total_parts_length
                # This catches calculation errors where kerf is added incorrectly
                max_expected_kerf = (len(pattern_parts) - 1) * 3.0  # Maximum kerf if NO boundaries can share
                if current_length > total_parts_length + max_expected_kerf + 10.0:  # Allow 10mm tolerance
                    nesting_log(f"[NESTING] ERROR: current_length ({current_length:.1f}mm) is unreasonably larger than total_parts_length ({total_parts_length:.1f}mm)")
                    nesting_log(f"[NESTING]   - Expected max difference (all kerf, no sharing): {max_expected_kerf:.1f}mm")
                    nesting_log(f"[NESTING]   - Actual difference: {current_length - total_parts_length:.1f}mm")
                    nesting_log(f"[NESTING]   - This suggests a calculation error - rejecting pattern")
                    
                    # Add all parts to rejected list
                    for pp in pattern_parts:
                        part_obj = pp.get("part", {})
                        product_id = part_obj.get("product_id")
                        part_id = product_id or part_obj.get("reference") or part_obj.get("element_name") or "unknown"
                        reference = part_obj.get("reference")
                        element_name = part_obj.get("element_name")
                        part_length = pp.get("length", 0)
                        rejected_parts.append({
                            "product_id": product_id,
                            "part_id": part_id,
                            "reference": reference,
                            "element_name": element_name,
                            "length": part_length,
                            "stock_length": best_stock,
                            "reason": f"Pattern calculation error: current_length ({current_length:.1f}mm) unreasonably exceeds total_parts_length ({total_parts_length:.1f}mm)"
                        })
                    
                    # Remove invalid parts from remaining_parts to prevent infinite loop
                    for pp in pattern_parts:
                        part_obj = pp.get("part")
                        if part_obj and part_obj in remaining_parts:
                            remaining_parts.remove(part_obj)
                    continue  # Skip creating this pattern
                
                if invalid_parts:
                    nesting_log(f"[NESTING] ERROR: Pattern contains {len(invalid_parts)} parts that exceed stock length {best_stock:.0f}mm:")
                    for ip in invalid_parts:
                        part_obj = ip.get('part_obj', {})
                        product_id = part_obj.get("product_id") if isinstance(part_obj, dict) else None
                        nesting_log(f"[NESTING]   - Part {ip['part']}: {ip['length']:.1f}mm > {ip['stock']:.0f}mm")
                        # Add to rejected parts list
                        rejected_parts.append({
                            "product_id": product_id,
                            "part_id": ip['part'],
                            "reference": ip.get('reference'),
                            "element_name": ip.get('element_name'),
                            "length": ip['length'],
                            "stock_length": ip['stock'],
                            "reason": f"Part length ({ip['length']:.1f}mm) exceeds selected stock ({ip['stock']:.0f}mm)"
                        })
                    nesting_log(f"[NESTING] REJECTING this pattern - parts exceed stock length")
                    # Remove invalid parts from remaining_parts to prevent infinite loop
                    for pp in pattern_parts:
                        part_obj = pp.get("part")
                        if part_obj and part_obj in remaining_parts:
                            remaining_parts.remove(part_obj)
                    continue  # Skip creating this pattern
                
                # CRITICAL: Validate pattern by recalculating actual length from pattern_parts
                # This ensures the pattern actually fits, even if current_length seems correct
                # ALWAYS run this validation to catch any discrepancies
                print(f"[NESTING] VALIDATION: Starting validation for pattern with {len(pattern_parts)} parts, current_length={current_length:.1f}mm, best_stock={best_stock:.0f}mm", flush=True)
                validated_parts = []
                validated_length = 0.0
                last_slope_info = None
                tolerance_mm = 0.1
                
                for pp in pattern_parts:
                    part_obj = pp.get("part", {})
                    part_length = pp.get("length", 0)
                    slope_info = pp.get("slope_info", {})
                    
                    # Calculate kerf if boundaries can't be shared
                    kerf = 0.0
                    if len(validated_parts) > 0 and last_slope_info:
                        # Check if previous end and current start can share boundary
                        prev_end_has_slope = last_slope_info.get("end_has_slope", False)
                        curr_start_has_slope = slope_info.get("start_has_slope", False)
                        
                        if prev_end_has_slope and curr_start_has_slope:
                            # Both have slopes - check if they're complementary
                            prev_end_angle = last_slope_info.get("end_angle", 0)
                            curr_start_angle = slope_info.get("start_angle", 0)
                            angle_diff = abs(prev_end_angle + curr_start_angle)  # Opposite signs = complementary
                            if angle_diff <= 2.0:
                                kerf = 0.0  # Can share boundary (complementary slopes)
                            else:
                                kerf = 3.0  # Can't share boundary (non-complementary slopes)
                        else:
                            kerf = 3.0  # One or both don't have slopes, need kerf
                    elif len(validated_parts) > 0:
                        # Previous part exists but no slope info - assume kerf needed
                        kerf = 3.0
                    
                    # Check if this is part of a complementary pair (second part)
                    is_complementary_second = slope_info.get("complementary_pair", False)
                    if is_complementary_second and len(validated_parts) > 0:
                        # This is the second part of a complementary pair
                        # The first part was already added, so we need to calculate the combined length
                        prev_part = validated_parts[-1]
                        prev_length = prev_part.get("length", 0)
                        prev_slope_info = prev_part.get("slope_info", {})
                        
                        # For complementary pairs, the combined length is: length1 + length2 - shared_length
                        # We need to estimate the shared length - use the slope calculation logic
                        # Simplified: use the smaller of the two cross-section depths
                        # This is an approximation - the actual shared length depends on the angle
                        # Conservative estimate: assume shared length is ~5-10% of the smaller part
                        shared_estimate = min(prev_length, part_length) * 0.075  # 7.5% estimate
                        combined_length = prev_length + part_length - shared_estimate
                        
                        # Check if the combined pair fits (we already added the first part, so check if second fits)
                        # The validated_length currently includes prev_length, so we need to:
                        # - Subtract prev_length (which was added individually)
                        # - Add combined_length
                        new_validated_length = validated_length - prev_length + combined_length
                        
                        if new_validated_length > best_stock + tolerance_mm:
                            part_id = part_obj.get("product_id") or part_obj.get("reference") or part_obj.get("element_name") or "unknown"
                            print(f"[NESTING] VALIDATION: Complementary pair second part {part_id} ({part_length:.1f}mm) exceeds stock when recalculated ({new_validated_length:.1f}mm > {best_stock:.0f}mm) - removing pair", flush=True)
                            # Remove the first part of the pair too
                            validated_parts.pop()
                            validated_length -= prev_length
                            break
                        
                        # Pair fits - update validated_length
                        validated_length = new_validated_length
                        validated_parts.append(pp)
                        last_slope_info = slope_info
                    else:
                        # Regular part (or first part of pair) - add individually
                        new_validated_length = validated_length + part_length + kerf
                        
                        # Check if adding this part would exceed stock
                        if new_validated_length > best_stock + tolerance_mm:
                            part_id = part_obj.get("product_id") or part_obj.get("reference") or part_obj.get("element_name") or "unknown"
                            print(f"[NESTING] VALIDATION: Part {part_id} ({part_length:.1f}mm) + kerf ({kerf:.1f}mm) exceeds stock when recalculated ({new_validated_length:.1f}mm > {best_stock:.0f}mm) - stopping", flush=True)
                            break
                        
                        # Part fits - add it
                        validated_parts.append(pp)
                        validated_length = new_validated_length
                        last_slope_info = slope_info
                
                # Update pattern_parts and current_length to validated values
                # Check if pattern has complementary pairs (we skip validated_length update for them)
                has_complementary_pairs = any(pp.get("slope_info", {}).get("complementary_pair", False) for pp in pattern_parts)
                
                if has_complementary_pairs:
                    print(f"[NESTING] VALIDATION: Completed validation - validated {len(validated_parts)}/{len(pattern_parts)} parts (complementary pairs - using current_length={current_length:.1f}mm)", flush=True)
                else:
                    print(f"[NESTING] VALIDATION: Completed validation - validated {len(validated_parts)}/{len(pattern_parts)} parts, validated_length={validated_length:.1f}mm", flush=True)
                if len(validated_parts) < len(pattern_parts):
                    removed_count = len(pattern_parts) - len(validated_parts)
                    if has_complementary_pairs:
                        # For complementary pairs, trust current_length (calculated with geometric formula)
                        # Don't remove parts based on validated_length - it's inaccurate for complementary pairs
                        print(f"[NESTING] VALIDATION: WARNING - Validation loop removed {removed_count} part(s), but trusting current_length={current_length:.1f}mm for complementary pairs (fits in {best_stock:.0f}mm stock)", flush=True)
                        # Keep all parts and trust current_length
                    else:
                        print(f"[NESTING] VALIDATION: Removed {removed_count} part(s) that exceeded stock. Original length: {current_length:.1f}mm, Validated length: {validated_length:.1f}mm / {best_stock:.0f}mm", flush=True)
                        pattern_parts = validated_parts
                        current_length = validated_length
                        # Recalculate total_parts_length for validated parts
                        total_parts_length = sum(pp.get("length", 0) for pp in validated_parts)
                elif abs(validated_length - current_length) > 1.0:
                    # Lengths don't match
                    if has_complementary_pairs:
                        # For complementary pairs, trust current_length (calculated with geometric formula)
                        print(f"[NESTING] VALIDATION: Length mismatch detected but trusting current_length={current_length:.1f}mm for complementary pairs (validated_length={validated_length:.1f}mm is inaccurate)", flush=True)
                        # Keep current_length as is
                    else:
                        # Regular patterns - use validated length (more accurate)
                        print(f"[NESTING] VALIDATION: Length mismatch detected - current_length: {current_length:.1f}mm, validated_length: {validated_length:.1f}mm (using validated)", flush=True)
                        current_length = validated_length
                else:
                    if has_complementary_pairs:
                        print(f"[NESTING] VALIDATION: All parts validated successfully - trusting current_length={current_length:.1f}mm for complementary pairs", flush=True)
                    else:
                        print(f"[NESTING] VALIDATION: All parts validated successfully - length matches: {validated_length:.1f}mm", flush=True)
                
                # Calculate waste exactly: stock length minus actual material used (accounting for shared cuts)
                # Use current_length (actual material used with shared cut overlap subtracted) for waste calculation
                # When parts have complementary slopes, the shared cut overlap reduces the actual material needed
                # If actual material used equals stock length, waste is 0
                # No tolerances - calculate the exact unused material in the stock bar
                actual_material_used = min(current_length, best_stock)  # Cap at stock length for oversized parts
                waste = best_stock - actual_material_used  # Exact calculation: stock minus actual material used (with shared cuts)
                waste_percentage = (waste / best_stock * 100) if best_stock > 0 else 0
                
                nesting_log(f"[NESTING] Pattern waste calculation: best_stock={best_stock:.1f}mm, current_length={current_length:.1f}mm, actual_material_used={actual_material_used:.1f}mm, waste={waste:.1f}mm ({waste_percentage:.2f}%)", flush=True)
                
                # DEBUG: Log detailed pattern information to diagnose issues
                nesting_log(f"[NESTING] Pattern validation details:", flush=True)
                nesting_log(f"[NESTING]   - Number of parts: {len(pattern_parts)}", flush=True)
                nesting_log(f"[NESTING]   - Total parts_length (sum of individual parts): {total_parts_length:.1f}mm", flush=True)
                nesting_log(f"[NESTING]   - Current_length (with kerf/shared savings): {current_length:.1f}mm", flush=True)
                nesting_log(f"[NESTING]   - Difference: {current_length - total_parts_length:.1f}mm", flush=True)
                nesting_log(f"[NESTING]   - Stock length: {best_stock:.1f}mm", flush=True)
                if current_length > total_parts_length:
                    expected_kerf = (len(pattern_parts) - 1) * 3.0  # Maximum kerf if no boundaries can share
                    nesting_log(f"[NESTING]   - WARNING: current_length > total_parts_length by {current_length - total_parts_length:.1f}mm", flush=True)
                    nesting_log(f"[NESTING]   - Expected max kerf (if no sharing): {expected_kerf:.1f}mm", flush=True)
                    nesting_log(f"[NESTING]   - Actual difference: {current_length - total_parts_length:.1f}mm", flush=True)
                    if (current_length - total_parts_length) > expected_kerf + 10.0:  # Allow 10mm tolerance
                        nesting_log(f"[NESTING]   - ERROR: Difference is too large - possible calculation error!", flush=True)
                
                # DEBUG: Log what we're saving
                print(f"[NESTING] SAVING PATTERN: {len(pattern_parts)} parts, stock={best_stock:.0f}mm, waste={waste:.1f}mm ({waste_percentage:.2f}%)", flush=True)
                
                cutting_patterns.append({
                    "stock_length": best_stock,
                    "parts": pattern_parts,
                    "waste": waste,
                    "waste_percentage": waste_percentage
                })
                
                # Track stock usage
                if best_stock not in stock_lengths_used:
                    stock_lengths_used[best_stock] = 0
                stock_lengths_used[best_stock] += 1
                total_stock_bars += 1
                total_waste += waste
            
            # Calculate totals for this profile
            # Count actual parts in cutting patterns (not original parts list, as some may be paired)
            try:
                total_parts_in_patterns = sum(len(pattern.get("parts", [])) for pattern in cutting_patterns)
                total_parts_profile = total_parts_in_patterns if total_parts_in_patterns > 0 else len(parts)
            except (KeyError, TypeError):
                # Fallback to original parts count if cutting_patterns structure is unexpected
                total_parts_profile = len(parts)
            total_length_profile = sum(p["length"] for p in parts)
            total_waste_profile = sum(pattern.get("waste", 0.0) for pattern in cutting_patterns)
            total_stock_length_for_profile = sum(pattern.get("stock_length", 0.0) for pattern in cutting_patterns)
            total_waste_percentage_profile = (total_waste_profile / total_stock_length_for_profile * 100) if total_stock_length_for_profile > 0 else 0
            
            profile_nestings.append({
                "profile_name": profile_name,
                "total_parts": total_parts_profile,
                "total_length": total_length_profile,
                "stock_lengths_used": {str(k): int(v) for k, v in stock_lengths_used.items()},
                "cutting_patterns": cutting_patterns,
                "total_waste": total_waste_profile,
                "total_waste_percentage": total_waste_percentage_profile,
                "rejected_parts": rejected_parts  # Parts that cannot be nested (exceed stock length)
            })
            
            total_parts += total_parts_profile
        
        # Calculate summary - average waste percentage
        total_stock_length_used = sum(
            float(stock_len) * count
            for profile in profile_nestings
            for stock_len, count in profile["stock_lengths_used"].items()
        )
        average_waste_percentage = (total_waste / total_stock_length_used * 100) if total_stock_length_used > 0 else 0
        
        nesting_report = {
            "filename": decoded_filename,
            "profiles": profile_nestings,
            "summary": {
                "total_profiles": len(profile_nestings),
                "total_parts": total_parts,
                "total_stock_bars": total_stock_bars,
                "total_waste": total_waste,
                "average_waste_percentage": average_waste_percentage
            },
            "settings": {
                "stock_lengths": stock_lengths_list
            }
        }
        
        return JSONResponse(nesting_report)
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        error_msg = str(e)
        nesting_log(f"[NESTING] ===== ERROR OCCURRED =====")
        nesting_log(f"[NESTING] ERROR TYPE: {type(e).__name__}")
        nesting_log(f"[NESTING] ERROR MESSAGE: {error_msg}")
        nesting_log(f"[NESTING] FULL TRACEBACK:\n{error_trace}")
        nesting_log(f"[NESTING] ===== END ERROR =====")
        # Return error with detail - FastAPI will handle it
        error_detail = f"Nesting generation failed: {error_msg}"
        if len(error_trace) < 2000:  # Only include traceback if it's not too long
            error_detail += f"\n\nTraceback:\n{error_trace}"
        raise HTTPException(status_code=500, detail=error_detail)


@app.get("/api/debug-assembly-name/{filename}")
async def debug_assembly_name(filename: str, product_id: int = None):
    """Debug endpoint to find where assembly names are stored by comparing multiple products."""
    from urllib.parse import unquote
    decoded_filename = unquote(filename)
    file_path = IFC_DIR / decoded_filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="IFC file not found")
    
    try:
        ifc_file = ifcopenshell.open(str(file_path))
        
        # Get a sample of products
        products = []
        for product in ifc_file.by_type("IfcProduct"):
            if product.is_a() in ["IfcBeam", "IfcColumn", "IfcMember", "IfcPlate"]:
                products.append(product)
                if len(products) >= 10:  # Sample 10 products
                    break
        
        debug_info = {
            "filename": decoded_filename,
            "sample_size": len(products),
            "products": []
        }
        
        for product in products:
            product_info = {
                "id": product.id(),
                "type": product.is_a(),
                "tag": getattr(product, 'Tag', None),
                "name": getattr(product, 'Name', None),
                "all_property_values": {}
            }
            
            try:
                psets = ifcopenshell.util.element.get_psets(product)
                for pset_name, props in psets.items():
                    product_info["all_property_values"][pset_name] = {}
                    for key, value in props.items():
                        if value is not None:
                            value_str = str(value).strip()
                            # Only include non-empty, non-GUID values
                            if value_str and value_str.upper() not in ['NONE', 'NULL', 'N/A', '']:
                                if not (value_str.startswith('ID') and '-' in value_str and len(value_str) > 20):
                                    product_info["all_property_values"][pset_name][key] = value_str
            except Exception as e:
                product_info["error"] = str(e)
            
            debug_info["products"].append(product_info)
        
        return JSONResponse(debug_info)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.get("/api/debug-assembly-grouping/{filename}")
async def debug_assembly_grouping(filename: str, product_id: int = None):
    """Debug endpoint to find where Tekla stores assembly grouping information."""
    from urllib.parse import unquote
    decoded_filename = unquote(filename)
    file_path = IFC_DIR / decoded_filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="IFC file not found")
    
    try:
        ifc_file = ifcopenshell.open(str(file_path))
        
        result = {
            "filename": decoded_filename,
            "total_products": len(list(ifc_file.by_type("IfcProduct"))),
            "total_assemblies": len(list(ifc_file.by_type("IfcElementAssembly"))),
            "total_rel_aggregates": len(list(ifc_file.by_type("IfcRelAggregates"))),
            "ifc_element_assemblies": [],
            "rel_aggregates": [],
            "product_details": None
        }
        
        # Get all IfcElementAssembly objects
        assemblies = ifc_file.by_type("IfcElementAssembly")
        for assembly in assemblies[:10]:  # First 10
            assembly_info = {
                "id": assembly.id(),
                "type": assembly.is_a(),
                "tag": getattr(assembly, 'Tag', None),
                "name": getattr(assembly, 'Name', None),
                "property_sets": {}
            }
            
            # Get property sets
            try:
                psets = ifcopenshell.util.element.get_psets(assembly)
                assembly_info["property_sets"] = {name: dict(props) for name, props in psets.items()}
            except:
                pass
            
            # Find parts in this assembly
            parts_in_assembly = []
            for rel in ifc_file.by_type("IfcRelAggregates"):
                if rel.RelatingObject.id() == assembly.id():
                    for part in rel.RelatedObjects:
                        if part.is_a("IfcProduct"):
                            parts_in_assembly.append({
                                "id": part.id(),
                                "type": part.is_a(),
                                "tag": getattr(part, 'Tag', None),
                                "name": getattr(part, 'Name', None)
                            })
            assembly_info["parts"] = parts_in_assembly
            assembly_info["part_count"] = len(parts_in_assembly)
            
            result["ifc_element_assemblies"].append(assembly_info)
        
        # Get all IfcRelAggregates relationships
        for rel in list(ifc_file.by_type("IfcRelAggregates"))[:20]:  # First 20
            rel_info = {
                "id": rel.id(),
                "relating_object": {
                    "id": rel.RelatingObject.id() if rel.RelatingObject else None,
                    "type": rel.RelatingObject.is_a() if rel.RelatingObject else None,
                    "tag": getattr(rel.RelatingObject, 'Tag', None) if rel.RelatingObject else None,
                    "name": getattr(rel.RelatingObject, 'Name', None) if rel.RelatingObject else None
                },
                "related_objects": []
            }
            
            for obj in rel.RelatedObjects:
                rel_info["related_objects"].append({
                    "id": obj.id(),
                    "type": obj.is_a(),
                    "tag": getattr(obj, 'Tag', None),
                    "name": getattr(obj, 'Name', None)
                })
            
            result["rel_aggregates"].append(rel_info)
        
        # If product_id is provided, get detailed info about that product
        if product_id:
            try:
                product = ifc_file.by_id(product_id)
                product_info = {
                    "id": product.id(),
                    "type": product.is_a(),
                    "tag": getattr(product, 'Tag', None),
                    "name": getattr(product, 'Name', None),
                    "description": getattr(product, 'Description', None),
                    "property_sets": {},
                    "relationships": {
                        "decomposes": [],
                        "contained_in_structure": [],
                        "has_assignments": [],
                        "is_decomposed_by": []
                    },
                    "assembly_info": {}
                }
                
                # Get all property sets with full details
                try:
                    psets = ifcopenshell.util.element.get_psets(product)
                    # Include all property values, not just keys
                    product_info["property_sets"] = {name: dict(props) for name, props in psets.items()}
                    product_info["property_sets_full"] = {}
                    for pset_name, props in psets.items():
                        product_info["property_sets_full"][pset_name] = {}
                        for key, value in props.items():
                            product_info["property_sets_full"][pset_name][key] = {
                                "value": value,
                                "type": type(value).__name__,
                                "string_repr": str(value) if value is not None else None
                            }
                except Exception as e:
                    product_info["property_sets_error"] = str(e)
                
                # Check Decomposes (part belongs to assembly)
                if hasattr(product, 'Decomposes'):
                    for rel in product.Decomposes or []:
                        rel_data = {
                            "type": rel.is_a(),
                            "relating_object": {
                                "id": rel.RelatingObject.id() if rel.RelatingObject else None,
                                "type": rel.RelatingObject.is_a() if rel.RelatingObject else None,
                                "tag": getattr(rel.RelatingObject, 'Tag', None) if rel.RelatingObject else None,
                                "name": getattr(rel.RelatingObject, 'Name', None) if rel.RelatingObject else None
                            }
                        }
                        product_info["relationships"]["decomposes"].append(rel_data)
                
                # Check ContainedInStructure (spatial containment)
                if hasattr(product, 'ContainedInStructure'):
                    for rel in product.ContainedInStructure or []:
                        rel_data = {
                            "type": rel.is_a(),
                            "relating_structure": {
                                "id": rel.RelatingStructure.id() if rel.RelatingStructure else None,
                                "type": rel.RelatingStructure.is_a() if rel.RelatingStructure else None,
                                "tag": getattr(rel.RelatingStructure, 'Tag', None) if rel.RelatingStructure else None,
                                "name": getattr(rel.RelatingStructure, 'Name', None) if rel.RelatingStructure else None
                            }
                        }
                        product_info["relationships"]["contained_in_structure"].append(rel_data)
                
                # Check HasAssignments (various assignments)
                if hasattr(product, 'HasAssignments'):
                    for assignment in product.HasAssignments or []:
                        assignment_data = {
                            "type": assignment.is_a(),
                            "related_objects": []
                        }
                        if hasattr(assignment, 'RelatedObjects'):
                            for obj in assignment.RelatedObjects or []:
                                assignment_data["related_objects"].append({
                                    "id": obj.id(),
                                    "type": obj.is_a(),
                                    "tag": getattr(obj, 'Tag', None),
                                    "name": getattr(obj, 'Name', None)
                                })
                        product_info["relationships"]["has_assignments"].append(assignment_data)
                
                # Check IsDecomposedBy (this product is an assembly containing parts)
                if hasattr(product, 'IsDecomposedBy'):
                    for rel in product.IsDecomposedBy or []:
                        rel_data = {
                            "type": rel.is_a(),
                            "related_objects": []
                        }
                        if hasattr(rel, 'RelatedObjects'):
                            for obj in rel.RelatedObjects or []:
                                rel_data["related_objects"].append({
                                    "id": obj.id(),
                                    "type": obj.is_a(),
                                    "tag": getattr(obj, 'Tag', None),
                                    "name": getattr(obj, 'Name', None)
                                })
                        product_info["relationships"]["is_decomposed_by"].append(rel_data)
                
                # Get assembly info using our function
                assembly_mark, assembly_id = get_assembly_info(product)
                product_info["assembly_info"] = {
                    "assembly_mark": assembly_mark,
                    "assembly_id": assembly_id,
                    "extraction_method": "get_assembly_info function"
                }
                
                # Try to find other products with the same assembly mark
                if assembly_mark and assembly_mark != "N/A":
                    same_mark_products = []
                    for other_product in ifc_file.by_type("IfcProduct"):
                        if other_product.id() != product_id:
                            other_mark, _ = get_assembly_info(other_product)
                            if other_mark == assembly_mark:
                                same_mark_products.append({
                                    "id": other_product.id(),
                                    "type": other_product.is_a(),
                                    "tag": getattr(other_product, 'Tag', None),
                                    "name": getattr(other_product, 'Name', None)
                                })
                    product_info["assembly_info"]["products_with_same_mark"] = same_mark_products
                    product_info["assembly_info"]["same_mark_count"] = len(same_mark_products)
                
                result["product_details"] = product_info
                
            except Exception as e:
                result["product_details"] = {"error": f"Failed to get product {product_id}: {str(e)}"}
        
        return JSONResponse(result)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Debug failed: {str(e)}")


@app.get("/api/debug-profile/{filename}")
async def debug_profile_extraction(filename: str):
    """Debug endpoint to see how profile names are extracted from IFC file."""
    from urllib.parse import unquote
    decoded_filename = unquote(filename)
    file_path = IFC_DIR / decoded_filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="IFC file not found")
    
    try:
        ifc_file = ifcopenshell.open(str(file_path))
        
        # Get a sample of beams/columns/members
        elements = []
        for element in ifc_file.by_type("IfcProduct"):
            element_type = element.is_a()
            if element_type in {"IfcBeam", "IfcColumn", "IfcMember"}:
                elements.append(element)
                if len(elements) >= 5:  # Sample first 5
                    break
        
        debug_info = []
        for element in elements:
            element_info = {
                "id": element.id(),
                "type": element.is_a(),
                "tag": getattr(element, 'Tag', None),
                "name": getattr(element, 'Name', None),
                "extracted_profile": get_profile_name(element),
                "property_sets": {},
                "representation_info": {}
            }
            
            # Get all property sets
            try:
                psets = ifcopenshell.util.element.get_psets(element)
                for pset_name, props in psets.items():
                    element_info["property_sets"][pset_name] = dict(props)
            except Exception as e:
                element_info["property_set_error"] = str(e)
            
            # Get representation info
            try:
                if hasattr(element, "Representation") and element.Representation:
                    rep_info = []
                    for rep in element.Representation.Representations or []:
                        rep_item = {
                            "identifier": getattr(rep, "RepresentationIdentifier", None),
                            "type": getattr(rep, "RepresentationType", None),
                            "items": []
                        }
                        for item in rep.Items or []:
                            item_info = {
                                "type": item.is_a(),
                            }
                            if item.is_a("IfcExtrudedAreaSolid"):
                                if hasattr(item, "SweptArea") and item.SweptArea:
                                    swept = item.SweptArea
                                    item_info["swept_area_type"] = swept.is_a()
                                    # Get all attributes of the swept area
                                    swept_attrs = {}
                                    for attr in dir(swept):
                                        if not attr.startswith('_') and not callable(getattr(swept, attr, None)):
                                            try:
                                                value = getattr(swept, attr, None)
                                                if value is not None:
                                                    swept_attrs[attr] = str(value)
                                            except:
                                                pass
                                    item_info["swept_area_attributes"] = swept_attrs
                                    if hasattr(swept, "ProfileType"):
                                        item_info["profile_type"] = str(swept.ProfileType)
                                    if hasattr(swept, "ProfileName"):
                                        item_info["profile_name"] = str(swept.ProfileName)
                            elif item.is_a("IfcBooleanClippingResult"):
                                # Traverse FirstOperand to find the actual geometry
                                if hasattr(item, "FirstOperand"):
                                    first_op = item.FirstOperand
                                    item_info["first_operand_type"] = first_op.is_a() if first_op else None
                                    if first_op and first_op.is_a("IfcExtrudedAreaSolid"):
                                        if hasattr(first_op, "SweptArea") and first_op.SweptArea:
                                            swept = first_op.SweptArea
                                            item_info["nested_swept_area_type"] = swept.is_a()
                                            # Get all attributes
                                            swept_attrs = {}
                                            for attr in dir(swept):
                                                if not attr.startswith('_') and not callable(getattr(swept, attr, None)):
                                                    try:
                                                        value = getattr(swept, attr, None)
                                                        if value is not None:
                                                            swept_attrs[attr] = str(value)
                                                    except:
                                                        pass
                                            item_info["nested_swept_area_attributes"] = swept_attrs
                                            if hasattr(swept, "ProfileName"):
                                                item_info["nested_profile_name"] = str(swept.ProfileName)
                                            if hasattr(swept, "ProfileType"):
                                                item_info["nested_profile_type"] = str(swept.ProfileType)
                            rep_item["items"].append(item_info)
                        rep_info.append(rep_item)
                    element_info["representation_info"] = rep_info
            except Exception as e:
                element_info["representation_error"] = str(e)
            
            debug_info.append(element_info)
        
        return JSONResponse({
            "total_elements": len(list(ifc_file.by_type("IfcProduct"))),
            "sample_elements": debug_info
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Debug failed: {str(e)}")


@app.get("/api/assembly-parts/{filename}")
async def get_assembly_parts(filename: str, product_id: int = None, assembly_mark: str = None, assembly_id: int = None):
    """Get all product IDs that belong to the same assembly."""
    print(f"\n{'='*60}")
    print(f"[ASSEMBLY-PARTS] ENDPOINT CALLED!")
    print(f"[ASSEMBLY-PARTS] filename={filename}")
    print(f"[ASSEMBLY-PARTS] product_id={product_id}")
    print(f"[ASSEMBLY-PARTS] assembly_mark={assembly_mark}")
    print(f"[ASSEMBLY-PARTS] assembly_id={assembly_id}")
    print(f"{'='*60}\n")
    
    from urllib.parse import unquote
    decoded_filename = unquote(filename)
    file_path = IFC_DIR / decoded_filename
    
    print(f"[ASSEMBLY-PARTS] Decoded filename: {decoded_filename}")
    print(f"[ASSEMBLY-PARTS] File path: {file_path}")
    print(f"[ASSEMBLY-PARTS] File exists: {file_path.exists()}")
    
    if not file_path.exists():
        print(f"[ASSEMBLY-PARTS] ERROR: File not found!")
        raise HTTPException(status_code=404, detail="IFC file not found")
    
    try:
        print(f"[ASSEMBLY-PARTS] Opening IFC file...")
        ifc_file = ifcopenshell.open(str(file_path))
        print(f"[ASSEMBLY-PARTS] IFC file opened successfully")
        product_ids = []
        
        print(f"[ASSEMBLY-PARTS] Request: product_id={product_id}, assembly_mark={assembly_mark}, assembly_id={assembly_id}")
        
        # If assembly_id is provided, find all parts in that assembly
        if assembly_id is not None:
            try:
                assembly = ifc_file.by_id(assembly_id)
                print(f"[ASSEMBLY-PARTS] Found assembly object: {assembly.is_a() if assembly else 'None'}")
                if assembly and assembly.is_a('IfcElementAssembly'):
                    # Find all parts aggregated by this assembly
                    for rel in ifc_file.by_type("IfcRelAggregates"):
                        if rel.RelatingObject.id() == assembly_id:
                            print(f"[ASSEMBLY-PARTS] Found IfcRelAggregates with {len(rel.RelatedObjects)} parts")
                            for part in rel.RelatedObjects:
                                if part.is_a("IfcProduct"):
                                    product_ids.append(part.id())
            except Exception as e:
                print(f"[ASSEMBLY-PARTS] Error with assembly_id: {e}")
        
        # If product_id is provided, find the assembly it belongs to
        elif product_id is not None:
            try:
                product = ifc_file.by_id(product_id)
                print(f"[ASSEMBLY-PARTS] Found product: {product.is_a() if product else 'None'}")
                
                # First, check if there are any IfcElementAssembly objects in the file
                assemblies = ifc_file.by_type("IfcElementAssembly")
                print(f"[ASSEMBLY-PARTS] Found {len(assemblies)} IfcElementAssembly objects in file")
                
                # Find the assembly this product belongs to via IfcRelAggregates
                if hasattr(product, 'Decomposes'):
                    print(f"[ASSEMBLY-PARTS] Product has Decomposes attribute, checking relationships...")
                    decomposes_list = product.Decomposes or []
                    print(f"[ASSEMBLY-PARTS] Found {len(decomposes_list)} Decomposes relationships")
                    
                    for rel in decomposes_list:
                        print(f"[ASSEMBLY-PARTS] Checking relationship: {rel.is_a()}")
                        if rel.is_a('IfcRelAggregates'):
                            assembly = rel.RelatingObject
                            print(f"[ASSEMBLY-PARTS] Found assembly via IfcRelAggregates: {assembly.is_a() if assembly else 'None'}, ID: {assembly.id() if assembly else 'None'}")
                            if assembly:
                                assembly_id = assembly.id()
                                # Now find all parts in this assembly
                                for rel2 in ifc_file.by_type("IfcRelAggregates"):
                                    if rel2.RelatingObject.id() == assembly_id:
                                        print(f"[ASSEMBLY-PARTS] Found {len(rel2.RelatedObjects)} parts in assembly {assembly_id}")
                                        for part in rel2.RelatedObjects:
                                            if part.is_a("IfcProduct"):
                                                product_ids.append(part.id())
                                break
                    else:
                        print(f"[ASSEMBLY-PARTS] No IfcRelAggregates found in Decomposes")
                else:
                    print(f"[ASSEMBLY-PARTS] Product does not have Decomposes attribute")
                
                # If no assembly found via relationships, try to find by checking all assemblies
                # and see which one contains this product
                if len(product_ids) == 0 and len(assemblies) > 0:
                    print(f"[ASSEMBLY-PARTS] Checking all {len(assemblies)} assemblies to find which contains product {product_id}...")
                    for assembly in assemblies:
                        # Check if this product is part of this assembly
                        for rel in ifc_file.by_type("IfcRelAggregates"):
                            if rel.RelatingObject.id() == assembly.id():
                                related_ids = [p.id() for p in rel.RelatedObjects if p.is_a("IfcProduct")]
                                if product_id in related_ids:
                                    print(f"[ASSEMBLY-PARTS] Found product {product_id} in assembly {assembly.id()} ({assembly.is_a()})")
                                    # Get all parts in this assembly
                                    for part in rel.RelatedObjects:
                                        if part.is_a("IfcProduct"):
                                            product_ids.append(part.id())
                                    print(f"[ASSEMBLY-PARTS] Assembly {assembly.id()} contains {len(product_ids)} parts")
                                    break
                        if len(product_ids) > 0:
                            break
                    
                # Check Tekla-specific property sets for assembly grouping
                # Look for the actual assembly name (like "B1", "B2") not the GUID
                if len(product_ids) == 0:
                    print(f"[ASSEMBLY-PARTS] Checking Tekla property sets for actual assembly name...")
                    try:
                        psets = ifcopenshell.util.element.get_psets(product)
                        
                        # Look for assembly name in various property sets
                        # We need to find the REAL assembly name (like "B1"), not the GUID
                        assembly_name = None
                        
                        # First, print all property sets to see what's available
                        print(f"[ASSEMBLY-PARTS] All property sets for product {product_id}:")
                        for pset_name, props in psets.items():
                            print(f"[ASSEMBLY-PARTS]   {pset_name}: {list(props.keys())}")
                        
                        # Check all property sets for assembly-related fields
                        # Look for values that look like assembly names (B1, B2, etc.) not GUIDs
                        # Also check ALL property values, not just keys with "assembly" in them
                        all_property_values = []
                        
                        for pset_name, props in psets.items():
                            for key, value in props.items():
                                if value is not None and str(value).strip():
                                    value_str = str(value).strip()
                                    # Skip GUIDs, N/A, empty values
                                    if value_str.upper() in ['NONE', 'NULL', 'N/A', '']:
                                        continue
                                    # Skip GUIDs (start with "ID" and have dashes and are long)
                                    if value_str.startswith('ID') and '-' in value_str and len(value_str) > 20:
                                        continue
                                    # Skip if it's clearly a part reference (like "b31")
                                    if value_str.lower().startswith('b') and len(value_str) <= 4 and value_str[1:].isdigit():
                                        continue
                                    # Skip numeric-only values
                                    if value_str.isdigit():
                                        continue
                                    # Skip very long values (likely not assembly names)
                                    if len(value_str) > 50:
                                        continue
                                    
                                    all_property_values.append((pset_name, key, value_str))
                                    
                                    # Check if this key suggests it's an assembly name
                                    key_lower = key.lower()
                                    if any(word in key_lower for word in ['assembly', 'mark', 'group', 'name']):
                                        # This might be the assembly name
                                        # Check if it looks like an assembly name (B1, B2, etc. or longer names)
                                        if len(value_str) >= 1 and len(value_str) <= 20:
                                            # Prefer values that look like assembly names (B1, B2, etc.)
                                            if (value_str[0].isalpha() and len(value_str) <= 10) or value_str.upper().startswith('B'):
                                                assembly_name = value_str
                                                print(f"[ASSEMBLY-PARTS] Found potential assembly name in {pset_name}.{key}: {assembly_name}")
                                                break
                            if assembly_name:
                                break
                        
                        # Also check Name and Tag fields directly (might contain assembly name)
                        if not assembly_name:
                            name = getattr(product, 'Name', None)
                            if name:
                                name_str = str(name).strip()
                                # Check if Name looks like an assembly name (not a GUID, not empty)
                                if (name_str and name_str.upper() not in ['NONE', 'NULL', 'N/A', 'BEAM', 'COLUMN', 'MEMBER', 'PLATE'] and
                                    not name_str.startswith('ID') and len(name_str) <= 20):
                                    # Check if it's not just the element type
                                    if name_str[0].isalpha():
                                        assembly_name = name_str
                                        print(f"[ASSEMBLY-PARTS] Found potential assembly name in Name field: {assembly_name}")
                        
                        # If still not found, check if there's a pattern in other property values
                        # Maybe the assembly name is in a field we haven't checked yet
                        if not assembly_name:
                            print(f"[ASSEMBLY-PARTS] No clear assembly name found. All property values:")
                            for pset_name, key, value_str in all_property_values:
                                print(f"[ASSEMBLY-PARTS]   {pset_name}.{key} = {value_str}")
                            
                            # Try to find assembly name by checking other products with similar properties
                            # Maybe the assembly name is stored in a way that requires cross-referencing
                            print(f"[ASSEMBLY-PARTS] Checking other products to find assembly pattern...")
                            
                            # Sample a few other products to see if there's a common field
                            sample_products = []
                            for other_product in ifc_file.by_type("IfcProduct"):
                                if other_product.id() != product_id and other_product.is_a() in ["IfcBeam", "IfcColumn", "IfcMember"]:
                                    sample_products.append(other_product)
                                    if len(sample_products) >= 5:
                                        break
                            
                            # Compare property sets to find common assembly-related values
                            for sample_product in sample_products:
                                try:
                                    sample_psets = ifcopenshell.util.element.get_psets(sample_product)
                                    # Check if there's a field that might contain assembly name
                                    for pset_name, props in sample_psets.items():
                                        for key, value in props.items():
                                            if value and str(value).strip():
                                                value_str = str(value).strip()
                                                # Look for values that look like assembly names
                                                if (value_str[0].isalpha() and len(value_str) <= 10 and 
                                                    not value_str.startswith('ID') and 
                                                    not (value_str.lower().startswith('b') and len(value_str) <= 4 and value_str[1:].isdigit())):
                                                    # This might be an assembly name - check if it exists in our product too
                                                    if pset_name in psets and key in psets[pset_name]:
                                                        if str(psets[pset_name][key]).strip() == value_str:
                                                            assembly_name = value_str
                                                            print(f"[ASSEMBLY-PARTS] Found potential assembly name by comparing with product {sample_product.id()}: {assembly_name} in {pset_name}.{key}")
                                                            break
                                        if assembly_name:
                                            break
                                    if assembly_name:
                                        break
                                except:
                                    pass
                        
                        # If still not found, check if there's a pattern in the GUID
                        # Maybe the assembly name is encoded somewhere else
                        if not assembly_name:
                            print(f"[ASSEMBLY-PARTS] No clear assembly name found in property sets")
                            print(f"[ASSEMBLY-PARTS] Tag: {getattr(product, 'Tag', None)}")
                            print(f"[ASSEMBLY-PARTS] Name: {getattr(product, 'Name', None)}")
                            
                            # Try to find assembly name by checking if there's an IfcElementAssembly
                            # that might have a name, even if not linked via relationships
                            # This is a last resort
                            tag = getattr(product, 'Tag', None)
                            if tag:
                                tag_str = str(tag).strip()
                                # If tag is a GUID, we can't use it
                                # But maybe we can find the assembly by searching for assembly objects
                                # that might reference this part somehow
                                pass
                        
                        # Group by assembly name if found
                        if assembly_name:
                            print(f"[ASSEMBLY-PARTS] Grouping by assembly name: {assembly_name}")
                            all_products = ifc_file.by_type("IfcProduct")
                            
                            for other_product in all_products:
                                if other_product.id() == product_id:
                                    continue  # Skip the clicked product
                                
                                try:
                                    other_psets = ifcopenshell.util.element.get_psets(other_product)
                                    
                                    # Check if this product has the same assembly name
                                    # Use the same logic as we used to find the assembly_name
                                    other_assembly_name = None
                                    
                                    for other_pset_name, other_props in other_psets.items():
                                        for key, value in other_props.items():
                                            if value and str(value).strip():
                                                value_str = str(value).strip()
                                                # Skip GUIDs, N/A, empty values
                                                if value_str.upper() in ['NONE', 'NULL', 'N/A', '']:
                                                    continue
                                                # Skip GUIDs
                                                if value_str.startswith('ID') and '-' in value_str and len(value_str) > 20:
                                                    continue
                                                # Skip part references (like "b31")
                                                if value_str.lower().startswith('b') and len(value_str) <= 4 and value_str[1:].isdigit():
                                                    continue
                                                
                                                # Check if this key suggests it's an assembly name
                                                key_lower = key.lower()
                                                if any(word in key_lower for word in ['assembly', 'mark', 'group']):
                                                    if len(value_str) >= 1 and len(value_str) <= 20:
                                                        other_assembly_name = value_str
                                                        break
                                        if other_assembly_name:
                                            break
                                    
                                    # If assembly names match, add to group
                                    if other_assembly_name and other_assembly_name == assembly_name:
                                        product_ids.append(other_product.id())
                                        print(f"[ASSEMBLY-PARTS] Found product {other_product.id()} ({other_product.is_a()}) with same assembly name: {assembly_name}")
                                
                                except Exception as e:
                                    print(f"[ASSEMBLY-PARTS] Error checking product {other_product.id()}: {e}")
                            
                            if len(product_ids) > 0:
                                print(f"[ASSEMBLY-PARTS] Grouped {len(product_ids)} products by assembly name: {assembly_name}")
                                product_ids.append(product_id)  # Include the clicked product
                                print(f"[ASSEMBLY-PARTS] Total products in assembly: {len(product_ids)}")
                            else:
                                print(f"[ASSEMBLY-PARTS] No other products found with assembly name: {assembly_name}")
                                # Still add the clicked product
                                product_ids.append(product_id)
                        else:
                            print(f"[ASSEMBLY-PARTS] Could not find assembly name (only found GUIDs)")
                            print(f"[ASSEMBLY-PARTS] IFC file may not contain proper assembly names, or they are stored in a format we don't recognize.")
                            print(f"[ASSEMBLY-PARTS] Returning only the clicked part {product_id}.")
                            product_ids.append(product_id)
                    
                    except Exception as e:
                        import traceback
                        print(f"[ASSEMBLY-PARTS] Error checking property sets: {e}")
                        traceback.print_exc()
                
                # Last resort: Since assembly marks are unique GUIDs and no relationships exist,
                # we cannot determine which parts belong to the same assembly.
                # Return only the clicked part as a fallback.
                if len(product_ids) == 0:
                    print(f"[ASSEMBLY-PARTS] WARNING: No assembly relationships found in IFC file.")
                    print(f"[ASSEMBLY-PARTS] IFC file appears to lack IfcRelAggregates relationships.")
                    print(f"[ASSEMBLY-PARTS] Each part has a unique assembly mark (GUID), so grouping is not possible.")
                    print(f"[ASSEMBLY-PARTS] Returning only the clicked part {product_id}.")
                    product_ids.append(product_id)  # Return only the clicked part
                    
            except Exception as e:
                import traceback
                print(f"[ASSEMBLY-PARTS] Error finding assembly for product {product_id}: {e}")
                traceback.print_exc()
        
        # If assembly_mark is provided, find all products with that mark
        elif assembly_mark:
            print(f"[ASSEMBLY-PARTS] Searching by assembly_mark: {assembly_mark}")
            # This is a fallback - find all products with the same assembly mark
            # But this might not work if marks are unique GUIDs
            products = ifc_file.by_type("IfcProduct")
            for product in products:
                mark, _ = get_assembly_info(product)
                if mark == assembly_mark:
                    product_ids.append(product.id())
            print(f"[ASSEMBLY-PARTS] Found {len(product_ids)} products with assembly_mark {assembly_mark}")
        
        print(f"[ASSEMBLY-PARTS] Returning {len(product_ids)} product IDs: {product_ids[:10]}...")  # Show first 10
        
        return JSONResponse({
            "product_ids": product_ids,
            "count": len(product_ids)
        })
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get assembly parts: {str(e)}")


@app.get("/api/element-full/{element_id}")
async def get_element_full(element_id: int, filename: str):
    """Get full element data for a specific product or assembly."""
    from urllib.parse import unquote
    decoded_filename = unquote(filename)
    file_path = IFC_DIR / decoded_filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="IFC file not found")
    
    try:
        print(f"[ELEMENT-FULL] Opening IFC file: {file_path}")
        ifc_file = ifcopenshell.open(str(file_path))
        print(f"[ELEMENT-FULL] IFC file opened successfully, looking for entity ID: {element_id}")
        
        # Try to get entity by ID
        try:
            entity = ifc_file.by_id(element_id)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Entity with ID {element_id} not found: {str(e)}")
        
        element_type = entity.is_a()
        
        # Get basic attributes
        basic_attributes = {
            "Name": getattr(entity, 'Name', None) or '',
            "Tag": getattr(entity, 'Tag', None) or '',
            "Description": getattr(entity, 'Description', None) or ''
        }
        
        # Get property sets
        property_sets = {}
        try:
            psets = ifcopenshell.util.element.get_psets(entity)
            property_sets = {name: dict(props) for name, props in psets.items()}
        except Exception as e:
            print(f"[ELEMENT-FULL] Error getting property sets: {e}")
        
        # Get relationships (parts if it's an assembly)
        relationships = {"parts": []}
        
        # If this is an assembly (IfcElementAssembly), get its parts
        if element_type == "IfcElementAssembly":
            try:
                # Find all products that are aggregated by this assembly
                for rel in ifc_file.by_type("IfcRelAggregates"):
                    if rel.RelatingObject.id() == element_id:
                        for related_obj in rel.RelatedObjects:
                            if related_obj.is_a("IfcProduct"):
                                part_info = {
                                    "id": related_obj.id(),
                                    "type": related_obj.is_a(),
                                    "tag": getattr(related_obj, 'Tag', None) or '',
                                    "name": getattr(related_obj, 'Name', None) or ''
                                }
                                relationships["parts"].append(part_info)
            except Exception as e:
                print(f"[ELEMENT-FULL] Error getting assembly parts: {e}")
        
        return JSONResponse({
            "basic_attributes": basic_attributes,
            "property_sets": property_sets,
            "relationships": relationships,
            "element_type": element_type,
            "element_id": element_id
        })
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get element data: {str(e)}")


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}

