import { useState, useEffect } from 'react'
import { SteelReport } from '../types'
import { PreviewModal } from './PreviewModal'

interface DashboardProps {
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

interface PlateDetail {
  part_name: string
  assembly_mark: string
  thickness: string
  width: number | null
  length: number | null
  weight: number
  quantity: number
  total_weight: number
  ids: number[]
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

interface DashboardDetails {
  profiles: ProfileDetail[]
  plates: PlateDetail[]
  assemblies: AssemblyDetail[]
}

interface CardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: string
}

const Card = ({ title, value, subtitle, icon }: CardProps) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
            {title}
          </h3>
          <p className="text-3xl font-bold text-gray-900 mb-1">
            {value}
          </p>
          {subtitle && (
            <p className="text-sm text-gray-600">
              {subtitle}
            </p>
          )}
        </div>
        {icon && (
          <div className="text-4xl opacity-20">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Dashboard({ filename, report }: DashboardProps) {
  const [details, setDetails] = useState<DashboardDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedAssemblies, setExpandedAssemblies] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'profiles' | 'plates' | 'assemblies'>('profiles')
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean
    elementIds: number[]
    title: string
  }>({
    isOpen: false,
    elementIds: [],
    title: ''
  })

  // Fetch detailed data
  useEffect(() => {
    if (filename && report) {
      fetchDetails()
    }
  }, [filename, report])

  const fetchDetails = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/dashboard-details/${encodeURIComponent(filename)}`)
      if (response.ok) {
        const data = await response.json()
        setDetails(data)
      }
    } catch (error) {
      console.error('Error fetching dashboard details:', error)
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

  // Calculate metrics from report
  const calculateMetrics = () => {
    if (!report) {
      return {
        totalTonnage: 0,
        profilesTonnage: 0,
        platesTonnage: 0,
        boltCount: 0,
        assemblyCount: 0,
        singlePartCount: 0
      }
    }

    let totalTonnage = 0
    let profilesTonnage = 0
    let platesTonnage = 0
    let boltCount = 0
    let assemblyCount = 0
    let singlePartCount = 0

    // Calculate tonnage from profiles
    report.profiles.forEach(profile => {
      const tonnage = profile.total_weight / 1000
      totalTonnage += tonnage
      profilesTonnage += tonnage
    })

    // Calculate tonnage from plates
    report.plates.forEach(plate => {
      const tonnage = plate.total_weight / 1000
      totalTonnage += tonnage
      platesTonnage += tonnage
    })

    boltCount = report.fastener_count || 0

    if (report.assemblies && Array.isArray(report.assemblies)) {
      assemblyCount = report.assemblies.length
    }

    if (report.profiles && Array.isArray(report.profiles)) {
      report.profiles.forEach(profile => {
        singlePartCount += profile.piece_count || 0
      })
    }
    
    if (report.plates && Array.isArray(report.plates)) {
      report.plates.forEach(plate => {
        singlePartCount += plate.piece_count || 0
      })
    }

    return {
      totalTonnage,
      profilesTonnage,
      platesTonnage,
      boltCount,
      assemblyCount,
      singlePartCount
    }
  }

  const metrics = calculateMetrics()

  // Group profiles by profile name for summary
  const groupProfiles = () => {
    if (!details) return []
    const grouped = new Map<string, { profile_name: string; quantity: number; total_weight: number }>()
    
    details.profiles.forEach(profile => {
      const key = profile.profile_name
      if (!grouped.has(key)) {
        grouped.set(key, { profile_name: key, quantity: 0, total_weight: 0 })
      }
      const group = grouped.get(key)!
      group.quantity += 1
      group.total_weight += profile.weight
    })
    
    return Array.from(grouped.values()).sort((a, b) => a.profile_name.localeCompare(b.profile_name))
  }

  // Group plates by thickness for summary
  const groupPlates = () => {
    if (!details) return []
    const grouped = new Map<string, { thickness: string; quantity: number; total_weight: number }>()
    
    details.plates.forEach(plate => {
      const key = plate.thickness
      if (!grouped.has(key)) {
        grouped.set(key, { thickness: key, quantity: 0, total_weight: 0 })
      }
      const group = grouped.get(key)!
      group.quantity += 1
      group.total_weight += plate.weight
    })
    
    return Array.from(grouped.values()).sort((a, b) => a.thickness.localeCompare(b.thickness))
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Project Dashboard
        </h1>
        <p className="text-lg text-gray-600">
          {filename || 'No file loaded'}
        </p>
      </div>

      {/* Cards Grid */}
      {report ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
            <Card
              title="Total Tonnage"
              value={metrics.totalTonnage.toFixed(3)}
              subtitle="tonnes"
              icon="⚖️"
            />
            
            <Card
              title="Profiles Tonnage"
              value={metrics.profilesTonnage.toFixed(3)}
              subtitle="tonnes"
              icon="📏"
            />
            
            <Card
              title="Plates Tonnage"
              value={metrics.platesTonnage.toFixed(3)}
              subtitle="tonnes"
              icon="📋"
            />
            
            <Card
              title="Quantity of Bolts"
              value={metrics.boltCount.toLocaleString()}
              subtitle="fasteners"
              icon="🔩"
            />
            
            <Card
              title="Quantity of Assemblies"
              value={metrics.assemblyCount.toLocaleString()}
              subtitle="assemblies"
              icon="🏗️"
            />
            
            <Card
              title="Quantity of Single Parts"
              value={metrics.singlePartCount.toLocaleString()}
              subtitle="parts"
              icon="🔧"
            />
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('profiles')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'profiles'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Profiles ({details?.profiles.length || 0})
                </button>
                <button
                  onClick={() => setActiveTab('plates')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'plates'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Plates ({details?.plates.length || 0})
                </button>
                <button
                  onClick={() => setActiveTab('assemblies')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'assemblies'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Assemblies ({details?.assemblies.length || 0})
                </button>
              </nav>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-4 text-gray-600">Loading detailed data...</p>
                </div>
              ) : details ? (
                <>
                  {/* Profiles Tab */}
                  {activeTab === 'profiles' && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Part Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assembly</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profile Name</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Length (mm)</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Weight (kg)</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Weight (kg)</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Preview</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {details.profiles.map((profile, index) => (
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
                                  className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                  👁️ View
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-100">
                          <tr>
                            <td colSpan={5} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                              Total ({details.profiles.reduce((sum, p) => sum + p.quantity, 0)} parts):
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-blue-600 text-right">
                              {details.profiles.length} groups
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                              {details.profiles.reduce((sum, p) => sum + p.total_weight, 0).toFixed(2)} kg
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {/* Plates Tab */}
                  {activeTab === 'plates' && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plate Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assembly</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thickness</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Width (mm)</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Length (mm)</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Weight (kg)</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Weight (kg)</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Preview</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {details.plates.map((plate, index) => (
                            <tr key={`${plate.part_name}-${plate.thickness}-${plate.width}-${plate.length}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-4 py-3 text-sm text-gray-900">{plate.part_name}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{plate.assembly_mark}</td>
                              <td className="px-4 py-3 text-sm font-medium text-blue-600">{plate.thickness}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-900">
                                {plate.width ? plate.width.toFixed(1) : 'N/A'}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-900">
                                {plate.length ? plate.length.toFixed(1) : 'N/A'}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-900">
                                {plate.weight.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-medium text-blue-600">
                                {plate.quantity}
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                                {plate.total_weight.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => openPreview([plate.ids[0]], `Plate: ${plate.part_name} (${plate.thickness})`)}
                                  className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                  👁️ View
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-100">
                          <tr>
                            <td colSpan={6} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                              Total ({details.plates.reduce((sum, p) => sum + p.quantity, 0)} parts):
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-blue-600 text-right">
                              {details.plates.length} groups
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                              {details.plates.reduce((sum, p) => sum + p.total_weight, 0).toFixed(2)} kg
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {/* Assemblies Tab */}
                  {activeTab === 'assemblies' && (
                    <div className="space-y-2">
                      {details.assemblies.map((assembly) => (
                        <div key={assembly.assembly_mark} className="border border-gray-200 rounded-lg overflow-hidden">
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
                              className="ml-4 inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                              👁️ View
                            </button>
                          </div>
                          
                          {expandedAssemblies.has(assembly.assembly_mark) && (
                            <div className="p-4 bg-white">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Part Name</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Profile/Thickness</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Length (mm)</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Weight (kg)</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {assembly.parts.map((part, index) => (
                                    <tr key={part.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                      <td className="px-3 py-2 text-sm text-gray-900">{part.part_name}</td>
                                      <td className="px-3 py-2 text-sm text-gray-600">
                                        {part.part_type === 'profile' ? 'Profile' : 'Plate'}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-blue-600">
                                        {part.part_type === 'profile' ? part.profile_name : part.thickness}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-right text-gray-900">
                                        {part.length ? part.length.toFixed(1) : 'N/A'}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-right font-medium text-gray-900">
                                        {part.weight.toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500">No detailed data available</p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <p className="text-gray-500 text-lg">
            No data available. Please upload an IFC file to view the dashboard.
          </p>
        </div>
      )}

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
