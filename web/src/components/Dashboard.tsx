import { SteelReport } from '../types'

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
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

          {/* Information about dedicated tabs */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">📊 View Detailed Data</h2>
            <p className="text-blue-800 mb-4">
              For detailed information about profiles, plates, and assemblies, please use the dedicated tabs above:
            </p>
            <div className="flex gap-4">
              <div className="flex-1 bg-white rounded-md p-4 border border-blue-300">
                <h3 className="font-semibold text-blue-900 mb-1">Profiles Tab</h3>
                <p className="text-sm text-gray-700">View all profile elements with search and filter options</p>
              </div>
              <div className="flex-1 bg-white rounded-md p-4 border border-blue-300">
                <h3 className="font-semibold text-blue-900 mb-1">Plates Tab</h3>
                <p className="text-sm text-gray-700">View all plate elements with search and filter options</p>
              </div>
              <div className="flex-1 bg-white rounded-md p-4 border border-blue-300">
                <h3 className="font-semibold text-blue-900 mb-1">Assemblies Tab</h3>
                <p className="text-sm text-gray-700">View all assemblies with expandable component details</p>
              </div>
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
    </div>
  )
}
