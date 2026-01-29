import React from 'react'
import { Document, Page, Text, View, StyleSheet, Svg, Path, Rect } from '@react-pdf/renderer'

interface PlateInPlan {
  x: number
  y: number
  width: number
  height: number
  name: string
  thickness: string
  id: string
  svg_path?: string
}

interface CuttingPlan {
  stock_width: number
  stock_length: number
  stock_index: number
  stock_name: string
  utilization: number
  plates: PlateInPlan[]
}

interface NestingStatistics {
  total_plates: number
  nested_plates: number
  unnested_plates: number
  stock_sheets_used: number
  total_stock_area_m2: number
  total_used_area_m2: number
  waste_area_m2: number
  overall_utilization: number
  waste_percentage: number
}

interface BOMItem {
  dimensions: string
  thickness: string
  quantity: number
  area_m2: number
}

interface PlateNestingReportPDFProps {
  filename: string
  cutting_plans: CuttingPlan[]
  statistics: NestingStatistics
  bom: BOMItem[]
}

// Helper function to create unique key for plate grouping
function createPlateGroupKey(baseName: string, thickness: string, width: number, height: number): string {
  const [dim1, dim2] = [width, height].sort((a, b) => a - b)
  return `${baseName}|${thickness}|${dim1.toFixed(1)}|${dim2.toFixed(1)}`
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontSize: 10,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff'
  },
  header: {
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb'
  },
  title: {
    fontSize: 18,
    marginBottom: 4,
    fontWeight: 'bold',
    color: '#1e40af'
  },
  subtitle: {
    fontSize: 9,
    color: '#666',
    marginBottom: 8
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4
  },
  infoLabel: {
    fontSize: 9,
    color: '#666'
  },
  infoValue: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000'
  },
  svgContainer: {
    marginTop: 10,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  footer: {
    position: 'absolute',
    bottom: 15,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#666',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 8
  }
})

export function PlateNestingReportPDF({ 
  filename, 
  cutting_plans, 
  statistics,
  bom 
}: PlateNestingReportPDFProps) {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  // Define grayscale colors for plates (must match the app)
  const grayscaleColors = [
    '#e0e0e0', '#c0c0c0', '#a0a0a0', '#909090',
    '#707070', '#606060', '#505050', '#404040',
    '#d5d5d5', '#b5b5b5', '#959595', '#858585',
    '#757575', '#656565', '#555555', '#454545',
  ]

  const getGrayscaleColor = (rowNumber: number): string => {
    return grayscaleColors[(rowNumber - 1) % grayscaleColors.length]
  }

  return (
    <Document>
      {cutting_plans.map((plan, planIndex) => {
        const stockWidth = plan.stock_width
        const stockLength = plan.stock_length
        
        // Check if we need to rotate to landscape
        const isPortrait = stockLength > stockWidth
        const displayWidth = isPortrait ? stockLength : stockWidth
        const displayHeight = isPortrait ? stockWidth : stockLength
        
        // Calculate scaling to fit on page
        // A4 landscape: 841.89 x 595.28 points (11.69" x 8.27" at 72 DPI)
        const pageWidth = 841.89 - 40 // minus padding
        const pageHeight = 595.28 - 100 // minus padding and space for header/footer
        
        const scaleX = pageWidth / displayWidth
        const scaleY = pageHeight / displayHeight
        const scale = Math.min(scaleX, scaleY, 1) // Don't scale up, only down
        
        const svgWidth = displayWidth * scale
        const svgHeight = displayHeight * scale
        
        // Calculate stroke width based on scale
        const maxDim = Math.max(displayWidth, displayHeight)
        const strokeWidth = Math.max(1, maxDim * 0.001)
        
        // Calculate plate row numbers for coloring
        const plateToRowMap = new Map()
        const groupedForMapping = new Map()
        let rowNum = 1
        
        plan.plates.forEach((plate, idx) => {
          const baseName = plate.name ? plate.name.replace(/-\d+$/, '') : 'N/A'
          const key = createPlateGroupKey(baseName, plate.thickness, plate.width, plate.height)
          
          if (!groupedForMapping.has(key)) {
            groupedForMapping.set(key, rowNum)
            rowNum++
          }
          
          plateToRowMap.set(idx, groupedForMapping.get(key))
        })

        return (
          <Page key={planIndex} size="A4" orientation="landscape" style={styles.page}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Plate Nesting Report - Sheet {planIndex + 1} of {cutting_plans.length}</Text>
              <Text style={styles.subtitle}>File: {filename} • Generated: {currentDate}</Text>
              
              <View style={styles.infoRow}>
                <View>
                  <Text style={styles.infoLabel}>Stock Size:</Text>
                  <Text style={styles.infoValue}>{stockWidth} × {stockLength} mm</Text>
                </View>
                <View>
                  <Text style={styles.infoLabel}>Plates:</Text>
                  <Text style={styles.infoValue}>{plan.plates.length}</Text>
                </View>
                <View>
                  <Text style={styles.infoLabel}>Utilization:</Text>
                  <Text style={styles.infoValue}>{plan.utilization.toFixed(1)}%</Text>
                </View>
                <View>
                  <Text style={styles.infoLabel}>Overall Efficiency:</Text>
                  <Text style={styles.infoValue}>{statistics.overall_utilization.toFixed(1)}%</Text>
                </View>
              </View>
            </View>

            {/* SVG Visualization */}
            <View style={styles.svgContainer}>
              <Svg
                width={svgWidth}
                height={svgHeight}
                viewBox={`0 0 ${displayWidth} ${displayHeight}`}
                style={{ border: '2px solid #374151' }}
              >
                {/* Stock plate background */}
                <Rect
                  x={0}
                  y={0}
                  width={displayWidth}
                  height={displayHeight}
                  fill="#e5e7eb"
                  stroke="#374151"
                  strokeWidth={strokeWidth * 2}
                />

                {/* Nested plates */}
                {plan.plates.map((plate, idx) => {
                  const rowNumber = plateToRowMap.get(idx) || 1
                  const plateColor = getGrayscaleColor(rowNumber)
                  
                  // Transform coordinates if rotated for display
                  let plateX = plate.x
                  let plateY = plate.y
                  let plateWidth = plate.width
                  let plateHeight = plate.height
                  
                  if (isPortrait) {
                    plateX = plate.y
                    plateY = stockWidth - plate.x - plate.width
                    plateWidth = plate.height
                    plateHeight = plate.width
                  }
                  
                  // Calculate adaptive font size
                  const minPlateDim = Math.min(plateWidth, plateHeight)
                  const fontSize = Math.max(maxDim * 0.015, minPlateDim * 0.3)
                  
                  return (
                    <React.Fragment key={idx}>
                      {plate.svg_path ? (
                        // Render actual plate geometry
                        <Path
                          d={plate.svg_path}
                          fill={plateColor}
                          fillOpacity={0.8}
                          stroke="#000000"
                          strokeWidth={strokeWidth}
                        />
                      ) : (
                        // Render bounding box rectangle
                        <Rect
                          x={plateX}
                          y={plateY}
                          width={plateWidth}
                          height={plateHeight}
                          fill={plateColor}
                          fillOpacity={0.8}
                          stroke="#000000"
                          strokeWidth={strokeWidth}
                        />
                      )}
                    </React.Fragment>
                  )
                })}
              </Svg>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text>IFC2026 Plate Nesting System</Text>
              <Text>Sheet {planIndex + 1} / {cutting_plans.length}</Text>
              <Text>{currentDate}</Text>
            </View>
          </Page>
        )
      })}
    </Document>
  )
}

