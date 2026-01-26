import { useState, useEffect } from 'react'
import { SteelReport } from '../types'
import { PreviewModal } from './PreviewModal'

interface ShipmentProps {
  filename: string
  report: SteelReport | null
}

interface AssemblyRow {
  assembly_mark: string
  assembly_id: number | null
  main_profile: string
  length: number
  weight: number
  ids: number[]
}

export default function Shipment({ filename, report }: ShipmentProps) {
  const [assemblies, setAssemblies] = useState<AssemblyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedAssemblies, setSelectedAssemblies] = useState<Set<string>>(new Set())
  const [searchText, setSearchText] = useState('')
  const [filterProfile, setFilterProfile] = useState<string>('all')
  const [filterAssemblyName, setFilterAssemblyName] = useState<string>('all')
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean
    elementIds: number[]
    title: string
  }>({
    isOpen: false,
    elementIds: [],
    title: ''
  })

  // Fetch assembly data
  useEffect(() => {
    if (filename && report) {
      fetchAssemblies()
    }
  }, [filename, report])

  const fetchAssemblies = async () => {
    setLoading(true)
    try {
      // Use the new shipment-assemblies endpoint that returns individual instances
      const response = await fetch(`/api/shipment-assemblies/${encodeURIComponent(filename)}`)
      if (response.ok) {
        const data = await response.json()
        
        // Convert assemblies data - each assembly instance gets its own row
        const assemblyRows: AssemblyRow[] = []
        
        if (data.assemblies && Array.isArray(data.assemblies)) {
          data.assemblies.forEach((assembly: any) => {
            assemblyRows.push({
              assembly_mark: assembly.assembly_mark || 'Unknown',
              assembly_id: assembly.assembly_id,
              main_profile: assembly.main_profile || 'N/A',
              length: assembly.length || 0,
              weight: assembly.weight || 0,
              ids: assembly.ids || []
            })
          })
        }
        
        // Already sorted by assembly mark from backend
        setAssemblies(assemblyRows)
      }
    } catch (error) {
      console.error('Error fetching assemblies:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleAssembly = (assemblyId: number) => {
    const newSelected = new Set(selectedAssemblies)
    const key = `${assemblyId}`
    if (newSelected.has(key)) {
      newSelected.delete(key)
    } else {
      newSelected.add(key)
    }
    setSelectedAssemblies(newSelected)
  }

  const toggleAllAssemblies = () => {
    // Get filtered assemblies to determine what to select/deselect
    const filtered = assemblies.filter((assembly) => {
      const searchLower = searchText.toLowerCase()
      const matchesSearch = searchText === '' || 
        assembly.assembly_mark.toLowerCase().includes(searchLower) ||
        assembly.main_profile.toLowerCase().includes(searchLower) ||
        assembly.length.toString().includes(searchLower) ||
        assembly.weight.toString().includes(searchLower)
      const matchesProfile = filterProfile === 'all' || assembly.main_profile === filterProfile
      const matchesAssemblyName = filterAssemblyName === 'all' || assembly.assembly_mark === filterAssemblyName
      return matchesSearch && matchesProfile && matchesAssemblyName
    })
    
    // Check if all filtered items are selected
    const allFilteredSelected = filtered.every((assembly) => 
      selectedAssemblies.has(`${assembly.assembly_id}`)
    )
    
    const newSelected = new Set(selectedAssemblies)
    
    if (allFilteredSelected) {
      // Deselect all filtered items
      filtered.forEach((assembly) => {
        newSelected.delete(`${assembly.assembly_id}`)
      })
    } else {
      // Select all filtered items
      filtered.forEach((assembly) => {
        newSelected.add(`${assembly.assembly_id}`)
      })
    }
    
    setSelectedAssemblies(newSelected)
  }

  const openPreview = (elementIds: number[], title: string) => {
    setPreviewModal({
      isOpen: true,
      elementIds,
      title
    })
  }

  const closePreview = () => {
    setPreviewModal({
      isOpen: false,
      elementIds: [],
      title: ''
    })
  }

  const handleExportPDF = () => {
    // TODO: Implement PDF export logic
    console.log('Exporting selected assemblies:', selectedAssemblies)
    alert('PDF export functionality will be implemented')
  }

  // Get unique profiles and assembly names for filters
  const uniqueProfiles = Array.from(new Set(assemblies.map(a => a.main_profile))).sort()
  const uniqueAssemblyNames = Array.from(new Set(assemblies.map(a => a.assembly_mark))).sort()

  // Filter assemblies based on search and filters
  const filteredAssemblies = assemblies.filter((assembly) => {
    // Free text search - searches across assembly name, profile, length, and weight
    const searchLower = searchText.toLowerCase()
    const matchesSearch = searchText === '' || 
      assembly.assembly_mark.toLowerCase().includes(searchLower) ||
      assembly.main_profile.toLowerCase().includes(searchLower) ||
      assembly.length.toString().includes(searchLower) ||
      assembly.weight.toString().includes(searchLower)

    // Filter by profile
    const matchesProfile = filterProfile === 'all' || assembly.main_profile === filterProfile

    // Filter by assembly name
    const matchesAssemblyName = filterAssemblyName === 'all' || assembly.assembly_mark === filterAssemblyName

    return matchesSearch && matchesProfile && matchesAssemblyName
  })

  // Clear all filters
  const clearFilters = () => {
    setSearchText('')
    setFilterProfile('all')
    setFilterAssemblyName('all')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading assemblies...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Shipment</h1>
            <p className="text-gray-600">
              Select assemblies to include in shipment report
            </p>
          </div>
          <button
            onClick={handleExportPDF}
            disabled={selectedAssemblies.size === 0}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              selectedAssemblies.size === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            Export PDF ({selectedAssemblies.size} selected)
          </button>
        </div>

        {/* Summary Cards */}
        {assemblies.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Total Assemblies Card */}
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Total Assemblies
                  </p>
                  <p className="text-3xl font-bold text-gray-900">
                    {assemblies.length}
                  </p>
                </div>
                <div className="text-4xl opacity-20">
                  📦
                </div>
              </div>
            </div>

            {/* Selected Assemblies Card */}
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Selected
                  </p>
                  <p className="text-3xl font-bold text-blue-600">
                    {selectedAssemblies.size}
                  </p>
                </div>
                <div className="text-4xl opacity-20">
                  ✓
                </div>
              </div>
            </div>

            {/* Total Weight Card */}
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Total Weight (Selected)
                  </p>
                  <p className="text-3xl font-bold text-gray-900">
                    {assemblies
                      .filter((assembly) => selectedAssemblies.has(`${assembly.assembly_id}`))
                      .reduce((sum, assembly) => sum + assembly.weight, 0)
                      .toFixed(2)}
                    <span className="text-xl font-normal text-gray-600 ml-2">kg</span>
                  </p>
                </div>
                <div className="text-4xl opacity-20">
                  ⚖️
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter and Search Section */}
        {assemblies.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Filter & Search</h2>
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Clear All
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    placeholder="Search assemblies..."
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

              {/* Filter by Main Profile */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Main Profile
                </label>
                <select
                  value={filterProfile}
                  onChange={(e) => setFilterProfile(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Profiles</option>
                  {uniqueProfiles.map((profile) => (
                    <option key={profile} value={profile}>
                      {profile}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter by Assembly Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assembly Name
                </label>
                <select
                  value={filterAssemblyName}
                  onChange={(e) => setFilterAssemblyName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Assemblies</option>
                  {uniqueAssemblyNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Results Counter */}
            <div className="mt-4 text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filteredAssemblies.length}</span> of <span className="font-semibold text-gray-900">{assemblies.length}</span> assemblies
            </div>
          </div>
        )}

        {/* Assemblies Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={filteredAssemblies.length > 0 && filteredAssemblies.every((assembly) => 
                        selectedAssemblies.has(`${assembly.assembly_id}`)
                      )}
                      onChange={toggleAllAssemblies}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Assembly Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Main Profile
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Length (mm)
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Weight (kg)
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Preview
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredAssemblies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      {assemblies.length === 0 ? 'No assemblies found' : 'No assemblies match the current filters'}
                    </td>
                  </tr>
                ) : (
                  filteredAssemblies.map((assembly) => {
                    const assemblyKey = `${assembly.assembly_id}`
                    const isSelected = selectedAssemblies.has(assemblyKey)
                    
                    return (
                      <tr
                        key={assemblyKey}
                        className={`hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-blue-50' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAssembly(assembly.assembly_id!)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {assembly.assembly_mark}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {assembly.main_profile}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {assembly.length.toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {assembly.weight.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => openPreview(
                              assembly.ids,
                              `Assembly: ${assembly.assembly_mark}`
                            )}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          >
                            View 3D
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <PreviewModal
        isOpen={previewModal.isOpen}
        onClose={closePreview}
        filename={filename}
        elementIds={previewModal.elementIds}
        title={previewModal.title}
      />
    </div>
  )
}

