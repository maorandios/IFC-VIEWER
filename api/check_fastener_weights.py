#!/usr/bin/env python3
"""Check fastener weights in Tekla Bolt property set"""
import sys
from pathlib import Path
import ifcopenshell
import ifcopenshell.util.element

ifc_path = Path("../storage/ifc/out2.ifc")
if not ifc_path.exists():
    ifc_path = Path("storage/ifc/out2.ifc")

ifc_file = ifcopenshell.open(str(ifc_path))
all_products = ifc_file.by_type("IfcProduct")

fastener_types = {"IfcFastener", "IfcMechanicalFastener"}
fasteners = [p for p in all_products if p.is_a() in fastener_types]

print(f"Found {len(fasteners)} fasteners\n")

# Check first few fasteners in detail
for fastener in fasteners[:5]:
    print(f"\nFastener ID {fastener.id()}:")
    print(f"  Type: {fastener.is_a()}")
    print(f"  Name: {getattr(fastener, 'Name', None)}")
    print(f"  Description: {getattr(fastener, 'Description', None)}")
    print(f"  Tag: {getattr(fastener, 'Tag', None)}")
    
    try:
        psets = ifcopenshell.util.element.get_psets(fastener)
        print(f"  Property Sets: {list(psets.keys())}")
        
        # Check Tekla Bolt property set
        if "Tekla Bolt" in psets:
            print(f"  Tekla Bolt properties:")
            for key, value in psets["Tekla Bolt"].items():
                print(f"    {key}: {value}")
        
        # Check BaseQuantities
        if "BaseQuantities" in psets:
            print(f"  BaseQuantities properties:")
            for key, value in psets["BaseQuantities"].items():
                print(f"    {key}: {value}")
        
        # Check all property sets for weight-related keys
        print(f"  All weight-related properties:")
        for pset_name, props in psets.items():
            for key in props.keys():
                key_lower = key.lower()
                if 'weight' in key_lower or 'mass' in key_lower:
                    print(f"    {pset_name}.{key}: {props[key]}")
    except Exception as e:
        print(f"  Error: {e}")


















