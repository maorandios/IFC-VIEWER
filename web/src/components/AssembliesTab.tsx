import { useState, useEffect, Fragment } from 'react'
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
  weight: number
  quantity: number
  total_weight: number
  member_count: number
  plate_count: number
  parts: Array<any>
  profiles: Array<any>
  plates: Array<any>
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

        {/* Assemblies Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Assembly Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Main Profile</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Length (mm)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Weight (kg)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Weight (kg)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
          {filteredAssemblies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                {assemblies.length === 0 ? 'No assemblies found' : 'No assemblies match the current filters'}
                    </td>
                  </tr>
                ) : (
                  filteredAssemblies.map((assembly, index) => {
                    // Create unique key using assembly_mark and first element ID (handles duplicate assembly marks)
                    const uniqueKey = `${assembly.assembly_mark}-${assembly.ids?.[0] || index}`;
                    return (
                    <Fragment key={uniqueKey}>
                      <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900">{assembly.assembly_mark}</td>
                        <td className="px-4 py-3 text-sm font-medium text-blue-600">{assembly.main_profile}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {assembly.length ? assembly.length.toFixed(1) : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {assembly.weight ? assembly.weight.toFixed(2) : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-blue-600">
                          {assembly.quantity || 1}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                          {assembly.total_weight ? assembly.total_weight.toFixed(2) : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => toggleAssembly(assembly.assembly_mark)}
                              className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center gap-1"
                            >
                              <svg
                                className={`w-4 h-4 transition-transform ${
                        expandedAssemblies.has(assembly.assembly_mark) ? 'transform rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                              {expandedAssemblies.has(assembly.assembly_mark) ? 'Hide' : 'Expand'}
                  </button>
                  <button
                    onClick={() => openPreview(assembly.ids, `Assembly: ${assembly.assembly_mark}`)}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    View 3D
                  </button>
                </div>
                        </td>
                      </tr>
                {expandedAssemblies.has(assembly.assembly_mark) && (
                        <tr key={`${uniqueKey}-expanded`}>
                          <td colSpan={7} className="px-4 py-4 bg-gray-50">
                            <div className="space-y-6">
                              {/* Profiles Section */}
                              {assembly.profiles && assembly.profiles.length > 0 && (
                                <div>
                                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <span className="bg-blue-600 text-white px-2 py-1 rounded text-sm">Profiles</span>
                                    <span className="text-sm text-gray-600">({assembly.profiles.length} items)</span>
                                  </h3>
                                  <div className="bg-white rounded-lg shadow overflow-hidden">
                                    <table className="w-full">
                                      <thead className="bg-blue-50 border-b border-blue-200">
                                        <tr>
                                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Part Name</th>
                                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Profile Name</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Length (mm)</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Weight (kg)</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Weight (kg)</th>
                        </tr>
                      </thead>
                                      <tbody className="divide-y divide-gray-200">
                                        {assembly.profiles.map((profile: any, pIndex: number) => (
                                          <tr key={`profile-${pIndex}`} className={pIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="px-4 py-2 text-sm text-gray-900">{profile.part_name}</td>
                                            <td className="px-4 py-2 text-sm font-medium text-blue-600">{profile.profile_name}</td>
                                            <td className="px-4 py-2 text-sm text-right text-gray-900">
                                              {profile.length ? profile.length.toFixed(1) : 'N/A'}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-right text-gray-900">
                                              {profile.weight ? profile.weight.toFixed(2) : 'N/A'}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-right font-medium text-blue-600">
                                              {profile.quantity || 1}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-right font-bold text-gray-900">
                                              {profile.total_weight ? profile.total_weight.toFixed(2) : 'N/A'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Plates Section */}
                              {assembly.plates && assembly.plates.length > 0 && (
                                <div>
                                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <span className="bg-green-600 text-white px-2 py-1 rounded text-sm">Plates</span>
                                    <span className="text-sm text-gray-600">({assembly.plates.length} items)</span>
                                  </h3>
                                  <div className="bg-white rounded-lg shadow overflow-hidden">
                                    <table className="w-full">
                                      <thead className="bg-green-50 border-b border-green-200">
                                        <tr>
                                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Plate Name</th>
                                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Thickness</th>
                                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Profile Name</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Width (mm)</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Length (mm)</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Weight (kg)</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Weight (kg)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200">
                                        {assembly.plates.map((plate: any, pIndex: number) => (
                                          <tr key={`plate-${pIndex}`} className={pIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="px-4 py-2 text-sm text-gray-900">{plate.part_name}</td>
                                            <td className="px-4 py-2 text-sm font-medium text-blue-600">{plate.thickness}</td>
                                            <td className="px-4 py-2 text-sm font-medium text-green-600">{plate.profile_name}</td>
                                            <td className="px-4 py-2 text-sm text-right text-gray-900">
                                              {plate.width ? plate.width.toFixed(1) : 'N/A'}
                              </td>
                                            <td className="px-4 py-2 text-sm text-right text-gray-900">
                                              {plate.length ? plate.length.toFixed(1) : 'N/A'}
                              </td>
                                            <td className="px-4 py-2 text-sm text-right text-gray-900">
                                              {plate.weight ? plate.weight.toFixed(2) : 'N/A'}
                              </td>
                                            <td className="px-4 py-2 text-sm text-right font-medium text-blue-600">
                                              {plate.quantity || 1}
                              </td>
                                            <td className="px-4 py-2 text-sm text-right font-bold text-gray-900">
                                              {plate.total_weight ? plate.total_weight.toFixed(2) : 'N/A'}
                              </td>
                            </tr>
                                        ))}
                      </tbody>
                    </table>
                                  </div>
                  </div>
                )}
              </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                    );
                  })
                )}
              </tbody>
              {filteredAssemblies.length > 0 && (
                <tfoot className="bg-gray-100">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                      Total ({filteredAssemblies.reduce((sum, a) => sum + (a.quantity || 1), 0)} assemblies):
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-blue-600 text-right">
                      {filteredAssemblies.length} groups
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                      {filteredAssemblies.reduce((sum, a) => sum + (a.total_weight || 0), 0).toFixed(2)} kg
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
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

