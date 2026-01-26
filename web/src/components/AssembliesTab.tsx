import { useState, useEffect } from 'react'
import { SteelReport } from '../types'
import { PreviewModal } from './PreviewModal'

interface AssembliesTabProps {
  filename: string
  report: SteelReport | null
}

interface AssemblyDetail {
  assembly_mark: string
  assembly_id: number | null
  main_profile: string
  length: number
  total_weight: number
  member_count: number
  plate_count: number
  parts: Array<any>
  ids: number[]
}

export default function AssembliesTab({ filename, report }: AssembliesTabProps) {
  const [assemblies, setAssemblies] = useState<AssemblyDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedAssemblies, setExpandedAssemblies] = useState<Set<string>>(new Set())
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

  useEffect(() => {
    if (filename && report) {
      fetchAssemblies()
    }
  }, [filename, report])

  const fetchAssemblies = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/dashboard-details/${encodeURIComponent(filename)}`)
      if (response.ok) {
        const data = await response.json()
        setAssemblies(data.assemblies || [])
      }
    } catch (error) {
      console.error('Error fetching assemblies:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleAssembly = (assemblyMark: string) => {
    const newExpanded = new Set(expandedAssemblies)
    if (newExpanded.has(assemblyMark)) {
      newExpanded.delete(assemblyMark)
    } else {
      newExpanded.add(assemblyMark)
    }
    setExpandedAssemblies(newExpanded)
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

  // Get unique values for filters
  const uniqueProfiles = Array.from(new Set(assemblies.map(a => a.main_profile))).sort()
  const uniqueAssemblyNames = Array.from(new Set(assemblies.map(a => a.assembly_mark))).sort()

  // Filter assemblies
  const filteredAssemblies = assemblies.filter((assembly) => {
    const searchLower = searchText.toLowerCase()
    const matchesSearch = searchText === '' || 
      assembly.assembly_mark.toLowerCase().includes(searchLower) ||
      assembly.main_profile.toLowerCase().includes(searchLower) ||
      assembly.length.toString().includes(searchLower) ||
      assembly.total_weight.toString().includes(searchLower)

    const matchesProfile = filterProfile === 'all' || assembly.main_profile === filterProfile
    const matchesAssemblyName = filterAssemblyName === 'all' || assembly.assembly_mark === filterAssemblyName

    return matchesSearch && matchesProfile && matchesAssemblyName
  })

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
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Assemblies</h1>
          <p className="text-gray-600">
            View and filter all assemblies with their components
          </p>
        </div>

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

        {/* Assemblies List */}
        <div className="space-y-2">
          {filteredAssemblies.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <p className="text-gray-500 text-lg">
                {assemblies.length === 0 ? 'No assemblies found' : 'No assemblies match the current filters'}
              </p>
            </div>
          ) : (
            filteredAssemblies.map((assembly) => (
              <div key={assembly.assembly_mark} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                  <button
                    onClick={() => toggleAssembly(assembly.assembly_mark)}
                    className="flex-1 hover:bg-gray-100 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-4 text-left">
                      <span className="text-lg font-bold text-gray-900">{assembly.assembly_mark}</span>
                      <span className="text-sm text-gray-600">{assembly.main_profile}</span>
                      <span className="text-sm text-gray-500">
                        {assembly.length ? `${assembly.length.toFixed(0)}mm` : 'N/A'}
                      </span>
                      <span className="text-sm font-medium text-blue-600">
                        {assembly.total_weight.toFixed(2)} kg
                      </span>
                      <span className="text-xs text-gray-500">
                        ({assembly.member_count} members, {assembly.plate_count} plates)
                      </span>
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-500 transition-transform ${
                        expandedAssemblies.has(assembly.assembly_mark) ? 'transform rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => openPreview(assembly.ids, `Assembly: ${assembly.assembly_mark}`)}
                    className="ml-4 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    View 3D
                  </button>
                </div>
                
                {expandedAssemblies.has(assembly.assembly_mark) && (
                  <div className="p-4 bg-white">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Part Name</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Profile Name</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Thickness</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Length (mm)</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Weight (kg)</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {(() => {
                          // Group duplicate parts
                          const partsMap = new Map<string, { part: any; quantity: number }>();
                          
                          assembly.parts.forEach(part => {
                            const key = `${part.part_name}_${part.part_type}_${part.profile_name}_${part.thickness}_${part.length}_${part.weight}`;
                            
                            if (partsMap.has(key)) {
                              partsMap.get(key)!.quantity += 1;
                            } else {
                              partsMap.set(key, { part, quantity: 1 });
                            }
                          });
                          
                          return Array.from(partsMap.values()).map(({ part, quantity }, index) => (
                            <tr key={`${part.id}_${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-3 py-2 text-sm text-gray-900">{part.part_name}</td>
                              <td className="px-3 py-2 text-sm text-gray-600">
                                {part.part_type === 'profile' ? 'Profile' : 'Plate'}
                              </td>
                              <td className="px-3 py-2 text-sm font-medium text-green-600">
                                {part.profile_name || 'N/A'}
                              </td>
                              <td className="px-3 py-2 text-sm text-blue-600">
                                {part.part_type === 'plate' ? part.thickness : '-'}
                              </td>
                              <td className="px-3 py-2 text-sm text-right text-gray-900">
                                {part.length ? part.length.toFixed(1) : 'N/A'}
                              </td>
                              <td className="px-3 py-2 text-sm text-right font-medium text-gray-900">
                                {part.weight.toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-sm text-right font-bold text-blue-600">
                                {quantity}
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
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

