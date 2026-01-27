export interface SteelReport {
  total_tonnage: number
  total_weight?: number  // Total weight in kg
  fastener_tonnage?: number
  fastener_count?: number  // Total count of fasteners/bolts
  category_tonnage?: Record<string, number>  // Tonnage by category (Beam, Column, Plate, Other)
  category_items?: Record<string, Array<{ name: string; tonnage: number; weight_kg?: number }>>  // Items grouped by name within each category
  assemblies: Assembly[]
  profiles: Profile[]
  plates: Plate[]
}

export interface Assembly {
  assembly_mark: string
  total_weight: number
  member_count: number
  plate_count: number
}

export interface Profile {
  profile_name: string
  element_type: string
  piece_count: number
  total_weight: number
}

export interface Plate {
  thickness_profile: string
  piece_count: number
  total_weight: number
}

export interface FilterState {
  profileTypes: Set<string>  // e.g., ["IPE600", "UPN100", "HEA200"] - profile section names
  plateThicknesses: Set<string>  // e.g., ["PL10", "PL20"]
  assemblyMarks: Set<string>  // e.g., ["A1", "A2"]
}

export interface NestingPart {
  product_id: number
  profile_name: string
  element_type: string
  length: number  // in mm
  assembly_mark?: string
  element_name?: string
  reference?: string
  start_angle?: number  // Angle of start cut
  end_angle?: number  // Angle of end cut
}

export interface CuttingPattern {
  stock_length: number  // in mm
  parts: Array<{
    part: NestingPart
    cut_position: number  // Start position on stock bar in mm
    length: number  // in mm
    slope_info?: {
      start_angle?: number
      end_angle?: number
      start_has_slope?: boolean
      end_has_slope?: boolean
      has_slope?: boolean
      complementary_pair?: boolean
    }
  }>
  waste: number  // Waste length in mm
  waste_percentage: number
}

export interface RejectedPart {
  product_id?: number  // Product ID to match with cutting patterns
  part_id: string
  reference?: string  // Part reference (e.g., "b1 c25")
  element_name?: string  // Element name as fallback
  length: number  // in mm
  stock_length: number  // in mm
  reason: string
}

export interface ProfileNesting {
  profile_name: string
  total_parts: number
  total_length: number  // in mm
  stock_lengths_used: Record<number, number>  // stock_length (mm) -> quantity needed
  cutting_patterns: CuttingPattern[]
  total_waste: number  // in mm
  total_waste_percentage: number
  rejected_parts?: RejectedPart[]  // Parts that cannot be nested (exceed stock length)
}

export interface NestingReport {
  filename: string
  profiles: ProfileNesting[]
  summary: {
    total_profiles: number
    total_parts: number
    total_stock_bars: number
    total_waste: number  // in mm
    average_waste_percentage: number
  }
  settings: {
    stock_lengths: number[]  // in mm
  }
}

// Stock bar rendering data - pre-calculated by the main app for PDF generation
export interface StockBarRenderData {
  // SVG polygon points for each part
  parts: Array<{
    partNumber: number
    partName: string
    polygonPoints: string  // SVG polygon points attribute
    fillColor: string
    strokeColor: string
    labelX: number  // Label center X position (0-1000 px)
    labelY: number  // Label center Y position (0-60 px)
    showLabel: boolean
  }>
  // Waste area (if any)
  waste: {
    x: number  // Start X position (0-1000 px)
    width: number  // Width in px
    color: string
  } | null
  // Cut line markers
  cutLines: Array<{
    x: number  // X position (0-1000 px)
    y1: number  // Start Y (0-60 px)
    y2: number  // End Y (0-60 px)
    type: 'straight' | 'miter'  // Line type for styling
    isShared: boolean  // Whether this is a shared boundary
  }>
  // Stock bar dimensions
  stockLengthMm: number
  totalWidthPx: number  // Should be 1000
  heightPx: number  // Should be 60
}










