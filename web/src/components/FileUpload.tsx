import { useState, useRef } from 'react'
import { SteelReport } from '../types'
import { Button } from './ui/Button'

interface FileUploadProps {
  onUpload: (filename: string, report: SteelReport, gltfPath?: string, gltfAvailable?: boolean) => void
  loading: boolean
  setLoading: (loading: boolean) => void
}

export default function FileUpload({ onUpload, loading, setLoading }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.ifc')) {
      setError('Please select an IFC file')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      console.log('Uploading file:', file.name, 'Size:', file.size)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      console.log('Upload response status:', response.status)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `Server error: ${response.status} ${response.statusText}` }))
        console.error('Upload error:', errorData)
        throw new Error(errorData.detail || `Upload failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      console.log('Upload successful:', data)
      console.log('glTF available:', data.gltf_available)
      console.log('glTF path:', data.gltf_path)
      console.log('Conversion error:', data.conversion_error)
      
      // Handle different response formats
      if (data.filename && data.report) {
        // Expected format: {filename, report, gltf_path, gltf_available}
        onUpload(data.filename, data.report, data.gltf_path, data.gltf_available)
      } else if (data.filename && data.file_id) {
        // Alternative format: {file_id, filename} - fetch report separately
        console.warn('Received file_id format, fetching report separately')
        try {
          const reportResponse = await fetch(`/api/report/${data.filename}`)
          if (reportResponse.ok) {
            const report = await reportResponse.json()
            onUpload(data.filename, report)
          } else {
            throw new Error('File uploaded but report not available')
          }
        } catch (reportError) {
          console.error('Error fetching report:', reportError)
          throw new Error('File uploaded but failed to get report. Please try again.')
        }
      } else {
        throw new Error('Invalid response from server: missing filename or report')
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="flex items-center gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".ifc,.IFC"
        onChange={handleFileSelect}
        className="hidden"
        id="file-upload"
        disabled={loading}
      />
      <label htmlFor="file-upload">
        <Button as="span" disabled={loading}>
          {loading ? 'Uploading...' : 'Upload IFC File'}
        </Button>
      </label>
      {error && <span className="text-red-500">{error}</span>}
    </div>
  )
}

