#!/usr/bin/env python3
"""
Simple script to run the FastAPI server
"""
import uvicorn
import sys

if __name__ == "__main__":
    # Configure uvicorn to show all logs and not use subprocess for reload
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=False,  # Disable reload to see console output
        log_level="debug",  # Use debug level to see all logs
        access_log=True
    )










