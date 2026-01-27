#!/usr/bin/env python3
"""Analyze bolt/fastener data available in IFC files"""
import sys
from pathlib import Path
import ifcopenshell
import ifcopenshell.util.element

# Test with the currently loaded file
ifc_path = Path("../storage/ifc/Mulan_-_Sloped_Gal_25.01_R4_-_U400.ifc")
if not ifc_path.exists():
    ifc_path = Path("storage/ifc/Mulan_-_Sloped_Gal_25.01_R4_-_U400.ifc")

if not ifc_path.exists():
    print("ERROR: Test IFC file not found!")
    sys.exit(1)

print(f"Analyzing: {ifc_path.name}\n")
print("=" * 80)

ifc_file = ifcopenshell.open(str(ifc_path))
all_products = ifc_file.by_type("IfcProduct")

# Find all fasteners
fastener_types = {"IfcFastener", "IfcMechanicalFastener"}
standard_fasteners = [p for p in all_products if p.is_a() in fastener_types]

print(f"\n1. STANDARD IFC FASTENERS (IfcFastener, IfcMechanicalFastener)")
print(f"   Found: {len(standard_fasteners)} fasteners")

if standard_fasteners:
    print(f"\n   Analyzing first 3 fasteners in detail:")
    print("   " + "-" * 76)
    
    for i, fastener in enumerate(standard_fasteners[:3], 1):
        print(f"\n   Fastener #{i} (ID: {fastener.id()})")
        print(f"   Type: {fastener.is_a()}")
        print(f"   Name: {getattr(fastener, 'Name', None)}")
        print(f"   Description: {getattr(fastener, 'Description', None)}")
        print(f"   Tag: {getattr(fastener, 'Tag', None)}")
        
        try:
            psets = ifcopenshell.util.element.get_psets(fastener)
            print(f"   Property Sets: {list(psets.keys())}")
            
            # Check for Tekla Bolt property set
            if "Tekla Bolt" in psets:
                print(f"\n   [OK] Tekla Bolt Properties:")
                for key, value in psets["Tekla Bolt"].items():
                    print(f"      - {key}: {value}")
            
            # Check for common properties
            for pset_name, props in psets.items():
                for key in ['Weight', 'NetWeight', 'Mass', 'Size', 'Diameter', 'Length', 'Grade', 'Material', 'Standard']:
                    if key in props:
                        print(f"      - {pset_name}.{key}: {props[key]}")
            
            # Get assembly info
            for pset_name, props in psets.items():
                if 'ASSEMBLY_POS' in props:
                    print(f"      - Assembly: {props['ASSEMBLY_POS']}")
                    break
        except Exception as e:
            print(f"   ERROR: {e}")

# Check for fastener-like elements by name
fastener_keywords = ['bolt', 'nut', 'washer', 'fastener', 'screw', 'anchor']
found_by_name = []

for p in all_products:
    name = (getattr(p, 'Name', None) or '').lower()
    desc = (getattr(p, 'Description', None) or '').lower()
    tag = (getattr(p, 'Tag', None) or '').lower()
    text = name + ' ' + desc + ' ' + tag
    if any(kw in text for kw in fastener_keywords):
        found_by_name.append(p)

print(f"\n\n2. ELEMENTS WITH FASTENER KEYWORDS IN NAME/TAG/DESCRIPTION")
print(f"   Found: {len(found_by_name)} elements")

if found_by_name:
    print(f"\n   First 3 examples:")
    print("   " + "-" * 76)
    for i, p in enumerate(found_by_name[:3], 1):
        print(f"\n   Element #{i} (ID: {p.id()})")
        print(f"   Type: {p.is_a()}")
        print(f"   Name: {getattr(p, 'Name', None)}")
        print(f"   Tag: {getattr(p, 'Tag', None)}")

# Check for property sets with fastener info
found_by_pset = []
print(f"\n\n3. CHECKING FOR FASTENER PROPERTY SETS...")
print(f"   Scanning first 500 elements...")

for p in all_products[:500]:
    try:
        psets = ifcopenshell.util.element.get_psets(p)
        for pset_name in psets.keys():
            if 'bolt' in pset_name.lower() or 'fastener' in pset_name.lower():
                found_by_pset.append((p, pset_name))
                break
    except:
        pass

print(f"   Found: {len(found_by_pset)} elements with bolt/fastener property sets")

if found_by_pset:
    print(f"\n   First 3 examples:")
    print("   " + "-" * 76)
    for i, (p, pset_name) in enumerate(found_by_pset[:3], 1):
        print(f"\n   Element #{i} (ID: {p.id()})")
        print(f"   Type: {p.is_a()}")
        print(f"   Property Set: {pset_name}")
        try:
            psets = ifcopenshell.util.element.get_psets(p)
            if pset_name in psets:
                print(f"   Properties:")
                for key, value in psets[pset_name].items():
                    print(f"      - {key}: {value}")
        except:
            pass

# Summary
print("\n\n" + "=" * 80)
print("SUMMARY - BOLT DATA AVAILABILITY:")
print("=" * 80)

all_fasteners = list(set(standard_fasteners + found_by_name + [p for p, _ in found_by_pset]))
print(f"\nTotal unique fasteners/bolts detected: {len(all_fasteners)}")

if all_fasteners:
    print("\n[YES] BOLT TAB IS FEASIBLE!")
    print("\nData that can be collected for each bolt:")
    print("  - Bolt Name/Type (from Name, Tag, or Description)")
    print("  - Bolt Size/Diameter (from property sets)")
    print("  - Bolt Standard (from Tekla Bolt properties)")
    print("  - Quantity (count of identical bolts)")
    print("  - Assembly assignment")
    print("  - Weight (if available in property sets)")
    print("  - Length (if available)")
    print("  - Material/Grade (if available)")
else:
    print("\n[NO] NO BOLTS FOUND IN THIS FILE")
    print("  This file may not contain bolt data, or bolts are not exported.")

print("\n" + "=" * 80)

