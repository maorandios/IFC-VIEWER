import { useState, useEffect } from 'react'
import { SteelReport } from '../types'
import { PreviewModal } from './PreviewModal'

interface ProfilesTabProps {
  filename: string
  report: SteelReport | null
}

interface ProfileDetail {
  part_name: string
  assembly_mark: string
  profile_name: string
  length: number | null
  weight: number
  quantity: number
  total_weight: number
  ids: number[]
}

export default function ProfilesTab({ filename, report }: ProfilesTabProps) {
  const [profiles, setProfiles] = useState<ProfileDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filterProfileName, setFilterProfileName] = useState<string>('all')
  const [filterAssembly, setFilterAssembly] = useState<string>('all')
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
      fetchProfiles()
    }
  }, [filename, report])

  const fetchProfiles = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/dashboard-details/${encodeURIComponent(filename)}`)
      if (response.ok) {
        const data = await response.json()
        setProfiles(data.profiles || [])
      }
    } catch (error) {
      console.error('Error fetching profiles:', error)
    } finally {
      setLoading(false)
    }
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
  const uniqueProfileNames = Array.from(new Set(profiles.map(p => p.profile_name))).sort()
  const uniqueAssemblies = Array.from(new Set(profiles.map(p => p.assembly_mark))).sort()

  // Filter profiles
  const filteredProfiles = profiles.filter((profile) => {
    const searchLower = searchText.toLowerCase()
    const matchesSearch = searchText === '' || 
      profile.part_name.toLowerCase().includes(searchLower) ||
      profile.profile_name.toLowerCase().includes(searchLower) ||
      profile.assembly_mark.toLowerCase().includes(searchLower) ||
      (profile.length?.toString() || '').includes(searchLower) ||
      profile.weight.toString().includes(searchLower)

    const matchesProfileName = filterProfileName === 'all' || profile.profile_name === filterProfileName
    const matchesAssembly = filterAssembly === 'all' || profile.assembly_mark === filterAssembly

    return matchesSearch && matchesProfileName && matchesAssembly
  })

  const clearFilters = () => {
    setSearchText('')
    setFilterProfileName('all')
    setFilterAssembly('all')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profiles...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Profiles</h1>
          <p className="text-gray-600">
            View and filter all profile elements (beams, columns, members)
          </p>
        </div>

        {/* Summary Cards */}
        {profiles.length > 0 && (
          <div className="grid grid-cols-3 gap-6 mb-6">
            {/* Total Weight Card */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium uppercase tracking-wider">Total Weight</p>
                  <p className="text-3xl font-bold mt-2">
                    {profiles.reduce((sum, p) => sum + (p.total_weight || 0), 0).toFixed(2)}
                  </p>
                  <p className="text-blue-100 text-base mt-1">kg</p>
                </div>
                <div className="bg-blue-400 bg-opacity-30 rounded-full p-4">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Percentage Card */}
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-indigo-100 text-sm font-medium uppercase tracking-wider">% of Total Project</p>
                  <p className="text-3xl font-bold mt-2">
                    {report && report.total_tonnage 
                      ? ((profiles.reduce((sum, p) => sum + (p.total_weight || 0), 0) / (report.total_tonnage * 1000)) * 100).toFixed(1)
                      : '0.0'
                    }%
                  </p>
                  <p className="text-indigo-100 text-base mt-1">of project weight</p>
                </div>
                <div className="bg-indigo-400 bg-opacity-30 rounded-full p-4">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Quantity Card */}
            <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-cyan-100 text-sm font-medium uppercase tracking-wider">Total Quantity</p>
                  <p className="text-3xl font-bold mt-2">
                    {profiles.reduce((sum, p) => sum + (p.quantity || 1), 0)}
                  </p>
                  <p className="text-cyan-100 text-base mt-1">pieces</p>
                </div>
                <div className="bg-cyan-400 bg-opacity-30 rounded-full p-4">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter and Search Section */}
        {profiles.length > 0 && (
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
                    placeholder="Search profiles..."
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

              {/* Filter by Profile Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Profile Name
                </label>
                <select
                  value={filterProfileName}
                  onChange={(e) => setFilterProfileName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Profiles</option>
                  {uniqueProfileNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter by Assembly */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assembly
                </label>
                <select
                  value={filterAssembly}
                  onChange={(e) => setFilterAssembly(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Assemblies</option>
                  {uniqueAssemblies.map((assembly) => (
                    <option key={assembly} value={assembly}>
                      {assembly}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Results Counter */}
            <div className="mt-4 text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filteredProfiles.length}</span> of <span className="font-semibold text-gray-900">{profiles.length}</span> profiles
            </div>
          </div>
        )}

        {/* Profiles Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Part Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Assembly</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Profile Name</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Length (mm)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Weight (kg)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Weight (kg)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      {profiles.length === 0 ? 'No profiles found' : 'No profiles match the current filters'}
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map((profile, index) => (
                    <tr key={`${profile.part_name}-${profile.profile_name}-${profile.length}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm text-gray-900">{profile.part_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{profile.assembly_mark}</td>
                      <td className="px-4 py-3 text-sm font-medium text-blue-600">{profile.profile_name}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {profile.length ? profile.length.toFixed(1) : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {profile.weight.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-blue-600">
                        {profile.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                        {profile.total_weight.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openPreview([profile.ids[0]], `Profile: ${profile.part_name} (${profile.profile_name})`)}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          View 3D
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredProfiles.length > 0 && (
                <tfoot className="bg-gray-100">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                      Total ({filteredProfiles.reduce((sum, p) => sum + p.quantity, 0)} parts):
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-blue-600 text-right">
                      {filteredProfiles.length} groups
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                      {filteredProfiles.reduce((sum, p) => sum + p.total_weight, 0).toFixed(2)} kg
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

