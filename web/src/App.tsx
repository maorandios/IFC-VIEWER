import { useState, useEffect } from 'react'
import FileUpload from './components/FileUpload'
import IFCViewer from './components/IFCViewer'
import SteelReports from './components/SteelReports'
import NestingReport from './components/NestingReport'
import Dashboard from './components/Dashboard'
import { SteelReport, FilterState, NestingReport as NestingReportType } from './types'

function App() {
  // Load from localStorage on mount (but NOT currentFile or nesting data - always start fresh)
  const loadFromStorage = () => {
    try {
      const saved = localStorage.getItem('ifc_viewer_state')
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          // NOTE: currentFile, report, gltfPath, gltfAvailable are NOT loaded - always start fresh
          filters: parsed.filters ? {
            profileTypes: new Set<string>(parsed.filters.profileTypes || []),
            plateThicknesses: new Set<string>(parsed.filters.plateThicknesses || []),
            assemblyMarks: new Set<string>(parsed.filters.assemblyMarks || [])
          } : {
            profileTypes: new Set<string>(),
            plateThicknesses: new Set<string>(),
            assemblyMarks: new Set<string>()
          },
          activeTab: parsed.activeTab || 'model'
          // NOTE: nestingReport is NOT loaded from storage - always start fresh
        }
      }
    } catch (e) {
      console.error('Error loading from localStorage:', e)
    }
    return null
  }

  const savedState = loadFromStorage()
  
  // Always start with no file - user must upload
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [report, setReport] = useState<SteelReport | null>(null)
  const [gltfPath, setGltfPath] = useState<string | undefined>(undefined)
  const [gltfAvailable, setGltfAvailable] = useState<boolean>(false)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<FilterState>(savedState?.filters || {
    profileTypes: new Set<string>(),
    plateThicknesses: new Set<string>(),
    assemblyMarks: new Set<string>()
  })
  const [activeTab, setActiveTab] = useState<'model' | 'nesting' | 'dashboard'>(savedState?.activeTab || 'model')
  const [nestingReport, setNestingReport] = useState<NestingReportType | null>(null)  // Always start with null

  // Save to localStorage whenever state changes (but only save filters and activeTab, not file data)
  useEffect(() => {
    try {
      const stateToSave = {
        // NOTE: currentFile, report, gltfPath, gltfAvailable are NOT saved - always start fresh
        filters: {
          profileTypes: Array.from(filters.profileTypes),
          plateThicknesses: Array.from(filters.plateThicknesses),
          assemblyMarks: Array.from(filters.assemblyMarks)
        },
        activeTab
        // NOTE: nestingReport is NOT saved - always start fresh
      }
      localStorage.setItem('ifc_viewer_state', JSON.stringify(stateToSave))
    } catch (e) {
      console.error('Error saving to localStorage:', e)
    }
  }, [filters, activeTab])

  const handleFileUploaded = (filename: string, reportData: SteelReport, gltfPath?: string, gltfAvailable?: boolean) => {
    // Always clear nesting report when new file is uploaded
    setNestingReport(null)
    
    setCurrentFile(filename)
    setReport(reportData)
    setGltfPath(gltfPath)
    setGltfAvailable(gltfAvailable || false)
    // Reset filters when new file is uploaded
    setFilters({
      profileTypes: new Set(),
      plateThicknesses: new Set(),
      assemblyMarks: new Set()
    })
    setActiveTab('dashboard')  // Reset to dashboard tab
  }

  const handleNestingReportChange = (report: NestingReportType | null) => {
    setNestingReport(report)
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-gray-800 text-white p-4">
        <h1 className="text-2xl font-bold">IFC Steel Viewer</h1>
      </header>
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b">
          <FileUpload 
            onUpload={handleFileUploaded}
            loading={loading}
            setLoading={setLoading}
          />
        </div>

        {currentFile && (
          <>
            {/* Tab Navigation */}
            <div className="border-b">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'dashboard'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setActiveTab('model')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'model'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Model
                </button>
                <button
                  onClick={() => setActiveTab('nesting')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'nesting'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Nesting
                </button>
              </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'dashboard' && (
              <div className="flex-1 overflow-y-auto">
                <Dashboard 
                  filename={currentFile}
                  report={report}
                />
              </div>
            )}

            {activeTab === 'model' && (
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 border-r relative">
                  <IFCViewer 
                    filename={currentFile} 
                    gltfPath={gltfPath} 
                    gltfAvailable={gltfAvailable}
                    enableMeasurement={true}
                    enableClipping={true}
                    filters={filters}
                    report={report}
                  />
                </div>
                <div className="w-96 overflow-y-auto">
                  <SteelReports 
                    report={report} 
                    filename={currentFile}
                    filters={filters}
                    setFilters={setFilters}
                  />
                </div>
              </div>
            )}

            {activeTab === 'nesting' && (
              <div className="flex-1 overflow-hidden">
                <NestingReport 
                  filename={currentFile} 
                  nestingReport={nestingReport}
                  onNestingReportChange={handleNestingReportChange}
                  report={report}
                />
              </div>
            )}
          </>
        )}

        {!currentFile && (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <p>Upload an IFC file to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

