#!/bin/bash
set -e

echo "=== Global66 Customer Report API ==="

# Connect to VPN if profile.ovpn exists and DB is not yet reachable
if [ -f "/app/profile.ovpn" ]; then
  echo "Connecting to VPN..."
  python3 -c "import vpn_manager; vpn_manager.connect_or_exit()"
  echo "VPN connected."
else
  echo "WARNING: profile.ovpn not found. Skipping VPN connection."
  echo "The DB may not be reachable without VPN."
fi

echo "Starting Flask API on port ${PORT:-8080}..."
exec gunicorn \
  --bind "0.0.0.0:${PORT:-8080}" \
  --workers 2 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile - \
  app:app
