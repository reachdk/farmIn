#!/bin/bash

# Farm Attendance System - Raspberry Pi Kiosk Installation Script
# This script sets up a Raspberry Pi as a kiosk for the farm attendance system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KIOSK_USER="kiosk"
APP_DIR="/opt/farm-attendance"
SERVICE_NAME="farm-attendance-kiosk"
DISPLAY_TIMEOUT="300" # 5 minutes
KIOSK_URL="http://localhost:3000/kiosk"

# Logging
LOG_FILE="/var/log/farm-attendance-install.log"
exec 1> >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root (use sudo)"
fi

log "Starting Farm Attendance System Raspberry Pi installation..."

# Update system
log "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install required packages
log "Installing required packages..."
apt-get install -y \
    curl \
    wget \
    git \
    unzip \
    sqlite3 \
    nginx \
    chromium-browser \
    xorg \
    openbox \
    lightdm \
    nodejs \
    npm \
    python3 \
    python3-pip \
    build-essential \
    libsqlite3-dev \
    libnss3-dev \
    libatk-bridge2.0-dev \
    libdrm2 \
    libxkbcommon0 \
    libgtk-3-dev \
    libgbm1

# Install Docker
log "Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker pi
rm get-docker.sh

# Install Docker Compose
log "Installing Docker Compose..."
pip3 install docker-compose

# Create kiosk user
log "Creating kiosk user..."
if ! id "$KIOSK_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$KIOSK_USER"
    usermod -aG video,audio,input "$KIOSK_USER"
fi

# Create application directory
log "Setting up application directory..."
mkdir -p "$APP_DIR"
chown -R "$KIOSK_USER:$KIOSK_USER" "$APP_DIR"

# Download and setup application
log "Downloading Farm Attendance System..."
cd "$APP_DIR"

# If this script is part of the repo, copy files
if [ -f "../docker-compose.yml" ]; then
    cp -r ../* .
else
    # Download from repository (adjust URL as needed)
    git clone https://github.com/your-org/farm-attendance-system.git .
fi

chown -R "$KIOSK_USER:$KIOSK_USER" "$APP_DIR"

# Build and start Docker containers
log "Building and starting Docker containers..."
sudo -u "$KIOSK_USER" docker-compose up -d --build

# Wait for application to be ready
log "Waiting for application to start..."
sleep 30

# Test application
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    log "Application is running successfully"
else
    warn "Application may not be fully ready yet"
fi

# Configure kiosk mode
log "Configuring kiosk mode..."

# Create kiosk startup script
cat > /home/$KIOSK_USER/start-kiosk.sh << EOF
#!/bin/bash

# Wait for X server
while ! xset q &>/dev/null; do
    sleep 1
done

# Disable screen blanking
xset s off
xset -dpms
xset s noblank

# Hide cursor after inactivity
unclutter -idle 1 &

# Start chromium in kiosk mode
chromium-browser \\
    --kiosk \\
    --no-sandbox \\
    --disable-web-security \\
    --disable-features=TranslateUI \\
    --disable-ipc-flooding-protection \\
    --disable-renderer-backgrounding \\
    --disable-backgrounding-occluded-windows \\
    --disable-background-timer-throttling \\
    --disable-background-networking \\
    --disable-breakpad \\
    --disable-component-extensions-with-background-pages \\
    --disable-dev-shm-usage \\
    --disable-extensions \\
    --disable-features=TranslateUI,BlinkGenPropertyTrees \\
    --disable-hang-monitor \\
    --disable-infobars \\
    --disable-logging \\
    --disable-login-animations \\
    --disable-notifications \\
    --disable-popup-blocking \\
    --disable-prompt-on-repost \\
    --disable-session-crashed-bubble \\
    --disable-setuid-sandbox \\
    --disable-translate \\
    --disable-web-security \\
    --enable-features=NetworkService,NetworkServiceLogging \\
    --force-color-profile=srgb \\
    --metrics-recording-only \\
    --no-crash-upload \\
    --no-default-browser-check \\
    --no-first-run \\
    --no-pings \\
    --no-sandbox \\
    --no-zygote \\
    --password-store=basic \\
    --use-mock-keychain \\
    --autoplay-policy=no-user-gesture-required \\
    --start-fullscreen \\
    "$KIOSK_URL"
EOF

chmod +x /home/$KIOSK_USER/start-kiosk.sh
chown $KIOSK_USER:$KIOSK_USER /home/$KIOSK_USER/start-kiosk.sh

# Configure openbox for kiosk user
mkdir -p /home/$KIOSK_USER/.config/openbox
cat > /home/$KIOSK_USER/.config/openbox/autostart << EOF
# Start the kiosk application
/home/$KIOSK_USER/start-kiosk.sh &
EOF

chown -R $KIOSK_USER:$KIOSK_USER /home/$KIOSK_USER/.config

# Configure LightDM for auto-login
log "Configuring auto-login..."
cat > /etc/lightdm/lightdm.conf << EOF
[Seat:*]
autologin-user=$KIOSK_USER
autologin-user-timeout=0
user-session=openbox
EOF

# Create systemd service for application monitoring
log "Creating system service..."
cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Farm Attendance System Kiosk
After=network.target docker.service
Requires=docker.service

[Service]
Type=forking
User=$KIOSK_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

# Configure network settings
log "Configuring network settings..."

# Enable SSH (optional, for remote management)
systemctl enable ssh
systemctl start ssh

# Configure WiFi (if needed)
if [ ! -z "$WIFI_SSID" ] && [ ! -z "$WIFI_PASSWORD" ]; then
    log "Configuring WiFi..."
    cat >> /etc/wpa_supplicant/wpa_supplicant.conf << EOF

network={
    ssid="$WIFI_SSID"
    psk="$WIFI_PASSWORD"
}
EOF
fi

# Configure firewall
log "Configuring firewall..."
ufw --force enable
ufw allow ssh
ufw allow 3000/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Set up log rotation
log "Setting up log rotation..."
cat > /etc/logrotate.d/farm-attendance << EOF
/var/log/farm-attendance*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 $KIOSK_USER $KIOSK_USER
}
EOF

# Create maintenance scripts
log "Creating maintenance scripts..."
mkdir -p /opt/farm-attendance/scripts

cat > /opt/farm-attendance/scripts/restart-kiosk.sh << EOF
#!/bin/bash
# Restart the kiosk display
sudo systemctl restart lightdm
EOF

cat > /opt/farm-attendance/scripts/update-system.sh << EOF
#!/bin/bash
# Update the farm attendance system
cd $APP_DIR
docker-compose pull
docker-compose up -d --build
docker system prune -f
EOF

chmod +x /opt/farm-attendance/scripts/*.sh

# Configure automatic updates (optional)
if [ "$AUTO_UPDATE" = "true" ]; then
    log "Setting up automatic updates..."
    cat > /etc/cron.d/farm-attendance-update << EOF
# Update farm attendance system daily at 2 AM
0 2 * * * $KIOSK_USER /opt/farm-attendance/scripts/update-system.sh >> /var/log/farm-attendance-update.log 2>&1
EOF
fi

# Configure hardware-specific settings
log "Configuring hardware settings..."

# Disable unnecessary services to save resources
systemctl disable bluetooth
systemctl disable cups
systemctl disable avahi-daemon

# Configure GPU memory split for better performance
if grep -q "gpu_mem" /boot/config.txt; then
    sed -i 's/gpu_mem=.*/gpu_mem=128/' /boot/config.txt
else
    echo "gpu_mem=128" >> /boot/config.txt
fi

# Enable hardware acceleration
if ! grep -q "dtoverlay=vc4-kms-v3d" /boot/config.txt; then
    echo "dtoverlay=vc4-kms-v3d" >> /boot/config.txt
fi

# Create status check script
cat > /opt/farm-attendance/scripts/status-check.sh << EOF
#!/bin/bash
echo "=== Farm Attendance System Status ==="
echo "Date: \$(date)"
echo ""
echo "Docker containers:"
docker-compose ps
echo ""
echo "Application health:"
curl -s http://localhost:3000/health | jq . || echo "Health check failed"
echo ""
echo "System resources:"
free -h
df -h /
echo ""
echo "Network status:"
ip addr show | grep inet
EOF

chmod +x /opt/farm-attendance/scripts/status-check.sh

# Final setup
log "Finalizing installation..."

# Create desktop shortcut for manual kiosk restart (if needed)
mkdir -p /home/$KIOSK_USER/Desktop
cat > /home/$KIOSK_USER/Desktop/restart-kiosk.desktop << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Restart Kiosk
Comment=Restart the Farm Attendance Kiosk
Exec=/opt/farm-attendance/scripts/restart-kiosk.sh
Icon=system-restart
Terminal=false
Categories=System;
EOF

chown $KIOSK_USER:$KIOSK_USER /home/$KIOSK_USER/Desktop/restart-kiosk.desktop
chmod +x /home/$KIOSK_USER/Desktop/restart-kiosk.desktop

log "Installation completed successfully!"
log "The system will reboot in 10 seconds to apply all changes..."
log ""
log "After reboot, the kiosk will automatically start."
log "You can check the status by running: /opt/farm-attendance/scripts/status-check.sh"
log ""
log "Installation log saved to: $LOG_FILE"

# Reboot to apply all changes
sleep 10
reboot