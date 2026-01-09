#!/usr/bin/env python3
"""
Simple script to view the last N lines of nesting debug output
"""
import sys
from pathlib import Path

log_file = Path(__file__).parent / "nesting_debug.log"

if log_file.exists():
    with open(log_file, "r", encoding="utf-8") as f:
        lines = f.readlines()
        # Show last 200 lines
        for line in lines[-200:]:
            print(line, end="")
else:
    print(f"Log file not found: {log_file}")
    print("The backend may not have generated any logs yet.")
    print("Make sure you run a nesting calculation first.")

