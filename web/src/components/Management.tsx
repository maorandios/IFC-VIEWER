import { useState, useEffect } from 'react'
import { SteelReport } from '../types'
import { PreviewModal } from './PreviewModal'

interface ManagementProps {
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
  completed: boolean
  shipped: boolean
}

export default function Management({ filename, report }: ManagementProps) {
  const [assemblies, setAssemblies] = useState<AssemblyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filterProfile, setFilterProfile] = useState<string>('all')
  const [filterAssemblyName, setFilterAssemblyName] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all') // all, in-progress, completed, shipped
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
      const response = await fetch(`/api/management-assemblies/${encodeURIComponent(filename)}`)
      if (response.ok) {
        const data = await response.json()
        
        const assemblyRows: AssemblyRow[] = []
        
        if (data.assemblies && Array.isArray(data.assemblies)) {
          data.assemblies.forEach((assembly: any) => {
            assemblyRows.push({
              assembly_mark: assembly.assembly_mark || 'Unknown',
              assembly_id: assembly.assembly_id,
              main_profile: assembly.main_profile || 'N/A',
              length: assembly.length || 0,
              weight: assembly.weight || 0,
              ids: assembly.ids || [],
              completed: assembly.completed || false,
              shipped: assembly.shipped || false
            })
          })
        }
        
        setAssemblies(assemblyRows)
      }
    } catch (error) {
      console.error('Error fetching assemblies:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleCompleted = async (assemblyId: number) => {
    try {
      const assembly = assemblies.find(a => a.assembly_id === assemblyId)
      if (!assembly) return

      const response = await fetch(`/api/management-assemblies/${encodeURIComponent(filename)}/toggle-completed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assembly_id: assemblyId, completed: !assembly.completed })
      })

      if (response.ok) {
        setAssemblies(assemblies.map(a => 
          a.assembly_id === assemblyId 
            ? { ...a, completed: !a.completed, shipped: !a.completed ? a.shipped : false } 
            : a
        ))
      }
    } catch (error) {
      console.error('Error toggling completed status:', error)
    }
  }

  const toggleShipped = async (assemblyId: number) => {
    try {
      const assembly = assemblies.find(a => a.assembly_id === assemblyId)
      if (!assembly) return

      // Can only ship completed assemblies
      if (!assembly.completed && !assembly.shipped) {
        alert('Cannot ship an assembly that is not completed')
        return
      }

      const response = await fetch(`/api/management-assemblies/${encodeURIComponent(filename)}/toggle-shipped`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assembly_id: assemblyId, shipped: !assembly.shipped })
      })

      if (response.ok) {
        setAssemblies(assemblies.map(a => 
          a.assembly_id === assemblyId 
            ? { ...a, shipped: !a.shipped } 
            : a
        ))
      }
    } catch (error) {
      console.error('Error toggling shipped status:', error)
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

  // Calculate statistics
  const stats = {
    total: {
      count: assemblies.length,
      tonnage: assemblies.reduce((sum, a) => sum + a.weight, 0) / 1000
    },
    completed: {
      count: assemblies.filter(a => a.completed).length,
      tonnage: assemblies.filter(a => a.completed).reduce((sum, a) => sum + a.weight, 0) / 1000
    },
    shipped: {
      count: assemblies.filter(a => a.shipped).length,
      tonnage: assemblies.filter(a => a.shipped).reduce((sum, a) => sum + a.weight, 0) / 1000
    }
  }

  const completedPercentage = stats.total.count > 0 ? (stats.completed.count / stats.total.count * 100).toFixed(1) : '0.0'
  const shippedPercentage = stats.total.count > 0 ? (stats.shipped.count / stats.total.count * 100).toFixed(1) : '0.0'

  // Get unique profiles and assembly names for filters
  const uniqueProfiles = Array.from(new Set(assemblies.map(a => a.main_profile))).sort()
  const uniqueAssemblyNames = Array.from(new Set(assemblies.map(a => a.assembly_mark))).sort()

  // Filter assemblies
  const filteredAssemblies = assemblies.filter((assembly) => {
    const searchLower = searchText.toLowerCase()
    const matchesSearch = searchText === '' || 
      assembly.assembly_mark.toLowerCase().includes(searchLower) ||
      assembly.main_profile.toLowerCase().includes(searchLower) ||
      assembly.length.toString().includes(searchLower) ||
      assembly.weight.toString().includes(searchLower)

    const matchesProfile = filterProfile === 'all' || assembly.main_profile === filterProfile
    const matchesAssemblyName = filterAssemblyName === 'all' || assembly.assembly_mark === filterAssemblyName
    
    let matchesStatus = true
    if (filterStatus === 'in-progress') {
      matchesStatus = !assembly.completed && !assembly.shipped
    } else if (filterStatus === 'completed') {
      matchesStatus = assembly.completed && !assembly.shipped
    } else if (filterStatus === 'shipped') {
      matchesStatus = assembly.shipped
    }

    return matchesSearch && matchesProfile && matchesAssemblyName && matchesStatus
  })

  // Clear all filters
  const clearFilters = () => {
    setSearchText('')
    setFilterProfile('all')
    setFilterAssemblyName('all')
    setFilterStatus('all')
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Production Management</h1>
          <p className="text-gray-600">
            Track assembly production, completion, and shipment status
          </p>
        </div>

        {/* Statistics Cards */}
        {assemblies.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Total Assemblies Card */}
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Total Assemblies
                  </p>
                  <p className="text-3xl font-bold text-gray-900">
                    {stats.total.count}
                  </p>
                </div>
                <div className="text-4xl opacity-20">
                  🏗️
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">{stats.total.tonnage.toFixed(3)}</span> tonnes
                </p>
              </div>
            </div>

            {/* Completed Card */}
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Completed
                  </p>
                  <p className="text-3xl font-bold text-green-600">
                    {stats.completed.count}
                  </p>
                </div>
                <div className="text-4xl opacity-20">
                  ✓
                </div>
              </div>
              <div className="border-t pt-3 space-y-1">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-green-600">{completedPercentage}%</span> of total
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">{stats.completed.tonnage.toFixed(3)}</span> tonnes
                </p>
              </div>
            </div>

            {/* Shipped Card */}
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Shipped
                  </p>
                  <p className="text-3xl font-bold text-blue-600">
                    {stats.shipped.count}
                  </p>
                </div>
                <div className="text-4xl opacity-20">
                  🚚
                </div>
              </div>
              <div className="border-t pt-3 space-y-1">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-blue-600">{shippedPercentage}%</span> of total
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">{stats.shipped.tonnage.toFixed(3)}</span> tonnes
                </p>
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
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

              {/* Filter by Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="shipped">Shipped</option>
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
                    Completed
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Shipped
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Preview
                  </th>
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
                  filteredAssemblies.map((assembly) => {
                    const statusColor = assembly.shipped 
                      ? 'bg-blue-50' 
                      : assembly.completed 
                        ? 'bg-green-50' 
                        : 'bg-white'
                    
                    return (
                      <tr
                        key={`${assembly.assembly_id}`}
                        className={`hover:bg-gray-50 transition-colors ${statusColor}`}
                      >
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
                          <input
                            type="checkbox"
                            checked={assembly.completed}
                            onChange={() => toggleCompleted(assembly.assembly_id!)}
                            className="w-5 h-5 text-green-600 rounded focus:ring-green-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={assembly.shipped}
                            onChange={() => toggleShipped(assembly.assembly_id!)}
                            disabled={!assembly.completed && !assembly.shipped}
                            className={`w-5 h-5 text-blue-600 rounded focus:ring-blue-500 ${
                              !assembly.completed && !assembly.shipped 
                                ? 'cursor-not-allowed opacity-40' 
                                : 'cursor-pointer'
                            }`}
                          />
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

