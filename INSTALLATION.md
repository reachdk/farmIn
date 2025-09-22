# Farm Attendance System - Installation Guide

This guide provides comprehensive instructions for installing and deploying the Farm Attendance System in various environments.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Quick Start with Docker](#quick-start-with-docker)
3. [Raspberry Pi Kiosk Installation](#raspberry-pi-kiosk-installation)
4. [Manual Installation](#manual-installation)
5. [Configuration](#configuration)
6. [Backup and Restore](#backup-and-restore)
7. [Monitoring and Maintenance](#monitoring-and-maintenance)
8. [Troubleshooting](#troubleshooting)

## System Requirements

### Minimum Requirements
- **CPU**: 1 core, 1 GHz
- **RAM**: 512 MB
- **Storage**: 2 GB available space
- **OS**: Linux (Ubuntu 18.04+, Debian 9+, CentOS 7+), macOS 10.14+, Windows 10

### Recommended Requirements
- **CPU**: 2+ cores, 2 GHz
- **RAM**: 2 GB
- **Storage**: 10 GB available space
- **Network**: Stable internet connection for sync

### For Raspberry Pi Kiosks
- **Model**: Raspberry Pi 3B+ or newer
- **RAM**: 1 GB minimum (2 GB recommended)
- **Storage**: 16 GB microSD card (Class 10)
- **Display**: HDMI-compatible monitor or touchscreen
- **Network**: WiFi or Ethernet connection

## Quick Start with Docker

### Prerequisites
- Docker 20.10+
- Docker Compose 1.29+

### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/farm-attendance-system.git
   cd farm-attendance-system
   ```

2. **Start the application**:
   ```bash
   docker-compose up -d
   ```

3. **Verify installation**:
   ```bash
   curl http://localhost:3000/health
   ```

4. **Access the application**:
   - Web interface: http://localhost:3000
   - Kiosk interface: http://localhost:3000/kiosk

### Production Deployment

1. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

2. **Generate SSL certificates**:
   ```bash
   mkdir -p nginx/ssl
   # Add your SSL certificates to nginx/ssl/
   ```

3. **Start with SSL**:
   ```bash
   docker-compose -f docker-compose.yml up -d
   ```

## Raspberry Pi Kiosk Installation

### Automated Installation

1. **Download and run the installation script**:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/your-org/farm-attendance-system/main/scripts/install-raspberry-pi.sh -o install.sh
   sudo bash install.sh
   ```

2. **Configure WiFi (optional)**:
   ```bash
   export WIFI_SSID="YourWiFiName"
   export WIFI_PASSWORD="YourWiFiPassword"
   sudo bash install.sh
   ```

### Manual Raspberry Pi Setup

1. **Prepare the SD card**:
   - Flash Raspberry Pi OS Lite to SD card
   - Enable SSH by creating empty `ssh` file in boot partition

2. **Initial setup**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo raspi-config
   # Enable SSH, set timezone, expand filesystem
   ```

3. **Install dependencies**:
   ```bash
   sudo apt install -y git docker.io docker-compose nodejs npm
   sudo usermod -aG docker pi
   ```

4. **Clone and setup**:
   ```bash
   git clone https://github.com/your-org/farm-attendance-system.git
   cd farm-attendance-system
   docker-compose up -d
   ```

5. **Configure kiosk mode**:
   ```bash
   sudo ./scripts/install-raspberry-pi.sh
   ```

## Manual Installation

### Prerequisites
- Node.js 18+
- npm 8+
- SQLite 3
- Git

### Installation Steps

1. **Clone repository**:
   ```bash
   git clone https://github.com/your-org/farm-attendance-system.git
   cd farm-attendance-system
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the application**:
   ```bash
   npm run build
   ```

4. **Initialize database**:
   ```bash
   npm run migrate
   ```

5. **Start the application**:
   ```bash
   npm start
   ```

### Development Setup

1. **Install development dependencies**:
   ```bash
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Run tests**:
   ```bash
   npm test
   npm run test:e2e
   ```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Application
NODE_ENV=production
PORT=3000

# Database
DATABASE_PATH=./data/farm_attendance.db

# File Storage
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=50MB

# Backup
BACKUP_PATH=./backups
AUTO_BACKUP_ENABLED=true
AUTO_BACKUP_INTERVAL=24h
BACKUP_RETENTION_DAYS=30

# Security
JWT_SECRET=your-secret-key-here
SESSION_TIMEOUT=8h

# Sync
SYNC_INTERVAL=300
MAX_OFFLINE_DAYS=7

# Kiosk
KIOSK_TIMEOUT=300
KIOSK_AUTO_REFRESH=true

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

### Database Configuration

The system uses SQLite by default. For production deployments:

1. **Ensure proper permissions**:
   ```bash
   mkdir -p data
   chmod 755 data
   ```

2. **Configure backup location**:
   ```bash
   mkdir -p backups
   chmod 755 backups
   ```

### Network Configuration

For kiosk deployments, configure static IP:

```bash
# /etc/dhcpcd.conf
interface eth0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1 8.8.8.8
```

## Backup and Restore

### Automated Backups

Backups are automatically created when using Docker:

```bash
# Check backup status
docker-compose exec farm-attendance ls -la /app/backups

# Manual backup
docker-compose exec farm-attendance /app/scripts/backup-database.sh
```

### Manual Backup

```bash
# Create backup
./scripts/backup-database.sh [database_path] [backup_directory] [retention_days]

# Example
./scripts/backup-database.sh ./data/farm_attendance.db ./backups 30
```

### Restore from Backup

```bash
# List available backups
ls -la backups/

# Restore from backup
./scripts/restore-database.sh backups/farm_attendance_20231201_120000.db.gz

# Force restore (skip confirmations)
./scripts/restore-database.sh backups/farm_attendance_20231201_120000.db.gz --force
```

## Monitoring and Maintenance

### Health Checks

- **Basic health**: `GET /health`
- **Detailed health**: `GET /api/system/health/detailed` (admin only)
- **System metrics**: `GET /api/system/metrics` (admin/manager)

### Log Monitoring

```bash
# Docker logs
docker-compose logs -f farm-attendance

# Application logs
tail -f logs/app.log

# System logs (Raspberry Pi)
journalctl -u farm-attendance-kiosk -f
```

### System Maintenance

1. **Update system**:
   ```bash
   # Docker deployment
   docker-compose pull
   docker-compose up -d

   # Manual deployment
   git pull
   npm install
   npm run build
   npm run migrate
   sudo systemctl restart farm-attendance
   ```

2. **Database maintenance**:
   ```bash
   # Vacuum database
   sqlite3 data/farm_attendance.db "VACUUM;"

   # Check integrity
   sqlite3 data/farm_attendance.db "PRAGMA integrity_check;"
   ```

3. **Clean up old files**:
   ```bash
   # Clean old backups (older than 30 days)
   find backups/ -name "*.gz" -mtime +30 -delete

   # Clean old logs
   find logs/ -name "*.log" -mtime +7 -delete
   ```

## Troubleshooting

### Common Issues

#### Application Won't Start

1. **Check port availability**:
   ```bash
   netstat -tlnp | grep :3000
   ```

2. **Check database permissions**:
   ```bash
   ls -la data/
   chmod 644 data/farm_attendance.db
   ```

3. **Check logs**:
   ```bash
   docker-compose logs farm-attendance
   ```

#### Kiosk Display Issues

1. **Check X server**:
   ```bash
   echo $DISPLAY
   xset q
   ```

2. **Restart display manager**:
   ```bash
   sudo systemctl restart lightdm
   ```

3. **Check browser process**:
   ```bash
   ps aux | grep chromium
   pkill chromium-browser
   ```

#### Database Corruption

1. **Check integrity**:
   ```bash
   sqlite3 data/farm_attendance.db "PRAGMA integrity_check;"
   ```

2. **Restore from backup**:
   ```bash
   ./scripts/restore-database.sh backups/latest_backup.db.gz
   ```

#### Network Connectivity Issues

1. **Check network status**:
   ```bash
   ping google.com
   curl -I http://localhost:3000/health
   ```

2. **Check firewall**:
   ```bash
   sudo ufw status
   sudo iptables -L
   ```

### Performance Issues

1. **Check system resources**:
   ```bash
   htop
   df -h
   free -h
   ```

2. **Optimize database**:
   ```bash
   sqlite3 data/farm_attendance.db "VACUUM; ANALYZE;"
   ```

3. **Check for large files**:
   ```bash
   du -sh uploads/
   du -sh backups/
   ```

### Getting Help

1. **Check system status**:
   ```bash
   ./scripts/status-check.sh
   ```

2. **Collect logs**:
   ```bash
   # Create support bundle
   tar -czf support-$(date +%Y%m%d).tar.gz logs/ data/ backups/*.meta
   ```

3. **Contact support** with:
   - System information
   - Error logs
   - Steps to reproduce the issue
   - Support bundle (if requested)

## Security Considerations

### Network Security
- Use HTTPS in production
- Configure firewall rules
- Use VPN for remote access
- Regular security updates

### Application Security
- Change default passwords
- Use strong JWT secrets
- Regular backup verification
- Monitor access logs

### Physical Security (Kiosks)
- Secure device mounting
- Disable unnecessary ports
- Use kiosk mode restrictions
- Physical access controls

## Performance Optimization

### Database Optimization
- Regular VACUUM operations
- Proper indexing
- Query optimization
- Connection pooling

### System Optimization
- Adequate RAM allocation
- SSD storage recommended
- Network bandwidth planning
- Regular maintenance schedules

---

For additional support, please refer to the project documentation or contact the development team.