import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

interface FastenerData {
  anchor_name: string
  assembly_mark: string
  profile_name: string
  length: number | null
  weight: number
  quantity: number
  total_weight: number
}

interface FastenersReportPDFProps {
  fasteners: FastenerData[]
  filename: string
  currentDate: string
}

// Define styles for PDF
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica'
  },
  title: {
    fontSize: 24,
    marginBottom: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#1f2937'
  },
  subtitle: {
    fontSize: 12,
    marginBottom: 5,
    textAlign: 'center',
    color: '#4b5563'
  },
  summarySection: {
    marginTop: 20,
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#f9fafb',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'solid'
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#374151'
  },
  summaryValue: {
    fontSize: 11,
    color: '#1f2937'
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginTop: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    borderBottomStyle: 'solid',
  },
  tableHeader: {
    backgroundColor: '#374151',
    color: '#ffffff',
  },
  tableCell: {
    padding: 8,
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: '#d1d5db',
    borderRightStyle: 'solid',
  },
  tableCellHeader: {
    fontWeight: 'bold',
    fontSize: 10,
  },
  textRight: {
    textAlign: 'right',
  },
  textLeft: {
    textAlign: 'left',
  },
  textCenter: {
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 8,
    color: '#6b7280',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    borderTopStyle: 'solid',
    paddingTop: 10,
  }
})

export const FastenersReportPDF: React.FC<FastenersReportPDFProps> = ({ 
  fasteners, 
  filename,
  currentDate
}) => {
  // Calculate summary statistics
  const totalFastenerTypes = fasteners.length
  const totalQuantity = fasteners.reduce((sum, fastener) => sum + (fastener.quantity || 0), 0)
  const totalWeight = fasteners.reduce((sum, fastener) => sum + (fastener.total_weight || 0), 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Title */}
        <Text style={styles.title}>Fasteners Report</Text>
        <Text style={styles.subtitle}>{filename}</Text>
        <Text style={styles.subtitle}>Date: {currentDate}</Text>

        {/* Summary Section */}
        <View style={styles.summarySection}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Fastener Types:</Text>
            <Text style={styles.summaryValue}>{totalFastenerTypes}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Quantity:</Text>
            <Text style={styles.summaryValue}>{totalQuantity} pieces</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Weight:</Text>
            <Text style={styles.summaryValue}>{totalWeight.toFixed(2)} kg</Text>
          </View>
        </View>

        {/* Fasteners Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textLeft, { width: '22%' }]}>
              Anchor Name
            </Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textLeft, { width: '18%' }]}>
              Assembly
            </Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textLeft, { width: '18%' }]}>
              Profile Name
            </Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '12%' }]}>
              Length (mm)
            </Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '12%' }]}>
              Weight (kg)
            </Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '10%' }]}>
              Quantity
            </Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '8%', borderRightWidth: 0 }]}>
              Total (kg)
            </Text>
          </View>

          {/* Table Rows */}
          {fasteners.map((fastener, index) => (
            <View 
              key={`${fastener.anchor_name}-${fastener.profile_name}-${index}`} 
              style={[
                styles.tableRow,
                index === fasteners.length - 1 ? { borderBottomWidth: 0 } : {}
              ]}
            >
              <Text style={[styles.tableCell, styles.textLeft, { width: '22%' }]}>
                {fastener.anchor_name}
              </Text>
              <Text style={[styles.tableCell, styles.textLeft, { width: '18%' }]}>
                {fastener.assembly_mark}
              </Text>
              <Text style={[styles.tableCell, styles.textLeft, { width: '18%' }]}>
                {fastener.profile_name || 'N/A'}
              </Text>
              <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
                {fastener.length?.toFixed(1) || 'N/A'}
              </Text>
              <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
                {fastener.weight.toFixed(2)}
              </Text>
              <Text style={[styles.tableCell, styles.textRight, { width: '10%' }]}>
                {fastener.quantity}
              </Text>
              <Text style={[styles.tableCell, styles.textRight, { width: '8%', borderRightWidth: 0 }]}>
                {fastener.total_weight.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Generated on {currentDate} | Page 1 of 1
        </Text>
      </Page>
    </Document>
  )
}

