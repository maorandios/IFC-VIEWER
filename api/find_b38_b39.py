#!/usr/bin/env python3
"""Find b38 and b39 elements"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from main import IFC_DIR
import ifcopenshell

filename = "out3.ifc"
file_path = IFC_DIR / filename

ifc_file = ifcopenshell.open(str(file_path))
products = ifc_file.by_type("IfcProduct")

print("All elements with 'b' followed by numbers in Tag:")
for product in products:
    tag = str(getattr(product, 'Tag', None) or '')
    if tag and len(tag) >= 2 and tag[0].lower() == 'b' and tag[1:].isdigit():
        product_id = product.id()
        name = str(getattr(product, 'Name', None) or '')
        desc = str(getattr(product, 'Description', None) or '')
        element_type = product.is_a()
        print(f"ID {product_id}: Tag='{tag}', Name='{name}', Desc='{desc}', Type={element_type}")















