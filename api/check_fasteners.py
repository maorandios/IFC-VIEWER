#!/usr/bin/env python3
"""Script to check fasteners in IFC file"""
import sys
from pathlib import Path
import ifcopenshell
import ifcopenshell.util.element

ifc_path = Path("../storage/ifc/out2.ifc")
if not ifc_path.exists():
    ifc_path = Path("storage/ifc/out2.ifc")

ifc_file = ifcopenshell.open(str(ifc_path))
all_products = ifc_file.by_type("IfcProduct")

print(f"Total products: {len(all_products)}\n")

# Check for standard fastener types
fastener_types = {"IfcFastener", "IfcMechanicalFastener"}
standard_fasteners = [p for p in all_products if p.is_a() in fastener_types]
print(f"Standard fastener entities: {len(standard_fasteners)}")

# Check for elements with fastener keywords
fastener_keywords = ['bolt', 'nut', 'washer', 'fastener', 'screw', 'anchor', 'mechanical']
found_by_keyword = []
for p in all_products:
    name = (getattr(p, 'Name', None) or '').lower()
    desc = (getattr(p, 'Description', None) or '').lower()
    tag = (getattr(p, 'Tag', None) or '').lower()
    text = name + ' ' + desc + ' ' + tag
    if any(kw in text for kw in fastener_keywords):
        found_by_keyword.append(p)

print(f"Elements with fastener keywords: {len(found_by_keyword)}")
if found_by_keyword:
    print("\nFirst 5 examples:")
    for p in found_by_keyword[:5]:
        print(f"  ID {p.id()}: {p.is_a()}, Name='{getattr(p, 'Name', None)}', Desc='{getattr(p, 'Description', None)}', Tag='{getattr(p, 'Tag', None)}'")

# Check for property sets
found_by_pset = []
for p in all_products[:200]:  # Check first 200
    try:
        psets = ifcopenshell.util.element.get_psets(p)
        for pset_name in psets.keys():
            if 'bolt' in pset_name.lower() or 'fastener' in pset_name.lower():
                found_by_pset.append((p, pset_name))
                break
    except:
        pass

print(f"\nElements with fastener property sets: {len(found_by_pset)}")
if found_by_pset:
    print("\nFirst 5 examples:")
    for p, pset in found_by_pset[:5]:
        print(f"  ID {p.id()}: {p.is_a()}, PSet: {pset}")

# Check weights
print("\n\nChecking weights for detected fasteners:")
all_detected = list(set([p for p, _ in found_by_pset] + found_by_keyword + standard_fasteners))
print(f"Total unique fasteners detected: {len(all_detected)}")

for p in all_detected[:10]:
    try:
        psets = ifcopenshell.util.element.get_psets(p)
        weight = None
        for pset_name, props in psets.items():
            for key in ["Weight", "NetWeight", "Mass"]:
                if key in props:
                    weight = props[key]
                    print(f"  ID {p.id()}: Weight from {pset_name}.{key} = {weight}")
                    break
            if weight:
                break
        if not weight:
            print(f"  ID {p.id()}: No weight found")
    except Exception as e:
        print(f"  ID {p.id()}: Error - {e}")


















