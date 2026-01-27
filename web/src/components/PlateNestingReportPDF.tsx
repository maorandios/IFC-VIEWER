import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

interface PlateInPlan {
  x: number
  y: number
  width: number
  height: number
  name: string
  thickness: string
  id: string
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

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica'
  },
  title: {
    fontSize: 20,
    marginBottom: 10,
    fontWeight: 'bold'
  },
  subtitle: {
    fontSize: 12,
    marginBottom: 20,
    color: '#666'
  },
  section: {
    marginBottom: 15
  },
  sectionTitle: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: 'bold',
    color: '#333'
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 4
  },
  summaryItem: {
    flex: 1
  },
  summaryLabel: {
    fontSize: 9,
    color: '#666',
    marginBottom: 2
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000'
  },
  table: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    padding: 8,
    fontWeight: 'bold'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    padding: 8
  },
  tableCell: {
    flex: 1,
    fontSize: 9
  },
  planSection: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#fafafa',
    borderRadius: 4
  },
  planTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5
  },
  planDetails: {
    fontSize: 9,
    color: '#666',
    marginBottom: 10
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    color: '#666',
    fontSize: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10
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

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <Text style={styles.title}>Plate Nesting Report</Text>
        <Text style={styles.subtitle}>
          File: {filename} • Generated: {currentDate}
        </Text>

        {/* Summary Statistics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.summary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Plates</Text>
              <Text style={styles.summaryValue}>{statistics.total_plates}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Stock Sheets</Text>
              <Text style={styles.summaryValue}>{statistics.stock_sheets_used}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Utilization</Text>
              <Text style={styles.summaryValue}>{statistics.overall_utilization}%</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Waste</Text>
              <Text style={styles.summaryValue}>{statistics.waste_percentage}%</Text>
            </View>
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Area</Text>
              <Text style={styles.summaryValue}>{statistics.total_stock_area_m2} m²</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Used Area</Text>
              <Text style={styles.summaryValue}>{statistics.total_used_area_m2} m²</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Waste Area</Text>
              <Text style={styles.summaryValue}>{statistics.waste_area_m2} m²</Text>
            </View>
          </View>
        </View>

        {/* Bill of Materials */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill of Materials (BOM)</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, { flex: 2 }]}>Dimensions (mm)</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>Thickness</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>Quantity</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>Area (m²)</Text>
            </View>
            {bom.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 2 }]}>{item.dimensions}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{item.thickness}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{item.quantity}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{item.area_m2.toFixed(3)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Cutting Plans Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cutting Plans</Text>
          {cutting_plans.map((plan, index) => (
            <View key={index} style={styles.planSection}>
              <Text style={styles.planTitle}>
                {plan.stock_name} - {plan.stock_width} × {plan.stock_length} mm
              </Text>
              <Text style={styles.planDetails}>
                Plates: {plan.plates.length} • Utilization: {plan.utilization}%
              </Text>
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>Plate</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>Dimensions</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>Thickness</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>Position</Text>
                </View>
                {plan.plates.map((plate, plateIdx) => (
                  <View key={plateIdx} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 2 }]}>{plate.name}</Text>
                    <Text style={[styles.tableCell, { flex: 1 }]}>
                      {plate.width}×{plate.height}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1 }]}>{plate.thickness}</Text>
                    <Text style={[styles.tableCell, { flex: 1 }]}>
                      ({Math.round(plate.x)}, {Math.round(plate.y)})
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Generated on {currentDate} • Page 1
        </Text>
      </Page>
    </Document>
  )
}

