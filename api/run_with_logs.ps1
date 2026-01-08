# PowerShell script to run the backend and save logs to a file
# Logs will be saved to backend.log

Set-Location $PSScriptRoot
.\venv\Scripts\python.exe run.py *> backend.log






