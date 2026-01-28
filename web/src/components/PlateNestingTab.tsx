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
  const [useGeometry, setUseGeometry] = useState(true)
  const [useActualGeometry, setUseActualGeometry] = useState(true)
  
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
    setUseGeometry(true)
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

  const getColorForThickness = (thickness: string): string => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
    const hash = thickness.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colors[hash % colors.length]
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
                Define the sizes of stock plates available for purchase
              </p>

              {/* Geometry Toggle */}
              <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-300">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="useGeometry"
                    checked={useGeometry}
                    onChange={(e) => setUseGeometry(e.target.checked)}
                    className="mt-1 w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                  />
                  <div className="flex-1">
                    <label htmlFor="useGeometry" className="font-semibold text-gray-900 cursor-pointer flex items-center gap-2">
                      ✨ Use Actual Plate Geometry (Recommended)
                    </label>
                    <p className="text-sm text-gray-700 mt-1">
                      Extracts the <strong>real shape</strong> of each plate including holes, cutouts, and irregular edges.
                    </p>
                    <div className="mt-2 p-2 bg-white rounded border border-green-200">
                      <p className="text-xs text-gray-600">
                        <strong className="text-green-700">✓ Better utilization</strong> (15-30% improvement)<br/>
                        <strong className="text-green-700">✓ Accurate waste calculation</strong> (uses actual area)<br/>
                        <strong className="text-green-700">✓ CNC-ready shapes</strong> (SVG paths included)
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      💡 Unchecking will use simple bounding boxes (faster but less efficient)
                    </p>
                  </div>
                </div>
              </div>

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

              {/* Nesting Method Selection */}
              <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                <h4 className="text-md font-semibold text-gray-900 mb-3">Nesting Method</h4>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="useActualGeometry"
                    checked={useActualGeometry}
                    onChange={(e) => setUseActualGeometry(e.target.checked)}
                    className="mt-1 w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <div>
                    <label htmlFor="useActualGeometry" className="font-medium text-gray-900 cursor-pointer">
                      Use Actual Plate Geometry (Recommended)
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      Extracts the real shape of each plate including holes, cutouts, and irregular edges. 
                      Results in <span className="font-semibold text-purple-700">more optimized nesting</span> with less material waste.
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      ⚠️ Unchecking this will use simple bounding boxes (faster but less efficient)
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
                  <p>• Nesting method: {useActualGeometry ? '✨ Actual Geometry (Optimized)' : '📦 Bounding Box (Fast)'}</p>
                  <p>• Ready to generate nesting plan</p>
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
            {/* Statistics Summary */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900">Nesting Results</h3>
                {(nestingResults.statistics as any).geometry_based && (
                  <div className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                    ✨ Geometry-Based Nesting
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-600 font-medium">Total Plates</p>
                  <p className="text-2xl font-bold text-blue-900">{nestingResults.statistics.total_plates}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-600 font-medium">Stock Sheets</p>
                  <p className="text-2xl font-bold text-green-900">{nestingResults.statistics.stock_sheets_used}</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm text-purple-600 font-medium">Utilization</p>
                  <p className="text-2xl font-bold text-purple-900">{nestingResults.statistics.overall_utilization}%</p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <p className="text-sm text-orange-600 font-medium">Waste</p>
                  <p className="text-2xl font-bold text-orange-900">{nestingResults.statistics.waste_percentage}%</p>
                </div>
              </div>

              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Total Area:</span>
                    <span className="ml-2 font-semibold">{nestingResults.statistics.total_stock_area_m2} m²</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Used Area:</span>
                    <span className="ml-2 font-semibold">{nestingResults.statistics.total_used_area_m2} m²</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Waste Area:</span>
                    <span className="ml-2 font-semibold">{nestingResults.statistics.waste_area_m2} m²</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bill of Materials */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Bill of Materials (BOM)</h3>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Dimensions (mm)</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Thickness</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Quantity</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Area (m²)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generateBOM().map((item, index) => (
                      <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{item.dimensions}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{item.thickness}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">{item.quantity}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{item.area_m2.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={2} className="px-4 py-3 text-sm text-gray-900">Total</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {generateBOM().reduce((sum, item) => sum + item.quantity, 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {generateBOM().reduce((sum, item) => sum + item.area_m2, 0).toFixed(3)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Cutting Plans Visualization */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Cutting Plans</h3>

              {/* Plan Selector */}
              {nestingResults.cutting_plans.length > 1 && (
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                  {nestingResults.cutting_plans.map((plan, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedPlanIndex(index)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                        selectedPlanIndex === index
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Sheet {index + 1} ({plan.utilization}%)
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Plan Visualization */}
              {nestingResults.cutting_plans[selectedPlanIndex] && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">
                        {nestingResults.cutting_plans[selectedPlanIndex].stock_name}
                      </h4>
                      <p className="text-sm text-gray-600">
                        {nestingResults.cutting_plans[selectedPlanIndex].stock_width} × {nestingResults.cutting_plans[selectedPlanIndex].stock_length} mm
                        <span className="ml-2">•</span>
                        <span className="ml-2">{nestingResults.cutting_plans[selectedPlanIndex].plates.length} plates</span>
                        <span className="ml-2">•</span>
                        <span className="ml-2">{nestingResults.cutting_plans[selectedPlanIndex].utilization}% utilized</span>
                      </p>
                    </div>
                  </div>

                  {/* SVG Visualization */}
                  <div className="bg-white rounded-lg p-4 overflow-auto">
                    <svg
                      viewBox={`0 0 ${nestingResults.cutting_plans[selectedPlanIndex].stock_width} ${nestingResults.cutting_plans[selectedPlanIndex].stock_length}`}
                      className="w-full h-auto border border-gray-300"
                      style={{ maxHeight: '600px' }}
                    >
                      {/* Stock plate background */}
                      <rect
                        x="0"
                        y="0"
                        width={nestingResults.cutting_plans[selectedPlanIndex].stock_width}
                        height={nestingResults.cutting_plans[selectedPlanIndex].stock_length}
                        fill="#f9fafb"
                        stroke="#d1d5db"
                        strokeWidth="2"
                      />

                      {/* Nested plates */}
                      {nestingResults.cutting_plans[selectedPlanIndex].plates.map((plate, idx) => (
                        <g key={idx}>
                          {plate.svg_path ? (
                            /* Render actual plate geometry */
                            <>
                              <path
                                d={plate.svg_path}
                                fill={getColorForThickness(plate.thickness)}
                                fillOpacity="0.7"
                                stroke="#374151"
                                strokeWidth="2"
                              />
                              <text
                                x={plate.x + plate.width / 2}
                                y={plate.y + plate.height / 2}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#ffffff"
                                fontSize="10"
                                fontWeight="bold"
                              >
                                {plate.width.toFixed(0)}×{plate.height.toFixed(0)}
                                {plate.has_complex_geometry && ' ⭐'}
                              </text>
                            </>
                          ) : (
                            /* Render bounding box rectangle */
                            <>
                              <rect
                                x={plate.x}
                                y={plate.y}
                                width={plate.width}
                                height={plate.height}
                                fill={getColorForThickness(plate.thickness)}
                                fillOpacity="0.7"
                                stroke="#374151"
                                strokeWidth="1"
                              />
                              <text
                                x={plate.x + plate.width / 2}
                                y={plate.y + plate.height / 2}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#ffffff"
                                fontSize="12"
                                fontWeight="bold"
                              >
                                {plate.width}×{plate.height}
                              </text>
                            </>
                          )}
                        </g>
                      ))}
                    </svg>
                  </div>

                  {/* Plates List */}
                  <div className="mt-4">
                    <h5 className="text-sm font-semibold text-gray-700 mb-2">Plates in this sheet:</h5>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {nestingResults.cutting_plans[selectedPlanIndex].plates.map((plate, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2 bg-white rounded border border-gray-200 text-sm"
                        >
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: getColorForThickness(plate.thickness) }}
                          />
                          <span className="text-gray-700">
                            {plate.width}×{plate.height}mm ({plate.thickness})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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
              {loadingGeometry && !plateGeometry && (<div className="flex flex-col items-center justify-center py-12 space-y-4"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div><p className="text-gray-600">Loading geometry...</p></div>)}
              {!loadingGeometry && plateGeometry && plateGeometry.has_geometry && plateGeometry.svg_path && (<div className="space-y-4"><div className="flex justify-center"><span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">✓ Actual Geometry {plateGeometry.num_holes > 0 ? `with ${plateGeometry.num_holes} hole(s)` : ''}</span></div><div className="bg-gray-50 rounded-lg p-6 flex items-center justify-center"><svg width="100%" height="400" viewBox={`${plateGeometry.bounding_box[0] - 50} ${plateGeometry.bounding_box[1] - 50} ${plateGeometry.bounding_box[2] - plateGeometry.bounding_box[0] + 100} ${plateGeometry.bounding_box[3] - plateGeometry.bounding_box[1] + 100}`} className="max-w-full"><path d={plateGeometry.svg_path} fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="2" fillRule="evenodd" /><g><line x1={plateGeometry.bounding_box[0]} y1={plateGeometry.bounding_box[3] + 30} x2={plateGeometry.bounding_box[2]} y2={plateGeometry.bounding_box[3] + 30} stroke="#374151" strokeWidth="1" markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" /><text x={(plateGeometry.bounding_box[0] + plateGeometry.bounding_box[2]) / 2} y={plateGeometry.bounding_box[3] + 45} textAnchor="middle" fill="#374151" fontSize="14" fontWeight="bold">{plateGeometry.width.toFixed(1)} mm</text></g><g><line x1={plateGeometry.bounding_box[2] + 30} y1={plateGeometry.bounding_box[1]} x2={plateGeometry.bounding_box[2] + 30} y2={plateGeometry.bounding_box[3]} stroke="#374151" strokeWidth="1" markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" /><text x={plateGeometry.bounding_box[2] + 45} y={(plateGeometry.bounding_box[1] + plateGeometry.bounding_box[3]) / 2} textAnchor="middle" fill="#374151" fontSize="14" fontWeight="bold" transform={`rotate(90, ${plateGeometry.bounding_box[2] + 45}, ${(plateGeometry.bounding_box[1] + plateGeometry.bounding_box[3]) / 2})`}>{plateGeometry.length.toFixed(1)} mm</text></g><defs><marker id="arrowStart" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto"><polygon points="10,5 0,0 0,10" fill="#374151" /></marker><marker id="arrowEnd" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto"><polygon points="0,5 10,0 10,10" fill="#374151" /></marker></defs></svg></div></div>)}
              {!loadingGeometry && (!plateGeometry || !plateGeometry.has_geometry || !plateGeometry.svg_path) && previewPlate.width && previewPlate.length && (<div className="space-y-4"><div className="flex justify-center"><span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">⚠️ Bounding Box (Geometry not available)</span></div><div className="bg-gray-50 rounded-lg p-6 flex items-center justify-center"><svg width="100%" height="400" viewBox={`-50 -50 ${previewPlate.width + 100} ${previewPlate.length + 100}`} className="max-w-full"><rect x="0" y="0" width={previewPlate.width} height={previewPlate.length} fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="2" /></svg></div></div>)}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4"><p className="text-xs text-gray-600 mb-1">Thickness</p><p className="text-lg font-bold text-gray-900">{previewPlate.thickness}</p></div>
                <div className="bg-green-50 rounded-lg p-4"><p className="text-xs text-gray-600 mb-1">Quantity</p><p className="text-lg font-bold text-gray-900">{previewPlate.quantity}</p></div>
                <div className="bg-purple-50 rounded-lg p-4"><p className="text-xs text-gray-600 mb-1">Weight per piece</p><p className="text-lg font-bold text-gray-900">{(previewPlate.total_weight / previewPlate.quantity).toFixed(2)} kg</p></div>
                <div className="bg-orange-50 rounded-lg p-4"><p className="text-xs text-gray-600 mb-1">Total Weight</p><p className="text-lg font-bold text-gray-900">{previewPlate.total_weight.toFixed(2)} kg</p></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
