#!/usr/bin/env python3
"""Check for hole-only bolts (Bolt count = 0)"""
import ifcopenshell
import ifcopenshell.util.element
from pathlib import Path

ifc_path = Path("../storage/ifc/Mulan_-_Sloped_Gal_25.01_R4_-_U400.ifc")
if not ifc_path.exists():
    ifc_path = Path("storage/ifc/Mulan_-_Sloped_Gal_25.01_R4_-_U400.ifc")

ifc_file = ifcopenshell.open(str(ifc_path))
fasteners = ifc_file.by_type('IfcMechanicalFastener')

print(f"Total IfcMechanicalFastener elements: {len(fasteners)}\n")

zero_count_bolts = []
actual_bolts = []

for f in fasteners:
    try:
        psets = ifcopenshell.util.element.get_psets(f)
        tekla_bolt = psets.get('Tekla Bolt', {})
        bolt_count = tekla_bolt.get('Bolt count', 1)
        
        if bolt_count == 0:
            zero_count_bolts.append({
                'id': f.id(),
                'name': f.Name,
                'bolt_count': bolt_count,
                'tekla': tekla_bolt
            })
        else:
            actual_bolts.append({
                'id': f.id(),
                'name': f.Name,
                'bolt_count': bolt_count
            })
    except:
        pass

print(f"Bolts with count = 0 (hole only): {len(zero_count_bolts)}")
print(f"Bolts with count > 0 (actual bolts): {len(actual_bolts)}")

print(f"\n{'='*80}")
print("HOLE-ONLY BOLTS (Bolt count = 0)")
print(f"{'='*80}\n")

if zero_count_bolts:
    for bolt in zero_count_bolts[:5]:
        print(f"ID: {bolt['id']}")
        print(f"Name: {bolt['name']}")
        print(f"Bolt count: {bolt['bolt_count']}")
        print(f"Bolt Name: {bolt['tekla'].get('Bolt Name', 'N/A')}")
        print(f"Bolt size: {bolt['tekla'].get('Bolt size', 'N/A')}")
        print(f"Bolt length: {bolt['tekla'].get('Bolt length', 'N/A')}")
        print(f"Bolt standard: {bolt['tekla'].get('Bolt standard', 'N/A')}")
        print()
else:
    print("No hole-only bolts found!")

print(f"\n{'='*80}")
print("ACTUAL BOLTS (Bolt count > 0)")
print(f"{'='*80}\n")

if actual_bolts:
    for bolt in actual_bolts[:5]:
        print(f"ID: {bolt['id']}, Name: {bolt['name']}, Bolt count: {bolt['bolt_count']}")
else:
    print("No actual bolts found!")

print(f"\n{'='*80}")
print("RECOMMENDATION")
print(f"{'='*80}\n")

if zero_count_bolts:
    print(f"[YES] Filter needed!")
    print(f"Found {len(zero_count_bolts)} hole-only bolts that should be filtered out.")
    print(f"Add filter: Bolt count > 0 to exclude holes from Bolts tab.")
else:
    print(f"[NO] No filter needed!")
    print(f"All bolts have Bolt count > 0.")

