export interface SteelReport {
  total_tonnage: number
  fastener_tonnage?: number
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
}

export interface CuttingPattern {
  stock_length: number  // in mm
  parts: Array<{
    part: NestingPart
    cut_position: number  // Start position on stock bar in mm
    length: number  // in mm
  }>
  waste: number  // Waste length in mm
  waste_percentage: number
}

export interface ProfileNesting {
  profile_name: string
  total_parts: number
  total_length: number  // in mm
  stock_lengths_used: Record<number, number>  // stock_length (mm) -> quantity needed
  cutting_patterns: CuttingPattern[]
  total_waste: number  // in mm
  total_waste_percentage: number
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










