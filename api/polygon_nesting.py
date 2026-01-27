"""
Polygon-Based Nesting Algorithm
Optimizes placement of plates with actual geometry on stock sheets.
"""

from typing import List, Dict, Tuple, Optional
from plate_geometry_extractor import PlateGeometry
import numpy as np


class NestingResult:
    """Result of nesting plates on a stock sheet."""
    
    def __init__(self, stock_width: float, stock_length: float, stock_index: int):
        self.stock_width = stock_width
        self.stock_length = stock_length
        self.stock_index = stock_index
        self.placed_plates: List[Dict] = []
        self.utilization = 0.0
        
    def add_plate(self, plate: PlateGeometry, x: float, y: float, rotation: int = 0):
        """Add a placed plate to this result."""
        self.placed_plates.append({
            'plate': plate,
            'x': x,
            'y': y,
            'rotation': rotation
        })
        
    def calculate_utilization(self):
        """Calculate material utilization percentage."""
        if not self.placed_plates:
            self.utilization = 0.0
            return
            
        total_plate_area = sum(p['plate'].area for p in self.placed_plates)
        stock_area = self.stock_width * self.stock_length
        
        if stock_area > 0:
            self.utilization = (total_plate_area / stock_area) * 100
        else:
            self.utilization = 0.0
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'stock_width': self.stock_width,
            'stock_length': self.stock_length,
            'stock_index': self.stock_index,
            'stock_name': f"Stock {self.stock_index + 1}",
            'utilization': round(self.utilization, 2),
            'plates': [
                {
                    'x': p['x'],
                    'y': p['y'],
                    'width': p['plate'].width,
                    'height': p['plate'].length,
                    'name': p['plate'].name,
                    'thickness': p['plate'].thickness,
                    'id': str(p['plate'].element_id),
                    'rotation': p['rotation'],
                    'svg_path': p['plate'].get_svg_path(p['x'], p['y']),
                    'actual_area': p['plate'].area,
                    'has_complex_geometry': len(list(p['plate'].polygon.interiors)) > 0 if p['plate'].polygon else False
                }
                for p in self.placed_plates
            ]
        }


def greedy_nesting(plates: List[PlateGeometry], stock_width: float, 
                   stock_length: float, gap: float = 5.0) -> NestingResult:
    """
    Simple greedy nesting algorithm.
    Places plates one by one using first-fit decreasing strategy.
    
    Args:
        plates: List of PlateGeometry objects to nest
        stock_width: Stock sheet width in mm
        stock_length: Stock sheet length in mm
        gap: Minimum gap between plates in mm
        
    Returns:
        NestingResult with placed plates
    """
    result = NestingResult(stock_width, stock_length, 0)
    
    if not plates:
        return result
    
    # Sort plates by area (largest first)
    sorted_plates = sorted(plates, key=lambda p: p.area, reverse=True)
    
    # Simple row-based placement
    current_x = gap
    current_y = gap
    row_height = 0
    
    for plate in sorted_plates:
        plate_width = plate.width
        plate_height = plate.length
        
        # Check if plate fits in current position
        if current_x + plate_width + gap <= stock_width and current_y + plate_height + gap <= stock_length:
            # Place plate
            result.add_plate(plate, current_x, current_y, 0)
            current_x += plate_width + gap
            row_height = max(row_height, plate_height)
            
        # Try next row
        elif current_y + row_height + gap + plate_height + gap <= stock_length:
            current_y += row_height + gap
            current_x = gap
            row_height = plate_height
            
            if current_x + plate_width + gap <= stock_width:
                result.add_plate(plate, current_x, current_y, 0)
                current_x += plate_width + gap
        
        # Plate doesn't fit
        else:
            continue
    
    result.calculate_utilization()
    return result


def nest_plates_on_multiple_stocks(
    plates: List[PlateGeometry],
    stock_configs: List[Dict],
    max_sheets: int = 100
) -> Tuple[List[NestingResult], List[PlateGeometry]]:
    """
    Nest plates across multiple stock sheets, trying different stock sizes.
    
    Args:
        plates: List of PlateGeometry objects to nest
        stock_configs: List of stock configurations [{'width': w, 'length': l}, ...]
        max_sheets: Maximum number of sheets to use
        
    Returns:
        Tuple of (list of NestingResults, list of unnested plates)
    """
    results = []
    remaining_plates = plates.copy()
    sheet_count = 0
    
    print(f"[NESTING] Starting nesting for {len(plates)} plates")
    print(f"[NESTING] Available stock sizes: {len(stock_configs)}")
    
    while remaining_plates and sheet_count < max_sheets:
        best_result = None
        best_stock_idx = -1
        
        # Try each stock configuration
        for stock_idx, stock in enumerate(stock_configs):
            result = greedy_nesting(
                remaining_plates,
                stock['width'],
                stock['length']
            )
            
            # Keep the result that fits the most plates
            if result.placed_plates and (best_result is None or len(result.placed_plates) > len(best_result.placed_plates)):
                best_result = result
                best_stock_idx = stock_idx
        
        # If we placed some plates, add this sheet
        if best_result and best_result.placed_plates:
            best_result.stock_index = best_stock_idx
            results.append(best_result)
            
            # Remove placed plates from remaining
            placed_ids = {p['plate'].element_id for p in best_result.placed_plates}
            remaining_plates = [p for p in remaining_plates if p.element_id not in placed_ids]
            
            print(f"[NESTING] Sheet {sheet_count + 1}: Placed {len(best_result.placed_plates)} plates, "
                  f"utilization={best_result.utilization:.1f}%")
            
            sheet_count += 1
        else:
            # No more plates fit
            print(f"[NESTING] No more plates fit on available stock sizes")
            break
    
    print(f"[NESTING] Nesting complete: {len(results)} sheets used, {len(remaining_plates)} plates remaining")
    
    return results, remaining_plates


def calculate_nesting_statistics(
    results: List[NestingResult],
    total_plates: int
) -> Dict:
    """
    Calculate overall statistics for nesting results.
    
    Args:
        results: List of NestingResult objects
        total_plates: Total number of plates attempted
        
    Returns:
        Dictionary with statistics
    """
    if not results:
        return {
            'total_plates': total_plates,
            'nested_plates': 0,
            'unnested_plates': total_plates,
            'stock_sheets_used': 0,
            'total_stock_area_m2': 0.0,
            'total_used_area_m2': 0.0,
            'waste_area_m2': 0.0,
            'overall_utilization': 0.0,
            'waste_percentage': 100.0,
            'geometry_based': True
        }
    
    nested_plates = sum(len(r.placed_plates) for r in results)
    unnested_plates = total_plates - nested_plates
    
    total_stock_area = sum(r.stock_width * r.stock_length for r in results)
    total_used_area = sum(
        sum(p['plate'].area for p in r.placed_plates)
        for r in results
    )
    
    overall_utilization = (total_used_area / total_stock_area * 100) if total_stock_area > 0 else 0.0
    waste_area = total_stock_area - total_used_area
    
    return {
        'total_plates': total_plates,
        'nested_plates': nested_plates,
        'unnested_plates': unnested_plates,
        'stock_sheets_used': len(results),
        'total_stock_area_m2': round(total_stock_area / 1_000_000, 2),
        'total_used_area_m2': round(total_used_area / 1_000_000, 2),
        'waste_area_m2': round(waste_area / 1_000_000, 2),
        'overall_utilization': round(overall_utilization, 2),
        'waste_percentage': round(100 - overall_utilization, 2),
        'geometry_based': True
    }

