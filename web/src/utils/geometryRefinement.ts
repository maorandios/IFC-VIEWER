/**
 * Geometry Refinement Service
 * 
 * Provides selective visual refinement of IFC elements by replacing inaccurate
 * web-ifc geometry with high-quality server-side geometry for critical elements.
 */

import * as THREE from 'three'

export interface RefinementConfig {
  filename: string
  // Element types that need refinement (e.g., 'IfcPlate', custom rules)
  refinementRules: RefinementRule[]
}

export interface RefinementRule {
  // Function to determine if an element needs refinement
  shouldRefine: (elementType: string, elementId: number, properties?: any) => boolean
  // Priority (higher = refine first)
  priority: number
}

export interface RefinedGeometry {
  elementId: number
  elementType: string
  elementName: string
  elementTag: string
  vertices: Float32Array
  indices: Uint32Array
  vertexCount: number
  faceCount: number
}

export interface MeshRefinementResult {
  elementId: number
  oldMesh: THREE.Mesh
  newMesh: THREE.Mesh
  success: boolean
}

/**
 * Default refinement rules for common problematic element types
 */
export const DEFAULT_REFINEMENT_RULES: RefinementRule[] = [
  {
    // IfcPlate - plates often have missing cuts and holes
    shouldRefine: (elementType: string) => elementType === 'IFCPLATE',
    priority: 100
  },
  {
    // IfcMember with complex cuts (detected by keywords in name/tag)
    shouldRefine: (elementType: string, _elementId: number, properties?: any) => {
      if (elementType !== 'IFCMEMBER') return false
      
      const name = properties?.name?.toLowerCase() || ''
      const tag = properties?.tag?.toLowerCase() || ''
      const text = name + ' ' + tag
      
      // Look for keywords indicating complex cut parts
      const complexKeywords = ['cut', 'notch', 'cope', 'chamfer', 'bevel', 'slot']
      return complexKeywords.some(keyword => text.includes(keyword))
    },
    priority: 80
  }
]

/**
 * GeometryRefinementService
 * 
 * Manages the process of identifying, fetching, and replacing geometry
 * for elements that need visual refinement.
 */
export class GeometryRefinementService {
  private filename: string
  private refinementRules: RefinementRule[]
  private refinedElements: Set<number> = new Set()
  private batchSize: number = 20 // Fetch geometry for N elements at a time
  
  constructor(config: RefinementConfig) {
    this.filename = config.filename
    this.refinementRules = config.refinementRules.sort((a, b) => b.priority - a.priority)
  }
  
  /**
   * Analyze scene and identify elements that need refinement
   */
  identifyElementsNeedingRefinement(
    meshes: THREE.Mesh[],
    meshToExpressIdMap: Map<THREE.Mesh, number>,
    ifcApi: any,
    modelId: number
  ): number[] {
    const elementsToRefine: Array<{ id: number; priority: number }> = []
    
    for (const mesh of meshes) {
      const expressId = meshToExpressIdMap.get(mesh)
      if (!expressId || this.refinedElements.has(expressId)) continue
      
      try {
        // Get element properties from IFC API
        const properties = ifcApi.GetLine(modelId, expressId)
        if (!properties) continue
        
        // Element type is stored in constructor.name for web-ifc
        const elementType = (properties.constructor?.name || '').toUpperCase()
        if (!elementType) continue
        
        // Check against refinement rules
        for (const rule of this.refinementRules) {
          if (rule.shouldRefine(elementType, expressId, properties)) {
            elementsToRefine.push({
              id: expressId,
              priority: rule.priority
            })
            break // Only apply first matching rule
          }
        }
      } catch (error) {
        console.warn(`Failed to check refinement for element ${expressId}:`, error)
      }
    }
    
    // Sort by priority and return IDs
    return elementsToRefine
      .sort((a, b) => b.priority - a.priority)
      .map(item => item.id)
  }
  
  /**
   * Fetch refined geometry from server in batches
   */
  async fetchRefinedGeometry(elementIds: number[]): Promise<RefinedGeometry[]> {
    if (elementIds.length === 0) return []
    
    const geometries: RefinedGeometry[] = []
    
    // Process in batches to avoid overwhelming the server
    for (let i = 0; i < elementIds.length; i += this.batchSize) {
      const batch = elementIds.slice(i, i + this.batchSize)
      
      try {
        const response = await fetch(`/api/refined-geometry/${encodeURIComponent(this.filename)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ element_ids: batch })
        })
        
        if (!response.ok) {
          console.error(`Failed to fetch refined geometry for batch ${i}-${i + batch.length}:`, response.status)
          continue
        }
        
        const data = await response.json()
        
        // Decode base64 geometry data
        for (const geom of data.geometries || []) {
          try {
            const vertices = this.decodeBase64ToFloat32Array(geom.vertices)
            const indices = this.decodeBase64ToUint32Array(geom.indices)
            
            geometries.push({
              elementId: geom.element_id,
              elementType: geom.element_type,
              elementName: geom.element_name || '',
              elementTag: geom.element_tag || '',
              vertices,
              indices,
              vertexCount: geom.vertex_count,
              faceCount: geom.face_count
            })
            
            this.refinedElements.add(geom.element_id)
          } catch (decodeError) {
            console.error(`Failed to decode geometry for element ${geom.element_id}:`, decodeError)
          }
        }
        
        console.log(`[Refinement] Fetched ${geometries.length}/${elementIds.length} refined geometries`)
        
      } catch (error) {
        console.error(`Failed to fetch refined geometry batch:`, error)
      }
    }
    
    return geometries
  }
  
  /**
   * Replace mesh geometry with refined version while preserving state
   */
  replaceMeshGeometry(
    oldMesh: THREE.Mesh,
    refinedGeom: RefinedGeometry,
    scene: THREE.Scene
  ): MeshRefinementResult {
    try {
      // Create new buffer geometry from refined data
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(refinedGeom.vertices, 3))
      geometry.setIndex(new THREE.BufferAttribute(refinedGeom.indices, 1))
      geometry.computeVertexNormals() // Compute normals for proper lighting
      
      // Preserve material from old mesh
      const material = oldMesh.material
      
      // Create new mesh with refined geometry
      const newMesh = new THREE.Mesh(geometry, material)
      
      // CRITICAL: Refined vertices are already in WORLD coordinates from the backend
      // The backend uses USE_WORLD_COORDS=True in IfcOpenShell
      // 
      // When we add this mesh to a parent group, Three.js will compute:
      //   matrixWorld = parentMatrixWorld × localMatrix
      //
      // Since our vertices are in world coords, we need:
      //   matrixWorld = identity (no transformation)
      //
      // Therefore, we need:
      //   localMatrix = inverse(parentMatrixWorld)
      //
      // This way: parentMatrixWorld × inverse(parentMatrixWorld) = identity
      
      if (oldMesh.parent) {
        // Update parent's world matrix to get current transformation
        oldMesh.parent.updateMatrixWorld(true)
        
        // Get inverse of parent's world matrix
        const parentWorldMatrixInv = new THREE.Matrix4().copy(oldMesh.parent.matrixWorld).invert()
        
        // Apply inverse parent transform to mesh's local matrix
        newMesh.matrix.copy(parentWorldMatrixInv)
        newMesh.matrixAutoUpdate = false
        
        // Decompose matrix into position, rotation, scale for proper rendering
        newMesh.position.setFromMatrixPosition(newMesh.matrix)
        newMesh.rotation.setFromRotationMatrix(newMesh.matrix)
        newMesh.scale.setFromMatrixScale(newMesh.matrix)
      } else {
        // No parent - use identity (vertices already in world coords)
        newMesh.position.set(0, 0, 0)
        newMesh.rotation.set(0, 0, 0)
        newMesh.scale.set(1, 1, 1)
        newMesh.matrixAutoUpdate = false
        newMesh.matrix.identity()
      }
      
      // Preserve custom properties
      newMesh.userData = { ...oldMesh.userData, refined: true }
      newMesh.name = oldMesh.name
      newMesh.visible = oldMesh.visible
      newMesh.renderOrder = oldMesh.renderOrder
      newMesh.castShadow = oldMesh.castShadow
      newMesh.receiveShadow = oldMesh.receiveShadow
      
      // Replace old mesh with new refined mesh in parent's children array
      if (oldMesh.parent) {
        const index = oldMesh.parent.children.indexOf(oldMesh)
        if (index >= 0) {
          oldMesh.parent.children.splice(index, 1, newMesh)
          newMesh.parent = oldMesh.parent
        } else {
          oldMesh.parent.remove(oldMesh)
          oldMesh.parent.add(newMesh)
        }
      } else {
        scene.add(newMesh)
      }
      
      // Dispose old geometry (but keep material for reuse)
      oldMesh.geometry.dispose()
      
      console.log(`[Refinement] Replaced mesh for element ${refinedGeom.elementId} (${refinedGeom.elementType})`)
      
      return {
        elementId: refinedGeom.elementId,
        oldMesh,
        newMesh,
        success: true
      }
    } catch (error) {
      console.error(`Failed to replace mesh geometry for element ${refinedGeom.elementId}:`, error)
      return {
        elementId: refinedGeom.elementId,
        oldMesh,
        newMesh: oldMesh,
        success: false
      }
    }
  }
  
  /**
   * Perform complete refinement process
   */
  async refineGeometry(
    meshes: THREE.Mesh[],
    meshToExpressIdMap: Map<THREE.Mesh, number>,
    expressIdToMeshesMap: Map<number, THREE.Mesh[]>,
    ifcApi: any,
    modelId: number,
    scene: THREE.Scene,
    onProgress?: (current: number, total: number) => void
  ): Promise<MeshRefinementResult[]> {
    // Step 1: Identify elements needing refinement
    const elementIds = this.identifyElementsNeedingRefinement(
      meshes,
      meshToExpressIdMap,
      ifcApi,
      modelId
    )
    
    if (elementIds.length === 0) {
      console.log('[Refinement] No elements need refinement')
      return []
    }
    
    console.log(`[Refinement] Identified ${elementIds.length} elements for refinement`)
    
    // Step 2: Fetch refined geometry from server
    const refinedGeometries = await this.fetchRefinedGeometry(elementIds)
    
    if (refinedGeometries.length === 0) {
      console.warn('[Refinement] No refined geometries received from server')
      return []
    }
    
    // Step 3: Replace meshes with refined geometry
    const results: MeshRefinementResult[] = []
    
    for (let i = 0; i < refinedGeometries.length; i++) {
      const refinedGeom = refinedGeometries[i]
      const meshesToReplace = expressIdToMeshesMap.get(refinedGeom.elementId) || []
      
      for (const mesh of meshesToReplace) {
        const result = this.replaceMeshGeometry(mesh, refinedGeom, scene)
        results.push(result)
        
        // Update mapping with new mesh
        if (result.success) {
          meshToExpressIdMap.delete(result.oldMesh)
          meshToExpressIdMap.set(result.newMesh, refinedGeom.elementId)
          
          const meshList = expressIdToMeshesMap.get(refinedGeom.elementId) || []
          const oldIndex = meshList.indexOf(result.oldMesh)
          if (oldIndex >= 0) {
            meshList[oldIndex] = result.newMesh
          }
        }
      }
      
      if (onProgress) {
        onProgress(i + 1, refinedGeometries.length)
      }
    }
    
    const successCount = results.filter(r => r.success).length
    console.log(`[Refinement] Successfully refined ${successCount}/${results.length} meshes`)
    
    return results
  }
  
  // Helper methods for base64 decoding
  private decodeBase64ToFloat32Array(base64: string): Float32Array {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return new Float32Array(bytes.buffer)
  }
  
  private decodeBase64ToUint32Array(base64: string): Uint32Array {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return new Uint32Array(bytes.buffer)
  }
}

