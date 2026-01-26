# Management Tab - Production Tracking

## Overview

The **Management** tab has been added to track the production status of assemblies through completion and shipment stages.

## Features

### 1. Statistics Cards (Section 1)

Three prominent cards display key metrics:

#### Total Assemblies Card 🏗️
- **Amount**: Total number of assemblies
- **Tonnage**: Total weight in tonnes

#### Completed Card ✓
- **Amount**: Number of completed assemblies
- **Percentage**: Percentage of total assemblies completed
- **Tonnage**: Total weight of completed assemblies in tonnes

#### Shipped Card 🚚
- **Amount**: Number of shipped assemblies
- **Percentage**: Percentage of total assemblies shipped
- **Tonnage**: Total weight of shipped assemblies in tonnes

### 2. Filter & Search Section (Section 2)

Four filtering options:

1. **Search** (Free text)
   - Search across assembly name, profile, length, and weight
   - Clear button appears when text is entered

2. **Main Profile** (Dropdown)
   - Filter by main structural profile
   - Options: All Profiles, [profile names]

3. **Assembly Name** (Dropdown)
   - Filter by assembly mark
   - Options: All Assemblies, [assembly names]

4. **Status** (Dropdown) - NEW!
   - Filter by production status
   - Options:
     - All Status
     - In Progress (not completed)
     - Completed (completed but not shipped)
     - Shipped

**Clear All Button**: Resets all filters at once

**Results Counter**: Shows "Showing X of Y assemblies"

### 3. Assemblies Table (Section 3)

Enhanced table with status tracking:

| Column | Description |
|--------|-------------|
| Assembly Name | Assembly mark/identifier |
| Main Profile | Primary structural profile |
| Length (mm) | Assembly length |
| Weight (kg) | Assembly weight |
| **Completed** ✓ | Checkbox to mark as completed |
| **Shipped** 🚚 | Checkbox to mark as shipped |
| Preview | View 3D button |

#### Status Behavior

1. **Completed Checkbox**:
   - Toggle to mark assembly as completed
   - When unchecked, also unchecks "Shipped"

2. **Shipped Checkbox**:
   - Only enabled if assembly is completed
   - Disabled (grayed out) for non-completed assemblies
   - Cannot ship incomplete assemblies

3. **Visual Indicators**:
   - **White background**: In progress
   - **Green background**: Completed (not shipped)
   - **Blue background**: Shipped

### 4. Preview Modal

Click "View 3D" to see the assembly in a 3D viewer modal (same as Shipment tab).

## Workflow

### Typical Production Flow

1. **Upload IFC File**
   - All assemblies start as "In Progress"

2. **Mark as Completed**
   - As assemblies are fabricated, check the "Completed" box
   - Assembly row turns green
   - Statistics update automatically

3. **Mark as Shipped**
   - Once ready to ship, check the "Shipped" box
   - Only available for completed assemblies
   - Assembly row turns blue
   - Statistics update automatically

4. **Track Progress**
   - Use statistics cards to monitor overall progress
   - Use filters to focus on specific status or profiles
   - Export reports as needed

### Example Workflow

```
Assembly A-1 (IPE600)
└─> In Progress (white background)
    └─> Completed ✓ (green background, 33% completed)
        └─> Shipped ✓ (blue background, 33% shipped)

Assembly A-2 (HEA300)
└─> In Progress (white background)
    └─> Completed ✓ (green background, 67% completed)

Assembly A-3 (UPN200)
└─> In Progress (white background)
```

## API Endpoints

Three new backend endpoints support this feature:

### 1. GET `/api/management-assemblies/{filename}`
- Returns all assemblies with their current status
- Includes `completed` and `shipped` boolean flags

### 2. POST `/api/management-assemblies/{filename}/toggle-completed`
- Toggles the completed status of an assembly
- Body: `{ "assembly_id": number, "completed": boolean }`
- Auto-unchecks "shipped" if uncompleting

### 3. POST `/api/management-assemblies/{filename}/toggle-shipped`
- Toggles the shipped status of an assembly
- Body: `{ "assembly_id": number, "shipped": boolean }`

## Data Persistence

Currently, assembly status is stored **in-memory** on the backend server:
- Status persists while server is running
- Status is reset when server restarts
- Status is per-file (different files have independent tracking)

### Future Enhancement Options

For production use, consider:
1. **Database Storage**: PostgreSQL, MySQL, or SQLite
2. **File-Based Storage**: JSON files per IFC file
3. **LocalStorage**: Browser-based (client-side only)

## Technical Details

### Frontend Components

- **File**: `web/src/components/Management.tsx`
- **Framework**: React + TypeScript
- **Styling**: Tailwind CSS
- **Similar to**: Shipment.tsx (reuses patterns)

### Backend Implementation

- **File**: `api/main.py`
- **Storage**: In-memory dictionary
  ```python
  assembly_status_storage = {
    "filename.ifc": {
      assembly_id: {
        "completed": bool,
        "shipped": bool
      }
    }
  }
  ```

### Status Logic

```typescript
// Completed checkbox
toggleCompleted(assemblyId) {
  completed = !completed
  if (!completed) {
    shipped = false  // Auto-uncheck shipped
  }
}

// Shipped checkbox
toggleShipped(assemblyId) {
  if (!completed && !shipped) {
    // Cannot ship if not completed
    return alert("Must complete first")
  }
  shipped = !shipped
}
```

## Navigation

Access the Management tab:
1. Upload an IFC file
2. Click the **"Management"** tab in the main navigation
3. Located after: Dashboard, Model, Nesting, Shipment

## Comparison with Shipment Tab

| Feature | Shipment | Management |
|---------|----------|------------|
| Purpose | Select for shipping | Track production status |
| Selection | Checkboxes for PDF export | Status tracking (completed/shipped) |
| Cards | Total, Selected, Weight | Total, Completed, Shipped |
| Filters | Search, Profile, Assembly | Search, Profile, Assembly, **Status** |
| Actions | Export PDF | Toggle status |
| Visual | Selected = blue bg | In progress/Completed/Shipped = white/green/blue |

## Benefits

1. **Real-time Tracking**: See production progress at a glance
2. **Filtering**: Quickly find assemblies by status
3. **Statistics**: Visual progress indicators with percentages
4. **Validation**: Cannot ship incomplete assemblies
5. **Integration**: Works seamlessly with existing IFC data

## Future Enhancements

Potential improvements:
1. **Date Tracking**: Record when completed/shipped
2. **User Tracking**: Track who marked status changes
3. **Notes/Comments**: Add notes to assemblies
4. **History Log**: View status change history
5. **Batch Operations**: Mark multiple assemblies at once
6. **Export Reports**: Export production status reports
7. **Notifications**: Alert when milestones reached
8. **Database Persistence**: Save status permanently

## Screenshots Reference

The tab displays:
- Clean, modern design matching existing tabs
- Color-coded status (white → green → blue)
- Disabled checkboxes when prerequisites not met
- Responsive layout for mobile/tablet/desktop

## Usage Tips

1. **Use Status Filter**: Filter by "In Progress" to see what needs work
2. **Monitor Percentages**: Track progress towards completion goals
3. **Filter by Profile**: Focus on specific profile types
4. **Use Search**: Quickly find specific assemblies
5. **Visual Scanning**: Green = ready to ship, Blue = already shipped

---

## Summary

The Management tab provides comprehensive production tracking with:
- ✅ 3 statistics cards (Total, Completed, Shipped)
- ✅ 4 filters (Search, Profile, Assembly, Status)
- ✅ Enhanced table with status checkboxes
- ✅ Visual status indicators
- ✅ Smart validation (no shipping incomplete assemblies)
- ✅ Real-time updates
- ✅ Seamless integration with existing tabs

Perfect for tracking assembly fabrication and shipment workflows!

