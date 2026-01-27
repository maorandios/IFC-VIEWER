import { useState } from 'react'
import { SteelReport } from '../types'
import { pdf } from '@react-pdf/renderer'
import { PlateNestingReportPDF } from './PlateNestingReportPDF'

interface PlateNestingTabProps {
  filename: string
  report: SteelReport | null
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

export default function PlateNestingTab({ filename, report }: PlateNestingTabProps) {
  const [stockPlates, setStockPlates] = useState<StockPlate[]>([
    { id: '1', width: 3000, length: 1500 },
    { id: '2', width: 2500, length: 1250 }
  ])
  const [nestingResults, setNestingResults] = useState<NestingResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0)

  const addStockPlate = () => {
    if (stockPlates.length >= 5) return
    setStockPlates([
      ...stockPlates,
      { id: Date.now().toString(), width: 3000, length: 1500 }
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

  const generateNesting = async () => {
    if (!filename) {
      alert('No file loaded')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/generate-plate-nesting/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          stock_plates: stockPlates.map(sp => ({
            width: sp.width,
            length: sp.length
          }))
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate nesting plan')
      }

      const data = await response.json()
      setNestingResults(data)
      setSelectedPlanIndex(0)
    } catch (error) {
      console.error('Error generating nesting:', error)
      alert('Failed to generate nesting plan. Please try again.')
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

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Plate Nesting</h1>
          <p className="text-gray-600">
            Optimize plate cutting plans to minimize material waste
          </p>
        </div>

        {/* Stock Plate Configuration */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Stock Plate Configuration</h2>
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

          <div className="space-y-3">
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
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Width"
                    min="100"
                    step="100"
                  />
                  <span className="text-gray-500">×</span>
                  <input
                    type="number"
                    value={stock.length}
                    onChange={(e) => updateStockPlate(stock.id, 'length', parseFloat(e.target.value) || 0)}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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

          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {report && (
                <p>
                  Total plates in model: <span className="font-semibold text-gray-900">{report.plates?.length || 0}</span> types
                </p>
              )}
            </div>
            <button
              onClick={generateNesting}
              disabled={loading || !filename}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                loading || !filename
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </span>
              ) : (
                'Generate Nesting Plan'
              )}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {nestingResults && nestingResults.success && (
          <>
            {/* Statistics Summary */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Nesting Results</h2>
                <button
                  onClick={handleExportPDF}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export to PDF
                </button>
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
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Bill of Materials (BOM)</h2>
              
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
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Cutting Plans</h2>

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
                      <h3 className="text-lg font-semibold text-gray-900">
                        {nestingResults.cutting_plans[selectedPlanIndex].stock_name}
                      </h3>
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
                        </g>
                      ))}
                    </svg>
                  </div>

                  {/* Plates List */}
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Plates in this sheet:</h4>
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
          </>
        )}

        {/* No results message */}
        {nestingResults && !nestingResults.success && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <p className="text-center text-gray-600">
              {nestingResults.message || 'Failed to generate nesting plan'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

