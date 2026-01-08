import { useState, Fragment } from 'react'
import { SteelReport, FilterState } from '../types'
import { Button } from './ui/Button'

interface SteelReportsProps {
  report: SteelReport | null
  filename: string
  filters: FilterState
  setFilters: (filters: FilterState) => void
}

export default function SteelReports({ report, filename, filters, setFilters }: SteelReportsProps) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  if (!report) {
    return (
      <div className="p-4 text-gray-500">
        No report data available
      </div>
    )
  }

  const handleExport = async (type: 'assemblies' | 'profiles' | 'plates') => {
    try {
      const response = await fetch(`/api/export/${filename}/${type}`)
      if (!response.ok) throw new Error('Export failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}_${type}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Export error:', error)
      alert('Failed to export CSV')
    }
  }

  // Group profiles by type and profile name (aggregate same profile names)
  const profilesByType: Record<string, Record<string, number>> = {}
  const profileTonnageByType: Record<string, number> = {}
  
  report.profiles.forEach(profile => {
    const type = profile.element_type
    const tonnage = profile.total_weight / 1000.0 // Convert to tonnes
    
    if (!profilesByType[type]) {
      profilesByType[type] = {}
      profileTonnageByType[type] = 0
    }
    
    // Aggregate profiles with the same name
    if (!profilesByType[type][profile.profile_name]) {
      profilesByType[type][profile.profile_name] = 0
    }
    profilesByType[type][profile.profile_name] += tonnage
    profileTonnageByType[type] += tonnage
  })
  
  // Convert to arrays for display
  const profilesByTypeArray: Record<string, Array<{ profile_name: string; tonnage: number }>> = {}
  Object.keys(profilesByType).forEach(type => {
    profilesByTypeArray[type] = Object.entries(profilesByType[type])
      .map(([profile_name, tonnage]) => ({ profile_name, tonnage }))
      .sort((a, b) => b.tonnage - a.tonnage) // Sort by tonnage descending
  })

  // Group plates by thickness/profile (aggregate same thickness/profiles)
  const platesByThicknessMap: Record<string, number> = {}
  const totalPlateTonnage = report.plates.reduce((sum, plate) => {
    const tonnage = plate.total_weight / 1000.0
    if (!platesByThicknessMap[plate.thickness_profile]) {
      platesByThicknessMap[plate.thickness_profile] = 0
    }
    platesByThicknessMap[plate.thickness_profile] += tonnage
    return sum + tonnage
  }, 0)
  
  // Convert to array and sort by tonnage descending
  const platesByThickness = Object.entries(platesByThicknessMap)
    .map(([thickness_profile, tonnage]) => ({ thickness_profile, tonnage }))
    .sort((a, b) => b.tonnage - a.tonnage)

  // Get fastener tonnage (default to 0 if not available)
  const fastenerTonnage = report.fastener_tonnage || 0

  // Get category data (Beam, Column, Plate, Other)
  const categoryTonnage = report.category_tonnage || {}
  const categoryItems = report.category_items || {}
  
  // Debug: Log category data
  console.log('Category Tonnage:', categoryTonnage)
  console.log('Category Items:', categoryItems)

  // Toggle category expansion
  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId)
    } else {
      newExpanded.add(categoryId)
    }
    setExpandedCategories(newExpanded)
  }

  // Filter helper functions
  const toggleProfileTypeFilter = (profileType: string) => {
    const newFilters = { ...filters }
    const newSet = new Set(newFilters.profileTypes)
    if (newSet.has(profileType)) {
      newSet.delete(profileType)
    } else {
      newSet.add(profileType)
    }
    newFilters.profileTypes = newSet
    setFilters(newFilters)
  }

  const togglePlateThicknessFilter = (thickness: string) => {
    const newFilters = { ...filters }
    const newSet = new Set(newFilters.plateThicknesses)
    if (newSet.has(thickness)) {
      newSet.delete(thickness)
    } else {
      newSet.add(thickness)
    }
    newFilters.plateThicknesses = newSet
    setFilters(newFilters)
  }

  const toggleAssemblyMarkFilter = (assemblyMark: string) => {
    const newFilters = { ...filters }
    const newSet = new Set(newFilters.assemblyMarks)
    if (newSet.has(assemblyMark)) {
      newSet.delete(assemblyMark)
    } else {
      newSet.add(assemblyMark)
    }
    newFilters.assemblyMarks = newSet
    setFilters(newFilters)
  }

  const clearAllFilters = () => {
    setFilters({
      profileTypes: new Set(),
      plateThicknesses: new Set(),
      assemblyMarks: new Set()
    })
  }

  // Get unique values for filter options
  // Profile filter now uses profile_name (e.g., "IPE600", "UPN100") instead of element_type
  const uniqueProfileNames = Array.from(new Set(report.profiles.map(p => p.profile_name).filter(name => name && name !== 'N/A' && name !== 'null' && name.trim() !== ''))).sort()
  const uniquePlateThicknesses = Array.from(new Set(report.plates.map(p => p.thickness_profile).filter(t => t && t !== 'N/A' && t !== 'null' && t.trim() !== ''))).sort()
  const uniqueAssemblyMarks = Array.from(new Set(report.assemblies.map(a => a.assembly_mark).filter(m => m && m !== 'N/A' && m !== 'null' && m.trim() !== ''))).sort()

  // Count active filters
  const activeFilterCount = filters.profileTypes.size + filters.plateThicknesses.size + filters.assemblyMarks.size

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b bg-gray-50">
        <h2 className="text-lg font-semibold mb-2">Steel Reports</h2>
      </div>

      {/* Filters Panel */}
      <div className="border-b bg-white">
        <button
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          className="w-full px-4 py-2 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">🔍 Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                {activeFilterCount}
              </span>
            )}
          </div>
          <span className={`transform transition-transform ${filtersExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>
        
        {filtersExpanded && (
          <div className="px-4 py-3 bg-gray-50 border-t space-y-4 max-h-96 overflow-y-auto">
            {/* Profile Names */}
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">Profile Section</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {uniqueProfileNames.map(profileName => (
                  <label key={profileName} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded">
                    <input
                      type="checkbox"
                      checked={filters.profileTypes.has(profileName)}
                      onChange={() => toggleProfileTypeFilter(profileName)}
                      className="rounded"
                    />
                    <span className="text-xs text-gray-700">
                      {profileName} ({report.profiles.filter(p => p.profile_name === profileName).reduce((sum, p) => sum + p.piece_count, 0)})
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Plate Thicknesses */}
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">Plate Thickness</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {uniquePlateThicknesses.map(thickness => (
                  <label key={thickness} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded">
                    <input
                      type="checkbox"
                      checked={filters.plateThicknesses.has(thickness)}
                      onChange={() => togglePlateThicknessFilter(thickness)}
                      className="rounded"
                    />
                    <span className="text-xs text-gray-700">
                      {thickness} ({report.plates.filter(p => p.thickness_profile === thickness).reduce((sum, p) => sum + p.piece_count, 0)})
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Assembly Marks */}
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">Assembly Mark</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {uniqueAssemblyMarks.map(assemblyMark => (
                  <label key={assemblyMark} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded">
                    <input
                      type="checkbox"
                      checked={filters.assemblyMarks.has(assemblyMark)}
                      onChange={() => toggleAssemblyMarkFilter(assemblyMark)}
                      className="rounded"
                    />
                    <span className="text-xs text-gray-700">
                      {assemblyMark} ({report.assemblies.find(a => a.assembly_mark === assemblyMark)?.member_count || 0} members)
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Clear Filters Button */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="w-full px-3 py-2 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
              >
                Clear All Filters
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="border-b">
          <div className="flex">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('assemblies')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'assemblies'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Assemblies
            </button>
            <button
              onClick={() => setActiveTab('profiles')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'profiles'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Profiles
            </button>
            <button
              onClick={() => setActiveTab('plates')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'plates'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Plates
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'dashboard' && (
            <div>
              <h3 className="text-md font-semibold mb-4">Model Dashboard</h3>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3">Metric</th>
                    <th className="text-right p-3">Tonnage (t)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">Total Tonnage</td>
                    <td className="p-3 text-right">{report.total_tonnage.toFixed(2)}</td>
                  </tr>
                  
                  {/* Category-based display: Beam, Column, Plate, Other */}
                  {Object.keys(categoryTonnage).length > 0 ? (
                    ['Beam', 'Column', 'Plate', 'Other'].map((category) => {
                      const categoryId = `category-${category}`
                      const isExpanded = expandedCategories.has(categoryId)
                      const tonnage = categoryTonnage[category] || 0
                      const items = categoryItems[category] || []
                      
                      // Only show category if it has tonnage > 0
                      if (tonnage === 0) return null
                    
                    return (
                      <Fragment key={category}>
                        <tr 
                          className="border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleCategory(categoryId)}
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                ▶
                              </span>
                              <span>{category}</span>
                            </div>
                          </td>
                          <td className="p-3 text-right">{tonnage.toFixed(2)}</td>
                        </tr>
                        {isExpanded && items.map((item, idx) => (
                          <tr key={`${category}-${idx}`} className="border-b bg-gray-50 hover:bg-gray-100">
                            <td className="p-3 pl-8 text-gray-700">
                              <span className="ml-4">{item.name}</span>
                            </td>
                            <td className="p-3 text-right text-gray-700">
                              {item.weight_kg ? item.weight_kg.toFixed(2) : (item.tonnage * 1000).toFixed(2)} kg
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                    })
                  ) : (
                    <tr>
                      <td colSpan={2} className="p-3 text-gray-500 text-center">
                        No category data available. Please re-upload your IFC file.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'assemblies' && (
            <div>
              <div className="mb-2 flex justify-end">
                <Button size="sm" onClick={() => handleExport('assemblies')}>
                  Export CSV
                </Button>
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Assembly Mark</th>
                    <th className="text-right p-2">Weight (kg)</th>
                    <th className="text-right p-2">Members</th>
                    <th className="text-right p-2">Plates</th>
                  </tr>
                </thead>
                <tbody>
                  {report.assemblies.map((assembly, idx) => {
                    const isFiltered = filters.assemblyMarks.has(assembly.assembly_mark)
                    return (
                      <tr 
                        key={idx} 
                        className={`border-b hover:bg-gray-50 cursor-pointer transition-colors ${
                          isFiltered ? 'bg-blue-100 hover:bg-blue-200' : ''
                        }`}
                        onClick={() => toggleAssemblyMarkFilter(assembly.assembly_mark)}
                      >
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            {isFiltered && <span className="text-blue-600">✓</span>}
                            {assembly.assembly_mark}
                          </div>
                        </td>
                        <td className="p-2 text-right">{assembly.total_weight.toFixed(2)}</td>
                        <td className="p-2 text-right">{assembly.member_count}</td>
                        <td className="p-2 text-right">{assembly.plate_count}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'profiles' && (
            <div>
              <div className="mb-2 flex justify-end">
                <Button size="sm" onClick={() => handleExport('profiles')}>
                  Export CSV
                </Button>
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Profile</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-right p-2">Count</th>
                    <th className="text-right p-2">Weight (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.profiles.map((profile, idx) => {
                    const isFiltered = filters.profileTypes.has(profile.profile_name)
                    return (
                      <tr 
                        key={idx} 
                        className={`border-b hover:bg-gray-50 cursor-pointer transition-colors ${
                          isFiltered ? 'bg-blue-100 hover:bg-blue-200' : ''
                        }`}
                        onClick={() => toggleProfileTypeFilter(profile.profile_name)}
                      >
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            {isFiltered && <span className="text-blue-600">✓</span>}
                            {profile.profile_name}
                          </div>
                        </td>
                        <td className="p-2">{profile.element_type}</td>
                        <td className="p-2 text-right">{profile.piece_count}</td>
                        <td className="p-2 text-right">{profile.total_weight.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'plates' && (
            <div>
              <div className="mb-2 flex justify-end">
                <Button size="sm" onClick={() => handleExport('plates')}>
                  Export CSV
                </Button>
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Thickness/Profile</th>
                    <th className="text-right p-2">Count</th>
                    <th className="text-right p-2">Weight (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.plates.map((plate, idx) => {
                    const isFiltered = filters.plateThicknesses.has(plate.thickness_profile)
                    return (
                      <tr 
                        key={idx} 
                        className={`border-b hover:bg-gray-50 cursor-pointer transition-colors ${
                          isFiltered ? 'bg-blue-100 hover:bg-blue-200' : ''
                        }`}
                        onClick={() => togglePlateThicknessFilter(plate.thickness_profile)}
                      >
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            {isFiltered && <span className="text-blue-600">✓</span>}
                            {plate.thickness_profile}
                          </div>
                        </td>
                        <td className="p-2 text-right">{plate.piece_count}</td>
                        <td className="p-2 text-right">{plate.total_weight.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

