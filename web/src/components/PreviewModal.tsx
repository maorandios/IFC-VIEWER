import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  filename: string;
  elementIds: number[];
  title: string;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  isOpen,
  onClose,
  filename,
  elementIds,
  title
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      10000
    );
    camera.position.set(50, 50, 50);
    cameraRef.current = camera;

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(100, 100, 100);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-100, -100, -100);
    scene.add(directionalLight2);

    // Load model
    const loader = new GLTFLoader();
    const modelPath = `/api/gltf/${filename.replace('.ifc', '.glb')}`;

    setLoading(true);
    setError(null);

    loader.load(
      modelPath,
      (gltf) => {
        console.log('Model loaded for preview:', gltf);
        
        // Add model to scene
        scene.add(gltf.scene);

        // First, populate userData from metadata if needed (same as IFCViewer)
        let meshCount = 0;
        let meshesWithProductId = 0;
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            meshCount++;
            if (!child.userData) child.userData = {};
            
            // Debug: log first few meshes
            if (meshCount <= 3) {
              console.log(`[Preview] Mesh ${meshCount}:`, {
                name: child.name,
                metadata: (child as any).metadata,
                userData: child.userData
              });
            }
            
            // Try to get product_id from various sources
            if ((child as any).metadata?.product_id) {
              child.userData.product_id = (child as any).metadata.product_id;
              child.userData.assembly_mark = (child as any).metadata.assembly_mark;
              child.userData.type = (child as any).metadata.element_type;
              meshesWithProductId++;
            } else if (child.name) {
              // Try to parse from name (format: "elementType_productID_assemblyMark")
              const parts = child.name.split('_');
              if (parts.length >= 2) {
                const parsedId = parseInt(parts[1]);
                if (!isNaN(parsedId)) {
                  child.userData.product_id = parsedId;
                  child.userData.type = parts[0];
                  if (parts.length >= 3) {
                    child.userData.assembly_mark = parts.slice(2).join('_');
                  }
                  meshesWithProductId++;
                }
              }
            }
          }
        });
        
        console.log(`[Preview] Total meshes: ${meshCount}, with product_id: ${meshesWithProductId}`);

        // We're only showing ONE instance of the part, so we should only show fasteners
        // that are spatially close to that specific instance
        const elementIdSet = new Set(elementIds);
        const selectedMeshes: THREE.Mesh[] = [];
        
        // First pass: find the selected mesh and calculate its bounding box
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const productId = child.userData?.product_id || 
                            child.userData?.expressID || 
                            child.userData?.id ||
                            ((child as any).metadata?.product_id);
            
            if (productId && elementIdSet.has(productId)) {
              selectedMeshes.push(child);
            }
          }
        });
        
        // Calculate bounding box of selected element
        let selectedBoundingBox: THREE.Box3 | null = null;
        let selectedCenter: THREE.Vector3 | null = null;
        let selectedSize: THREE.Vector3 | null = null;
        
        if (selectedMeshes.length > 0) {
          selectedBoundingBox = new THREE.Box3();
          selectedMeshes.forEach(mesh => {
            const meshBox = new THREE.Box3().setFromObject(mesh);
            selectedBoundingBox!.union(meshBox);
          });
          
          selectedCenter = selectedBoundingBox.getCenter(new THREE.Vector3());
          selectedSize = selectedBoundingBox.getSize(new THREE.Vector3());
          
          // Expand the box by a small amount (10% of the smallest dimension or 50mm, whichever is smaller)
          const minDim = Math.min(selectedSize.x, selectedSize.y, selectedSize.z);
          const expansion = Math.min(minDim * 0.1, 50); // Max 50mm expansion
          selectedBoundingBox.expandByScalar(expansion);
          
          console.log(`[Preview] Selected element bounding box:`, {
            center: selectedCenter,
            size: selectedSize,
            expansion: expansion
          });
        }
        
        console.log(`[Preview] Looking for element IDs:`, Array.from(elementIdSet));
        console.log(`[Preview] Found ${selectedMeshes.length} selected meshes`);

        // Second pass: show selected elements + fasteners that are spatially close
        const visibleMeshes: THREE.Object3D[] = [];
        let checkedMeshes = 0;
        let fastenerCount = 0;
        
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            checkedMeshes++;
            const productId = child.userData?.product_id || 
                            child.userData?.expressID || 
                            child.userData?.id ||
                            ((child as any).metadata?.product_id);
            
            const elementType = child.userData?.type || '';
            
            // Check if this is a fastener (bolt, nut, washer, etc.)
            const isFastener = elementType && (
              elementType.includes('Fastener') ||
              elementType.includes('FASTENER') ||
              child.name.toLowerCase().includes('bolt') ||
              child.name.toLowerCase().includes('nut') ||
              child.name.toLowerCase().includes('washer')
            );
            
            // Debug first few checks
            if (checkedMeshes <= 3) {
              console.log(`[Preview] Checking mesh ${checkedMeshes}: productId=${productId}, type=${elementType}, isFastener=${isFastener}`);
            }
            
            const isSelected = productId && elementIdSet.has(productId);
            
            // For fasteners, check if they're within the bounding box of the selected element
            let isFastenerNearby = false;
            if (isFastener && selectedBoundingBox && selectedCenter) {
              const fastenerBox = new THREE.Box3().setFromObject(child);
              const fastenerCenter = fastenerBox.getCenter(new THREE.Vector3());
              
              // Check if fastener center is within the expanded bounding box
              isFastenerNearby = selectedBoundingBox.containsPoint(fastenerCenter);
              
              // Debug first few fasteners
              if (isFastener && fastenerCount < 3) {
                console.log(`[Preview] Fastener ${productId}:`, {
                  center: fastenerCenter,
                  isNearby: isFastenerNearby,
                  distanceToSelected: fastenerCenter.distanceTo(selectedCenter)
                });
              }
            }
            
            if (isSelected || isFastenerNearby) {
              child.visible = true;
              visibleMeshes.push(child);
              
              if (isFastenerNearby && !isSelected) {
                fastenerCount++;
                // Make fasteners semi-transparent to show holes
                if (child.material) {
                  const originalMaterial = child.material as THREE.Material;
                  const fastenerMaterial = originalMaterial.clone();
                  if ('transparent' in fastenerMaterial) {
                    (fastenerMaterial as any).transparent = true;
                    (fastenerMaterial as any).opacity = 0.3;
                  }
                  if ('color' in fastenerMaterial) {
                    (fastenerMaterial as any).color = new THREE.Color(0x888888); // Gray color
                  }
                  child.material = fastenerMaterial;
                }
              } else {
                // Highlight main selected elements
                if (child.material) {
                  const originalMaterial = child.material as THREE.Material;
                  const highlightMaterial = originalMaterial.clone();
                  if ('emissive' in highlightMaterial) {
                    (highlightMaterial as any).emissive = new THREE.Color(0x444444);
                  }
                  child.material = highlightMaterial;
                }
              }
            } else {
              // Hide all other elements
              child.visible = false;
            }
          }
        });

        console.log(`[Preview] Checked ${checkedMeshes} meshes, showing ${visibleMeshes.length} instances (${fastenerCount} fasteners) from ${elementIds.length} element IDs`);

        // Calculate bounding box of visible elements and focus camera
        if (visibleMeshes.length > 0) {
          const box = new THREE.Box3();
          visibleMeshes.forEach(mesh => {
            const meshBox = new THREE.Box3().setFromObject(mesh);
            box.union(meshBox);
          });

          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          
          // Calculate optimal camera distance to fit the object
          const fov = camera.fov * (Math.PI / 180);
          let cameraDistance = Math.abs(maxDim / Math.tan(fov / 2));
          cameraDistance *= 1.2; // Add 20% padding for better framing
          
          // Position camera at an isometric-like angle for better 3D view
          const angle = Math.PI / 4; // 45 degrees
          camera.position.set(
            center.x + cameraDistance * Math.cos(angle),
            center.y + cameraDistance * 0.7, // Slightly elevated
            center.z + cameraDistance * Math.sin(angle)
          );
          
          // Point camera at the center of the selection
          camera.lookAt(center);
          controls.target.copy(center);
          
          // Set min/max distance for zoom controls
          controls.minDistance = cameraDistance * 0.3;
          controls.maxDistance = cameraDistance * 3;
          
          controls.update();
        }

        setLoading(false);
      },
      (progress) => {
        console.log('Loading progress:', (progress.loaded / progress.total) * 100 + '%');
      },
      (error) => {
        console.error('Error loading model:', error);
        setError('Failed to load 3D model');
        setLoading(false);
      }
    );

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      controls.dispose();
    };
  }, [isOpen, filename, elementIds]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          width: '90%',
          height: '90%',
          maxWidth: '1200px',
          maxHeight: '800px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 8px',
              color: '#666',
            }}
          >
            ×
          </button>
        </div>

        {/* 3D Viewer Container */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {loading && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  border: '4px solid #f3f3f3',
                  borderTop: '4px solid #3498db',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px',
                }}
              />
              <p>Loading 3D preview...</p>
            </div>
          )}
          {error && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                color: '#e74c3c',
              }}
            >
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #e0e0e0',
            textAlign: 'right',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 24px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

