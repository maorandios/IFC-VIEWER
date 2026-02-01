import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as WebIFC from 'web-ifc'
import { FilterState } from '../types'

interface FastIFCViewerProps {
  filename: string
  enableMeasurement?: boolean
  enableClipping?: boolean
  filters?: FilterState
  report?: any
}

export default function FastIFCViewer({ 
  filename, 
  enableMeasurement = false, 
  enableClipping = false, 
  filters,
  report 
}: FastIFCViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const ifcApiRef = useRef<WebIFC.IfcAPI | null>(null)
  const modelIdRef = useRef<number | null>(null)
  
  // Selection state
  const selectedMeshRef = useRef<THREE.Mesh | null>(null)
  const selectedMeshesRef = useRef<THREE.Mesh[]>([])
  const selectedProductIdsRef = useRef<number[]>([])
  const [selectedElement, setSelectedElement] = useState<{ expressID: number; type: string } | null>(null)
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    element: THREE.Mesh | null
    productId: number | null
  }>({
    visible: false,
    x: 0,
    y: 0,
    element: null,
    productId: null
  })
  
  // Element data for context menu
  const [elementData, setElementData] = useState<{
    loading: boolean
    data: any | null
    error: string | null
  }>({
    loading: false,
    data: null,
    error: null
  })
  
  // Loading state
  const [isLoading, setIsLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  
  // Element states tracking
  const elementStatesRef = useRef<Map<THREE.Mesh, 'normal' | 'transparent' | 'hidden'>>(new Map())
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map())
  const originalVisibilityRef = useRef<Map<THREE.Mesh, boolean>>(new Map())
  
  // Mesh to expressID mapping
  const meshToExpressIdRef = useRef<Map<THREE.Mesh, number>>(new Map())
  const expressIdToMeshesRef = useRef<Map<number, THREE.Mesh[]>>(new Map())

  useEffect(() => {
    if (!filename || !containerRef.current) return

    const container = containerRef.current
    
    // Initialize Three.js scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf0f0f0)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.01,
      10000
    )
    camera.position.set(10, 10, 10)
    camera.up.set(0, 1, 0)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      preserveDrawingBuffer: true,
      logarithmicDepthBuffer: true, // Better depth precision for large models
      powerPreference: 'high-performance'
    })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0xf0f0f0)
    renderer.outputEncoding = THREE.sRGBEncoding
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.autoUpdate = true
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Enhanced lighting setup for realistic appearance
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    scene.add(ambientLight)
    
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6)
    hemiLight.position.set(0, 50, 0)
    scene.add(hemiLight)
    
    // Main directional light (key light)
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.2)
    directionalLight1.position.set(20, 30, 15)
    directionalLight1.castShadow = true
    directionalLight1.shadow.mapSize.width = 2048
    directionalLight1.shadow.mapSize.height = 2048
    directionalLight1.shadow.camera.near = 0.1
    directionalLight1.shadow.camera.far = 500
    directionalLight1.shadow.camera.left = -50
    directionalLight1.shadow.camera.right = 50
    directionalLight1.shadow.camera.top = 50
    directionalLight1.shadow.camera.bottom = -50
    directionalLight1.shadow.bias = -0.0001
    scene.add(directionalLight1)
    
    // Fill light (softer, from opposite side)
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight2.position.set(-15, 20, -10)
    directionalLight2.castShadow = false
    scene.add(directionalLight2)
    
    // Rim light (for edge definition)
    const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.3)
    directionalLight3.position.set(0, 10, -20)
    scene.add(directionalLight3)

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.enablePan = true
    controls.enableZoom = true
    controls.enableRotate = true
    controls.rotateSpeed = 0.8
    controls.panSpeed = 0.5
    controls.zoomSpeed = 0.9
    controls.minDistance = 0.01
    controls.maxDistance = 10000
    controls.zoomToCursor = true
    controls.screenSpacePanning = false
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    // Create model group
    const modelGroup = new THREE.Group()
    modelGroup.name = 'IFC_Model'
    scene.add(modelGroup)
    modelRef.current = modelGroup

    // Load IFC file
    loadIFCFile(filename, scene, camera, controls, modelGroup)

    // Handle window resize
    const handleResize = () => {
      if (!container || !camera || !renderer) return
      const width = container.clientWidth
      const height = container.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)

    // Click handler for selection
    const handleClick = (event: MouseEvent) => {
      if (!camera || !modelGroup) return
      
      const rect = container.getBoundingClientRect()
      const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1
      
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera)
      
      const meshes: THREE.Mesh[] = []
      modelGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.visible) {
          meshes.push(child)
        }
      })
      
      const intersections = raycaster.intersectObjects(meshes, true)
      if (intersections.length > 0) {
        const mesh = intersections[0].object as THREE.Mesh
        const expressID = meshToExpressIdRef.current.get(mesh)
        if (expressID) {
          handleElementSelection(mesh, expressID)
        }
      } else {
        clearSelection()
      }
    }
    
    // Right-click handler for context menu
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      if (!camera || !modelGroup) return
      
      const rect = container.getBoundingClientRect()
      const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1
      
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera)
      
      const meshes: THREE.Mesh[] = []
      modelGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.visible) {
          meshes.push(child)
        }
      })
      
      const intersections = raycaster.intersectObjects(meshes, true)
      if (intersections.length > 0) {
        const mesh = intersections[0].object as THREE.Mesh
        const expressID = meshToExpressIdRef.current.get(mesh)
        if (expressID) {
          setContextMenu({
            visible: true,
            x: event.clientX,
            y: event.clientY,
            element: mesh,
            productId: expressID
          })
          loadElementData(expressID)
        }
      }
    }
    
    renderer.domElement.addEventListener('click', handleClick)
    renderer.domElement.addEventListener('contextmenu', handleContextMenu)

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('click', handleClick)
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement)
      }
      renderer.dispose()
      controls.dispose()
      
      // Dispose all geometries and materials
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose()
          if (Array.isArray(object.material)) {
            object.material.forEach(mat => mat.dispose())
          } else {
            object.material?.dispose()
          }
        }
      })
      
      // Close IFC model if open
      if (ifcApiRef.current && modelIdRef.current !== null) {
        try {
          ifcApiRef.current.CloseModel(modelIdRef.current)
        } catch (e) {
          console.error('Error closing IFC model:', e)
        }
      }
    }
  }, [filename])

  const loadIFCFile = async (
    filename: string,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    modelGroup: THREE.Group
  ) => {
    setIsLoading(true)
    setError(null)
    setLoadingProgress('Initializing web-ifc...')

    try {
      // Initialize web-ifc
      const ifcApi = new WebIFC.IfcAPI()
      ifcApi.SetWasmPath('')
      setLoadingProgress('Loading WebAssembly...')
      await ifcApi.Init()
      ifcApiRef.current = ifcApi

      setLoadingProgress('Downloading IFC file...')
      
      // Fetch IFC file
      const response = await fetch(`/api/ifc/${encodeURIComponent(filename)}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch IFC file: ${response.status}`)
      }
      
      const arrayBuffer = await response.arrayBuffer()
      const data = new Uint8Array(arrayBuffer)
      setLoadingProgress(`Downloaded ${(data.length / 1024 / 1024).toFixed(2)} MB`)

      setLoadingProgress('Parsing IFC geometry...')
      
      // Open model with settings for accurate geometry
      const modelID = ifcApi.OpenModel(data, {
        COORDINATE_TO_ORIGIN: true,
        USE_FAST_BOOLS: true,
      })
      modelIdRef.current = modelID

      setLoadingProgress('Loading geometry...')
      
      // Load all geometry
      const ifcMeshes = ifcApi.LoadAllGeometry(modelID)
      const meshCount = ifcMeshes.size()
      setLoadingProgress(`Processing ${meshCount} elements...`)

      // Material cache for performance
      const materialCache = new Map<string, THREE.MeshStandardMaterial>()
      let processedCount = 0

      // Process each mesh with improved geometry handling
      for (let i = 0; i < meshCount; i++) {
        const ifcMesh = ifcMeshes.get(i)
        
        if (ifcMesh.geometries.size() === 0) continue

        const expressID = ifcMesh.expressID
        
        for (let j = 0; j < ifcMesh.geometries.size(); j++) {
          const geometry = ifcMesh.geometries.get(j)
          const geometryData = ifcApi.GetGeometry(modelID, geometry.geometryExpressID)
          
          // Get vertex and index data
          const vertexData = ifcApi.GetVertexArray(
            geometryData.GetVertexData(),
            geometryData.GetVertexDataSize()
          )
          const indexData = ifcApi.GetIndexArray(
            geometryData.GetIndexData(),
            geometryData.GetIndexDataSize()
          )

          if (vertexData.length === 0 || indexData.length === 0) continue

          // Create Three.js buffer geometry with precise data extraction
          const bufferGeometry = new THREE.BufferGeometry()
          
          // Extract positions and normals - web-ifc provides 6 floats per vertex (x,y,z,nx,ny,nz)
          const vertexCount = vertexData.length / 6
          const positions = new Float32Array(vertexCount * 3)
          const normals = new Float32Array(vertexCount * 3)
          
          // Extract vertex data precisely
          for (let k = 0; k < vertexData.length; k += 6) {
            const vertexIdx = (k / 6) * 3
            positions[vertexIdx] = vertexData[k]
            positions[vertexIdx + 1] = vertexData[k + 1]
            positions[vertexIdx + 2] = vertexData[k + 2]
            normals[vertexIdx] = vertexData[k + 3]
            normals[vertexIdx + 1] = vertexData[k + 4]
            normals[vertexIdx + 2] = vertexData[k + 5]
          }

          bufferGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          bufferGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
          
          // Set indices - ensure proper winding order
          const indices = new Uint32Array(indexData.length)
          for (let idx = 0; idx < indexData.length; idx += 3) {
            // Ensure counter-clockwise winding for proper face culling
            indices[idx] = indexData[idx]
            indices[idx + 1] = indexData[idx + 2]
            indices[idx + 2] = indexData[idx + 1]
          }
          bufferGeometry.setIndex(new THREE.BufferAttribute(indices, 1))

          // Apply transformation matrix precisely
          const matrix = new THREE.Matrix4()
          matrix.fromArray(geometry.flatTransformation)
          bufferGeometry.applyMatrix4(matrix)

          // Always recompute normals for accuracy - web-ifc normals may not be perfect
          bufferGeometry.computeVertexNormals()
          
          // Ensure normals are normalized
          const normalAttr = bufferGeometry.getAttribute('normal') as THREE.BufferAttribute
          for (let n = 0; n < normalAttr.count; n++) {
            const nx = normalAttr.getX(n)
            const ny = normalAttr.getY(n)
            const nz = normalAttr.getZ(n)
            const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
            if (length > 0.0001) {
              normalAttr.setXYZ(n, nx / length, ny / length, nz / length)
            }
          }
          normalAttr.needsUpdate = true

          // Compute bounding box and sphere for culling
          bufferGeometry.computeBoundingBox()
          bufferGeometry.computeBoundingSphere()

          // Get or create material with realistic PBR properties
          const colorKey = `${geometry.color.x}_${geometry.color.y}_${geometry.color.z}_${geometry.color.w}`
          let material = materialCache.get(colorKey)
          
          if (!material) {
            const color = new THREE.Color(
              geometry.color.x,
              geometry.color.y,
              geometry.color.z
            )
            
            // Use MeshStandardMaterial for realistic PBR rendering
            material = new THREE.MeshStandardMaterial({
              color: color,
              side: THREE.DoubleSide,
              transparent: geometry.color.w < 1,
              opacity: geometry.color.w,
              metalness: 0.1, // Slight metallic for steel
              roughness: 0.7, // Moderate roughness for realistic appearance
              flatShading: false, // Smooth shading for accurate geometry
              vertexColors: false,
            })
            materialCache.set(colorKey, material)
          }

          // Create mesh with proper settings
          const mesh = new THREE.Mesh(bufferGeometry, material)
          mesh.userData.expressID = expressID
          mesh.userData.ifcType = 'IFC_ELEMENT'
          mesh.castShadow = true
          mesh.receiveShadow = true
          
          // Store mapping for selection
          meshToExpressIdRef.current.set(mesh, expressID)
          if (!expressIdToMeshesRef.current.has(expressID)) {
            expressIdToMeshesRef.current.set(expressID, [])
          }
          expressIdToMeshesRef.current.get(expressID)!.push(mesh)
          
          modelGroup.add(mesh)
        }

        processedCount++
        if (processedCount % 50 === 0 || processedCount === meshCount) {
          const progress = Math.round((processedCount / meshCount) * 100)
          setLoadingProgress(`Processing... ${progress}% (${processedCount}/${meshCount})`)
        }
      }

      // Fit camera to model with proper bounds
      const box = new THREE.Box3().setFromObject(modelGroup)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      
      if (maxDim > 0) {
        const fov = camera.fov * (Math.PI / 180)
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2))
        cameraZ *= 1.5 // Add some padding

        camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ)
        camera.lookAt(center)
        controls.target.copy(center)
        controls.update()
      }

      setIsLoading(false)
      setLoadingProgress('')
      console.log(`✅ Loaded ${meshCount} elements with accurate geometry`)

    } catch (err) {
      console.error('Error loading IFC:', err)
      setError(err instanceof Error ? err.message : 'Failed to load IFC file')
      setIsLoading(false)
    }
  }

  const handleElementSelection = (mesh: THREE.Mesh, expressID: number) => {
    // Clear previous selection
    clearSelection()
    
    // Get all meshes for this expressID
    const meshes = expressIdToMeshesRef.current.get(expressID) || [mesh]
    
    // Highlight selected meshes
    meshes.forEach(m => {
      const originalMaterial = m.material
      originalMaterialsRef.current.set(m, originalMaterial)
      
      const highlightMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
        metalness: 0.3,
        roughness: 0.5
      })
      m.material = highlightMaterial
    })
    
    selectedMeshRef.current = mesh
    selectedMeshesRef.current = meshes
    selectedProductIdsRef.current = [expressID]
    
    // Get element type from IFC API if available
    let elementType = 'IFC_ELEMENT'
    if (ifcApiRef.current && modelIdRef.current !== null) {
      try {
        const props = ifcApiRef.current.GetLine(modelIdRef.current, expressID)
        if (props) {
          elementType = props.constructor.name || 'IFC_ELEMENT'
        }
      } catch (e) {
        console.warn('Could not get element type:', e)
      }
    }
    
    setSelectedElement({ expressID, type: elementType })
  }

  const clearSelection = () => {
    // Restore original materials
    selectedMeshesRef.current.forEach(mesh => {
      const originalMaterial = originalMaterialsRef.current.get(mesh)
      if (originalMaterial) {
        mesh.material = originalMaterial
      }
    })
    
    selectedMeshRef.current = null
    selectedMeshesRef.current = []
    selectedProductIdsRef.current = []
    setSelectedElement(null)
  }

  const loadElementData = async (expressID: number) => {
    setElementData({ loading: true, data: null, error: null })
    
    try {
      const response = await fetch(`/api/element/${encodeURIComponent(filename)}/${expressID}`)
      if (!response.ok) {
        throw new Error(`Failed to load element data: ${response.status}`)
      }
      const data = await response.json()
      setElementData({ loading: false, data, error: null })
    } catch (err) {
      setElementData({ 
        loading: false, 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to load element data' 
      })
    }
  }

  const handleTransparent = () => {
    selectedMeshesRef.current.forEach(mesh => {
      if (!originalMaterialsRef.current.has(mesh)) {
        originalMaterialsRef.current.set(mesh, mesh.material)
      }
      elementStatesRef.current.set(mesh, 'transparent')
      
      if (mesh.material instanceof THREE.Material) {
        mesh.material.transparent = true
        mesh.material.opacity = 0.3
      }
    })
  }

  const handleHide = () => {
    selectedMeshesRef.current.forEach(mesh => {
      if (!originalVisibilityRef.current.has(mesh)) {
        originalVisibilityRef.current.set(mesh, mesh.visible)
      }
      elementStatesRef.current.set(mesh, 'hidden')
      mesh.visible = false
    })
    clearSelection()
  }

  const handleShowAll = () => {
    if (!modelRef.current) return
    
    modelRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Restore visibility
        const originalVisibility = originalVisibilityRef.current.get(child)
        if (originalVisibility !== undefined) {
          child.visible = originalVisibility
        } else {
          child.visible = true
        }
        
        // Restore materials
        const originalMaterial = originalMaterialsRef.current.get(child)
        if (originalMaterial) {
          child.material = originalMaterial
        }
        
        elementStatesRef.current.set(child, 'normal')
      }
    })
    
    originalMaterialsRef.current.clear()
    originalVisibilityRef.current.clear()
    elementStatesRef.current.clear()
    clearSelection()
  }

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(prev => ({ ...prev, visible: false }))
    }
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu.visible])

  if (!filename) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h3 className="mt-2 text-sm font-medium text-gray-900">No file uploaded</h3>
          <p className="mt-1 text-sm text-gray-500">Upload an IFC file to view the 3D model</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white relative">
      <div ref={containerRef} className="flex-1" style={{ minHeight: 0 }} />
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-95 z-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-800 font-bold text-lg">{loadingProgress}</p>
            <p className="text-sm text-green-600 mt-3 font-semibold">⚡ Fast WebAssembly Loading</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-50">
          <div className="bg-red-50 p-6 rounded-lg shadow-lg max-w-md text-center border border-red-200">
            <h3 className="text-lg font-semibold text-red-600 mb-2">Error Loading Model</h3>
            <p className="text-gray-700 mb-4">{error}</p>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="fixed bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[300px] max-w-[500px] max-h-[600px] overflow-y-auto"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4">
            <h3 className="font-semibold text-lg mb-2">Element Properties</h3>
            {elementData.loading && <p className="text-gray-500">Loading...</p>}
            {elementData.error && <p className="text-red-500">{elementData.error}</p>}
            {elementData.data && (
              <div className="space-y-2 text-sm">
                <div><strong>Product ID:</strong> {elementData.data.product_id}</div>
                <div><strong>Type:</strong> {elementData.data.element_type}</div>
                {elementData.data.property_sets && Object.keys(elementData.data.property_sets).length > 0 && (
                  <div>
                    <strong>Property Sets:</strong>
                    <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-[400px]">
                      {JSON.stringify(elementData.data.property_sets, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      {!error && !isLoading && (
        <div className="border-t bg-gray-50 px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleTransparent}
              disabled={selectedMeshesRef.current.length === 0}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
            >
              Transparent
            </button>
            <button
              onClick={handleHide}
              disabled={selectedMeshesRef.current.length === 0}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
            >
              Hide
            </button>
            <button
              onClick={handleShowAll}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm"
            >
              Show All
            </button>
            {selectedElement && (
              <div className="ml-auto text-sm text-gray-600">
                Selected: {selectedElement.type} (ID: {selectedElement.expressID})
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
