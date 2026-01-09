import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image, Svg, Line, Path, Polygon } from '@react-pdf/renderer'
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
    fontFamily: 'Helvetica'
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

// StockBarVisualization - Completely rebuilt to match app exactly
const StockBarVisualization: React.FC<{ pattern: CuttingPattern; profileName: string }> = ({ pattern, profileName }) => {
  // Match app's coordinate system exactly
  // App uses: viewBox="0 0 1000 60" (width=1000, height=60)
  // PDF uses: 500x40 (scale: 0.5x width, 0.667x height)
  const appWidth = 1000
  const appHeight = 60
  const pdfWidth = 500
  const pdfHeight = 40
  const widthScale = pdfWidth / appWidth  // 0.5
  const heightScale = pdfHeight / appHeight  // 0.667
  
  const stockLength = pattern.stock_length
  const pxPerMm = appWidth / stockLength  // Use app's scale for calculations
  
  // Sort parts by length (descending) - EXACTLY like app
  const sortedParts = [...pattern.parts].sort((a, b) => {
    const lengthA = a.length || 0
    const lengthB = b.length || 0
    return lengthB - lengthA
  })
  
  // Calculate part positions using app's coordinate system
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
  const exactPartsEndPx = partPositions.length > 0 ? Math.floor(partPositions[lastPartIdx].xEnd) : 0
  
  // Part name to number mapping
  const partNameToNumber = new Map<string, number>()
  const partGroups = new Map<string, { name: string, length: number, count: number }>()
  
  pattern.parts.forEach((part) => {
    const partData = part?.part || {}
    const partName = partData.reference || partData.element_name || 'Unknown'
    const partLength = part?.length || 0
    
    if (partGroups.has(partName)) {
      partGroups.get(partName)!.count += 1
    } else {
      partGroups.set(partName, { name: partName, length: partLength, count: 1 })
    }
  })
  
  const sortedGroups = Array.from(partGroups.values()).sort((a, b) => b.length - a.length)
  sortedGroups.forEach((group, idx) => {
    partNameToNumber.set(group.name, idx + 1)
  })
  
  // Determine part end types - EXACTLY like app
  interface PartEnd {
    type: 'straight' | 'miter'
    rawAngle: number | null
    deviation: number | null
  }
  
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
  
  const analyzeAngle = (rawAngle: number | null): { deviation: number | null, isSlope: boolean } => {
    if (rawAngle === null) return { deviation: null, isSlope: false }
    
    const absAngle = Math.abs(rawAngle)
    const NEAR_STRAIGHT_THRESHOLD = 1.0
    const MIN_DEV_DEG = 1.0
    
    let convention: 'ABS' | 'DEV'
    let deviation: number
    
    if (absAngle >= 60 && absAngle <= 120) {
      convention = 'ABS'
      deviation = Math.abs(rawAngle - 90)
    } else {
      convention = 'DEV'
      deviation = absAngle
    }
    
    let isSlope = false
    if (convention === 'ABS' && deviation < NEAR_STRAIGHT_THRESHOLD) {
      isSlope = false
    } else if (convention === 'DEV' && deviation < NEAR_STRAIGHT_THRESHOLD) {
      isSlope = false
    } else {
      isSlope = deviation >= MIN_DEV_DEG
    }
    
    return { deviation, isSlope }
  }
  
  const partEnds = partPositions.map(({ part }) => {
    const slopeInfo = (part as any).slope_info || {}
    const startHasSlope = slopeInfo.start_has_slope === true
    const endHasSlope = slopeInfo.end_has_slope === true
    const startRawAngle = parseAngle(slopeInfo.start_angle)
    const endRawAngle = parseAngle(slopeInfo.end_angle)
    
    const startAnalysis = analyzeAngle(startRawAngle)
    const endAnalysis = analyzeAngle(endRawAngle)
    
    const startDev = startHasSlope && startAnalysis.deviation !== null 
      ? startAnalysis.deviation 
      : (startAnalysis.isSlope ? startAnalysis.deviation || 0 : 0)
    const endDev = endHasSlope && endAnalysis.deviation !== null 
      ? endAnalysis.deviation 
      : (endAnalysis.isSlope ? endAnalysis.deviation || 0 : 0)
    
    const startCut: PartEnd = {
      type: startHasSlope ? 'miter' : 'straight',
      rawAngle: startRawAngle,
      deviation: startDev
    }
    
    const endCut: PartEnd = {
      type: endHasSlope ? 'miter' : 'straight',
      rawAngle: endRawAngle,
      deviation: endDev
    }
    
    return { startCut, endCut }
  })
  
  // Calculate part flip states - EXACTLY like app (to get actual geometry at boundaries)
  const partFlipStates: boolean[] = new Array(numParts).fill(false)
  
  // Step 1: Optimize first part - always start with straight if possible
  if (numParts > 0) {
    const firstPart = partEnds[0]
    if (firstPart) {
      // If first part has a straight end, flip it so straight is at position 0
      if (firstPart.endCut.type === 'straight' && firstPart.startCut.type === 'miter') {
        partFlipStates[0] = true
      }
    }
  }
  
  // Step 2: For each subsequent part, check if flipping would create a shared boundary
  const ANGLE_MATCH_TOL = 2.0
  const NEAR_STRAIGHT_THRESHOLD = 1.0
  
  for (let i = 1; i < numParts; i++) {
    const prevPart = partEnds[i - 1]
    const currPart = partEnds[i]
    
    if (!prevPart || !currPart) {
      continue
    }
    
    // Get previous part's end type (after potential flip)
    const prevEndType = partFlipStates[i - 1] ? prevPart.startCut.type : prevPart.endCut.type
    const prevEndDev = partFlipStates[i - 1] ? prevPart.startCut.deviation || 0 : prevPart.endCut.deviation || 0
    
    // Check current part's start type (normal) vs end type (if flipped)
    const currStartTypeNormal = currPart.startCut.type
    const currStartDevNormal = currPart.startCut.deviation || 0
    const currStartTypeFlipped = currPart.endCut.type
    const currStartDevFlipped = currPart.endCut.deviation || 0
    
    // Check which orientation creates a shared boundary
    let normalIsShared = false
    let flippedIsShared = false
    
    // Check normal orientation
    if (prevEndType === 'straight' && currStartTypeNormal === 'straight') {
      normalIsShared = true
    } else if (prevEndType === 'miter' && currStartTypeNormal === 'miter') {
      const devDiff = Math.abs(prevEndDev - currStartDevNormal)
      normalIsShared = devDiff <= ANGLE_MATCH_TOL
    } else {
      const bothNearStraight = 
        (prevEndDev < NEAR_STRAIGHT_THRESHOLD) && 
        (currStartDevNormal < NEAR_STRAIGHT_THRESHOLD)
      normalIsShared = bothNearStraight || true // Always share mixed types
    }
    
    // Check flipped orientation
    if (prevEndType === 'straight' && currStartTypeFlipped === 'straight') {
      flippedIsShared = true
    } else if (prevEndType === 'miter' && currStartTypeFlipped === 'miter') {
      const devDiff = Math.abs(prevEndDev - currStartDevFlipped)
      flippedIsShared = devDiff <= ANGLE_MATCH_TOL
    } else {
      const bothNearStraight = 
        (prevEndDev < NEAR_STRAIGHT_THRESHOLD) && 
        (currStartDevFlipped < NEAR_STRAIGHT_THRESHOLD)
      flippedIsShared = bothNearStraight || true // Always share mixed types
    }
    
    // Prefer flipped if it creates a better match (both straight or both miter with similar angles)
    // vs mixed types
    const normalIsBetterMatch = (prevEndType === currStartTypeNormal) && normalIsShared
    const flippedIsBetterMatch = (prevEndType === currStartTypeFlipped) && flippedIsShared
    
    if (flippedIsBetterMatch && !normalIsBetterMatch) {
      partFlipStates[i] = true
    }
  }
  
  // Determine shared boundaries - EXACTLY like app (copy the app's calculation logic)
  const sharedBoundaries: Array<{ 
    x: number, 
    leftPartIdx: number, 
    rightPartIdx: number, 
    leftEndType: string, 
    rightStartType: string, 
    leftDev: number, 
    rightDev: number 
  }> = []
  
  const NEAR_STRAIGHT_THRESHOLD_FOR_SHARING = 1.0
  
  for (let i = 0; i < numParts - 1; i++) {
    const leftPartIdx = i
    const rightPartIdx = i + 1
    
    const leftPartEnd = partEnds[leftPartIdx]
    const rightPartEnd = partEnds[rightPartIdx]
    
    if (!leftPartEnd || !rightPartEnd) {
      continue
    }
    
    // Use optimized flip states to get the actual geometry at boundaries (same as app)
    const leftEndType = partFlipStates[leftPartIdx] ? leftPartEnd.startCut.type : leftPartEnd.endCut.type
    const rightStartType = partFlipStates[rightPartIdx] ? rightPartEnd.endCut.type : rightPartEnd.startCut.type
    const leftDev = partFlipStates[leftPartIdx] ? leftPartEnd.startCut.deviation || 0 : leftPartEnd.endCut.deviation || 0
    const rightDev = partFlipStates[rightPartIdx] ? rightPartEnd.endCut.deviation || 0 : rightPartEnd.startCut.deviation || 0
    
    // Boundary x position is the start of the right part (same as app)
    const rightPartXStart = partPositions[rightPartIdx].xStart
    const boundaryX = rightPartIdx === 0 ? 0 : Math.floor(rightPartXStart)
    
    // Check if it's truly shared (same logic as app)
    let isShared = false
    
    if (leftEndType === 'straight' && rightStartType === 'straight') {
      // Both straight = shared straight boundary
      isShared = true
    } else if (leftEndType === 'miter' && rightStartType === 'miter') {
      // Both miter = check if complementary
      const devDiff = Math.abs(leftDev - rightDev)
      isShared = devDiff <= ANGLE_MATCH_TOL // Complementary slopes
    } else {
      // Mixed types: share the boundary and show the miter marker (the actual cut geometry)
      const bothNearStraight = 
        (leftDev < NEAR_STRAIGHT_THRESHOLD_FOR_SHARING) && 
        (rightDev < NEAR_STRAIGHT_THRESHOLD_FOR_SHARING)
      
      if (bothNearStraight) {
        // Both are very close to straight = treat as shared straight boundary
        isShared = true
      } else {
        // One is straight, one is miter - still share the boundary
        isShared = true
      }
    }
    
    if (isShared) {
      sharedBoundaries.push({
        x: boundaryX,
        leftPartIdx,
        rightPartIdx,
        leftEndType,
        rightStartType,
        leftDev,
        rightDev
      })
    }
  }
  
  // Build boundaryMap similar to app's resolveBoundary logic to determine ownerSide
  // This replicates the app's boundaryMap.get(xSnapped)?.ownerSide logic
  const boundaryMap = new Map<number, { ownerSide: 'left' | 'right' }>()
  
  sharedBoundaries.forEach(sb => {
    if (sb.leftEndType === 'miter' && sb.rightStartType === 'miter') {
      // Replicate resolveBoundary logic for determining ownerSide
      const devDiff = Math.abs(sb.leftDev - sb.rightDev)
      let ownerSide: 'left' | 'right'
      
      if (devDiff <= ANGLE_MATCH_TOL) {
        // Treat as SHARED → draw ONE diagonal (prefer LEFT)
        ownerSide = 'left'
      } else {
        // Choose the larger deviation (more sloped)
        if (sb.leftDev > sb.rightDev) {
          ownerSide = 'left'
        } else if (sb.rightDev > sb.leftDev) {
          ownerSide = 'right'
        } else {
          // Tie: prefer LEFT (deterministic)
          ownerSide = 'left'
        }
      }
      
      boundaryMap.set(sb.x, { ownerSide })
    }
  })
  
  // Helper: Clip line to rectangle bounds (for diagonal boundaries)
  const clipLineToBounds = (
    x1: number, y1: number, x2: number, y2: number,
    minX: number, minY: number, maxX: number, maxY: number
  ): { x1: number, y1: number, x2: number, y2: number, visible: boolean } => {
    const dx = x2 - x1
    const dy = y2 - y1
    
    if (Math.abs(dx) < 0.001) {
      // Vertical
      if (x1 < minX || x1 > maxX) return { x1: 0, y1: 0, x2: 0, y2: 0, visible: false }
      return {
        x1,
        y1: Math.max(minY, Math.min(y1, maxY)),
        x2,
        y2: Math.max(minY, Math.min(y2, maxY)),
        visible: true
      }
    }
    
    if (Math.abs(dy) < 0.001) {
      // Horizontal
      if (y1 < minY || y1 > maxY) return { x1: 0, y1: 0, x2: 0, y2: 0, visible: false }
      return {
        x1: Math.max(minX, Math.min(x1, maxX)),
        y1,
        x2: Math.max(minX, Math.min(x2, maxX)),
        y2,
        visible: true
      }
    }
    
    // Diagonal - find intersections
    const slope = dy / dx
    const intercept = y1 - slope * x1
    
    const points: Array<{ x: number, y: number, t: number }> = []
    
    // Check all edges
    const edges = [
      { x: minX, y: slope * minX + intercept, isX: true },
      { x: maxX, y: slope * maxX + intercept, isX: true },
      { x: (minY - intercept) / slope, y: minY, isX: false },
      { x: (maxY - intercept) / slope, y: maxY, isX: false }
    ]
    
    edges.forEach(edge => {
      if (edge.isX) {
        if (edge.y >= minY && edge.y <= maxY) {
          const t = (edge.x - x1) / dx
          if (t >= 0 && t <= 1) {
            points.push({ x: edge.x, y: edge.y, t })
          }
        }
      } else {
        if (edge.x >= minX && edge.x <= maxX) {
          const t = (edge.x - x1) / dx
          if (t >= 0 && t <= 1) {
            points.push({ x: edge.x, y: edge.y, t })
          }
        }
      }
    })
    
    // Add endpoints if inside
    if (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY) {
      points.push({ x: x1, y: y1, t: 0 })
    }
    if (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY) {
      points.push({ x: x2, y: y2, t: 1 })
    }
    
    if (points.length < 2) {
      return { x1: 0, y1: 0, x2: 0, y2: 0, visible: false }
    }
    
    points.sort((a, b) => a.t - b.t)
    return {
      x1: points[0].x,
      y1: points[0].y,
      x2: points[points.length - 1].x,
      y2: points[points.length - 1].y,
      visible: true
    }
  }
  
  // Create sharedBoundarySet for quick lookup (same as app)
  const sharedBoundarySet = new Set<number>()
  sharedBoundaries.forEach(sb => {
    sharedBoundarySet.add(sb.x)
  })
  
  // Calculate waste
  const wasteWidth = pattern.waste > 0 ? (pattern.waste * pxPerMm) : 0
  
  // CRITICAL FIX: Calculate content area dimensions accounting for 1px border on all sides
  // Add padding to prevent parts from overlapping borders (same on all sides)
  const borderInset = 1
  const contentPadding = 1  // Padding to prevent overlap - same on all sides (top, left, bottom, right)
  const contentWidth = pdfWidth - 2 * borderInset - contentPadding
  const contentHeight = pdfHeight - 2 * borderInset - contentPadding
  
  return (
    <View style={styles.stockBarContainer}>
      {/* Main container - matches app's border */}
      <View style={{
        position: 'relative',
        height: pdfHeight,
        width: pdfWidth,
        marginBottom: 5,
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderStyle: 'solid',
        backgroundColor: '#ffffff',
      }}>
        {/* Content area with clipping - scaled from app's 1000x60 */}
        {/* CRITICAL FIX: Inset by border width + small padding to prevent overlap */}
        <View style={{
          position: 'absolute',
          left: borderInset,  // Inset by border width
          top: borderInset,   // Inset by border width
          width: contentWidth + contentPadding,  // Account for border + padding
          height: contentHeight + contentPadding,  // Account for border + padding
          overflow: 'hidden',  // Critical: clip everything to this container
        }}>
          {/* Render parts - match app exactly with polygon shapes for sloped boundaries */}
          {partPositions.map((pos, partIdx) => {
            const partName = pos.part?.part?.reference || pos.part?.part?.element_name || `b${partIdx + 1}`
            const partNumber = partNameToNumber.get(partName) || partIdx + 1
            
            const partEnd = partEnds[partIdx]
            if (!partEnd) return null
            
            const isFlipped = partFlipStates[partIdx]
            const startType = isFlipped ? partEnd.endCut.type : partEnd.startCut.type
            const endType = isFlipped ? partEnd.startCut.type : partEnd.endCut.type
            const startDev = isFlipped ? partEnd.endCut.deviation || 0 : partEnd.startCut.deviation || 0
            const endDev = isFlipped ? partEnd.startCut.deviation || 0 : partEnd.endCut.deviation || 0
            
            // Check if boundaries are shared
            let startIsShared = false
            let endIsShared = false
            
            if (partIdx > 0) {
              const boundaryX = partIdx === 0 ? 0 : Math.floor(pos.xStart)
              startIsShared = sharedBoundarySet.has(boundaryX)
            }
            
            if (partIdx < numParts - 1) {
              const rightPartXStart = partPositions[partIdx + 1].xStart
              const boundaryX = (partIdx + 1) === 0 ? 0 : Math.floor(rightPartXStart)
              endIsShared = sharedBoundarySet.has(boundaryX)
            } else if (partIdx === lastPartIdx && pattern.waste > 0) {
              endIsShared = false
            }
            
            // Match app's calculation exactly
            const xPx = partIdx === 0 ? 0 : Math.floor(pos.xStart)
            let endPx = partIdx === lastPartIdx && pattern.waste > 0 
              ? exactPartsEndPx 
              : Math.floor(pos.xEnd)
            
            // Scale to PDF coordinates
            const xPxScaled = xPx * widthScale
            const endPxScaled = endPx * widthScale
            
            // Calculate polygon points (same logic as app)
            const diagonalOffset = 12
            const SIGNIFICANT_MITER_DEG = 8.0
            // CRITICAL FIX: Allow first part to have sloped start if it's not shared
            // For first part (partIdx === 0), startIsShared is always false, so we can check for sloped start
            const hasSlopedStart = startType === 'miter' && !startIsShared && startDev >= SIGNIFICANT_MITER_DEG
            const hasSlopedEnd = endType === 'miter' && !endIsShared && endDev >= SIGNIFICANT_MITER_DEG && (partIdx < numParts - 1 || (partIdx === lastPartIdx && pattern.waste > 0))
            
            // Calculate polygon vertices in app coordinates, then scale to PDF
            let polyLeftX = xPx
            let polyRightX = endPx
            
            if (partIdx === lastPartIdx && pattern.waste > 0 && hasSlopedEnd) {
              polyRightX = exactPartsEndPx
            }
            
            // Scale polygon coordinates
            const polyLeftXScaled = polyLeftX * widthScale
            const polyRightXScaled = polyRightX * widthScale
            const diagonalOffsetScaled = diagonalOffset * widthScale
            
            // Create polygon points (same as app)
            let points: Array<{ x: number, y: number }> = []
            
            if (hasSlopedStart && hasSlopedEnd) {
              // Both boundaries are sloped: 4 points (trapezoid)
              const topLeftX = polyLeftXScaled
              const topRightX = polyRightXScaled - diagonalOffsetScaled
              const bottomLeftX = polyLeftXScaled + diagonalOffsetScaled
              const bottomRightX = polyRightXScaled
              points = [
                { x: topLeftX, y: 0 },
                { x: topRightX, y: 0 },
                { x: bottomRightX, y: contentHeight - contentPadding },
                { x: bottomLeftX, y: contentHeight - contentPadding }
              ]
            } else if (hasSlopedStart) {
              // Only start boundary is sloped: 4 points
              const topLeftX = polyLeftXScaled
              const bottomLeftX = polyLeftXScaled + diagonalOffsetScaled
              points = [
                { x: topLeftX, y: 0 },
                { x: polyRightXScaled, y: 0 },
                { x: polyRightXScaled, y: contentHeight - contentPadding },
                { x: bottomLeftX, y: contentHeight - contentPadding }
              ]
            } else if (hasSlopedEnd) {
              // Only end boundary is sloped: 4 points
              const topRightX = polyRightXScaled - diagonalOffsetScaled
              const bottomRightX = polyRightXScaled
              points = [
                { x: polyLeftXScaled, y: 0 },
                { x: topRightX, y: 0 },
                { x: bottomRightX, y: contentHeight - contentPadding },
                { x: polyLeftXScaled, y: contentHeight - contentPadding }
              ]
            } else {
              // Both boundaries are straight: 4 points (rectangle)
              points = [
                { x: polyLeftXScaled, y: 0 },
                { x: polyRightXScaled, y: 0 },
                { x: polyRightXScaled, y: contentHeight - contentPadding },
                { x: polyLeftXScaled, y: contentHeight - contentPadding }
              ]
            }
            
            // Clamp points to content area
            const maxRight = contentWidth - contentPadding
            points = points.map(p => ({
              x: Math.max(0, Math.min(p.x, maxRight)),
              y: Math.max(0, Math.min(p.y, contentHeight - contentPadding))
            }))
            
            // Convert to string format for Polygon
            const pointsString = points.map(p => `${p.x},${p.y}`).join(' ')
            
            // Calculate center for label
            const centerX = (polyLeftXScaled + polyRightXScaled) / 2
            const centerY = (contentHeight - contentPadding) / 2
            
            return (
              <View
                key={partIdx}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: contentWidth,
                  height: contentHeight,
                  overflow: 'hidden',
                }}
              >
                {/* Gray background polygon - matches app's polygon shape */}
                <Svg
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: contentWidth,
                    height: contentHeight,
                  }}
                >
                  <Polygon
                    points={pointsString}
                    fill="#f3f4f6"
                    stroke="none"
                  />
                </Svg>
                
                {/* Part label */}
                {Math.abs(polyRightXScaled - polyLeftXScaled) >= 15 && (
                  <Text style={{
                    position: 'absolute',
                    left: centerX - 3,
                    top: centerY - 4,
                    fontSize: 8,
                    fontWeight: 'bold',
                    color: '#4b5563',
                  }}>
                    {String(partNumber)}
                  </Text>
                )}
              </View>
            )
          })}
          
          {/* Render non-shared boundaries for each part (same as app) */}
          {partPositions.map((pos, partIdx) => {
            const partEnd = partEnds[partIdx]
            if (!partEnd) return null
            
            const isFlipped = partFlipStates[partIdx]
            const startType = isFlipped ? partEnd.endCut.type : partEnd.startCut.type
            const endType = isFlipped ? partEnd.startCut.type : partEnd.endCut.type
            const startDev = isFlipped ? partEnd.endCut.deviation || 0 : partEnd.startCut.deviation || 0
            const endDev = isFlipped ? partEnd.startCut.deviation || 0 : partEnd.endCut.deviation || 0
            
            // Check if boundaries are shared
            // CRITICAL: Use the same boundaryX calculation as sharedBoundaries (Math.floor, not Math.round)
            let startIsShared = false
            let endIsShared = false
            
            if (partIdx > 0) {
              // Use same calculation as sharedBoundaries: Math.floor(rightPartXStart) where rightPartIdx = partIdx
              const boundaryX = partIdx === 0 ? 0 : Math.floor(pos.xStart)
              startIsShared = sharedBoundarySet.has(boundaryX)
            }
            
            if (partIdx < numParts - 1) {
              // Use same calculation as sharedBoundaries: Math.floor(rightPartXStart) where rightPartIdx = partIdx + 1
              const rightPartXStart = partPositions[partIdx + 1].xStart
              const boundaryX = (partIdx + 1) === 0 ? 0 : Math.floor(rightPartXStart)
              endIsShared = sharedBoundarySet.has(boundaryX)
            } else if (partIdx === lastPartIdx && pattern.waste > 0) {
              // Last part with waste - always show end boundary (it's not shared with another part)
              endIsShared = false
            }
            
            const diagonalOffset = 12
            const SIGNIFICANT_MITER_DEG = 8.0
            const maxRight = contentWidth - contentPadding
            
            return (
              <React.Fragment key={`non-shared-${partIdx}`}>
                {/* Start boundary - only if NOT shared (including first part) */}
                {!startIsShared && (() => {
                  // For first part, boundary is at x=0; for others, use part's xStart
                  const boundaryX = partIdx === 0 ? 0 : Math.round(pos.xStart)
                  const boundaryXScaled = boundaryX * widthScale
                  const clampedX = Math.max(0, Math.min(boundaryXScaled, maxRight))
                  
                  if (startType === 'miter' && startDev >= SIGNIFICANT_MITER_DEG) {
                    // Sloped start boundary - draw diagonal line
                    // Part is on the right of this boundary, so diagonal goes from (boundaryX, 0) to (boundaryX + 12, height)
                    let x1App = boundaryX + 0.5
                    let y1App = 0.5
                    let x2App = boundaryX + diagonalOffset + 0.5
                    let y2App = appHeight - 0.5
                    
                    // Clip to app's bounds
                    const clipped = clipLineToBounds(x1App, y1App, x2App, y2App, 0, 0, appWidth, appHeight)
                    if (!clipped.visible) return null
                    
                    // Scale to PDF coordinates
                    const x1Pdf = clipped.x1 * widthScale
                    const y1Pdf = clipped.y1 * heightScale
                    const x2Pdf = clipped.x2 * widthScale
                    const y2Pdf = clipped.y2 * heightScale
                    
                    // Clip to content area bounds (with padding gap at bottom like straight boundaries)
                    const clippedPdf = clipLineToBounds(x1Pdf, y1Pdf, x2Pdf, y2Pdf, 0, 0, contentWidth, contentHeight - contentPadding)
                    if (!clippedPdf.visible) return null
                    
                    // Draw diagonal line as solid line using Svg
                    return (
                      <Svg
                        key={`start-boundary-${partIdx}`}
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          width: contentWidth,
                          height: contentHeight,
                        }}
                      >
                        <Line
                          x1={String(clippedPdf.x1)}
                          y1={String(clippedPdf.y1)}
                          x2={String(clippedPdf.x2)}
                          y2={String(clippedPdf.y2)}
                          stroke="#d1d5db"
                          strokeWidth="1"
                        />
                      </Svg>
                    )
                  } else {
                    // Straight start boundary
                    return (
                      <View
                        key={`start-boundary-${partIdx}`}
                        style={{
                          position: 'absolute',
                          left: clampedX,
                          top: 0,
                          width: 1,
                          height: contentHeight - contentPadding,
                          backgroundColor: '#d1d5db',
                        }}
                      />
                    )
                  }
                })()}
                
                {/* End boundary - only if NOT shared or last part with waste */}
                {(() => {
                  const isLastPartWithWaste = partIdx === lastPartIdx && pattern.waste > 0
                  const shouldShowMarker = !endIsShared || isLastPartWithWaste
                  
                  if (!shouldShowMarker) return null
                  
                  // Safety check: ensure partPositions[partIdx + 1] exists
                  const boundaryX = partIdx === lastPartIdx && pattern.waste > 0
                    ? exactPartsEndPx
                    : (partIdx < numParts - 1 && partPositions[partIdx + 1])
                      ? Math.round(partPositions[partIdx + 1].xStart)
                      : exactPartsEndPx  // Fallback to exactPartsEndPx if next part doesn't exist
                  const boundaryXScaled = boundaryX * widthScale
                  const clampedX = Math.max(0, Math.min(boundaryXScaled, maxRight))
                  
                  if (endType === 'miter' && endDev >= SIGNIFICANT_MITER_DEG) {
                    // Sloped end boundary - draw diagonal line
                    // Part is on the left of this boundary, so diagonal goes from (boundaryX - 12, 0) to (boundaryX, height)
                    let x1App = boundaryX - diagonalOffset + 0.5
                    let y1App = 0.5
                    let x2App = boundaryX + 0.5
                    let y2App = appHeight - 0.5
                    
                    // Clip to app's bounds
                    const clipped = clipLineToBounds(x1App, y1App, x2App, y2App, 0, 0, appWidth, appHeight)
                    if (!clipped.visible) return null
                    
                    // Scale to PDF coordinates
                    const x1Pdf = clipped.x1 * widthScale
                    const y1Pdf = clipped.y1 * heightScale
                    const x2Pdf = clipped.x2 * widthScale
                    const y2Pdf = clipped.y2 * heightScale
                    
                    // Clip to content area bounds (with padding gap at bottom like straight boundaries)
                    const clippedPdf = clipLineToBounds(x1Pdf, y1Pdf, x2Pdf, y2Pdf, 0, 0, contentWidth, contentHeight - contentPadding)
                    if (!clippedPdf.visible) return null
                    
                    // Draw diagonal line as solid line using Svg
                    return (
                      <Svg
                        key={`end-boundary-${partIdx}`}
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          width: contentWidth,
                          height: contentHeight,
                        }}
                      >
                        <Line
                          x1={String(clippedPdf.x1)}
                          y1={String(clippedPdf.y1)}
                          x2={String(clippedPdf.x2)}
                          y2={String(clippedPdf.y2)}
                          stroke="#d1d5db"
                          strokeWidth="1"
                        />
                      </Svg>
                    )
                  } else {
                    // Straight end boundary
                    return (
                      <View
                        key={`end-boundary-${partIdx}`}
                        style={{
                          position: 'absolute',
                          left: clampedX,
                          top: 0,
                          width: 1,
                          height: contentHeight - contentPadding,
                          backgroundColor: '#d1d5db',
                        }}
                      />
                    )
                  }
                })()}
              </React.Fragment>
            )
          })}
          
          {/* Render shared boundaries using the calculated sharedBoundaries array (same as app) */}
          {sharedBoundaries.map((sb, idx) => {
            const xSnapped = sb.x
            const boundaryXScaled = xSnapped * widthScale
            const maxRight = contentWidth - contentPadding
            
            // Draw shared marker at the exact boundary position (same as app)
            if (sb.leftEndType === 'straight' && sb.rightStartType === 'straight') {
              // Shared straight boundary
              const clampedX = Math.max(0, Math.min(boundaryXScaled, maxRight))
              
              return (
                <View
                  key={`shared-boundary-${idx}`}
                  style={{
                    position: 'absolute',
                    left: clampedX,
                    top: 0,
                    width: 1,
                    height: contentHeight - contentPadding,
                    backgroundColor: '#d1d5db',
                  }}
                />
              )
            } else if (sb.leftEndType === 'miter' && sb.rightStartType === 'miter') {
              // Shared sloped boundary - both miter
              const diagonalOffset = 12
              
              // Find the resolved boundary to get ownerSide (same as app)
              const resolvedBoundary = boundaryMap.get(xSnapped)
              const ownerSide = resolvedBoundary?.ownerSide || 'left'
              
              // Calculate diagonal endpoints in app coordinates (with +0.5 offset like app)
              let x1App, y1App, x2App, y2App
              if (ownerSide === 'left') {
                x1App = xSnapped - diagonalOffset + 0.5
                y1App = 0.5
                x2App = xSnapped + 0.5
                y2App = appHeight - 0.5
              } else {
                x1App = xSnapped + 0.5
                y1App = 0.5
                x2App = xSnapped + diagonalOffset + 0.5
                y2App = appHeight - 0.5
              }
              
              // Clip to app's bounds (0 to 1000, 0 to 60)
              const clipped = clipLineToBounds(x1App, y1App, x2App, y2App, 0, 0, appWidth, appHeight)
              
              if (!clipped.visible) return null
              
              // Scale to PDF coordinates
              const x1Pdf = clipped.x1 * widthScale
              const y1Pdf = clipped.y1 * heightScale
              const x2Pdf = clipped.x2 * widthScale
              const y2Pdf = clipped.y2 * heightScale
              
              // CRITICAL FIX: Clip to content area bounds (with padding gap at bottom like straight boundaries)
              const clippedPdf = clipLineToBounds(x1Pdf, y1Pdf, x2Pdf, y2Pdf, 0, 0, contentWidth, contentHeight - contentPadding)
              
              if (!clippedPdf.visible) return null
              
              // Draw diagonal line as solid line using Svg
              return (
                <Svg
                  key={`shared-sloped-${idx}`}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: contentWidth,
                    height: contentHeight,
                  }}
                >
                  <Line
                    x1={String(clippedPdf.x1)}
                    y1={String(clippedPdf.y1)}
                    x2={String(clippedPdf.x2)}
                    y2={String(clippedPdf.y2)}
                    stroke="#d1d5db"
                    strokeWidth="1"
                  />
                </Svg>
              )
            } else {
              // Mixed types: one straight, one miter (same logic as app)
              const SIGNIFICANT_MITER_DEG = 8.0
              const diagonalOffset = 12
              
              const leftIsMiter = sb.leftEndType === 'miter' && sb.leftDev >= SIGNIFICANT_MITER_DEG
              const rightIsMiter = sb.rightStartType === 'miter' && sb.rightDev >= SIGNIFICANT_MITER_DEG
              
              // Show sloped if either side has a significant miter
              // BUT: if left is straight and right is miter, show straight (unless it's the last boundary)
              if (leftIsMiter) {
                // Left end is miter - show sloped marker
                // ownerSide is always 'left' in this branch
                
                // Calculate diagonal endpoints
                let x1App, y1App, x2App, y2App
                x1App = xSnapped - diagonalOffset + 0.5
                y1App = 0.5
                x2App = xSnapped + 0.5
                y2App = appHeight - 0.5
                
                // Clip to app's bounds
                const clipped = clipLineToBounds(x1App, y1App, x2App, y2App, 0, 0, appWidth, appHeight)
                
                if (!clipped.visible) return null
                
                // Scale to PDF coordinates
                const x1Pdf = clipped.x1 * widthScale
                const y1Pdf = clipped.y1 * heightScale
                const x2Pdf = clipped.x2 * widthScale
                const y2Pdf = clipped.y2 * heightScale
                
                // Clip to content area bounds (with padding gap at bottom like straight boundaries)
                const clippedPdf = clipLineToBounds(x1Pdf, y1Pdf, x2Pdf, y2Pdf, 0, 0, contentWidth, contentHeight - contentPadding)
                
                if (!clippedPdf.visible) return null
                
                // Draw diagonal line as solid line using Svg
                return (
                  <Svg
                    key={`shared-sloped-${idx}`}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: contentWidth,
                      height: contentHeight,
                    }}
                  >
                    <Line
                      x1={String(clippedPdf.x1)}
                      y1={String(clippedPdf.y1)}
                      x2={String(clippedPdf.x2)}
                      y2={String(clippedPdf.y2)}
                      stroke="#d1d5db"
                      strokeWidth="1"
                    />
                  </Svg>
                )
              } else if (rightIsMiter && sb.rightPartIdx === lastPartIdx) {
                // Right start is miter and it's the last internal boundary - show sloped
                const ownerSide: 'left' | 'right' = 'right'
                
                // Calculate diagonal endpoints
                let x1App, y1App, x2App, y2App
                // ownerSide is always 'right' in this branch
                x1App = xSnapped + 0.5
                y1App = 0.5
                x2App = xSnapped + diagonalOffset + 0.5
                y2App = appHeight - 0.5
                
                // Clip to app's bounds
                const clipped = clipLineToBounds(x1App, y1App, x2App, y2App, 0, 0, appWidth, appHeight)
                
                if (!clipped.visible) return null
                
                // Scale to PDF coordinates
                const x1Pdf = clipped.x1 * widthScale
                const y1Pdf = clipped.y1 * heightScale
                const x2Pdf = clipped.x2 * widthScale
                const y2Pdf = clipped.y2 * heightScale
                
                // Clip to content area bounds (with padding gap at bottom like straight boundaries)
                const clippedPdf = clipLineToBounds(x1Pdf, y1Pdf, x2Pdf, y2Pdf, 0, 0, contentWidth, contentHeight - contentPadding)
                
                if (!clippedPdf.visible) return null
                
                // Draw diagonal line as solid line using Svg
                return (
                  <Svg
                    key={`shared-sloped-${idx}`}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: contentWidth,
                      height: contentHeight,
                    }}
                  >
                    <Line
                      x1={String(clippedPdf.x1)}
                      y1={String(clippedPdf.y1)}
                      x2={String(clippedPdf.x2)}
                      y2={String(clippedPdf.y2)}
                      stroke="#d1d5db"
                      strokeWidth="1"
                    />
                  </Svg>
                )
              } else {
                // Show as straight
                const clampedX = Math.max(0, Math.min(boundaryXScaled, maxRight))
                
                return (
                  <View
                    key={`shared-boundary-${idx}`}
                    style={{
                      position: 'absolute',
                      left: clampedX,
                      top: 0,
                      width: 1,
                      height: contentHeight - contentPadding,
                      backgroundColor: '#d1d5db',
                    }}
                  />
                )
              }
            }
          })}
          
          {/* Waste area */}
          {wasteWidth > 0 && (() => {
            const wasteStartX = exactPartsEndPx * widthScale
            const wasteWidthScaled = wasteWidth * widthScale
            
            // CRITICAL FIX: Add small gap (1-2px) after boundary line so it's visible
            // The boundary line is at exactPartsEndPx, so waste should start slightly after it
            const boundaryGap = 1.5  // Small gap to make boundary line visible
            const wasteStartWithGap = wasteStartX + boundaryGap
            
            // CRITICAL FIX: Clamp waste area to content bounds with padding on all sides
            // Match top/left padding by ensuring right/bottom edges don't reach the border
            const maxRight = contentWidth - contentPadding  // Leave padding on right
            const clampedWasteStart = Math.max(0, Math.min(wasteStartWithGap, maxRight))
            const clampedWasteEnd = Math.max(0, Math.min(wasteStartX + wasteWidthScaled, maxRight))
            const clampedWasteWidth = Math.max(0, clampedWasteEnd - clampedWasteStart)
            const clampedWasteHeight = contentHeight - contentPadding  // Leave padding on bottom
            
            return (
              <View
                style={{
                  position: 'absolute',
                  left: clampedWasteStart,
                  top: 0,
                  width: clampedWasteWidth,
                  height: clampedWasteHeight,
                  backgroundColor: '#ffffff',
                }}
              />
            )
          })()}
        </View>
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
      {/* Cover Page */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Nesting Report</Text>
        <Text style={{ marginBottom: 10 }}>File: {filename}</Text>
        
        {/* Summary Table */}
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '20%' }]}>Metric</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '20%' }]}>Value</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '20%' }]}>Metric</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '20%' }]}>Value</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '20%' }]}>Metric</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: '20%' }]}>Total Profiles</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>
              {nestingReport.summary.total_profiles}
            </Text>
            <Text style={[styles.tableCell, { width: '20%' }]}>Total Parts</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>
              {nestingReport.summary.total_parts}
            </Text>
            <Text style={[styles.tableCell, { width: '20%' }]}>Total Stock Bars</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>
              {nestingReport.summary.total_stock_bars}
            </Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: '20%' }]}>Total Waste</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>
              {formatLength(nestingReport.summary.total_waste)}
            </Text>
            <Text style={[styles.tableCell, { width: '20%' }]}>Avg Waste %</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>
              {nestingReport.summary.average_waste_percentage.toFixed(2)}%
            </Text>
            <Text style={[styles.tableCell, { width: '20%' }]}>Total Tonnage</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>
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
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: '20%' }]}>Total Cuts</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>
              {nestingReport.profiles.reduce((total, profile) => {
                return total + profile.cutting_patterns.reduce((sum, pattern) => {
                  return sum + Math.max(0, pattern.parts.length - 1)
                }, 0)
              }, 0)}
            </Text>
            <Text style={[styles.tableCell, { width: '20%' }]}>Waste Tonnage</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>
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
            <Text style={[styles.tableCell, { width: '20%' }]}>Material Efficiency</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>
              {(100 - nestingReport.summary.average_waste_percentage).toFixed(2)}%
            </Text>
          </View>
        </View>

        {/* Error Parts Table */}
        {errorPartsList.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>Error Parts</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableCell, styles.tableCellHeader, { width: '30%' }]}>Profile</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader, { width: '40%' }]}>Part Name</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader, { width: '15%' }]}>Length</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader, { width: '15%' }]}>Quantity</Text>
              </View>
              {errorPartsList.map((part, idx) => (
                <View key={`error-${idx}`} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { width: '30%' }]}>{part.profile_name}</Text>
                  <Text style={[styles.tableCell, { width: '40%' }]}>{part.reference}</Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '15%' }]}>
                    {formatLength(part.length)}
                  </Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '15%' }]}>
                    {part.quantity}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Page>

      {/* Section 1: BOM Summary */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Section 1: BOM Summary</Text>
        
        <View style={styles.table}>
          {/* Header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '15%', fontSize: 8 }]}>Profile Type</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '12%', fontSize: 8 }]}>Bar Stock Length</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '10%', fontSize: 8 }]}>Amount of Bars</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '12%', fontSize: 8 }]}>Tonnage (tonnes)</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '10%', fontSize: 8 }]}>Number of Cuts</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '12%', fontSize: 8 }]}>Total Waste Tonnage</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '12%', fontSize: 8 }]}>Total Waste in M</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, { width: '15%', fontSize: 8 }]}>Total Waste %</Text>
          </View>
          
          {/* Data Rows */}
          {nestingReport.profiles.map((profile, profileIdx) => {
            // Get profile data from report to calculate weight per meter
            const profileData = report?.profiles.find(p => p.profile_name === profile.profile_name)
            
            // Calculate weight per meter (kg/m) from report data
            let weightPerMeter = 0
            if (profileData && profile.total_length > 0) {
              const totalLengthM = profile.total_length / 1000.0  // Convert mm to meters
              weightPerMeter = profileData.total_weight / totalLengthM  // kg per meter
            }
            
            // Group by stock length for this profile
            // Filter out entries with 0 bars - only show active bars
            const stockLengthEntries = Object.entries(profile.stock_lengths_used)
              .filter(([_, barCount]) => barCount > 0)
            
            return stockLengthEntries.map(([stockLengthStr, barCount], stockIdx) => {
              const stockLength = parseFloat(stockLengthStr)  // in mm
              const stockLengthM = stockLength / 1000.0  // Convert to meters
              
              // Calculate tonnage: (weight_per_meter_kg) * (stock_length_m) * (number_of_bars) / 1000
              const tonnage = (weightPerMeter * stockLengthM * barCount) / 1000.0  // tonnes
              
              // Calculate number of cuts for this stock length
              const patternsForThisStock = profile.cutting_patterns.filter(
                p => Math.abs(p.stock_length - stockLength) < 0.01
              )
              
              // Number of cuts = sum of (parts per bar - 1) for each bar
              const totalCuts = patternsForThisStock.reduce((sum, pattern) => {
                return sum + Math.max(0, pattern.parts.length - 1)
              }, 0)
              
              // Calculate total waste for this stock length
              const totalWasteMm = patternsForThisStock.reduce((sum, pattern) => {
                return sum + (pattern.waste || 0)
              }, 0)
              
              // Calculate waste in meters
              const totalWasteM = totalWasteMm / 1000.0
              
              // Calculate waste tonnage
              const wasteTonnage = weightPerMeter > 0 && totalWasteMm > 0
                ? (totalWasteM * weightPerMeter) / 1000.0
                : 0
              
              // Get waste percentage for this stock length
              const wasteForThisStock = patternsForThisStock.length > 0
                ? patternsForThisStock.reduce((sum, p) => sum + p.waste_percentage, 0) / patternsForThisStock.length
                : profile.total_waste_percentage
              
              return (
                <View 
                  key={`${profileIdx}-${stockIdx}`} 
                  style={[styles.tableRow, { backgroundColor: profileIdx % 2 === 0 ? '#ffffff' : '#f9fafb' }]}
                >
                  <Text style={[styles.tableCell, { width: '15%', fontSize: 8 }]}>
                    {profile.profile_name}
                  </Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '12%', fontSize: 8 }]}>
                    {formatLength(stockLength)}
                  </Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '10%', fontSize: 8 }]}>
                    {barCount}
                  </Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '12%', fontSize: 8 }]}>
                    {tonnage > 0 ? tonnage.toFixed(3) : 'N/A'}
                  </Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '10%', fontSize: 8 }]}>
                    {totalCuts}
                  </Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '12%', fontSize: 8 }]}>
                    {wasteTonnage > 0 ? wasteTonnage.toFixed(3) : '0.000'}
                  </Text>
                  <Text style={[styles.tableCell, styles.textRight, { width: '12%', fontSize: 8 }]}>
                    {totalWasteM > 0 ? totalWasteM.toFixed(2) : '0.00'}
                  </Text>
                  <Text style={[
                    styles.tableCell, 
                    styles.textRight, 
                    { 
                      width: '15%', 
                      fontSize: 8,
                      color: wasteForThisStock > 5 ? '#dc2626' : '#16a34a',
                      fontWeight: wasteForThisStock > 5 ? 'bold' : 'normal'
                    }
                  ]}>
                    {wasteForThisStock.toFixed(2)}%
                  </Text>
                </View>
              )
            })
          })}
          
          {/* Footer - Totals */}
          <View style={[styles.tableRow, { backgroundColor: '#f3f4f6', fontWeight: 'bold' }]}>
            <Text style={[styles.tableCell, { width: '15%', fontSize: 8, fontWeight: 'bold' }]}>Total</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '12%', fontSize: 8, fontWeight: 'bold' }]}>-</Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '10%', fontSize: 8, fontWeight: 'bold' }]}>
              {nestingReport.summary.total_stock_bars}
            </Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '12%', fontSize: 8, fontWeight: 'bold' }]}>
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
            <Text style={[styles.tableCell, styles.textRight, { width: '10%', fontSize: 8, fontWeight: 'bold' }]}>
              {nestingReport.profiles.reduce((total, profile) => {
                return total + profile.cutting_patterns.reduce((sum, pattern) => {
                  return sum + Math.max(0, pattern.parts.length - 1)
                }, 0)
              }, 0)}
            </Text>
            <Text style={[styles.tableCell, styles.textRight, { width: '12%', fontSize: 8, fontWeight: 'bold' }]}>
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
            <Text style={[styles.tableCell, styles.textRight, { width: '12%', fontSize: 8, fontWeight: 'bold' }]}>
              {nestingReport.profiles.reduce((total, profile) => {
                const profileWasteM = profile.cutting_patterns.reduce((sum, pattern) => {
                  return sum + ((pattern.waste || 0) / 1000.0)
                }, 0)
                return total + profileWasteM
              }, 0).toFixed(2)}
            </Text>
            <Text style={[
              styles.tableCell, 
              styles.textRight, 
              { 
                width: '15%', 
                fontSize: 8,
                fontWeight: 'bold',
                color: nestingReport.summary.average_waste_percentage > 5 ? '#dc2626' : '#16a34a'
              }
            ]}>
              {nestingReport.summary.average_waste_percentage.toFixed(2)}%
            </Text>
          </View>
        </View>
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
                  <Text style={[styles.tableCell, styles.tableCellHeader, { width: '25%' }]}>Profile Name</Text>
                  <Text style={[styles.tableCell, styles.tableCellHeader, { width: '25%' }]}>Part Name</Text>
                  <Text style={[styles.tableCell, styles.tableCellHeader, { width: '20%' }]}>Cut Length (mm)</Text>
                  <Text style={[styles.tableCell, styles.tableCellHeader, { width: '20%' }]}>Quantity</Text>
                </View>
                {(() => {
                  // Group parts by name and length
                  const partGroups = new Map<string, { name: string, length: number, count: number }>()
                  
                  pattern.parts.forEach((part) => {
                    const partData = part?.part || {}
                    const partName = partData.reference || partData.element_name || 'Unknown'
                    const partLength = part?.length || 0
                    const key = `${partName}|${partLength.toFixed(2)}`
                    
                    if (partGroups.has(key)) {
                      partGroups.get(key)!.count += 1
                    } else {
                      partGroups.set(key, {
                        name: partName,
                        length: partLength,
                        count: 1
                      })
                    }
                  })
                  
                  // Sort by length (descending)
                  const sortedGroups = Array.from(partGroups.values()).sort((a, b) => b.length - a.length)
                  
                  return sortedGroups.map((group, idx) => (
                    <View key={idx} style={styles.tableRow}>
                      <Text style={[styles.tableCell, styles.textRight, { width: '10%' }]}>
                        {idx + 1}
                      </Text>
                      <Text style={[styles.tableCell, { width: '25%' }]}>
                        {profile.profile_name}
                      </Text>
                      <Text style={[styles.tableCell, { width: '25%' }]}>
                        {group.name}
                      </Text>
                      <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>
                        {Math.round(group.length)}
                      </Text>
                      <Text style={[styles.tableCell, styles.textRight, { width: '20%' }]}>
                        {group.count}
                      </Text>
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
