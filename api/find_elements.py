#!/usr/bin/env python3
"""Find specific elements in IFC file"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from main import IFC_DIR
import ifcopenshell

filename = "out3.ifc"
file_path = IFC_DIR / filename

ifc_file = ifcopenshell.open(str(file_path))
products = ifc_file.by_type("IfcProduct")

print("Searching for elements with 'b38' or 'b39' in any field...")
print("=" * 60)

found = []
for product in products:
    product_id = product.id()
    name = str(getattr(product, 'Name', None) or '')
    tag = str(getattr(product, 'Tag', None) or '')
    desc = str(getattr(product, 'Description', None) or '')
    element_type = product.is_a()
    
    search_text = f"{name} {tag} {desc}".lower()
    if 'b38' in search_text or 'b39' in search_text:
        found.append((product_id, name, tag, desc, element_type))
        print(f"ID {product_id}: Name='{name}', Tag='{tag}', Desc='{desc}', Type={element_type}")

if not found:
    print("\nNot found. Listing all beams with tags starting with 'b':")
    for product in products:
        if product.is_a() == 'IfcBeam':
            tag = str(getattr(product, 'Tag', None) or '')
            if tag.lower().startswith('b'):
                product_id = product.id()
                name = str(getattr(product, 'Name', None) or '')
                desc = str(getattr(product, 'Description', None) or '')
                print(f"ID {product_id}: Name='{name}', Tag='{tag}', Desc='{desc}'")















