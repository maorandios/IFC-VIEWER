import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as WebIFC from 'web-ifc'
import { FilterState } from '../types'

interface IFCViewerWebIFCProps {
  filename: string
  filters?: FilterState
  report?: any
  isVisible?: boolean
}

export default function IFCViewerWebIFC({ filename, filters, report, isVisible = true }: IFCViewerWebIFCProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const ifcLoaderRef = useRef<WebIFC.IfcAPI | null>(null)
  const modelIDRef = useRef<number | null>(null)
  const [assemblyMapping, setAssemblyMapping] = useState<any>(null)
  
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadStatus, setLoadStatus] = useState<string>('')
  const [stats, setStats] = useState<{ products: number, meshes: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current || !filename) return

    // Initialize Three.js scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf0f0f0)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      10000
    )
    camera.position.set(50, 50, 50)
    camera.up.set(0, 1, 0)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controlsRef.current = controls

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(100, 200, 100)
    dirLight.castShadow = true
    dirLight.shadow.camera.left = -100
    dirLight.shadow.camera.right = 100
    dirLight.shadow.camera.top = 100
    dirLight.shadow.camera.bottom = -100
    scene.add(dirLight)

    // Grid helper
    const gridHelper = new THREE.GridHelper(200, 50, 0xcccccc, 0xeeeeee)
    scene.add(gridHelper)

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Load IFC file
    loadIFCFile()

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      
      // Cleanup web-ifc
      if (ifcLoaderRef.current && modelIDRef.current !== null) {
        try {
          ifcLoaderRef.current.CloseModel(modelIDRef.current)
        } catch (e) {
          console.warn('[WebIFC] Error closing model:', e)
        }
      }
      
      // Cleanup Three.js
      renderer.dispose()
      if (containerRef.current && renderer.domElement) {
        try {
          containerRef.current.removeChild(renderer.domElement)
        } catch (e) {
          // Element may already be removed
        }
      }
    }
  }, [filename])

  const loadIFCFile = async () => {
    if (!filename) return
    
    setIsLoading(true)
    setLoadError(null)
    setLoadStatus('Initializing web-ifc...')
    console.log('[WebIFC] Starting IFC load for:', filename)

    try {
      // Initialize web-ifc API
      const ifcAPI = new WebIFC.IfcAPI()
      
      // Set WASM path (web-ifc WASM files should be in public folder)
      ifcAPI.SetWasmPath('/') 
      
      await ifcAPI.Init()
      ifcLoaderRef.current = ifcAPI
      console.log('[WebIFC] API initialized')
      
      setLoadStatus('Downloading IFC file...')
      
      // Fetch IFC file from your API
      const response = await fetch(`/api/ifc/${filename}`)
      if (!response.ok) throw new Error('Failed to fetch IFC file')
      
      const data = await response.arrayBuffer()
      const uint8Array = new Uint8Array(data)
      console.log('[WebIFC] IFC file downloaded:', uint8Array.length, 'bytes')
      
      setLoadStatus('Opening IFC model...')
      
      // Open IFC model with settings (like Online3DViewer does)
      const modelID = ifcAPI.OpenModel(uint8Array, {
        COORDINATE_TO_ORIGIN: true
      })
      modelIDRef.current = modelID
      console.log('[WebIFC] Model opened with ID:', modelID)
      
      setLoadStatus('Fetching assembly mapping...')
      
      // Fetch assembly mapping from your API
      const mappingResponse = await fetch(`/api/assembly-mapping/${filename}?t=${Date.now()}`)
      let mapping: any = {}
      if (mappingResponse.ok) {
        mapping = await mappingResponse.json()
        setAssemblyMapping(mapping)
        console.log('[WebIFC] Assembly mapping loaded:', Object.keys(mapping).length, 'elements')
      } else {
        console.warn('[WebIFC] Failed to load assembly mapping')
      }
      
      setLoadStatus('Loading all geometry...')
      
      // Create model group
      const model = new THREE.Group()
      model.name = 'IFC_Model'
      
      let meshCount = 0
      
      // Use LoadAllGeometry - the high-level API (like Online3DViewer)
      // This is much more reliable than StreamAllMeshes
      console.log('[WebIFC] Calling LoadAllGeometry...')
      const ifcMeshes = ifcAPI.LoadAllGeometry(modelID)
      console.log(`[WebIFC] LoadAllGeometry returned ${ifcMeshes.size()} meshes`)
      
      // Process each mesh
      for (let meshIndex = 0; meshIndex < ifcMeshes.size(); meshIndex++) {
        const ifcMesh = ifcMeshes.get(meshIndex)
        
        // Skip meshes with no geometry
        if (ifcMesh.geometries.size() === 0) {
          console.log(`[WebIFC] Skipping mesh ${meshIndex} - no geometries`)
          continue
        }
        
        const productID = ifcMesh.expressID
        const elementInfo = mapping[productID]
        const elementType = elementInfo?.element_type || 'Unknown'
        
        console.log(`[WebIFC] Processing mesh ${meshIndex} for product ${productID} (${elementType}) with ${ifcMesh.geometries.size()} geometries`)
        
        // Collect all vertices and indices from all geometries in this mesh
        let allVertices: number[] = []
        let allIndices: number[] = []
        let vertexOffset = 0
        let meshColor: THREE.Color | null = null
        let meshOpacity = 1.0
        
        // Process each geometry in the mesh
        for (let geomIndex = 0; geomIndex < ifcMesh.geometries.size(); geomIndex++) {
          const ifcGeometry = ifcMesh.geometries.get(geomIndex)
          
          // Get the actual geometry data
          const geometryData = ifcAPI.GetGeometry(modelID, ifcGeometry.geometryExpressID)
          
          // Extract vertices and indices
          const verts = ifcAPI.GetVertexArray(
            geometryData.GetVertexData(),
            geometryData.GetVertexDataSize()
          )
          const inds = ifcAPI.GetIndexArray(
            geometryData.GetIndexData(),
            geometryData.GetIndexDataSize()
          )
          
          console.log(`[WebIFC]   Geometry ${geomIndex}: ${verts.length / 6} vertices (${verts.length} floats), ${inds.length / 3} triangles`)
          
          // Get color from IFC geometry (like Online3DViewer does)
          if (geomIndex === 0 && ifcGeometry.color) {
            const ifcColor = ifcGeometry.color
            meshColor = new THREE.Color(ifcColor.x, ifcColor.y, ifcColor.z)
            meshOpacity = ifcColor.w
            console.log(`[WebIFC]   Color: rgb(${ifcColor.x}, ${ifcColor.y}, ${ifcColor.z}), opacity: ${ifcColor.w}`)
          }
          
          // Get transformation matrix for THIS geometry
          const matrix = new THREE.Matrix4()
          matrix.fromArray(ifcGeometry.flatTransformation)
          
          // Apply transformation to each vertex BEFORE adding to array (critical for correct positioning!)
          // Vertices come as [x,y,z, nx,ny,nz, x,y,z, nx,ny,nz, ...]
          for (let i = 0; i < verts.length; i += 6) {
            const vertex = new THREE.Vector3(verts[i], verts[i + 1], verts[i + 2])
            vertex.applyMatrix4(matrix)  // Transform it!
            allVertices.push(vertex.x, vertex.y, vertex.z)
          }
          
          // Adjust indices for vertex offset
          for (let i = 0; i < inds.length; i++) {
            allIndices.push(inds[i] + vertexOffset)
          }
          
          vertexOffset += verts.length / 6
        }
        
        // Create Three.js geometry from collected data
        const bufferGeometry = new THREE.BufferGeometry()
        bufferGeometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(allVertices, 3)
        )
        bufferGeometry.setIndex(allIndices)
        bufferGeometry.computeVertexNormals()
        
        // Use IFC color if available, otherwise fall back to type-based color
        let color: THREE.Color
        let opacity = meshOpacity
        
        if (meshColor) {
          color = meshColor
        } else {
          // Fallback: determine color based on element type
          let colorHex = 0x8888aa // Default gray
          const isFastener = elementType === 'IfcFastener' || elementType === 'IfcMechanicalFastener'
          
          if (isFastener) {
            colorHex = 0x8B6914 // Dark brown-gold for fasteners
          } else {
            const colorMap: Record<string, number> = {
              'IfcBeam': 0xB4B4DC,
              'IfcColumn': 0xDCDCB4,
              'IfcMember': 0xC8C8DC,
              'IfcPlate': 0xA0A0C0,
              'IfcBuildingElementProxy': 0xC0C0A0
            }
            colorHex = colorMap[elementType] || 0x8888aa
          }
          color = new THREE.Color(colorHex)
        }
        
        // Create material using IFC color with transparency
        const material = new THREE.MeshStandardMaterial({
          color: color,
          metalness: 0.3,
          roughness: 0.7,
          side: THREE.DoubleSide,
          transparent: opacity < 1.0,
          opacity: opacity
        })
        
        // Create mesh
        const threeMesh = new THREE.Mesh(bufferGeometry, material)
        threeMesh.castShadow = true
        threeMesh.receiveShadow = true
        
        // Store metadata
        threeMesh.userData = {
          product_id: productID,
          assembly_mark: elementInfo?.assembly_mark || 'N/A',
          assembly_id: elementInfo?.assembly_id || null,
          type: elementType,
          profile_name: elementInfo?.profile_name || undefined,
          plate_thickness: elementInfo?.plate_thickness || undefined
        }
        
        threeMesh.name = `${elementType}_${productID}`
        
        model.add(threeMesh)
        meshCount++
        
        if (meshCount % 50 === 0) {
          setLoadStatus(`Loaded ${meshCount} meshes...`)
        }
      }
      
      console.log('[WebIFC] Successfully created', meshCount, 'meshes')
      setStats({ products: meshCount, meshes: meshCount })
      
      // Add model to scene
      if (sceneRef.current && modelRef.current === null) {
        sceneRef.current.add(model)
        modelRef.current = model
        
        // Center camera on model
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const distance = maxDim * 1.5
        
        console.log('[WebIFC] Model bounds:', { center, size, maxDim })
        
        if (cameraRef.current && controlsRef.current) {
          // Isometric view
          const angle = Math.PI / 4 // 45 degrees
          cameraRef.current.position.set(
            center.x + distance * Math.cos(angle),
            center.y + distance * 0.7,
            center.z + distance * Math.sin(angle)
          )
          cameraRef.current.up.set(0, 1, 0)
          controlsRef.current.target.copy(center)
          controlsRef.current.update()
          
          console.log('[WebIFC] Camera positioned at:', cameraRef.current.position)
        }
      }
      
      setLoadStatus('Model loaded successfully!')
      setTimeout(() => setIsLoading(false), 500)
      
    } catch (error) {
      console.error('[WebIFC] Load error:', error)
      setLoadError(error instanceof Error ? error.message : 'Failed to load IFC file')
      setIsLoading(false)
    }
  }

  const createMeshFromGeometry = (
    ifcAPI: WebIFC.IfcAPI, 
    geometry: WebIFC.IfcGeometry, 
    productID: number,
    mapping: any
  ): THREE.Mesh | null => {
    try {
      const verts = ifcAPI.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize())
      const indices = ifcAPI.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize())
      
      console.log(`[WebIFC] Product ${productID} - verts length: ${verts?.length}, indices length: ${indices?.length}`)
      
      if (!verts || verts.length === 0) {
        console.warn(`[WebIFC] Product ${productID} has no vertices`)
        return null
      }
      
      if (!indices || indices.length === 0) {
        console.warn(`[WebIFC] Product ${productID} has no indices`)
        return null
      }
      
      const bufferGeometry = new THREE.BufferGeometry()
      
      // Positions (web-ifc returns flattened array: [x1,y1,z1, x2,y2,z2, ...])
      const positions = new Float32Array(verts.length)
      for (let i = 0; i < verts.length; i++) {
        positions[i] = verts[i]
      }
      bufferGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      
      // Indices
      if (indices && indices.length > 0) {
        bufferGeometry.setIndex(new THREE.BufferAttribute(indices, 1))
      }
      
      // Compute normals for proper lighting
      bufferGeometry.computeVertexNormals()
      
      // Get element info from mapping
      const elementInfo = mapping[productID]
      const elementType = elementInfo?.element_type || 'Unknown'
      
      // Determine color based on element type (similar to your GLTF viewer)
      let color = 0x8888aa // Default
      
      // Check if it's a fastener
      const isFastener = elementType === 'IfcFastener' || 
                        elementType === 'IfcMechanicalFastener'
      
      if (isFastener) {
        color = 0x8B6914 // Dark brown-gold for fasteners
      } else {
        // Type-based colors (matching your GLTF conversion)
        const colorMap: Record<string, number> = {
          'IfcBeam': 0xB4B4DC,
          'IfcColumn': 0xDCDCB4,
          'IfcMember': 0xC8C8DC,
          'IfcPlate': 0xA0A0C0,
          'IfcBuildingElementProxy': 0xC0C0A0
        }
        color = colorMap[elementType] || 0x8888aa
      }
      
      // Create material
      const material = new THREE.MeshStandardMaterial({
        color: color,
        metalness: isFastener ? 0.3 : 0.3,
        roughness: isFastener ? 0.6 : 0.7,
        side: THREE.DoubleSide
      })
      
      const mesh = new THREE.Mesh(bufferGeometry, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      
      // Store metadata in userData (same structure as GLTF viewer)
      mesh.userData = {
        product_id: productID,
        assembly_mark: elementInfo?.assembly_mark || 'N/A',
        assembly_id: elementInfo?.assembly_id || null,
        type: elementType,
        profile_name: elementInfo?.profile_name || undefined,
        plate_thickness: elementInfo?.plate_thickness || undefined
      }
      
      // Set mesh name for debugging
      mesh.name = `${elementType}_${productID}`
      
      return mesh
    } catch (err) {
      console.warn(`[WebIFC] Failed to create mesh for product ${productID}:`, err)
      return null
    }
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md">
            <div className="text-lg font-semibold mb-2">Loading with web-ifc...</div>
            <div className="text-sm text-gray-600 mb-4">{loadStatus}</div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
            </div>
          </div>
        </div>
      )}
      
      {/* Error display */}
      {loadError && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          <strong>Error:</strong> {loadError}
          <div className="text-sm mt-1">Try switching back to GLTF viewer</div>
        </div>
      )}
      
      {/* Info badges */}
      <div className="absolute bottom-4 left-4 space-y-2">
        <div className="bg-blue-500 text-white px-3 py-1 rounded text-sm shadow">
          web-ifc viewer (experimental)
        </div>
        {stats && (
          <div className="bg-green-500 text-white px-3 py-1 rounded text-xs shadow">
            {stats.meshes} meshes loaded
          </div>
        )}
      </div>
      
      {/* Instructions */}
      {!isLoading && !loadError && (
        <div className="absolute top-4 right-4 bg-white bg-opacity-90 p-3 rounded shadow text-xs max-w-xs">
          <div className="font-semibold mb-1">web-ifc Test Viewer</div>
          <div className="text-gray-600">
            This is using native IFC loading without GLTF conversion.
            Compare geometry quality with the standard viewer.
          </div>
        </div>
      )}
    </div>
  )
}

