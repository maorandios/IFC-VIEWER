import { useState, useEffect } from 'react'
import { SteelReport } from '../types'
import { pdf } from '@react-pdf/renderer'
import { PlateNestingReportPDF } from './PlateNestingReportPDF'

interface PlateNestingTabProps {
  filename: string
  report: SteelReport | null
}

interface PlateDetail {
  part_name: string
  assembly_mark: string
  thickness: string
  profile_name: string
  width: number | null
  length: number | null
  weight: number
  quantity: number
  total_weight: number
  ids: number[]
}

interface StockPlate {
  width: number
  length: number
  id: string
}

interface PlateInPlan {
  x: number
  y: number
  width: number
  height: number
  name: string
  thickness: string
  id: string
  svg_path?: string
  actual_area?: number
  has_complex_geometry?: boolean
  rotated?: boolean
}

interface CuttingPlan {
  stock_width: number
  stock_length: number
  stock_index: number
  stock_name: string
  utilization: number
  plates: PlateInPlan[]
}

interface NestingStatistics {
  total_plates: number
  nested_plates: number
  unnested_plates: number
  stock_sheets_used: number
  total_stock_area_m2: number
  total_used_area_m2: number
  waste_area_m2: number
  overall_utilization: number
  waste_percentage: number
}

interface NestingResults {
  success: boolean
  cutting_plans: CuttingPlan[]
  statistics: NestingStatistics
  unnested_plates?: any[]
}

interface BOMItem {
  dimensions: string
  thickness: string
  quantity: number
  area_m2: number
}

type Step = 'selectPlates' | 'configureStock' | 'results'

export default function PlateNestingTab({ filename, report }: PlateNestingTabProps) {
  const [currentStep, setCurrentStep] = useState<Step>('selectPlates')
  const [plates, setPlates] = useState<PlateDetail[]>([])
  const [selectedPlates, setSelectedPlates] = useState<Set<string>>(new Set())
  const [loadingPlates, setLoadingPlates] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filterThickness, setFilterThickness] = useState<string>('all')
  
  const [stockPlates, setStockPlates] = useState<StockPlate[]>([
    { id: '1', width: 1000, length: 2000 },
    { id: '2', width: 1250, length: 2500 },
    { id: '3', width: 1500, length: 3000 }
  ])
  const [nestingResults, setNestingResults] = useState<NestingResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0)
  // Always use optimized bounding box (best performance and utilization)
  const useGeometry = false
  const useActualGeometry = false
  
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewPlate, setPreviewPlate] = useState<PlateDetail | null>(null)
  const [plateGeometry, setPlateGeometry] = useState<any>(null)
  const [loadingGeometry, setLoadingGeometry] = useState(false)

  useEffect(() => {
    if (filename && report) {
      fetchPlates()
    }
  }, [filename, report])

  const fetchPlates = async () => {
    setLoadingPlates(true)
    try {
      const response = await fetch(`/api/dashboard-details/${encodeURIComponent(filename)}`)
      if (response.ok) {
        const data = await response.json()
        const platesData = data.plates || []
        setPlates(platesData)
      }
    } catch (error) {
      console.error('Error fetching plates:', error)
    } finally {
      setLoadingPlates(false)
    }
  }

  const fetchPlateGeometry = async (plate: PlateDetail) => {
    if (!plate.ids || plate.ids.length === 0) return null
    setLoadingGeometry(true)
    try {
      const elementId = plate.ids[0]
      const response = await fetch(`/api/plate-geometry/${encodeURIComponent(filename)}/${elementId}`)
      if (response.ok) return await response.json()
      return null
    } catch (error) {
      console.error('Error fetching plate geometry:', error)
      return null
    } finally {
      setLoadingGeometry(false)
    }
  }

  const handleOpenPreview = async (plate: PlateDetail) => {
    setPreviewPlate(plate)
    setShowPreviewModal(true)
    setPlateGeometry(null)
    const geometry = await fetchPlateGeometry(plate)
    setPlateGeometry(geometry)
  }

  const handleClosePreview = () => {
    setShowPreviewModal(false)
    setPreviewPlate(null)
    setPlateGeometry(null)
  }

  const togglePlateSelection = (plateId: string) => {
    const newSelection = new Set(selectedPlates)
    if (newSelection.has(plateId)) {
      newSelection.delete(plateId)
    } else {
      newSelection.add(plateId)
    }
    setSelectedPlates(newSelection)
  }

  const toggleSelectAll = () => {
    if (selectedPlates.size === filteredPlates.length) {
      setSelectedPlates(new Set())
    } else {
      const allIds = new Set(filteredPlates.map((_p, idx) => `plate-${plates.indexOf(_p)}`))
      setSelectedPlates(allIds)
    }
  }

  // Get unique values for filters
  const uniqueThicknesses = Array.from(new Set(plates.map(p => p.thickness))).sort()

  // Filter plates
  const filteredPlates = plates.filter((plate) => {
    const searchLower = searchText.toLowerCase()
    const matchesSearch = searchText === '' || 
      plate.part_name.toLowerCase().includes(searchLower) ||
      plate.thickness.toLowerCase().includes(searchLower) ||
      plate.profile_name.toLowerCase().includes(searchLower) ||
      plate.assembly_mark.toLowerCase().includes(searchLower) ||
      (plate.width?.toString() || '').includes(searchLower) ||
      (plate.length?.toString() || '').includes(searchLower)

    const matchesThickness = filterThickness === 'all' || plate.thickness === filterThickness

    return matchesSearch && matchesThickness
  })

  const clearFilters = () => {
    setSearchText('')
    setFilterThickness('all')
  }

  const addStockPlate = () => {
    if (stockPlates.length >= 5) return
    setStockPlates([
      ...stockPlates,
      { id: Date.now().toString(), width: 1000, length: 2000 }
    ])
  }

  const removeStockPlate = (id: string) => {
    if (stockPlates.length <= 1) return
    setStockPlates(stockPlates.filter(sp => sp.id !== id))
  }

  const updateStockPlate = (id: string, field: 'width' | 'length', value: number) => {
    setStockPlates(stockPlates.map(sp => 
      sp.id === id ? { ...sp, [field]: value } : sp
    ))
  }

  const handleNext = () => {
    if (currentStep === 'selectPlates') {
      if (selectedPlates.size === 0) {
        setError('Please select at least one plate to nest')
        return
      }
      setError(null)
      setCurrentStep('configureStock')
    } else if (currentStep === 'configureStock') {
      generateNesting()
    }
  }

  const handleBack = () => {
    if (currentStep === 'configureStock') {
      setCurrentStep('selectPlates')
    } else if (currentStep === 'results') {
      setCurrentStep('configureStock')
    }
    setError(null)
  }

  const handleReset = () => {
    setSelectedPlates(new Set())
    setCurrentStep('selectPlates')
    setNestingResults(null)
    setError(null)
    setStockPlates([
      { id: '1', width: 1000, length: 2000 },
      { id: '2', width: 1250, length: 2500 },
      { id: '3', width: 1500, length: 3000 }
    ])
  }

  const generateNesting = async () => {
    if (!filename) {
      setError('No file loaded')
      return
    }

    if (selectedPlates.size === 0) {
      setError('Please select at least one plate to nest')
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      // Get selected plates data
      const selectedPlatesData = plates
        .map((plate, idx) => ({ plate, idx }))
        .filter(({ idx }) => selectedPlates.has(`plate-${idx}`))
        .map(({ plate }) => plate)

      // Use geometry endpoint if enabled, otherwise use standard endpoint
      const endpoint = useGeometry 
        ? `/api/generate-plate-nesting-geometry/${encodeURIComponent(filename)}`
        : `/api/generate-plate-nesting/${encodeURIComponent(filename)}`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          stock_plates: stockPlates.map(sp => ({
            width: sp.width,
            length: sp.length
          })),
          selected_plates: selectedPlatesData.map(p => ({
            width: p.width || 0,
            length: p.length || 0,
            thickness: p.thickness,
            name: p.part_name,
            quantity: p.quantity
          })),
          use_actual_geometry: useActualGeometry
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || 'Failed to generate nesting plan')
      }

      const data = await response.json()
      setNestingResults(data)
      setSelectedPlanIndex(0)
      setCurrentStep('results')
    } catch (error) {
      console.error('Error generating nesting:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate nesting plan. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getColorForPlateName = (plateName: string): string => {
    // Extract the base plate name (remove the -1, -2, etc. suffix)
    const baseName = plateName.replace(/-\d+$/, '');
    
    // Define a range of distinct grayscale colors
    const grayscaleColors = [
      '#d1d5db', // Very light gray
      '#b4b9c0', // Light gray
      '#9ca3af', // Medium light gray
      '#848b96', // Medium gray
      '#6b7280', // Medium dark gray
      '#565d68', // Dark gray
      '#4b5563', // Darker gray
      '#3d4451', // Very dark gray
    ];
    
    // Simple hash function to pick a consistent color based on plate name
    const hash = baseName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return grayscaleColors[hash % grayscaleColors.length];
  }

  // Helper function to create normalized grouping key
  // Handles cases where width/length might be swapped (e.g., 90x367 vs 367x90)
  const createPlateGroupKey = (baseName: string, thickness: string, width: number, height: number): string => {
    // Sort dimensions to normalize (smaller first, larger second)
    // This ensures plates with swapped dimensions are treated as the same
    const [dim1, dim2] = [width, height].sort((a, b) => a - b);
    return `${baseName}_${thickness}_${dim1}_${dim2}`;
  }

  // State for expandable stock plate groups
  const [expandedStockGroups, setExpandedStockGroups] = useState<Set<string>>(new Set())

  const toggleStockGroup = (groupKey: string) => {
    const newExpanded = new Set(expandedStockGroups)
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey)
    } else {
      newExpanded.add(groupKey)
    }
    setExpandedStockGroups(newExpanded)
  }

  // Group cutting plans by stock size
  const groupCuttingPlansByStock = () => {
    if (!nestingResults || !nestingResults.cutting_plans) return []

    const STEEL_DENSITY = 0.00000785 // kg/mm³
    
    const stockGroups = new Map<string, {
      stock_size: string
      stock_width: number
      stock_length: number
      thickness: string
      quantity: number
      sheets: {
        sheet_index: number
        utilization: number
        plates: PlateInPlan[]
        plates_count: number
        plates_weight_kg: number
        waste_m2: number
        waste_kg: number
      }[]
    }>()

    nestingResults.cutting_plans.forEach((plan, index) => {
      const thickness = plan.plates[0]?.thickness || 'Unknown'
      const key = `${plan.stock_width}x${plan.stock_length}x${thickness}`
      
      // Calculate metrics for this sheet
      const stockArea_m2 = (plan.stock_width * plan.stock_length) / 1_000_000
      const usedArea_m2 = plan.plates.reduce((sum, plate) => {
        const plateArea = plate.actual_area || (plate.width * plate.height)
        return sum + (plateArea / 1_000_000)
      }, 0)
      const waste_m2 = stockArea_m2 - usedArea_m2
      
      // Parse thickness value (e.g., "10mm" -> 10)
      const thicknessValue = parseFloat(thickness.replace(/[^\d.]/g, ''))
      const stockVolume_mm3 = plan.stock_width * plan.stock_length * thicknessValue
      const usedVolume_mm3 = plan.plates.reduce((sum, plate) => {
        const plateArea = plate.actual_area || (plate.width * plate.height)
        return sum + (plateArea * thicknessValue)
      }, 0)
      const waste_kg = (stockVolume_mm3 - usedVolume_mm3) * STEEL_DENSITY
      
      const plates_weight_kg = usedVolume_mm3 * STEEL_DENSITY

      if (!stockGroups.has(key)) {
        stockGroups.set(key, {
          stock_size: `${plan.stock_width} × ${plan.stock_length} mm`,
          stock_width: plan.stock_width,
          stock_length: plan.stock_length,
          thickness: thickness,
          quantity: 0,
          sheets: []
        })
      }

      const group = stockGroups.get(key)!
      group.quantity++
      group.sheets.push({
        sheet_index: index + 1,
        utilization: plan.utilization,
        plates: plan.plates,
        plates_count: plan.plates.length,
        plates_weight_kg: plates_weight_kg,
        waste_m2: waste_m2,
        waste_kg: waste_kg
      })
    })

    return Array.from(stockGroups.entries()).map(([key, value]) => ({
      key,
      ...value
    }))
  }

  const generateBOM = (): BOMItem[] => {
    if (!nestingResults || !nestingResults.cutting_plans) return []
    
    const bomMap = new Map<string, BOMItem>()
    
    nestingResults.cutting_plans.forEach(plan => {
      plan.plates.forEach(plate => {
        const key = `${plate.width}x${plate.height}x${plate.thickness}`
        
        if (bomMap.has(key)) {
          const existing = bomMap.get(key)!
          existing.quantity += 1
          existing.area_m2 += (plate.width * plate.height) / 1_000_000
        } else {
          bomMap.set(key, {
            dimensions: `${plate.width} × ${plate.height}`,
            thickness: plate.thickness,
            quantity: 1,
            area_m2: (plate.width * plate.height) / 1_000_000
          })
        }
      })
    })
    
    return Array.from(bomMap.values()).sort((a, b) => {
      if (a.thickness !== b.thickness) return a.thickness.localeCompare(b.thickness)
      return b.area_m2 - a.area_m2
    })
  }

  const generateStockPurchaseSummary = () => {
    if (!nestingResults || !nestingResults.cutting_plans) return []
    
    // Steel density: 7850 kg/m³ = 0.00000785 kg/mm³
    const STEEL_DENSITY = 0.00000785
    
    // Group by stock size and thickness
    const stockMap = new Map<string, {
      plateSize: string
      thickness: string
      quantity: number
      totalArea: number
      totalTonnage: number
      width: number
      length: number
    }>()
    
    nestingResults.cutting_plans.forEach(plan => {
      // Get thickness from plates in this plan (use first plate's thickness)
      const thickness = plan.plates.length > 0 ? plan.plates[0].thickness : 'unknown'
      const key = `${plan.stock_width}x${plan.stock_length}x${thickness}`
      
      const stockArea = plan.stock_width * plan.stock_length // mm²
      const area_m2 = stockArea / 1_000_000
      
      // Calculate tonnage for this stock sheet
      // Parse thickness value
      const thicknessStr = thickness.toString().replace('mm', '').replace('t', '').replace('T', '').trim()
      const thicknessValue = parseFloat(thicknessStr) || 10
      const volume = stockArea * thicknessValue // mm³
      const weight_kg = volume * STEEL_DENSITY
      const tonnage = weight_kg / 1000
      
      if (stockMap.has(key)) {
        const existing = stockMap.get(key)!
        existing.quantity += 1
        existing.totalArea += area_m2
        existing.totalTonnage += tonnage
      } else {
        stockMap.set(key, {
          plateSize: `${plan.stock_width} × ${plan.stock_length}`,
          thickness: thickness,
          quantity: 1,
          totalArea: area_m2,
          totalTonnage: tonnage,
          width: plan.stock_width,
          length: plan.stock_length
        })
      }
    })
    
    return Array.from(stockMap.values()).sort((a, b) => {
      // Sort by thickness first, then by size
      if (a.thickness !== b.thickness) return a.thickness.localeCompare(b.thickness)
      return (b.width * b.length) - (a.width * a.length)
    })
  }

  const handleExportPDF = async () => {
    if (!nestingResults || !filename) return

    try {
      const bom = generateBOM()
      const doc = (
        <PlateNestingReportPDF
          filename={filename}
          cutting_plans={nestingResults.cutting_plans}
          statistics={nestingResults.statistics}
          bom={bom}
        />
      )

      const blob = await pdf(doc).toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `plate_nesting_${filename.replace('.ifc', '')}_${new Date().toISOString().split('T')[0]}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Failed to generate PDF. Please try again.')
    }
  }

  if (loadingPlates) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading plates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header with Step Navigation */}
      <div className="p-4 border-b bg-white shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Plate Nesting Optimization</h2>
            <div className="flex items-center gap-2 mt-2">
              <div className={`px-3 py-1 rounded text-sm font-medium ${currentStep === 'selectPlates' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                Step 1: Select Plates
              </div>
              <div className="text-gray-400">→</div>
              <div className={`px-3 py-1 rounded text-sm font-medium ${currentStep === 'configureStock' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                Step 2: Stock Configuration
              </div>
              <div className="text-gray-400">→</div>
              <div className={`px-3 py-1 rounded text-sm font-medium ${currentStep === 'results' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                Step 3: Nesting Report
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {currentStep !== 'selectPlates' && (
              <button
                onClick={handleBack}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded font-medium transition-colors"
              >
                ← Back
              </button>
            )}
            {currentStep === 'results' && (
              <button
                onClick={handleExportPDF}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors"
              >
                📥 Export PDF
              </button>
            )}
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
              title="Reset and start over"
            >
              🔄 Reset
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Step 1: Select Plates */}
        {currentStep === 'selectPlates' && (
          <div className="max-w-7xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Select Plates to Nest</h3>
              <p className="text-gray-600 mb-6">
                Choose which plates from your model you want to include in the nesting optimization
              </p>

              {/* Filter and Search Section */}
              {plates.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-900">Filter & Search</h4>
                    <button
                      onClick={clearFilters}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      Clear Filters
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {/* Free Text Search */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Search
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={searchText}
                          onChange={(e) => setSearchText(e.target.value)}
                          placeholder="Search plates..."
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        {searchText && (
                          <button
                            onClick={() => setSearchText('')}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Filter by Thickness */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Thickness
                      </label>
                      <select
                        value={filterThickness}
                        onChange={(e) => setFilterThickness(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="all">All Thicknesses</option>
                        {uniqueThicknesses.map((thickness) => (
                          <option key={thickness} value={thickness}>
                            {thickness}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Selection Summary */}
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm">
                      <span className="font-semibold text-blue-900">{selectedPlates.size}</span> of{' '}
                      <span className="font-semibold text-blue-900">{plates.length}</span> plate types selected
                      <span className="ml-4 text-gray-600">
                        (Total pieces: {plates
                          .map((plate, idx) => ({ plate, idx }))
                          .filter(({ idx }) => selectedPlates.has(`plate-${idx}`))
                          .reduce((sum, { plate }) => sum + plate.quantity, 0)})
                      </span>
                    </div>
                    <button
                      onClick={toggleSelectAll}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      {selectedPlates.size === filteredPlates.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                </div>
              )}

              {/* Plates Table */}
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-100 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-12">
                        <input
                          type="checkbox"
                          checked={selectedPlates.size === filteredPlates.length && filteredPlates.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Plate Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Thickness</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Width (mm)</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Length (mm)</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Weight (kg)</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredPlates.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                          {plates.length === 0 ? 'No plates found in the model' : 'No plates match the current filters'}
                        </td>
                      </tr>
                    ) : (
                      filteredPlates.map((plate, displayIdx) => {
                        const plateIdx = plates.indexOf(plate)
                        const plateId = `plate-${plateIdx}`
                        const isSelected = selectedPlates.has(plateId)
                        return (
                          <tr 
                            key={plateId} 
                            className={`${isSelected ? 'bg-blue-50' : displayIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-100 cursor-pointer transition-colors`}
                            onClick={() => togglePlateSelection(plateId)}
                          >
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => togglePlateSelection(plateId)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">{plate.part_name}</td>
                            <td className="px-4 py-3 text-sm font-medium text-blue-600">{plate.thickness}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              {plate.width ? plate.width.toFixed(1) : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              {plate.length ? plate.length.toFixed(1) : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium text-blue-600">
                              {plate.quantity}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                              {plate.total_weight.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={(e) => {e.stopPropagation(); handleOpenPreview(plate)}} className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100">👁️ View</button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Next Button */}
            <div className="flex justify-end">
              <button
                onClick={handleNext}
                disabled={selectedPlates.size === 0}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  selectedPlates.size === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Next: Configure Stock →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Configure Stock */}
        {currentStep === 'configureStock' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Configure Stock Plates</h3>
              <p className="text-gray-600 mb-6">
                Define the sizes of stock plates available for purchase. The system will use the <strong>Optimized Bounding Box</strong> method with 20 algorithm combinations for best results.
              </p>

              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-semibold text-gray-900">Available Stock Sizes</h4>
                <button
                  onClick={addStockPlate}
                  disabled={stockPlates.length >= 5}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    stockPlates.length >= 5
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  + Add Stock Size
                </button>
              </div>

              <div className="space-y-3 mb-6">
                {stockPlates.map((stock, index) => (
                  <div key={stock.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700 w-20">
                      Stock {index + 1}:
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={stock.width}
                        onChange={(e) => updateStockPlate(stock.id, 'width', parseFloat(e.target.value) || 0)}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Width"
                        min="100"
                        step="100"
                      />
                      <span className="text-gray-500">×</span>
                      <input
                        type="number"
                        value={stock.length}
                        onChange={(e) => updateStockPlate(stock.id, 'length', parseFloat(e.target.value) || 0)}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Length"
                        min="100"
                        step="100"
                      />
                      <span className="text-sm text-gray-500">mm</span>
                    </div>
                    {stockPlates.length > 1 && (
                      <button
                        onClick={() => removeStockPlate(stock.id)}
                        className="ml-auto px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Nesting Method Info */}
              <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-300">
                <h4 className="text-md font-semibold text-gray-900 mb-2">Nesting Method</h4>
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <span className="text-2xl">✅</span>
                  </div>
                  <div>
                    <div className="font-semibold text-green-700 flex items-center gap-2">
                      <span>Optimized Bounding Box</span>
                      <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">ACTIVE</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">
                      • 4 algorithms + 5 sorting strategies = <span className="font-bold">20 combinations tested automatically</span><br/>
                      • Rotation enabled for better space utilization<br/>
                      • <span className="font-semibold text-green-700">70-85% typical utilization</span><br/>
                      • Fast and reliable - best results guaranteed
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Summary</h4>
                <div className="text-sm text-gray-700">
                  <p>• {selectedPlates.size} plate types selected</p>
                  <p>• {stockPlates.length} stock sizes configured</p>
                  <p>• {plates
                    .map((plate, idx) => ({ plate, idx }))
                    .filter(({ idx }) => selectedPlates.has(`plate-${idx}`))
                    .reduce((sum, { plate }) => sum + plate.quantity, 0)} total pieces to nest</p>
                  <p>• Ready to generate optimized nesting plan</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between">
              <button
                onClick={handleBack}
                className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
              >
                ← Back to Selection
              </button>
              <button
                onClick={handleNext}
                disabled={loading}
                className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  loading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    Generate Nesting Plan →
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {currentStep === 'results' && nestingResults && nestingResults.success && (
          <div className="max-w-7xl mx-auto">
            {/* Section 1: Statistics Cards */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl shadow-lg p-8 mb-6 border border-gray-200">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Nesting Results Overview</h3>
                  <p className="text-sm text-gray-600 mt-1">Optimized cutting plan statistics and material analysis</p>
                </div>
                {(nestingResults.statistics as any).geometry_based && (
                  <div className="px-4 py-2 bg-gradient-to-r from-purple-100 to-purple-200 text-purple-900 rounded-lg text-sm font-semibold shadow-sm border border-purple-300">
                    ✨ Geometry-Based Nesting
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Total Plates */}
                <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-blue-500 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Plates</p>
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">📦</span>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{nestingResults.statistics.total_plates}</p>
                  <p className="text-xs text-gray-500 mt-1">pieces to nest</p>
                </div>

                {/* Total Area */}
                <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-indigo-500 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Area</p>
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">📐</span>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{nestingResults.statistics.total_stock_area_m2}</p>
                  <p className="text-xs text-gray-500 mt-1">m² stock used</p>
                </div>

                {/* Plates Tonnage */}
                <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-green-500 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plates Weight</p>
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">⚖️</span>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {((nestingResults.statistics as any).plates_tonnage || 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">tonnes of steel</p>
                </div>

                {/* Waste Tonnage */}
                <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-orange-500 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Waste Weight</p>
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">🗑️</span>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {((nestingResults.statistics as any).waste_tonnage || 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">tonnes wasted</p>
                </div>

                {/* Waste Area */}
                <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-red-500 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Waste Area</p>
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">❌</span>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{nestingResults.statistics.waste_area_m2}</p>
                  <p className="text-xs text-gray-500 mt-1">m² unused</p>
                </div>
              </div>

              {/* Efficiency Bar */}
              <div className="mt-6 p-4 bg-white rounded-xl shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">Material Utilization</span>
                  <span className="text-2xl font-bold text-purple-600">{nestingResults.statistics.overall_utilization}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-green-400 via-green-500 to-green-600 h-4 rounded-full transition-all duration-500 shadow-inner"
                    style={{ width: `${nestingResults.statistics.overall_utilization}%` }}
                  ></div>
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-600">
                  <span>Used: {nestingResults.statistics.total_used_area_m2} m²</span>
                  <span>Waste: {nestingResults.statistics.waste_percentage}%</span>
                </div>
              </div>
            </div>

            {/* Section 2: Stock Purchase Summary */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Stock Plates to Purchase</h3>
              <p className="text-sm text-gray-600 mb-4">Summary of stock plate sheets needed for this nesting plan</p>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-300">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Plate Size (mm)</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Thickness</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Quantity</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total m²</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total Tonnage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generateStockPurchaseSummary().map((item, index) => (
                      <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">{item.plateSize}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{item.thickness}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">{item.quantity}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{item.totalArea.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{item.totalTonnage.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                      <td colSpan={2} className="px-4 py-3 text-sm text-gray-900">Total</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {generateStockPurchaseSummary().reduce((sum, item) => sum + item.quantity, 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {generateStockPurchaseSummary().reduce((sum, item) => sum + item.totalArea, 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {generateStockPurchaseSummary().reduce((sum, item) => sum + item.totalTonnage, 0).toFixed(3)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Cutting Plans - Expandable by Stock Size */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Cutting Plans</h3>
              <p className="text-sm text-gray-600 mb-4">Organized by stock plate size and thickness</p>

              {groupCuttingPlansByStock().map((stockGroup) => (
                <div key={stockGroup.key} className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
                  {/* Stock Group Header */}
                  <div 
                    className="bg-gray-100 px-4 py-3 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => toggleStockGroup(stockGroup.key)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <svg
                          className={`w-5 h-5 transition-transform ${
                            expandedStockGroups.has(stockGroup.key) ? 'transform rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">
                            Stock Plate: {stockGroup.stock_size}
                      </h4>
                      <p className="text-sm text-gray-600">
                            Thickness: {stockGroup.thickness}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-blue-600">{stockGroup.quantity}</p>
                        <p className="text-sm text-gray-600">sheets</p>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Stock Group Content */}
                  {expandedStockGroups.has(stockGroup.key) && (
                    <div className="p-4 bg-white space-y-6">
                      {stockGroup.sheets.map((sheet, sheetIdx) => {
                        const plan = nestingResults.cutting_plans[sheet.sheet_index - 1]
                        
                        return (
                          <div key={sheetIdx} className="border border-gray-300 rounded-lg overflow-hidden">
                            {/* Sheet Header with Metrics */}
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-300">
                              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                                <div>
                                  <p className="text-xs text-gray-600">Sheet #</p>
                                  <p className="text-sm font-bold text-gray-900">{sheet.sheet_index}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600">Size</p>
                                  <p className="text-sm font-medium text-gray-900">
                                    {stockGroup.stock_width} × {stockGroup.stock_length}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600">Thickness</p>
                                  <p className="text-sm font-medium text-gray-900">{stockGroup.thickness}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600">Plates</p>
                                  <p className="text-sm font-bold text-blue-600">{sheet.plates_count}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600">Plates Weight</p>
                                  <p className="text-sm font-medium text-green-600">{sheet.plates_weight_kg.toFixed(2)} kg</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600">Utilization</p>
                                  <p className="text-sm font-bold text-gray-900">{sheet.utilization}%</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600">Waste (m²)</p>
                                  <p className="text-sm font-medium text-red-600">{sheet.waste_m2.toFixed(3)} m²</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600">Waste (kg)</p>
                                  <p className="text-sm font-medium text-red-600">{sheet.waste_kg.toFixed(2)} kg</p>
                                </div>
                    </div>
                  </div>

                            {/* Sheet Content Wrapper */}
                            <div className="p-4 bg-white space-y-4">
                  {/* SVG Visualization */}
                              <div>
                                {plan && (() => {
                        const stockWidth = plan.stock_width;
                        const stockLength = plan.stock_length;
                      
                      // Check if we need to rotate to landscape (portrait if length > width)
                      const isPortrait = stockLength > stockWidth;
                      
                      // For display, always show in landscape (wider than tall)
                      const displayWidth = isPortrait ? stockLength : stockWidth;
                      const displayHeight = isPortrait ? stockWidth : stockLength;
                      
                      // Dynamic scaling factors for readability
                      const maxDimension = Math.max(displayWidth, displayHeight);
                      const scaleFactor = maxDimension / 1000;
                      const strokeWidth = Math.max(1, scaleFactor * 0.5);
                      const fontSize = Math.max(10, scaleFactor * 6);
                      
                      // Function to clean plate name (remove special characters, make readable)
                      const cleanPlateName = (name: string) => {
                        if (!name) return '';
                        // Remove special characters and extra spaces
                        return name.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();
                      };
                      
                      return (
                        <>
                          <svg
                            viewBox={`0 0 ${displayWidth} ${displayHeight}`}
                            className="w-full border-2 border-gray-600"
                            style={{ height: 'auto', maxHeight: '600px', display: 'block', background: '#ffffff' }}
                            preserveAspectRatio="xMinYMin meet"
                          >
                            {/* Stock plate background - light gray */}
                            <rect
                              x="0"
                              y="0"
                              width={displayWidth}
                              height={displayHeight}
                              fill="#e5e7eb"
                              stroke="#374151"
                              strokeWidth={strokeWidth * 2}
                            />

                            {/* Create plate-to-row-number and color mapping */}
                            {(() => {
                              // Group plates by base name to create row mapping
                              const plateToRowMap = new Map();
                              const plateToColorMap = new Map();
                              const groupedForMapping = new Map();
                              let rowNum = 1;
                              
                              // Define distinct grayscale colors
                              const grayscaleColors = [
                                '#e0e0e0', // Very light gray (1)
                                '#c0c0c0', // Light gray (2)
                                '#a0a0a0', // Medium light gray (3)
                                '#909090', // Medium gray (4)
                                '#707070', // Medium dark gray (5)
                                '#606060', // Dark gray (6)
                                '#505050', // Darker gray (7)
                                '#404040', // Very dark gray (8)
                                '#d5d5d5', // Alt light 1
                                '#b5b5b5', // Alt light 2
                                '#959595', // Alt medium 1
                                '#858585', // Alt medium 2
                                '#757575', // Alt dark 1
                                '#656565', // Alt dark 2
                                '#555555', // Alt darker 1
                                '#454545', // Alt darker 2
                              ];
                              
                              plan.plates.forEach((plate, idx) => {
                                const baseName = plate.name ? plate.name.replace(/-\d+$/, '') : 'N/A';
                                const key = createPlateGroupKey(baseName, plate.thickness, plate.width, plate.height);
                                
                                if (!groupedForMapping.has(key)) {
                                  groupedForMapping.set(key, rowNum);
                                  // Assign a unique color to this group
                                  const colorIndex = (rowNum - 1) % grayscaleColors.length;
                                  plateToColorMap.set(key, grayscaleColors[colorIndex]);
                                  rowNum++;
                                }
                                
                                plateToRowMap.set(idx, groupedForMapping.get(key));
                              });
                              
                              return null;
                            })()}

                            {/* Nested plates */}
                            {plan.plates.map((plate, idx) => {
                              // Get row number and color for this plate
                              const baseName = plate.name ? plate.name.replace(/-\d+$/, '') : 'N/A';
                              const key = createPlateGroupKey(baseName, plate.thickness, plate.width, plate.height);
                              
                              // Calculate row number by checking how many unique groups came before
                              let plateRowNumber = 1;
                              const seenKeys = new Set();
                              for (let i = 0; i <= idx; i++) {
                                const p = plan.plates[i];
                                const bn = p.name ? p.name.replace(/-\d+$/, '') : 'N/A';
                                const k = createPlateGroupKey(bn, p.thickness, p.width, p.height);
                                if (!seenKeys.has(k)) {
                                  if (k === key) {
                                    break;
                                  }
                                  seenKeys.add(k);
                                  plateRowNumber++;
                                }
                              }
                              
                              // Define distinct grayscale colors (must match above)
                              const grayscaleColors = [
                                '#e0e0e0', '#c0c0c0', '#a0a0a0', '#909090',
                                '#707070', '#606060', '#505050', '#404040',
                                '#d5d5d5', '#b5b5b5', '#959595', '#858585',
                                '#757575', '#656565', '#555555', '#454545',
                              ];
                              const plateColor = grayscaleColors[(plateRowNumber - 1) % grayscaleColors.length];
                              
                              // Transform coordinates if rotated for display
                              let plateX = plate.x;
                              let plateY = plate.y;
                              let plateWidth = plate.width;
                              let plateHeight = plate.height;
                              
                              if (isPortrait) {
                                plateX = plate.y;
                                plateY = stockWidth - plate.x - plate.width;
                                plateWidth = plate.height;
                                plateHeight = plate.width;
                              }
                              
                              // Always show text (no minimum size check)
                              // Calculate appropriate font size for small plates
                              const minPlateDim = Math.min(plateWidth, plateHeight);
                              const adaptiveFontSize = Math.max(fontSize * 1.5, minPlateDim * 0.3);
                              
                              return (
                                <g key={idx}>
                                  {plate.svg_path ? (
                                    /* Render actual plate geometry - GRAYSCALE */
                                    <>
                                      <path
                                        d={plate.svg_path}
                                        fill={plateColor}
                                        fillOpacity="0.8"
                                        stroke="#000000"
                                        strokeWidth={strokeWidth}
                                      />
                                      <text
                                        x={plateX + plateWidth / 2}
                                        y={plateY + plateHeight / 2}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill="#1f2937"
                                        fontSize={adaptiveFontSize}
                                        fontWeight="bold"
                                        fontFamily="Arial, sans-serif"
                                      >
                                        {plateRowNumber}
                                      </text>
                                    </>
                                  ) : (
                                    /* Render bounding box rectangle - GRAYSCALE */
                                    <>
                                      <rect
                                        x={plateX}
                                        y={plateY}
                                        width={plateWidth}
                                        height={plateHeight}
                                        fill={plateColor}
                                        fillOpacity="0.8"
                                        stroke="#000000"
                                        strokeWidth={strokeWidth}
                                      />
                                      <text
                                        x={plateX + plateWidth / 2}
                                        y={plateY + plateHeight / 2}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill="#1f2937"
                                        fontSize={adaptiveFontSize}
                                        fontWeight="bold"
                                        fontFamily="Arial, sans-serif"
                                      >
                                        {plateRowNumber}
                                      </text>
                                    </>
                                  )}
                                </g>
                              );
                            })}
                          </svg>
                        </>
                      );
                    })()}
                  </div>

                              {/* Detailed Plates Table */}
                              <div>
                                <h5 className="text-sm font-semibold text-gray-700 mb-3 px-4">Plates in this sheet:</h5>
                                <div className="overflow-x-auto">
                                  <table className="w-full">
                                    <thead>
                                      <tr className="bg-gray-100 border-b border-gray-300">
                                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700">#</th>
                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Plate Name</th>
                                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700">Thickness</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Width (mm)</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Length (mm)</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">m²</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Weight (kg)</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Qty</th>
                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Total Weight (kg)</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(() => {
                                        const STEEL_DENSITY = 0.00000785; // kg/mm³
                                        
                                        // Group plates by base name (remove -1, -2, -3 suffix)
                                        const groupedPlates = new Map();
                                        sheet.plates.forEach((plate, idx) => {
                                          // Extract base name (remove -1, -2, etc.)
                                          const baseName = plate.name ? plate.name.replace(/-\d+$/, '') : 'N/A';
                                          const key = createPlateGroupKey(baseName, plate.thickness, plate.width, plate.height);
                                          
                                          if (!groupedPlates.has(key)) {
                                            // Normalize dimensions (sort them) for consistent display
                                            const [dim1, dim2] = [plate.width, plate.height].sort((a, b) => a - b);
                                            groupedPlates.set(key, {
                                              baseName,
                                              thickness: plate.thickness,
                                              width: dim1,
                                              height: dim2,
                                              actual_area: plate.actual_area,
                                              quantity: 0,
                                              indices: []
                                            });
                                          }
                                          
                                          const group = groupedPlates.get(key);
                                          group.quantity += 1;
                                          group.indices.push(idx + 1);
                                        });
                                        
                                        // Create rows with sequential numbering
                                        let rowNumber = 1;
                                        const rows = [];
                                        
                                        for (const group of groupedPlates.values()) {
                                          const plateArea_m2 = (group.actual_area || (group.width * group.height)) / 1_000_000;
                                          const thicknessValue = parseFloat(group.thickness.replace(/[^\d.]/g, ''));
                                          const plateVolume_mm3 = (group.actual_area || (group.width * group.height)) * thicknessValue;
                                          const plateWeight = plateVolume_mm3 * STEEL_DENSITY;
                                          const totalWeight = plateWeight * group.quantity;
                                          
                                          rows.push(
                                            <tr key={rowNumber} className="border-b border-gray-200 hover:bg-gray-50">
                                              <td className="px-3 py-2 text-sm text-center text-gray-600 font-mono font-bold">
                                                {rowNumber}
                                              </td>
                                              <td className="px-3 py-2 text-sm text-gray-900">{group.baseName}</td>
                                              <td className="px-3 py-2 text-sm text-center text-gray-700">{group.thickness}</td>
                                              <td className="px-3 py-2 text-sm text-right text-gray-900">{group.width.toFixed(1)}</td>
                                              <td className="px-3 py-2 text-sm text-right text-gray-900">{group.height.toFixed(1)}</td>
                                              <td className="px-3 py-2 text-sm text-right text-gray-700">{plateArea_m2.toFixed(4)}</td>
                                              <td className="px-3 py-2 text-sm text-right text-gray-700">{plateWeight.toFixed(2)}</td>
                                              <td className="px-3 py-2 text-sm text-right text-blue-600 font-medium">{group.quantity}</td>
                                              <td className="px-3 py-2 text-sm text-right text-gray-900 font-semibold">{totalWeight.toFixed(2)}</td>
                                            </tr>
                                          );
                                          
                                          rowNumber++;
                                        }
                                        
                                        return rows;
                                      })()}
                                    </tbody>
                                    <tfoot>
                                      <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                                        <td colSpan={5} className="px-3 py-2 text-sm text-gray-900">Totals</td>
                                        <td className="px-3 py-2 text-sm text-gray-900 text-right">
                                          {(() => {
                                            const totalArea = sheet.plates.reduce((sum, p) => {
                                              return sum + ((p.actual_area || (p.width * p.height)) / 1_000_000);
                                            }, 0);
                                            return totalArea.toFixed(4);
                                          })()}
                                        </td>
                                        <td className="px-3 py-2 text-sm text-gray-900 text-right"></td>
                                        <td className="px-3 py-2 text-sm text-gray-900 text-right">{sheet.plates.length}</td>
                                        <td className="px-3 py-2 text-sm text-gray-900 text-right font-bold">
                                          {sheet.plates_weight_kg.toFixed(2)}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                        </div>
                    </div>
                  </div>
                          </div>
                        );
                      })}
                </div>
              )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No results message */}
        {currentStep === 'results' && nestingResults && !nestingResults.success && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-6">
              <p className="text-center text-gray-600">
                {(nestingResults as any).message || 'Failed to generate nesting plan'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {showPreviewModal && previewPlate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleClosePreview}>
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center rounded-t-xl">
              <div><h3 className="text-xl font-bold text-gray-900">{previewPlate.part_name}</h3><p className="text-sm text-gray-500 mt-1">Plate Geometry Preview</p></div>
              <button onClick={handleClosePreview} className="text-gray-400 hover:text-gray-600 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-6 space-y-6">
              {/* Loading State */}
              {loadingGeometry && !plateGeometry && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  <p className="text-gray-600">Loading geometry...</p>
                </div>
              )}

              {/* Actual Geometry View */}
              {!loadingGeometry && plateGeometry && plateGeometry.has_geometry && plateGeometry.svg_path && (() => {
                const bbox = plateGeometry.bounding_box
                const width = bbox[2] - bbox[0]
                const height = bbox[3] - bbox[1]
                const maxDim = Math.max(width, height)
                
                // Simple padding for the plate view (no dimensions in SVG)
                const viewPadding = maxDim * 0.1
                
                return (
                  <div className="space-y-4">
                    <div className="flex justify-center">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        ✓ Actual Geometry {plateGeometry.num_holes > 0 ? `with ${plateGeometry.num_holes} hole(s)` : ''}
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-6 flex items-center justify-center">
                      <svg 
                        width="100%" 
                        height="500" 
                        viewBox={`${bbox[0] - viewPadding} ${bbox[1] - viewPadding} ${width + viewPadding * 2} ${height + viewPadding * 2}`}
                        preserveAspectRatio="xMidYMid meet"
                        className="max-w-full"
                      >
                        {/* Plate Geometry */}
                        <path 
                          d={plateGeometry.svg_path} 
                          fill="#3b82f6" 
                          fillOpacity="0.2" 
                          stroke="#2563eb" 
                          strokeWidth={Math.max(2, width * 0.003)}
                          fillRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                )
              })()}

              {/* Fallback Bounding Box */}
              {!loadingGeometry && (!plateGeometry || !plateGeometry.has_geometry || !plateGeometry.svg_path) && previewPlate.width && previewPlate.length && (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                      ⚠️ Bounding Box (Geometry not available)
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-6 flex items-center justify-center">
                    <svg width="100%" height="400" viewBox={`-50 -50 ${previewPlate.width + 100} ${previewPlate.length + 100}`} preserveAspectRatio="xMidYMid meet" className="max-w-full">
                      <rect x="0" y="0" width={previewPlate.width} height={previewPlate.length} fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="2" />
                    </svg>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                {/* Dimensions */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-gray-600 mb-1">Width</p>
                  <p className="text-lg font-bold text-gray-900">
                    {plateGeometry && plateGeometry.has_geometry 
                      ? `${plateGeometry.width.toFixed(1)} mm`
                      : previewPlate.width 
                        ? `${previewPlate.width.toFixed(1)} mm`
                        : 'N/A'}
                  </p>
                </div>
                <div className="bg-indigo-50 rounded-lg p-4">
                  <p className="text-xs text-gray-600 mb-1">Length</p>
                  <p className="text-lg font-bold text-gray-900">
                    {plateGeometry && plateGeometry.has_geometry 
                      ? `${plateGeometry.length.toFixed(1)} mm`
                      : previewPlate.length 
                        ? `${previewPlate.length.toFixed(1)} mm`
                        : 'N/A'}
                  </p>
                </div>
                <div className="bg-cyan-50 rounded-lg p-4">
                  <p className="text-xs text-gray-600 mb-1">Thickness</p>
                  <p className="text-lg font-bold text-gray-900">{previewPlate.thickness}</p>
                </div>
                
                {/* Quantity and Weights */}
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-xs text-gray-600 mb-1">Quantity</p>
                  <p className="text-lg font-bold text-gray-900">{previewPlate.quantity}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-xs text-gray-600 mb-1">Weight per piece</p>
                  <p className="text-lg font-bold text-gray-900">{(previewPlate.total_weight / previewPlate.quantity).toFixed(2)} kg</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-xs text-gray-600 mb-1">Total Weight</p>
                  <p className="text-lg font-bold text-gray-900">{previewPlate.total_weight.toFixed(2)} kg</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
