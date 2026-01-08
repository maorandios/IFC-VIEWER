# Quick Start Guide

## Prerequisites
- Node.js 18+ and npm
- Python 3.9+
- pip

## Quick Setup

### 1. Backend Setup (Terminal 1)

```bash
cd api
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
python run.py
```

Backend will run on `http://localhost:8000`

### 2. Frontend Setup (Terminal 2)

```bash
cd web
npm install
npm run dev
```

Frontend will run on `http://localhost:5173`

## Usage

1. Open `http://localhost:5173` in your browser
2. Click "Upload IFC File" and select an IFC file
3. View the 3D model and steel reports
4. Use toggles to show/hide different element types
5. Click on elements to see their details
6. Export reports as CSV

## Troubleshooting

- **Backend won't start**: Make sure port 8000 is available
- **Frontend won't start**: Make sure port 5173 is available
- **IFC file won't load**: Check browser console for errors
- **IfcOpenShell errors**: May need system dependencies (Visual C++ on Windows)










