import { useState, useEffect } from 'react'
import { SteelReport } from '../types'
import { PreviewModal } from './PreviewModal'

interface FastenersTabProps {
  filename: string
  report: SteelReport | null
}

interface FastenerDetail {
  anchor_name: string
  assembly_mark: string
  diameter: number | null
  length: number | null
  material: string
  weight: number
  quantity: number
  total_weight: number
  ids: number[]
}

export default function FastenersTab({ filename, report }: FastenersTabProps) {
  const [fasteners, setFasteners] = useState<FastenerDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filterAnchorName, setFilterAnchorName] = useState<string>('all')
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
      fetchFasteners()
    }
  }, [filename, report])

  const fetchFasteners = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/dashboard-details/${encodeURIComponent(filename)}`)
      if (response.ok) {
        const data = await response.json()
        setFasteners(data.fasteners || [])
      }
    } catch (error) {
      console.error('Error fetching fasteners:', error)
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
  const uniqueAnchorNames = Array.from(new Set(fasteners.map(f => f.anchor_name))).sort()
  const uniqueAssemblies = Array.from(new Set(fasteners.map(f => f.assembly_mark))).sort()

  // Filter fasteners
  const filteredFasteners = fasteners.filter((fastener) => {
    const searchLower = searchText.toLowerCase()
    const matchesSearch = searchText === '' || 
      fastener.anchor_name.toLowerCase().includes(searchLower) ||
      (fastener.material || '').toLowerCase().includes(searchLower) ||
      (fastener.diameter?.toString() || '').includes(searchLower) ||
      (fastener.length?.toString() || '').includes(searchLower) ||
      fastener.assembly_mark.toLowerCase().includes(searchLower)

    const matchesAnchorName = filterAnchorName === 'all' || fastener.anchor_name === filterAnchorName
    const matchesAssembly = filterAssembly === 'all' || fastener.assembly_mark === filterAssembly

    return matchesSearch && matchesAnchorName && matchesAssembly
  })

  const clearFilters = () => {
    setSearchText('')
    setFilterAnchorName('all')
    setFilterAssembly('all')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading fasteners...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Fasteners</h1>
          <p className="text-gray-600">
            View and filter all anchor rods and fastening elements
          </p>
        </div>

        {/* Summary Cards */}
        {fasteners.length > 0 && (
          <div className="grid grid-cols-3 gap-6 mb-6">
            {/* Total Weight Card */}
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium uppercase tracking-wider">Total Weight</p>
                  <p className="text-3xl font-bold mt-2">
                    {fasteners.reduce((sum, f) => sum + (f.total_weight || 0), 0).toFixed(2)}
                  </p>
                  <p className="text-purple-100 text-base mt-1">kg</p>
                </div>
                <div className="bg-purple-400 bg-opacity-30 rounded-full p-4">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Percentage Card */}
            <div className="bg-gradient-to-br from-violet-500 to-violet-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-violet-100 text-sm font-medium uppercase tracking-wider">% of Total Project</p>
                  <p className="text-3xl font-bold mt-2">
                    {report && report.total_tonnage 
                      ? ((fasteners.reduce((sum, f) => sum + (f.total_weight || 0), 0) / (report.total_tonnage * 1000)) * 100).toFixed(1)
                      : '0.0'
                    }%
                  </p>
                  <p className="text-violet-100 text-base mt-1">of project weight</p>
                </div>
                <div className="bg-violet-400 bg-opacity-30 rounded-full p-4">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Quantity Card */}
            <div className="bg-gradient-to-br from-fuchsia-500 to-fuchsia-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-fuchsia-100 text-sm font-medium uppercase tracking-wider">Total Quantity</p>
                  <p className="text-3xl font-bold mt-2">
                    {fasteners.reduce((sum, f) => sum + (f.quantity || 0), 0)}
                  </p>
                  <p className="text-fuchsia-100 text-base mt-1">pieces</p>
                </div>
                <div className="bg-fuchsia-400 bg-opacity-30 rounded-full p-4">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter and Search Section */}
        {fasteners.length > 0 && (
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
                    placeholder="Search fasteners..."
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

              {/* Filter by Anchor Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Anchor Name
                </label>
                <select
                  value={filterAnchorName}
                  onChange={(e) => setFilterAnchorName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Anchor Names</option>
                  {uniqueAnchorNames.map((name) => (
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
              Showing <span className="font-semibold text-gray-900">{filteredFasteners.length}</span> of <span className="font-semibold text-gray-900">{fasteners.length}</span> fastener types
            </div>
          </div>
        )}

        {/* Fasteners Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Anchor Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Assembly Name</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Diameter (mm)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Length (mm)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Material</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Weight (kg)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Weight (kg)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredFasteners.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                      {fasteners.length === 0 ? 'No fasteners found' : 'No fasteners match the current filters'}
                    </td>
                  </tr>
                ) : (
                  filteredFasteners.map((fastener, index) => (
                    <tr key={`${fastener.anchor_name}-${fastener.diameter}-${fastener.length}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{fastener.anchor_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{fastener.assembly_mark}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {fastener.diameter ? fastener.diameter.toFixed(1) : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {fastener.length ? fastener.length.toFixed(1) : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-blue-600">{fastener.material}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {fastener.weight.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-purple-600">
                        {fastener.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                        {fastener.total_weight.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openPreview([fastener.ids[0]], `Fastener: ${fastener.anchor_name}`)}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          View 3D
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredFasteners.length > 0 && (
                <tfoot className="bg-gray-100">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                      Total ({filteredFasteners.reduce((sum, f) => sum + f.quantity, 0)} pieces):
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                      {filteredFasteners.reduce((sum, f) => sum + f.weight * f.quantity, 0).toFixed(2)} kg
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-purple-600 text-right">
                      {filteredFasteners.length} types
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                      {filteredFasteners.reduce((sum, f) => sum + f.total_weight, 0).toFixed(2)} kg
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

