import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

interface BoltData {
  bolt_name: string
  size: number | null
  length: number | null
  standard: string
  quantity: number
  assembly_mark: string
}

interface BoltsReportPDFProps {
  bolts: BoltData[]
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

export const BoltsReportPDF: React.FC<BoltsReportPDFProps> = ({ 
  bolts, 
  filename,
  currentDate
}) => {
  // Calculate summary statistics
  const totalBoltTypes = bolts.length
  const totalQuantity = bolts.reduce((sum, bolt) => sum + (bolt.quantity || 0), 0)
  const uniqueDiameters = Array.from(new Set(bolts.map(b => b.size).filter(s => s !== null))).length

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Title */}
        <Text style={styles.title}>Bolts Report</Text>
        <Text style={styles.subtitle}>{filename}</Text>
        <Text style={styles.subtitle}>Date: {currentDate}</Text>

        {/* Summary Section */}
        <View style={styles.summarySection}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Bolt Types:</Text>
            <Text style={styles.summaryValue}>{totalBoltTypes}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Quantity:</Text>
            <Text style={styles.summaryValue}>{totalQuantity} bolts</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Unique Diameters:</Text>
            <Text style={styles.summaryValue}>{uniqueDiameters} sizes</Text>
          </View>
        </View>

        {/* Bolts Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textLeft, { width: '25%' }]}>
              Bolt Name
            </Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '12%' }]}>
              Size (mm)
            </Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '13%' }]}>
              Length (mm)
            </Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textLeft, { width: '18%' }]}>
              Standard
            </Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textRight, { width: '12%' }]}>
              Quantity
            </Text>
            <Text style={[styles.tableCell, styles.tableCellHeader, styles.textLeft, { width: '20%', borderRightWidth: 0 }]}>
              Assembly
            </Text>
          </View>

          {/* Table Rows */}
          {bolts.map((bolt, index) => (
            <View 
              key={`${bolt.bolt_name}-${bolt.size}-${bolt.length}-${index}`} 
              style={[
                styles.tableRow,
                index === bolts.length - 1 ? { borderBottomWidth: 0 } : {}
              ]}
            >
              <Text style={[styles.tableCell, styles.textLeft, { width: '25%' }]}>
                {bolt.bolt_name}
              </Text>
              <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
                {bolt.size?.toFixed(0) || 'N/A'}
              </Text>
              <Text style={[styles.tableCell, styles.textRight, { width: '13%' }]}>
                {bolt.length?.toFixed(0) || 'N/A'}
              </Text>
              <Text style={[styles.tableCell, styles.textLeft, { width: '18%' }]}>
                {bolt.standard || 'N/A'}
              </Text>
              <Text style={[styles.tableCell, styles.textRight, { width: '12%' }]}>
                {bolt.quantity}
              </Text>
              <Text style={[styles.tableCell, styles.textLeft, { width: '20%', borderRightWidth: 0 }]}>
                {bolt.assembly_mark}
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

