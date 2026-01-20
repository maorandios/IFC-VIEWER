import { useState, useEffect } from 'react'
import { NestingReport as NestingReportType, SteelReport } from '../types'
import { pdf } from '@react-pdf/renderer'
import { NestingReportPDF } from './NestingReportPDF'

interface NestingReportProps {
  filename: string
  nestingReport: NestingReportType | null
  onNestingReportChange: (report: NestingReportType | null) => void
  report: SteelReport | null  // Report data to get available profiles
}

type Step = 'select' | 'results'

export default function NestingReport({ filename, nestingReport: propNestingReport, onNestingReportChange, report }: NestingReportProps) {
  // Use prop as source of truth, but maintain local state for updates
  const nestingReport = propNestingReport
  const [currentStep, setCurrentStep] = useState<Step>('select')
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedProfiles, setExpandedProfiles] = useState<Set<string>>(new Set())

  // Get available profiles from report
  const availableProfiles = report?.profiles || []

  // Default stock lengths: 6000mm and 12000mm
  const stockLengths = '6000,12000'
  
  const getDisplayPartName = (part: any): string => {
    const partData = part?.part || {}
    const reference = typeof partData.reference === 'string' && partData.reference.trim() ? partData.reference : null
    const elementName = typeof partData.element_name === 'string' && partData.element_name.trim() ? partData.element_name : null
    return reference || elementName || 'Unknown'
  }

  // Global canonical geometry map - established once across ALL profiles and patterns
  // This ensures parts with the same name have identical geometry everywhere
  const [globalCanonicalMap, setGlobalCanonicalMap] = useState<Map<string, { startDev: number; endDev: number; startSign: number; endSign: number } | null>>(new Map())

  // Build global canonical map whenever nesting report changes
  useEffect(() => {
    if (!nestingReport) {
      setGlobalCanonicalMap(new Map())
      return
    }

    const canonicalMap = new Map<string, { startDev: number; endDev: number; startSign: number; endSign: number } | null>()

    // Process ALL profiles and patterns to find first occurrence of each part
    nestingReport.profiles.forEach((profile) => {
      profile.cutting_patterns.forEach((pattern) => {
        pattern.parts.forEach((part) => {
          const partName = getDisplayPartName(part)
          
          // Only process if not already in map (first occurrence wins)
          if (!canonicalMap.has(partName)) {
            // Check both slope_info and part.part for angle data
            const slopeInfo = part?.slope_info || {}
            const partData = part?.part || {}
            
            const startMiter = slopeInfo.start_has_slope === true
            const endMiter = slopeInfo.end_has_slope === true

            // Debug: log the part data structure for b1024
            if (partName === 'b1024') {
              console.log(`[GLOBAL-CANONICAL-DEBUG] ${partName} part.part:`, partData)
              console.log(`[GLOBAL-CANONICAL-DEBUG] ${partName} slope_info:`, slopeInfo)
            }

            // Only store canonical geometry for parts with two mitered ends
            if (startMiter && endMiter) {
              // Try to use angles from part.part (original part definition) first
              let startAngle = partData.start_angle
              let endAngle = partData.end_angle
              
              // Fallback to slope_info if not in part.part
              if (startAngle == null) startAngle = slopeInfo.start_angle
              if (endAngle == null) endAngle = slopeInfo.end_angle

              if (startAngle != null && endAngle != null) {
                // Calculate deviation from 90 degrees
                const startDev = Math.abs(90 - Math.abs(startAngle))
                const endDev = Math.abs(90 - Math.abs(endAngle))
                const startSign = startAngle >= 0 ? 1 : -1
                const endSign = endAngle >= 0 ? 1 : -1

                canonicalMap.set(partName, {
                  startDev,
                  endDev,
                  startSign,
                  endSign
                })
                console.log(`[GLOBAL-CANONICAL] Setting canonical for ${partName}:`, { startDev, endDev, startSign, endSign, rawAngles: { startAngle, endAngle }, source: partData.start_angle != null ? 'part.part' : 'slope_info' })
              } else {
                canonicalMap.set(partName, null)
              }
            } else {
              // Mark as seen but no canonical geometry needed
              canonicalMap.set(partName, null)
            }
          }
        })
      })
    })

    console.log('[GLOBAL-CANONICAL] Built canonical map with', canonicalMap.size, 'entries')
    setGlobalCanonicalMap(canonicalMap)
  }, [nestingReport])

  // Don't load nesting data from localStorage - always start fresh
  // This ensures clean state when uploading new file or refreshing page

  const handleProfileToggle = (profileName: string) => {
    const newSelected = new Set(selectedProfiles)
    if (newSelected.has(profileName)) {
      newSelected.delete(profileName)
    } else {
      newSelected.add(profileName)
    }
    setSelectedProfiles(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedProfiles.size === availableProfiles.length) {
      setSelectedProfiles(new Set())
    } else {
      setSelectedProfiles(new Set(availableProfiles.map(p => p.profile_name)))
    }
  }

  const handleNext = () => {
    if (selectedProfiles.size === 0) {
      setError('Please select at least one profile to nest')
      return
    }
    setError(null)
    generateNesting()
  }

  const handleBack = () => {
    setCurrentStep('select')
    setError(null)
  }

  const handleReset = () => {
    // Clear all nesting state
    setSelectedProfiles(new Set())
    setCurrentStep('select')
    onNestingReportChange(null)  // Clear nesting report in parent
    setError(null)
    
    // Clear any existing localStorage entries for nesting (cleanup)
    try {
      localStorage.removeItem(`nesting_selected_profiles_${filename}`)
      localStorage.removeItem(`nesting_step_${filename}`)
    } catch (e) {
      console.error('Error clearing localStorage:', e)
    }
  }

  const handleExportToPDF = async () => {
    if (!nestingReport || !report) return

    try {
      const doc = <NestingReportPDF 
        nestingReport={nestingReport} 
        report={report} 
        filename={filename}
      />
      
      const asPdf = pdf(doc)
      const blob = await asPdf.toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${filename.replace('.ifc', '')}_nesting_report.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting to PDF:', error)
      alert('Failed to export PDF. Please try again.')
    }
  }

  const generateNesting = async () => {
    if (!filename || selectedProfiles.size === 0) return

    setLoading(true)
    setError(null)

    try {
      const encodedFilename = encodeURIComponent(filename)
      const params = new URLSearchParams({
        stock_lengths: stockLengths,
        profiles: Array.from(selectedProfiles).join(',')  // Pass selected profiles
      })
      const url = `/api/nesting/${encodedFilename}?${params.toString()}`

      const response = await fetch(url)
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Backend error response:', errorText)
        throw new Error(`Failed to generate nesting: ${response.status} ${response.statusText}\n\n${errorText}`)
      }

      const data: NestingReportType = await response.json()
      onNestingReportChange(data)
      setCurrentStep('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      console.error('Error generating nesting:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatLength = (mm: number) => {
    if (mm >= 1000) {
      return `${(mm / 1000).toFixed(2)}m`
    }
    return `${mm.toFixed(0)}mm`
  }

  const exportToCSV = () => {
    if (!nestingReport) return

    let csv = 'Profile,Stock Length (mm),Quantity Needed,Total Waste (mm),Waste %\n'
    
    nestingReport.profiles.forEach(profile => {
      Object.entries(profile.stock_lengths_used).forEach(([stockLength, quantity]) => {
        const profileData = nestingReport.profiles.find(p => p.profile_name === profile.profile_name)
        if (profileData) {
          csv += `${profile.profile_name},${stockLength},${quantity},${profile.total_waste.toFixed(2)},${profile.total_waste_percentage.toFixed(2)}%\n`
        }
      })
    })

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename.replace('.ifc', '')}_nesting_bom.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with controls */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Nesting Optimization</h2>
            <div className="flex items-center gap-2 mt-1">
              <div className={`px-3 py-1 rounded text-sm ${currentStep === 'select' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                Step 1: Select Profiles
              </div>
              <div className="text-gray-400">→</div>
              <div className={`px-3 py-1 rounded text-sm ${currentStep === 'results' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                Step 2: Results
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {currentStep === 'results' && (
              <>
                <button
                  onClick={handleBack}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
                >
                  ← Back
                </button>
                <button
                  onClick={exportToCSV}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
                >
                  📥 Export BOM
                </button>
              </>
            )}
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
              title="Reset nesting and start fresh"
            >
              🔄 Reset
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            Error: {error}
          </div>
        )}

        {/* Step 1: Profile Selection */}
        {currentStep === 'select' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold mb-2">Select Profiles for Nesting</h3>
                  <p className="text-gray-600">Choose which profiles you want to optimize for cutting</p>
                </div>
                <button
                  onClick={handleSelectAll}
                  className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                >
                  {selectedProfiles.size === availableProfiles.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {availableProfiles.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg mb-2">No profiles found</p>
                  <p className="text-sm">Upload an IFC file with beams, columns, or members to see profiles here</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-blue-900">
                        {selectedProfiles.size} of {availableProfiles.length} profiles selected
                      </span>
                      {selectedProfiles.size > 0 && (
                        <span className="text-sm text-blue-700">
                          Total parts: {availableProfiles
                            .filter(p => selectedProfiles.has(p.profile_name))
                            .reduce((sum, p) => sum + p.piece_count, 0)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto border rounded p-2">
                    {availableProfiles.map((profile, idx) => {
                      const isSelected = selectedProfiles.has(profile.profile_name)
                      return (
                        <label
                          key={idx}
                          className={`flex items-center p-4 border rounded cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleProfileToggle(profile.profile_name)}
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div className="ml-4 flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-lg">{profile.profile_name}</span>
                              </div>
                              <div className="text-right">
                                <div className="font-medium">{profile.piece_count} parts</div>
                                <div className="text-sm text-gray-500">{(profile.total_weight / 1000).toFixed(2)} tonnes</div>
                              </div>
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={handleNext}
                      disabled={loading || selectedProfiles.size === 0}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded font-medium"
                    >
                      {loading ? '⏳ Generating...' : 'Generate Nesting →'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Results */}
        {currentStep === 'results' && !nestingReport && !loading && (
          <div className="text-center text-gray-500 py-12">
            <p className="text-lg mb-2">No nesting data generated yet</p>
            <p className="text-sm">Go back to Step 1 to select profiles and generate nesting</p>
          </div>
        )}

        {currentStep === 'results' && nestingReport && (
          <>
            {/* Export to PDF Button */}
            <div className="mb-4 flex justify-end">
              <button
                onClick={handleExportToPDF}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-md transition-colors"
              >
                Export to PDF
              </button>
            </div>

            <div id="nesting-report-content">
            {/* Section 1: BOM Summary */}
            <div className="mb-8 page-break-after">
              <h2 className="text-2xl font-bold mb-4">Section 1: BOM Summary</h2>
              
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-800 text-white">
                        <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Profile Type</th>
                        <th className="border border-gray-300 px-4 py-3 text-right font-semibold">Bar Stock Length</th>
                        <th className="border border-gray-300 px-4 py-3 text-right font-semibold">Amount of Bars</th>
                        <th className="border border-gray-300 px-4 py-3 text-right font-semibold">Tonnage (tonnes)</th>
                        <th className="border border-gray-300 px-4 py-3 text-right font-semibold">Number of Cuts</th>
                        <th className="border border-gray-300 px-4 py-3 text-right font-semibold">Total Waste Tonnage</th>
                        <th className="border border-gray-300 px-4 py-3 text-right font-semibold">Total Waste in M</th>
                        <th className="border border-gray-300 px-4 py-3 text-right font-semibold">Total Waste %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nestingReport.profiles.map((profile, profileIdx) => {
                        // Get profile data from report to calculate weight per meter
                        const profileData = report?.profiles.find(p => p.profile_name === profile.profile_name)
                        
                        // Calculate weight per meter (kg/m) from report data
                        // weight_per_meter = total_weight_kg / (total_length_mm / 1000)
                        let weightPerMeter = 0
                        if (profileData && profile.total_length > 0) {
                          const totalLengthM = profile.total_length / 1000.0  // Convert mm to meters
                          weightPerMeter = profileData.total_weight / totalLengthM  // kg per meter
                        }
                        
                        // Group by stock length for this profile
                        // Filter out entries with 0 bars - only show active bars
                        const stockLengthEntries = Object.entries(profile.stock_lengths_used)
                          .filter(([_, barCount]) => barCount > 0)
                        
                        return stockLengthEntries.map(([stockLengthStr, barCount], stockIdx) => {
                          const stockLength = parseFloat(stockLengthStr)  // in mm
                          const stockLengthM = stockLength / 1000.0  // Convert to meters
                          
                          // Calculate tonnage: (weight_per_meter_kg) * (stock_length_m) * (number_of_bars) / 1000
                          const tonnage = (weightPerMeter * stockLengthM * barCount) / 1000.0  // tonnes
                          
                          // Calculate number of cuts for this stock length
                          // Count patterns that use this stock length
                          const patternsForThisStock = profile.cutting_patterns.filter(
                            p => Math.abs(p.stock_length - stockLength) < 0.01
                          )
                          
                          // Number of cuts = sum of (parts per bar - 1) for each bar
                          // Each bar has (number_of_parts - 1) cuts
                          const totalCuts = patternsForThisStock.reduce((sum, pattern) => {
                            return sum + Math.max(0, pattern.parts.length - 1)  // -1 because last part doesn't need a cut
                          }, 0)
                          
                          // Calculate total waste for this stock length
                          // Sum of waste from all patterns using this stock length
                          const totalWasteMm = patternsForThisStock.reduce((sum, pattern) => {
                            return sum + (pattern.waste || 0)
                          }, 0)
                          
                          // Calculate waste in meters
                          const totalWasteM = totalWasteMm / 1000.0
                          
                          // Calculate waste tonnage: (waste_mm / 1000) * weight_per_meter / 1000
                          const wasteTonnage = weightPerMeter > 0 && totalWasteMm > 0
                            ? (totalWasteM * weightPerMeter) / 1000.0
                            : 0
                          
                          // Get waste percentage for this stock length
                          // Average waste percentage across patterns using this stock length
                          const wasteForThisStock = patternsForThisStock.length > 0
                            ? patternsForThisStock.reduce((sum, p) => sum + p.waste_percentage, 0) / patternsForThisStock.length
                            : profile.total_waste_percentage
                          
                          return (
                            <tr 
                              key={`${profileIdx}-${stockIdx}`}
                              className={profileIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                            >
                              <td className="border border-gray-300 px-4 py-3 font-medium">
                                {profile.profile_name}
                              </td>
                              <td className="border border-gray-300 px-4 py-3 text-right">
                                {formatLength(stockLength)}
                              </td>
                              <td className="border border-gray-300 px-4 py-3 text-right">
                                {barCount}
                              </td>
                              <td className="border border-gray-300 px-4 py-3 text-right">
                                {tonnage > 0 ? tonnage.toFixed(3) : 'N/A'}
                              </td>
                              <td className="border border-gray-300 px-4 py-3 text-right">
                                {totalCuts}
                              </td>
                              <td className="border border-gray-300 px-4 py-3 text-right">
                                {wasteTonnage > 0 ? wasteTonnage.toFixed(3) : '0.000'}
                              </td>
                              <td className="border border-gray-300 px-4 py-3 text-right">
                                {totalWasteM > 0 ? totalWasteM.toFixed(2) : '0.00'}
                              </td>
                              <td className="border border-gray-300 px-4 py-3 text-right">
                                <span className={wasteForThisStock > 5 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                                  {wasteForThisStock.toFixed(2)}%
                                </span>
                              </td>
                            </tr>
                          )
                        })
                      })}
                    </tbody>
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td className="border border-gray-300 px-4 py-3">Total</td>
                        <td className="border border-gray-300 px-4 py-3 text-right">-</td>
                        <td className="border border-gray-300 px-4 py-3 text-right">
                          {nestingReport.summary.total_stock_bars}
                        </td>
                        <td className="border border-gray-300 px-4 py-3 text-right">
                          {nestingReport.profiles.reduce((total, profile) => {
                            const profileData = report?.profiles.find(p => p.profile_name === profile.profile_name)
                            if (!profileData || profile.total_length === 0) return total
                            
                            const weightPerMeter = profileData.total_weight / (profile.total_length / 1000.0)
                            const profileTonnage = Object.entries(profile.stock_lengths_used).reduce((sum, [stockLengthStr, barCount]) => {
                              const stockLengthM = parseFloat(stockLengthStr) / 1000.0
                              return sum + (weightPerMeter * stockLengthM * barCount) / 1000.0
                            }, 0)
                            
                            return total + profileTonnage
                          }, 0).toFixed(3)}
                        </td>
                        <td className="border border-gray-300 px-4 py-3 text-right">
                          {nestingReport.profiles.reduce((total, profile) => {
                            return total + profile.cutting_patterns.reduce((sum, pattern) => {
                              return sum + Math.max(0, pattern.parts.length - 1)
                            }, 0)
                          }, 0)}
                        </td>
                        <td className="border border-gray-300 px-4 py-3 text-right">
                          {nestingReport.profiles.reduce((total, profile) => {
                            const profileData = report?.profiles.find(p => p.profile_name === profile.profile_name)
                            if (!profileData || profile.total_length === 0) return total
                            
                            const weightPerMeter = profileData.total_weight / (profile.total_length / 1000.0)
                            const profileWasteTonnage = profile.cutting_patterns.reduce((sum, pattern) => {
                              const wasteM = (pattern.waste || 0) / 1000.0
                              return sum + (wasteM * weightPerMeter) / 1000.0
                            }, 0)
                            
                            return total + profileWasteTonnage
                          }, 0).toFixed(3)}
                        </td>
                        <td className="border border-gray-300 px-4 py-3 text-right">
                          {nestingReport.profiles.reduce((total, profile) => {
                            const profileWasteM = profile.cutting_patterns.reduce((sum, pattern) => {
                              return sum + ((pattern.waste || 0) / 1000.0)
                            }, 0)
                            return total + profileWasteM
                          }, 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-300 px-4 py-3 text-right">
                          <span className={nestingReport.summary.average_waste_percentage > 5 ? 'text-red-600' : 'text-green-600'}>
                            {nestingReport.summary.average_waste_percentage.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Error Parts Table - Only show if there are parts exceeding 12001mm */}
            {(() => {
              // Collect all rejected parts from all profiles where length > 12001mm
              const allErrorParts: Array<{
                profile_name: string
                reference: string
                length: number
              }> = []
              
              nestingReport.profiles.forEach(profile => {
                if (profile.rejected_parts && profile.rejected_parts.length > 0) {
                  profile.rejected_parts.forEach(rejectedPart => {
                    // Only include parts where length > 12001mm
                    if (rejectedPart.length > 12001) {
                      // Use the same logic as cutting list: reference || element_name || 'Unknown'
                      // Handle null, undefined, and empty string
                      const reference = rejectedPart.reference && rejectedPart.reference.trim() ? rejectedPart.reference : null
                      const elementName = rejectedPart.element_name && rejectedPart.element_name.trim() ? rejectedPart.element_name : null
                      const partName = reference || elementName || 'Unknown'
                      
                      allErrorParts.push({
                        profile_name: profile.profile_name,
                        reference: partName,
                        length: rejectedPart.length
                      })
                    }
                  })
                }
              })

              // Group by profile_name, reference, and length to count quantity
              const groupedErrorParts = new Map<string, {
                profile_name: string
                reference: string
                length: number
                quantity: number
              }>()

              allErrorParts.forEach(part => {
                const key = `${part.profile_name}|${part.reference}|${part.length.toFixed(2)}`
                if (groupedErrorParts.has(key)) {
                  groupedErrorParts.get(key)!.quantity++
                } else {
                  groupedErrorParts.set(key, {
                    profile_name: part.profile_name,
                    reference: part.reference,
                    length: part.length,
                    quantity: 1
                  })
                }
              })

              const errorPartsList = Array.from(groupedErrorParts.values())

              // Only render table if there are error parts
              if (errorPartsList.length === 0) {
                return null
              }

              return (
                <div className="mb-8 page-break-after">
                  <h2 className="text-2xl font-bold mb-4">Error Parts</h2>
                  
                  <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-800 text-white">
                            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Profile Type</th>
                            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Part Name</th>
                            <th className="border border-gray-300 px-4 py-3 text-right font-semibold">Cut Length (mm)</th>
                            <th className="border border-gray-300 px-4 py-3 text-right font-semibold">Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {errorPartsList.map((part, idx) => (
                            <tr 
                              key={`${part.profile_name}-${part.reference}-${idx}`}
                              className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                            >
                              <td className="border border-gray-300 px-4 py-3 font-medium">
                                {part.profile_name}
                              </td>
                              <td className="border border-gray-300 px-4 py-3">
                                {part.reference}
                              </td>
                              <td className="border border-gray-300 px-4 py-3 text-right">
                                {Math.round(part.length)}
                              </td>
                              <td className="border border-gray-300 px-4 py-3 text-right">
                                {part.quantity}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Section 2: Cutting Patterns */}
            <div className="page-break-before">
              <h2 className="text-2xl font-bold mb-4">Section 2: Cutting Patterns</h2>
              {nestingReport.profiles.map((profile, profileIdx) => {
                const profileKey = profile.profile_name
                const isExpanded = expandedProfiles.has(profileKey)
                
                const toggleProfile = () => {
                  const newExpanded = new Set(expandedProfiles)
                  if (isExpanded) {
                    newExpanded.delete(profileKey)
                  } else {
                    newExpanded.add(profileKey)
                  }
                  setExpandedProfiles(newExpanded)
                }
                
                return (
                  <div key={profileIdx} className="mb-4 border rounded">
                    {/* Collapsible header */}
                    <button
                      onClick={toggleProfile}
                      className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors rounded-t"
                    >
                      <h4 className="font-semibold text-lg text-left">
                    {profile.profile_name} ({profile.total_parts} parts)
                  </h4>
                      <span className="text-gray-600 text-xl font-bold">
                        {isExpanded ? '−' : '+'}
                      </span>
                    </button>
                  
                    {/* Collapsible content */}
                    {isExpanded && (
                      <div className="p-4">
                  {profile.cutting_patterns.map((pattern, patternIdx) => (
                    <div key={patternIdx} className="mb-4 p-3 bg-white rounded">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">
                          Bar {patternIdx + 1}: {formatLength(pattern.stock_length)} stock
                          {(pattern as any).exceeds_stock && (
                            <span className="ml-2 text-red-600 font-semibold text-xs">
                              ⚠️ Part exceeds stock length!
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-3">
                        <span className={`text-sm ${pattern.waste_percentage > 5 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                          Waste: {formatLength(pattern.waste)} ({pattern.waste_percentage.toFixed(2)}%)
                        </span>
                        </div>
                      </div>
                      
                      {/* Visual cutting diagram - Simple bar with segments and cut lines */}
                      <div className="mb-4 mt-4">
                        {/* Container with padding for labels */}
                        <div className="relative">
                          {/* Stock bar visualization - boundary-based cut lines */}
                          {/* Container with border matching the SVG border style */}
                          <div className="relative bg-white rounded mb-3 border border-gray-300" style={{ height: '60px', overflow: 'hidden' }}>
                            {/* Text labels rendered as absolute positioned divs to prevent SVG scaling */}
                            {/* Labels are rendered inside the SVG function to access partPositions */}
                            <svg key={`svg-${profileIdx}-${patternIdx}`} id={`stockbar-svg-${profileIdx}-${patternIdx}`} className="absolute inset-0 w-full h-full" viewBox="0 0 1000 60" preserveAspectRatio="none" shapeRendering="crispEdges">
                              <defs>
                                <clipPath id={`clip-${profileIdx}-${patternIdx}`}>
                                  <rect x="0" y="0" width="1000" height="60" />
                                </clipPath>
                              </defs>
                              {/* Stock bar border will be drawn after calculating actual dimensions */}
                              {(() => {
                                try {
                                  // Safety check: ensure pattern has required data
                                  if (!pattern || !pattern.parts || !Array.isArray(pattern.parts) || pattern.parts.length === 0) {
                                    return (
                                      <text x="500" y="30" fill="#666" fontSize="12" textAnchor="middle" dominantBaseline="middle">
                                        No parts data available
                                      </text>
                                    )
                                  }
                                  
                                  if (!pattern.stock_length || pattern.stock_length <= 0) {
                                    return (
                                      <text x="500" y="30" fill="#666" fontSize="12" textAnchor="middle" dominantBaseline="middle">
                                        Invalid stock length
                                      </text>
                                    )
                                  }
                                const barHeight = 60
                                const totalWidth = 1000
                                const stockLengthMm = pattern.stock_length
                                const pxPerMm = totalWidth / stockLengthMm
                                const ANGLE_MATCH_TOL = 2.0 // Tolerance for matching angles (degrees) - used in boundary resolution
                                const allowTwoSlopes = true // Allow parts to have 2 sloped ends
                                const markerInset = 8 // Inset from part edge for end markers (px)
                                
                                // Use actual cut angle to compute diagonal offset (in px)
                                const degToRad = (deg: number) => (deg * Math.PI) / 180
                                const clamp = (value: number, min: number, max: number) =>
                                  Math.max(min, Math.min(max, value))
                                
                                const calcDiagOffset = (devDeg: number | null | undefined, partWidthPx: number) => {
                                  if (!devDeg || devDeg <= 0) return 0
                                  const raw = Math.tan(degToRad(devDeg)) * (barHeight - 1)
                                  const maxAllowed = Math.max(2, Math.min(partWidthPx * 0.45, barHeight - 2))
                                  return clamp(raw, 0, maxAllowed)
                                }
                                
                                // Calculate miter offset based on the angle and bar height
                                // The offset represents the horizontal distance of the diagonal cut
                                // For visual clarity, we use a reduced scale factor
                                // Minimum visual offset ensures even small slopes (< 5°) are visible
                                const calcBoundaryOffset = (devDeg: number | null | undefined, partWidthPx: number) => {
                                  if (!devDeg || devDeg <= 0) return 0
                                  // Calculate the horizontal offset for the miter cut
                                  // Use 20% of bar height instead of full height for better visual proportions
                                  const visualHeight = (barHeight - 1) * 0.2
                                  const raw = Math.tan(degToRad(devDeg)) * visualHeight
                                  // Minimum visual offset of 8px to ensure even small slopes are visible
                                  // But scale it down for very narrow parts to avoid overflow
                                  const minVisualOffset = Math.min(8, partWidthPx * 0.15)
                                  // Clamp to reasonable values: max 20% of part width
                                  const maxAllowed = Math.min(partWidthPx * 0.2, visualHeight)
                                  // Ensure at least minVisualOffset, but don't exceed maxAllowed
                                  const withMinimum = Math.max(raw, minVisualOffset)
                                  return clamp(withMinimum, 0, maxAllowed)
                                }
                                
                                // A) Helper: Parse angle robustly
                                const parseAngle = (value: any): number | null => {
                                  if (value === null || value === undefined) return null
                                  if (typeof value === 'number') {
                                    return Number.isFinite(value) ? value : null
                                  }
                                  if (typeof value === 'string') {
                                    // Extract first signed float from string (handles "Start: +8.7°" format)
                                    const match = value.match(/-?\d+(\.\d+)?/)
                                    if (match) {
                                      const n = parseFloat(match[0])
                                      return Number.isFinite(n) ? n : null
                                    }
                                    return null
                                  }
                                  return null
                                }
                                
                                // Robust angle convention detection and deviation calculation
                                const MIN_DEV_DEG = 1.0 // Minimum deviation to consider a miter
                                const NEAR_STRAIGHT_THRESHOLD = 0.5 // Force straight if deviation < this
                                const TWO_SLOPE_SANITY_THRESHOLD = 2.0 // If both slope, treat smaller one as straight if < this
                                
                                interface AngleAnalysis {
                                  rawAngle: number | null
                                  convention: 'ABS' | 'DEV' | null
                                  deviation: number | null
                                  isSlope: boolean
                                }
                                
                                // Analyze angle: detect convention and compute deviation
                                const analyzeAngle = (rawAngle: number | null): AngleAnalysis => {
                                  if (rawAngle === null) {
                                    return { rawAngle: null, convention: null, deviation: null, isSlope: false }
                                  }
                                  
                                  const absAngle = Math.abs(rawAngle)
                                  
                                  // Detect convention: if angle is between 60-120, treat as ABS (90° = straight)
                                  // Otherwise treat as DEV (0° = straight)
                                  let convention: 'ABS' | 'DEV'
                                  let deviation: number
                                  
                                  if (absAngle >= 60 && absAngle <= 120) {
                                    // ABSOLUTE convention: 90° = straight
                                    convention = 'ABS'
                                    deviation = Math.abs(rawAngle - 90)
                                  } else {
                                    // DEVIATION convention: 0° = straight
                                    convention = 'DEV'
                                    deviation = absAngle
                                  }
                                  
                                  // Near-straight guard: force straight if very close
                                  let isSlope = false
                                  if (convention === 'ABS' && deviation < NEAR_STRAIGHT_THRESHOLD) {
                                    isSlope = false // Force straight
                                  } else if (convention === 'DEV' && deviation < NEAR_STRAIGHT_THRESHOLD) {
                                    isSlope = false // Force straight
                                  } else {
                                    // Normal threshold check
                                    isSlope = deviation >= MIN_DEV_DEG
                                  }
                                  
                                  return { rawAngle, convention, deviation, isSlope }
                                }
                                
                                // A) Layout: Compute x positions by cumulative sum of part.length
                                // DON'T SORT - use the order from the backend nesting algorithm
                                // Sorting was causing parts to be positioned incorrectly
                                const sortedParts = pattern.parts
                                
                                // Calculate total length of all parts first
                                const totalPartsLengthMm = sortedParts.reduce((sum, part) => sum + (part.length || 0), 0)
                                
                                // Calculate the available space for parts in pixels
                                // Reserve space for waste at the end
                                const wasteMm = pattern.waste || 0
                                const availableForPartsPx = 1000 * (1 - wasteMm / pattern.stock_length)
                                
                                // Calculate px per mm to fit all parts in available space
                                const partsPxPerMm = totalPartsLengthMm > 0 ? availableForPartsPx / totalPartsLengthMm : pxPerMm
                                
                                // Parts are flush (no gaps) in manufacturing mode
                                let cumulativeX = 0
                                const partPositions = sortedParts.map((part, partIdx) => {
                                  const lengthMm = part.length || 0
                                  const xStart = cumulativeX
                                  const xEnd = cumulativeX + (lengthMm * partsPxPerMm)
                                  cumulativeX = xEnd
                                  return { part, xStart, xEnd, lengthMm }
                                })
                                
                                const numParts = partPositions.length
                                const lastPartIdx = numParts - 1
                                // Calculate exact used length from actual part positions
                                const usedLengthMm = totalPartsLengthMm
                                
                                // Build orderByName map to group identical parts (by reference name)
                                const orderByName = new Map<string, Array<{ idx: number; part: any }>>()
                                partPositions.forEach((pos, idx) => {
                                  const partData = pos.part?.part || {}
                                  const partName = String(
                                    partData.reference || partData.element_name || partData.product_id || `b${idx + 1}`
                                  )
                                  if (!orderByName.has(partName)) {
                                    orderByName.set(partName, [])
                                  }
                                  orderByName.get(partName)!.push({ idx, part: pos.part })
                                })
                                
                                // DEBUG: Log overall pattern calculation
                                console.log(`[NESTING_DEBUG] Pattern ${patternIdx} overall calculation:`, {
                                  stockLengthMm: pattern.stock_length,
                                  totalWidth: 1000,
                                  pxPerMm,
                                  numParts,
                                  lastPartIdx,
                                  lastPartXEnd_raw: partPositions.length > 0 ? partPositions[lastPartIdx].xEnd : 0,
                                  usedLengthMm,
                                  usedLengthPx: usedLengthMm * pxPerMm,
                                  waste_mm: pattern.waste,
                                  cumulativeX_final: partPositions.length > 0 ? partPositions[lastPartIdx].xEnd : 0,
                                  firstPartXStart: partPositions.length > 0 ? partPositions[0].xStart : 0
                                })
                                
                                // Create mapping from part name to its number in the cutting list table
                                const partNameToNumber = new Map<string, number>()
                                try {
                                  const partGroups = new Map<string, { name: string, length: number, count: number }>()
                                  
                                  pattern.parts.forEach((part) => {
                                    try {
                                      const partName = getDisplayPartName(part)
                                      const partLength = part?.length || 0
                                      
                                      if (partGroups.has(partName)) {
                                        const existing = partGroups.get(partName)!
                                        existing.count += 1
                                      } else {
                                        partGroups.set(partName, {
                                          name: partName,
                                          length: partLength,
                                          count: 1
                                        })
                                      }
                                    } catch (e) {
                                      // Ignore individual part errors
                                    }
                                  })
                                  
                                  // Convert to array and sort by length (longest first, same as cutting list table)
                                  const sortedGroups = Array.from(partGroups.values()).sort((a, b) => {
                                    // Sort by length descending (longest first)
                                    return b.length - a.length
                                  })
                                  
                                  // Create mapping: part name -> table number (1-indexed)
                                  sortedGroups.forEach((group, idx) => {
                                    partNameToNumber.set(group.name, idx + 1)
                                  })
                                } catch (e) {
                                  // If mapping fails, labels will fall back to part names
                                }
                                
                                // B) Define "ends" per part (normalize inputs with deviation)
                                interface PartEnd {
                                  type: 'straight' | 'miter'
                                  rawAngle: number | null
                                  deviation: number | null
                                  angleSign: 1 | -1
                                }
                                
                                const partEnds = partPositions.map(({ part }, partIdx) => {
                                  try {
                                    if (!part) {
                                      throw new Error(`Part at index ${partIdx} is undefined`)
                                    }
                                    
                                  const slopeInfo = (part as any).slope_info || {}
                                  
                                  // Parse raw angles (for display purposes)
                                  const startRawAngle = parseAngle(slopeInfo.start_angle)
                                  const endRawAngle = parseAngle(slopeInfo.end_angle)
                                  
                                  // Use backend's has_slope flags if available (more reliable than recalculating)
                                  // Only recalculate from angles if flags are not provided (for backwards compatibility)
                                  const hasBackendFlags = slopeInfo.start_has_slope !== undefined || slopeInfo.end_has_slope !== undefined
                                  
                                  let startIsSlope: boolean
                                  let endIsSlope: boolean
                                  let startDeviation: number | null = null
                                  let endDeviation: number | null = null
                                  
                                  if (hasBackendFlags) {
                                    // Trust the backend's determination
                                    startIsSlope = slopeInfo.start_has_slope === true
                                    endIsSlope = slopeInfo.end_has_slope === true
                                    
                                    // Calculate deviation from angles for boundary detection
                                    // But respect backend's slope flags for rendering
                                    if (startRawAngle !== null) {
                                      const startAnalysis = analyzeAngle(startRawAngle)
                                      // Use calculated deviation for boundary matching, but...
                                      if (startIsSlope) {
                                        // Backend says it's a slope - calculate proper deviation
                                        startDeviation = startAnalysis.deviation
                                      } else {
                                        // Backend says no slope - still calculate deviation for boundary detection
                                        // but keep it for matching purposes (don't set to 0)
                                        startDeviation = startAnalysis.deviation || 0
                                      }
                                    } else {
                                      startDeviation = 0
                                    }
                                    
                                    if (endRawAngle !== null) {
                                      const endAnalysis = analyzeAngle(endRawAngle)
                                      if (endIsSlope) {
                                        // Backend says it's a slope - calculate proper deviation
                                        endDeviation = endAnalysis.deviation
                                      } else {
                                        // Backend says no slope - still calculate deviation for boundary detection
                                        endDeviation = endAnalysis.deviation || 0
                                      }
                                    } else {
                                      endDeviation = 0
                                    }
                                  } else {
                                    // Fallback: recalculate from angles (for backwards compatibility)
                                    const startAnalysis = analyzeAngle(startRawAngle)
                                    const endAnalysis = analyzeAngle(endRawAngle)
                                    
                                    startIsSlope = startAnalysis.isSlope
                                    endIsSlope = endAnalysis.isSlope
                                    startDeviation = startAnalysis.deviation
                                    endDeviation = endAnalysis.deviation
                                    
                                    // Sanity fallback: if both ends are slope AND one is tiny, treat tiny one as straight
                                    if (startIsSlope && endIsSlope) {
                                      const startDev = startAnalysis.deviation || 0
                                      const endDev = endAnalysis.deviation || 0
                                      const minDev = Math.min(startDev, endDev)
                                      
                                      if (minDev < TWO_SLOPE_SANITY_THRESHOLD) {
                                        if (startDev < endDev) {
                                          startIsSlope = false
                                        } else {
                                          endIsSlope = false
                                        }
                                      }
                                    }
                                  }
                                  
                                  const getAngleSign = (rawAngle: number | null): 1 | -1 => {
                                    if (rawAngle === null) return 1
                                    return rawAngle < 0 ? -1 : 1
                                  }
                                  
                                  const startCut: PartEnd = {
                                    type: startIsSlope ? 'miter' : 'straight',
                                    rawAngle: startRawAngle,
                                    deviation: startDeviation,
                                    angleSign: getAngleSign(startRawAngle)
                                  }
                                  
                                  const endCut: PartEnd = {
                                    type: endIsSlope ? 'miter' : 'straight',
                                    rawAngle: endRawAngle,
                                    deviation: endDeviation,
                                    angleSign: getAngleSign(endRawAngle)
                                  }
                                  
                                    // Debug logging for all parts
                                  const partName = part.part.reference || part.part.element_name || part.part.product_id || `b${partIdx + 1}`
                                    try {
                                      const startDevStr = startDeviation !== null ? startDeviation.toFixed(2) : 'null'
                                      const endDevStr = endDeviation !== null ? endDeviation.toFixed(2) : 'null'
                                      const backendFlag = hasBackendFlags ? `(backend: start=${slopeInfo.start_has_slope}, end=${slopeInfo.end_has_slope})` : '(recalculated)'
                                      console.log(`[ENDCLASS] id=${partName} startRaw=${startRawAngle} startDev=${startDevStr} startType=${startCut.type} endRaw=${endRawAngle} endDev=${endDevStr} endType=${endCut.type} ${backendFlag}`)
                                    } catch (e) {
                                      // Silently ignore logging errors
                                  }
                                  
                                  return { startCut, endCut }
                                  } catch (error) {
                                    // Fallback: return straight ends if there's any error
                                    console.error(`[ENDCLASS] Error processing part ${partIdx}:`, error)
                                    return {
                                      startCut: { type: 'straight' as const, rawAngle: null, deviation: null, angleSign: 1 },
                                      endCut: { type: 'straight' as const, rawAngle: null, deviation: null, angleSign: 1 }
                                    }
                                  }
                                })
                                
                                // D) Enforce per-part "slope budget" (if allowTwoSlopes is false)
                                // Note: We already normalized using deviation, so this is just for the allowTwoSlopes flag
                                let finalPartEnds = allowTwoSlopes 
                                  ? partEnds 
                                  : partEnds.map((ends) => {
                                      const { startCut, endCut } = ends
                                      const startMiter = startCut.type === 'miter'
                                      const endMiter = endCut.type === 'miter'
                                      
                                      if (startMiter && endMiter) {
                                        // Keep only the stronger slope (using deviation)
                                        const startDev = startCut.deviation || 0
                                        const endDev = endCut.deviation || 0
                                        
                                        if (startDev > endDev) {
                                          return { startCut, endCut: { type: 'straight', rawAngle: null, deviation: null, angleSign: 1 } }
                                        } else {
                                          return { startCut: { type: 'straight', rawAngle: null, deviation: null, angleSign: 1 }, endCut }
                                        }
                                      }
                                      
                                      return { startCut, endCut }
                                    })
                                
                                // LOCAL CANONICALIZATION: Ensure parts with the same name use IDENTICAL geometry
                                // This is CRITICAL for flashing - identical parts must have matching cut angles
                                const localCanonicalMap = new Map<string, { startDev: number; endDev: number; startSign: number; endSign: number; startType: string; endType: string }>()
                                
                                // Helper to get part name
                                const getPartNameForIdx = (idx: number) => {
                                  const partData = partPositions[idx]?.part?.part || {}
                                  return String(
                                    partData.reference || partData.element_name || partData.product_id || `b${idx + 1}`
                                  )
                                }
                                
                                // First pass: collect geometry from FIRST occurrence of each part name
                                // Skip complementary pairs as they have intentionally different orientations
                                partPositions.forEach(({ part }, idx) => {
                                  const partName = getPartNameForIdx(idx)
                                  const ends = finalPartEnds[idx]
                                  if (!ends) return
                                  
                                  // Skip complementary pairs - they should not be used as canonical geometry
                                  const isComplementaryPart = (part as any)?.slope_info?.complementary_pair === true
                                  if (isComplementaryPart) {
                                    console.log(`[LOCAL-CANON] Skipping part ${idx} as canonical source (complementary pair)`)
                                    return
                                  }
                                  
                                  if (!localCanonicalMap.has(partName)) {
                                    // Store the first non-complementary occurrence's geometry as canonical
                                    localCanonicalMap.set(partName, {
                                      startDev: ends.startCut.deviation || 0,
                                      endDev: ends.endCut.deviation || 0,
                                      startSign: ends.startCut.angleSign || 1,
                                      endSign: ends.endCut.angleSign || 1,
                                      startType: ends.startCut.type,
                                      endType: ends.endCut.type
                                    })
                                    console.log(`[LOCAL-CANON] Stored canonical for ${partName}:`, localCanonicalMap.get(partName))
                                  }
                                })
                                
                                // Second pass: apply canonical geometry to ALL instances
                                // EXCEPTION: Skip canonicalization for parts that are marked as complementary pairs
                                // Complementary pairs have intentionally different orientations and must preserve their actual slope info
                                finalPartEnds = finalPartEnds.map((ends, idx) => {
                                  if (!ends) return ends
                                  
                                  // Check if this part is part of a complementary pair
                                  const currentPart = partPositions[idx]?.part
                                  const isComplementaryPart = (currentPart as any)?.slope_info?.complementary_pair === true
                                  
                                  if (isComplementaryPart) {
                                    console.log(`[LOCAL-CANON] Skipping canonicalization for part ${idx} (complementary pair) - preserving actual slope info`)
                                    return ends  // Keep original geometry for complementary pairs
                                  }
                                  
                                  const partName = getPartNameForIdx(idx)
                                  const canonical = localCanonicalMap.get(partName)
                                  if (!canonical) return ends
                                  
                                  // Apply canonical geometry (use first occurrence's geometry for all instances)
                                  return {
                                    startCut: {
                                      ...ends.startCut,
                                      type: canonical.startType as 'straight' | 'miter',
                                      deviation: canonical.startDev,
                                      angleSign: canonical.startSign as 1 | -1
                                    },
                                    endCut: {
                                      ...ends.endCut,
                                      type: canonical.endType as 'straight' | 'miter',
                                      deviation: canonical.endDev,
                                      angleSign: canonical.endSign as 1 | -1
                                    }
                                  }
                                })
                                
                                // SMART ORIENTATION: For parts with two different slopes, orient them to maximize boundary sharing
                                // When consecutive parts have the same name, we want them to share boundaries
                                const partFlipStates = new Array(numParts).fill(false)
                                
                                // Step 1: Optimize first part - always start with straight cut if possible to minimize waste
                                if (numParts > 0) {
                                  const firstPart = finalPartEnds[0]
                                  if (firstPart) {
                                    const startDev = firstPart.startCut.deviation || 0
                                    const endDev = firstPart.endCut.deviation || 0
                                    const firstPartName = partPositions[0]?.part?.part?.reference || partPositions[0]?.part?.part?.element_name || 'part0'
                                    
                                    console.log(`[FIRST-PART-OPT] First part (${firstPartName}) cuts: start=${firstPart.startCut.type}(${startDev.toFixed(2)}°), end=${firstPart.endCut.type}(${endDev.toFixed(2)}°)`)
                                    
                                    // If first part has a straight end, flip it so straight is at position 0
                                    if (firstPart.endCut.type === 'straight' && firstPart.startCut.type === 'miter') {
                                      partFlipStates[0] = true
                                      console.log(`[FIRST-PART-OPT] Flipping first part to start with straight cut (minimize waste)`)
                                    }
                                    // Also handle case where both are miters but one is much smaller (near-straight)
                                    else if (firstPart.startCut.type === 'miter' && firstPart.endCut.type === 'miter') {
                                      // ONLY flip if one end is nearly straight (<5°) AND the other is significantly larger
                                      // Do NOT flip if BOTH ends have significant slopes (both >= MIN_DEV_DEG)
                                      const bothSignificantSlopes = startDev >= MIN_DEV_DEG && endDev >= MIN_DEV_DEG
                                      
                                      console.log(`[FIRST-PART-OPT] Both miters check: startDev=${startDev.toFixed(2)}, endDev=${endDev.toFixed(2)}, bothSignificant=${bothSignificantSlopes}, MIN_DEV_DEG=${MIN_DEV_DEG}`)
                                      
                                      if (bothSignificantSlopes) {
                                        console.log(`[FIRST-PART-OPT] NOT flipping - both ends have significant slopes (${startDev.toFixed(2)}° and ${endDev.toFixed(2)}°)`)
                                      } else if (endDev < startDev && endDev < 5.0) {
                                        // Only flip if end is nearly straight
                                        partFlipStates[0] = true
                                        console.log(`[FIRST-PART-OPT] Flipping first part to start with straighter end (${endDev.toFixed(2)}° vs ${startDev.toFixed(2)}°)`)
                                      }
                                    }
                                    // Also handle case where end is marked as straight but start is miter with near-zero deviation
                                    else if (firstPart.endCut.type === 'miter' && endDev < 1.0 && firstPart.startCut.type === 'miter' && startDev > 5.0) {
                                      partFlipStates[0] = true
                                      console.log(`[FIRST-PART-OPT] Flipping first part: end is nearly straight (${endDev.toFixed(2)}°), start is angled (${startDev.toFixed(2)}°)`)
                                    }
                                    
                                    console.log(`[FIRST-PART-OPT] First part flip decision: partFlipStates[0]=${partFlipStates[0]}`)
                                  }
                                }
                                
                                // Helper to check if two cuts can share a boundary
                                const cutsCanShare = (cut1: PartEnd, cut2: PartEnd): boolean => {
                                  if (cut1.type !== cut2.type) {
                                    // One straight, one miter - can share if miter is very small
                                    const dev1 = cut1.deviation || 0
                                    const dev2 = cut2.deviation || 0
                                    return (dev1 < 1.0 && dev2 < 1.0)
                                  }
                                  
                                  if (cut1.type === 'straight' && cut2.type === 'straight') {
                                    return true
                                  }
                                  
                                  if (cut1.type === 'miter' && cut2.type === 'miter') {
                                    // Both miters - check if angles match
                                    const dev1 = cut1.deviation || 0
                                    const dev2 = cut2.deviation || 0
                                    const devDiff = Math.abs(dev1 - dev2)
                                    return devDiff <= ANGLE_MATCH_TOL
                                  }
                                  
                                  return false
                                }
                                
                                // Greedy algorithm: iterate through parts and flip if needed to share boundaries
                                // IMPORTANT: Start from index 1 to preserve first part optimization for waste minimization
                                for (let i = 1; i < numParts - 1; i++) {
                                  const leftIdx = i
                                  const rightIdx = i + 1
                                  
                                  const leftName = getPartNameForIdx(leftIdx)
                                  const rightName = getPartNameForIdx(rightIdx)
                                  
                                  // Skip if this is a true complementary pair (different parts, right has complementary_pair flag)
                                  const leftPart = partPositions[leftIdx].part
                                  const rightPart = partPositions[rightIdx].part
                                  const rightIsComp = (rightPart as any).slope_info?.complementary_pair === true
                                  
                                  // Only skip if it's a TRUE complementary pair: different names AND right has the flag
                                  if (leftName !== rightName && rightIsComp) {
                                    console.log(`[FLIP-SKIP] Skipping ${leftIdx}-${rightIdx} because TRUE complementary pair (${leftName} + ${rightName})`)
                                    continue
                                  }
                                  
                                  // Only optimize if parts have the same name (identical parts)
                                  if (leftName !== rightName) {
                                    console.log(`[FLIP-SKIP] Skipping ${leftIdx}-${rightIdx} because different names: ${leftName} vs ${rightName}`)
                                    continue
                                  }
                                  
                                  const leftEnds = finalPartEnds[leftIdx]
                                  const rightEnds = finalPartEnds[rightIdx]
                                  
                                  if (!leftEnds || !rightEnds) {
                                    console.log(`[FLIP-SKIP] Skipping ${leftIdx}-${rightIdx} because missing ends`)
                                    continue
                                  }
                                  
                                  // Get current orientations
                                  const leftFlipped = partFlipStates[leftIdx]
                                  const rightFlipped = partFlipStates[rightIdx]
                                  
                                  const leftEndCut = leftFlipped ? leftEnds.startCut : leftEnds.endCut
                                  const rightStartCut = rightFlipped ? rightEnds.endCut : rightEnds.startCut
                                  
                                  console.log(`[FLIP-CHECK] ${leftIdx}(${leftName})-${rightIdx}(${rightName}): leftEnd=${leftEndCut.type}/${leftEndCut.deviation?.toFixed(2)}, rightStart=${rightStartCut.type}/${rightStartCut.deviation?.toFixed(2)}`)
                                  
                                  // Check if they currently share a boundary
                                  const currentlyShared = cutsCanShare(leftEndCut, rightStartCut)
                                  console.log(`[FLIP-CHECK] Currently shared: ${currentlyShared}`)
                                  
                                  if (!currentlyShared) {
                                    // Try flipping the right part to see if it helps
                                    const rightStartCutFlipped = !rightFlipped ? rightEnds.endCut : rightEnds.startCut
                                    console.log(`[FLIP-CHECK] If flipped, rightStart would be: ${rightStartCutFlipped.type}/${rightStartCutFlipped.deviation?.toFixed(2)}`)
                                    const wouldShareIfFlipped = cutsCanShare(leftEndCut, rightStartCutFlipped)
                                    console.log(`[FLIP-CHECK] Would share if flipped: ${wouldShareIfFlipped}`)
                                    
                                    if (wouldShareIfFlipped) {
                                      // Flip the right part
                                      partFlipStates[rightIdx] = !partFlipStates[rightIdx]
                                      console.log(`[ORIENTATION] Flipped part ${rightIdx} (${rightName}) to share boundary with part ${leftIdx}`)
                                    }
                                  }
                                }
                                
                                // Special case: Handle boundary between first (index 0) and second part (index 1)
                                // Only flip the SECOND part if needed, never the first (to preserve waste minimization)
                                if (numParts >= 2) {
                                  const leftIdx = 0
                                  const rightIdx = 1
                                  const leftName = getPartNameForIdx(leftIdx)
                                  const rightName = getPartNameForIdx(rightIdx)
                                  
                                  // Only optimize if parts have the same name (identical parts)
                                  if (leftName === rightName) {
                                    const leftEnds = finalPartEnds[leftIdx]
                                    const rightEnds = finalPartEnds[rightIdx]
                                    
                                    if (leftEnds && rightEnds) {
                                      const leftFlipped = partFlipStates[leftIdx]
                                      const rightFlipped = partFlipStates[rightIdx]
                                      
                                      const leftEndCut = leftFlipped ? leftEnds.startCut : leftEnds.endCut
                                      const rightStartCut = rightFlipped ? rightEnds.endCut : rightEnds.startCut
                                      
                                      const currentlyShared = cutsCanShare(leftEndCut, rightStartCut)
                                      
                                      if (!currentlyShared) {
                                        // Try flipping ONLY the right part (index 1), never the first
                                        const rightStartCutFlipped = !rightFlipped ? rightEnds.endCut : rightEnds.startCut
                                        const wouldShareIfFlipped = cutsCanShare(leftEndCut, rightStartCutFlipped)
                                        
                                        if (wouldShareIfFlipped) {
                                          partFlipStates[rightIdx] = !partFlipStates[rightIdx]
                                          console.log(`[ORIENTATION] Flipped part ${rightIdx} to share boundary with first part (preserving first part waste optimization)`)
                                        }
                                      }
                                    }
                                  }
                                }
                                
                                // CRITICAL FIX: For complementary pairs, check if parts need to be flipped for visualization
                                // The backend places parts to save material, but the slope_info might be in the "material" orientation
                                // We need to flip them for visualization so the miter cuts appear at the SHARED boundary
                                // IMPORTANT: Never flip the first part (index 0) to preserve waste minimization
                                for (let i = 0; i < numParts - 1; i++) {
                                  const leftPart = partPositions[i].part
                                  const rightPart = partPositions[i + 1].part
                                  const rightIsComp = (rightPart as any)?.slope_info?.complementary_pair === true
                                  
                                  if (rightIsComp) {
                                    // This is a complementary pair - check if they need flipping
                                    const leftEnds = finalPartEnds[i]
                                    const rightEnds = finalPartEnds[i + 1]
                                    
                                    if (leftEnds && rightEnds) {
                                      // Check if the miter cuts are at the OUTER edges instead of the shared boundary
                                      // If left part has miter at START and right part has miter at END, they need flipping
                                      const leftStartIsMiter = leftEnds.startCut.type === 'miter' && (leftEnds.startCut.deviation || 0) > 0
                                      const leftEndIsMiter = leftEnds.endCut.type === 'miter' && (leftEnds.endCut.deviation || 0) > 0
                                      const rightStartIsMiter = rightEnds.startCut.type === 'miter' && (rightEnds.startCut.deviation || 0) > 0
                                      const rightEndIsMiter = rightEnds.endCut.type === 'miter' && (rightEnds.endCut.deviation || 0) > 0
                                      
                                      // If left has miter at START (outer edge) and right has miter at END (outer edge),
                                      // but they should have miters at the SHARED boundary (left END, right START), flip them
                                      if (leftStartIsMiter && rightEndIsMiter && !leftEndIsMiter && !rightStartIsMiter) {
                                        // Special case: If left part is the first part (index 0), only flip the right part
                                        if (i === 0) {
                                          console.log(`[COMP-FLIP] Only flipping right part of complementary pair (preserving first part for waste minimization)`)
                                          partFlipStates[i + 1] = !partFlipStates[i + 1]
                                          // Note: This may result in non-matching cuts at boundary, but waste minimization takes priority
                                        } else {
                                          // For non-first parts, flip both to show miters at shared boundary
                                          console.log(`[COMP-FLIP] Toggling flip for complementary pair at indices ${i}, ${i+1} to show miters at shared boundary`)
                                          partFlipStates[i] = !partFlipStates[i]
                                          partFlipStates[i + 1] = !partFlipStates[i + 1]
                                        }
                                      }
                                    }
                                  }
                                }
                                
                                // Apply flips to finalPartEnds
                                finalPartEnds = finalPartEnds.map((ends, idx) => {
                                  if (!ends) return ends
                                  if (!partFlipStates[idx]) return ends
                                  
                                  // Swap start and end
                                  return {
                                    startCut: ends.endCut,
                                    endCut: ends.startCut
                                  }
                                })
                                
                                // DISABLED: Global canonicalization was causing incorrect rendering across different stock bars
                                // The angles from slope_info are already correct for each part's orientation
                                // finalPartEnds = finalPartEnds.map((ends, idx) => {
                                //   if (!ends) return ends
                                //   if (ends.startCut.type !== 'miter' || ends.endCut.type !== 'miter') return ends
                                //   
                                //   const partName = getDisplayPartName(partPositions[idx]?.part)
                                //   const canonical = globalCanonicalMap.get(partName)
                                //   
                                //   // If we have canonical geometry for this part, apply it
                                //   if (canonical) {
                                //     console.log(`[CANONICAL-APPLY] Part ${idx} (${partName}): APPLYING canonical`, canonical, 'was=', { startDev: ends.startCut.deviation, endDev: ends.endCut.deviation })
                                //     return {
                                //       startCut: {
                                //         ...ends.startCut,
                                //         deviation: canonical.startDev,
                                //         angleSign: canonical.startSign
                                //       },
                                //       endCut: {
                                //         ...ends.endCut,
                                //         deviation: canonical.endDev,
                                //         angleSign: canonical.endSign
                                //       }
                                //     }
                                //   }
                                //   
                                //   return ends
                                // })
                                
                                // C) Build boundary requests correctly (using deviation-normalized ends)
                                interface SlopeRequest {
                                  partIdx: number
                                  side: 'start' | 'end'
                                  rawAngle: number | null
                                  deviation: number | null
                                  owner: 'left' | 'right'
                                }
                                
                                interface Boundary {
                                  x: number
                                  isB0: boolean
                                  isBN: boolean
                                  requests: SlopeRequest[]
                                }
                                
                                const boundaries: Boundary[] = []
                                
                                // B0: boundary at x=0 (bar start)
                                if (numParts > 0) {
                                  const requests: SlopeRequest[] = []
                                  const firstPartEnd = finalPartEnds[0]
                                  if (firstPartEnd.startCut.type === 'miter') {
                                    requests.push({
                                      partIdx: 0,
                                      side: 'start',
                                      rawAngle: firstPartEnd.startCut.rawAngle,
                                      deviation: firstPartEnd.startCut.deviation,
                                      owner: 'right'
                                    })
                                  }
                                  boundaries.push({
                                    x: 0,
                                    isB0: true,
                                    isBN: false,
                                    requests
                                  })
                                }
                                
                                // Internal boundaries Bi (1..N-1): between part i-1 and i
                                for (let i = 1; i < numParts; i++) {
                                  const leftIdx = i - 1
                                  const rightIdx = i
                                  const requests: SlopeRequest[] = []
                                  
                                  // Left part requests slope on its END only if endMiter
                                  const leftPartEnd = finalPartEnds[leftIdx]
                                  if (leftPartEnd.endCut.type === 'miter') {
                                    requests.push({
                                      partIdx: leftIdx,
                                      side: 'end',
                                      rawAngle: leftPartEnd.endCut.rawAngle,
                                      deviation: leftPartEnd.endCut.deviation,
                                      owner: 'left'
                                    })
                                  }
                                  
                                  // Right part requests slope on its START only if startMiter
                                  const rightPartEnd = finalPartEnds[rightIdx]
                                  if (rightPartEnd.startCut.type === 'miter') {
                                    requests.push({
                                      partIdx: rightIdx,
                                      side: 'start',
                                      rawAngle: rightPartEnd.startCut.rawAngle,
                                      deviation: rightPartEnd.startCut.deviation,
                                      owner: 'right'
                                    })
                                  }
                                  
                                  // Also add requests for straight ends - both parts contribute to shared straight boundaries
                                  // This ensures we can detect shared straight boundaries
                                  if (leftPartEnd.endCut.type === 'straight' && rightPartEnd.startCut.type === 'straight') {
                                    // Both straight - this is a shared boundary, but we don't need to add requests
                                    // The absence of miter requests already indicates both are straight
                                  }
                                  
                                  boundaries.push({
                                    x: partPositions[i].xStart,
                                    isB0: false,
                                    isBN: false,
                                    requests
                                  })
                                }
                                
                                // BN: boundary at bar end (before waste)
                                if (numParts > 0) {
                                  const requests: SlopeRequest[] = []
                                  const lastPartEnd = finalPartEnds[lastPartIdx]
                                  if (lastPartEnd.endCut.type === 'miter') {
                                    requests.push({
                                      partIdx: lastPartIdx,
                                      side: 'end',
                                      rawAngle: lastPartEnd.endCut.rawAngle,
                                      deviation: lastPartEnd.endCut.deviation,
                                      owner: 'left'
                                    })
                                  }
                                  boundaries.push({
                                    x: partPositions[lastPartIdx].xEnd,
                                    isB0: false,
                                    isBN: true,
                                    requests
                                  })
                                }
                                
                                // E) Resolve each boundary to exactly ONE cut line (using deviation)
                                interface ResolvedBoundary {
                                  x: number
                                  lineType: 'straight' | 'sloped'
                                  ownerSide: 'left' | 'right' | null
                                  rawAngle: number | null
                                  deviation: number | null
                                }
                                
                                const resolveBoundary = (boundary: Boundary): ResolvedBoundary => {
                                  // Use same snapping as part rectangles (Math.floor) to avoid gaps/misalignment
                                  const xSnapped = Math.floor(boundary.x)
                                  
                                  // If no requests → STRAIGHT
                                  if (boundary.requests.length === 0) {
                                    return { x: xSnapped, lineType: 'straight', ownerSide: null, rawAngle: null, deviation: null }
                                  }
                                  
                                  // If 1 request → SLOPED owned by that request
                                  if (boundary.requests.length === 1) {
                                    const req = boundary.requests[0]
                                    return { x: xSnapped, lineType: 'sloped', ownerSide: req.owner, rawAngle: req.rawAngle, deviation: req.deviation }
                                  }
                                  
                                  // If 2 requests → decide if they represent the SAME shared miter cut
                                  const [reqLeft, reqRight] = boundary.requests
                                  const devLeft = reqLeft.deviation || 0
                                  const devRight = reqRight.deviation || 0
                                  const devDiff = Math.abs(devLeft - devRight)
                                  
                                  if (devDiff <= ANGLE_MATCH_TOL) {
                                    // Treat as SHARED → draw ONE diagonal (prefer LEFT)
                                    return { x: xSnapped, lineType: 'sloped', ownerSide: 'left', rawAngle: reqLeft.rawAngle, deviation: devLeft }
                                  } else {
                                    // Choose the larger deviation (more sloped)
                                    if (devLeft > devRight) {
                                      return { x: xSnapped, lineType: 'sloped', ownerSide: 'left', rawAngle: reqLeft.rawAngle, deviation: devLeft }
                                    } else if (devRight > devLeft) {
                                      return { x: xSnapped, lineType: 'sloped', ownerSide: 'right', rawAngle: reqRight.rawAngle, deviation: devRight }
                                    } else {
                                      // Tie: prefer LEFT (deterministic)
                                      return { x: xSnapped, lineType: 'sloped', ownerSide: 'left', rawAngle: reqLeft.rawAngle, deviation: devLeft }
                                    }
                                  }
                                }
                                
                                const resolvedBoundaries = boundaries.map(resolveBoundary)
                                
                                // De-duplicate boundaries at same x (keep SLOPED over STRAIGHT)
                                const boundaryMap = new Map<number, ResolvedBoundary>()
                                resolvedBoundaries.forEach(boundary => {
                                  const existing = boundaryMap.get(boundary.x)
                                  if (!existing || (existing.lineType === 'straight' && boundary.lineType === 'sloped')) {
                                    boundaryMap.set(boundary.x, boundary)
                                  }
                                })
                                
                                // Optimize part orientations for minimum waste visualization
                                // Determine which parts should be flipped to:
                                // 1. Start with straight cut if possible
                                const DISPLAY_ANGLE_MATCH_TOL = Math.max(ANGLE_MATCH_TOL, 5.0)
                                
                                // NO DP, NO FLIPPING - just render parts with their canonical geometry
                                const displayFlipStates: boolean[] = new Array(numParts).fill(false)
                                

                                // Canonicalize two-sided miter display by part name using majority order
                                const slopeOrderByName = new Map<string, { startGeEnd: number; startLtEnd: number }>()
                                partPositions.forEach(({ part }, idx) => {
                                  const ends = finalPartEnds[idx]
                                  if (!ends) return
                                  if (ends.startCut.type !== 'miter' || ends.endCut.type !== 'miter') return
                                  
                                  const partData = part?.part || {}
                                  const partName = String(
                                    partData.reference || partData.element_name || partData.product_id || `b${idx + 1}`
                                  )
                                  
                                  const startDev = ends.startCut.deviation || 0
                                  const endDev = ends.endCut.deviation || 0
                                  const counts = slopeOrderByName.get(partName) || { startGeEnd: 0, startLtEnd: 0 }
                                  if (startDev >= endDev) {
                                    counts.startGeEnd += 1
                                  } else {
                                    counts.startLtEnd += 1
                                  }
                                  slopeOrderByName.set(partName, counts)
                                })
                                
                                const getPartNameAt = (partIdx: number) => {
                                  const partData = partPositions[partIdx]?.part?.part || {}
                                  return String(
                                    partData.reference || partData.element_name || partData.product_id || `b${partIdx + 1}`
                                  )
                                }
                                
                                // Canonical ends are now already applied in finalPartEnds (using average geometry)
                                // No need for additional canonicalization here
                                
                                const nextOccurenceIdx = (partIdx: number) => {
                                  const name = getPartNameAt(partIdx)
                                  const list = orderByName.get(name)
                                  if (!list || list.length === 0) return null
                                  const pos = list.findIndex((item) => item.idx === partIdx)
                                  if (pos < 0 || pos + 1 >= list.length) return null
                                  return list[pos + 1]
                                }
                                
                                const shouldCanonicalizePart = (partIdx: number) => {
                                  if (partIdx === 0) return true
                                  return getPartNameAt(partIdx - 1) !== getPartNameAt(partIdx)
                                }
                                
                                // Since we canonicalized geometry, we don't need flip alignment anymore
                                // All instances use the same geometry from finalPartEnds
                                
                                const orientEnds = (ends: { startCut: PartEnd; endCut: PartEnd }, flip: boolean) => {
                                  if (!flip) return ends
                                  return { startCut: ends.endCut, endCut: ends.startCut }
                                }
                                
                                const getDisplayEndsForPart = (partIdx: number, useCanonical: boolean) => {
                                  // finalPartEnds already contains canonical geometry - just return it
                                  return finalPartEnds[partIdx] || null
                                }
                                
                                // DEBUG: Log slope info for repeated part names to diagnose proportion mismatches
                                try {
                                  const nameCounts = new Map<string, number>()
                                  partPositions.forEach(({ part }, idx) => {
                                    const partData = part?.part || {}
                                    const partName = String(
                                      partData.reference || partData.element_name || partData.product_id || `b${idx + 1}`
                                    )
                                    nameCounts.set(partName, (nameCounts.get(partName) || 0) + 1)
                                  })
                                  
                                  partPositions.forEach(({ part }, idx) => {
                                    const partData = part?.part || {}
                                    const partName = String(
                                      partData.reference || partData.element_name || partData.product_id || `b${idx + 1}`
                                    )
                                    
                                    if ((nameCounts.get(partName) || 0) < 2) return
                                    
                                    const ends = finalPartEnds[idx]
                                    if (!ends) return
                                    
                                    const isFlipped = displayFlipStates[idx]
                                    const startCut = isFlipped ? ends.endCut : ends.startCut
                                    const endCut = isFlipped ? ends.startCut : ends.endCut
                                    
                                    console.log('[SVG-PART-DIAG]', {
                                      partName,
                                      idx,
                                      flipped: isFlipped,
                                      startType: startCut.type,
                                      startDev: startCut.deviation,
                                      startSign: startCut.angleSign,
                                      endType: endCut.type,
                                      endDev: endCut.deviation,
                                      endSign: endCut.angleSign,
                                    })
                                  })
                                } catch (e) {
                                  // Ignore debug errors
                                }
                                  
                                
                                // Compute shared boundaries FIRST (before rendering parts)
                                // This ensures we know which boundaries are shared when rendering individual markers
                                const sharedBoundarySet = new Set<number>() // Set of boundary x positions that are shared
                                const sharedMiterBoundaryMap = new Map<number, { xTop: number; xBottom: number }>()
                                
                                for (let i = 0; i < numParts - 1; i++) {
                                    const leftPartIdx = i
                                    const rightPartIdx = i + 1
                                    const leftPartEnd = finalPartEnds[leftPartIdx]
                                    const rightPartEnd = finalPartEnds[rightPartIdx]
                                    
                                    if (!leftPartEnd || !rightPartEnd) {
                                      continue
                                    }
                                    
                                    // Use display flip states so identical parts render the same geometry
                                    const leftEndType = displayFlipStates[leftPartIdx] ? leftPartEnd.startCut.type : leftPartEnd.endCut.type
                                    const rightStartType = displayFlipStates[rightPartIdx] ? rightPartEnd.endCut.type : rightPartEnd.startCut.type
                                    const leftDev = displayFlipStates[leftPartIdx] ? leftPartEnd.startCut.deviation || 0 : leftPartEnd.endCut.deviation || 0
                                    const rightDev = displayFlipStates[rightPartIdx] ? rightPartEnd.endCut.deviation || 0 : rightPartEnd.startCut.deviation || 0
                                    const leftSign = displayFlipStates[leftPartIdx] ? leftPartEnd.startCut.angleSign : leftPartEnd.endCut.angleSign
                                    const rightSign = displayFlipStates[rightPartIdx] ? rightPartEnd.endCut.angleSign : rightPartEnd.startCut.angleSign
                                    
                                    const boundaryX = Math.floor(partPositions[leftPartIdx].xEnd)
                                    const NEAR_STRAIGHT_THRESHOLD_FOR_SHARING = 1.0
                                    
                                    const leftPartName = partPositions[leftPartIdx]?.part?.part?.reference || `b${leftPartIdx + 1}`
                                    const rightPartName = partPositions[rightPartIdx]?.part?.part?.reference || `b${rightPartIdx + 1}`
                                    
                                    // Check if this is a complementary pair
                                    const leftPart = partPositions[leftPartIdx]?.part
                                    const rightPart = partPositions[rightPartIdx]?.part
                                    const isComplementaryPair = 
                                      (leftPart as any)?.slope_info?.complementary_pair === true ||
                                      (rightPart as any)?.slope_info?.complementary_pair === true
                                    
                                    let isShared = false
                                    if (leftEndType === 'straight' && rightStartType === 'straight') {
                                      isShared = true
                                    } else if (leftEndType === 'miter' && rightStartType === 'miter') {
                                      const devDiff = Math.abs(leftDev - rightDev)
                                      // For complementary pairs with both miters, always treat as shared (they flash together)
                                      // For regular parts, use angle tolerance
                                      isShared = isComplementaryPair || (devDiff <= DISPLAY_ANGLE_MATCH_TOL)
                                    } else {
                                      const bothNearStraight = 
                                        (leftDev < NEAR_STRAIGHT_THRESHOLD_FOR_SHARING) && 
                                        (rightDev < NEAR_STRAIGHT_THRESHOLD_FOR_SHARING)
                                      isShared = bothNearStraight || true // Always share mixed types (parts are flush)
                                    }
                                    
                                    if (isShared) {
                                      sharedBoundarySet.add(boundaryX)
                                      
                                      // Track shared miter boundaries so both parts render the same diagonal line
                                      const leftIsMiter = leftEndType === 'miter' && leftDev > 0
                                      const rightIsMiter = rightStartType === 'miter' && rightDev > 0
                                      if (leftIsMiter && rightIsMiter) {
                                        const ownerSide = 'left'
                                        const ownerDev = leftDev
                                        const ownerSign = leftSign
                                        // Calculate the left part's width in pixels
                                        const leftPartWidth = Math.floor(partPositions[leftPartIdx].xEnd - partPositions[leftPartIdx].xStart)
                                        const offset = calcBoundaryOffset(ownerDev, leftPartWidth)
                                        const baseX = boundaryX + 0.5
                                        
                                        // Use left part's end geometry as the shared line
                                        const xTop = ownerSign >= 0 ? baseX - offset : baseX
                                        const xBottom = ownerSign >= 0 ? baseX : baseX - offset
                                        
                                        sharedMiterBoundaryMap.set(boundaryX, { xTop, xBottom })
                                      }
                                      
                                      // Debug log for b34, b37, b38 boundaries
                                      if (leftPartName === 'b34' || leftPartName === 'b37' || leftPartName === 'b38' ||
                                          rightPartName === 'b34' || rightPartName === 'b37' || rightPartName === 'b38') {
                                        try {
                                          console.log(`[SHARED-SET-ADD] ${leftPartName}-${rightPartName}: boundaryX=${boundaryX}, leftEndType=${leftEndType}, rightStartType=${rightStartType}`)
                                        } catch (e) {
                                          // Ignore
                                        }
                                      }
                                    }
                                  }
                                
                                return (
                                  <g clipPath={`url(#clip-${profileIdx}-${patternIdx})`}>
                                    {/* Stock bar background - white */}
                                    <rect
                                      x="0"
                                      y="0"
                                      width="1000"
                                      height="60"
                                      fill="#ffffff"
                                    />
                                    
                                    {/* Stock bar border is handled by container div border-gray-300 class */}
                                    {/* Draw each part as its own rectangle - FLUSH with pixel snapping (or with kerf gap in geometry view) */}
                                    {partPositions.map(({ part, xStart, xEnd }, partIdx) => {
                                      // Safety check: skip if part or partEndInfo is missing
                                      if (!part || !finalPartEnds[partIdx]) {
                                        return null
                                      }
                                      
                                      const partName = getDisplayPartName(part)
                                      const partEndInfo = finalPartEnds[partIdx]
                                      
                                      // Get the part number from the cutting list table mapping
                                      const partNameStr = String(partName || '')
                                      const partNumber = partNameToNumber.get(partNameStr) || partIdx + 1
                                      const displayLabel = partNameToNumber.has(partNameStr) ? String(partNumber) : partNameStr
                                      
                                      // ROBUST SOLUTION: Calculate exact boundaries to prevent gaps and overlaps
                                      
                                      // Calculate the exact boundary between parts and waste
                                      // This MUST be the same calculation used for waste start position
                                      const exactPartsEndPx = partPositions.length > 0 
                                        ? Math.floor(partPositions[lastPartIdx].xEnd)
                                        : 0
                                      
                                      // DEBUG: Log boundary calculation for first and last parts
                                      if (partIdx === 0 || partIdx === lastPartIdx) {
                                        console.log(`[NESTING_DEBUG] Part ${partIdx} (${partName}):`, {
                                          xStart_raw: xStart,
                                          xEnd_raw: xEnd,
                                          exactPartsEndPx,
                                          usedLengthMm,
                                          pxPerMm,
                                          calculatedUsedLengthPx: usedLengthMm * pxPerMm
                                        })
                                      }
                                      
                                      // Calculate pixel positions
                                      // Use the raw positions from backend, rounding to integers
                                      const xPx = Math.floor(xStart)
                                      
                                      // Calculate end position
                                      // CRITICAL: For last part, use the exact boundary (same as waste start)
                                      // For other parts: use calculated end position
                                      let endPx: number
                                      if (partIdx === lastPartIdx && pattern.waste > 0) {
                                        // Use the exact boundary - this MUST match waste start calculation
                                        endPx = exactPartsEndPx
                                        console.log(`[NESTING_DEBUG] Last part ${partIdx} (${partName}):`, {
                                          xPx,
                                          xEnd_raw: xEnd,
                                          exactPartsEndPx,
                                          endPx,
                                          waste: pattern.waste
                                        })
                                      } else {
                                        endPx = Math.floor(xEnd)
                                      }
                                      
                                      // Calculate width as integer pixels
                                      let wPx = endPx - xPx
                                      
                                      // CRITICAL: For last part, strictly enforce the boundary
                                      // The width MUST NOT exceed the exact boundary
                                      if (partIdx === lastPartIdx && pattern.waste > 0) {
                                        // Calculate the maximum allowed width - use exact boundary
                                        const maxAllowedWidth = exactPartsEndPx - xPx
                                        // STRICT: Use the exact boundary width, not the calculated wPx
                                        // This ensures the part cannot extend beyond the boundary
                                        wPx = Math.floor(maxAllowedWidth)
                                        console.log(`[NESTING_DEBUG] Last part width enforcement:`, {
                                          calculatedWPx: endPx - xPx,
                                          maxAllowedWidth,
                                          finalWPx: wPx,
                                          xPx,
                                          endPx,
                                          exactPartsEndPx,
                                          partWillEndAt: xPx + wPx,
                                          shouldMatchWasteStart: exactPartsEndPx,
                                          clipPathWidth: exactPartsEndPx - xPx
                                        })
                                      } else {
                                        // For other parts, just ensure integer
                                        wPx = Math.floor(wPx)
                                      }
                                      
                                      // Ensure minimum width of 1px
                                      wPx = Math.max(1, wPx)
                                      
                                      // DEBUG: Log first and last part final positions
                                      if (partIdx === 0) {
                                        const partLength = part?.length || 0
                                        const expectedWidthPx = partLength * pxPerMm
                                        const partLengthFromPositions = xEnd - xStart
                                        console.log(`[NESTING_DEBUG] First part ${partIdx} (${partName}) FINAL:`, {
                                          xPx,
                                          endPx,
                                          wPx,
                                          xStart_raw: xStart,
                                          xEnd_raw: xEnd,
                                          partEndsAt: xPx + wPx,
                                          partLength,
                                          partLengthFromPositions,
                                          expectedWidthPx,
                                          pxPerMm,
                                          widthMismatch: Math.abs(wPx - expectedWidthPx) > 1
                                        })
                                      }
                                      if (partIdx === lastPartIdx) {
                                        console.log(`[NESTING_DEBUG] Last part ${partIdx} (${partName}) FINAL:`, {
                                          xPx,
                                          endPx,
                                          wPx,
                                          exactPartsEndPx,
                                          partEndsAt: xPx + wPx,
                                          shouldMatchWasteStart: exactPartsEndPx
                                        })
                                      }
                                      
                                      // Check if this part's boundaries are shared using the precomputed set
                                      let startIsShared = false
                                      let endIsShared = false
                                      
                                      // Debug log for b34, b37, b38
                                      const shouldDebugPart = partName === 'b34' || partName === 'b37' || partName === 'b38'
                                      
                                      // Check start boundary (shared with previous part)
                                      if (partIdx > 0) {
                                        const boundaryX = Math.floor(partPositions[partIdx - 1].xEnd)
                                        startIsShared = sharedBoundarySet.has(boundaryX)
                                      }
                                      
                                      // Check end boundary (shared with next part)
                                      if (partIdx < numParts - 1) {
                                        const boundaryX = Math.floor(partPositions[partIdx].xEnd)
                                        endIsShared = sharedBoundarySet.has(boundaryX)
                                      } else if (partIdx === lastPartIdx && pattern.waste > 0) {
                                        // Last part with waste - always show end boundary (it's not shared with another part)
                                        endIsShared = false
                                      }
                                      
                                      // Debug log for b34, b37, b38
                                      if (shouldDebugPart) {
                                        try {
                                          const startBoundaryX = partIdx > 0 ? Math.round(xStart) : null
                                          const endBoundaryX = partIdx < numParts - 1 ? Math.round(partPositions[partIdx + 1].xStart) : null
                                          const startInSet = startBoundaryX !== null ? sharedBoundarySet.has(startBoundaryX) : null
                                          const endInSet = endBoundaryX !== null ? sharedBoundarySet.has(endBoundaryX) : null
                                          
                                          console.log(`[PART-MARKERS] ${partName}: startBoundaryX=${startBoundaryX} startInSet=${startInSet} startIsShared=${startIsShared} willShowStart=${!startIsShared} | endBoundaryX=${endBoundaryX} endInSet=${endInSet} endIsShared=${endIsShared} willShowEnd=${!endIsShared}`)
                                        } catch (e) {
                                          // Ignore
                                        }
                                      }
                                      
                                      // Hide label if rectangle too small (min width threshold)
                                      const minLabelWidth = 30
                                      const showLabel = wPx >= minLabelWidth
                                      
                                      // Only create clip path for the last part to prevent overflow into waste
                                      const isLastPart = partIdx === lastPartIdx && pattern.waste > 0
                                      const partClipId = isLastPart ? `part-clip-${profileIdx}-${patternIdx}-${partIdx}` : null
                                      
                                      return (
                                        <g key={partIdx}>
                                          {/* Define clip path ONLY for last part */}
                                          {isLastPart && (
                                          <defs>
                                              <clipPath id={partClipId!}>
                                                {/* For last part, use exact boundary to prevent ANY overflow into waste */}
                                                {/* CRITICAL: Use exact boundary calculation directly, not wPx, to ensure strict clipping */}
                                          <rect
                                            x={xPx}
                                            y="0"
                                                  width={exactPartsEndPx - xPx + 1}  // Add 1px to ensure polygon fills completely
                                            height={barHeight}
                                                />
                                              </clipPath>
                                            </defs>
                                          )}
                                          
                                          {/* Part shape matching actual cut geometry - polygon with angled ends */}
                                          {/* All coordinates are already integers, ensuring pixel-perfect rendering */}
                                          {/* CRITICAL: Only use clipPath for last part to prevent overflow */}
                                          {/* Calculate polygon boundaries once and reuse for both polygon and markers */}
                                          {(() => {
                                            // Use canonical geometry directly - no flipping
                                            const displayEnds = getDisplayEndsForPart(partIdx, shouldCanonicalizePart(partIdx)) || partEndInfo
                                            const startType = displayEnds.startCut.type
                                            const endType = displayEnds.endCut.type
                                            const startDev = displayEnds.startCut.deviation || 0
                                            const endDev = displayEnds.endCut.deviation || 0
                                            const startSign = displayEnds.startCut.angleSign
                                            const endSign = displayEnds.endCut.angleSign
                                            
                                            // Use same constants as marker lines
                                            const markerInset = 8
                                            
                                            // CRITICAL: The marker lines show the correct boundaries (vertical lines at cut positions)
                                            // The polygon must be clipped to these vertical marker line positions
                                            // For sloped parts, the polygon should NOT extend beyond the vertical marker lines
                                            
                                            // Calculate the vertical marker line positions (where the actual cuts are)
                                            // These are the boundaries that the polygon must respect
                                            let markerLeftX: number
                                            let markerRightX: number
                                            
                                            // Start boundary (left side) - get the vertical marker line position
                                            if (partIdx === 0) {
                                              // First part: marker is at x=0
                                              markerLeftX = xPx
                                            } else if (startIsShared) {
                                              // Shared boundary: marker is at the boundary position
                                              markerLeftX = xPx
                                            } else {
                                              // Non-shared boundary: marker is at xPx + markerInset for straight, or at the vertical position for miter
                                              // For miter cuts, the marker line is still vertical at the boundary position
                                              // The diagonal line shows the slope, but the boundary is vertical
                                              markerLeftX = startType === 'straight' ? xPx + markerInset : xPx
                                            }
                                            
                                            // End boundary (right side) - get the vertical marker line position
                                            if (partIdx === lastPartIdx && pattern.waste > 0) {
                                              // Last part: marker is at exactPartsEndPx
                                              markerRightX = exactPartsEndPx
                                            } else if (partIdx === lastPartIdx && pattern.waste === 0) {
                                              // Last part with 0 waste: marker is at end of stockbar
                                              markerRightX = 1000
                                            } else if (endIsShared) {
                                              // Shared boundary: marker is at the boundary position
                                              markerRightX = endPx
                                            } else {
                                              // Non-shared boundary: marker is at endPx - markerInset for straight, or at the vertical position for miter
                                              markerRightX = endType === 'straight' ? endPx - markerInset : endPx
                                            }
                                            
                                            // Polygon fills the part width from xPx to endPx
                                            // Each part gets its natural width, no stretching
                                            const polyLeftX = xPx + 0.5
                                            const polyRightX = endPx + 0.5
                                            
                                            // Create polygon from this part's own geometry (consistent per part number)
                                            let points: string
                                            
                                            // SIMPLIFIED LOGIC: Just use the geometry from the backend directly
                                            // The backend knows best - if it says there's a miter, show it (except at stock edges)
                                            // First part should never have slope at start (stock edge)
                                            // Last part should never have slope at end (stock edge) unless there's waste
                                            let hasSlopedStart: boolean
                                            let hasSlopedEnd: boolean
                                            
                                            // Show slope at start if: geometry has miter AND (not at stock edge OR part has two significant slopes)
                                            // For first part (partIdx === 0): show start slope ONLY if part has TWO significant miters
                                            const bothSignificantMiters = startType === 'miter' && endType === 'miter' && startDev >= 1.0 && endDev >= 1.0
                                            hasSlopedStart = startType === 'miter' && startDev > 0 && (partIdx > 0 || bothSignificantMiters)
                                            
                                            // Show slope at end if: geometry has miter AND (not at last part OR last part with waste)
                                            hasSlopedEnd = endType === 'miter' && endDev > 0 && (partIdx < numParts - 1 || (partIdx === lastPartIdx && pattern.waste > 0))
                                            
                                            const actualRightX = (partIdx === lastPartIdx && pattern.waste > 0 && hasSlopedEnd)
                                              ? exactPartsEndPx + 0.5
                                              : polyRightX
                                            
                                            const startOffset = hasSlopedStart ? calcBoundaryOffset(startDev, wPx) : 0
                                            const endOffset = hasSlopedEnd ? calcBoundaryOffset(endDev, wPx) : 0
                                            
                                            // Debug offset calculation for first few parts
                                            if (partIdx <= 1) {
                                              console.log(`[OFFSET-CALC] Part ${partIdx} (${partName}):`, {
                                                startDev,
                                                endDev,
                                                barHeight,
                                                wPx,
                                                startOffsetRaw: startDev ? Math.tan(degToRad(startDev)) * (barHeight - 1) : 0,
                                                endOffsetRaw: endDev ? Math.tan(degToRad(endDev)) * (barHeight - 1) : 0,
                                                maxAllowedStart: wPx * 0.45,
                                                maxAllowedEnd: wPx * 0.45,
                                                startOffset,
                                                endOffset
                                              })
                                            }
                                            
                                            const clampX = (x: number) => Math.max(0, Math.min(1000, x))
                                            
                                            // Calculate left edge points
                                            let topLeftX: number
                                            let bottomLeftX: number
                                            if (hasSlopedStart) {
                                              // Apply miter offset based on sign
                                              topLeftX = clampX(startSign >= 0 ? polyLeftX : polyLeftX + startOffset)
                                              bottomLeftX = clampX(startSign >= 0 ? polyLeftX + startOffset : polyLeftX)
                                            } else {
                                              // Straight edge - no offset
                                              topLeftX = clampX(polyLeftX)
                                              bottomLeftX = clampX(polyLeftX)
                                            }
                                            
                                            // Calculate right edge points
                                            let topRightX: number
                                            let bottomRightX: number
                                            if (hasSlopedEnd) {
                                              // Apply miter offset based on sign
                                              topRightX = clampX(endSign >= 0 ? actualRightX - endOffset : actualRightX)
                                              bottomRightX = clampX(endSign >= 0 ? actualRightX : actualRightX - endOffset)
                                            } else {
                                              // Straight edge - no offset
                                              topRightX = clampX(actualRightX)
                                              bottomRightX = clampX(actualRightX)
                                            }
                                            
                                            // If this boundary is a shared complementary miter, force both parts to use the same line
                                            if (startIsShared && startType === 'miter' && partIdx > 0) {
                                              const boundaryX = Math.floor(partPositions[partIdx - 1].xEnd)
                                              const sharedLine = sharedMiterBoundaryMap.get(boundaryX)
                                              if (sharedLine) {
                                                topLeftX = clampX(sharedLine.xTop)
                                                bottomLeftX = clampX(sharedLine.xBottom)
                                              }
                                            }
                                            
                                            if (endIsShared && endType === 'miter' && partIdx < numParts - 1) {
                                              const boundaryX = Math.floor(partPositions[partIdx].xEnd)
                                              const sharedLine = sharedMiterBoundaryMap.get(boundaryX)
                                              if (sharedLine) {
                                                topRightX = clampX(sharedLine.xTop)
                                                bottomRightX = clampX(sharedLine.xBottom)
                                              }
                                            }
                                            
                                            // Debug logging for polygon calculation
                                            if (partIdx === 0 || partIdx === 1) {
                                              console.log(`[POLYGON-WIDTH] Part ${partIdx} (${partName}): polyLeft=${polyLeftX.toFixed(2)} polyRight=${polyRightX.toFixed(2)} visualWidth=${(polyRightX - polyLeftX).toFixed(2)} xPx=${xPx} endPx=${endPx} wPx=${wPx}`)
                                              console.log(`[POLYGON-OFFSET] Part ${partIdx} (${partName}): startOffset=${startOffset.toFixed(2)} endOffset=${endOffset.toFixed(2)} startDev=${startDev.toFixed(2)} endDev=${endDev.toFixed(2)}`)
                                              console.log(`[POLYGON-SLOPED] Part ${partIdx} (${partName}): hasSlopedStart=${hasSlopedStart} hasSlopedEnd=${hasSlopedEnd} startIsShared=${startIsShared} endIsShared=${endIsShared} startSign=${startSign} endSign=${endSign}`)
                                              console.log(`[POLYGON-POINTS-FINAL] Part ${partIdx} (${partName}): topLeft=${topLeftX.toFixed(2)} bottomLeft=${bottomLeftX.toFixed(2)} topRight=${topRightX.toFixed(2)} bottomRight=${bottomRightX.toFixed(2)}`)
                                            }
                                            
                                            points = `${topLeftX},0.5 ${topRightX},0.5 ${bottomRightX},${barHeight - 0.5} ${bottomLeftX},${barHeight - 0.5}`
                                            
                                            const startMarkerOffset = startType === 'miter' ? calcBoundaryOffset(startDev, wPx) : 0
                                            const endMarkerOffset = endType === 'miter' ? calcBoundaryOffset(endDev, wPx) : 0
                                            
                                            const startMarkerTopX = startSign >= 0 ? polyLeftX : polyLeftX + startMarkerOffset
                                            const startMarkerBottomX = startSign >= 0 ? polyLeftX + startMarkerOffset : polyLeftX
                                            const endMarkerTopX = endSign >= 0 ? polyRightX - endMarkerOffset : polyRightX
                                            const endMarkerBottomX = endSign >= 0 ? polyRightX : polyRightX - endMarkerOffset
                                            
                                            // Calculate center X for part label - use actual polygon boundaries
                                            // Center between left and right (the actual visible boundaries)
                                            const centerX = (polyLeftX + polyRightX) / 2
                                            
                                            return (
                                              <>
                                                {/* Polygon drawn WITHOUT clip path to preserve complete borders */}
                                                {/* The polygon coordinates are already constrained to not extend into waste */}
                                                <polygon
                                                  points={points}
                                                  fill="none"
                                                  stroke="#9ca3af"
                                                  strokeWidth="1"
                                                  strokeLinejoin="miter"
                                                  shapeRendering="crispEdges"
                                                />
                                                
                                                {/* Per-part end markers - vertical lines at the boundary positions */}
                                                {/* Only show markers for non-shared boundaries */}
                                                {/* Shared boundaries will be drawn separately after all parts */}
                                                {/* Marker lines are vertical for straight cuts, diagonal for miter cuts */}
                                                <g clipPath={isLastPart ? `url(#${partClipId!})` : undefined}>
                                                  {/* Start cut marker - only if NOT shared AND NOT first part (first part start is stock bar edge) */}
                                                  {!startIsShared && partIdx > 0 && (
                                                    <>
                                                      {startType === 'miter' ? (
                                                        // Sloped start boundary - draw diagonal line
                                                        // Part is on the right of this boundary, so diagonal goes from (boundaryX, 0) to (boundaryX + 12, height)
                                                        <line
                                                          x1={startMarkerTopX}
                                                          y1="0.5"
                                                          x2={startMarkerBottomX}
                                                          y2={barHeight - 0.5}
                                                          stroke="#9ca3af"
                                                          strokeWidth="1"
                                                          strokeLinecap="butt"
                                                          shapeRendering="crispEdges"
                                                        />
                                                      ) : (
                                                        // Straight start boundary
                                                        <line
                                                          x1={polyLeftX}
                                                          y1="0.5"
                                                          x2={polyLeftX}
                                                          y2={barHeight - 0.5}
                                                          stroke="#9ca3af"
                                                          strokeWidth="1"
                                                          strokeLinecap="butt"
                                                          shapeRendering="crispEdges"
                                                        />
                                                      )}
                                                    </>
                                                  )}
                                                  
                                                  {/* End cut marker - for non-last parts or last part with waste */}
                                                  {(() => {
                                                    const isLastPartWithWaste = partIdx === lastPartIdx && pattern.waste > 0
                                                    const shouldShowMarker = !endIsShared || isLastPartWithWaste
                                                    
                                                    if (!shouldShowMarker) return null
                                                    
                                                    // For last part with straight cut, don't draw here (will be drawn outside clipPath)
                                                    if (isLastPartWithWaste && endType === 'straight') {
                                                      return null
                                                    }
                                                    
                                                    return (
                                                      <>
                                                        {endType === 'miter' ? (
                                                          // Sloped end boundary - draw diagonal line
                                                          // Part is on the left of this boundary, so diagonal goes from (boundaryX - 12, 0) to (boundaryX, height)
                                                          <line
                                                          x1={endMarkerTopX}
                                                            y1="0.5"
                                                          x2={endMarkerBottomX}
                                                            y2={barHeight - 0.5}
                                                            stroke="#9ca3af"
                                                            strokeWidth="1"
                                                            strokeLinecap="butt"
                                                            shapeRendering="crispEdges"
                                                          />
                                                        ) : (
                                                          // Straight end boundary
                                                          <line
                                                            x1={polyRightX}
                                                            y1="0.5"
                                                            x2={polyRightX}
                                                            y2={barHeight - 0.5}
                                                            stroke="#9ca3af"
                                                            strokeWidth="1"
                                                            strokeLinecap="butt"
                                                            shapeRendering="crispEdges"
                                                          />
                                                        )}
                                                      </>
                                                    )
                                                  })()}
                                                </g>
                                                
                                                {/* Part labels are now rendered as absolute positioned divs outside SVG */}
                                              </>
                                            )
                                          })()}
                                          
                                          {/* End boundary line for last part - draw outside clipPath to ensure visibility */}
                                          {/* For miter cuts, draw diagonal line; for straight cuts, draw vertical line */}
                                          {isLastPart && exactPartsEndPx > 0 && (() => {
                                            // Get endType for the last part - no flipping
                                            const displayEnds = getDisplayEndsForPart(partIdx, shouldCanonicalizePart(partIdx)) || partEndInfo
                                            const endType = displayEnds.endCut.type
                                            const endDev = displayEnds.endCut.deviation || 0
                                            const endSign = displayEnds.endCut.angleSign
                                            const partWidthPx = Math.max(1, exactPartsEndPx - xPx)
                                            const endOffset = calcBoundaryOffset(endDev, partWidthPx)
                                            
                                            if (endType === 'miter') {
                                              // Sloped end boundary - draw diagonal line
                                              return (
                                                <line
                                                  key={`last-part-boundary-${partIdx}`}
                                                  x1={(endSign >= 0 ? exactPartsEndPx - endOffset : exactPartsEndPx + 0.5)}
                                                  y1="0.5"
                                                  x2={(endSign >= 0 ? exactPartsEndPx + 0.5 : exactPartsEndPx - endOffset)}
                                                  y2={barHeight - 0.5}
                                                  stroke="#9ca3af"
                                                  strokeWidth="1"
                                                  strokeLinecap="butt"
                                                  shapeRendering="crispEdges"
                                                />
                                              )
                                            } else {
                                              // Straight end boundary
                                              return (
                                                <line
                                                  key={`last-part-boundary-${partIdx}`}
                                                  x1={exactPartsEndPx + 0.5}
                                                  y1="0.5"
                                                  x2={exactPartsEndPx + 0.5}
                                                  y2={barHeight - 0.5}
                                                  stroke="#9ca3af"
                                                  strokeWidth="1"
                                                  strokeLinecap="butt"
                                                  shapeRendering="crispEdges"
                                                />
                                              )
                                            }
                                          })()}
                                        </g>
                                      )
                                    })}
                                    
                                    {/* Shared boundary markers removed to avoid double-edges */}
                                    {false && (() => {
                                      // Iterate through ALL internal boundaries between parts (not just boundaryMap)
                                      const sharedBoundaries: Array<{ x: number, leftPartIdx: number, rightPartIdx: number, leftEndType: string, rightStartType: string, leftDev: number, rightDev: number }> = []
                                      
                                      for (let i = 0; i < numParts - 1; i++) {
                                        const leftPartIdx = i
                                        const rightPartIdx = i + 1
                                        
                                        const leftPartEnd = finalPartEnds[leftPartIdx]
                                        const rightPartEnd = finalPartEnds[rightPartIdx]
                                        
                                        if (!leftPartEnd || !rightPartEnd) {
                                          continue
                                        }
                                        
                                        // Use display flip states so identical parts render the same geometry
                                        const leftEndType = displayFlipStates[leftPartIdx] ? leftPartEnd.startCut.type : leftPartEnd.endCut.type
                                        const rightStartType = displayFlipStates[rightPartIdx] ? rightPartEnd.endCut.type : rightPartEnd.startCut.type
                                        const leftDev = displayFlipStates[leftPartIdx] ? leftPartEnd.startCut.deviation || 0 : leftPartEnd.endCut.deviation || 0
                                        const rightDev = displayFlipStates[rightPartIdx] ? rightPartEnd.endCut.deviation || 0 : rightPartEnd.startCut.deviation || 0
                                        
                                        // Boundary x position is the start of the right part
                                        // CRITICAL: Use the EXACT same calculation as the part rectangles to ensure alignment
                                        // Part rectangles use: xPx = partIdx === 0 ? 0 : Math.floor(xStart)
                                        // So boundary should use the same logic
                                        const rightPartXStart = partPositions[rightPartIdx].xStart
                                        const boundaryX = rightPartIdx === 0 ? 0 : Math.floor(rightPartXStart)
                                        
                                        // Debug log for ALL boundaries involving b34, b37, b38 (before checking if shared)
                                        const leftPartName = partPositions[leftPartIdx]?.part?.part?.reference || `b${leftPartIdx + 1}`
                                        const rightPartName = partPositions[rightPartIdx]?.part?.part?.reference || `b${rightPartIdx + 1}`
                                        
                                        // Log all boundaries for debugging (only for b34, b37, b38)
                                        const shouldLog = leftPartName === 'b34' || leftPartName === 'b37' || leftPartName === 'b38' ||
                                                         rightPartName === 'b34' || rightPartName === 'b37' || rightPartName === 'b38'
                                        
                                        // Check if it's truly shared (both parts have matching types)
                                        let isShared = false
                                        
                                        // Check if shared: both parts must have matching end types
                                        // OR both are very close to straight (near-straight threshold)
                                        const NEAR_STRAIGHT_THRESHOLD_FOR_SHARING = 1.0 // More lenient for sharing detection
                                        
                                        if (leftEndType === 'straight' && rightStartType === 'straight') {
                                          // Both straight = shared straight boundary
                                          isShared = true
                                        } else if (leftEndType === 'miter' && rightStartType === 'miter') {
                                          // Both miter = check if complementary or same part geometry
                                          const devDiff = Math.abs(leftDev - rightDev)
                                          const samePart = leftPartName === rightPartName
                                          isShared = devDiff <= ANGLE_MATCH_TOL || samePart
                                        } else {
                                          // Mixed types: share the boundary and show the miter marker (the actual cut geometry)
                                          // When parts are flush, they share a physical cut, so show a single marker
                                          // Use the miter geometry since that's what will actually be cut
                                          const bothNearStraight = 
                                            (leftDev < NEAR_STRAIGHT_THRESHOLD_FOR_SHARING) && 
                                            (rightDev < NEAR_STRAIGHT_THRESHOLD_FOR_SHARING)
                                          
                                          if (bothNearStraight) {
                                            // Both are very close to straight = treat as shared straight boundary
                                            isShared = true
                                          } else {
                                            // One is straight, one is miter - still share the boundary
                                            // The actual cut will be the miter, so we'll draw that in the rendering
                                            isShared = true
                                          }
                                        }
                                        
                                        // Log boundary check (for debugging)
                                        if (shouldLog) {
                                          try {
                                            const minDev = Math.min(leftDev, rightDev)
                                            const maxDev = Math.max(leftDev, rightDev)
                                            const bothNearStraight = (leftDev < NEAR_STRAIGHT_THRESHOLD_FOR_SHARING) && (rightDev < NEAR_STRAIGHT_THRESHOLD_FOR_SHARING)
                                            const lenientCheck = minDev < NEAR_STRAIGHT_THRESHOLD_FOR_SHARING && maxDev < 10.0
                                            
                                            console.log(`[BOUNDARY-CHECK] ${leftPartName}-${rightPartName}:`, {
                                              boundaryX,
                                              leftPartIdx,
                                              rightPartIdx,
                                              leftEndType,
                                              rightStartType,
                                              leftDev: leftDev.toFixed(2),
                                              rightDev: rightDev.toFixed(2),
                                              minDev: minDev.toFixed(2),
                                              maxDev: maxDev.toFixed(2),
                                              isShared,
                                              bothNearStraight,
                                              lenientCheck,
                                              devDiff: leftEndType === 'miter' && rightStartType === 'miter' ? Math.abs(leftDev - rightDev).toFixed(2) : null,
                                              ANGLE_MATCH_TOL
                                            })
                                          } catch (e) {
                                            // Ignore logging errors
                                          }
                                        }
                                        
                                        if (isShared) {
                                          sharedBoundaries.push({
                                            x: boundaryX,
                                            leftPartIdx,
                                            rightPartIdx,
                                            leftEndType,
                                            rightStartType,
                                            leftDev,
                                            rightDev
                                          })
                                        }
                                      }
                                      
                                      // Render shared boundary markers
                                      return sharedBoundaries.map((sb, idx) => {
                                        const xSnapped = sb.x
                                        
                                        // Draw shared marker at the exact boundary position (no inset, no gap)
                                        if (sb.leftEndType === 'straight' && sb.rightStartType === 'straight') {
                                          // Shared straight boundary
                                          return (
                                            <line
                                              key={`shared-boundary-${idx}`}
                                              x1={xSnapped + 0.5}
                                              y1="0.5"
                                              x2={xSnapped + 0.5}
                                              y2={barHeight - 0.5}
                                              stroke="#9ca3af"
                                              strokeWidth="1"
                                              strokeLinecap="butt"
                                              shapeRendering="crispEdges"
                                              vectorEffect="non-scaling-stroke"
                                            />
                                          )
                                        } else if (sb.leftEndType === 'miter' && sb.rightStartType === 'miter') {
                                          // Shared sloped boundary - determine direction from deviations
                                          const leftWidthPx = Math.max(
                                            1,
                                            Math.floor(partPositions[sb.leftPartIdx].xEnd) -
                                              (sb.leftPartIdx === 0 ? 0 : Math.floor(partPositions[sb.leftPartIdx].xStart))
                                          )
                                          const rightWidthPx = Math.max(
                                            1,
                                            Math.floor(partPositions[sb.rightPartIdx].xEnd) -
                                              Math.floor(partPositions[sb.rightPartIdx].xStart)
                                          )
                                          
                                          const resolvedBoundary = boundaryMap.get(xSnapped)
                                          const ownerSide = resolvedBoundary?.ownerSide || 'left'
                                          const ownerDev = ownerSide === 'left' ? sb.leftDev : sb.rightDev
                                          const ownerWidthPx = ownerSide === 'left' ? leftWidthPx : rightWidthPx
                                          const diagonalOffset = calcDiagOffset(ownerDev, ownerWidthPx)
                                          
                                          let x1, y1, x2, y2
                                          if (ownerSide === 'left') {
                                            x1 = xSnapped - diagonalOffset
                                            y1 = 0
                                            x2 = xSnapped
                                            y2 = barHeight
                                        } else {
                                            x1 = xSnapped
                                            y1 = 0
                                            x2 = xSnapped + diagonalOffset
                                            y2 = barHeight
                                          }
                                          
                                            return (
                                              <line
                                              key={`shared-boundary-${idx}`}
                                              x1={typeof x1 === 'number' ? x1 + 0.5 : x1}
                                              y1={typeof y1 === 'number' ? y1 + 0.5 : y1}
                                              x2={typeof x2 === 'number' ? x2 + 0.5 : x2}
                                              y2={typeof y2 === 'number' ? y2 + 0.5 : y2}
                                              stroke="#9ca3af"
                                              strokeWidth="1"
                                              strokeLinecap="butt"
                                              shapeRendering="crispEdges"
                                              vectorEffect="non-scaling-stroke"
                                            />
                                          )
                                        } else {
                                          // Mixed types: one straight, one miter
                                          // Show the marker based on which side has the miter (the actual cut geometry)
                                          const leftIsMiter = sb.leftEndType === 'miter' && sb.leftDev > 0
                                          const rightIsMiter = sb.rightStartType === 'miter' && sb.rightDev > 0
                                          
                                          const leftWidthPx = Math.max(
                                            1,
                                            Math.floor(partPositions[sb.leftPartIdx].xEnd) -
                                              (sb.leftPartIdx === 0 ? 0 : Math.floor(partPositions[sb.leftPartIdx].xStart))
                                          )
                                          const rightWidthPx = Math.max(
                                            1,
                                            Math.floor(partPositions[sb.rightPartIdx].xEnd) -
                                              Math.floor(partPositions[sb.rightPartIdx].xStart)
                                          )
                                          
                                          const diagonalOffset = calcDiagOffset(
                                            leftIsMiter ? sb.leftDev : sb.rightDev,
                                            leftIsMiter ? leftWidthPx : rightWidthPx
                                          )
                                          
                                          // Show sloped if either side has a significant miter
                                          // BUT: if left is straight and right is miter, show straight (unless it's the last boundary)
                                          if (leftIsMiter) {
                                            // Left end is miter - show sloped marker
                                            const resolvedBoundary = boundaryMap.get(xSnapped)
                                            const ownerSide = resolvedBoundary?.ownerSide || 'left'
                                            
                                            let x1, y1, x2, y2
                                            if (ownerSide === 'left') {
                                              x1 = xSnapped - diagonalOffset
                                              y1 = 0
                                              x2 = xSnapped
                                              y2 = barHeight
                                            } else {
                                              x1 = xSnapped
                                              y1 = 0
                                              x2 = xSnapped + diagonalOffset
                                              y2 = barHeight
                                            }
                                            
                                            return (
                                              <line
                                                key={`shared-boundary-${idx}`}
                                                x1={typeof x1 === 'number' ? x1 + 0.5 : x1}
                                                y1={typeof y1 === 'number' ? y1 + 0.5 : y1}
                                                x2={typeof x2 === 'number' ? x2 + 0.5 : x2}
                                                y2={typeof y2 === 'number' ? y2 + 0.5 : y2}
                                                stroke="#9ca3af"
                                                strokeWidth="1"
                                                strokeLinecap="butt"
                                                shapeRendering="crispEdges"
                                                vectorEffect="non-scaling-stroke"
                                              />
                                            )
                                          } else if (rightIsMiter && sb.rightPartIdx === numParts - 1) {
                                            // Right start is miter and it's the last internal boundary - show sloped
                                            const resolvedBoundary = boundaryMap.get(xSnapped)
                                            const ownerSide = resolvedBoundary?.ownerSide || 'right'
                                            
                                          let x1, y1, x2, y2
                                            if (ownerSide === 'left') {
                                            x1 = xSnapped - diagonalOffset
                                            y1 = 0
                                            x2 = xSnapped
                                            y2 = barHeight
                                          } else {
                                            x1 = xSnapped
                                            y1 = 0
                                            x2 = xSnapped + diagonalOffset
                                            y2 = barHeight
                                          }
                                          
                                          return (
                                            <line
                                                key={`shared-boundary-${idx}`}
                                                x1={typeof x1 === 'number' ? x1 + 0.5 : x1}
                                                y1={typeof y1 === 'number' ? y1 + 0.5 : y1}
                                                x2={typeof x2 === 'number' ? x2 + 0.5 : x2}
                                                y2={typeof y2 === 'number' ? y2 + 0.5 : y2}
                                                stroke="#9ca3af"
                                                strokeWidth="1"
                                                strokeLinecap="butt"
                                                shapeRendering="crispEdges"
                                              />
                                            )
                                          } else {
                                            // Show straight marker (the simpler cut for mixed boundaries)
                                            return (
                                              <line
                                                key={`shared-boundary-${idx}`}
                                                x1={Math.round(xSnapped) + 0.5}
                                                y1="0.5"
                                                x2={Math.round(xSnapped) + 0.5}
                                                y2={barHeight - 0.5}
                                                stroke="#9ca3af"
                                                strokeWidth="1"
                                                strokeLinecap="butt"
                                                shapeRendering="crispEdges"
                                              />
                                            )
                                          }
                                        }
                                      })
                                    })()}
                                    
                                    {/* Waste section - starts after last part (FLUSH), with boundary line */}
                                    {pattern.waste > 0 && !(pattern as any).exceeds_stock && partPositions.length > 0 && (() => {
                                      // CRITICAL: Use the EXACT same boundary calculation as the last part
                                      // This ensures perfect alignment - no gap, no overlap
                                      const exactPartsEndPx = Math.floor(partPositions[lastPartIdx].xEnd)
                                      
                                      const wasteWidth = (pattern.waste * pxPerMm)
                                      
                                      // Use integer pixels for waste area
                                      const wasteXPx = exactPartsEndPx
                                      const wasteWPx = Math.floor(wasteWidth)
                                      
                                      // Ensure waste doesn't extend beyond stock length
                                      const maxWasteWidth = 1000 - wasteXPx
                                      const finalWasteWidth = Math.min(wasteWPx, maxWasteWidth)
                                      
                                      // Draw boundary line between last part and waste
                                      const boundaryX = exactPartsEndPx + 0.5
                                      
                                      // DEBUG: Log waste calculation
                                      console.log(`[NESTING_DEBUG] Waste calculation for pattern ${patternIdx}:`, {
                                        lastPartIdx,
                                        lastPartXEnd_raw: partPositions[lastPartIdx].xEnd,
                                        exactPartsEndPx,
                                        wasteXPx,
                                        wasteWidth_raw: wasteWidth,
                                        wasteWPx,
                                        finalWasteWidth,
                                        maxWasteWidth,
                                        stockLength: 1000,
                                        waste_mm: pattern.waste,
                                        pxPerMm,
                                        shouldMatchLastPartEnd: exactPartsEndPx
                                      })
                                      
                                      // DEBUG: Log waste calculation
                                      console.log(`[NESTING_DEBUG] Waste calculation:`, {
                                        lastPartIdx,
                                        lastPartXEnd_raw: partPositions[lastPartIdx].xEnd,
                                        exactPartsEndPx,
                                        wasteXPx,
                                        wasteWidth_raw: wasteWidth,
                                        wasteWPx,
                                        finalWasteWidth,
                                        maxWasteWidth,
                                        stockLength: 1000,
                                        waste_mm: pattern.waste,
                                        pxPerMm
                                      })
                                        
                                        return (
                                          <g>
                                            {/* Waste area rectangle - start after boundary line to prevent overlap */}
                                            {/* Boundary line is at exactPartsEndPx + 0.5, so waste starts at exactPartsEndPx + 1 */}
                                          <rect
                                              x={wasteXPx + 1}
                                              y={0}
                                              width={Math.max(0, finalWasteWidth - 1)}
                                            height={barHeight}
                                              fill="#ffffff"
                                            stroke="none"
                                            shapeRendering="crispEdges"
                                              style={{ 
                                                imageRendering: 'pixelated',
                                                // Force integer pixel rendering
                                                transform: 'translateZ(0)'
                                              }}
                                            />
                                          </g>
                                        )
                                    })()}
                                  </g>
                                )
                                } catch (error) {
                                  console.error('[NestingReport] Error rendering SVG:', error)
                                  return (
                                    <text x="500" y="30" fill="#ff0000" fontSize="12" textAnchor="middle" dominantBaseline="middle">
                                      Error rendering visualization
                                    </text>
                                  )
                                }
                              })()}
                            </svg>
                            {/* Text labels rendered as absolute positioned divs outside SVG to prevent scaling */}
                            {(() => {
                              try {
                                // Calculate partPositions and partNameToNumber here for label rendering
                                const stockLengthMm = pattern.stock_length
                                const totalWidth = 1000
                                const pxPerMm = totalWidth / stockLengthMm
                                
                                // Create mapping from part name to its number in the cutting list table
                                // Use the EXACT same logic as in the SVG rendering section (lines 668-706)
                                const partNameToNumber = new Map<string, number>()
                                try {
                                  const partGroups = new Map<string, { name: string, length: number, count: number }>()
                                  
                                  pattern.parts.forEach((part) => {
                                    try {
                                      const partName = getDisplayPartName(part)
                                      const partLength = part?.length || 0
                                      
                                      if (partGroups.has(partName)) {
                                        const existing = partGroups.get(partName)!
                                        existing.count += 1
                                      } else {
                                        partGroups.set(partName, {
                                          name: partName,
                                          length: partLength,
                                          count: 1
                                        })
                                      }
                                    } catch (e) {
                                      // Ignore individual part errors
                                    }
                                  })
                                  
                                  // Convert to array and sort by length (longest first, same as cutting list table)
                                  const sortedGroups = Array.from(partGroups.values()).sort((a, b) => {
                                    // Sort by length descending (longest first)
                                    return b.length - a.length
                                  })
                                  
                                  // Create mapping: part name -> table number (1-indexed)
                                  sortedGroups.forEach((group, idx) => {
                                    partNameToNumber.set(group.name, idx + 1)
                                  })
                                } catch (e) {
                                  // If mapping fails, labels will fall back to part names
                                }
                                
                                // Calculate part positions (MUST match SVG section exactly)
                                const sortedParts = pattern.parts // DON'T SORT - use backend order
                                
                                // Calculate total length and scaling (same as SVG)
                                const totalPartsLengthMm = sortedParts.reduce((sum, part) => sum + (part.length || 0), 0)
                                const wasteMm = pattern.waste || 0
                                const availableForPartsPx = 1000 * (1 - wasteMm / pattern.stock_length)
                                const partsPxPerMm = totalPartsLengthMm > 0 ? availableForPartsPx / totalPartsLengthMm : pxPerMm
                                
                                let cumulativeX = 0
                                const partPositions = sortedParts.map((part, partIdx) => {
                                  const lengthMm = part.length || 0
                                  const xStart = cumulativeX
                                  const xEnd = cumulativeX + (lengthMm * partsPxPerMm)
                                  cumulativeX = xEnd
                                  return { part, xStart, xEnd, lengthMm }
                                })
                                
                                return (
                                  <>
                                    {/* Part labels */}
                                    {partPositions.map(({ part, xStart, xEnd }, partIdx) => {
                                      // Use EXACT same calculations as SVG rendering section (lines 1150-1195)
                                      const lastPartIdx = partPositions.length - 1
                                      
                                      // Calculate exactPartsEndPx (same as SVG line 1129-1131)
                                      const exactPartsEndPx = partPositions.length > 0 
                                        ? Math.floor(partPositions[lastPartIdx].xEnd)
                                        : 0
                                      
                                      // Calculate xPx (same as SVG line 1150)
                                      const xPx = partIdx === 0 ? 0 : Math.floor(xStart)
                                      
                                      // Calculate endPx (same as SVG lines 1155-1168)
                                      let endPx: number
                                      if (partIdx === lastPartIdx && pattern.waste > 0) {
                                        endPx = exactPartsEndPx
                                      } else {
                                        endPx = Math.floor(xEnd)
                                      }
                                      
                                      // Calculate wPx (same as SVG line 1171)
                                      let wPx = endPx - xPx
                                      wPx = Math.max(1, Math.floor(wPx))
                                      
                                      // Only show label if part is wide enough (lowered threshold to show labels for smaller parts)
                                      if (wPx < 15) return null
                                      
                                      // Get part number from mapping - use the EXACT same logic as SVG rendering
                                      const partName = getDisplayPartName(part)
                                      const partNameStr = String(partName || '')
                                      const partNumber = partNameToNumber.get(partNameStr) || partIdx + 1
                                      
                                      // Calculate actual polygon boundaries (same logic as SVG rendering lines 1288-1360)
                                      let topLeftX = xPx
                                      let topRightX = endPx
                                      
                                      try {
                                        // Get part end info - need to use finalPartEnds from SVG section
                                        // Since we can't access it, we'll calculate it the same way
                                        const partData = part?.part || {} as any
                                        const startRawAngle = (partData as any).start_angle || null
                                        const endRawAngle = (partData as any).end_angle || null
                                        
                                        // Simplified calculation - match SVG logic as closely as possible
                                        const startIsSlope = startRawAngle !== null && Math.abs(startRawAngle) > 0.5
                                        const endIsSlope = endRawAngle !== null && Math.abs(endRawAngle) > 0.5
                                        
                                        const startType = startIsSlope ? 'miter' : 'straight'
                                        const endType = endIsSlope ? 'miter' : 'straight'
                                        
                                        // Check if boundaries are shared (simplified - check if positions match)
                                        let startIsShared = false
                                        let endIsShared = false
                                        
                                        if (partIdx > 0) {
                                          const prevEnd = partIdx === lastPartIdx && pattern.waste > 0 
                                            ? exactPartsEndPx 
                                            : Math.floor(partPositions[partIdx - 1].xEnd)
                                          const thisStart = partIdx === 0 ? 0 : Math.floor(xStart)
                                          startIsShared = prevEnd === thisStart
                                        }
                                        
                                        if (partIdx < lastPartIdx) {
                                          const thisEnd = Math.floor(xEnd)
                                          const nextStart = Math.floor(partPositions[partIdx + 1].xStart)
                                          endIsShared = thisEnd === nextStart
                                        } else if (partIdx === lastPartIdx && pattern.waste > 0) {
                                          endIsShared = false
                                        }
                                        
                                        // Use same constants as SVG rendering
                                        const markerInset = 8
                                        const markerDiagonalOffset = 12
                                        
                                        // Calculate polygon boundaries (EXACT same logic as SVG lines 1305-1352)
                                        // Adjust for start cut (left side)
                                        if (partIdx === 0) {
                                          // First part: start at x=0 to eliminate gap with border
                                          if (startType === 'miter' && !startIsShared) {
                                            topLeftX = xPx
                                          } else {
                                            topLeftX = xPx
                                          }
                                        } else if (startType === 'miter' && !startIsShared) {
                                          topLeftX = xPx + markerInset
                                        } else if (startType === 'straight' && !startIsShared) {
                                          topLeftX = xPx + markerInset
                                        }
                                        
                                        // Adjust for end cut (right side) - EXACT same logic as SVG (lines 1330-1360)
                                        if (partIdx === lastPartIdx && pattern.waste > 0) {
                                          // Last part with waste: end exactly at exactPartsEndPx (no markerInset)
                                          topRightX = exactPartsEndPx
                                        } else if (partIdx === lastPartIdx && pattern.waste === 0) {
                                          // Last part with 0 waste: extends to end of stockbar (1000px)
                                          // When waste is 0, the part extends all the way to the stockbar border
                                          // Use the stockbar width (1000) directly to ensure it matches the SVG polygon
                                          // The SVG polygon also extends to 1000 when waste is 0
                                          topRightX = 1000
                                        } else if (endType === 'miter' && !endIsShared) {
                                          topRightX = endPx - markerInset
                                        } else if (endType === 'straight' && !endIsShared) {
                                          topRightX = endPx - markerInset
                                        } else {
                                          // For shared boundaries, use endPx (flush with neighbor)
                                          topRightX = endPx
                                        }
                                      } catch (e) {
                                        // Fallback to raw coordinates if calculation fails
                                        console.error('[NESTING] Error calculating polygon boundaries for label:', e)
                                      }
                                      
                                      // Calculate center position using actual polygon boundaries (same as SVG line 1360)
                                      const centerX = (topLeftX + topRightX) / 2
                                      const centerXPercent = (centerX / 1000) * 100
                                      
                                      // Debug logging for part 2 (last part with 0 waste)
                                      if (partIdx === lastPartIdx && pattern.waste === 0) {
                                        console.log(`[LABEL-CENTER] Part ${partIdx} (${partName}):`, {
                                          xPx,
                                          endPx,
                                          topLeftX,
                                          topRightX,
                                          centerX,
                                          centerXPercent,
                                          wPx,
                                          waste: pattern.waste
                                        })
                                      }
                                      
                                      return (
                                        <div
                                          key={`part-label-${partIdx}`}
                                          style={{
                                            position: 'absolute',
                                            left: `${centerXPercent}%`,
                                            top: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            fontFamily: 'system-ui, -apple-system, sans-serif',
                                            fontSize: '12px',
                                            fontWeight: '500',
                                            color: '#374151',
                                            textAlign: 'center',
                                            lineHeight: '12px',
                                            letterSpacing: '0',
                                            fontStretch: 'normal',
                                            fontVariant: 'normal',
                                            textRendering: 'geometricPrecision',
                                            whiteSpace: 'nowrap',
                                            pointerEvents: 'none',
                                            userSelect: 'none',
                                            zIndex: 10
                                          }}
                                        >
                                          {partNumber}
                                        </div>
                                      )
                                    })}
                                    
                                    {/* Waste label removed as requested */}
                                  </>
                                )
                              } catch (error) {
                                return null
                              }
                            })()}
                            </div>
                        </div>
                        {(pattern as any).exceeds_stock && (
                          <div className="mt-1 text-xs text-red-600 font-semibold">
                            ⚠️ This part ({formatLength(pattern.parts[0].length)}) is longer than the stock bar ({formatLength(pattern.stock_length)})
                          </div>
                        )}
                        {(pattern as any).sloped_cut_pattern && (
                          <div className="mt-2 text-xs text-green-700 font-semibold bg-green-50 px-2 py-1 rounded">
                            ✂️ Sloped cuts: Parts can be cut from same bar using complementary angles (waste from one cut becomes material for the other)
                          </div>
                        )}
                      </div>

                      {/* Cutting list table */}
                      <div className="text-sm mt-3">
                        <div className="font-medium mb-2">Cutting list:</div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-collapse border border-gray-300">
                            <thead>
                              <tr className="bg-gray-100">
                                <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Number</th>
                                <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Profile Name</th>
                                <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Part Name</th>
                                <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Cut Length (mm)</th>
                                <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Quantity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                try {
                                  // Group parts by reference/name and count occurrences
                                  const partGroups = new Map<string, { name: string, length: number, count: number }>()
                                  
                                  pattern.parts.forEach((part) => {
                                    try {
                                      const partData = part?.part || {}
                                      const partName = partData.reference || partData.element_name || 'Unknown'
                                      const partLength = part?.length || 0
                                      
                                      if (partGroups.has(partName)) {
                                        const existing = partGroups.get(partName)!
                                        existing.count += 1
                                        // Use the length from the first occurrence (they should all be the same)
                                      } else {
                                        partGroups.set(partName, {
                                          name: partName,
                                          length: partLength,
                                          count: 1
                                        })
                                      }
                                    } catch (e) {
                                      // Ignore individual part errors
                                    }
                                  })
                                  
                                  // Convert to array and sort by length (longest first)
                                  const sortedGroups = Array.from(partGroups.values()).sort((a, b) => {
                                    // Sort by length descending (longest first)
                                    return b.length - a.length
                                  })
                                  
                                  return sortedGroups.map((group, idx) => {
                                    // Always display length in mm
                                    const lengthMm = Math.round(group.length)
                                    const profileName = profile.profile_name || 'Unknown'
                            
                            return (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="border border-gray-300 px-3 py-2">{idx + 1}</td>
                                        <td className="border border-gray-300 px-3 py-2">{profileName}</td>
                                        <td className="border border-gray-300 px-3 py-2">{group.name}</td>
                                        <td className="border border-gray-300 px-3 py-2">{lengthMm}</td>
                                        <td className="border border-gray-300 px-3 py-2">{group.count}</td>
                                      </tr>
                                    )
                                  })
                                } catch (error) {
                                  console.error('[NestingReport] Error generating cutting list:', error)
                                  return (
                                    <tr>
                                      <td colSpan={5} className="border border-gray-300 px-3 py-2 text-red-500 text-center">
                                        Error generating cutting list
                                      </td>
                                    </tr>
                                  )
                                }
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                    )}
                  </div>
                )
              })}
            </div>
            </div> {/* End of nesting-report-content */}
          </>
        )}
      </div>
    </div>
  )
}

