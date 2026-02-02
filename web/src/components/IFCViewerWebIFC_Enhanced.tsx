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
  enableMeasurement?: boolean
  enableClipping?: boolean
}

export default function IFCViewerWebIFCEnhanced({ 
  filename, 
  filters, 
  report, 
  isVisible = true,
  enableMeasurement = true,
  enableClipping = false
}: IFCViewerWebIFCProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const ifcLoaderRef = useRef<WebIFC.IfcAPI | null>(null)
  const modelIDRef = useRef<number | null>(null)
  
  // Selection state
  const [selectionMode, setSelectionMode] = useState<'parts' | 'assemblies'>('parts')
  const selectionModeRef = useRef<'parts' | 'assemblies'>('parts')
  const selectedMeshesRef = useRef<THREE.Mesh[]>([])
  const selectedProductIdsRef = useRef<number[]>([])
  const [assemblyMapping, setAssemblyMapping] = useState<any>(null)
  
  // Measurement state
  const [measurementMode, setMeasurementMode] = useState(false)
  const measurementModeRef = useRef(false)
  const measurementPointsRef = useRef<THREE.Vector3[]>([])
  const measurementDotsRef = useRef<THREE.Mesh[]>([])
  const previewArrowRef = useRef<THREE.ArrowHelper | null>(null)
  const allMeasurementsRef = useRef<Array<{
    arrow: THREE.ArrowHelper | null
    label: HTMLDivElement | null
    dots: THREE.Mesh[]
    start: THREE.Vector3
    end: THREE.Vector3
  }>>([])
  
  // Loading state
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadStatus, setLoadStatus] = useState<string>('')
  const [stats, setStats] = useState<{ products: number, meshes: number } | null>(null)
  
  // Raycaster for selection
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())

  // Keep refs in sync with state
  useEffect(() => {
    measurementModeRef.current = measurementMode
  }, [measurementMode])

  useEffect(() => {
    selectionModeRef.current = selectionMode
  }, [selectionMode])

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current || !filename) return

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

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
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

    // Add click handler for selection
    const handleClick = (event: MouseEvent) => {
      if (measurementModeRef.current) {
        handleMeasurementClick(event)
        return
      }

      if (!containerRef.current || !camera || !scene) return

      const rect = containerRef.current.getBoundingClientRect()
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycasterRef.current.setFromCamera(mouseRef.current, camera)
      
      if (modelRef.current) {
        const intersects = raycasterRef.current.intersectObjects(modelRef.current.children, true)
        
        if (intersects.length > 0) {
          const clickedMesh = intersects[0].object as THREE.Mesh
          handleMeshSelection(clickedMesh)
        } else {
          clearSelection()
        }
      }
    }

    renderer.domElement.addEventListener('click', handleClick)

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('click', handleClick)
      
      if (ifcLoaderRef.current && modelIDRef.current !== null) {
        try {
          ifcLoaderRef.current.CloseModel(modelIDRef.current)
        } catch (e) {
          console.warn('[WebIFC] Error closing model:', e)
        }
      }
      
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

    try {
      const ifcAPI = new WebIFC.IfcAPI()
      ifcAPI.SetWasmPath('/')
      await ifcAPI.Init()
      ifcLoaderRef.current = ifcAPI
      
      setLoadStatus('Downloading IFC file...')
      const response = await fetch(`/api/ifc/${filename}`)
      if (!response.ok) throw new Error('Failed to fetch IFC file')
      
      const data = await response.arrayBuffer()
      const uint8Array = new Uint8Array(data)
      
      setLoadStatus('Opening IFC model...')
      const modelID = ifcAPI.OpenModel(uint8Array, {
        COORDINATE_TO_ORIGIN: true
      })
      modelIDRef.current = modelID
      
      setLoadStatus('Fetching assembly mapping...')
      const mappingResponse = await fetch(`/api/assembly-mapping/${filename}?t=${Date.now()}`)
      let mapping: any = {}
      if (mappingResponse.ok) {
        mapping = await mappingResponse.json()
        setAssemblyMapping(mapping)
      }
      
      setLoadStatus('Loading all geometry...')
      const model = new THREE.Group()
      model.name = 'IFC_Model'
      
      let meshCount = 0
      const ifcMeshes = ifcAPI.LoadAllGeometry(modelID)
      
      for (let meshIndex = 0; meshIndex < ifcMeshes.size(); meshIndex++) {
        const ifcMesh = ifcMeshes.get(meshIndex)
        
        if (ifcMesh.geometries.size() === 0) continue
        
        const productID = ifcMesh.expressID
        const elementInfo = mapping[productID]
        const elementType = elementInfo?.element_type || 'Unknown'
        
        let allVertices: number[] = []
        let allIndices: number[] = []
        let vertexOffset = 0
        let meshColor: THREE.Color | null = null
        let meshOpacity = 1.0
        
        for (let geomIndex = 0; geomIndex < ifcMesh.geometries.size(); geomIndex++) {
          const ifcGeometry = ifcMesh.geometries.get(geomIndex)
          const geometryData = ifcAPI.GetGeometry(modelID, ifcGeometry.geometryExpressID)
          
          const verts = ifcAPI.GetVertexArray(
            geometryData.GetVertexData(),
            geometryData.GetVertexDataSize()
          )
          const inds = ifcAPI.GetIndexArray(
            geometryData.GetIndexData(),
            geometryData.GetIndexDataSize()
          )
          
          if (geomIndex === 0 && ifcGeometry.color) {
            const ifcColor = ifcGeometry.color
            meshColor = new THREE.Color(ifcColor.x, ifcColor.y, ifcColor.z)
            meshOpacity = ifcColor.w
          }
          
          const matrix = new THREE.Matrix4()
          matrix.fromArray(ifcGeometry.flatTransformation)
          
          for (let i = 0; i < verts.length; i += 6) {
            const vertex = new THREE.Vector3(verts[i], verts[i + 1], verts[i + 2])
            vertex.applyMatrix4(matrix)
            allVertices.push(vertex.x, vertex.y, vertex.z)
          }
          
          for (let i = 0; i < inds.length; i++) {
            allIndices.push(inds[i] + vertexOffset)
          }
          
          vertexOffset += verts.length / 6
        }
        
        const bufferGeometry = new THREE.BufferGeometry()
        bufferGeometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(allVertices, 3)
        )
        bufferGeometry.setIndex(allIndices)
        bufferGeometry.computeVertexNormals()
        
        let color: THREE.Color
        let opacity = meshOpacity
        
        if (meshColor) {
          color = meshColor
        } else {
          let colorHex = 0x8888aa
          const isFastener = elementType === 'IfcFastener' || elementType === 'IfcMechanicalFastener'
          
          if (isFastener) {
            colorHex = 0x8B6914
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
        
        const material = new THREE.MeshStandardMaterial({
          color: color,
          metalness: 0.3,
          roughness: 0.7,
          side: THREE.DoubleSide,
          transparent: opacity < 1.0,
          opacity: opacity
        })
        
        const threeMesh = new THREE.Mesh(bufferGeometry, material)
        threeMesh.castShadow = true
        threeMesh.receiveShadow = true
        
        threeMesh.userData = {
          product_id: productID,
          assembly_mark: elementInfo?.assembly_mark || 'N/A',
          assembly_id: elementInfo?.assembly_id || null,
          type: elementType,
          profile_name: elementInfo?.profile_name || undefined,
          plate_thickness: elementInfo?.plate_thickness || undefined,
          originalMaterial: material.clone()
        }
        
        threeMesh.name = `${elementType}_${productID}`
        
        model.add(threeMesh)
        meshCount++
        
        if (meshCount % 50 === 0) {
          setLoadStatus(`Loaded ${meshCount} meshes...`)
        }
      }
      
      setStats({ products: meshCount, meshes: meshCount })
      
      if (sceneRef.current && modelRef.current === null) {
        sceneRef.current.add(model)
        modelRef.current = model
        
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const distance = maxDim * 1.5
        
        if (cameraRef.current && controlsRef.current) {
          const angle = Math.PI / 4
          cameraRef.current.position.set(
            center.x + distance * Math.cos(angle),
            center.y + distance * 0.7,
            center.z + distance * Math.sin(angle)
          )
          cameraRef.current.up.set(0, 1, 0)
          controlsRef.current.target.copy(center)
          controlsRef.current.update()
        }
      }
      
      ifcAPI.CloseModel(modelID)
      
      // Refine geometry for plates (apply boolean operations for holes/cuts)
      await refineGeometry(model, mapping)
      
      setLoadStatus('Model loaded successfully!')
      setTimeout(() => setIsLoading(false), 500)
      
    } catch (error) {
      console.error('[WebIFC] Load error:', error)
      setLoadError(error instanceof Error ? error.message : 'Failed to load IFC file')
      setIsLoading(false)
    }
  }

  const refineGeometry = async (model: THREE.Group, mapping: any) => {
    if (!filename) return
    
    console.log('[Refinement] Starting geometry refinement...')
    
    // Collect all plate IDs that need refinement
    const plateIds: number[] = []
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.type === 'IfcPlate') {
        plateIds.push(child.userData.product_id)
      }
    })
    
    if (plateIds.length === 0) {
      console.log('[Refinement] No plates to refine')
      return
    }
    
    console.log(`[Refinement] Refining ${plateIds.length} plates with accurate geometry...`)
    setLoadStatus(`Refining ${plateIds.length} plates (adding holes/cuts)...`)
    
    try {
      // Fetch refined geometry from server (uses IfcOpenShell with boolean operations)
      const response = await fetch(`/api/refined-geometry/${filename}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ element_ids: plateIds })
      })
      
      if (!response.ok) {
        console.warn('[Refinement] Failed to fetch refined geometry:', response.statusText)
        return
      }
      
      const data = await response.json()
      console.log(`[Refinement] Received ${data.count} refined geometries`)
      
      // Replace simplified meshes with accurate geometry
      let refinedCount = 0
      data.geometries.forEach((geom: any) => {
        // Find the mesh for this element
        let targetMesh: THREE.Mesh | null = null
        model.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.product_id === geom.element_id) {
            targetMesh = child
          }
        })
        
        if (!targetMesh) {
          console.warn(`[Refinement] Mesh not found for element ${geom.element_id}`)
          return
        }
        
        try {
          // Decode base64 geometry data
          const verticesB64 = atob(geom.vertices)
          const indicesB64 = atob(geom.indices)
          
          const verticesBytes = new Uint8Array([...verticesB64].map(c => c.charCodeAt(0)))
          const indicesBytes = new Uint8Array([...indicesB64].map(c => c.charCodeAt(0)))
          
          const vertices = new Float32Array(verticesBytes.buffer)
          const indices = new Uint32Array(indicesBytes.buffer)
          
          // Create new geometry with refined data (includes holes/cuts)
          const newGeometry = new THREE.BufferGeometry()
          newGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
          newGeometry.setIndex(new THREE.BufferAttribute(indices, 1))
          newGeometry.computeVertexNormals()
          
          // Replace geometry (keep material and all other properties)
          const oldGeometry = targetMesh.geometry
          targetMesh.geometry = newGeometry
          oldGeometry.dispose()
          
          refinedCount++
          console.log(`[Refinement] Replaced mesh for element ${geom.element_id} (${geom.element_type})`)
        } catch (err) {
          console.error(`[Refinement] Error processing element ${geom.element_id}:`, err)
        }
      })
      
      console.log(`[Refinement] ✅ Successfully refined ${refinedCount}/${plateIds.length} plates`)
      if (refinedCount > 0) {
        setStats(prev => prev ? { ...prev, meshes: prev.meshes } : null)
      }
    } catch (error) {
      console.error('[Refinement] Error refining geometry:', error)
      // Don't fail the whole load if refinement fails
    }
  }

  const handleMeshSelection = (mesh: THREE.Mesh) => {
    if (selectionModeRef.current === 'parts') {
      // Clear previous selection
      clearSelection()
      
      // Highlight the selected mesh
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.setHex(0x00ff00)
        material.emissiveIntensity = 0.5
      }
      
      selectedMeshesRef.current = [mesh]
      selectedProductIdsRef.current = [mesh.userData.product_id]
    } else {
      // Assembly mode
      const assemblyId = mesh.userData.assembly_id
      if (!assemblyId || !modelRef.current) return
      
      clearSelection()
      
      const assemblyMeshes: THREE.Mesh[] = []
      const productIds: number[] = []
      
      modelRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.assembly_id === assemblyId) {
          const material = Array.isArray(child.material) ? child.material[0] : child.material
          if (material instanceof THREE.MeshStandardMaterial) {
            material.emissive.setHex(0x00ff00)
            material.emissiveIntensity = 0.5
          }
          assemblyMeshes.push(child)
          productIds.push(child.userData.product_id)
        }
      })
      
      selectedMeshesRef.current = assemblyMeshes
      selectedProductIdsRef.current = productIds
    }
  }

  const clearSelection = () => {
    selectedMeshesRef.current.forEach(mesh => {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.setHex(0x000000)
        material.emissiveIntensity = 0
      }
    })
    selectedMeshesRef.current = []
    selectedProductIdsRef.current = []
  }

  const handleTransparent = () => {
    selectedMeshesRef.current.forEach(mesh => {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      if (material instanceof THREE.Material) {
        material.transparent = true
        material.opacity = 0.2
      }
    })
    clearSelection()
  }

  const handleHide = () => {
    selectedMeshesRef.current.forEach(mesh => {
      mesh.visible = false
    })
    clearSelection()
  }

  const handleHideAllExcept = () => {
    if (!modelRef.current) return
    
    const selectedIds = new Set(selectedProductIdsRef.current)
    modelRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.visible = selectedIds.has(child.userData.product_id)
      }
    })
    clearSelection()
  }

  const handleShowAll = () => {
    if (!modelRef.current) return
    
    modelRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.visible = true
        const material = Array.isArray(child.material) ? child.material[0] : child.material
        if (material instanceof THREE.Material && child.userData.originalMaterial) {
          material.transparent = child.userData.originalMaterial.transparent
          material.opacity = child.userData.originalMaterial.opacity
        }
      }
    })
    clearSelection()
  }

  const handleMeasurementClick = (event: MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !sceneRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current)
    
    if (modelRef.current) {
      const intersects = raycasterRef.current.intersectObjects(modelRef.current.children, true)
      
      if (intersects.length > 0) {
        const point = intersects[0].point
        
        if (measurementPointsRef.current.length === 0) {
          // First point
          measurementPointsRef.current.push(point.clone())
          
          // Create red dot
          const dotGeometry = new THREE.SphereGeometry(0.5, 16, 16)
          const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 })
          const dot = new THREE.Mesh(dotGeometry, dotMaterial)
          dot.position.copy(point)
          sceneRef.current.add(dot)
          measurementDotsRef.current.push(dot)
        } else {
          // Second point - complete measurement
          measurementPointsRef.current.push(point.clone())
          
          // Create red dot
          const dotGeometry = new THREE.SphereGeometry(0.5, 16, 16)
          const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 })
          const dot = new THREE.Mesh(dotGeometry, dotMaterial)
          dot.position.copy(point)
          sceneRef.current.add(dot)
          measurementDotsRef.current.push(dot)
          
          // Create arrow
          const start = measurementPointsRef.current[0]
          const end = measurementPointsRef.current[1]
          const direction = new THREE.Vector3().subVectors(end, start)
          const distance = direction.length()
          direction.normalize()
          
          const arrow = new THREE.ArrowHelper(direction, start, distance, 0x0000ff, distance * 0.1, distance * 0.05)
          sceneRef.current.add(arrow)
          
          // Create label
          const labelDiv = document.createElement('div')
          labelDiv.className = 'absolute bg-white px-2 py-1 rounded shadow text-sm font-semibold'
          labelDiv.textContent = `${distance.toFixed(2)} mm`
          labelDiv.style.pointerEvents = 'none'
          labelDiv.style.zIndex = '1000'
          containerRef.current.appendChild(labelDiv)
          
          // Update label position
          const updateLabelPosition = () => {
            if (!cameraRef.current || !rendererRef.current) return
            const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
            const vector = midpoint.clone().project(cameraRef.current)
            const x = (vector.x * 0.5 + 0.5) * rendererRef.current.domElement.clientWidth
            const y = (-(vector.y) * 0.5 + 0.5) * rendererRef.current.domElement.clientHeight
            labelDiv.style.left = `${x}px`
            labelDiv.style.top = `${y}px`
          }
          updateLabelPosition()
          
          // Store measurement
          allMeasurementsRef.current.push({
            arrow,
            label: labelDiv,
            dots: [...measurementDotsRef.current],
            start: start.clone(),
            end: end.clone()
          })
          
          // Clear current measurement
          measurementPointsRef.current = []
          measurementDotsRef.current = []
        }
      }
    }
  }

  const clearAllMeasurements = () => {
    allMeasurementsRef.current.forEach(measurement => {
      if (measurement.arrow && sceneRef.current) {
        sceneRef.current.remove(measurement.arrow)
      }
      if (measurement.label && containerRef.current) {
        containerRef.current.removeChild(measurement.label)
      }
      measurement.dots.forEach(dot => {
        if (sceneRef.current) sceneRef.current.remove(dot)
      })
    })
    allMeasurementsRef.current = []
    
    // Clear current measurement in progress
    measurementPointsRef.current = []
    measurementDotsRef.current.forEach(dot => {
      if (sceneRef.current) sceneRef.current.remove(dot)
    })
    measurementDotsRef.current = []
  }

  const captureScreenshot = () => {
    if (!rendererRef.current) return null
    return rendererRef.current.domElement.toDataURL('image/png')
  }

  const handleSaveScreenshot = () => {
    const dataURL = captureScreenshot()
    if (!dataURL) {
      alert('Failed to capture screenshot')
      return
    }
    
    const link = document.createElement('a')
    link.download = `${filename}_${Date.now()}.png`
    link.href = dataURL
    link.click()
  }

  const handleCopyScreenshot = async () => {
    const dataURL = captureScreenshot()
    if (!dataURL) {
      alert('Failed to capture screenshot')
      return
    }
    
    try {
      const blob = await (await fetch(dataURL)).blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      alert('Screenshot copied to clipboard!')
    } catch (error) {
      console.error('Failed to copy screenshot:', error)
      alert('Failed to copy screenshot to clipboard')
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div ref={containerRef} className="flex-1 relative">
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
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md z-50">
            <strong>Error:</strong> {loadError}
          </div>
        )}
        
        {/* Control Panel */}
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 flex flex-wrap gap-2 max-w-4xl z-10">
          {/* Selection Mode */}
          <button
            onClick={() => {
              setSelectionMode('parts')
            }}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              selectionMode === 'parts'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Parts
          </button>
          <button
            onClick={() => {
              setSelectionMode('assemblies')
            }}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              selectionMode === 'assemblies'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Assemblies
          </button>
          
          {/* Measurement */}
          {enableMeasurement && (
            <>
              <button
                onClick={() => setMeasurementMode(!measurementMode)}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  measurementMode
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-500 text-white hover:bg-gray-600'
                }`}
              >
                📏 Measure
              </button>
              <button
                onClick={clearAllMeasurements}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm font-medium transition-colors"
              >
                🗑️ Clear Measurements
              </button>
            </>
          )}
          
          {/* Screenshot */}
          <button
            onClick={handleSaveScreenshot}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-medium transition-colors"
          >
            💾 Save
          </button>
          <button
            onClick={handleCopyScreenshot}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm font-medium transition-colors"
          >
            📋 Copy
          </button>
          
          {/* Visibility Controls */}
          <button
            onClick={handleTransparent}
            disabled={selectedMeshesRef.current.length === 0}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            Transparent
          </button>
          <button
            onClick={handleHide}
            disabled={selectedMeshesRef.current.length === 0}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            Hide
          </button>
          <button
            onClick={handleHideAllExcept}
            disabled={selectedMeshesRef.current.length === 0}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            Hide All Except
          </button>
          <button
            onClick={handleShowAll}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm font-medium transition-colors"
          >
            Show All
          </button>
        </div>
        
        {/* Info badge */}
        <div className="absolute bottom-4 left-4 space-y-2 z-10">
          <div className="bg-blue-500 text-white px-3 py-1 rounded text-sm shadow">
            web-ifc viewer (enhanced)
          </div>
          {stats && (
            <div className="bg-green-500 text-white px-3 py-1 rounded text-xs shadow">
              {stats.meshes} meshes loaded
            </div>
          )}
          {measurementMode && (
            <div className="bg-green-500 text-white px-3 py-1 rounded text-xs shadow animate-pulse">
              📏 Measurement Mode Active
            </div>
          )}
          {selectedMeshesRef.current.length > 0 && (
            <div className="bg-yellow-500 text-white px-3 py-1 rounded text-xs shadow">
              {selectedMeshesRef.current.length} selected
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

