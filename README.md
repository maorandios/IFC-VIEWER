# IFC Steel Viewer

A fully web-based application for uploading IFC files, viewing them in 3D, and generating steel reports.

## Features

- **IFC File Upload**: Upload and process IFC files via web interface
- **3D Viewer**: Interactive 3D visualization using IFC.js (That Open Company)
  - Default view shows steel elements only (IfcBeam, IfcColumn, IfcMember, IfcPlate)
  - Toggle visibility for steel, fasteners, proxies, and edges
  - Click selection to identify elements (expressID + IFC type)
- **Steel Reports**: Comprehensive analysis including:
  - Total tonnage
  - Assemblies (mark, weight, member/plate counts)
  - Profiles (name, type, count, weight)
  - Plates (thickness/profile, count, weight)
- **CSV Export**: Download reports as CSV files
- **High-Fidelity View**: Optional glTF conversion for improved geometry quality

## Tech Stack

### Frontend
- Vite + React + TypeScript
- Three.js for 3D rendering
- IFC.js (@thatopen/components, @thatopen/fragments, @thatopen/fragments-ifc)
- shadcn/ui components (tabs, buttons)
- TanStack Table for data tables

### Backend
- Python FastAPI
- IfcOpenShell for IFC processing
- Local filesystem storage

## Project Structure

```
IFC-1412/
├── web/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── types.ts     # TypeScript types
│   │   └── ...
│   ├── package.json
│   └── vite.config.ts
├── api/                 # FastAPI backend
│   ├── main.py         # API endpoints
│   └── requirements.txt
└── storage/             # File storage
    ├── ifc/            # Uploaded IFC files
    ├── reports/        # Generated JSON reports
    └── gltf/           # Converted glTF files
```

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+
- pip

### Backend Setup

1. Navigate to the API directory:
```bash
cd api
```

2. Create a virtual environment (recommended):
```bash
python -m venv venv
```

3. Activate the virtual environment:
   - Windows:
     ```bash
     venv\Scripts\activate
     ```
   - Linux/Mac:
     ```bash
     source venv/bin/activate
     ```

4. Install dependencies:
```bash
pip install -r requirements.txt
```

5. Start the FastAPI server:
```bash
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the web directory:
```bash
cd web
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Usage

1. **Upload IFC File**:
   - Click "Upload IFC File" button
   - Select an IFC file from your computer
   - The file will be uploaded and analyzed automatically

2. **View 3D Model**:
   - The model appears in the 3D viewer on the left
   - By default, only steel elements are shown
   - Use checkboxes to toggle:
     - Show Steel
     - Show Fasteners
     - Show Proxies
     - Show Edges
   - Click on elements to see their expressID and IFC type

3. **View Reports**:
   - Steel reports appear in the right panel
   - Switch between tabs:
     - **Assemblies**: Grouped by assembly mark
     - **Profiles**: Grouped by profile name and type
     - **Plates**: Grouped by thickness/profile
   - Click "Export CSV" to download the current report

4. **High-Fidelity View** (Optional):
   - Click "High Fidelity View" button to convert IFC to glTF
   - Note: Full implementation requires additional conversion libraries

## API Endpoints

- `POST /api/upload` - Upload IFC file
- `GET /api/report/{filename}` - Get report for a file
- `GET /api/ifc/{filename}` - Serve IFC file for viewer
- `GET /api/export/{filename}/{report_type}` - Export report as CSV
- `POST /api/convert-gltf/{filename}` - Convert IFC to glTF
- `GET /api/health` - Health check

## Development Notes

- The application uses CORS to allow frontend-backend communication
- Files are stored locally in the `storage/` directory
- No authentication or database required for MVP
- The viewer and reports work independently

## Troubleshooting

### Backend Issues

- **IfcOpenShell installation fails**: Ensure you have the required system dependencies. On Windows, you may need Visual C++ redistributables.
- **Port 8000 already in use**: Change the port in the uvicorn command: `--port 8001`

### Frontend Issues

- **IFC.js not loading**: Ensure all dependencies are installed: `npm install`
- **CORS errors**: Make sure the backend is running and CORS is properly configured
- **Model not displaying**: Check browser console for errors. Ensure the IFC file is valid.

## Future Enhancements

- Full glTF conversion implementation
- Database integration for file management
- User authentication
- Advanced filtering and search
- Multiple file comparison
- Export to other formats (PDF, Excel)

## Auto Git Push (Optional)

The project includes an automatic git commit and push feature that watches for file changes and automatically saves them to GitHub.

### How to Use Auto Git Push

1. **Start the auto-push watcher** (in a separate terminal):
   ```powershell
   .\auto-git-push.ps1
   ```

2. **Make changes to your code** - The script will automatically:
   - Detect file changes
   - Wait 5 seconds after the last change (debounce)
   - Commit all changes with a timestamp
   - Push to GitHub automatically

3. **Stop the watcher**: Press `Ctrl+C` in the terminal running the script

### Configuration

You can customize the auto-push behavior by editing `auto-git-push.ps1`:
- `$DEBOUNCE_SECONDS`: Time to wait after last change before committing (default: 5 seconds)
- `$GIT_BRANCH`: Git branch to push to (default: "main")
- `$IGNORE_PATTERNS`: Files/patterns to ignore (already respects .gitignore)

### Important Notes

- ⚠️ **All changes are automatically committed and pushed** - Make sure you're okay with this!
- The script respects `.gitignore` and won't commit ignored files
- If there are no changes, it won't create empty commits
- Errors during push are logged but won't crash the watcher

## License

This project is provided as-is for demonstration purposes.










