FROM python:3.11-slim

# Install OpenVPN and dependencies
RUN apt-get update && apt-get install -y \
    openvpn \
    iproute2 \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app.py .
COPY vpn_manager.py .
COPY docker_start.sh .

# Copy logo if present (optional)
COPY logo_global.jpg* ./

# Make start script executable
RUN chmod +x docker_start.sh

EXPOSE 8080

CMD ["./docker_start.sh"]
