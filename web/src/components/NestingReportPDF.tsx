import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image, Svg, Line } from '@react-pdf/renderer'
import { NestingReport as NestingReportType, SteelReport, CuttingPattern } from '../types'

interface NestingReportPDFProps {
  nestingReport: NestingReportType
  report: SteelReport | null
  filename: string
}

// Define styles for PDF
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 18,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 14,
    marginTop: 15,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#bfbfbf',
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#bfbfbf',
    borderBottomStyle: 'solid',
  },
  tableHeader: {
    backgroundColor: '#4a5568',
    color: '#ffffff',
  },
  tableCell: {
    padding: 5,
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: '#bfbfbf',
    borderRightStyle: 'solid',
  },
  tableCellHeader: {
    fontWeight: 'bold',
  },
  textRight: {
    textAlign: 'right',
  },
  textLeft: {
    textAlign: 'left',
  },
  patternSection: {
    marginBottom: 15,
    pageBreakInside: 'avoid',
  },
  patternTitle: {
    fontSize: 11,
    marginBottom: 5,
    fontWeight: 'bold',
  },
  patternSubtitle: {
    fontSize: 9,
    marginBottom: 5,
    color: '#666',
  },
  stockBarContainer: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#bfbfbf',
    borderStyle: 'solid',
    padding: 5,
    backgroundColor: '#ffffff',
  },
  stockBar: {
    height: 40,
    width: 500,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'solid',
    marginBottom: 5,
  },
  partSegment: {
    position: 'absolute',
    top: 0,
    height: 40,
    backgroundColor: '#e3f2fd',
    borderRightWidth: 1,
    borderRightColor: '#1976d2',
    borderRightStyle: 'solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#4b5563',
  },
  wasteSegment: {
    position: 'absolute',
    top: 0,
    height: 40,
    backgroundColor: '#ffebee',
    borderLeftWidth: 1,
    borderLeftColor: '#d32f2f',
    borderLeftStyle: 'dashed',
  },
  stockBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#666',
    marginTop: 2,
  },
})

// Helper function to render stock bar visualization - matches app structure exactly
const StockBarVisualization: React.FC<{ pattern: CuttingPattern; profileName: string }> = ({ pattern, profileName }) => {
  const stockLength = pattern.stock_length
  const totalWidth = 500 // Width in points for PDF
  const barHeight = 40
  
  // Padding inside borders to prevent overlap
  const borderPadding = 1  // 1px padding inside borders
  
  // Calculate inner container dimensions (accounting for borders)
  const innerWidth = totalWidth - (borderPadding * 2)  // 498px
  const innerHeight = barHeight - (borderPadding * 2)  // 38px
  
  // Scale factor based on INNER container width (not totalWidth)
  // This ensures parts fit within the inner container and don't overlap borders
  const pxPerMm = innerWidth / stockLength
  
  // A) Sort parts by length (descending) - EXACTLY like app
  const sortedParts = [...pattern.parts].sort((a, b) => {
    const lengthA = a.length || 0
    const lengthB = b.length || 0
    return lengthB - lengthA // Descending order (longest first)
  })
  
  // B) Calculate cumulative X positions (flush, no gaps) - EXACTLY like app
  let cumulativeX = 0
  const partPositions = sortedParts.map((part) => {
    const lengthMm = part.length || 0
    const xStart = cumulativeX
    const xEnd = cumulativeX + (lengthMm * pxPerMm)
    cumulativeX = xEnd
    return { part, xStart, xEnd, lengthMm }
  })
  
  const numParts = partPositions.length
  const lastPartIdx = numParts - 1
  
  // Calculate exact used length
  const usedLengthMm = partPositions.length > 0 
    ? partPositions[lastPartIdx].xEnd / pxPerMm 
    : 0
  
  // Exact boundary between parts and waste (same calculation as app)
  const exactPartsEndPx = partPositions.length > 0 
    ? Math.floor(partPositions[lastPartIdx].xEnd)
    : 0
  
  // C) Create part name to number mapping (for labels)
  const partNameToNumber = new Map<string, number>()
  const partGroups = new Map<string, { name: string, length: number, count: number }>()
  
  pattern.parts.forEach((part) => {
    const partData = part?.part || {}
    const partName = partData.reference || partData.element_name || 'Unknown'
    const partLength = part?.length || 0
    
    if (partGroups.has(partName)) {
      const existing = partGroups.get(partName)!
      existing.count += 1
    } else {
      partGroups.set(partName, {
        name: partName,
        length: partLength,
        count: 1
      })
    }
  })
  
  const sortedGroups = Array.from(partGroups.values()).sort((a, b) => b.length - a.length)
  sortedGroups.forEach((group, idx) => {
    partNameToNumber.set(group.name, idx + 1)
  })
  
  // D) Determine part end types (straight vs miter)
  interface PartEnd {
    type: 'straight' | 'miter'
    rawAngle: number | null
    deviation: number | null
  }
  
  // Parse angle helper function
  const parseAngle = (value: any): number | null => {
    if (value === null || value === undefined) return null
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'string') {
      const match = value.match(/-?\d+(\.\d+)?/)
      if (match) {
        const n = parseFloat(match[0])
        return Number.isFinite(n) ? n : null
      }
    }
    return null
  }
  
  // Angle analysis interface
  interface AngleAnalysis {
    rawAngle: number | null
    convention: 'ABS' | 'DEV' | null
    deviation: number | null
    isSlope: boolean
  }
  
  // Analyze angle with convention detection (matching app logic)
  const analyzeAngle = (rawAngle: number | null): AngleAnalysis => {
    if (rawAngle === null) {
      return { rawAngle: null, convention: null, deviation: null, isSlope: false }
    }
    
    const absAngle = Math.abs(rawAngle)
    const NEAR_STRAIGHT_THRESHOLD = 1.0
    const MIN_DEV_DEG = 1.0
    
    // Detect convention: if angle is between 60-120, treat as ABS (90° = straight)
    // Otherwise treat as DEV (0° = straight)
    let convention: 'ABS' | 'DEV'
    let deviation: number
    
    if (absAngle >= 60 && absAngle <= 120) {
      // ABSOLUTE convention: 90° = straight
      convention = 'ABS'
      deviation = Math.abs(rawAngle - 90)
    } else {
      // DEVIATION convention: 0° = straight
      convention = 'DEV'
      deviation = absAngle
    }
    
    // Near-straight guard: force straight if very close
    let isSlope = false
    if (convention === 'ABS' && deviation < NEAR_STRAIGHT_THRESHOLD) {
      isSlope = false // Force straight
    } else if (convention === 'DEV' && deviation < NEAR_STRAIGHT_THRESHOLD) {
      isSlope = false // Force straight
    } else {
      // Normal threshold check
      isSlope = deviation >= MIN_DEV_DEG
    }
    
    return { rawAngle, convention, deviation, isSlope }
  }
  
  const partEnds = partPositions.map(({ part }) => {
    const slopeInfo = (part as any).slope_info || {}
    const startHasSlope = slopeInfo.start_has_slope === true
    const endHasSlope = slopeInfo.end_has_slope === true
    const startRawAngle = slopeInfo.start_angle || null
    const endRawAngle = slopeInfo.end_angle || null
    
    const startAngle = parseAngle(startRawAngle)
    const endAngle = parseAngle(endRawAngle)
    
    // Use analyzeAngle to calculate deviation correctly (matching app logic)
    const startAnalysis = analyzeAngle(startAngle)
    const endAnalysis = analyzeAngle(endAngle)
    
    // Use backend's has_slope flags if available, otherwise use calculated isSlope
    // For deviation, use the calculated deviation from analyzeAngle
    const startDev = startHasSlope && startAnalysis.deviation !== null 
      ? startAnalysis.deviation 
      : (startAnalysis.isSlope ? startAnalysis.deviation || 0 : 0)
    const endDev = endHasSlope && endAnalysis.deviation !== null 
      ? endAnalysis.deviation 
      : (endAnalysis.isSlope ? endAnalysis.deviation || 0 : 0)
    
    const startCut: PartEnd = {
      type: startHasSlope ? 'miter' : 'straight',
      rawAngle: startAngle,
      deviation: startDev
    }
    
    const endCut: PartEnd = {
      type: endHasSlope ? 'miter' : 'straight',
      rawAngle: endAngle,
      deviation: endDev
    }
    
    return { startCut, endCut }
  })
  
  // E) Determine shared boundaries (match app's logic more closely)
  const sharedBoundarySet = new Set<number>()
  
  // Check internal boundaries between parts
  for (let i = 1; i < numParts; i++) {
    const leftPartEnd = partEnds[i - 1]
    const rightPartEnd = partEnds[i]
    // Match app: use Math.floor, not Math.round (line 1761 in app)
    const rightPartXStart = partPositions[i].xStart
    const boundaryX = i === 0 ? 0 : Math.floor(rightPartXStart)
    
    const leftEndType = leftPartEnd.endCut.type
    const rightStartType = rightPartEnd.startCut.type
    const leftDev = leftPartEnd.endCut.deviation || 0
    const rightDev = rightPartEnd.startCut.deviation || 0
    
    const NEAR_STRAIGHT_THRESHOLD_FOR_SHARING = 1.0
    const ANGLE_MATCH_TOL = 2.0
    
    // Match app's logic: both straight, both miter with similar angles, or mixed types
    if (leftEndType === 'straight' && rightStartType === 'straight') {
      // Both straight = shared straight boundary
      sharedBoundarySet.add(boundaryX)
    } else if (leftEndType === 'miter' && rightStartType === 'miter') {
      // Both miter = check if complementary (match app logic exactly)
      const devDiff = Math.abs(leftDev - rightDev)
      if (devDiff <= ANGLE_MATCH_TOL) {
        sharedBoundarySet.add(boundaryX)
      }
    } else {
      // Mixed types: share the boundary and show the miter marker
      const bothNearStraight = 
        (leftDev < NEAR_STRAIGHT_THRESHOLD_FOR_SHARING) && 
        (rightDev < NEAR_STRAIGHT_THRESHOLD_FOR_SHARING)
      
      if (bothNearStraight) {
        // Both are very close to straight = treat as shared straight boundary
        sharedBoundarySet.add(boundaryX)
      } else {
        // One is straight, one is miter - still share the boundary
        sharedBoundarySet.add(boundaryX)
      }
    }
  }
  
  // F) Calculate waste
  const wasteWidth = pattern.waste > 0 ? (pattern.waste * pxPerMm) : 0
  
  // Content area dimensions (accounting for borders)
  const contentWidth = totalWidth - 2  // Account for left and right borders (1px each)
  const contentHeight = barHeight - 2  // Account for top and bottom borders (1px each)
  
  return (
    <View style={styles.stockBarContainer}>
      {/* Stock bar container - NO borders, we'll render them separately as overlays */}
      <View style={{ 
        position: 'relative',
        height: barHeight, 
        width: totalWidth,
        marginBottom: 5,
        backgroundColor: '#ffffff',
      }}>
        {/* Inner container - content area (1px inset for borders) */}
        <View style={{
          position: 'absolute',
          left: 1,  // 1px for left border
          top: 1,   // 1px for top border
          width: contentWidth,
          height: contentHeight,
        }}>
          {/* Render parts - EXACTLY like app */}
        {partPositions.map((pos, partIdx) => {
          const partName = pos.part?.part?.reference || pos.part?.part?.element_name || `b${partIdx + 1}`
          const partNumber = partNameToNumber.get(partName) || partIdx + 1
          const partEndInfo = partEnds[partIdx]
          
          // Calculate X position relative to inner container (no border offset needed)
          const xPx = partIdx === 0 ? 0 : Math.floor(pos.xStart)
          
          // Calculate end position (last part uses exact boundary)
          let endPx: number
          if (partIdx === lastPartIdx && pattern.waste > 0) {
            endPx = exactPartsEndPx
          } else {
            endPx = Math.floor(pos.xEnd)
          }
          
          // Ensure we don't exceed content area width
          const maxRightX = contentWidth
          if (endPx > maxRightX) {
            endPx = maxRightX
          }
          
          // Calculate width
          let wPx = endPx - xPx
          if (partIdx === lastPartIdx && pattern.waste > 0) {
            const maxAllowedWidth = exactPartsEndPx - xPx
            wPx = Math.floor(maxAllowedWidth)
          } else {
            wPx = Math.floor(wPx)
          }
          wPx = Math.max(1, wPx)
          
          // Check if boundaries are shared
          let startIsShared = false
          let endIsShared = false
          
          if (partIdx > 0) {
            // Match app: use Math.floor, not Math.round (line 1415 in app)
            const boundaryX = Math.floor(pos.xStart)
            startIsShared = sharedBoundarySet.has(boundaryX)
          }
          
          if (partIdx < numParts - 1) {
            // Match app: use Math.floor, not Math.round (line 1421 in app)
            const rightPartXStart = partPositions[partIdx + 1].xStart
            const boundaryX = (partIdx + 1) === 0 ? 0 : Math.floor(rightPartXStart)
            endIsShared = sharedBoundarySet.has(boundaryX)
          } else if (partIdx === lastPartIdx && pattern.waste > 0) {
            endIsShared = false // Last part with waste - always show end boundary
          }
          
          // Polygon boundaries (parts fill entire width within content area)
          const polyLeftX = xPx
          let polyRightX: number
          if (partIdx === lastPartIdx && pattern.waste > 0) {
            polyRightX = exactPartsEndPx
          } else if (partIdx === lastPartIdx && pattern.waste === 0) {
            // Last part with no waste - extend to content area edge
            polyRightX = contentWidth
          } else {
            polyRightX = endPx
          }
          
          // Ensure width doesn't exceed content area
          const partWidth = polyRightX - polyLeftX
          const maxWidth = contentWidth - polyLeftX
          const finalWidth = Math.min(partWidth, maxWidth)
          
          const isLastPart = partIdx === lastPartIdx && pattern.waste > 0
          
          return (
            <View key={partIdx} style={{ position: 'relative' }}>
              {/* Part rectangle - light gray like app */}
              <View
                style={{
                  position: 'absolute',
                  left: polyLeftX,
                  top: 0,
                  width: finalWidth,
                  height: contentHeight,
                  backgroundColor: '#f3f4f6', // Light gray matching app
                }}
              >
                {/* Part label */}
                {wPx >= 30 && (
                  <Text style={{
                    position: 'absolute',
                    left: finalWidth / 2 - 3,
                    top: contentHeight / 2 - 4,
                    fontSize: 8,
                    fontWeight: 'bold',
                    color: '#4b5563',
                  }}>
                    {String(partNumber)}
                  </Text>
                )}
              </View>
              
              {/* Non-shared boundary markers (per part) */}
              {!startIsShared && partIdx > 0 && (
                <>
                  {partEndInfo.startCut.type === 'miter' ? (
                    // Sloped start boundary - draw diagonal line
                    // Part is on the right of this boundary, so ownerSide is 'right'
                    // Diagonal goes from (boundaryX, 0) to (boundaryX + 12, height)
                    <View
                      style={{
                        position: 'absolute',
                        left: polyLeftX,  // At the boundary
                        top: 0,
                        width: 12,
                        height: contentHeight,
                      }}
                    >
                      <Svg
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          width: 12,
                          height: contentHeight,
                        }}
                      >
                        <Line
                          x1="0"
                          y1="0"
                          x2="12"
                          y2={String(contentHeight)}
                          stroke="#d1d5db"
                          strokeWidth={1}
                        />
                      </Svg>
                    </View>
                  ) : (
                    // Straight start boundary
                    <View
                      style={{
                        position: 'absolute',
                        left: polyLeftX,
                        top: 0,
                        width: 1,
                        height: contentHeight,
                        backgroundColor: '#d1d5db',
                      }}
                    />
                  )}
                </>
              )}
              
              {!endIsShared && partIdx < numParts - 1 && (
                <>
                  {partEndInfo.endCut.type === 'miter' ? (
                    // Sloped end boundary - draw diagonal line
                    // Part is on the left of this boundary, so ownerSide is 'left'
                    // Diagonal goes from (boundaryX - 12, 0) to (boundaryX, height)
                    <View
                      style={{
                        position: 'absolute',
                        left: polyRightX - 12,  // Start 12px before boundary
                        top: 0,
                        width: 12,
                        height: contentHeight,
                      }}
                    >
                      <Svg
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          width: 12,
                          height: contentHeight,
                        }}
                      >
                        <Line
                          x1="12"
                          y1="0"
                          x2="0"
                          y2={String(contentHeight)}
                          stroke="#d1d5db"
                          strokeWidth={1}
                        />
                      </Svg>
                    </View>
                  ) : (
                    // Straight end boundary
                    <View
                      style={{
                        position: 'absolute',
                        left: polyRightX - 1,
                        top: 0,
                        width: 1,
                        height: contentHeight,
                        backgroundColor: '#d1d5db',
                      }}
                    />
                  )}
                </>
              )}
              
              {/* Last part end boundary - handle both with waste and without waste */}
              {(isLastPart || (partIdx === lastPartIdx && pattern.waste === 0)) && (() => {
                // Determine the actual end boundary position
                const endBoundaryX = isLastPart ? exactPartsEndPx : contentWidth
                
                return (
                  <>
                    {partEndInfo.endCut.type === 'miter' ? (
                      // Sloped end boundary - draw diagonal line
                      // Part is on the left of this boundary, so ownerSide is 'left'
                      // Diagonal goes from (boundaryX - 12, 0) to (boundaryX, height)
                      <View
                        style={{
                          position: 'absolute',
                          left: endBoundaryX - 12,  // Start 12px before boundary
                          top: 0,
                          width: 12,
                          height: contentHeight,
                        }}
                      >
                        <Svg
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: 12,
                            height: contentHeight,
                          }}
                        >
                          <Line
                            x1="12"
                            y1="0"
                            x2="0"
                            y2={String(contentHeight)}
                            stroke="#d1d5db"
                            strokeWidth={1}
                          />
                        </Svg>
                      </View>
                    ) : (
                      // Straight end boundary
                      <View
                        style={{
                          position: 'absolute',
                          left: endBoundaryX,
                          top: 0,
                          width: 1,
                          height: contentHeight,
                          backgroundColor: '#d1d5db',
                        }}
                      />
                    )}
                  </>
                )
              })()}
            </View>
          )
        })}
        
          {/* Render shared boundary markers - EXACTLY like app */}
          {Array.from({ length: numParts - 1 }).map((_, i) => {
            const leftPartIdx = i
            const rightPartIdx = i + 1
            // Match app: use Math.floor, not Math.round (line 1761 in app)
            const rightPartXStart = partPositions[rightPartIdx].xStart
            const boundaryX = rightPartIdx === 0 ? 0 : Math.floor(rightPartXStart)  // Relative to inner container
            
            if (!sharedBoundarySet.has(boundaryX)) return null
            
            const leftPartEnd = partEnds[leftPartIdx]
            const rightPartEnd = partEnds[rightPartIdx]
            const leftEndType = leftPartEnd.endCut.type
            const rightStartType = rightPartEnd.startCut.type
            
            if (leftEndType === 'straight' && rightStartType === 'straight') {
              // Shared straight boundary
              return (
                <View
                  key={`shared-${i}`}
                  style={{
                    position: 'absolute',
                    left: boundaryX,
                    top: 0,
                    width: 1,
                    height: contentHeight,
                    backgroundColor: '#d1d5db',
                  }}
                />
              )
            } else if (leftEndType === 'miter' || rightStartType === 'miter') {
              // Shared sloped boundary - draw diagonal line
              const diagonalOffset = 12 // Same as app
              
              // Determine ownerSide based on deviations (like app does)
              let ownerSide: 'left' | 'right'
              if (leftEndType === 'miter' && rightStartType === 'miter') {
                // Both miter - use deviation to determine ownerSide
                const leftDev = leftPartEnd.endCut.deviation || 0
                const rightDev = rightPartEnd.startCut.deviation || 0
                const ANGLE_MATCH_TOL = 2.0
                
                if (Math.abs(leftDev - rightDev) <= ANGLE_MATCH_TOL) {
                  // Similar deviations - prefer left (like app)
                  ownerSide = 'left'
                } else if (leftDev > rightDev) {
                  ownerSide = 'left'
                } else {
                  ownerSide = 'right'
                }
              } else {
                // One is miter, one is straight - owner is the miter side
                ownerSide = leftEndType === 'miter' ? 'left' : 'right'
              }
              
              // Match app exactly: use xSnapped (which is boundaryX) and add 0.5 offset
              const xSnapped = boundaryX
              
              // Calculate diagonal line endpoints (exactly like app - no clamping)
              let x1: number
              let x2: number
              
              if (ownerSide === 'left') {
                x1 = xSnapped - diagonalOffset
                x2 = xSnapped
              } else {
                x1 = xSnapped
                x2 = xSnapped + diagonalOffset
              }
              
              // Add 0.5 offset like app does (line 1889-1892)
              // Coordinates are relative to inner container (0-contentWidth for x, 0-contentHeight for y)
              const x1Final = x1 + 0.5
              const x2Final = x2 + 0.5
              const y1Final = 0.5
              const y2Final = contentHeight - 0.5  // Use contentHeight to match inner container height
              
              // Draw line directly without clamping (like app)
              return (
                <View
                  key={`shared-sloped-${i}`}
                  style={{
                    position: 'absolute',
                    left: 0,  // Position relative to inner container
                    top: 0,
                    width: contentWidth,  // Match inner container width
                    height: contentHeight,  // Match inner container height (not barHeight!)
                  }}
                >
                  <Svg
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: contentWidth,  // Match inner container width
                      height: contentHeight,  // Match inner container height (not barHeight!)
                    }}
                  >
                    <Line
                      x1={String(x1Final)}
                      y1={String(y1Final)}
                      x2={String(x2Final)}
                      y2={String(y2Final)}
                      stroke="#d1d5db"
                      strokeWidth={1}
                    />
                  </Svg>
                </View>
              )
            }
            
            return null
          })}
          
          {/* Waste area - white like app */}
          {wasteWidth > 0 && (
            <View
              style={{
                position: 'absolute',
                left: exactPartsEndPx,
                top: 0,
                width: Math.max(0, Math.min(Math.floor(wasteWidth), contentWidth - exactPartsEndPx)),
                height: contentHeight,
                backgroundColor: '#ffffff',
              }}
            />
          )}
        </View>
        
        {/* Render borders as separate overlay elements - guaranteed to be on top */}
        {/* Top border */}
        <View style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: totalWidth,
          height: 1,
          backgroundColor: '#d1d5db',
        }} />
        
        {/* Bottom border */}
        <View style={{
          position: 'absolute',
          left: 0,
          top: barHeight - 1,
          width: totalWidth,
          height: 1,
          backgroundColor: '#d1d5db',
        }} />
        
        {/* Left border */}
        <View style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1,
          height: barHeight,
          backgroundColor: '#d1d5db',
        }} />
        
        {/* Right border */}
        <View style={{
          position: 'absolute',
          left: totalWidth - 1,
          top: 0,
          width: 1,
          height: barHeight,
          backgroundColor: '#d1d5db',
        }} />
      </View>
      
      {/* Labels */}
      <View style={styles.stockBarLabels}>
        <Text>0mm</Text>
        <Text>{Math.round(stockLength)}mm</Text>
      </View>
    </View>
  )
}

export const NestingReportPDF: React.FC<NestingReportPDFProps> = ({ 
  nestingReport, 
  report, 
  filename 
}) => {
  const formatLength = (mm: number) => {
    if (mm >= 1000) {
      return `${(mm / 1000).toFixed(2)}m`
    }
    return `${mm.toFixed(0)}mm`
  }

  // Collect error parts
  const allErrorParts: Array<{
    profile_name: string
    reference: string
    length: number
  }> = []
  
  nestingReport.profiles.forEach(profile => {
    if (profile.rejected_parts && profile.rejected_parts.length > 0) {
      profile.rejected_parts.forEach(rejectedPart => {
        if (rejectedPart.length > 12001) {
          const reference = rejectedPart.reference && rejectedPart.reference.trim() 
            ? rejectedPart.reference 
            : null
          const elementName = rejectedPart.element_name && rejectedPart.element_name.trim() 
            ? rejectedPart.element_name 
            : null
          const partName = reference || elementName || 'Unknown'
          
          allErrorParts.push({
            profile_name: profile.profile_name,
            reference: partName,
            length: rejectedPart.length
          })
        }
      })
    }
  })

  const groupedErrorParts = new Map<string, {
    profile_name: string
    reference: string
    length: number
    quantity: number
  }>()

  allErrorParts.forEach(part => {
    const key = `${part.profile_name}|${part.reference}|${part.length.toFixed(2)}`
    if (groupedErrorParts.has(key)) {
      groupedErrorParts.get(key)!.quantity++
    } else {
      groupedErrorParts.set(key, {
        profile_name: part.profile_name,
        reference: part.reference,
        length: part.length,
        quantity: 1
      })
    }
  })

  const errorPartsList = Array.from(groupedErrorParts.values())

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Section 1: BOM Summary */}
        <Text style={styles.sectionTitle}>Section 1: BOM Summary</Text>
        
        <View style={styles.table}>
          {/* Table Header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '25%' }]}>Profile Type</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '15%' }]}>Bar Stock Length</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '12%' }]}>Amount of Bars</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '12%' }]}>Tonnage (tonnes)</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '12%' }]}>Number of Cuts</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '12%' }]}>Total Waste Tonnage</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '12%' }]}>Total Waste in M</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '12%' }]}>Total Waste %</Text>
          </View>
          
          {/* Table Rows */}
          {nestingReport.profiles.map((profile, profileIdx) => {
            const profileData = report?.profiles.find(p => p.profile_name === profile.profile_name)
            let weightPerMeter = 0
            if (profileData && profile.total_length > 0) {
              const totalLengthM = profile.total_length / 1000.0
              weightPerMeter = profileData.total_weight / totalLengthM
            }
            
            const stockLengthEntries = Object.entries(profile.stock_lengths_used)
              .filter(([_, barCount]) => barCount > 0)
            
            return stockLengthEntries.map(([stockLengthStr, barCount], stockIdx) => {
              const stockLength = parseFloat(stockLengthStr)
              const stockLengthM = stockLength / 1000.0
              const tonnage = (weightPerMeter * stockLengthM * barCount) / 1000.0
              
              const patternsForThisStock = profile.cutting_patterns.filter(
                p => Math.abs(p.stock_length - stockLength) < 0.01
              )
              
              const totalCuts = patternsForThisStock.reduce((sum, pattern) => {
                return sum + Math.max(0, pattern.parts.length - 1)
              }, 0)
              
              const totalWasteMm = patternsForThisStock.reduce((sum, pattern) => {
                return sum + (pattern.waste || 0)
              }, 0)
              
              const totalWasteM = totalWasteMm / 1000.0
              const wasteTonnage = weightPerMeter > 0 && totalWasteMm > 0
                ? (totalWasteM * weightPerMeter) / 1000.0
                : 0
              
              const wasteForThisStock = patternsForThisStock.length > 0
                ? patternsForThisStock.reduce((sum, p) => sum + p.waste_percentage, 0) / patternsForThisStock.length
                : profile.total_waste_percentage
              
              return (
                <View key={`${profileIdx}-${stockIdx}`} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { width: '25%' }]}>{profile.profile_name}</Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '15%' }]}>{formatLength(stockLength)}</Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>{barCount}</Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
                    {tonnage > 0 ? tonnage.toFixed(3) : 'N/A'}
                  </Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>{totalCuts}</Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
                    {wasteTonnage > 0 ? wasteTonnage.toFixed(3) : '0.000'}
                  </Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
                    {totalWasteM > 0 ? totalWasteM.toFixed(2) : '0.00'}
                  </Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
                    {wasteForThisStock.toFixed(2)}%
                  </Text>
                </View>
              )
            })
          })}
          
          {/* Table Footer */}
          <View style={[styles.tableRow, { backgroundColor: '#f3f4f6', fontWeight: 'bold' }]}>
            <Text style={[styles.tableCell, { width: '25%', fontWeight: 'bold' }]}>Total</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '15%' }]}>-</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
              {nestingReport.summary.total_stock_bars}
            </Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
              {nestingReport.profiles.reduce((total, profile) => {
                const profileData = report?.profiles.find(p => p.profile_name === profile.profile_name)
                if (!profileData || profile.total_length === 0) return total
                
                const weightPerMeter = profileData.total_weight / (profile.total_length / 1000.0)
                const profileTonnage = Object.entries(profile.stock_lengths_used).reduce((sum, [stockLengthStr, barCount]) => {
                  const stockLengthM = parseFloat(stockLengthStr) / 1000.0
                  return sum + (weightPerMeter * stockLengthM * barCount) / 1000.0
                }, 0)
                
                return total + profileTonnage
              }, 0).toFixed(3)}
            </Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
              {nestingReport.profiles.reduce((total, profile) => {
                return total + profile.cutting_patterns.reduce((sum, pattern) => {
                  return sum + Math.max(0, pattern.parts.length - 1)
                }, 0)
              }, 0)}
            </Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
              {nestingReport.profiles.reduce((total, profile) => {
                const profileData = report?.profiles.find(p => p.profile_name === profile.profile_name)
                if (!profileData || profile.total_length === 0) return total
                
                const weightPerMeter = profileData.total_weight / (profile.total_length / 1000.0)
                const profileWasteTonnage = profile.cutting_patterns.reduce((sum, pattern) => {
                  const wasteM = (pattern.waste || 0) / 1000.0
                  return sum + (wasteM * weightPerMeter) / 1000.0
                }, 0)
                
                return total + profileWasteTonnage
              }, 0).toFixed(3)}
            </Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
              {nestingReport.profiles.reduce((total, profile) => {
                const profileWasteM = profile.cutting_patterns.reduce((sum, pattern) => {
                  return sum + ((pattern.waste || 0) / 1000.0)
                }, 0)
                return total + profileWasteM
              }, 0).toFixed(2)}
            </Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
              {nestingReport.summary.average_waste_percentage.toFixed(2)}%
            </Text>
          </View>
        </View>

        {/* Error Parts Table */}
        {errorPartsList.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Error Parts</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableCell, styles.tableCellHeader, { width: '30%' }]}>Profile Type</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader, { width: '30%' }]}>Part Name</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '20%' }]}>Cut Length (mm)</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '20%' }]}>Quantity</Text>
              </View>
              {errorPartsList.map((part, idx) => (
                <View key={`error-${idx}`} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { width: '30%' }]}>{part.profile_name}</Text>
                  <Text style={[styles.tableCell, { width: '30%' }]}>{part.reference}</Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>{Math.round(part.length)}</Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>{part.quantity}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Page>

      {/* Section 2: Cutting Patterns - Each profile on separate pages */}
      {nestingReport.profiles.map((profile, profileIdx) => (
        <Page key={profileIdx} size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Section 2: Cutting Patterns</Text>
          <Text style={{ marginBottom: 10, fontSize: 11 }}>
            {profile.profile_name} ({profile.total_parts} parts)
          </Text>
          
          {profile.cutting_patterns.map((pattern, patternIdx) => (
            <View key={patternIdx} style={styles.patternSection}>
              <Text style={styles.patternTitle}>
                Bar {patternIdx + 1}: {formatLength(pattern.stock_length)} stock
              </Text>
              <Text style={styles.patternSubtitle}>
                Waste: {formatLength(pattern.waste)} ({pattern.waste_percentage.toFixed(2)}%)
              </Text>
              
              {/* Stock Bar Visualization */}
              <StockBarVisualization pattern={pattern} profileName={profile.profile_name} />
              
              {/* Cutting List Table */}
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.tableCell, styles.tableCellHeader, { width: '10%' }]}>Number</Text>
                  <Text style={[styles.tableCell, styles.tableCellHeader, { width: '30%' }]}>Profile Name</Text>
                  <Text style={[styles.tableCell, styles.tableCellHeader, { width: '30%' }]}>Part Name</Text>
                  <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '15%' }]}>Cut Length (mm)</Text>
                  <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '15%' }]}>Quantity</Text>
                </View>
                {(() => {
                  const partGroups = new Map<string, { name: string, length: number, count: number }>()
                  
                  pattern.parts.forEach((part) => {
                    const partData = part?.part || {}
                    const partName = partData.reference || partData.element_name || 'Unknown'
                    const partLength = part?.length || 0
                    
                    if (partGroups.has(partName)) {
                      const existing = partGroups.get(partName)!
                      existing.count += 1
                    } else {
                      partGroups.set(partName, {
                        name: partName,
                        length: partLength,
                        count: 1
                      })
                    }
                  })
                  
                  const sortedGroups = Array.from(partGroups.values()).sort((a, b) => {
                    return b.length - a.length
                  })
                  
                  return sortedGroups.map((group, idx) => (
                    <View key={idx} style={styles.tableRow}>
                      <Text style={[styles.tableCell, { width: '10%' }]}>{idx + 1}</Text>
                      <Text style={[styles.tableCell, { width: '30%' }]}>{profile.profile_name}</Text>
                      <Text style={[styles.tableCell, { width: '30%' }]}>{group.name}</Text>
                      <Text style={[styles.tableCell, styles.textRight, { width: '15%' }]}>{Math.round(group.length)}</Text>
                      <Text style={[styles.tableCell, styles.textRight, { width: '15%' }]}>{group.count}</Text>
                    </View>
                  ))
                })()}
              </View>
            </View>
          ))}
        </Page>
      ))}
    </Document>
  )
}

