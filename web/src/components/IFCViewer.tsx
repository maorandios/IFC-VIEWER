import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FilterState } from '../types'

interface IFCViewerProps {
  filename: string
  gltfPath?: string
  gltfAvailable?: boolean
  enableMeasurement?: boolean // Feature flag for measurement tool
  enableClipping?: boolean // Feature flag for clipping planes
  filters?: FilterState
  report?: any // Report data to get plate thickness information
}

type ClipPlaneKey = 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back'

export default function IFCViewer({ filename, gltfPath, gltfAvailable = false, enableMeasurement = false, enableClipping = false, filters, report }: IFCViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const selectedMeshRef = useRef<THREE.Mesh | null>(null)
  const selectedMeshesRef = useRef<THREE.Mesh[]>([]) // Store multiple selected meshes for assembly mode
  const selectedProductIdsRef = useRef<number[]>([]) // Store product IDs for reliable lookup
  // Pointer state refs for drag detection and pivot management
  const isPointerDownRef = useRef<boolean>(false)
  const dragStartedRef = useRef<boolean>(false)
  const downPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const DRAG_THRESHOLD_PX = 4
  const pendingPivotRef = useRef<THREE.Vector3 | null>(null) // Store pivot point calculated on pointer down
  const isAnimatingPivotRef = useRef<boolean>(false) // Track if we're animating the pivot transition
  const animationStartTimeRef = useRef<number>(0) // Track animation start time
  const oldTargetRef = useRef<THREE.Vector3 | null>(null) // Store old target for animation
  const oldCameraPosRef = useRef<THREE.Vector3 | null>(null) // Store old camera position for animation
  const targetPivotRef = useRef<THREE.Vector3 | null>(null) // Store target pivot point for animation
  
  // Measurement refs
  const [measurementMode, setMeasurementMode] = useState<boolean>(false)
  const measurementModeRef = useRef<boolean>(false) // Ref to track measurement mode for event handlers
  const measurementPointsRef = useRef<THREE.Vector3[]>([]) // Store start and end points for current measurement
  const measurementLineRef = useRef<THREE.Line | null>(null) // Reference to the current measurement line
  const measurementLabelRef = useRef<THREE.Group | null>(null) // Reference to the distance label (legacy, for cleanup)
  const measurementLabelDivRef = useRef<HTMLDivElement | null>(null) // Reference to the HTML label div for current measurement
  const measurementDotsRef = useRef<THREE.Mesh[]>([]) // Store red dots for current measurement points
  const previewArrowRef = useRef<THREE.ArrowHelper | null>(null) // Arrow that follows cursor from start point
  
  // Store all completed measurements
  const allMeasurementsRef = useRef<Array<{
    arrow: THREE.ArrowHelper | null
    label: HTMLDivElement | null
    dots: THREE.Mesh[]
    start: THREE.Vector3
    end: THREE.Vector3
  }>>([])
  const hoverPreviewMarkerRef = useRef<THREE.Sprite | null>(null) // Preview marker when hovering over geometry
  
  // Clipping refs/state
  const [clippingMode, setClippingMode] = useState<boolean>(false)
  const clippingModeRef = useRef<boolean>(false)
  const [activeClipPlane, setActiveClipPlane] = useState<ClipPlaneKey | null>(null)
  const activeClipPlaneRef = useRef<ClipPlaneKey | null>(null)
  const [clipAmount, setClipAmount] = useState<number>(0) // 0..1 fraction of model size along normal
  const clipAmountRef = useRef<number>(0)
  
  const clippingPlaneRef = useRef<THREE.Plane | null>(null)
  const clippingHelperRef = useRef<THREE.Group | null>(null)
  const modelBoundsRef = useRef<{ min: THREE.Vector3; max: THREE.Vector3; size: THREE.Vector3; center: THREE.Vector3 } | null>(null)
  
  // Markup refs/state
  const [markupMode, setMarkupMode] = useState<boolean>(false)
  const [activeMarkupTool, setActiveMarkupTool] = useState<'pencil' | 'arrow' | 'cloud' | 'text' | null>(null)
  const [markupColor, setMarkupColor] = useState<'red' | 'black' | 'yellow' | 'green' | 'blue'>('red')
  const [markupThickness, setMarkupThickness] = useState<number>(3) // 1-5 levels (thin to bold)
  const markupCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const markupContainerRef = useRef<HTMLDivElement | null>(null)
  const isDrawingRef = useRef<boolean>(false)
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null)
  const currentPencilPathRef = useRef<Array<{ x: number; y: number }>>([]) // Store current pencil path points
  const lastPencilPointRef = useRef<{ x: number; y: number } | null>(null) // Last point for smooth curve drawing
  const markupElementsRef = useRef<Array<{
    type: 'pencil' | 'arrow' | 'cloud' | 'text'
    data: any
    id: string
    color?: string
    thickness?: number
    path?: Array<{ x: number; y: number }> // For pencil paths
  }>>([])
  const textElementsRef = useRef<Array<{
    id: string
    element: HTMLDivElement
    x: number
    y: number
  }>>([])
  
  // Keep measurementModeRef in sync with measurementMode state
  useEffect(() => {
    measurementModeRef.current = measurementMode
  }, [measurementMode])
  
  // Keep clippingModeRef in sync
  useEffect(() => {
    clippingModeRef.current = clippingMode
  }, [clippingMode])
  
  // If clipping feature flag is turned off externally, ensure cleanup
  useEffect(() => {
    if (!enableClipping) {
      setClippingMode(false)
      clippingModeRef.current = false
      activeClipPlaneRef.current = null
      setActiveClipPlane(null)
      clipAmountRef.current = 0
      setClipAmount(0)
      disableClippingPlane()
    }
  }, [enableClipping])
  
  // Selection refs
  const handleSelectionFromMeshRef = useRef<((mesh: THREE.Mesh) => Promise<void>) | null>(null) // Store selection handler
  const clearSelectionRef = useRef<(() => void) | null>(null) // Store clearSelection function
  const [selectedElement, setSelectedElement] = useState<{ expressID: number; type: string } | null>(null)
  const [selectionMode, setSelectionMode] = useState<'parts' | 'assemblies'>('parts')
  const selectionModeRef = useRef<'parts' | 'assemblies'>('parts')
  const [loadError, setLoadError] = useState<string | null>(null)
  
  // Track element states: 'normal' | 'transparent' | 'hidden'
  const elementStatesRef = useRef<Map<THREE.Mesh, 'normal' | 'transparent' | 'hidden'>>(new Map())
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map())
  const originalVisibilityRef = useRef<Map<THREE.Mesh, boolean>>(new Map())

  // Keep ref in sync with state
  useEffect(() => {
    selectionModeRef.current = selectionMode
  }, [selectionMode])
  const [isLoading, setIsLoading] = useState(false)
  const [conversionStatus, setConversionStatus] = useState<string>('')
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    element: THREE.Mesh | null
    productId: number | null
    assemblyId: number | null  // For assembly mode
  }>({
    visible: false,
    x: 0,
    y: 0,
    element: null,
    productId: null,
    assemblyId: null
  })
  
  // Element data for context menu
  const [elementData, setElementData] = useState<{
    loading: boolean
    data: {
      product_id: number
      element_type: string
      basic_attributes: Record<string, any>
      property_sets: Record<string, Record<string, any>>
      materials: Array<any>
      relationships: Record<string, any>
      profile_info: Record<string, any>
      geometry_info: Record<string, any>
    } | null
    error: string | null
  }>({
    loading: false,
    data: null,
    error: null
  })

  useEffect(() => {
    if (!containerRef.current || !filename) {
      setLoadError(null)
      setIsLoading(false)
      return
    }

    // Create scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf0f0f0)
    sceneRef.current = scene

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.01,  // Near plane - small but not extreme to prevent clipping issues (0.01-0.1 range)
      10000  // Increased far plane for large models
    )
    camera.updateProjectionMatrix()
    // Initial camera position (will be adjusted when model loads)
    camera.position.set(10, 10, 10)
    camera.up.set(0, 1, 0)  // Ensure Y-up coordinate system
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // Create renderer with preserveDrawingBuffer enabled for screenshots
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      preserveDrawingBuffer: true // Required for screenshot capture
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setClearColor(0xf0f0f0)
    renderer.outputEncoding = THREE.sRGBEncoding
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2 // Slightly increased for better visibility
    // renderer.physicallyCorrectLights = true // Not available in this Three.js version
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Add lights - important for materials to show correctly
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x666666, 0.5)
    scene.add(hemiLight)
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.6)
    directionalLight1.position.set(12, 14, 10)
    directionalLight1.castShadow = true
    directionalLight1.shadow.mapSize.set(2048, 2048)
    directionalLight1.shadow.bias = -0.0005
    directionalLight1.shadow.camera.near = 0.1
    directionalLight1.shadow.camera.far = 1000
    directionalLight1.shadow.camera.left = -100
    directionalLight1.shadow.camera.right = 100
    directionalLight1.shadow.camera.top = 100
    directionalLight1.shadow.camera.bottom = -100
    scene.add(directionalLight1)
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.9)
    directionalLight2.position.set(-10, -12, -8)
    directionalLight2.castShadow = true
    directionalLight2.shadow.mapSize.set(1024, 1024)
    directionalLight2.shadow.bias = -0.0005
    directionalLight2.shadow.camera.near = 0.1
    directionalLight2.shadow.camera.far = 1000
    directionalLight2.shadow.camera.left = -100
    directionalLight2.shadow.camera.right = 100
    directionalLight2.shadow.camera.top = 100
    directionalLight2.shadow.camera.bottom = -100
    scene.add(directionalLight2)

    // Setup controls to match Tekla (Trimble) online viewer feel
    const controls = new OrbitControls(camera, renderer.domElement)
    
    // Enable smooth damping/inertia for Tekla-like feel
    controls.enableDamping = true
    controls.dampingFactor = 0.1  // Moderate damping for smooth, controlled movement
    
    // Enable all controls
    controls.enablePan = true
    controls.enableZoom = true  // Enable default zoom (dolly to target only)
    controls.enableRotate = true
    
    // Tekla-like speeds: moderate rotation, slow pan
    controls.rotateSpeed = 0.8  // Moderate rotation speed
    controls.panSpeed = 0.5    // Slow pan speed (Tekla-like)
    controls.zoomSpeed = 0.9    // Limited zoom speed to prevent huge dolly steps (0.8-1.0 range)
    
    // Sensible distance limits - allow very close zooming to elements
    controls.minDistance = 0.01  // Allow close zoom but not extreme (prevents clipping issues)
    controls.maxDistance = 10000  // Maximum zoom distance
    
    // Enable zoom to cursor - zoom will follow the cursor location on the view
    controls.zoomToCursor = true
    
    // Pan in world space for correct axis movement
    controls.screenSpacePanning = false
    
    // Rotation constraints - prevent flipping and maintain stability
    controls.minPolarAngle = 0      // Allow looking from top
    controls.maxPolarAngle = Math.PI // Allow looking from bottom
    
    // Mouse button mappings (Tekla-like)
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,    // Left-drag: rotate (orbit around model)
      MIDDLE: THREE.MOUSE.DOLLY,    // Middle-drag: zoom
      RIGHT: THREE.MOUSE.PAN        // Right-drag: pan (move view)
    }
    
    // Enable pan for right mouse button
    controls.enablePan = true
    
    // Touch controls for mobile
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    }
    
    // Keyboard controls (optional, for arrow keys)
    controls.keys = {
      LEFT: 'ArrowLeft',
      UP: 'ArrowUp',
      RIGHT: 'ArrowRight',
      BOTTOM: 'ArrowDown'
    }
    
    // Disable auto-rotate
    controls.autoRotate = false
    
    // Make sure up vector is correct (Y-up is standard)
    controls.target.set(0, 0, 0)
    
    // Helper function to raycast and find mesh
    // Helper function to raycast and find mesh (currently unused)
    // @ts-ignore - intentionally unused, kept for potential future use
    const _raycastForMeshAtPosition = (clientX: number, clientY: number): { intersection: THREE.Intersection | null, mesh: THREE.Mesh | null } => {
      if (!containerRef.current || !camera || !modelRef.current) {
        return { intersection: null, mesh: null }
      }
      
      // Compute NDC from canvas bounding rect
      const rect = containerRef.current.getBoundingClientRect()
      const clickX = clientX - rect.left
      const clickY = clientY - rect.top
      
      // Verify click is within the container bounds
      if (clickX < 0 || clickX > rect.width || clickY < 0 || clickY > rect.height) {
        return { intersection: null, mesh: null }
      }
      
      const mouseX = (clickX / rect.width) * 2 - 1
      const mouseY = -((clickY / rect.height) * 2 - 1)
      
      // Raycast against model group meshes only (ignore helpers)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera)
      const intersections = raycaster.intersectObjects(modelRef.current.children, true)
      
      // Filter out edge lines and find best mesh intersection
      let bestIntersection = null
      let bestMesh = null
      
      for (const intersection of intersections) {
        const obj = intersection.object as any
        // Skip edge lines completely
        if (obj.isLine || obj.isLineSegments || (obj.name && obj.name.includes('_edges'))) {
          continue
        }
        // Use the first valid visible mesh intersection
        if (obj.isMesh && obj.visible && intersection.distance > 0 && intersection.distance < camera.far) {
          bestIntersection = intersection
          bestMesh = obj as THREE.Mesh
          break
        }
      }
      
      // If no mesh found, try to get parent mesh from edge lines
      if (!bestMesh) {
        for (const intersection of intersections) {
          const obj = intersection.object as any
          if (obj.isLine || obj.isLineSegments || (obj.name && obj.name.includes('_edges'))) {
            // Try to find parent mesh
            let parent = obj.parent
            let depth = 0
            while (parent && depth < 5) {
              if (parent.isMesh && (parent as THREE.Mesh).visible) {
                const parentMesh = parent as THREE.Mesh
                if (intersection.distance > 0 && intersection.distance < camera.far) {
                  bestIntersection = intersection
                  bestMesh = parentMesh
                  break
                }
              }
              parent = parent.parent
              depth++
            }
            if (bestMesh) break
          }
        }
      }
      
      return { intersection: bestIntersection, mesh: bestMesh }
    }
    
    // 2) On pointerdown on the canvas
    const onPointerDown = (event: PointerEvent) => {
      // Only handle left button for orbit/selection
      if (event.button !== 0) return
      
      // Set pointer down state
      isPointerDownRef.current = true
      dragStartedRef.current = false
      downPosRef.current = { x: event.clientX, y: event.clientY }
      
      // Shift + Left: panning (handled by OrbitControls)
      if (event.shiftKey) {
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN
        return
      }
      
      // Left-click: orbit
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
      
      // Calculate and store pivot point at cursor position (but don't apply it yet)
      // Only apply when dragging actually starts
      if (containerRef.current && camera && controls) {
        const rect = containerRef.current.getBoundingClientRect()
        const clickX = event.clientX - rect.left
        const clickY = event.clientY - rect.top
        
        // Verify click is within the container bounds
        if (clickX >= 0 && clickX <= rect.width && clickY >= 0 && clickY <= rect.height) {
          const mouseX = (clickX / rect.width) * 2 - 1
          const mouseY = -((clickY / rect.height) * 2 - 1)
          
          const raycaster = new THREE.Raycaster()
          raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera)
          
          // First, try to find geometry intersection for more accurate pivot
          let pivotPoint: THREE.Vector3 | null = null
          
          if (modelRef.current) {
          const pickables: THREE.Mesh[] = []
          modelRef.current.traverse((child: any) => {
            if (child.isMesh && child.visible) {
              if (!child.isLine && !child.isLineSegments && !(child.name && child.name.includes('_edges'))) {
                pickables.push(child)
              }
            }
          })
          
          const intersections = raycaster.intersectObjects(pickables, true)
          const validIntersections = intersections.filter(intersection => {
            const obj = intersection.object as any
            return obj.isMesh && obj.visible && intersection.distance > 0 && intersection.distance < camera.far
          })
          
          if (validIntersections.length > 0) {
              pivotPoint = validIntersections[0].point.clone()
            }
          }
          
          // If no geometry hit, create pivot point at cursor depth using a plane
          if (!pivotPoint) {
            const currentDistance = camera.position.distanceTo(controls.target)
            const planeNormal = camera.getWorldDirection(new THREE.Vector3())
            const planePoint = controls.target.clone()
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint)
            
            const intersectionPoint = new THREE.Vector3()
            const hasIntersection = raycaster.ray.intersectPlane(plane, intersectionPoint)
            
            if (hasIntersection) {
              pivotPoint = intersectionPoint.clone()
      } else {
              // Fallback: use a point along the ray at a reasonable distance
              pivotPoint = raycaster.ray.at(currentDistance * 0.8, new THREE.Vector3())
            }
          }
          
          // Store pivot point for later (when dragging starts)
          pendingPivotRef.current = pivotPoint
        }
      }
      
      // DO NOT select here
    }
    
    // 3) On pointermove
    const onPointerMove = (event: PointerEvent) => {
      // If measurement mode is active, check for geometry hover
      if (enableMeasurement && measurementModeRef.current && !isPointerDownRef.current) {
        if (containerRef.current && camera && modelRef.current) {
          const rect = containerRef.current.getBoundingClientRect()
          const mouseX = event.clientX - rect.left
          const mouseY = event.clientY - rect.top
          
          // Verify mouse is within the container bounds
          if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
            const normalizedX = (mouseX / rect.width) * 2 - 1
            const normalizedY = -((mouseY / rect.height) * 2 - 1)
            
            const raycaster = new THREE.Raycaster()
            raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), camera)
            
            // Check for geometry intersection
            const pickables: THREE.Mesh[] = []
            modelRef.current.traverse((child: any) => {
              if (child.isMesh && child.visible) {
                if (!child.isLine && !child.isLineSegments && !(child.name && child.name.includes('_edges'))) {
                  pickables.push(child)
                }
              }
            })
            
            const intersections = raycaster.intersectObjects(pickables, true)
            const validIntersections = intersections.filter(intersection => {
              const obj = intersection.object as any
              return obj.isMesh && obj.visible && intersection.distance > 0 && intersection.distance < camera.far
            })
            
            if (validIntersections.length > 0) {
              const intersection = validIntersections[0]
              
              // Check for corner snapping first (corners take priority)
              // Only snap when cursor is very close to a corner (1cm) - don't auto-find closest
              const cornerSnapDistance = 0.01 // 1cm snap distance for corners - only when very close
              let snappedPoint = findClosestCorner(intersection, modelRef.current, cornerSnapDistance)
              
              // If not near a corner, check for edge snapping
              if (!snappedPoint) {
                const edgeSnapDistance = 0.1 // 10cm snap distance for edges
                snappedPoint = findClosestEdgePoint(intersection, modelRef.current, edgeSnapDistance)
              }
              
              // Only show square cursor when near a corner or edge
              if (snappedPoint) {
                const snappedHitPoint = snappedPoint
                
                // Calculate square size for fixed 30x30 pixels on screen
                // Convert pixel size to world size based on distance and camera FOV
                const distanceToCamera = camera.position.distanceTo(snappedHitPoint)
                const fov = camera.fov * (Math.PI / 180) // Convert to radians
                const height = 2 * Math.tan(fov / 2) * distanceToCamera // World height at distance
                const pixelToWorld = height / (containerRef.current?.clientHeight || 1)
                const squareSizeWorld = 30 * pixelToWorld // 30 pixels in world units
                
                // Update hover preview marker - square icon with red border only
                if (!hoverPreviewMarkerRef.current) {
                  // Create a canvas for the square icon
                  const canvas = document.createElement('canvas')
                  canvas.width = 30
                  canvas.height = 30
                  const ctx = canvas.getContext('2d')
                  if (ctx) {
                    // Draw a red square border
                    ctx.strokeStyle = '#ff0000'
                    ctx.lineWidth = 2
                    ctx.strokeRect(1, 1, 28, 28) // 2px border, 28px inner square
                  }
                  
                  // Create a sprite from the canvas
                  const texture = new THREE.CanvasTexture(canvas)
                  const spriteMaterial = new THREE.SpriteMaterial({
                    map: texture,
                    transparent: true,
                    alphaTest: 0.1
                  })
                  const sprite = new THREE.Sprite(spriteMaterial)
                  sprite.name = 'measurement-hover-preview'
                  scene.add(sprite)
                  hoverPreviewMarkerRef.current = sprite
                }
                
                // Scale the sprite to be exactly 30x30 pixels on screen
                if (hoverPreviewMarkerRef.current) {
                  hoverPreviewMarkerRef.current.scale.set(squareSizeWorld, squareSizeWorld, 1)
                  
                  // Position the marker at the snapped corner/edge point
                  hoverPreviewMarkerRef.current.position.copy(snappedHitPoint)
                  
                  // Sprite automatically faces camera, so no rotation needed
                  
                  hoverPreviewMarkerRef.current.visible = true
                }
                
                // Change cursor style - hide default cursor, square icon acts as cursor
                if (containerRef.current) {
                  containerRef.current.style.cursor = 'none'
                }
                
                // Update preview arrow if we have a start point
                if (measurementPointsRef.current.length === 1) {
                  const startPoint = measurementPointsRef.current[0]
                  updatePreviewArrow(startPoint, snappedHitPoint)
                }
              } else {
                // Not near a corner or edge - hide square and show default cursor
                if (hoverPreviewMarkerRef.current) {
                  hoverPreviewMarkerRef.current.visible = false
                }
                if (containerRef.current) {
                  containerRef.current.style.cursor = 'default'
                }
                
                // Still update preview arrow if we have a start point (use plane intersection)
                if (measurementPointsRef.current.length === 1) {
                  const startPoint = measurementPointsRef.current[0]
                  const currentDistance = camera.position.distanceTo(controls.target)
                  const planeNormal = camera.getWorldDirection(new THREE.Vector3())
                  const planePoint = controls.target.clone()
                  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint)
                  
                  const intersectionPoint = new THREE.Vector3()
                  const hasIntersection = raycaster.ray.intersectPlane(plane, intersectionPoint)
                  const currentPoint = hasIntersection ? intersectionPoint : raycaster.ray.at(currentDistance * 0.8, new THREE.Vector3())
                  updatePreviewArrow(startPoint, currentPoint)
                }
              }
            } else {
              // No geometry under cursor - hide square, user can only measure on element edges/corners
              if (hoverPreviewMarkerRef.current) {
                hoverPreviewMarkerRef.current.visible = false
              }
              
              // Hide preview arrow when not over geometry
              if (previewArrowRef.current) {
                previewArrowRef.current.visible = false
              }
              
              // Change cursor to default (measurement only works on edges/corners)
              if (containerRef.current) {
                containerRef.current.style.cursor = 'default'
              }
            }
          }
        }
      } else {
        // Not in measurement mode - hide preview and reset cursor
        if (hoverPreviewMarkerRef.current) {
          hoverPreviewMarkerRef.current.visible = false
        }
        if (containerRef.current && !isPointerDownRef.current) {
          containerRef.current.style.cursor = 'default'
        }
      }
      
      // If pointer is not down, return (for drag detection)
      if (!isPointerDownRef.current) return
      
      // Compute moved distance from downPos
      const deltaX = event.clientX - downPosRef.current.x
      const deltaY = event.clientY - downPosRef.current.y
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      
      // If distance > DRAG_THRESHOLD_PX and !dragStartedRef.current:
      if (distance > DRAG_THRESHOLD_PX && !dragStartedRef.current) {
        dragStartedRef.current = true
        
        // Start smooth animation to the pivot point that was calculated on pointer down
        if (pendingPivotRef.current && camera && controls) {
          const pivotPoint = pendingPivotRef.current
          oldTargetRef.current = controls.target.clone()
          oldCameraPosRef.current = camera.position.clone()
          targetPivotRef.current = pivotPoint.clone()
          isAnimatingPivotRef.current = true
          animationStartTimeRef.current = performance.now()
        }
      }
      
      // Do not do selection in pointermove
    }
    
    // 4) On pointerup
    const onPointerUp = async (event: PointerEvent) => {
      // Only handle left button for orbit/selection
      if (event.button !== 0) return
      
      // Reset pointer down state
      isPointerDownRef.current = false
      
      // If dragStartedRef.current is true: user was orbiting, not clicking
      if (dragStartedRef.current) {
        dragStartedRef.current = false
        pendingPivotRef.current = null
        // Reset animation state
        isAnimatingPivotRef.current = false
        oldTargetRef.current = null
        oldCameraPosRef.current = null
        targetPivotRef.current = null
        return // Do NOT run selection
      }
      
      // Clear pending pivot on click (no drag)
      pendingPivotRef.current = null
      // Reset animation state
      isAnimatingPivotRef.current = false
      oldTargetRef.current = null
      oldCameraPosRef.current = null
      targetPivotRef.current = null
      
      // MEASUREMENT MODE: Handle measurement clicks
      console.log('[MEASUREMENT] onPointerUp - enableMeasurement:', enableMeasurement, 'measurementMode:', measurementMode, 'measurementModeRef:', measurementModeRef.current)
      if (enableMeasurement && measurementModeRef.current) {
        console.log('[MEASUREMENT] Entering measurement mode handler')
        if (!containerRef.current || !camera || !modelRef.current) {
          return
        }
        
        // Ignore clicks on buttons or control panel
        const target = event.target as HTMLElement
        if (target.tagName === 'BUTTON' || target.closest('button') || target.closest('.absolute.bottom-4')) {
          return
        }
        
        const rect = containerRef.current.getBoundingClientRect()
        const clickX = event.clientX - rect.left
        const clickY = event.clientY - rect.top
        
        // Verify click is within the container bounds
        if (clickX < 0 || clickX > rect.width || clickY < 0 || clickY > rect.height) {
          return
        }
        
        const mouseX = (clickX / rect.width) * 2 - 1
        const mouseY = -((clickY / rect.height) * 2 - 1)
        
        const raycaster = new THREE.Raycaster()
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera)
        
        // Always prioritize geometry intersections - require actual geometry hit
        let clickPoint: THREE.Vector3 | null = null
        let hitMesh: THREE.Mesh | null = null
        
        if (modelRef.current) {
          const pickables: THREE.Mesh[] = []
          modelRef.current.traverse((child: any) => {
            if (child.isMesh && child.visible) {
              // Only include actual geometry meshes, exclude lines and edges
              if (!child.isLine && !child.isLineSegments && !(child.name && child.name.includes('_edges'))) {
                pickables.push(child)
              }
            }
          })
          
          // Get all intersections sorted by distance
          const intersections = raycaster.intersectObjects(pickables, true)
          const validIntersections = intersections.filter(intersection => {
            const obj = intersection.object as any
            return obj.isMesh && obj.visible && intersection.distance > 0 && intersection.distance < camera.far
          })
          
          if (validIntersections.length > 0) {
            // Use the closest geometry intersection
            const closestHit = validIntersections[0]
            
            // Check for corner snapping first (corners take priority)
            // Only snap when cursor is very close to a corner (1cm) - don't auto-find closest
            const cornerSnapDistance = 0.01 // 1cm snap distance for corners - only when very close
            let snappedPoint = findClosestCorner(closestHit, modelRef.current, cornerSnapDistance)
            
            // If not near a corner, check for edge snapping
            if (!snappedPoint) {
              const edgeSnapDistance = 0.1 // 10cm snap distance for edges
              snappedPoint = findClosestEdgePoint(closestHit, modelRef.current, edgeSnapDistance)
            }
            
            // Only allow measurement if we're near a corner or edge
            // Don't allow measurement from the middle of surfaces
            if (snappedPoint) {
              clickPoint = snappedPoint.clone()
              hitMesh = closestHit.object as THREE.Mesh
              console.log('[MEASUREMENT] Snapped to corner/edge on click:', clickPoint)
            } else {
              // Not near a corner or edge - don't create measurement point
              console.log('[MEASUREMENT] Click ignored - not near corner or edge')
              return // Exit early, don't create measurement point
            }
            
            console.log('[MEASUREMENT] Geometry hit:', {
              point: clickPoint,
              mesh: hitMesh.name || 'unnamed',
              distance: closestHit.distance,
              snapped: !!snappedPoint
            })
          }
        }
        
        // Only allow measurement on element edges/corners - no plane intersection fallback
        if (!clickPoint) {
          console.log('[MEASUREMENT] Click ignored - measurement only works on element edges/corners')
          return // Exit early, don't create measurement point
        }
        
        if (clickPoint) {
          console.log('[MEASUREMENT] Click detected, current points:', measurementPointsRef.current.length)
          
          if (measurementPointsRef.current.length === 0) {
            // First point - create red dot
            measurementPointsRef.current = [clickPoint]
            createMeasurementDot(clickPoint)
            console.log('[MEASUREMENT] First point set:', clickPoint)
          } else if (measurementPointsRef.current.length === 1) {
            // Second point - create final measurement
            const startPoint = measurementPointsRef.current[0].clone()
            const endPoint = clickPoint.clone()
            measurementPointsRef.current.push(endPoint)
            createMeasurementDot(endPoint) // Red dot for second point
            createMeasurementArrow(startPoint, endPoint) // Final arrow
            console.log('[MEASUREMENT] Measurement created successfully')
          } else {
            // Reset and start new measurement
            clearMeasurement()
            measurementPointsRef.current = [clickPoint]
            createMeasurementDot(clickPoint) // Red dot for new first point
            console.log('[MEASUREMENT] Reset, first point set:', clickPoint)
          }
        } else {
          console.log('[MEASUREMENT] No click point found')
        }
        
        return // Don't run selection in measurement mode
      }
      
      // Else (no drag => it's a click): Run selection raycast
      if (!containerRef.current || !camera || !modelRef.current) {
        return
      }
      
      // Ignore clicks on buttons or control panel
      const target = event.target as HTMLElement
      if (target.tagName === 'BUTTON' || target.closest('button') || target.closest('.absolute.bottom-4')) {
        return
      }
      
      const rect = containerRef.current.getBoundingClientRect()
      const clickX = event.clientX - rect.left
      const clickY = event.clientY - rect.top
      
      // Verify click is within the container bounds
      if (clickX < 0 || clickX > rect.width || clickY < 0 || clickY > rect.height) {
        return
      }
      
      const mouseX = (clickX / rect.width) * 2 - 1
      const mouseY = -((clickY / rect.height) * 2 - 1)
      
      // Raycast against model meshes only (filter out helpers, gizmos, invisible meshes)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera)
      
      // Get all meshes from model group (pickables)
      const pickables: THREE.Mesh[] = []
      modelRef.current.traverse((child: any) => {
        if (child.isMesh && child.visible) {
          // Filter out helpers, gizmos, and edge lines
          if (!child.isLine && !child.isLineSegments && !(child.name && child.name.includes('_edges'))) {
            pickables.push(child)
          }
        }
      })
      
      const intersections = raycaster.intersectObjects(pickables, true)
      
      // Filter intersections to only visible meshes
      const validIntersections = intersections.filter(intersection => {
        const obj = intersection.object as any
        return obj.isMesh && obj.visible && intersection.distance > 0 && intersection.distance < camera.far
      })
      
      // If no intersections: clear selection
      if (validIntersections.length === 0) {
        if (clearSelectionRef.current) {
          clearSelectionRef.current()
        }
        setSelectedElement(null)
        console.log('[SELECTION] no hit - clearing selection')
        return
      }
      
      // Get first valid hit
      const hit = validIntersections[0]
      const hitObject = hit.object as THREE.Mesh
      
      // Determine hitProductId from hit.object.userData
      const hitProductId = hitObject.userData?.product_id || 
                          hitObject.userData?.expressID || 
                          hitObject.userData?.id ||
                          ((hitObject as any).metadata?.product_id)
      
      // Toggle/select logic (same object => clearSelection, different => select)
      if (selectedProductIdsRef.current.length === 1 && 
          selectedProductIdsRef.current[0] === hitProductId) {
        // Currently selected object clicked again - toggle off (deselect)
        if (clearSelectionRef.current) {
          clearSelectionRef.current()
        }
        setSelectedElement(null)
        console.log('[SELECTION] toggle off (same object)')
      } else {
        // Select the hit object
        // IMPORTANT: In this click path, do NOT set controls.target, do NOT move camera, do NOT "fit to view"
        if (handleSelectionFromMeshRef.current) {
          await handleSelectionFromMeshRef.current(hitObject)
        }
        console.log('[CLICK] selection')
      }
    }
    
    // Handle right-click context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      
      // Don't show context menu if clicking on UI elements
      const target = e.target as HTMLElement
      if (target.tagName === 'BUTTON' || target.closest('button') || target.closest('.absolute.bottom-4')) {
        return
      }
      
      // Only show context menu if an element is already selected via left click
      // Check refs which are more reliable than state
      const hasMesh = selectedMeshRef.current !== null
      const hasProductIds = selectedProductIdsRef.current.length > 0
      const hasSelection = hasMesh || hasProductIds
      
      if (!hasSelection) {
        setContextMenu({ visible: false, x: 0, y: 0, element: null, productId: null, assemblyId: null })
        return
      }
      
      // Use selectedMeshRef if available (most reliable)
      let selectedMesh: THREE.Mesh | null = selectedMeshRef.current
      let selectedProductId: number | null = null
      
      if (selectedMesh) {
        // Get product ID from the selected mesh
        const rawProductId = selectedMesh.userData?.product_id || 
                           selectedMesh.userData?.expressID || 
                           selectedMesh.userData?.id ||
                           ((selectedMesh as any).metadata?.product_id) ||
                           null
        // Ensure it's a number
        selectedProductId = rawProductId !== null ? Number(rawProductId) : null
        if (selectedProductId !== null && isNaN(selectedProductId)) {
          selectedProductId = null
        }
      } else if (selectedProductIdsRef.current.length > 0) {
        // Find the mesh by product ID
        const rawId = selectedProductIdsRef.current[0]
        selectedProductId = rawId !== null ? Number(rawId) : null
        if (selectedProductId !== null && isNaN(selectedProductId)) {
          selectedProductId = null
        }
        
        if (modelRef.current) {
          modelRef.current.traverse((child: any) => {
            if (child.isMesh && !selectedMesh) {
              const productId = child.userData?.product_id || 
                              child.userData?.expressID || 
                              child.userData?.id ||
                              ((child as any).metadata?.product_id)
              if (productId === selectedProductId) {
                selectedMesh = child
              }
            }
          })
        }
      }
      
      if (selectedMesh && selectedProductId !== null) {
        // Get assembly_id if in assembly mode
        let assemblyId: number | null = null
        if (selectionModeRef.current === 'assemblies') {
          // Try to get assembly_id from the selected mesh
          assemblyId = selectedMesh.userData?.assembly_id || null
          
          // If not found in userData, try to get from assembly mapping
          if (!assemblyId && modelRef.current?.userData?.assemblyMapping) {
            const mapping = modelRef.current.userData.assemblyMapping
            const mappingEntry = mapping[selectedProductId]
            if (mappingEntry && mappingEntry.assembly_id) {
              assemblyId = mappingEntry.assembly_id
            }
          }
        }
        
        // Show context menu for the currently selected element
        setContextMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          element: selectedMesh,
          productId: selectedProductId,
          assemblyId: assemblyId
        })
      } else {
        setContextMenu({ visible: false, x: 0, y: 0, element: null, productId: null, assemblyId: null })
      }
    }
    
    // No custom wheel handler - use default OrbitControls zoom
    
    // Add pointer event listeners (single source of truth, pointer events only)
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('contextmenu', handleContextMenu)
    
    // Ensure camera up vector stays correct on any control change
    const handleChange = () => {
      camera.up.set(0, 1, 0)
    }
    controls.addEventListener('change', handleChange)
    
    controlsRef.current = controls
    
    // Store cleanup functions for later
    const cleanupMouseHandlers = () => {
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu)
      // No custom wheel handler to clean up - using default OrbitControls zoom
    }

    // Load glTF file
    const loadGLTF = async () => {
      if (!filename) {
        console.warn('No filename provided to IFCViewer')
        return
      }

      setIsLoading(true)
      setLoadError(null)
      setConversionStatus('')

      try {
        // Determine glTF path - use gltfPath from upload response if available
        const gltfFilename = gltfPath || `/api/gltf/${filename.replace('.ifc', '.glb').replace('.IFC', '.glb')}`
        
        // Check if glTF file exists (skip check if we know it's available from upload)
        let gltfExists = gltfAvailable
        if (!gltfExists) {
          try {
            const headResponse = await fetch(gltfFilename, { method: 'HEAD' })
            gltfExists = headResponse.ok
          } catch (e) {
            // File doesn't exist, need to convert
          }
        }

        if (!gltfExists) {
          // Trigger conversion
          setConversionStatus('Converting IFC to glTF... This may take a moment.')
          
          const convertResponse = await fetch(`/api/convert-gltf/${filename}`, {
            method: 'POST'
          })
          
          if (!convertResponse.ok) {
            const errorData = await convertResponse.json().catch(() => ({ detail: 'Conversion failed' }))
            console.error('IFCViewer: Conversion request failed:', errorData)
            throw new Error(errorData.detail || 'Failed to start glTF conversion')
          }
          
          const convertData = await convertResponse.json()
          
          // If conversion was successful, the file should exist now
          if (convertData.gltf_path) {
            // Check if file exists
            const checkResponse = await fetch(convertData.gltf_path, { method: 'HEAD' })
            if (checkResponse.ok) {
              gltfExists = true
            }
          }
          
          // If still not exists, poll for conversion completion
          if (!gltfExists) {
            let attempts = 0
            const maxAttempts = 60 // 60 seconds max
            
            while (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000))
              
              const checkResponse = await fetch(gltfFilename, { method: 'HEAD' })
              if (checkResponse.ok) {
                gltfExists = true
                break
              }
              attempts++
              setConversionStatus(`Converting IFC to glTF... (${attempts}s)`)
            }
            
            if (!gltfExists) {
              console.error('IFCViewer: glTF conversion timed out after', maxAttempts, 'seconds')
              throw new Error('glTF conversion timed out. Please try again.')
            }
          }
        }

        setConversionStatus('Loading 3D model...')

        // Load the glTF file
        const loader = new GLTFLoader()
        const gltf = await loader.loadAsync(gltfFilename)

        // Add model to scene
        if (gltf.scene) {
          // Update world matrix before calculating bounding box
          gltf.scene.updateMatrixWorld(true)
          
          // IFC files can use different coordinate systems
          // Try different rotations to match the original IFC orientation
          // Option 1: Z-up to Y-up (most common): rotate -90° around X
          // Option 2: No rotation (if already Y-up)
          // Option 3: Other transformations
          
          // For now, try Z-up to Y-up transformation
          // This rotates: (X, Y, Z) where Z is up -> (X, Z, -Y) where Y is up
          gltf.scene.rotation.x = -Math.PI / 2  // -90 degrees around X-axis
          
          scene.add(gltf.scene)
          modelRef.current = gltf.scene

          // Fit camera to model - position for ground-up view (Y-up coordinate system)
          // Calculate bounding box in world space
          const box = new THREE.Box3()
          box.setFromObject(gltf.scene)
          
          // Get center and size
          const center = box.getCenter(new THREE.Vector3())
          const size = box.getSize(new THREE.Vector3())
          modelBoundsRef.current = {
            min: box.min.clone(),
            max: box.max.clone(),
            size: size.clone(),
            center: center.clone()
          }
          
          // Apply any additional per-mesh setup below
          const maxDim = Math.max(size.x, size.y, size.z)
          
          if (maxDim > 0) {
            // Calculate appropriate camera distance
            const fov = camera.fov * (Math.PI / 180)
            const distance = maxDim / (2 * Math.tan(fov / 2)) * 1.8 // Add padding
            
            // Update shadow camera settings based on model size for better shadow coverage
            const shadowRange = maxDim * 2 // Shadow range should cover the entire model
            directionalLight1.shadow.camera.left = -shadowRange
            directionalLight1.shadow.camera.right = shadowRange
            directionalLight1.shadow.camera.top = shadowRange
            directionalLight1.shadow.camera.bottom = -shadowRange
            directionalLight1.shadow.camera.near = 0.1
            directionalLight1.shadow.camera.far = maxDim * 3
            directionalLight1.shadow.camera.updateProjectionMatrix()
            
            directionalLight2.shadow.camera.left = -shadowRange
            directionalLight2.shadow.camera.right = shadowRange
            directionalLight2.shadow.camera.top = shadowRange
            directionalLight2.shadow.camera.bottom = -shadowRange
            directionalLight2.shadow.camera.near = 0.1
            directionalLight2.shadow.camera.far = maxDim * 3
            directionalLight2.shadow.camera.updateProjectionMatrix()
            
            // Position camera for standard isometric view (ground-up perspective)
            // Standard isometric: 45° in XZ plane, ~35° elevation
            // This gives a good 3D view with Y as the vertical axis
            const isometricAngle = Math.PI / 4  // 45 degrees in horizontal plane
            const elevationAngle = Math.PI / 5   // ~36 degrees elevation (looking down slightly)
            
            const horizontalDist = distance * Math.cos(elevationAngle)
            const verticalDist = distance * Math.sin(elevationAngle)
            
            // Position camera: isometric view from above and to the side
            // X and Z are equal for isometric, Y is elevated
            const cameraPos = new THREE.Vector3(
              center.x + horizontalDist * Math.cos(isometricAngle),
              center.y + verticalDist,  // Elevated to see model from above
              center.z + horizontalDist * Math.sin(isometricAngle)
            )
            
            camera.position.copy(cameraPos)
            
            // CRITICAL: Ensure Y is always up (ground-up coordinate system)
            camera.up.set(0, 1, 0)
            
            // Set controls target to model center
            controls.target.copy(center)
            
            // Make sure camera looks at center (this respects the up vector)
            camera.lookAt(center)
            
            // Force update the camera matrix to ensure up vector is respected
            camera.updateMatrixWorld()
            
            // Update controls to apply changes
            controls.update()
            
            // Force a render to show the correct view
            renderer.render(scene, camera)
          }

          // Simplified material processing - let Three.js handle default colors, only override fasteners
          const edgeLines: THREE.LineSegments[] = []

          gltf.scene.traverse((child: any) => {
            if (child.isMesh) {
              const material = Array.isArray(child.material) ? child.material[0] : child.material
              
              // Enable shadows
              child.castShadow = true
              child.receiveShadow = true

              // Extract and store assembly mark from metadata
              if (!child.userData) child.userData = {}
              
              // Try to get assembly mark from various sources
              if (child.userData.assembly_mark) {
                // Already stored
              } else if ((child as any).metadata?.assembly_mark) {
                child.userData.assembly_mark = (child as any).metadata.assembly_mark
                child.userData.product_id = (child as any).metadata.product_id
                child.userData.type = (child as any).metadata.element_type
              } else if (child.name) {
                // Try to parse from name (format: "elementType_productID_assemblyMark")
                const parts = child.name.split('_')
                if (parts.length >= 3) {
                  child.userData.assembly_mark = parts.slice(2).join('_')
                  child.userData.product_id = parseInt(parts[1]) || 0
                  child.userData.type = parts[0]
                }
              }
              
              // Also try to get from glTF extras if available
              if (!child.userData.assembly_mark && (child as any).userData?.extras) {
                const extras = (child as any).userData.extras
                if (extras.assembly_mark) {
                  child.userData.assembly_mark = extras.assembly_mark
                }
                if (extras.product_id) {
                  child.userData.product_id = extras.product_id
                }
                if (extras.element_type) {
                  child.userData.type = extras.element_type
                }
              }

              // Check if this is a fastener
              const matName = (material?.name || '').toString().toLowerCase()
              const nodeName = (child.name || '').toLowerCase()
              const isFastener =
                matName.includes('ifcfastener') ||
                matName.includes('ifcmechanicalfastener') ||
                matName.includes('fastener_detected') ||
                nodeName.includes('ifcfastener') ||
                nodeName.includes('ifcmechanicalfastener') ||
                (nodeName.includes('bolt') || nodeName.includes('nut') || nodeName.includes('washer') || 
                 nodeName.includes('fastener') || nodeName.includes('screw') || nodeName.includes('anchor'))

              if (isFastener) {
                // Remove vertex colors for fasteners
                if (child.geometry.hasAttribute('color')) {
                  child.geometry.deleteAttribute('color')
                }
                
                // Create new geometry without color attribute
                const originalGeom = child.geometry
                const newGeom = new THREE.BufferGeometry()
                
                if (originalGeom.hasAttribute('position')) {
                  newGeom.setAttribute('position', originalGeom.getAttribute('position').clone())
                }
                if (originalGeom.hasAttribute('normal')) {
                  newGeom.setAttribute('normal', originalGeom.getAttribute('normal').clone())
                }
                if (originalGeom.hasAttribute('uv')) {
                  newGeom.setAttribute('uv', originalGeom.getAttribute('uv').clone())
                }
                if (originalGeom.hasAttribute('uv2')) {
                  newGeom.setAttribute('uv2', originalGeom.getAttribute('uv2').clone())
                }
                if (originalGeom.index) {
                  newGeom.setIndex(originalGeom.index.clone())
                }
                
                child.geometry = newGeom
                originalGeom.dispose()
                
                // Apply dark brown-gold material for fasteners
                const darkBrownGoldColor = new THREE.Color(0x8B6914)
                const goldMaterial = new THREE.MeshStandardMaterial({
                  color: darkBrownGoldColor,
                  metalness: 0.3,
                  roughness: 0.6,
                  vertexColors: false
                })
                
                if (Array.isArray(child.material)) {
                  child.material.forEach((m: any) => {
                    if (m && typeof m.dispose === 'function') {
                      try { m.dispose() } catch (e) {}
                    }
                  })
                } else if (material && typeof material.dispose === 'function') {
                  try { material.dispose() } catch (e) {}
                }
                
                child.material = goldMaterial
                
                // Add edge lines for fasteners using darker gold color
                try {
                  const edgesGeometry = new THREE.EdgesGeometry(newGeom, 10)
                  // Make it darker by lerping with black (80% towards black = much darker)
                  const black = new THREE.Color(0x000000)
                  const darkerGoldColor = darkBrownGoldColor.clone().lerp(black, 0.8)
                  
                  const edgesMaterial = new THREE.LineBasicMaterial({ 
                    color: darkerGoldColor,
                    linewidth: 1.5,
                    opacity: 0.8,
                    transparent: true
                  })
                  const edgeLine = new THREE.LineSegments(edgesGeometry, edgesMaterial)
                  edgeLine.name = `${child.name || 'mesh'}_edges`
                  edgeLine.castShadow = false
                  edgeLine.receiveShadow = false
                  edgeLine.visible = true
                  
                  if (!child.userData) child.userData = {}
                  child.userData.edgeLine = edgeLine
                  edgeLines.push(edgeLine)
                  
                  child.add(edgeLine)
                } catch (e) {
                  // Ignore edge creation errors
                }
                
                return
              }

              // For non-fasteners, let Three.js handle colors from glTF
              // Only create default material if none exists
              if (!material) {
                child.material = new THREE.MeshStandardMaterial({
                  color: 0x8888aa,
                  metalness: 0.3,
                  roughness: 0.7
                })
              }
              
              // Add edge lines for better geometry definition
              // Use element color but slightly darker
              try {
                const edgesGeometry = new THREE.EdgesGeometry(child.geometry, 10)
                
                // Get the material color and make it darker
                const currentMaterial = Array.isArray(child.material) ? child.material[0] : child.material
                const elementColor = currentMaterial?.color || new THREE.Color(0x8888aa)
                // Make it darker by lerping with black (80% towards black = much darker)
                const black = new THREE.Color(0x000000)
                const darkerColor = elementColor.clone().lerp(black, 0.8)
                
                const edgesMaterial = new THREE.LineBasicMaterial({ 
                  color: darkerColor,
                  linewidth: 1.5,
                  opacity: 0.8,
                  transparent: true
                })
                const edgeLine = new THREE.LineSegments(edgesGeometry, edgesMaterial)
                edgeLine.name = `${child.name || 'mesh'}_edges`
                edgeLine.castShadow = false
                edgeLine.receiveShadow = false
                edgeLine.visible = true
                
                if (!child.userData) child.userData = {}
                child.userData.edgeLine = edgeLine
                edgeLines.push(edgeLine)
                
                child.add(edgeLine)
              } catch (e) {
                // Ignore edge creation errors
              }
            }
          })

          // Store edge lines reference in scene userData for toggling
          if (!gltf.scene.userData) gltf.scene.userData = {}
          gltf.scene.userData.edgeLines = edgeLines
          
          // Apply initial visibility - always show all elements
          updateVisibility(gltf.scene)

          // Load assembly mapping from API
          const loadAssemblyMapping = async () => {
            try {
              // Add timestamp to avoid caching
              const response = await fetch(`/api/assembly-mapping/${filename}?t=${Date.now()}`)
              if (response.ok) {
                const mapping = await response.json()
                // Debug: Check if plate_thickness is in the mapping
                const plateEntries = Object.entries(mapping).filter(([_id, entry]: [string, any]) => entry.element_type === 'IfcPlate')
                if (plateEntries.length > 0) {
                  const sampleEntry = plateEntries[0][1] as any
                  console.log('[ASSEMBLY_MAPPING] Sample plate entry from API:', sampleEntry)
                  console.log('[ASSEMBLY_MAPPING] Has plate_thickness:', 'plate_thickness' in sampleEntry)
                }
                // Store mapping in scene userData
                if (!gltf.scene.userData) gltf.scene.userData = {}
                gltf.scene.userData.assemblyMapping = mapping
                
                // Apply mapping to all meshes - try multiple ways to find product_id
                let appliedCount = 0
                gltf.scene.traverse((child: any) => {
                  if (child.isMesh) {
                    if (!child.userData) child.userData = {}
                    
                    // Try to get product_id from various sources
                    let productId: number | null = null
                    
                    if (child.userData.product_id) {
                      productId = child.userData.product_id
                    } else if (child.userData.expressID) {
                      productId = child.userData.expressID
                    } else if (child.userData.id) {
                      productId = child.userData.id
                    } else if ((child as any).metadata?.product_id) {
                      productId = (child as any).metadata.product_id
                    } else if (child.name) {
                      // Try to parse from name (format might be "elementType_productID" or "elementType_productID_assemblyMark")
                      const parts = child.name.split('_')
                      if (parts.length >= 2) {
                        const parsed = parseInt(parts[1])
                        if (!isNaN(parsed)) productId = parsed
                      }
                    }
                    
                    // CRITICAL: Always set product_id if we found it, even if not in mapping
                    // This ensures selection and filtering work correctly
                    if (productId) {
                      child.userData.product_id = productId
                      
                      // If this product is in the mapping, apply the mapping data
                      if (mapping[productId]) {
                        child.userData.assembly_mark = mapping[productId].assembly_mark
                        child.userData.assembly_id = mapping[productId].assembly_id || null
                        child.userData.type = mapping[productId].element_type
                        
                        // Store plate thickness if available (even if it's "N/A")
                        // Check if plate_thickness exists in the mapping entry
                        if ('plate_thickness' in mapping[productId]) {
                          child.userData.plate_thickness = mapping[productId].plate_thickness
                        } else if (mapping[productId].element_type === 'IfcPlate') {
                          // If it's a plate but plate_thickness is missing, log it and default to "N/A"
                          console.warn(`[ASSEMBLY_MAPPING] Plate ${productId} missing plate_thickness in mapping`)
                          child.userData.plate_thickness = "N/A"
                        }
                        
                        // Store profile_name if available (for beams, columns, members)
                        const elementType = mapping[productId].element_type
                        if (elementType === 'IfcBeam' || elementType === 'IfcColumn' || elementType === 'IfcMember') {
                          if ('profile_name' in mapping[productId]) {
                            child.userData.profile_name = mapping[productId].profile_name
                          } else {
                            // If it's a profile element but profile_name is missing, log it and default to "N/A"
                            console.warn(`[ASSEMBLY_MAPPING] Profile element ${productId} (${elementType}) missing profile_name in mapping`)
                            child.userData.profile_name = "N/A"
                          }
                        }
                        
                        appliedCount++
                      } else {
                        // Product not in mapping - still set basic info from mesh name/metadata
                        // This ensures selection still works even if mapping is incomplete
                        if (!child.userData.type && child.name) {
                          const parts = child.name.split('_')
                          if (parts.length >= 1 && parts[0]) {
                            child.userData.type = parts[0]
                          }
                        }
                        
                        // Set profile_name for profile elements even if not in mapping
                        const elementType = child.userData.type || (child.name ? child.name.split('_')[0] : null)
                        if (elementType === 'IfcBeam' || elementType === 'IfcColumn' || elementType === 'IfcMember') {
                          if (!child.userData.profile_name) {
                            child.userData.profile_name = "N/A"
                          }
                        }
                        
                        // Set plate_thickness for plates even if not in mapping
                        if (elementType === 'IfcPlate') {
                          if (!child.userData.plate_thickness) {
                            child.userData.plate_thickness = "N/A"
                          }
                        }
                        
                        // Try to extract assembly_mark from mesh name if available (format: "elementType_productID_assemblyMark")
                        if (!child.userData.assembly_mark && child.name) {
                          const parts = child.name.split('_')
                          if (parts.length >= 3) {
                            // Assembly mark might contain underscores, so join everything after the first two parts
                            child.userData.assembly_mark = parts.slice(2).join('_')
                          }
                        }
                      }
                    } else {
                      // No product_id found - try to set type from name as fallback
                      if (!child.userData.type && child.name) {
                        const parts = child.name.split('_')
                        if (parts.length >= 1 && parts[0]) {
                          child.userData.type = parts[0]
                        }
                      }
                      
                      // Still set profile_name and plate_thickness based on element type, even without product_id
                      const elementType = child.userData.type || (child.name ? child.name.split('_')[0] : null)
                      if (elementType === 'IfcBeam' || elementType === 'IfcColumn' || elementType === 'IfcMember') {
                        if (!child.userData.profile_name) {
                          child.userData.profile_name = "N/A"
                        }
                      }
                      if (elementType === 'IfcPlate') {
                        if (!child.userData.plate_thickness) {
                          child.userData.plate_thickness = "N/A"
                        }
                      }
                    }
                  }
                })
                
                console.log(`Loaded assembly mapping for ${Object.keys(mapping).length} products, applied to ${appliedCount} meshes`)
              }
            } catch (error) {
              console.warn('Failed to load assembly mapping:', error)
            }
          }
          
          await loadAssemblyMapping()
          
          // Setup click selection
          setupClickSelection(gltf.scene, setSelectedElement)
        }

        setIsLoading(false)
        setConversionStatus('')
      } catch (error) {
        console.error('Error loading glTF:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setLoadError(`Failed to load 3D model: ${errorMessage}`)
        setIsLoading(false)
        setConversionStatus('')
      }
    }

    loadGLTF()

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    // Animation loop
    let animationId: number
    let frameCount = 0
    const animate = () => {
      animationId = requestAnimationFrame(animate)
      frameCount++
      
      // Animate pivot transition smoothly (runs every frame for smooth animation)
      if (isAnimatingPivotRef.current && oldTargetRef.current && oldCameraPosRef.current && targetPivotRef.current && camera && controls) {
        const elapsed = performance.now() - animationStartTimeRef.current
        const duration = 150 // 150ms smooth transition
        const progress = Math.min(elapsed / duration, 1.0)
        
        // Use easing function for smooth transition (ease-out cubic)
        const eased = 1 - Math.pow(1 - progress, 3)
        
        // Calculate the offset from old target to new pivot
        const targetOffset = new THREE.Vector3().subVectors(targetPivotRef.current, oldTargetRef.current)
        
        // Interpolate target
        controls.target.copy(oldTargetRef.current).add(targetOffset.clone().multiplyScalar(eased))
        
        // Interpolate camera position - move by the SAME offset to maintain view
        camera.position.copy(oldCameraPosRef.current).add(targetOffset.clone().multiplyScalar(eased))
        
        camera.updateMatrixWorld()
        
        // Update OrbitControls internal state continuously during animation
        const offset = new THREE.Vector3().subVectors(camera.position, controls.target)
        const spherical = new THREE.Spherical()
        spherical.setFromVector3(offset)
        
        const controlsAny = controls as any
        if (controlsAny.spherical) {
          controlsAny.spherical.copy(spherical)
        }
        if (controlsAny.target0) {
          controlsAny.target0.copy(controls.target)
        }
        if (controlsAny.position0) {
          controlsAny.position0.copy(camera.position)
        }
        if (controlsAny.offset) {
          controlsAny.offset.copy(offset)
        }
        
        // End animation when complete
        if (progress >= 1.0) {
          isAnimatingPivotRef.current = false
          
          // Reset mouse tracking to prevent jump on first move after animation
          if (controlsAny.rotateStart) {
            controlsAny.rotateStart.set(0, 0)
          }
          if (controlsAny.rotateEnd) {
            controlsAny.rotateEnd.set(0, 0)
          }
          if (controlsAny.panStart) {
            controlsAny.panStart.set(0, 0)
          }
          if (controlsAny.panEnd) {
            controlsAny.panEnd.set(0, 0)
          }
        }
      }
      
      // Update measurement label positions (HTML overlay) for all measurements
      if (enableMeasurement) {
        // Update current in-progress measurement label
        if (measurementLabelDivRef.current) {
          const updateFn = (measurementLabelDivRef.current as any).updatePosition
          if (updateFn) updateFn()
        }
        
        // Update all stored measurement labels
        allMeasurementsRef.current.forEach(measurement => {
          if (measurement.label) {
            const updateFn = (measurement.label as any).updatePosition
            if (updateFn) updateFn()
          }
        })
      }
      
      // Normal update - the overridden update method will handle preservation
      controls.update()
      
      renderer.render(scene, camera)
    }
    animate()

          return () => {
            cancelAnimationFrame(animationId)
            window.removeEventListener('resize', handleResize)
            
            // Cleanup measurement
            if (enableMeasurement) {
              clearMeasurement()
            }
            
            // Cleanup clipping
            if (enableClipping) {
              disableClippingPlane()
            }
            
            
            // Remove custom rotation event listeners
            cleanupMouseHandlers()
            
            // Cleanup hover preview marker
            if (hoverPreviewMarkerRef.current && scene) {
              scene.remove(hoverPreviewMarkerRef.current)
              // Clean up sprite (sprites don't have geometry, but have material and texture)
              if (hoverPreviewMarkerRef.current?.material) {
                const material = hoverPreviewMarkerRef.current.material
                if (Array.isArray(material)) {
                  material.forEach((mat: THREE.Material) => {
                    const spriteMat = mat as THREE.SpriteMaterial
                    if (spriteMat.map) spriteMat.map.dispose()
                    mat.dispose()
                  })
                } else {
                  const spriteMat = material as THREE.SpriteMaterial
                  if (spriteMat.map) {
                    spriteMat.map.dispose()
                  }
                  material.dispose()
                }
              }
              hoverPreviewMarkerRef.current = null
            }
            
            // Reset cursor
            if (containerRef.current) {
              containerRef.current.style.cursor = 'default'
            }
            
            if (containerRef.current && renderer.domElement.parentNode) {
              renderer.domElement.parentNode.removeChild(renderer.domElement)
            }
            controls.dispose()
            renderer.dispose()
      
      // Clean up model
      if (modelRef.current && sceneRef.current) {
        sceneRef.current.remove(modelRef.current)
        modelRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose()
            if (Array.isArray(child.material)) {
              child.material.forEach(material => material.dispose())
            } else {
              child.material.dispose()
            }
          }
        })
      }
    }
  }, [filename, gltfPath])

  const updateVisibility = (model: THREE.Object3D) => {
    if (!model) return

    // Always show all elements
    model.traverse((child: any) => {
      if (child.isMesh || child.isLine || child.isPoints) {
        child.visible = true
        
        // Always show edge lines
        if (child.userData && child.userData.edgeLine) {
          child.userData.edgeLine.visible = true
        }
      }
    })
    
    // Always show edge lines stored in scene userData
    if (model.userData && model.userData.edgeLines) {
      model.userData.edgeLines.forEach((edgeLine: THREE.LineSegments) => {
        edgeLine.visible = true
      })
    }
  }

  // Disable all clipping planes
  const disableClippingPlane = () => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    if (!renderer) return
    renderer.clippingPlanes = []
    renderer.localClippingEnabled = false
    
    // Remove helper if exists
    if (clippingHelperRef.current && scene) {
      scene.remove(clippingHelperRef.current)
      // Dispose of materials in the group and its children
      clippingHelperRef.current.traverse((child: THREE.Object3D) => {
        const obj = child as any
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat: THREE.Material) => mat.dispose?.())
          } else {
            obj.material.dispose?.()
          }
        }
      })
      clippingHelperRef.current = null
    }
    clippingPlaneRef.current = null
  }

  // Apply a clipping plane based on selected side and normalized offset (0..1)
  const applyClippingPlane = (planeKey: ClipPlaneKey, amount: number) => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const model = modelRef.current
    if (!renderer || !scene || !model) return
    
    // Recompute bounds each time to stay accurate with transforms
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      modelBoundsRef.current = {
        min: box.min.clone(),
        max: box.max.clone(),
        size: size.clone(),
        center: center.clone()
      }
    }
    
    const bounds = modelBoundsRef.current
    if (!bounds) return
    
    const { min, max, size, center } = bounds
    const clampedAmount = Math.min(Math.max(amount, 0), 1)
    
    // Determine normal and base origin on the chosen face center
    const normal = new THREE.Vector3()
    const faceCenter = new THREE.Vector3() // Save face center for helper positioning
    const origin = new THREE.Vector3()
    
    switch (planeKey) {
      case 'left': // clip from left face toward +X
        normal.set(1, 0, 0)
        faceCenter.set(min.x, center.y, center.z)
        origin.set(min.x, center.y, center.z)
        break
      case 'right': // clip from right face toward -X
        normal.set(-1, 0, 0)
        faceCenter.set(max.x, center.y, center.z)
        origin.set(max.x, center.y, center.z)
        break
      case 'bottom': // clip from bottom face toward +Y
        normal.set(0, 1, 0)
        faceCenter.set(center.x, min.y, center.z)
        origin.set(center.x, min.y, center.z)
        break
      case 'top': // clip from top face toward -Y
        normal.set(0, -1, 0)
        faceCenter.set(center.x, max.y, center.z)
        origin.set(center.x, max.y, center.z)
        break
      case 'back': // clip from back face toward +Z
        normal.set(0, 0, 1)
        faceCenter.set(center.x, center.y, min.z)
        origin.set(center.x, center.y, min.z)
        break
      case 'front': // clip from front face toward -Z
        normal.set(0, 0, -1)
        faceCenter.set(center.x, center.y, max.z)
        origin.set(center.x, center.y, max.z)
        break
      default:
        return
    }
    
    // Move inward from the face based on amount (0 = on face, no cut; 1 = through to far side)
    const distance = (() => {
      switch (planeKey) {
        case 'left':
        case 'right':
          return size.x * clampedAmount
        case 'bottom':
        case 'top':
          return size.y * clampedAmount
        case 'back':
        case 'front':
          return size.z * clampedAmount
        default:
          return 0
      }
    })()
    origin.addScaledVector(normal, distance)
    
    const plane = clippingPlaneRef.current ?? new THREE.Plane()
    plane.set(normal, -normal.dot(origin))
    clippingPlaneRef.current = plane
    
    // Enable clipping only when amount > 0; still show helper at face center when 0
    if (clampedAmount > 0) {
      renderer.clippingPlanes = [plane]
      renderer.localClippingEnabled = true
    } else {
      renderer.clippingPlanes = []
      renderer.localClippingEnabled = false
    }
    
    // Update helper for visual feedback - use a plane positioned at face center for visualization
    const helperSize = Math.max(size.x, size.y, size.z) * 1.5 || 1
    if (clippingHelperRef.current) {
      scene.remove(clippingHelperRef.current)
      // Dispose of materials in the group and its children
      clippingHelperRef.current.traverse((child: THREE.Object3D) => {
        const obj = child as any
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat: THREE.Material) => mat.dispose?.())
          } else {
            obj.material.dispose?.()
          }
        }
      })
    }
    // Create a custom plane visualization at the face center
    // We'll create a plane geometry that's always visible and not affected by clipping
    const helperGroup = new THREE.Group()
    helperGroup.name = 'clipping-plane-helper'
    helperGroup.position.copy(faceCenter)
    
    // Create a plane geometry - default is in XY plane (normal = +Z)
    const planeGeometry = new THREE.PlaneGeometry(helperSize, helperSize)
    
    // Calculate rotation to align the plane normal with our desired normal
    // Default plane normal is (0, 0, 1), we want it to be our normal vector
    const defaultNormal = new THREE.Vector3(0, 0, 1)
    const quaternion = new THREE.Quaternion()
    quaternion.setFromUnitVectors(defaultNormal, normal)
    
    // Create material that's always visible and not affected by clipping
    const helperMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
      wireframe: true,
      clippingPlanes: [] // Explicitly exclude from clipping
    })
    
    const planeMesh = new THREE.Mesh(planeGeometry, helperMaterial)
    planeMesh.quaternion.copy(quaternion)
    planeMesh.renderOrder = 999 // Render on top
    
    // Also add edge lines for better visibility
    const edges = new THREE.EdgesGeometry(planeGeometry)
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 2,
      clippingPlanes: [] // Explicitly exclude from clipping
    })
    const edgeLines = new THREE.LineSegments(edges, edgeMaterial)
    edgeLines.quaternion.copy(quaternion)
    edgeLines.renderOrder = 1000
    
    helperGroup.add(planeMesh)
    helperGroup.add(edgeLines)
    scene.add(helperGroup)
    clippingHelperRef.current = helperGroup
    
    // Debug output to verify calculations
    const planeConstant = clippingPlaneRef.current ? clippingPlaneRef.current.constant : -normal.dot(faceCenter)
    console.log('[CLIPPING] Helper setup:', {
      planeKey,
      faceCenter: { x: faceCenter.x.toFixed(2), y: faceCenter.y.toFixed(2), z: faceCenter.z.toFixed(2) },
      modelCenter: { x: center.x.toFixed(2), y: center.y.toFixed(2), z: center.z.toFixed(2) },
      normal: { x: normal.x, y: normal.y, z: normal.z },
      helperConstant: planeConstant.toFixed(2)
    })
  }

  const setupClickSelection = (
    model: THREE.Object3D,
    setSelected: (element: { expressID: number; type: string } | null) => void
  ) => {
    if (!cameraRef.current || !containerRef.current) return

    const clearSelection = () => {
      // Clear all selected meshes (remove highlighting only)
      // IMPORTANT: Preserve transparency/hidden states set by user
      selectedMeshesRef.current.forEach(mesh => {
        if (mesh.userData && mesh.userData._originalMaterial) {
          // Get the persistent state of the mesh
          const persistentState = elementStatesRef.current.get(mesh)
          
          if (!persistentState || persistentState === 'normal') {
            // No persistent state, safe to restore highlighting material
            // But first check if the stored material is transparent - if so, ensure it's not
            const storedMat = Array.isArray(mesh.userData._originalMaterial) ? mesh.userData._originalMaterial[0] : mesh.userData._originalMaterial
            if (storedMat && storedMat.transparent === true && storedMat.opacity < 1.0) {
              // Stored material is transparent but state is normal - fix it
              if (typeof storedMat.clone === 'function') {
                const fixedMat = storedMat.clone()
                fixedMat.transparent = false
                fixedMat.opacity = 1.0
                mesh.material = fixedMat
              } else {
                storedMat.transparent = false
                storedMat.opacity = 1.0
                mesh.material = mesh.userData._originalMaterial
              }
            } else {
              mesh.material = mesh.userData._originalMaterial
            }
            delete mesh.userData._originalMaterial
          } else if (persistentState === 'transparent') {
            // Mesh is transparent - restore the transparent material
            // Always recreate from original to ensure proper state
            if (originalMaterialsRef.current.has(mesh)) {
              const originalMat = originalMaterialsRef.current.get(mesh)
              if (originalMat) {
                const material = Array.isArray(originalMat) ? originalMat[0] : originalMat
                if (material && typeof material.clone === 'function') {
                  // Recreate transparent material from original
                  const transparentMat = material.clone()
                  transparentMat.transparent = true
                  transparentMat.opacity = 0.3
                  mesh.material = transparentMat
                } else {
                  // Fallback: try to make the material transparent
                  mesh.material = originalMat
                  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
                  if (mat) {
                    mat.transparent = true
                    mat.opacity = 0.3
                  }
                }
              }
            } else if (mesh.userData._originalMaterial) {
              // Fallback: use stored material but ensure it's transparent
              const storedMat = mesh.userData._originalMaterial
              const material = Array.isArray(storedMat) ? storedMat[0] : storedMat
              if (material && typeof material.clone === 'function') {
                const transparentMat = material.clone()
                transparentMat.transparent = true
                transparentMat.opacity = 0.3
                mesh.material = transparentMat
              } else {
                mesh.material = storedMat
                if (material) {
                  material.transparent = true
                  material.opacity = 0.3
                }
              }
            }
            // CRITICAL: Ensure the state remains 'transparent' in elementStatesRef
            // This ensures that clicking on the element again will properly detect it as transparent
            elementStatesRef.current.set(mesh, 'transparent')
            delete mesh.userData._originalMaterial
          } else if (persistentState === 'hidden') {
            // Mesh is hidden - keep it hidden, just remove highlighting reference
            mesh.visible = false
            delete mesh.userData._originalMaterial
          } else {
            // Unknown state, just remove highlighting material reference
            delete mesh.userData._originalMaterial
          }
        }
      })
      selectedMeshesRef.current = []
      selectedMeshRef.current = null
      selectedProductIdsRef.current = []
    }

    const highlightMesh = (mesh: THREE.Mesh): THREE.Mesh | null => {
      if (mesh && mesh.material) {
        // Check if mesh has a persistent state (transparent/hidden)
        const persistentState = elementStatesRef.current.get(mesh)
        
        // Store the current material before highlighting (so we can restore it when clearing selection)
        if (mesh.userData && !mesh.userData._originalMaterial) {
          // Store the current material (which might be transparent) before applying highlight
          // Clone it to avoid reference issues
          const currentMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
          if (currentMat && typeof currentMat.clone === 'function') {
            mesh.userData._originalMaterial = currentMat.clone()
          } else {
            mesh.userData._originalMaterial = mesh.material
          }
        }
        
        // Get the base material to highlight
        // If mesh has persistent state, use the original material from our ref
        // Otherwise, use current material
        let baseMat: THREE.Material
        if (persistentState && originalMaterialsRef.current.has(mesh)) {
          // Mesh is transparent/hidden, use original material for highlighting
          baseMat = originalMaterialsRef.current.get(mesh) as THREE.Material
          if (Array.isArray(baseMat)) {
            baseMat = baseMat[0]
          }
        } else {
          // Normal mesh, use current material
          baseMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        }
        
        if (baseMat && typeof baseMat.clone === 'function') {
          const highlightMat = baseMat.clone()
          
          // Preserve transparency if mesh is in transparent state
          if (persistentState === 'transparent') {
            highlightMat.transparent = true
            highlightMat.opacity = 0.3
          }
          
          if (highlightMat.type === 'MeshBasicMaterial') {
            (highlightMat as THREE.MeshBasicMaterial).color = new THREE.Color(0xB8860B) // Dark goldenrod for highlight
          } else if ((highlightMat as any).isMeshStandardMaterial || (highlightMat as any).isMeshPhysicalMaterial) {
            const stdMat = highlightMat as THREE.MeshStandardMaterial
            stdMat.emissive = new THREE.Color(0xB8860B)
            stdMat.emissiveIntensity = 0.5
          } else {
            if ('emissive' in highlightMat) {
              (highlightMat as any).emissive = new THREE.Color(0xB8860B)
              if ('emissiveIntensity' in highlightMat) {
                (highlightMat as any).emissiveIntensity = 0.5
              }
            }
          }
          
          mesh.material = highlightMat
          return mesh
        }
      }
      return null
    }

    const getAssemblyInfo = (mesh: THREE.Mesh): { mark: string | null; assemblyId: number | null } => {
      // First, try to get product_id from various sources
      let productId: number | null = null
      
      if (mesh.userData?.product_id) {
        productId = mesh.userData.product_id
      } else if (mesh.userData?.expressID) {
        productId = mesh.userData.expressID
      } else if (mesh.userData?.id) {
        productId = mesh.userData.id
      } else if ((mesh as any).metadata?.product_id) {
        productId = (mesh as any).metadata.product_id
      } else if (mesh.name) {
        // Try to parse from name (format might be "elementType_productID" or "elementType_productID_assemblyMark")
        const parts = mesh.name.split('_')
        if (parts.length >= 2) {
          const parsed = parseInt(parts[1])
          if (!isNaN(parsed)) productId = parsed
        }
      }
      
      // Try to get assembly info from scene's assembly mapping (loaded from API) - this is the most reliable
      if (productId && model.userData?.assemblyMapping && model.userData.assemblyMapping[productId]) {
        const assemblyInfo = model.userData.assemblyMapping[productId]
        const assemblyMark = assemblyInfo.assembly_mark
        const assemblyId = assemblyInfo.assembly_id || null
        
        if (assemblyMark && assemblyMark !== 'N/A') {
          // Also store it in mesh userData for faster lookup next time
          if (!mesh.userData) mesh.userData = {}
          mesh.userData.assembly_mark = assemblyMark
          mesh.userData.assembly_id = assemblyId
          mesh.userData.product_id = productId
          return { mark: assemblyMark, assemblyId: assemblyId }
        }
      }
      
      // Try to get assembly info from userData (stored by backend or API mapping)
      if (mesh.userData?.assembly_mark) {
        return {
          mark: mesh.userData.assembly_mark,
          assemblyId: mesh.userData.assembly_id || null
        }
      }
      
      // Try to get from mesh metadata (if trimesh preserved it)
      if ((mesh as any).metadata?.assembly_mark) {
        return {
          mark: (mesh as any).metadata.assembly_mark,
          assemblyId: (mesh as any).metadata.assembly_id || null
        }
      }
      
      // Try to parse from mesh name (format: "elementType_productID_assemblyMark")
      if (mesh.name) {
        const parts = mesh.name.split('_')
        if (parts.length >= 3) {
          // Assembly mark might contain underscores, so join everything after the first two parts
          return {
            mark: parts.slice(2).join('_'),
            assemblyId: null
          }
        }
      }
      
      return { mark: null, assemblyId: null }
    }

    const findAllMeshesWithAssemblyId = (model: THREE.Object3D, assemblyId: number | null): THREE.Mesh[] => {
      const meshes: THREE.Mesh[] = []
      
      if (assemblyId === null) {
        // If no assembly_id, fall back to matching by mark (for backward compatibility)
        return []
      }
      
      model.traverse((child: any) => {
        if (child.isMesh) {
          const childAssemblyId = child.userData?.assembly_id || null
          // Match by assembly instance ID (not just mark) to get only the specific assembly
          if (childAssemblyId === assemblyId) {
            meshes.push(child)
          }
        }
      })
      return meshes
    }
    
    const findAllMeshesInAssembly = async (productId: number, assemblyMark: string): Promise<THREE.Mesh[]> => {
      // Try to find the assembly object from the API
      try {
        const response = await fetch(`/api/assembly-parts/${filename}?product_id=${productId}&assembly_mark=${encodeURIComponent(assemblyMark)}`)
        if (response.ok) {
          const data = await response.json()
          const productIds = data.product_ids || []
          
          // Find all meshes with these product IDs
          const meshes: THREE.Mesh[] = []
          model.traverse((child: any) => {
            if (child.isMesh) {
              let childProductId: number | null = null
              if (child.userData?.product_id) {
                childProductId = child.userData.product_id
              } else if (child.userData?.expressID) {
                childProductId = child.userData.expressID
              } else if (child.userData?.id) {
                childProductId = child.userData.id
              } else if ((child as any).metadata?.product_id) {
                childProductId = (child as any).metadata.product_id
              } else if (child.name) {
                const parts = child.name.split('_')
                if (parts.length >= 2) {
                  const parsed = parseInt(parts[1])
                  if (!isNaN(parsed)) childProductId = parsed
                }
              }
              
              if (childProductId && productIds.includes(childProductId)) {
                meshes.push(child)
              }
            }
          })
          return meshes
        }
      } catch (error) {
        console.warn('[ASSEMBLY] Error fetching assembly parts from API:', error)
      }
      
      // Fallback: find by assembly mark
      const meshes: THREE.Mesh[] = []
      model.traverse((child: any) => {
        if (child.isMesh) {
          const childAssemblyMark = child.userData?.assembly_mark
          if (childAssemblyMark && childAssemblyMark === assemblyMark) {
            meshes.push(child)
          }
        }
      })
      return meshes
    }

    // Helper function to handle selection from a mesh (used after pivot is set)
    const handleSelectionFromMesh = async (mesh: THREE.Mesh) => {
      clearSelection()

      // Use ref to get current selection mode (always up-to-date)
      const currentMode = selectionModeRef.current

      if (currentMode === 'parts') {
        // Parts mode: select only the clicked mesh
        const highlighted = highlightMesh(mesh)
        if (highlighted) {
          selectedMeshesRef.current = [highlighted]
          selectedMeshRef.current = highlighted
          
          // Store product ID for reliable lookup
          const productId = mesh.userData?.product_id || 
                          mesh.userData?.expressID || 
                          mesh.userData?.id ||
                          ((mesh as any).metadata?.product_id)
          
          console.log('[SELECTION] Parts mode - storing product ID:', {
            productId,
            meshName: mesh.name,
            userData: {
              product_id: mesh.userData?.product_id,
              expressID: mesh.userData?.expressID,
              id: mesh.userData?.id,
              metadata_product_id: (mesh as any).metadata?.product_id
            }
          })
          
          if (productId) {
            selectedProductIdsRef.current = [productId]
            console.log('[SELECTION] Updated selectedProductIdsRef.current to:', JSON.stringify(selectedProductIdsRef.current))
            console.log('[SELECTION] Product ID value:', productId)
          } else {
            console.warn('[SELECTION] No product ID found for mesh:', mesh.name)
            selectedProductIdsRef.current = []
          }
        }

        // Try to get element info from userData, metadata, or name
        // Priority: userData.product_id > userData.id > metadata > name parsing
        let expressID = 0
        if (mesh.userData?.product_id) {
          expressID = mesh.userData.product_id
        } else if (mesh.userData?.expressID) {
          expressID = mesh.userData.expressID
        } else if (mesh.userData?.id) {
          expressID = mesh.userData.id
        } else if ((mesh as any).metadata?.product_id) {
          expressID = (mesh as any).metadata.product_id
        } else if (mesh.name) {
          const parts = mesh.name.split('_')
          if (parts.length >= 2) {
            const parsed = parseInt(parts[1])
            if (!isNaN(parsed)) expressID = parsed
          }
        }
        
        let type = 'Unknown'
        if (mesh.userData?.type) {
          type = mesh.userData.type
        } else if ((mesh as any).metadata?.element_type) {
          type = (mesh as any).metadata.element_type
        } else if (mesh.name) {
          const parts = mesh.name.split('_')
          if (parts.length >= 1 && parts[0]) {
            type = parts[0]
          }
        }

        setSelected({ expressID, type })
        console.log('[SELECTION] Selected part:', { 
          expressID, 
          type,
          storedProductIds: JSON.stringify(selectedProductIdsRef.current),
          storedProductIdsArray: [...selectedProductIdsRef.current],
          storedMeshes: selectedMeshesRef.current.map(m => ({
            name: m.name,
            productId: m.userData?.product_id || m.userData?.expressID || m.userData?.id
          }))
        })
      } else {
        // Assemblies mode: select all meshes with the same assembly instance ID
        const assemblyInfo = getAssemblyInfo(mesh)
        const assemblyMark = assemblyInfo.mark
        const assemblyId = assemblyInfo.assemblyId
        
        console.log('Assembly mode - clicked mesh:', {
          assemblyMark,
          assemblyId,
          productId: mesh.userData?.product_id,
          name: mesh.name,
          userData: mesh.userData
        })
        
        if (assemblyId !== null && assemblyId !== undefined) {
          // Match by assembly instance ID to get only the specific assembly (not all with same mark)
          const assemblyMeshes = findAllMeshesWithAssemblyId(model, assemblyId)
          
          console.log(`Found ${assemblyMeshes.length} meshes with assembly ID ${assemblyId} (mark: "${assemblyMark}")`)
          
          // Highlight all meshes in this specific assembly instance
          const highlightedMeshes: THREE.Mesh[] = []
          assemblyMeshes.forEach(m => {
            const highlighted = highlightMesh(m)
            if (highlighted) {
              highlightedMeshes.push(highlighted)
            }
          })
          
          selectedMeshesRef.current = highlightedMeshes
          if (highlightedMeshes.length > 0) {
            selectedMeshRef.current = highlightedMeshes[0]
            
            // Store product IDs for reliable lookup
            const productIds: number[] = []
            highlightedMeshes.forEach(m => {
              const productId = m.userData?.product_id || 
                              m.userData?.expressID || 
                              m.userData?.id ||
                              ((m as any).metadata?.product_id)
              if (productId) {
                productIds.push(productId)
              }
            })
            selectedProductIdsRef.current = productIds
            console.log('[SELECTION] Assembly mode - stored product IDs:', {
              productIds,
              assemblyId,
              assemblyMark,
              meshCount: highlightedMeshes.length
            })
          }

          let expressID = 0
          if (mesh.userData?.product_id) {
            expressID = mesh.userData.product_id
          } else if (mesh.userData?.expressID) {
            expressID = mesh.userData.expressID
          } else if (mesh.userData?.id) {
            expressID = mesh.userData.id
          } else if ((mesh as any).metadata?.product_id) {
            expressID = (mesh as any).metadata.product_id
          } else if (mesh.name) {
            const parts = mesh.name.split('_')
            if (parts.length >= 2) {
              const parsed = parseInt(parts[1])
              if (!isNaN(parsed)) expressID = parsed
            }
          }
          const type = `Assembly: ${assemblyMark || 'Unknown'}`

          setSelected({ expressID, type })
          console.log(`Selected assembly instance (ID: ${assemblyId}, mark: "${assemblyMark}"): ${assemblyMeshes.length} parts`)
        } else if (assemblyMark && assemblyMark !== 'N/A' && assemblyMark !== 'null') {
          // Fallback: if no assembly_id, try to find assembly via API, then match by assembly_mark
          console.log('No assembly_id found, trying to find assembly parts via API for product:', mesh.userData?.product_id, 'assembly_mark:', assemblyMark)
          
          // Try to get product_id from the clicked mesh
          const clickedProductId = mesh.userData?.product_id || 
                                  mesh.userData?.expressID || 
                                  mesh.userData?.id ||
                                  ((mesh as any).metadata?.product_id)
          
          if (clickedProductId && filename) {
            // Try to find assembly via API
            try {
              const response = await fetch(`/api/assembly-parts/${encodeURIComponent(filename)}?product_id=${clickedProductId}&assembly_mark=${encodeURIComponent(assemblyMark)}`)
              if (response.ok) {
                const data = await response.json()
                const productIdsInAssembly = data.product_ids || []
                console.log(`API returned ${productIdsInAssembly.length} product IDs in assembly:`, productIdsInAssembly)
                
                // Find all meshes with these product IDs
                const assemblyMeshes: THREE.Mesh[] = []
                model.traverse((child: any) => {
                  if (child.isMesh) {
                    let childProductId: number | null = null
                    if (child.userData?.product_id) {
                      childProductId = child.userData.product_id
                    } else if (child.userData?.expressID) {
                      childProductId = child.userData.expressID
                    } else if (child.userData?.id) {
                      childProductId = child.userData.id
                    } else if ((child as any).metadata?.product_id) {
                      childProductId = (child as any).metadata.product_id
                    } else if (child.name) {
                      const parts = child.name.split('_')
                      if (parts.length >= 2) {
                        const parsed = parseInt(parts[1])
                        if (!isNaN(parsed)) childProductId = parsed
                      }
                    }
                    
                    if (childProductId && productIdsInAssembly.includes(childProductId)) {
                      assemblyMeshes.push(child)
                    }
                  }
                })
                
                console.log(`Found ${assemblyMeshes.length} meshes from API result`)
                
                if (assemblyMeshes.length > 0) {
                  // Highlight all meshes in this assembly
                  const highlightedMeshes: THREE.Mesh[] = []
                  assemblyMeshes.forEach(m => {
                    const highlighted = highlightMesh(m)
                    if (highlighted) {
                      highlightedMeshes.push(highlighted)
                    }
                  })
                  
                  selectedMeshesRef.current = highlightedMeshes
                  if (highlightedMeshes.length > 0) {
                    selectedMeshRef.current = highlightedMeshes[0]
                    
                    // Store product IDs
                    const productIds: number[] = []
                    highlightedMeshes.forEach(m => {
                      const productId = m.userData?.product_id || 
                                      m.userData?.expressID || 
                                      m.userData?.id ||
                                      ((m as any).metadata?.product_id)
                      if (productId) {
                        productIds.push(productId)
                      }
                    })
                    selectedProductIdsRef.current = productIds
                  }
                  
                  // Set selection state
                  let expressID = clickedProductId
                  const type = `Assembly: ${assemblyMark || 'Unknown'}`
                  setSelected({ expressID, type })
                  console.log(`Selected assembly (via API): ${assemblyMeshes.length} parts`)
                  return // Exit early, we're done
                }
              }
            } catch (error) {
              console.warn('[ASSEMBLY] Error fetching assembly parts from API:', error)
            }
          }
          
          // Fallback: match by assembly_mark from mapping
          console.log('Falling back to assembly_mark matching from mapping')
          const productIdsInAssembly: number[] = []
          if (model.userData?.assemblyMapping) {
            for (const [productIdStr, mappingEntry] of Object.entries(model.userData.assemblyMapping)) {
              const productId = parseInt(productIdStr)
              const entry = mappingEntry as { assembly_mark?: string; assembly_id?: number }
              if (!isNaN(productId) && entry.assembly_mark === assemblyMark) {
                productIdsInAssembly.push(productId)
              }
            }
          }
          
          console.log(`Found ${productIdsInAssembly.length} product IDs with assembly mark "${assemblyMark}":`, productIdsInAssembly)
          
          // Now find all meshes with these product IDs
          const assemblyMeshes: THREE.Mesh[] = []
          model.traverse((child: any) => {
            if (child.isMesh) {
              let childProductId: number | null = null
              if (child.userData?.product_id) {
                childProductId = child.userData.product_id
              } else if (child.userData?.expressID) {
                childProductId = child.userData.expressID
              } else if (child.userData?.id) {
                childProductId = child.userData.id
              } else if ((child as any).metadata?.product_id) {
                childProductId = (child as any).metadata.product_id
              } else if (child.name) {
                const parts = child.name.split('_')
                if (parts.length >= 2) {
                  const parsed = parseInt(parts[1])
                  if (!isNaN(parsed)) childProductId = parsed
                }
              }
              
              if (childProductId && productIdsInAssembly.includes(childProductId)) {
                assemblyMeshes.push(child)
              } else {
                // Fallback: also check by assembly_mark in userData
                const childAssemblyMark = child.userData?.assembly_mark
                if (childAssemblyMark && childAssemblyMark === assemblyMark) {
                  assemblyMeshes.push(child)
                }
              }
            }
          })
          
          console.log(`Found ${assemblyMeshes.length} meshes with assembly mark "${assemblyMark}"`)
          
          // Highlight all meshes in this assembly
          const highlightedMeshes: THREE.Mesh[] = []
          assemblyMeshes.forEach(m => {
            const highlighted = highlightMesh(m)
            if (highlighted) {
              highlightedMeshes.push(highlighted)
            }
          })
          
          selectedMeshesRef.current = highlightedMeshes
          if (highlightedMeshes.length > 0) {
            selectedMeshRef.current = highlightedMeshes[0]
            
            // Store product IDs
            const productIds: number[] = []
            highlightedMeshes.forEach(m => {
              const productId = m.userData?.product_id || 
                              m.userData?.expressID || 
                              m.userData?.id ||
                              ((m as any).metadata?.product_id)
              if (productId) {
                productIds.push(productId)
              }
            })
            selectedProductIdsRef.current = productIds
          }

          let expressID = 0
          if (mesh.userData?.product_id) {
            expressID = mesh.userData.product_id
          } else if (mesh.userData?.expressID) {
            expressID = mesh.userData.expressID
          } else if (mesh.userData?.id) {
            expressID = mesh.userData.id
          } else if ((mesh as any).metadata?.product_id) {
            expressID = (mesh as any).metadata.product_id
          } else if (mesh.name) {
            const parts = mesh.name.split('_')
            if (parts.length >= 2) {
              const parsed = parseInt(parts[1])
              if (!isNaN(parsed)) expressID = parsed
            }
          }
          
          let type = 'Unknown'
          if (mesh.userData?.type) {
            type = mesh.userData.type
          } else if ((mesh as any).metadata?.element_type) {
            type = (mesh as any).metadata.element_type
          } else if (mesh.name) {
            const parts = mesh.name.split('_')
            if (parts.length >= 1 && parts[0]) {
              type = parts[0]
            }
          }

          setSelected({ expressID, type })
          console.log('Selected part (no assembly_id):', { expressID, type })
        } else {
          // No assembly mark found, treat as single part
          const highlighted = highlightMesh(mesh)
          if (highlighted) {
            selectedMeshesRef.current = [highlighted]
            selectedMeshRef.current = highlighted
          }

          let expressID = 0
          if (mesh.userData?.product_id) {
            expressID = mesh.userData.product_id
          } else if (mesh.userData?.expressID) {
            expressID = mesh.userData.expressID
          } else if (mesh.userData?.id) {
            expressID = mesh.userData.id
          } else if ((mesh as any).metadata?.product_id) {
            expressID = (mesh as any).metadata.product_id
          } else if (mesh.name) {
            const parts = mesh.name.split('_')
            if (parts.length >= 2) {
              const parsed = parseInt(parts[1])
              if (!isNaN(parsed)) expressID = parsed
            }
          }
          
          let type = 'Unknown'
          if (mesh.userData?.type) {
            type = mesh.userData.type
          } else if ((mesh as any).metadata?.element_type) {
            type = (mesh as any).metadata.element_type
          } else if (mesh.name) {
            const parts = mesh.name.split('_')
            if (parts.length >= 1 && parts[0]) {
              type = parts[0]
            }
          }

          setSelected({ expressID, type })
          console.log('Selected part (no assembly mark):', { expressID, type })
        }
      }
    }

    // Store selection handler in ref for use in onPointerUp
    handleSelectionFromMeshRef.current = handleSelectionFromMesh
    
    // Store clearSelection in ref for use in onPointerUp
    clearSelectionRef.current = clearSelection

    return () => {
      clearSelection()
      handleSelectionFromMeshRef.current = null
      clearSelectionRef.current = null
    }
  }

  // Helper function to find meshes by product ID
  const findMeshesByProductIds = (productIds: number[]): THREE.Mesh[] => {
    const foundMeshes: THREE.Mesh[] = []
    if (!modelRef.current) {
      console.warn('[findMeshesByProductIds] No model available')
      return foundMeshes
    }
    
    console.log(`[findMeshesByProductIds] Looking for product IDs:`, productIds)
    let totalMeshes = 0
    
    modelRef.current.traverse((child: any) => {
      if (child.isMesh) {
        totalMeshes++
        const productId = child.userData?.product_id || 
                         child.userData?.expressID || 
                         child.userData?.id ||
                         ((child as any).metadata?.product_id)
        if (productId && productIds.includes(productId)) {
          console.log(`[findMeshesByProductIds] Found mesh with product ID ${productId}:`, {
            name: child.name,
            visible: child.visible,
            material: Array.isArray(child.material) ? child.material[0]?.type : child.material?.type,
            userData: child.userData
          })
          foundMeshes.push(child)
        }
      }
    })
    
    console.log(`[findMeshesByProductIds] Searched ${totalMeshes} meshes, found ${foundMeshes.length} matches`)
    return foundMeshes
  }

  // Handler functions for control panel buttons
  const handleTransparent = () => {
    console.log('[handleTransparent] Called')
    console.log('[handleTransparent] selectedProductIdsRef.current:', selectedProductIdsRef.current)
    console.log('[handleTransparent] selectedMeshesRef.current:', selectedMeshesRef.current.map(m => ({
      name: m.name,
      productId: m.userData?.product_id || m.userData?.expressID || m.userData?.id,
      visible: m.visible
    })))
    
    if (!modelRef.current) {
      console.warn('[handleTransparent] No model available')
      return
    }
    
    // Use product IDs to find the actual meshes (more reliable than stored references)
    const productIds = selectedProductIdsRef.current.length > 0 
      ? selectedProductIdsRef.current 
      : selectedMeshesRef.current.map(m => 
          m.userData?.product_id || m.userData?.expressID || m.userData?.id || ((m as any).metadata?.product_id)
        ).filter(id => id !== undefined && id !== null) as number[]
    
    console.log('[handleTransparent] Extracted product IDs:', productIds)
    
    if (productIds.length === 0) {
      console.warn('[handleTransparent] No product IDs found for transparent operation')
      return
    }
    
    const meshesToProcess = findMeshesByProductIds(productIds)
    
    if (meshesToProcess.length === 0) {
      console.warn(`[handleTransparent] No meshes found for product IDs: ${productIds.join(', ')}`)
      return
    }
    
    console.log(`[handleTransparent] Making ${meshesToProcess.length} mesh(es) transparent (product IDs: ${productIds.join(', ')})`)
    
    meshesToProcess.forEach((mesh, index) => {
      console.log(`[handleTransparent] Processing mesh ${index + 1}/${meshesToProcess.length}:`, {
        name: mesh.name,
        productId: mesh.userData?.product_id || mesh.userData?.expressID,
        currentVisible: mesh.visible,
        currentMaterial: Array.isArray(mesh.material) ? mesh.material[0]?.type : mesh.material?.type,
        currentState: elementStatesRef.current.get(mesh)
      })
      if (!mesh) return
      
      // Check if mesh is already transparent - check both state ref and material properties
      const currentState = elementStatesRef.current.get(mesh)
      
      // Get the actual material (might be highlighted, so check if there's an original stored)
      let actualMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      // If this is a highlighted material, check the original material instead
      if (mesh.userData && mesh.userData._originalMaterial) {
        const origMat = Array.isArray(mesh.userData._originalMaterial) ? mesh.userData._originalMaterial[0] : mesh.userData._originalMaterial
        if (origMat) {
          actualMaterial = origMat
        }
      }
      
      // Check if material is transparent (opacity < 1.0 and transparent flag is true)
      const isMaterialTransparent = actualMaterial && 
                                    actualMaterial.transparent === true && 
                                    actualMaterial.opacity !== undefined && 
                                    actualMaterial.opacity < 1.0 &&
                                    actualMaterial.opacity > 0
      
      console.log(`[handleTransparent] State check:`, {
        currentState,
        isMaterialTransparent,
        materialTransparent: actualMaterial?.transparent,
        materialOpacity: actualMaterial?.opacity,
        hasOriginalMaterial: originalMaterialsRef.current.has(mesh)
      })
      
      // If state says transparent OR material is transparent, treat it as transparent
      if (currentState === 'transparent' || (currentState !== 'hidden' && isMaterialTransparent)) {
        // If state wasn't set but material is transparent, set the state now
        if (currentState !== 'transparent' && isMaterialTransparent) {
          elementStatesRef.current.set(mesh, 'transparent')
          // If original material isn't stored, we need to recreate it from the transparent material
          // by cloning and setting opacity to 1.0
          if (!originalMaterialsRef.current.has(mesh)) {
            if (actualMaterial && typeof actualMaterial.clone === 'function') {
              const restoredMat = actualMaterial.clone()
              restoredMat.transparent = false
              restoredMat.opacity = 1.0
              originalMaterialsRef.current.set(mesh, restoredMat)
            }
          }
        }
        console.log(`[handleTransparent] Mesh ${mesh.name} is already transparent, restoring to normal`)
        
        // Restore original material - ALWAYS ensure it's not transparent
        if (originalMaterialsRef.current.has(mesh)) {
          const originalMat = originalMaterialsRef.current.get(mesh)
          if (originalMat) {
            const mat = Array.isArray(originalMat) ? originalMat[0] : originalMat
            // Clone the material to ensure we have a fresh copy
            if (mat && typeof mat.clone === 'function') {
              const restoredMat = mat.clone()
              // CRITICAL: Ensure it's not transparent
              restoredMat.transparent = false
              restoredMat.opacity = 1.0
              mesh.material = restoredMat
            } else {
              // Fallback: use original but ensure it's not transparent
              mesh.material = originalMat
              const currentMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
              if (currentMat) {
                currentMat.transparent = false
                currentMat.opacity = 1.0
              }
            }
          }
          originalMaterialsRef.current.delete(mesh)
        } else {
          // Original material not stored - restore by setting opacity to 1.0
          // This can happen if state was lost but material remained transparent
          const currentMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
          if (currentMat) {
            // Clone and restore
            if (typeof currentMat.clone === 'function') {
              const restoredMat = currentMat.clone()
              restoredMat.transparent = false
              restoredMat.opacity = 1.0
              mesh.material = restoredMat
            } else {
              currentMat.transparent = false
              currentMat.opacity = 1.0
            }
          }
        }
        
        // Restore original visibility
        if (originalVisibilityRef.current.has(mesh)) {
          mesh.visible = originalVisibilityRef.current.get(mesh) ?? true
          originalVisibilityRef.current.delete(mesh)
        } else {
          mesh.visible = true
        }
        
        elementStatesRef.current.set(mesh, 'normal')
        
        // CRITICAL: Clear any highlighting material reference to prevent clearSelection from restoring transparent material
        if (mesh.userData && mesh.userData._originalMaterial) {
          // Check if the stored material is transparent - if so, we need to fix it
          const storedMat = Array.isArray(mesh.userData._originalMaterial) ? mesh.userData._originalMaterial[0] : mesh.userData._originalMaterial
          if (storedMat && storedMat.transparent === true && storedMat.opacity < 1.0) {
            // The stored material is transparent - we need to replace it with the restored normal material
            mesh.userData._originalMaterial = mesh.material
          } else {
            // The stored material is normal - we can keep it or clear it
            // Actually, let's clear it to be safe, since we've already restored the material
            delete mesh.userData._originalMaterial
          }
        }
        
        // Restore edge line
        if (mesh.userData?.edgeLine) {
          const edgeLine = mesh.userData.edgeLine
          if (originalVisibilityRef.current.has(edgeLine)) {
            edgeLine.visible = originalVisibilityRef.current.get(edgeLine) ?? true
            originalVisibilityRef.current.delete(edgeLine)
          } else {
            edgeLine.visible = true
          }
          if (edgeLine.material) {
            edgeLine.material.transparent = false
            edgeLine.material.opacity = 1.0
          }
        }
        
        console.log(`[handleTransparent] Restored mesh to normal:`, {
          name: mesh.name,
          visible: mesh.visible,
          material: Array.isArray(mesh.material) ? mesh.material[0]?.type : mesh.material?.type,
          materialOpacity: Array.isArray(mesh.material) ? mesh.material[0]?.opacity : mesh.material?.opacity,
          materialTransparent: Array.isArray(mesh.material) ? mesh.material[0]?.transparent : mesh.material?.transparent,
          state: elementStatesRef.current.get(mesh)
        })
        return
      }
      
      // Store original material if not already stored
      // Get the base material (not the highlighted one)
      let baseMaterial = mesh.material
      if (mesh.userData && mesh.userData._originalMaterial) {
        // If there's a highlight material, use the original underneath
        baseMaterial = mesh.userData._originalMaterial
      }
      
      if (!originalMaterialsRef.current.has(mesh)) {
        originalMaterialsRef.current.set(mesh, baseMaterial)
      }
      
      // Store original visibility
      if (!originalVisibilityRef.current.has(mesh)) {
        originalVisibilityRef.current.set(mesh, mesh.visible)
      }
      
      // Make transparent
      const material = Array.isArray(baseMaterial) ? baseMaterial[0] : baseMaterial
      if (material) {
        const transparentMat = material.clone()
        transparentMat.transparent = true
        transparentMat.opacity = 0.3
        mesh.material = transparentMat
      }
      
      mesh.visible = true
      elementStatesRef.current.set(mesh, 'transparent')
      console.log(`[handleTransparent] Applied transparency to mesh:`, {
        name: mesh.name,
        opacity: (mesh.material as any)?.opacity,
        transparent: (mesh.material as any)?.transparent,
        visible: mesh.visible
      })
    })
    
    // Also handle edge lines
    meshesToProcess.forEach((mesh, index) => {
      console.log(`[handleTransparent] Processing edge line ${index + 1}/${meshesToProcess.length} for mesh:`, mesh.name)
      if (mesh && mesh.userData?.edgeLine) {
        const edgeLine = mesh.userData.edgeLine
        if (!originalVisibilityRef.current.has(edgeLine)) {
          originalVisibilityRef.current.set(edgeLine, edgeLine.visible)
        }
        edgeLine.visible = true
        if (edgeLine.material) {
          edgeLine.material.transparent = true
          edgeLine.material.opacity = 0.3
        }
      }
    })
  }
  
  const handleHide = () => {
    console.log('[handleHide] Called')
    console.log('[handleHide] selectedProductIdsRef.current:', selectedProductIdsRef.current)
    console.log('[handleHide] selectedMeshesRef.current:', selectedMeshesRef.current.map(m => ({
      name: m.name,
      productId: m.userData?.product_id || m.userData?.expressID || m.userData?.id,
      visible: m.visible
    })))
    
    if (!modelRef.current) {
      console.warn('[handleHide] No model available')
      return
    }
    
    // Use product IDs to find the actual meshes
    const productIds = selectedProductIdsRef.current.length > 0 
      ? selectedProductIdsRef.current 
      : selectedMeshesRef.current.map(m => 
          m.userData?.product_id || m.userData?.expressID || m.userData?.id || ((m as any).metadata?.product_id)
        ).filter(id => id !== undefined && id !== null) as number[]
    
    console.log('[handleHide] Extracted product IDs:', productIds)
    
    if (productIds.length === 0) {
      console.warn('[handleHide] No product IDs found for hide operation')
      return
    }
    
    const meshesToProcess = findMeshesByProductIds(productIds)
    
    if (meshesToProcess.length === 0) {
      console.warn(`[handleHide] No meshes found for product IDs: ${productIds.join(', ')}`)
      return
    }
    
    console.log(`[handleHide] Hiding ${meshesToProcess.length} mesh(es) (product IDs: ${productIds.join(', ')})`)
    
    meshesToProcess.forEach((mesh, index) => {
      console.log(`[handleHide] Processing mesh ${index + 1}/${meshesToProcess.length}:`, {
        name: mesh.name,
        productId: mesh.userData?.product_id || mesh.userData?.expressID,
        currentVisible: mesh.visible
      })
      if (!mesh) return
      
      // Store original visibility if not already stored
      if (!originalVisibilityRef.current.has(mesh)) {
        originalVisibilityRef.current.set(mesh, mesh.visible)
      }
      
      // Hide
      mesh.visible = false
      elementStatesRef.current.set(mesh, 'hidden')
      console.log(`[handleHide] Hidden mesh:`, {
        name: mesh.name,
        visible: mesh.visible,
        state: elementStatesRef.current.get(mesh)
      })
      
      // Hide edge lines
      if (mesh.userData?.edgeLine) {
        const edgeLine = mesh.userData.edgeLine
        if (!originalVisibilityRef.current.has(edgeLine)) {
          originalVisibilityRef.current.set(edgeLine, edgeLine.visible)
        }
        edgeLine.visible = false
        console.log(`[handleHide] Hidden edge line for mesh:`, mesh.name)
      }
    })
  }
  
  const handleHideAllExcept = () => {
    console.log('[handleHideAllExcept] Called')
    console.log('[handleHideAllExcept] selectedProductIdsRef.current:', selectedProductIdsRef.current)
    console.log('[handleHideAllExcept] selectedMeshesRef.current:', selectedMeshesRef.current.map(m => ({
      name: m.name,
      productId: m.userData?.product_id || m.userData?.expressID || m.userData?.id,
      visible: m.visible
    })))
    
    if (!modelRef.current) {
      console.warn('[handleHideAllExcept] No model available')
      return
    }
    
    // Use product IDs to find the actual meshes
    const productIds = selectedProductIdsRef.current.length > 0 
      ? selectedProductIdsRef.current 
      : selectedMeshesRef.current.map(m => 
          m.userData?.product_id || m.userData?.expressID || m.userData?.id || ((m as any).metadata?.product_id)
        ).filter(id => id !== undefined && id !== null) as number[]
    
    console.log('[handleHideAllExcept] Extracted product IDs:', productIds)
    
    if (productIds.length === 0) {
      console.warn('[handleHideAllExcept] No product IDs found for hide all except operation')
      return
    }
    
    const meshesToProcess = findMeshesByProductIds(productIds)
    
    if (meshesToProcess.length === 0) {
      console.warn(`[handleHideAllExcept] No meshes found for product IDs: ${productIds.join(', ')}`)
      return
    }
    
    console.log(`[handleHideAllExcept] Hiding all except ${meshesToProcess.length} selected mesh(es) (product IDs: ${productIds.join(', ')})`)
    
    const selectedMeshSet = new Set(meshesToProcess)
    const selectedProductIdSet = new Set(productIds)
    let hiddenCount = 0
    let keptVisibleCount = 0
    
    // Hide all meshes except selected ones (check by both mesh reference and product ID)
    modelRef.current.traverse((child: any) => {
      if (child.isMesh) {
        const productId = child.userData?.product_id || 
                         child.userData?.expressID || 
                         child.userData?.id ||
                         ((child as any).metadata?.product_id)
        
        const isSelected = selectedMeshSet.has(child) || (productId && selectedProductIdSet.has(productId))
        
        // Hide if not in selected set (check both mesh reference and product ID)
        if (!isSelected) {
          // Store original visibility if not already stored
          if (!originalVisibilityRef.current.has(child)) {
            originalVisibilityRef.current.set(child, child.visible)
          }
          
          child.visible = false
          elementStatesRef.current.set(child, 'hidden')
          hiddenCount++
          
          // Hide edge lines
          if (child.userData?.edgeLine) {
            const edgeLine = child.userData.edgeLine
            if (!originalVisibilityRef.current.has(edgeLine)) {
              originalVisibilityRef.current.set(edgeLine, edgeLine.visible)
            }
            edgeLine.visible = false
          }
        } else {
          keptVisibleCount++
        }
      }
    })
    
    console.log(`[handleHideAllExcept] Completed: hidden ${hiddenCount} meshes, kept ${keptVisibleCount} visible`)
  }
  
  const handleShowAll = () => {
    console.log('[handleShowAll] Called')
    
    if (!modelRef.current) {
      console.warn('[handleShowAll] No model available')
      return
    }
    
    let restoredCount = 0
    
    // Restore all meshes to normal
    modelRef.current.traverse((child: any) => {
      if (child.isMesh) {
        // Clear highlighting material first (if exists)
        if (child.userData && child.userData._originalMaterial) {
          child.material = child.userData._originalMaterial
          delete child.userData._originalMaterial
        }
        
        // Restore original material (from transparency/hidden operations)
        // ALWAYS ensure it's not transparent
        if (originalMaterialsRef.current.has(child)) {
          const originalMat = originalMaterialsRef.current.get(child)
          if (originalMat) {
            const mat = Array.isArray(originalMat) ? originalMat[0] : originalMat
            // Clone the material to ensure we have a fresh copy
            if (mat && typeof mat.clone === 'function') {
              const restoredMat = mat.clone()
              // CRITICAL: Ensure it's not transparent
              restoredMat.transparent = false
              restoredMat.opacity = 1.0
              child.material = restoredMat
            } else {
              // Fallback: use original but ensure it's not transparent
              child.material = originalMat
              const currentMat = Array.isArray(child.material) ? child.material[0] : child.material
              if (currentMat) {
                currentMat.transparent = false
                currentMat.opacity = 1.0
              }
            }
          }
          originalMaterialsRef.current.delete(child)
        } else {
          // If no original material stored, check if current material is transparent and fix it
          const currentMat = Array.isArray(child.material) ? child.material[0] : child.material
          if (currentMat && currentMat.transparent === true && currentMat.opacity < 1.0) {
            // Material is transparent but no original stored - restore by cloning and fixing
            if (typeof currentMat.clone === 'function') {
              const restoredMat = currentMat.clone()
              restoredMat.transparent = false
              restoredMat.opacity = 1.0
              child.material = restoredMat
            } else {
              currentMat.transparent = false
              currentMat.opacity = 1.0
            }
          }
        }
        
        // Restore original visibility
        if (originalVisibilityRef.current.has(child)) {
          child.visible = originalVisibilityRef.current.get(child) ?? true
          originalVisibilityRef.current.delete(child)
        } else {
          child.visible = true
        }
        
        elementStatesRef.current.set(child, 'normal')
        
        // Restore edge lines
        if (child.userData?.edgeLine) {
          const edgeLine = child.userData.edgeLine
          if (originalVisibilityRef.current.has(edgeLine)) {
            edgeLine.visible = originalVisibilityRef.current.get(edgeLine) ?? true
            originalVisibilityRef.current.delete(edgeLine)
          } else {
            edgeLine.visible = true
          }
          if (edgeLine.material) {
            edgeLine.material.transparent = false
            edgeLine.material.opacity = 1.0
          }
        }
        
        restoredCount++
      }
    })
    
    console.log(`[handleShowAll] Restored ${restoredCount} meshes to normal`)
    
    // Clear all state maps
    elementStatesRef.current.clear()
    originalMaterialsRef.current.clear()
    originalVisibilityRef.current.clear()
    
    // Clear selection and remove highlighting
    selectedMeshesRef.current.forEach(mesh => {
      if (mesh.userData && mesh.userData._originalMaterial) {
        mesh.material = mesh.userData._originalMaterial
        delete mesh.userData._originalMaterial
      }
    })
    selectedMeshesRef.current = []
    selectedMeshRef.current = null
    selectedProductIdsRef.current = []
    setSelectedElement(null)
    
    console.log('[handleShowAll] Cleared all state maps and selection')
  }

  // Clear all measurements from the view
  const clearAllMeasurements = () => {
    const scene = sceneRef.current
    if (!scene) return
    
    // Remove all stored measurements
    allMeasurementsRef.current.forEach(measurement => {
      // Remove arrow
      if (measurement.arrow) {
        scene.remove(measurement.arrow)
        measurement.arrow.traverse((child: any) => {
          if (child.geometry) child.geometry.dispose()
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((mat: THREE.Material) => mat.dispose())
            } else {
              child.material.dispose()
            }
          }
        })
      }
      
      // Remove label
      if (measurement.label) {
        measurement.label.remove()
      }
      
      // Remove dots
      measurement.dots.forEach(dot => {
        scene.remove(dot)
        dot.geometry.dispose()
        if (dot.material) {
          if (Array.isArray(dot.material)) {
            dot.material.forEach((mat: THREE.Material) => mat.dispose())
          } else {
            dot.material.dispose()
          }
        }
      })
    })
    
    // Clear the array
    allMeasurementsRef.current = []
    
    console.log('[MEASUREMENT] All measurements cleared')
  }
  
  // Clear current measurement visualization (for in-progress measurements)
  const clearMeasurement = () => {
    const scene = sceneRef.current
    if (!scene) return
    
    // Remove measurement arrow
    if (measurementLineRef.current) {
      scene.remove(measurementLineRef.current)
      // ArrowHelper has children, dispose them
      measurementLineRef.current.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: THREE.Material) => mat.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
      measurementLineRef.current = null
    }
    
    // Remove measurement label (HTML overlay)
    if (measurementLabelDivRef.current) {
      measurementLabelDivRef.current.remove()
      measurementLabelDivRef.current = null
    }
    
    // Clean up legacy sprite label if it exists
    if (measurementLabelRef.current && scene) {
      scene.remove(measurementLabelRef.current)
      measurementLabelRef.current.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: THREE.Material) => mat.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
      measurementLabelRef.current = null
    }
    
    measurementPointsRef.current = []
    
    // Remove measurement dots
    if (scene) {
      measurementDotsRef.current.forEach(dot => {
        scene.remove(dot)
        dot.geometry.dispose()
        if (dot.material) {
          if (Array.isArray(dot.material)) {
            dot.material.forEach((mat: THREE.Material) => mat.dispose())
          } else {
            dot.material.dispose()
          }
        }
      })
      measurementDotsRef.current = []
    }
    
    // Remove preview arrow
    if (previewArrowRef.current && scene) {
      scene.remove(previewArrowRef.current)
      previewArrowRef.current.traverse((child: THREE.Object3D) => {
        const obj = child as any
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat: THREE.Material) => mat.dispose())
          } else {
            obj.material.dispose()
          }
        }
      })
      previewArrowRef.current = null
    }
    
    // Hide hover preview marker
    if (hoverPreviewMarkerRef.current) {
      hoverPreviewMarkerRef.current.visible = false
    }
  }
  
  // Find closest corner/vertex for snapping
  const findClosestCorner = (intersection: THREE.Intersection, model: THREE.Group | null, snapDistance: number): THREE.Vector3 | null => {
    if (!model || !intersection.object || !intersection.face) return null
    
    const hitPoint = intersection.point
    const hitObject = intersection.object as THREE.Mesh
    
    // Get the geometry
    const geometry = hitObject.geometry
    if (!geometry || !geometry.attributes.position) return null
    
    // Get face vertices
    const face = intersection.face
    const positions = geometry.attributes.position
    
    // Check all three vertices of the face
    const vertices = [
      new THREE.Vector3().fromBufferAttribute(positions, face.a),
      new THREE.Vector3().fromBufferAttribute(positions, face.b),
      new THREE.Vector3().fromBufferAttribute(positions, face.c)
    ]
    
    // Transform vertices to world space
    vertices.forEach(v => v.applyMatrix4(hitObject.matrixWorld))
    
    let closestVertex: THREE.Vector3 | null = null
    let minDistance = snapDistance
    
    vertices.forEach(vertex => {
      const distance = hitPoint.distanceTo(vertex)
      if (distance < minDistance) {
        minDistance = distance
        closestVertex = vertex.clone()
      }
    })
    
    return closestVertex
  }

  // Find closest edge point for snapping
  const findClosestEdgePoint = (intersection: THREE.Intersection, model: THREE.Group | null, snapDistance: number): THREE.Vector3 | null => {
    if (!model || !intersection.object || !intersection.face) return null
    
    const hitPoint = intersection.point
    const hitObject = intersection.object as THREE.Mesh
    
    // Get the geometry
    const geometry = hitObject.geometry
    if (!geometry || !geometry.attributes.position) return null
    
    // Get face vertices
    const face = intersection.face
    const positions = geometry.attributes.position
    const vA = new THREE.Vector3().fromBufferAttribute(positions, face.a)
    const vB = new THREE.Vector3().fromBufferAttribute(positions, face.b)
    const vC = new THREE.Vector3().fromBufferAttribute(positions, face.c)
    
    // Transform vertices to world space
    vA.applyMatrix4(hitObject.matrixWorld)
    vB.applyMatrix4(hitObject.matrixWorld)
    vC.applyMatrix4(hitObject.matrixWorld)
    
    // Check each edge of the triangle
    const edges = [
      [vA.clone(), vB.clone()],
      [vB.clone(), vC.clone()],
      [vC.clone(), vA.clone()]
    ]
    
    let closestPoint: THREE.Vector3 | null = null
    let minDistance = snapDistance
    
    edges.forEach(([v1, v2]) => {
      // Find closest point on edge segment
      const edge = new THREE.Vector3().subVectors(v2, v1)
      const toPoint = new THREE.Vector3().subVectors(hitPoint, v1)
      const edgeLength = edge.length()
      
      if (edgeLength > 0) {
        const t = Math.max(0, Math.min(1, toPoint.dot(edge) / (edgeLength * edgeLength)))
        const pointOnEdge = new THREE.Vector3().addVectors(v1, edge.clone().multiplyScalar(t))
        
        const distance = hitPoint.distanceTo(pointOnEdge)
        if (distance < minDistance) {
          minDistance = distance
          closestPoint = pointOnEdge.clone()
        }
      }
    })
    
    return closestPoint
  }

  // Create a red dot at a point
  const createMeasurementDot = (point: THREE.Vector3) => {
    const scene = sceneRef.current
    const camera = cameraRef.current
    if (!scene || !camera) return null
    
    // Calculate dot size for fixed pixel size (8 pixels)
    const distanceToCamera = camera.position.distanceTo(point)
    const fov = camera.fov * (Math.PI / 180)
    const height = 2 * Math.tan(fov / 2) * distanceToCamera
    const pixelToWorld = height / (containerRef.current?.clientHeight || 1)
    const dotSize = 8 * pixelToWorld // 8 pixels
    
    // Create a small red sphere
    const geometry = new THREE.SphereGeometry(dotSize, 16, 16)
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xff0000, // Red
      transparent: false
    })
    const dot = new THREE.Mesh(geometry, material)
    dot.position.copy(point)
    dot.name = 'measurement-dot'
    
    scene.add(dot)
    measurementDotsRef.current.push(dot)
    
    return dot
  }
  
  // Create an arrow from start to end point (currently unused)
  // @ts-ignore - intentionally unused, kept for potential future use
  const _createArrow = (start: THREE.Vector3, end: THREE.Vector3) => {
    const scene = sceneRef.current
    if (!scene) return null
    
    const direction = new THREE.Vector3().subVectors(end, start)
    const length = direction.length()
    const arrowDirection = direction.clone().normalize()
    
    // Create arrow helper
    const arrowHelper = new THREE.ArrowHelper(
      arrowDirection,
      start,
      length,
      0xff0000, // Red color
      length * 0.1, // Head length (10% of total)
      length * 0.05 // Head width (5% of total)
    )
    
    arrowHelper.name = 'measurement-arrow'
    scene.add(arrowHelper)
    
    return arrowHelper
  }
  
  // Update preview arrow from start point to current cursor position
  const updatePreviewArrow = (startPoint: THREE.Vector3, endPoint: THREE.Vector3) => {
    const scene = sceneRef.current
    if (!scene) return
    
    // Remove existing preview arrow
    if (previewArrowRef.current) {
      scene.remove(previewArrowRef.current)
      previewArrowRef.current.traverse((child: THREE.Object3D) => {
        const obj = child as any
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat: THREE.Material) => mat.dispose())
          } else {
            obj.material.dispose()
          }
        }
      })
      previewArrowRef.current = null
    }
    
    // Create new preview arrow
    const direction = new THREE.Vector3().subVectors(endPoint, startPoint)
    const length = direction.length()
    if (length > 0.001) { // Only create if there's meaningful distance
      const arrowDirection = direction.clone().normalize()
      
      const arrowHelper = new THREE.ArrowHelper(
        arrowDirection,
        startPoint,
        length,
        0xff0000, // Red color
        length * 0.1, // Head length
        length * 0.05 // Head width
      )
      
      arrowHelper.name = 'measurement-preview-arrow'
      scene.add(arrowHelper)
      previewArrowRef.current = arrowHelper
    }
  }

  // Create final measurement arrow between two points
  const createMeasurementArrow = (start: THREE.Vector3, end: THREE.Vector3) => {
    const scene = sceneRef.current
    if (!scene) {
      console.log('[MEASUREMENT] createMeasurementArrow: No scene')
      return
    }
    
    console.log('[MEASUREMENT] createMeasurementArrow called with:', start, end)
    
    // Remove preview arrow
    if (previewArrowRef.current) {
      scene.remove(previewArrowRef.current)
      previewArrowRef.current.traverse((child: THREE.Object3D) => {
        const obj = child as any
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat: THREE.Material) => mat.dispose())
          } else {
            obj.material.dispose()
          }
        }
      })
      previewArrowRef.current = null
    }
    
    // Clear existing measurement arrow
    if (measurementLineRef.current) {
      scene.remove(measurementLineRef.current)
      measurementLineRef.current.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: THREE.Material) => mat.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
      measurementLineRef.current = null
    }
    
    if (measurementLabelRef.current) {
      scene.remove(measurementLabelRef.current)
      measurementLabelRef.current.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: THREE.Material) => mat.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
      measurementLabelRef.current = null
    }
    
    // Create final arrow
    const direction = new THREE.Vector3().subVectors(end, start)
    const length = direction.length()
    const arrowDirection = direction.clone().normalize()
    
    const arrowHelper = new THREE.ArrowHelper(
      arrowDirection,
      start,
      length,
      0xff0000, // Red color
      length * 0.1, // Head length (10% of total)
      length * 0.05 // Head width (5% of total)
    )
    
    arrowHelper.name = 'measurement-arrow'
    scene.add(arrowHelper)
    console.log('[MEASUREMENT] Arrow added to scene')
    
    // Calculate distance in mm
    const distance = start.distanceTo(end) * 1000 // Convert from meters to mm
    console.log('[MEASUREMENT] Distance calculated:', distance, 'mm')
    
    // Create label at midpoint
    createMeasurementLabel(start, end, distance)
    
    // Store this measurement in the all measurements array
    const measurement = {
      arrow: arrowHelper,
      label: measurementLabelDivRef.current,
      dots: [...measurementDotsRef.current], // Copy the dots array
      start: start.clone(),
      end: end.clone()
    }
    allMeasurementsRef.current.push(measurement)
    
    // Clear current measurement refs (but keep the visuals in allMeasurementsRef)
    measurementLineRef.current = null
    measurementLabelDivRef.current = null
    measurementDotsRef.current = []
    measurementPointsRef.current = []
  }

  // Create text label showing distance using HTML overlay
  const createMeasurementLabel = (start: THREE.Vector3, end: THREE.Vector3, distance: number) => {
    const camera = cameraRef.current
    const container = containerRef.current
    if (!camera || !container) return
    
    // Calculate midpoint
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
    
    // Format distance - show in mm, or m if > 1000mm
    const distanceInMm = distance
    let displayText: string
    if (distanceInMm >= 1000) {
      displayText = `${(distanceInMm / 1000).toFixed(2)} m`
    } else {
      displayText = `${distanceInMm.toFixed(0)} mm`
    }
    
    // Remove existing label if any
    if (measurementLabelDivRef.current) {
      measurementLabelDivRef.current.remove()
      measurementLabelDivRef.current = null
    }
    
    // Create HTML div for label
    const labelDiv = document.createElement('div')
    labelDiv.textContent = displayText
    labelDiv.style.position = 'absolute'
    labelDiv.style.pointerEvents = 'none'
    labelDiv.style.userSelect = 'none'
    labelDiv.style.color = '#ffffff'
    labelDiv.style.fontSize = '16px'
    labelDiv.style.fontWeight = 'bold'
    labelDiv.style.fontFamily = 'Arial, sans-serif'
    labelDiv.style.background = 'rgba(0, 0, 0, 0.85)'
    labelDiv.style.border = '2px solid #ff0000'
    labelDiv.style.borderRadius = '8px'
    labelDiv.style.padding = '6px 12px'
    labelDiv.style.whiteSpace = 'nowrap'
    labelDiv.style.zIndex = '1000'
    labelDiv.style.transform = 'translate(-50%, -50%)' // Center on point
    labelDiv.style.textAlign = 'center'
    
    container.appendChild(labelDiv)
    measurementLabelDivRef.current = labelDiv
    
    // Store midpoint on the label div so update function can access it
    const storedMidpoint = midpoint.clone()
    ;(labelDiv as any).midpoint = storedMidpoint
    
    // Update position function
    const updateLabelPosition = () => {
      if (!labelDiv || !camera || !container) return
      
      // Get stored midpoint
      const storedMidpoint = (labelDiv as any).midpoint as THREE.Vector3
      if (!storedMidpoint) return
      
      // Project 3D point to screen coordinates
      const vector = storedMidpoint.clone()
      vector.project(camera)
      
      const x = (vector.x * 0.5 + 0.5) * container.clientWidth
      const y = (-vector.y * 0.5 + 0.5) * container.clientHeight
      
      // Only show if point is in front of camera
      if (vector.z < 1) {
        labelDiv.style.left = `${x}px`
        labelDiv.style.top = `${y}px`
        labelDiv.style.display = 'block'
      } else {
        labelDiv.style.display = 'none'
      }
    }
    
    // Update position immediately
    updateLabelPosition()
    
    // Store update function for animate loop
    ;(labelDiv as any).updatePosition = updateLabelPosition
    
    console.log('[MEASUREMENT] HTML Label created:', displayText, 'at midpoint:', midpoint)
  }
  
  // --- Clipping controls ---
  const handleToggleClipping = () => {
    if (!enableClipping) return
    const newMode = !clippingModeRef.current
    clippingModeRef.current = newMode
    setClippingMode(newMode)
    
    if (!newMode) {
      // Turn off clipping entirely
      disableClippingPlane()
      setActiveClipPlane(null)
      activeClipPlaneRef.current = null
      setClipAmount(0)
      clipAmountRef.current = 0
      return
    }
    
    // Enable clipping and ensure renderer knows it
    if (activeClipPlaneRef.current) {
      applyClippingPlane(activeClipPlaneRef.current, clipAmountRef.current)
    } else {
      const defaultPlane: ClipPlaneKey = 'front'
      activeClipPlaneRef.current = defaultPlane
      setActiveClipPlane(defaultPlane)
      const defaultAmount = 0
      clipAmountRef.current = defaultAmount
      setClipAmount(defaultAmount)
      applyClippingPlane(defaultPlane, defaultAmount)
    }
  }
  
  const handleSelectClipPlane = (planeKey: ClipPlaneKey) => {
    if (!enableClipping) return
    activeClipPlaneRef.current = planeKey
    setActiveClipPlane(planeKey)
    applyClippingPlane(planeKey, clipAmountRef.current)
  }
  
  const handleClipSliderChange = (value: number) => {
    const normalized = Math.min(Math.max(value, 0), 1)
    setClipAmount(normalized)
    clipAmountRef.current = normalized
    if (clippingModeRef.current && activeClipPlaneRef.current) {
      applyClippingPlane(activeClipPlaneRef.current, normalized)
    }
  }
  
  // --- Markup/Screenshot functions ---
  const captureScreenshot = (): string | null => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    const container = containerRef.current
    const markupCanvas = markupCanvasRef.current
    
    if (!renderer || !scene || !camera || !container) {
      console.error('[MARKUP] No renderer, scene, camera, or container available')
      return null
    }
    
    try {
      // Force a render to ensure the scene is up to date
      renderer.render(scene, camera)
      
      // Get container dimensions
      const rect = container.getBoundingClientRect()
      
      // Create a temporary canvas to combine all layers
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = rect.width
      tempCanvas.height = rect.height
      const tempCtx = tempCanvas.getContext('2d')
      
      if (!tempCtx) {
        console.error('[MARKUP] Failed to get 2D context for temp canvas')
        return null
      }
      
      // Draw the 3D renderer canvas first (background)
      tempCtx.drawImage(renderer.domElement, 0, 0, rect.width, rect.height)
      
      // If markup mode is active, include markup elements
      if (markupMode && markupCanvas) {
        // Redraw all markup elements to ensure they're captured
        // First, draw existing canvas content
        if (markupCanvas.width > 0 && markupCanvas.height > 0) {
          tempCtx.drawImage(markupCanvas, 0, 0, rect.width, rect.height)
        }
        
        // Redraw all stored markup elements to ensure they're all captured
        tempCtx.lineCap = 'round'
        tempCtx.lineJoin = 'round'
        
        markupElementsRef.current.forEach(element => {
          if (element.type === 'arrow' && element.data.start && element.data.end) {
            drawArrow(tempCtx, element.data.start, element.data.end, element.color, element.thickness)
          } else if (element.type === 'cloud' && element.data.start && element.data.end) {
            drawCloud(tempCtx, element.data.start, element.data.end, element.color, element.thickness)
          }
          // Note: pencil paths are already on the canvas, so we don't need to redraw them
        })
        
        // Draw text elements
        textElementsRef.current.forEach(textEl => {
          const textRect = textEl.element.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          const x = textRect.left - containerRect.left
          const y = textRect.top - containerRect.top
          
          // Draw text background
          tempCtx.fillStyle = 'rgba(255, 255, 255, 0.9)'
          tempCtx.fillRect(x, y, textRect.width, textRect.height)
          
          // Draw text border (use default red for text borders)
          tempCtx.strokeStyle = '#ff0000'
          tempCtx.lineWidth = 2
          tempCtx.strokeRect(x, y, textRect.width, textRect.height)
          
          // Draw text content
          const textarea = textEl.element.querySelector('textarea') as HTMLTextAreaElement
          if (textarea && textarea.value) {
            tempCtx.fillStyle = '#000000'
            tempCtx.font = '20px Arial'
            const lines = textarea.value.split('\n')
            const lineHeight = 24 // Approximate line height for 20px font
            lines.forEach((line, index) => {
              tempCtx.fillText(line, x + 4, y + 20 + (index * lineHeight))
            })
          }
        })
      }
      
      // Return the combined image
      return tempCanvas.toDataURL('image/png')
    } catch (error) {
      console.error('[MARKUP] Error capturing screenshot:', error)
      return null
    }
  }
  
  const handleSaveScreenshot = () => {
    const dataURL = captureScreenshot()
    if (!dataURL) {
      alert('Failed to capture screenshot')
      return
    }
    
    try {
      // Create a download link
      const link = document.createElement('a')
      link.download = `model-screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
      link.href = dataURL
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      console.log('[SCREENSHOT] Screenshot saved')
      
      // Clear all markups after saving (only if markup mode is active)
      if (markupMode) {
        clearAllMarkups()
      }
    } catch (error) {
      console.error('[SCREENSHOT] Error saving screenshot:', error)
      alert('Failed to save screenshot')
    }
  }
  
  const handleCopyScreenshot = async () => {
    const dataURL = captureScreenshot()
    if (!dataURL) {
      alert('Failed to capture screenshot')
      return
    }
    
    try {
      // Convert data URL to blob
      const response = await fetch(dataURL)
      const blob = await response.blob()
      
      // Copy to clipboard using Clipboard API
      if (navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob
          })
        ])
        console.log('[SCREENSHOT] Screenshot copied to clipboard')
        alert('Screenshot copied to clipboard!')
        
        // Clear all markups after copying (only if markup mode is active)
        if (markupMode) {
          clearAllMarkups()
        }
      } else {
        // Fallback for browsers that don't support ClipboardItem
        alert('Clipboard API not supported in this browser. Please use the Save button instead.')
      }
    } catch (error) {
      console.error('[SCREENSHOT] Error copying screenshot:', error)
      alert('Failed to copy screenshot to clipboard')
    }
  }
  
  const clearAllMarkups = () => {
    // Clear canvas
    const ctx = getCanvasContext()
    const canvas = markupCanvasRef.current
    if (ctx && canvas) {
      const dpr = window.devicePixelRatio || 1
      const displayWidth = canvas.width / dpr
      const displayHeight = canvas.height / dpr
      ctx.clearRect(0, 0, displayWidth, displayHeight)
    }
    
    // Clear stored markup elements
    markupElementsRef.current = []
    currentPencilPathRef.current = []
    lastPencilPointRef.current = null
    
    // Clear text elements
    const container = markupContainerRef.current
    if (container) {
      textElementsRef.current.forEach(textEl => {
        if (textEl.element && textEl.element.parentNode) {
          textEl.element.parentNode.removeChild(textEl.element)
        }
      })
      textElementsRef.current = []
    }
  }
  
  const handleToggleMarkup = () => {
    const newMode = !markupMode
    setMarkupMode(newMode)
    if (!newMode) {
      // Clear active tool and all markups when disabling markup
      setActiveMarkupTool(null)
      clearAllMarkups()
    } else {
      // Clear markups when re-enabling markup mode
      clearAllMarkups()
    }
  }
  
  // --- Markup Drawing Functions ---
  const getColorHex = (colorName: 'red' | 'black' | 'yellow' | 'green' | 'blue'): string => {
    const colorMap = {
      red: '#ff0000',
      black: '#000000',
      yellow: '#ffff00',
      green: '#00ff00',
      blue: '#0000ff'
    }
    return colorMap[colorName]
  }
  
  const getLineWidth = (thickness: number): number => {
    // Map 1-5 levels to line widths: 1=1px, 2=2px, 3=3px, 4=5px, 5=8px
    const widthMap: { [key: number]: number } = {
      1: 1,
      2: 2,
      3: 3,
      4: 5,
      5: 8
    }
    return widthMap[thickness] || 3
  }
  
  const applyMarkupSettings = (ctx: CanvasRenderingContext2D) => {
    const colorHex = getColorHex(markupColor)
    const lineWidth = getLineWidth(markupThickness)
    ctx.strokeStyle = colorHex
    ctx.fillStyle = colorHex
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.miterLimit = 10
    
    // Enable smooth rendering for pencil strokes
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
  }
  
  const getCanvasContext = (): CanvasRenderingContext2D | null => {
    const canvas = markupCanvasRef.current
    if (!canvas) return null
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    
    return ctx
  }
  
  const setupMarkupCanvas = () => {
    const container = containerRef.current
    const canvas = markupCanvasRef.current
    if (!container || !canvas) return
    
    // Get device pixel ratio for crisp rendering on high-DPI displays
    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    
    // Set display size (CSS pixels)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    
    // Set actual size in memory (scaled for device pixel ratio)
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    
    const ctx = getCanvasContext()
    if (ctx) {
      // Scale the context to match device pixel ratio
      ctx.scale(dpr, dpr)
      
      // Enable better rendering quality
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      
      applyMarkupSettings(ctx)
    }
  }
  
  const redrawMarkupCanvas = () => {
    const ctx = getCanvasContext()
    if (!ctx) return
    
    const canvas = markupCanvasRef.current
    if (!canvas) return
    
    // Get the actual canvas dimensions (accounting for devicePixelRatio)
    const dpr = window.devicePixelRatio || 1
    const displayWidth = canvas.width / dpr
    const displayHeight = canvas.height / dpr
    
    // Clear the entire canvas
    ctx.clearRect(0, 0, displayWidth, displayHeight)
    
    // Redraw all saved markup elements
    markupElementsRef.current.forEach(element => {
      if (element.type === 'arrow' && element.data.start && element.data.end) {
        drawArrow(ctx, element.data.start, element.data.end, element.color, element.thickness)
      } else if (element.type === 'cloud' && element.data.start && element.data.end) {
        drawCloud(ctx, element.data.start, element.data.end, element.color, element.thickness)
      } else if (element.type === 'pencil' && element.path && element.path.length > 0) {
        // Redraw pencil path with smooth curves
        if (element.color && element.thickness !== undefined) {
          const colorHex = getColorHex(element.color as 'red' | 'black' | 'yellow' | 'green' | 'blue')
          const lineWidth = getLineWidth(element.thickness)
          ctx.strokeStyle = colorHex
          ctx.lineWidth = lineWidth
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.miterLimit = 10
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
        }
        
        if (element.path.length === 1) {
          // Single point
          const p = element.path[0]
          ctx.beginPath()
          ctx.arc(p.x, p.y, getLineWidth(element.thickness || 3) / 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // Draw smooth curves using quadratic curves
          ctx.beginPath()
          ctx.moveTo(element.path[0].x, element.path[0].y)
          
          for (let i = 1; i < element.path.length; i++) {
            const prevPoint = element.path[i - 1]
            const currentPoint = element.path[i]
            
            if (i === 1) {
              // First segment - straight line
              ctx.lineTo(currentPoint.x, currentPoint.y)
            } else {
              // Use quadratic curve for smooth transitions
              // Control point is the previous point
              ctx.quadraticCurveTo(
                prevPoint.x,
                prevPoint.y,
                currentPoint.x,
                currentPoint.y
              )
            }
          }
          ctx.stroke()
        }
      }
    })
    
    // Redraw current pencil path if it exists (for in-progress pencil drawing)
    if (currentPencilPathRef.current.length > 0 && activeMarkupTool === 'pencil') {
      applyMarkupSettings(ctx)
      
      if (currentPencilPathRef.current.length === 1) {
        // Single point
        const p = currentPencilPathRef.current[0]
        ctx.beginPath()
        ctx.arc(p.x, p.y, getLineWidth(markupThickness) / 2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Draw smooth curves using quadratic curves
        ctx.beginPath()
        const firstPoint = currentPencilPathRef.current[0]
        ctx.moveTo(firstPoint.x, firstPoint.y)
        
        for (let i = 1; i < currentPencilPathRef.current.length; i++) {
          const prevPoint = currentPencilPathRef.current[i - 1]
          const currentPoint = currentPencilPathRef.current[i]
          
          if (i === 1) {
            // First segment - straight line
            ctx.lineTo(currentPoint.x, currentPoint.y)
          } else {
            // Use quadratic curve for smooth transitions
            ctx.quadraticCurveTo(
              prevPoint.x,
              prevPoint.y,
              currentPoint.x,
              currentPoint.y
            )
          }
        }
        ctx.stroke()
      }
    }
  }
  
  const getCanvasCoordinates = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const container = containerRef.current
    if (!container) return null
    
    const rect = container.getBoundingClientRect()
    // Round to nearest pixel for crisp rendering
    return {
      x: Math.round(clientX - rect.left),
      y: Math.round(clientY - rect.top)
    }
  }
  
  const handleMarkupPointerDown = (event: React.PointerEvent) => {
    if (!markupMode || !activeMarkupTool) return
    
    const coords = getCanvasCoordinates(event.clientX, event.clientY)
    if (!coords) return
    
    isDrawingRef.current = true
    drawingStartRef.current = coords
    
    if (activeMarkupTool === 'text') {
      // For text, create input at click position
      createTextElement(coords.x, coords.y)
    } else if (activeMarkupTool === 'pencil') {
      // Initialize pencil path - store original coordinates for smooth drawing
      currentPencilPathRef.current = [coords]
      lastPencilPointRef.current = coords
      const ctx = getCanvasContext()
      if (ctx) {
        applyMarkupSettings(ctx)
        ctx.beginPath()
        ctx.moveTo(coords.x, coords.y)
      }
    }
  }
  
  const handleMarkupPointerMove = (event: React.PointerEvent) => {
    if (!markupMode || !activeMarkupTool || !isDrawingRef.current) return
    
    const coords = getCanvasCoordinates(event.clientX, event.clientY)
    if (!coords || !drawingStartRef.current) return
    
    const ctx = getCanvasContext()
    if (!ctx) return
    
    if (activeMarkupTool === 'pencil') {
      // Store original coordinates for smooth drawing
      currentPencilPathRef.current.push(coords)
      
      applyMarkupSettings(ctx)
      
      const lastPoint = lastPencilPointRef.current
      if (lastPoint) {
        // Use quadratic curve for smooth transitions between points
        // Control point is the previous point, creating smooth curves
        ctx.beginPath()
        ctx.moveTo(lastPoint.x, lastPoint.y)
        ctx.quadraticCurveTo(
          lastPoint.x,
          lastPoint.y,
          coords.x,
          coords.y
        )
        ctx.stroke()
      } else {
        // First point
        ctx.beginPath()
        ctx.moveTo(coords.x, coords.y)
        ctx.stroke()
      }
      
      lastPencilPointRef.current = coords
    } else if (activeMarkupTool === 'arrow' || activeMarkupTool === 'cloud') {
      // For arrow and cloud, redraw all saved elements and show preview
      redrawMarkupCanvas()
      
      // Draw preview with current settings
      applyMarkupSettings(ctx)
      if (activeMarkupTool === 'arrow') {
        drawArrow(ctx, drawingStartRef.current, coords)
      } else if (activeMarkupTool === 'cloud') {
        drawCloud(ctx, drawingStartRef.current, coords)
      }
    }
  }
  
  const handleMarkupPointerUp = (event: React.PointerEvent) => {
    if (!markupMode || !activeMarkupTool || !isDrawingRef.current) return
    
    const coords = getCanvasCoordinates(event.clientX, event.clientY)
    if (!coords || !drawingStartRef.current) return
    
    const ctx = getCanvasContext()
    if (!ctx) return
    
    if (activeMarkupTool === 'arrow' || activeMarkupTool === 'cloud') {
      // Redraw all saved elements first
      redrawMarkupCanvas()
      
      // Draw the final element and save it
      applyMarkupSettings(ctx)
      if (activeMarkupTool === 'arrow') {
        drawArrow(ctx, drawingStartRef.current, coords)
        markupElementsRef.current.push({
          type: 'arrow',
          data: { start: drawingStartRef.current, end: coords },
          id: `arrow-${Date.now()}`,
          color: markupColor,
          thickness: markupThickness
        })
      } else if (activeMarkupTool === 'cloud') {
        drawCloud(ctx, drawingStartRef.current, coords)
        markupElementsRef.current.push({
          type: 'cloud',
          data: { start: drawingStartRef.current, end: coords },
          id: `cloud-${Date.now()}`,
          color: markupColor,
          thickness: markupThickness
        })
      }
    } else if (activeMarkupTool === 'pencil') {
      // Pencil drawing is already drawn during move, save the path
      markupElementsRef.current.push({
        type: 'pencil',
        data: { start: drawingStartRef.current, end: coords },
        id: `pencil-${Date.now()}`,
        color: markupColor,
        thickness: markupThickness,
        path: [...currentPencilPathRef.current] // Store the complete path
      })
      // Clear current pencil path
      currentPencilPathRef.current = []
      lastPencilPointRef.current = null
    }
    
    isDrawingRef.current = false
    drawingStartRef.current = null
    lastPencilPointRef.current = null
  }
  
  const drawArrow = (ctx: CanvasRenderingContext2D, start: { x: number; y: number }, end: { x: number; y: number }, color?: string, thickness?: number) => {
    // Apply settings if provided, otherwise use current settings
    if (color && thickness !== undefined) {
      const colorHex = getColorHex(color as 'red' | 'black' | 'yellow' | 'green' | 'blue')
      const lineWidth = getLineWidth(thickness)
      ctx.strokeStyle = colorHex
      ctx.fillStyle = colorHex
      ctx.lineWidth = lineWidth
    }
    
    // Round coordinates for pixel-perfect rendering
    const startX = Math.round(start.x)
    const startY = Math.round(start.y)
    const endX = Math.round(end.x)
    const endY = Math.round(end.y)
    
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.lineTo(endX, endY)
    ctx.stroke()
    
    // Draw arrowhead
    const angle = Math.atan2(endY - startY, endX - startX)
    const arrowLength = 15
    const arrowAngle = Math.PI / 6
    
    ctx.beginPath()
    ctx.moveTo(endX, endY)
    const arrow1X = Math.round(endX - arrowLength * Math.cos(angle - arrowAngle))
    const arrow1Y = Math.round(endY - arrowLength * Math.sin(angle - arrowAngle))
    const arrow2X = Math.round(endX - arrowLength * Math.cos(angle + arrowAngle))
    const arrow2Y = Math.round(endY - arrowLength * Math.sin(angle + arrowAngle))
    
    ctx.lineTo(arrow1X, arrow1Y)
    ctx.moveTo(endX, endY)
    ctx.lineTo(arrow2X, arrow2Y)
    ctx.stroke()
  }
  
  const drawCloud = (ctx: CanvasRenderingContext2D, start: { x: number; y: number }, end: { x: number; y: number }, color?: string, thickness?: number) => {
    // Apply settings if provided, otherwise use current settings
    if (color && thickness !== undefined) {
      const colorHex = getColorHex(color as 'red' | 'black' | 'yellow' | 'green' | 'blue')
      const lineWidth = getLineWidth(thickness)
      ctx.strokeStyle = colorHex
      ctx.fillStyle = colorHex
      ctx.lineWidth = lineWidth
    }
    
    // Round coordinates for pixel-perfect rendering
    const minX = Math.round(Math.min(start.x, end.x))
    const maxX = Math.round(Math.max(start.x, end.x))
    const minY = Math.round(Math.min(start.y, end.y))
    const maxY = Math.round(Math.max(start.y, end.y))
    
    const width = Math.max(maxX - minX, 40) // Minimum width
    const height = Math.max(maxY - minY, 30) // Minimum height
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    
    // Draw revision cloud with scalloped/wavy border (technical drawing style)
    // This creates a series of semicircular arcs around the perimeter
    ctx.beginPath()
    
    // Calculate perimeter for even spacing of scallops
    const perimeter = 2 * (width + height)
    const scallopSize = 15 // Size of each scallop (arc radius)
    const numScallops = Math.max(8, Math.floor(perimeter / (scallopSize * 2)))
    
    // Create a rectangle path with scalloped edges
    const top = minY
    const bottom = maxY
    const left = minX
    const right = maxX
    
    // Calculate number of scallops per side
    const topScallops = Math.max(2, Math.floor(width / (scallopSize * 2)))
    const bottomScallops = Math.max(2, Math.floor(width / (scallopSize * 2)))
    const leftScallops = Math.max(2, Math.floor(height / (scallopSize * 2)))
    const rightScallops = Math.max(2, Math.floor(height / (scallopSize * 2)))
    
    // Start at top-left corner
    let currentX = left
    let currentY = top
    
    // Top edge - scallops pointing outward (up)
    ctx.moveTo(Math.round(currentX), Math.round(currentY))
    const topStep = width / topScallops
    for (let i = 0; i < topScallops; i++) {
      const scallopCenterX = Math.round(currentX + topStep / 2)
      const scallopCenterY = Math.round(top - scallopSize)
      ctx.arc(scallopCenterX, scallopCenterY, scallopSize, Math.PI, 0, false) // Arc pointing up
      currentX += topStep
    }
    ctx.lineTo(Math.round(right), Math.round(top))
    
    // Right edge - scallops pointing outward (right)
    currentY = top
    const rightStep = height / rightScallops
    for (let i = 0; i < rightScallops; i++) {
      const scallopCenterX = Math.round(right + scallopSize)
      const scallopCenterY = Math.round(currentY + rightStep / 2)
      ctx.arc(scallopCenterX, scallopCenterY, scallopSize, -Math.PI / 2, Math.PI / 2, false) // Arc pointing right
      currentY += rightStep
    }
    ctx.lineTo(Math.round(right), Math.round(bottom))
    
    // Bottom edge - scallops pointing outward (down)
    currentX = right
    const bottomStep = width / bottomScallops
    for (let i = 0; i < bottomScallops; i++) {
      const scallopCenterX = Math.round(currentX - bottomStep / 2)
      const scallopCenterY = Math.round(bottom + scallopSize)
      ctx.arc(scallopCenterX, scallopCenterY, scallopSize, 0, Math.PI, false) // Arc pointing down
      currentX -= bottomStep
    }
    ctx.lineTo(Math.round(left), Math.round(bottom))
    
    // Left edge - scallops pointing outward (left)
    currentY = bottom
    const leftStep = height / leftScallops
    for (let i = 0; i < leftScallops; i++) {
      const scallopCenterX = Math.round(left - scallopSize)
      const scallopCenterY = Math.round(currentY - leftStep / 2)
      ctx.arc(scallopCenterX, scallopCenterY, scallopSize, Math.PI / 2, -Math.PI / 2, false) // Arc pointing left
      currentY -= leftStep
    }
    ctx.closePath()
    ctx.stroke()
  }
  
  const createTextElement = (x: number, y: number) => {
    const container = markupContainerRef.current
    if (!container) return
    
    const textDiv = document.createElement('div')
    textDiv.style.position = 'absolute'
    textDiv.style.left = `${x}px`
    textDiv.style.top = `${y}px`
    textDiv.style.background = 'rgba(255, 255, 255, 0.9)'
    textDiv.style.border = '2px solid #ff0000'
    textDiv.style.padding = '8px'
    textDiv.style.borderRadius = '4px'
    textDiv.style.cursor = 'text'
    textDiv.style.minWidth = '200px'
    textDiv.style.zIndex = '1000'
    textDiv.style.display = 'inline-block'
    
    const textarea = document.createElement('textarea')
    textarea.placeholder = 'Enter text...'
    textarea.style.border = 'none'
    textarea.style.outline = 'none'
    textarea.style.background = 'transparent'
    textarea.style.width = '400px'
    textarea.style.fontSize = '20px'
    textarea.style.resize = 'none'
    textarea.style.overflow = 'hidden'
    textarea.style.fontFamily = 'inherit'
    textarea.style.lineHeight = '1.4'
    textarea.style.padding = '0'
    textarea.style.margin = '0'
    textarea.style.boxSizing = 'border-box'
    
    // Calculate single line height (fontSize * lineHeight)
    const singleLineHeight = 20 * 1.4 // 28px for 20px font with 1.4 line height
    
    // Set initial height to exactly one line
    textarea.style.height = `${singleLineHeight}px`
    textarea.style.minHeight = `${singleLineHeight}px`
    
    // Auto-resize function - only expand when text wraps
    const autoResize = () => {
      // Reset height to single line to get accurate scrollHeight
      textarea.style.height = `${singleLineHeight}px`
      const scrollHeight = textarea.scrollHeight
      
      // Only set new height if content actually requires more than one line
      if (scrollHeight > singleLineHeight) {
        textarea.style.height = `${scrollHeight}px`
      } else {
        textarea.style.height = `${singleLineHeight}px`
      }
    }
    
    // Auto-resize on input
    textarea.addEventListener('input', autoResize)
    
    // Also resize on paste
    textarea.addEventListener('paste', () => {
      setTimeout(autoResize, 0)
    })
    
    textDiv.appendChild(textarea)
    container.appendChild(textDiv)
    
    textarea.focus()
    
    const id = `text-${Date.now()}`
    textElementsRef.current.push({
      id,
      element: textDiv,
      x,
      y
    })
    
    markupElementsRef.current.push({
      type: 'text',
      data: { x, y, text: '' },
      id
    })
    
    // Update text on blur
    textarea.addEventListener('blur', () => {
      const textData = markupElementsRef.current.find(el => el.id === id)
      if (textData) {
        textData.data.text = textarea.value
      }
    })
    
    // Remove on double click
    textDiv.addEventListener('dblclick', () => {
      textDiv.remove()
      textElementsRef.current = textElementsRef.current.filter(el => el.id !== id)
      markupElementsRef.current = markupElementsRef.current.filter(el => el.id !== id)
    })
  }
  
  // Setup canvas on mount and resize
  useEffect(() => {
    if (markupMode) {
      setupMarkupCanvas()
      const handleResize = () => setupMarkupCanvas()
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [markupMode])
  
  // Fetch element data when context menu opens
  useEffect(() => {
    if (!contextMenu.visible || !filename) {
      setElementData({ loading: false, data: null, error: null })
      return
    }
    
    // In assembly mode, use assembly_id; otherwise use productId
    const elementId = selectionMode === 'assemblies' && contextMenu.assemblyId 
      ? contextMenu.assemblyId 
      : contextMenu.productId
    
    if (!elementId) {
      setElementData({ loading: false, data: null, error: null })
      return
    }
    
    const fetchElementData = async () => {
      setElementData({ loading: true, data: null, error: null })
      
      try {
        const encodedFilename = encodeURIComponent(filename)
        const url = `/api/element-full/${elementId}?filename=${encodedFilename}`
        console.log('[CONTEXT_MENU] Fetching full element data:', {
          filename,
          encodedFilename,
          elementId,
          mode: selectionMode,
          isAssembly: selectionMode === 'assemblies',
          url
        })
        
        const response = await fetch(url)
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error('[CONTEXT_MENU] API error response:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          })
          throw new Error(`Failed to fetch element data (${response.status}): ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('[CONTEXT_MENU] Received full element data:', data)
        setElementData({ loading: false, data, error: null })
      } catch (error) {
        console.error('[CONTEXT_MENU] Error fetching element data:', error)
        setElementData({ 
          loading: false, 
          data: null, 
          error: error instanceof Error ? error.message : 'Failed to fetch element data' 
        })
      }
    }
    
    fetchElementData()
  }, [contextMenu.visible, contextMenu.productId, contextMenu.assemblyId, filename, selectionMode])
  
  // Apply filter colors to meshes
  useEffect(() => {
    if (!modelRef.current || !filters) return

    const hasActiveFilters = 
      filters.profileTypes.size > 0 || 
      filters.plateThicknesses.size > 0 || 
      filters.assemblyMarks.size > 0

    if (!hasActiveFilters) {
      // No filters active - restore all meshes to original colors
      modelRef.current.traverse((child: any) => {
        if (child.isMesh) {
          // Only restore if we have a stored original material
          if (originalMaterialsRef.current.has(child)) {
            const originalMat = originalMaterialsRef.current.get(child)
            if (originalMat) {
              const mat = Array.isArray(originalMat) ? originalMat[0] : originalMat
              if (mat && typeof mat.clone === 'function') {
                const restoredMat = mat.clone()
                restoredMat.transparent = false
                restoredMat.opacity = 1.0
                child.material = restoredMat
              } else {
                child.material = originalMat
                const currentMat = Array.isArray(child.material) ? child.material[0] : child.material
                if (currentMat) {
                  currentMat.transparent = false
                  currentMat.opacity = 1.0
                }
              }
            }
            // Clear the stored original since we've restored it
            originalMaterialsRef.current.delete(child)
          } else {
            // If no original stored, just ensure current material is not transparent
            const currentMat = Array.isArray(child.material) ? child.material[0] : child.material
            if (currentMat && currentMat !== child.userData._filterGreyMaterial) {
              currentMat.transparent = false
              currentMat.opacity = 1.0
            }
          }
          // Remove filter grey material reference if it exists
          if (child.userData._filterGreyMaterial) {
            delete child.userData._filterGreyMaterial
          }
        }
      })
      return
    }

    // Filters are active - apply grey to non-matching meshes
    let debugCount = 0
    const debugTypes = new Set<string>()
    const debugMatches = { matched: 0, greyed: 0, noType: 0 }
    const sampleChecks: Array<{ type: string; matches: boolean; reason: string }> = []
    
    modelRef.current.traverse((child: any) => {
      if (child.isMesh) {
        // Get element type from multiple possible sources
        let elementType = child.userData?.type || child.userData?.element_type || ''
        
        // Also try to get from material name (some materials have element type in name)
        if (!elementType) {
          const material = Array.isArray(child.material) ? child.material[0] : child.material
          if (material?.name) {
            const matName = material.name.toString()
            // Check if material name contains IFC element type (e.g., "IfcBeam", "IfcColumn")
            const ifcTypeMatch = matName.match(/Ifc[A-Z][a-zA-Z]+/)
            if (ifcTypeMatch) {
              elementType = ifcTypeMatch[0]
              // Store it in userData for future use
              if (!child.userData) child.userData = {}
              child.userData.type = elementType
            }
          }
        }
        
        // Also try to parse from mesh name if available
        if (!elementType && child.name) {
          const parts = child.name.split('_')
          if (parts.length > 0 && parts[0].startsWith('Ifc')) {
            elementType = parts[0]
            // Store it in userData for future use
            if (!child.userData) child.userData = {}
            child.userData.type = elementType
          }
        }
        
        // Last resort: try to get from assembly mapping if available
        if (!elementType && modelRef.current?.userData?.assemblyMapping) {
          const mapping = modelRef.current.userData.assemblyMapping
          let productId: number | null = null
          
          if (child.userData?.product_id) {
            productId = child.userData.product_id
          } else if (child.userData?.expressID) {
            productId = child.userData.expressID
          } else if ((child as any).metadata?.product_id) {
            productId = (child as any).metadata.product_id
          }
          
          if (productId && mapping[productId]) {
            elementType = mapping[productId].element_type
            if (!child.userData) child.userData = {}
            child.userData.type = elementType
            child.userData.assembly_mark = mapping[productId].assembly_mark
            child.userData.product_id = productId
            // Store plate thickness if available (even if it's "N/A")
            if (mapping[productId].plate_thickness !== undefined && mapping[productId].plate_thickness !== null) {
              child.userData.plate_thickness = mapping[productId].plate_thickness
            }
            // Store profile_name if available (for beams, columns, members)
            const elementTypeFromMapping = mapping[productId].element_type
            if (elementTypeFromMapping === 'IfcBeam' || elementTypeFromMapping === 'IfcColumn' || elementTypeFromMapping === 'IfcMember') {
              if (mapping[productId].profile_name !== undefined && mapping[productId].profile_name !== null) {
                child.userData.profile_name = mapping[productId].profile_name
              } else {
                // Default to "N/A" if missing
                child.userData.profile_name = "N/A"
              }
            }
          }
        }
        
        // Debug: collect element types (collect from all meshes, but limit to unique types)
        if (elementType) {
          debugTypes.add(elementType)
        } else {
          debugMatches.noType++
        }
        debugCount++
        
        // Debug: Log element type and userData when filters are active
        if ((filters.profileTypes.size > 0 || filters.plateThicknesses.size > 0) && debugCount <= 20) {
          console.log(`[FILTER] Element ${debugCount}: productId=${child.userData?.product_id || 'unknown'}, elementType="${elementType || 'MISSING'}", userData.type="${child.userData?.type || 'missing'}", profile_name="${child.userData?.profile_name || 'missing'}", plate_thickness="${child.userData?.plate_thickness || 'missing'}", userData keys=[${Object.keys(child.userData || {}).join(',')}]`)
        }
        
        const assemblyMark = child.userData?.assembly_mark || ''
        
        // Check if mesh matches profile type filter
        // If profileTypes filter is active (size > 0), element must match one of the selected profile names
        // Filter now uses profile_name (e.g., "IPE600", "UPN100") instead of element_type
        let matchesProfileType = true
        if (filters.profileTypes.size > 0) {
          // Profile type filter is active - element must match one of the selected profile names
          const isProfileElement = elementType === 'IfcBeam' || elementType === 'IfcColumn' || elementType === 'IfcMember'
          
          if (isProfileElement) {
            // For profile elements, check if profile_name matches
            const profileName = (child.userData?.profile_name || '').trim()
            
            // Always log profile filtering for debugging - log ALL profile elements when filter is active
            console.log(`[FILTER] Profile element check: productId=${child.userData?.product_id || 'unknown'}, elementType=${elementType}, profile_name="${profileName}", userData keys=[${Object.keys(child.userData || {}).join(',')}], filter=[${Array.from(filters.profileTypes).join(',')}]`)
            
            if (profileName && profileName !== 'N/A') {
              // Check if profile_name matches any filter value (case-insensitive, trimmed)
              let matches = false
              for (const filterProfile of filters.profileTypes) {
                const normalizedFilter = filterProfile.trim()
                const normalizedProfile = profileName.trim()
                
                // Try exact match first
                if (normalizedFilter === normalizedProfile) {
                  matches = true
                  break
                }
                
                // Try case-insensitive match
                if (normalizedFilter.toLowerCase() === normalizedProfile.toLowerCase()) {
                  matches = true
                  break
                }
              }
              matchesProfileType = matches
              
              // Debug logging - always log when filter is active
              console.log(`[FILTER] Profile element ${child.userData?.product_id || 'unknown'}: profile_name="${profileName}", filter=[${Array.from(filters.profileTypes).join(',')}], matches=${matchesProfileType}`)
            } else {
              // If profile_name is not set or is "N/A", it doesn't match any filter
              matchesProfileType = false
              
              // Debug logging - always log when filter is active
              console.log(`[FILTER] Profile element ${child.userData?.product_id || 'unknown'}: profile_name missing or N/A (value="${profileName}"), elementType=${elementType}, userData keys=${Object.keys(child.userData || {}).join(',')}`)
            }
          } else {
            // For non-profile elements (plates, fasteners, etc.), they should be greyed out when profile filter is active
            // This way only matching profile elements stay visible
            matchesProfileType = false
          }
        }
        
        // Check if mesh matches assembly filter
        let matchesAssembly = true
        if (filters.assemblyMarks.size > 0) {
          // Assembly filter is active - element must match one of the selected assemblies
          // Normalize assembly mark (trim, case-insensitive comparison)
          const normalizedMark = (assemblyMark || '').trim()
          let matches = false
          if (normalizedMark && normalizedMark !== 'N/A' && normalizedMark !== 'null') {
            for (const filterMark of filters.assemblyMarks) {
              const normalizedFilter = (filterMark || '').trim()
              // Try exact match first
              if (normalizedFilter === normalizedMark) {
                matches = true
                break
              }
              // Try case-insensitive match
              if (normalizedFilter.toLowerCase() === normalizedMark.toLowerCase()) {
                matches = true
                break
              }
            }
          }
          matchesAssembly = matches
          
          // Debug logging for first few assembly filter checks
          if (debugCount < 10) {
            console.log(`[FILTER] Assembly check: mark="${assemblyMark || 'EMPTY'}" (normalized="${normalizedMark}"), filter=[${Array.from(filters.assemblyMarks).join(',')}], matches=${matchesAssembly}, productId=${child.userData?.product_id || 'unknown'}`)
          }
        }
        
        // For plate thickness filtering - check if this is a plate and if thickness matches
        const isPlate = elementType === 'IfcPlate'
        let matchesPlateThickness = true
        if (filters.plateThicknesses.size > 0) {
          // Plate thickness filter is active - log ALL plates, not just first 20
          if (isPlate) {
            // Get plate thickness from userData (set from assembly mapping)
            let plateThickness = (child.userData?.plate_thickness || '').toString().trim()
            
            // Always log plate filtering for debugging
            console.log(`[FILTER] Plate check: productId=${child.userData?.product_id || 'unknown'}, elementType=${elementType}, plate_thickness="${plateThickness}", userData keys=[${Object.keys(child.userData || {}).join(',')}], filter=[${Array.from(filters.plateThicknesses).join(',')}]`)
            
            // The filter contains values like "12mm", "20mm", "PL10", etc. from report.plates[].thickness_profile
            // The stored value from assembly mapping might be "12mm", "N/A", or empty
            
            if (plateThickness && plateThickness !== 'N/A' && plateThickness !== 'null' && plateThickness !== '') {
              // Try to match: check if plateThickness matches any filter value
              let matches = false
              for (const filterThickness of filters.plateThicknesses) {
                const filterThicknessStr = (filterThickness || '').toString().trim()
                
                // Normalize both values for comparison - remove "PL" prefix and "mm" suffix, trim whitespace
                const normalizedFilter = filterThicknessStr.replace(/^PL/i, '').replace(/mm$/i, '').trim()
                const normalizedPlate = plateThickness.replace(/^PL/i, '').replace(/mm$/i, '').trim()
                
                // Check if normalized numeric values match (e.g., "12" === "12")
                if (normalizedFilter === normalizedPlate && normalizedFilter !== '') {
                  matches = true
                  break
                }
                
                // Also check exact match (for cases like "PL10" vs "PL10")
                if (filterThicknessStr === plateThickness) {
                  matches = true
                  break
                }
                
                // Check if one contains the other (for cases like "12mm" contains "12")
                if (normalizedFilter !== '' && normalizedPlate !== '' && 
                    (plateThickness.includes(normalizedFilter) || filterThicknessStr.includes(normalizedPlate))) {
                  matches = true
                  break
                }
              }
              matchesPlateThickness = matches
              
              // Debug logging - always log when filter is active
              console.log(`[FILTER] Plate ${child.userData?.product_id || 'unknown'}: thickness='${plateThickness}', filter=[${Array.from(filters.plateThicknesses).join(',')}], matches=${matchesPlateThickness}`)
            } else {
              // No thickness info available or "N/A" - this plate doesn't match any filter (will be greyed out)
              matchesPlateThickness = false
              
              // Debug logging - always log when filter is active
              console.log(`[FILTER] Plate ${child.userData?.product_id || 'unknown'}: thickness missing or N/A (value="${plateThickness}"), userData keys=[${Object.keys(child.userData || {}).join(',')}]`)
            }
          } else {
            // Not a plate - when plate thickness filter is active, non-plates should be greyed out
            // This matches the behavior: only matching plates stay colored, everything else is greyed
            matchesPlateThickness = false
          }
        } else {
          // No plate thickness filter active - all elements pass this filter check
          matchesPlateThickness = true
        }
        
        // Element matches filter if ALL active filter categories match
        // If a filter category is empty (size === 0), it doesn't restrict matching
        const matchesFilter = matchesProfileType && matchesAssembly && matchesPlateThickness
        
        // Debug: Log first few plate filtering decisions
        if (isPlate && filters.plateThicknesses.size > 0 && debugCount < 5) {
          console.log(`[FILTER] Plate ${child.userData?.product_id || 'unknown'}: thickness='${child.userData?.plate_thickness || 'N/A'}', filter=[${Array.from(filters.plateThicknesses).join(',')}], matches=${matchesPlateThickness}, finalMatch=${matchesFilter}`)
        }
        
        // Debug tracking
        if (matchesFilter) {
          debugMatches.matched++
        } else {
          debugMatches.greyed++
        }
        
        // Sample debug info (first 5 non-matching elements)
        if (sampleChecks.length < 5 && !matchesFilter && elementType) {
          const reasons: string[] = []
          if (!matchesProfileType && filters.profileTypes.size > 0) {
            const filterTypes = Array.from(filters.profileTypes)
            reasons.push(`profileType:"${elementType}" (len:${elementType.length}) not in [${filterTypes.map(t => `"${t}"(len:${t.length})`).join(',')}]`)
            // Check character by character
            for (const filterType of filterTypes) {
              if (elementType === filterType) {
                reasons.push(`BUT EXACT MATCH FOUND: "${elementType}" === "${filterType}"`)
              } else {
                reasons.push(`COMPARISON: "${elementType}" !== "${filterType}" (char codes: ${Array.from(elementType as string).map((c: string) => c.charCodeAt(0)).join(',')} vs ${Array.from(filterType as string).map((c: string) => c.charCodeAt(0)).join(',')})`)
              }
            }
          }
          if (!matchesAssembly && filters.assemblyMarks.size > 0) reasons.push(`assembly:${assemblyMark} not in [${Array.from(filters.assemblyMarks).join(',')}]`)
          if (!matchesPlateThickness && filters.plateThicknesses.size > 0 && isPlate) reasons.push(`plateThickness:${child.userData?.plate_thickness || 'N/A'} not in [${Array.from(filters.plateThicknesses).join(',')}]`)
          sampleChecks.push({ type: elementType, matches: matchesFilter, reason: reasons.join('; ') || 'unknown' })
        }
        
        if (matchesFilter) {
          // Mesh matches filter - restore original color (full opacity, no transparency)
          // Store original material if not already stored (before we potentially modify it)
          if (!originalMaterialsRef.current.has(child)) {
            const currentMat = Array.isArray(child.material) ? child.material[0] : child.material
            if (currentMat) {
              // Only store if it's not already the grey filter material
              if (!child.userData._filterGreyMaterial || currentMat !== child.userData._filterGreyMaterial) {
                originalMaterialsRef.current.set(child, currentMat.clone ? currentMat.clone() : currentMat)
              }
            }
          }
          
          // Restore original material
          if (originalMaterialsRef.current.has(child)) {
            const originalMat = originalMaterialsRef.current.get(child)
            if (originalMat) {
              const mat = Array.isArray(originalMat) ? originalMat[0] : originalMat
              if (mat && typeof mat.clone === 'function') {
                const restoredMat = mat.clone()
                restoredMat.transparent = false
                restoredMat.opacity = 1.0
                child.material = restoredMat
              } else {
                // If clone doesn't work, use original but ensure it's not transparent
                child.material = originalMat
                const currentMat = Array.isArray(child.material) ? child.material[0] : child.material
                if (currentMat) {
                  currentMat.transparent = false
                  currentMat.opacity = 1.0
                }
              }
            }
          } else {
            // If we don't have original stored, ensure current material is not transparent
            const currentMat = Array.isArray(child.material) ? child.material[0] : child.material
            if (currentMat && currentMat !== child.userData._filterGreyMaterial) {
              currentMat.transparent = false
              currentMat.opacity = 1.0
            }
          }
        } else {
          // Mesh doesn't match filter - apply dark grey color (but keep geometry visible)
          // Store original material if not already stored
          if (!originalMaterialsRef.current.has(child)) {
            const currentMat = Array.isArray(child.material) ? child.material[0] : child.material
            if (currentMat && currentMat !== child.userData._filterGreyMaterial) {
              originalMaterialsRef.current.set(child, currentMat.clone ? currentMat.clone() : currentMat)
            }
          }
          
          // Create or reuse dark grey material with good visibility
          if (!child.userData._filterGreyMaterial) {
            const greyMat = new THREE.MeshStandardMaterial({
              color: 0x333333, // Dark grey color (darker than before)
              metalness: 0.1,
              roughness: 0.8,
              transparent: true,
              opacity: 0.65 // Higher opacity (65%) so geometry remains clearly visible
            })
            child.userData._filterGreyMaterial = greyMat
          }
          child.material = child.userData._filterGreyMaterial
        }
      }
    })
    
    // Debug logging (only log once per filter change)
    console.log('[FILTER] ===== Filter Application Debug =====')
    console.log('[FILTER] Element types found in model:', Array.from(debugTypes).sort())
    const profileTypesArray = Array.from(filters.profileTypes)
    const plateThicknessesArray = Array.from(filters.plateThicknesses)
    const assemblyMarksArray = Array.from(filters.assemblyMarks)
    console.log('[FILTER] Active filters:', {
      profileTypes: profileTypesArray,
      plateThicknesses: plateThicknessesArray,
      assemblyMarks: assemblyMarksArray
    })
    console.log('[FILTER] Filter value details:', {
      profileTypesValues: profileTypesArray.map(v => `"${v}" (length: ${v.length})`),
      plateThicknessesValues: plateThicknessesArray.map(v => `"${v}" (length: ${v.length})`),
      assemblyMarksValues: assemblyMarksArray.map(v => `"${v}" (length: ${v.length})`)
    })
    console.log('[FILTER] Results:', {
      matched: debugMatches.matched,
      greyed: debugMatches.greyed,
      noType: debugMatches.noType
    })
    if (sampleChecks.length > 0) {
      console.log('[FILTER] Sample non-matching elements:', sampleChecks)
      console.log('[FILTER] First non-matching element details:', sampleChecks[0])
    }
    console.log('[FILTER] ====================================')
  }, [filters])
  
  // Close context menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!contextMenu.visible) return
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Don't close if clicking on the context menu itself
      if (!target.closest('.fixed.z-50.bg-white')) {
        setContextMenu({ visible: false, x: 0, y: 0, element: null, productId: null, assemblyId: null })
        setElementData({ loading: false, data: null, error: null })
      }
    }
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu({ visible: false, x: 0, y: 0, element: null, productId: null, assemblyId: null })
        setElementData({ loading: false, data: null, error: null })
      }
    }
    
    // Use setTimeout to avoid immediate closure
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)
    
    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenu.visible])

  return (
    <div className="h-full flex flex-col">
      {selectedElement && (
        <div className="p-2 bg-gray-100 border-b text-sm text-gray-600">
          Selected: {selectedElement.type} (ID: {selectedElement.expressID})
        </div>
      )}
      <div ref={containerRef} className="flex-1 relative">
        {/* Context Menu */}
        {contextMenu.visible && (
          <>
            {/* Backdrop to close menu on click outside */}
            <div
              className="fixed inset-0 z-50"
              onClick={() => setContextMenu({ visible: false, x: 0, y: 0, element: null, productId: null, assemblyId: null })}
            />
            {/* Context Menu */}
            <div
              className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200/50 min-w-[400px] max-w-[600px] max-h-[700px] overflow-hidden backdrop-blur-sm flex flex-col"
              style={{
                left: `${Math.min(contextMenu.x, window.innerWidth - 420)}px`,
                top: `${Math.min(contextMenu.y, window.innerHeight - 200)}px`,
                transform: 'translate(-10px, -10px)',
                animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with gradient */}
              <div className="bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 px-5 py-3.5 border-b border-blue-800/30">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/80"></div>
                  <h3 className="text-white font-semibold text-sm tracking-wide uppercase">Part Info</h3>
                </div>
              </div>
              
              {/* Content */}
              <div className="p-5 max-h-[600px] overflow-y-auto">
                {elementData.loading ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm">Loading...</span>
                  </div>
                ) : elementData.error ? (
                  <div className="text-red-500 text-sm">
                    Error: {elementData.error}
                  </div>
                ) : elementData.data ? (
                  <div className="space-y-4">
                    {selectionMode === 'parts' ? (
                      <>
                        {/* 1. Basic Attributes - Parts Mode */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide border-b pb-1">Basic Attributes</h4>
                          <div className="space-y-2">
                            {/* Name */}
                            {elementData.data.basic_attributes?.Name && (
                              <div className="flex items-start gap-2 text-xs">
                                <span className="text-gray-500 font-medium min-w-[120px]">Name:</span>
                                <span className="text-gray-900 break-words">{String(elementData.data.basic_attributes.Name)}</span>
                              </div>
                            )}
                            {/* Description */}
                            {elementData.data.basic_attributes?.Description && (
                              <div className="flex items-start gap-2 text-xs">
                                <span className="text-gray-500 font-medium min-w-[120px]">Description:</span>
                                <span className="text-gray-900 break-words">{String(elementData.data.basic_attributes.Description)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Assembly Mode - Show all assembly data */}
                        {/* 1. Basic Attributes - Assembly Mode */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide border-b pb-1">Basic Attributes</h4>
                          <div className="space-y-2">
                            {/* Name */}
                            {elementData.data.basic_attributes?.Name && (
                              <div className="flex items-start gap-2 text-xs">
                                <span className="text-gray-500 font-medium min-w-[120px]">Name:</span>
                                <span className="text-gray-900 break-words">{String(elementData.data.basic_attributes.Name)}</span>
                              </div>
                            )}
                            {/* Tag */}
                            {elementData.data.basic_attributes?.Tag && (
                              <div className="flex items-start gap-2 text-xs">
                                <span className="text-gray-500 font-medium min-w-[120px]">Tag:</span>
                                <span className="text-gray-900 break-words">{String(elementData.data.basic_attributes.Tag)}</span>
                              </div>
                            )}
                            {/* Description */}
                            {elementData.data.basic_attributes?.Description && (
                              <div className="flex items-start gap-2 text-xs">
                                <span className="text-gray-500 font-medium min-w-[120px]">Description:</span>
                                <span className="text-gray-900 break-words">{String(elementData.data.basic_attributes.Description)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Assembly Parts */}
                        {elementData.data.relationships?.parts && elementData.data.relationships.parts.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide border-b pb-1">Parts ({elementData.data.relationships.parts.length})</h4>
                            <div className="space-y-1 max-h-[200px] overflow-y-auto">
                              {elementData.data.relationships.parts.map((part: any, idx: number) => (
                                <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                                  <div className="font-medium text-gray-700">{part.type}</div>
                                  {part.tag && <div className="text-gray-600">Tag: {part.tag}</div>}
                                  {part.name && <div className="text-gray-600">Name: {part.name}</div>}
                                  <div className="text-gray-500">ID: {part.id}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* 2. Property Sets */}
                    {selectionMode === 'parts' ? (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide border-b pb-1">Property Sets</h4>
                        <div className="space-y-2">
                          {/* Helper function to find value across all property sets */}
                          {(() => {
                            const findPropertyValue = (keyName: string): string | null => {
                              if (!elementData.data || !elementData.data.property_sets) return null
                              
                              // Search through all property sets (case-insensitive)
                              for (const [_psetName, props] of Object.entries(elementData.data.property_sets)) {
                                const propsObj = props as Record<string, any>
                                // Try exact match first
                                if (propsObj[keyName] !== undefined && propsObj[keyName] !== null) {
                                  return String(propsObj[keyName])
                                }
                                // Try case-insensitive match
                                const foundKey = Object.keys(propsObj).find(
                                  k => k.toLowerCase() === keyName.toLowerCase()
                                )
                                if (foundKey && propsObj[foundKey] !== undefined && propsObj[foundKey] !== null) {
                                  return String(propsObj[foundKey])
                                }
                              }
                              return null
                            }

                            return (
                              <>
                                {/* Bottom elevation */}
                                {findPropertyValue('Bottom elevation') && (
                                  <div className="flex items-start gap-2 text-xs">
                                    <span className="text-gray-500 font-medium min-w-[120px]">Bottom elevation:</span>
                                    <span className="text-gray-900 break-words">{findPropertyValue('Bottom elevation')} <span className="text-gray-400">m</span></span>
                                  </div>
                                )}
                                {/* Top elevation */}
                                {findPropertyValue('Top elevation') && (
                                  <div className="flex items-start gap-2 text-xs">
                                    <span className="text-gray-500 font-medium min-w-[120px]">Top elevation:</span>
                                    <span className="text-gray-900 break-words">{findPropertyValue('Top elevation')} <span className="text-gray-400">m</span></span>
                                  </div>
                                )}
                                {/* Phase */}
                                {findPropertyValue('Phase') && (
                                  <div className="flex items-start gap-2 text-xs">
                                    <span className="text-gray-500 font-medium min-w-[120px]">Phase:</span>
                                    <span className="text-gray-900 break-words">{findPropertyValue('Phase')}</span>
                                  </div>
                                )}
                                {/* Weight */}
                                {findPropertyValue('Weight') && (
                                  <div className="flex items-start gap-2 text-xs">
                                    <span className="text-gray-500 font-medium min-w-[120px]">Weight:</span>
                                    <span className="text-gray-900 break-words">{findPropertyValue('Weight')} <span className="text-gray-400">kg</span></span>
                                  </div>
                                )}
                                {/* Height */}
                                {findPropertyValue('Height') && (
                                  <div className="flex items-start gap-2 text-xs">
                                    <span className="text-gray-500 font-medium min-w-[120px]">Height:</span>
                                    <span className="text-gray-900 break-words">{findPropertyValue('Height')} <span className="text-gray-400">mm</span></span>
                                  </div>
                                )}
                                {/* Width */}
                                {findPropertyValue('Width') && (
                                  <div className="flex items-start gap-2 text-xs">
                                    <span className="text-gray-500 font-medium min-w-[120px]">Width:</span>
                                    <span className="text-gray-900 break-words">{findPropertyValue('Width')} <span className="text-gray-400">mm</span></span>
                                  </div>
                                )}
                                {/* Length */}
                                {findPropertyValue('Length') && (
                                  <div className="flex items-start gap-2 text-xs">
                                    <span className="text-gray-500 font-medium min-w-[120px]">Length:</span>
                                    <span className="text-gray-900 break-words">{findPropertyValue('Length')} <span className="text-gray-400">mm</span></span>
                                  </div>
                                )}
                                {/* Reference */}
                                {findPropertyValue('Reference') && (
                                  <div className="flex items-start gap-2 text-xs">
                                    <span className="text-gray-500 font-medium min-w-[120px]">Reference:</span>
                                    <span className="text-gray-900 break-words">{findPropertyValue('Reference')}</span>
                                  </div>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    ) : (
                      /* Assembly Mode - Show all property sets */
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide border-b pb-1">Property Sets</h4>
                        {Object.keys(elementData.data.property_sets || {}).length > 0 ? (
                          Object.entries(elementData.data.property_sets).map(([psetName, props]) => (
                            <div key={psetName} className="space-y-1.5 bg-gray-50 p-2 rounded">
                              <div className="text-xs font-semibold text-blue-600">{psetName}</div>
                              <div className="space-y-1">
                                {Object.entries(props as Record<string, any>).map(([key, value]) => (
                                  <div key={key} className="flex items-start gap-2 text-xs pl-2">
                                    <span className="text-gray-600 font-medium min-w-[100px] break-words">{key}:</span>
                                    <span className="text-gray-900 break-words">{String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-xs italic">No property sets available</div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm italic">
                    No data available
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        
        {/* Markup canvas overlay */}
        {markupMode && (
          <div 
            ref={markupContainerRef}
            className="absolute inset-0 pointer-events-none z-10"
            style={{ pointerEvents: activeMarkupTool ? 'auto' : 'none' }}
          >
            <canvas
              ref={markupCanvasRef}
              className="absolute inset-0"
              onPointerDown={handleMarkupPointerDown}
              onPointerMove={handleMarkupPointerMove}
              onPointerUp={handleMarkupPointerUp}
              style={{ cursor: activeMarkupTool === 'pencil' ? 'crosshair' : activeMarkupTool === 'arrow' ? 'crosshair' : activeMarkupTool === 'cloud' ? 'crosshair' : 'default' }}
            />
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-90 z-10">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md text-center">
              <h3 className="text-lg font-semibold text-red-600 mb-2">Error Loading Model</h3>
              <p className="text-gray-700 mb-4">{loadError}</p>
              <p className="text-sm text-gray-500">Please try uploading the file again.</p>
            </div>
          </div>
        )}
        {(isLoading || conversionStatus) && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-90 z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-700">{conversionStatus || 'Loading 3D model...'}</p>
            </div>
          </div>
        )}
        
        {/* Floating control panel at the bottom */}
        {modelRef.current && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
            <div className="bg-white rounded-lg shadow-lg border border-gray-300 p-3 flex gap-2">
              {/* Parts and Assemblies mode buttons */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  selectionModeRef.current = 'parts'
                  setSelectionMode('parts')
                }}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  selectionMode === 'parts'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                title="Select individual parts"
              >
                Parts
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  selectionModeRef.current = 'assemblies'
                  setSelectionMode('assemblies')
                }}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  selectionMode === 'assemblies'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                title="Select assemblies"
              >
                Assemblies
              </button>
              
              {/* Measurement button - only show if feature is enabled */}
              {enableMeasurement && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    const newMode = !measurementModeRef.current
                    console.log('[MEASUREMENT] Button clicked, setting mode to:', newMode)
                    // Update ref immediately so event handlers can use it
                    measurementModeRef.current = newMode
                    setMeasurementMode(newMode)
                    if (!newMode) {
                      // Clear only the in-progress measurement, not completed ones
                      console.log('[MEASUREMENT] Clearing in-progress measurement')
                      clearMeasurement()
                      // Reset cursor
                      if (containerRef.current) {
                        containerRef.current.style.cursor = 'default'
                      }
                    }
                  }}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                    measurementMode
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-500 text-white hover:bg-gray-600'
                  }`}
                  title="Measure distance between two points"
                >
                  📏 Measure
                </button>
              )}
              {enableMeasurement && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    console.log('[MEASUREMENT] Clear all measurements button clicked')
                    clearAllMeasurements()
                  }}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm font-medium transition-colors"
                  title="Clear all measurements"
                >
                  🗑️ Clear Measurements
                </button>
              )}
              
              {/* Clipping controls */}
              {enableClipping && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      console.log('[CLIPPING] Toggle clipping mode')
                      handleToggleClipping()
                    }}
                    className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                      clippingMode
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-500 text-white hover:bg-gray-600'
                    }`}
                    title="Enable/disable clipping planes"
                  >
                    ✂️ Clip
                  </button>
                  
                  {clippingMode && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-1">
                        {(['top', 'bottom', 'left', 'right', 'front', 'back'] as ClipPlaneKey[]).map(planeKey => (
                          <button
                            key={planeKey}
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              console.log('[CLIPPING] Select plane', planeKey)
                              handleSelectClipPlane(planeKey)
                            }}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                              activeClipPlane === planeKey
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-gray-700 hover:bg-gray-200'
                            }`}
                            title={`Clip from ${planeKey}`}
                          >
                            {planeKey.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs text-gray-700">
                        <span>Depth</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(clipAmount * 100)}
                          onChange={(e) => handleClipSliderChange(parseInt(e.target.value, 10) / 100)}
                          className="w-32"
                        />
                        <span className="w-12 text-right">{Math.round(clipAmount * 100)}%</span>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {/* Markup button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  handleToggleMarkup()
                }}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  markupMode
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-500 text-white hover:bg-gray-600'
                }`}
                title="Markup - capture screenshot"
              >
                📸 MarkUp
              </button>
              
              {markupMode && (
                <>
                  {/* Markup Tools */}
                  <div className="flex gap-1 border-r pr-2 mr-2 border-gray-300">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setActiveMarkupTool(activeMarkupTool === 'pencil' ? null : 'pencil')
                      }}
                      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                        activeMarkupTool === 'pencil'
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                      title="Draw freehand"
                    >
                      ✏️ Pencil
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setActiveMarkupTool(activeMarkupTool === 'arrow' ? null : 'arrow')
                      }}
                      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                        activeMarkupTool === 'arrow'
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                      title="Draw arrow"
                    >
                      ➡️ Arrow
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setActiveMarkupTool(activeMarkupTool === 'cloud' ? null : 'cloud')
                      }}
                      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                        activeMarkupTool === 'cloud'
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                      title="Draw cloud shape"
                    >
                      ☁️ Cloud
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setActiveMarkupTool(activeMarkupTool === 'text' ? null : 'text')
                      }}
                      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                        activeMarkupTool === 'text'
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                      title="Add text"
                    >
                      📝 Text
                    </button>
                  </div>
                  
                  {/* Clear Markup button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      clearAllMarkups()
                    }}
                    className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm font-medium transition-colors"
                    title="Clear all markups from the view"
                  >
                    🗑️ Clear
                  </button>
                  
                  {/* Markup Settings Panel - shows when pencil, arrow, or cloud is selected */}
                  {(activeMarkupTool === 'pencil' || activeMarkupTool === 'arrow' || activeMarkupTool === 'cloud') && (
                    <div className="flex gap-2 items-center border-r pr-2 mr-2 border-gray-300 bg-gray-50 px-3 py-2 rounded">
                      {/* Color Selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">Color:</span>
                        <div className="flex gap-1">
                          {(['red', 'black', 'yellow', 'green', 'blue'] as const).map((color) => (
                            <button
                              key={color}
                              onClick={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                                setMarkupColor(color)
                              }}
                              className={`w-6 h-6 rounded border-2 transition-all ${
                                markupColor === color
                                  ? 'border-gray-800 scale-110'
                                  : 'border-gray-300 hover:border-gray-500'
                              }`}
                              style={{
                                backgroundColor: getColorHex(color),
                                boxShadow: markupColor === color ? '0 0 0 2px rgba(0,0,0,0.1)' : 'none'
                              }}
                              title={color.charAt(0).toUpperCase() + color.slice(1)}
                            />
                          ))}
                        </div>
                      </div>
                      
                      {/* Thickness Selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">Thickness:</span>
                        <div className="flex gap-1 items-center">
                          {[1, 2, 3, 4, 5].map((level) => {
                            const width = getLineWidth(level)
                            return (
                              <button
                                key={level}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  e.preventDefault()
                                  setMarkupThickness(level)
                                }}
                                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                                  markupThickness === level
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                                title={`Level ${level} (${width}px)`}
                              >
                                <div
                                  className="mx-auto"
                                  style={{
                                    width: `${width * 2}px`,
                                    height: '2px',
                                    backgroundColor: markupThickness === level ? 'white' : '#666',
                                    borderRadius: '1px'
                                  }}
                                />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {/* Save/Copy Screenshot buttons - always available */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  handleSaveScreenshot()
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-medium transition-colors"
                title="Save screenshot as PNG"
              >
                💾 Save
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  handleCopyScreenshot()
                }}
                className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm font-medium transition-colors"
                title="Copy screenshot to clipboard"
              >
                📋 Copy
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const productIds = [...selectedProductIdsRef.current]
                  console.log('[BUTTON] Transparent clicked, current selection:', {
                    productIds: JSON.stringify(productIds),
                    productIdsArray: productIds,
                    meshes: selectedMeshesRef.current.length,
                    meshNames: selectedMeshesRef.current.map(m => m.name)
                  })
                  handleTransparent()
                }}
                disabled={selectedMeshesRef.current.length === 0}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                title="Make selected element(s) transparent"
              >
                Transparent
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const productIds = [...selectedProductIdsRef.current]
                  console.log('[BUTTON] Hide clicked, current selection:', {
                    productIds: JSON.stringify(productIds),
                    productIdsArray: productIds,
                    meshes: selectedMeshesRef.current.length,
                    meshNames: selectedMeshesRef.current.map(m => m.name)
                  })
                  handleHide()
                }}
                disabled={selectedMeshesRef.current.length === 0}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                title="Hide selected element(s)"
              >
                Hide
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const productIds = [...selectedProductIdsRef.current]
                  console.log('[BUTTON] Hide All Except clicked, current selection:', {
                    productIds: JSON.stringify(productIds),
                    productIdsArray: productIds,
                    meshes: selectedMeshesRef.current.length,
                    meshNames: selectedMeshesRef.current.map(m => m.name)
                  })
                  handleHideAllExcept()
                }}
                disabled={selectedMeshesRef.current.length === 0}
                className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                title="Hide all elements except selected"
              >
                Hide All Except
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  console.log('[BUTTON] Show All clicked')
                  handleShowAll()
                }}
                className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm font-medium transition-colors"
                title="Show all elements and reset all states"
              >
                Show All
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
