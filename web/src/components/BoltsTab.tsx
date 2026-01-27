import { useState, useEffect } from 'react'
import { SteelReport } from '../types'
import { PreviewModal } from './PreviewModal'
import { pdf } from '@react-pdf/renderer'
import { BoltsReportPDF } from './BoltsReportPDF'

interface BoltsTabProps {
  filename: string
  report: SteelReport | null
}

interface BoltDetail {
  bolt_name: string
  bolt_type: string
  size: number | null
  length: number | null
  standard: string
  location: string | null
  quantity: number
  assembly_mark: string
  ids: number[]
}

export default function BoltsTab({ filename, report }: BoltsTabProps) {
  const [bolts, setBolts] = useState<BoltDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filterBoltName, setFilterBoltName] = useState<string>('all')
  const [filterDiameter, setFilterDiameter] = useState<string>('all')
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
      fetchBolts()
    }
  }, [filename, report])

  const fetchBolts = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/dashboard-details/${encodeURIComponent(filename)}`)
      if (response.ok) {
        const data = await response.json()
        setBolts(data.bolts || [])
      }
    } catch (error) {
      console.error('Error fetching bolts:', error)
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
  const uniqueBoltNames = Array.from(new Set(bolts.map(b => b.bolt_name))).sort()
  const uniqueDiameters = Array.from(new Set(bolts.map(b => b.size).filter(s => s !== null))).sort((a, b) => a! - b!)

  // Filter bolts
  const filteredBolts = bolts.filter((bolt) => {
    const searchLower = searchText.toLowerCase()
    const matchesSearch = searchText === '' || 
      bolt.bolt_name.toLowerCase().includes(searchLower) ||
      (bolt.standard || '').toLowerCase().includes(searchLower) ||
      (bolt.size?.toString() || '').includes(searchLower) ||
      (bolt.length?.toString() || '').includes(searchLower) ||
      bolt.assembly_mark.toLowerCase().includes(searchLower)

    const matchesBoltName = filterBoltName === 'all' || bolt.bolt_name === filterBoltName
    const matchesDiameter = filterDiameter === 'all' || bolt.size?.toString() === filterDiameter

    return matchesSearch && matchesBoltName && matchesDiameter
  })

  const clearFilters = () => {
    setSearchText('')
    setFilterBoltName('all')
    setFilterDiameter('all')
  }

  const handleExportPDF = async () => {
    if (filteredBolts.length === 0) return

    try {
      // Get current date
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })

      // Create PDF document with filtered bolts
      const doc = <BoltsReportPDF 
        bolts={filteredBolts}
        filename={filename}
        currentDate={currentDate}
      />
      
      // Generate and download PDF
      const asPdf = pdf(doc)
      const blob = await asPdf.toBlob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${filename.replace('.ifc', '')}_bolts_report.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting to PDF:', error)
      alert('Failed to export PDF. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading bolts...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header with Export Button */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Bolts & Fasteners</h1>
            <p className="text-gray-600">
              View and filter all bolts, fasteners, and anchor elements
            </p>
          </div>
          {bolts.length > 0 && (
            <button
              onClick={handleExportPDF}
              disabled={filteredBolts.length === 0}
              className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                filteredBolts.length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export to PDF
            </button>
          )}
        </div>

        {/* Summary Cards */}
        {bolts.length > 0 && (
          <div className="grid grid-cols-3 gap-6 mb-6">
            {/* Total Quantity Card */}
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm font-medium uppercase tracking-wider">Total Quantity</p>
                  <p className="text-3xl font-bold mt-2">
                    {bolts.reduce((sum, b) => sum + (b.quantity || 0), 0)}
                  </p>
                  <p className="text-orange-100 text-base mt-1">bolts</p>
                </div>
                <div className="bg-orange-400 bg-opacity-30 rounded-full p-4">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Unique Types Card */}
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-sm font-medium uppercase tracking-wider">Unique Types</p>
                  <p className="text-3xl font-bold mt-2">
                    {bolts.length}
                  </p>
                  <p className="text-amber-100 text-base mt-1">different bolts</p>
                </div>
                <div className="bg-amber-400 bg-opacity-30 rounded-full p-4">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Diameters Count Card */}
            <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-yellow-100 text-sm font-medium uppercase tracking-wider">Unique Diameters</p>
                  <p className="text-3xl font-bold mt-2">
                    {uniqueDiameters.length}
                  </p>
                  <p className="text-yellow-100 text-base mt-1">sizes</p>
                </div>
                <div className="bg-yellow-400 bg-opacity-30 rounded-full p-4">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter and Search Section */}
        {bolts.length > 0 && (
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
                    placeholder="Search bolts..."
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

              {/* Filter by Bolt Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bolt Name
                </label>
                <select
                  value={filterBoltName}
                  onChange={(e) => setFilterBoltName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Bolt Names</option>
                  {uniqueBoltNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter by Diameter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Diameter (mm)
                </label>
                <select
                  value={filterDiameter}
                  onChange={(e) => setFilterDiameter(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Diameters</option>
                  {uniqueDiameters.map((diameter) => (
                    <option key={diameter} value={diameter?.toString()}>
                      {diameter}mm
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Results Counter */}
            <div className="mt-4 text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filteredBolts.length}</span> of <span className="font-semibold text-gray-900">{bolts.length}</span> bolt types
            </div>
          </div>
        )}

        {/* Bolts Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Bolt Name</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Size (mm)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Length (mm)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Standard</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Assembly</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredBolts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      {bolts.length === 0 ? 'No bolts found' : 'No bolts match the current filters'}
                    </td>
                  </tr>
                ) : (
                  filteredBolts.map((bolt, index) => (
                    <tr key={`${bolt.bolt_name}-${bolt.size}-${bolt.length}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{bolt.bolt_name}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {bolt.size ? bolt.size.toFixed(1) : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {bolt.length ? bolt.length.toFixed(1) : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-blue-600">{bolt.standard}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-orange-600">
                        {bolt.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{bolt.assembly_mark}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openPreview([bolt.ids[0]], `Bolt: ${bolt.bolt_name}`)}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          View 3D
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredBolts.length > 0 && (
                <tfoot className="bg-gray-100">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                      Total:
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-orange-600 text-right">
                      {filteredBolts.reduce((sum, b) => sum + (b.quantity || 0), 0)} bolts
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                      {filteredBolts.length} types
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

