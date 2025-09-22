# Farm Attendance System - Hardware Setup and Configuration Guide

This guide provides detailed instructions for setting up and configuring hardware components of the Farm Attendance System, including kiosk terminals, RFID readers, cameras, and network infrastructure.

## Table of Contents

1. [Hardware Overview](#hardware-overview)
2. [Kiosk Terminal Setup](#kiosk-terminal-setup)
3. [RFID System Configuration](#rfid-system-configuration)
4. [Camera System Setup](#camera-system-setup)
5. [Network Configuration](#network-configuration)
6. [Power and Environmental](#power-and-environmental)
7. [Testing and Validation](#testing-and-validation)
8. [Troubleshooting](#troubleshooting)
9. [Maintenance Procedures](#maintenance-procedures)

## Hardware Overview

### System Architecture

The Farm Attendance System consists of several hardware components working together:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Kiosk         │    │   RFID Reader   │    │   IP Camera     │
│   Terminal      │◄──►│                 │    │                 │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Network       │
                    │   Switch        │
                    │                 │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Main Server   │
                    │   (Application) │
                    │                 │
                    └─────────────────┘
```

### Component List

**Required Components:**
- Kiosk terminals (touchscreen computers)
- RFID readers and cards
- Network infrastructure (switches, cables)
- Main server (application host)

**Optional Components:**
- IP cameras for photo verification
- Backup power supplies (UPS)
- Environmental sensors
- Audio feedback systems

### Recommended Specifications

#### Kiosk Terminal Specifications

**Minimum Requirements:**
- **Processor**: ARM Cortex-A72 (Raspberry Pi 4) or Intel Celeron
- **RAM**: 2GB minimum, 4GB recommended
- **Storage**: 16GB microSD or 32GB eMMC
- **Display**: 10-15 inch touchscreen, 1024x768 minimum
- **Network**: Ethernet + WiFi
- **USB Ports**: 2+ for peripherals
- **Operating System**: Linux (Ubuntu/Debian) or Windows 10 IoT

**Recommended Specifications:**
- **Processor**: Intel i3 or equivalent ARM processor
- **RAM**: 4GB or more
- **Storage**: 64GB SSD
- **Display**: 15-21 inch capacitive touchscreen, 1920x1080
- **Network**: Gigabit Ethernet + 802.11ac WiFi
- **Additional**: Built-in speakers, status LEDs

#### RFID Reader Specifications

**Supported Frequencies:**
- **125 kHz**: Low-frequency, good for harsh environments
- **13.56 MHz**: High-frequency, faster read times
- **860-960 MHz**: UHF, longer range

**Interface Options:**
- **USB**: Plug-and-play, easy setup
- **Serial (RS232/RS485)**: Industrial applications
- **Ethernet**: Network-connected readers
- **Wiegand**: Legacy system integration

**Recommended Models:**
- **Basic**: USB HID readers for simple setups
- **Industrial**: IP65-rated readers for outdoor use
- **Long-range**: UHF readers for vehicle access

## Kiosk Terminal Setup

### Raspberry Pi Kiosk Setup

#### Hardware Assembly

1. **Prepare Components:**
   - Raspberry Pi 4 (4GB RAM recommended)
   - Official 7" touchscreen or compatible
   - microSD card (32GB Class 10)
   - Power supply (5V 3A)
   - Case with mounting hardware

2. **Assembly Steps:**
   ```
   1. Connect touchscreen to Pi via ribbon cable
   2. Connect power to touchscreen
   3. Mount Pi to back of screen
   4. Install in protective case
   5. Connect power supply
   ```

3. **Physical Installation:**
   - Mount at appropriate height (42-48 inches)
   - Ensure stable mounting
   - Protect cables from damage
   - Consider weatherproofing for outdoor use

#### Software Installation

1. **Prepare SD Card:**
   ```bash
   # Download Raspberry Pi OS Lite
   wget https://downloads.raspberrypi.org/raspios_lite_armhf/images/raspios_lite_armhf-2023-05-03/2023-05-03-raspios-bullseye-armhf-lite.img.xz
   
   # Flash to SD card using Raspberry Pi Imager
   # Enable SSH and set username/password
   ```

2. **Initial Setup:**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install required packages
   sudo apt install -y \
       chromium-browser \
       xorg \
       openbox \
       lightdm \
       unclutter \
       git \
       nodejs \
       npm
   ```

3. **Configure Display:**
   ```bash
   # Edit /boot/config.txt
   sudo nano /boot/config.txt
   
   # Add these lines for touchscreen
   dtoverlay=vc4-kms-v3d
   max_framebuffers=2
   
   # For official 7" display
   lcd_rotate=2  # if rotation needed
   ```

4. **Install Kiosk Software:**
   ```bash
   # Clone the farm attendance system
   git clone https://github.com/your-org/farm-attendance-system.git
   cd farm-attendance-system
   
   # Run the automated installation
   sudo ./scripts/install-raspberry-pi.sh
   ```

### Industrial PC Kiosk Setup

#### Hardware Configuration

1. **Select Industrial PC:**
   - Fanless design for reliability
   - Wide temperature range (-10°C to 60°C)
   - Multiple I/O ports
   - Solid-state storage
   - IP65 rating for harsh environments

2. **Touchscreen Selection:**
   - Projected capacitive for accuracy
   - Anti-glare coating for outdoor use
   - Vandal-resistant glass
   - Multi-touch capability

3. **Mounting Options:**
   - Wall mount brackets
   - Pedestal stands
   - VESA mount compatibility
   - Security enclosures

#### Software Configuration

1. **Operating System Setup:**
   ```bash
   # For Ubuntu Linux
   sudo apt update
   sudo apt install -y ubuntu-desktop-minimal
   
   # Configure auto-login
   sudo systemctl edit getty@tty1
   # Add:
   [Service]
   ExecStart=
   ExecStart=-/sbin/agetty --autologin kiosk --noclear %I $TERM
   ```

2. **Kiosk Mode Configuration:**
   ```bash
   # Create kiosk user
   sudo useradd -m -s /bin/bash kiosk
   sudo usermod -aG audio,video,input kiosk
   
   # Configure auto-start
   mkdir -p /home/kiosk/.config/autostart
   cat > /home/kiosk/.config/autostart/kiosk.desktop << EOF
   [Desktop Entry]
   Type=Application
   Name=Farm Attendance Kiosk
   Exec=/home/kiosk/start-kiosk.sh
   Hidden=false
   NoDisplay=false
   X-GNOME-Autostart-enabled=true
   EOF
   ```

3. **Browser Configuration:**
   ```bash
   # Create kiosk startup script
   cat > /home/kiosk/start-kiosk.sh << 'EOF'
   #!/bin/bash
   
   # Wait for X server
   while ! xset q &>/dev/null; do
       sleep 1
   done
   
   # Disable screen blanking
   xset s off
   xset -dpms
   xset s noblank
   
   # Hide cursor
   unclutter -idle 1 &
   
   # Start browser in kiosk mode
   chromium-browser \
       --kiosk \
       --no-sandbox \
       --disable-web-security \
       --disable-features=TranslateUI \
       --disable-infobars \
       --disable-session-crashed-bubble \
       --disable-first-run-ui \
       --start-fullscreen \
       "http://localhost:3000/kiosk"
   EOF
   
   chmod +x /home/kiosk/start-kiosk.sh
   ```

## RFID System Configuration

### USB RFID Reader Setup

#### Hardware Connection

1. **Connect Reader:**
   - Plug USB RFID reader into kiosk
   - Verify device recognition: `lsusb`
   - Check device permissions: `ls -l /dev/ttyUSB*`

2. **Test Basic Functionality:**
   ```bash
   # Test card reading
   cat /dev/hidraw0  # or appropriate device
   # Tap RFID card and verify output
   ```

#### Software Configuration

1. **Install RFID Service:**
   ```bash
   # The RFID service is included in the main application
   # Configure in the admin panel or via config file
   ```

2. **Configure Reader Settings:**
   ```json
   {
     "rfid": {
       "enabled": true,
       "device": "/dev/hidraw0",
       "baudRate": 9600,
       "timeout": 5000,
       "cardFormat": "hex",
       "minCardLength": 8,
       "maxCardLength": 16
     }
   }
   ```

3. **Test Integration:**
   ```bash
   # Test RFID reading through API
   curl -X POST http://localhost:3000/api/kiosk/rfid-test \
        -H "Content-Type: application/json" \
        -d '{"test": true}'
   ```

### Network RFID Reader Setup

#### Network Configuration

1. **Configure Reader IP:**
   - Set static IP address
   - Configure subnet mask
   - Set default gateway
   - Configure DNS servers

2. **Network Settings Example:**
   ```
   IP Address: 192.168.1.100
   Subnet Mask: 255.255.255.0
   Gateway: 192.168.1.1
   DNS: 192.168.1.1, 8.8.8.8
   ```

#### Reader Configuration

1. **Access Reader Web Interface:**
   - Open browser to reader IP
   - Login with default credentials
   - Change default password

2. **Configure Communication:**
   ```
   Protocol: TCP/IP
   Port: 9001
   Data Format: Wiegand 26-bit
   Output Format: Hex
   Read Range: Medium
   ```

3. **Test Network Communication:**
   ```bash
   # Test TCP connection
   telnet 192.168.1.100 9001
   
   # Test with netcat
   nc -v 192.168.1.100 9001
   ```

### RFID Card Management

#### Card Programming

1. **Prepare Cards:**
   - Use compatible card types (125kHz, 13.56MHz, etc.)
   - Ensure cards are blank or properly formatted
   - Plan card numbering scheme

2. **Programming Process:**
   ```bash
   # For programmable cards, use appropriate software
   # Example for EM4100 cards:
   # Program card with employee ID
   ```

3. **Card Database:**
   ```sql
   -- Example card assignment
   INSERT INTO rfid_cards (card_id, employee_id, status, issued_date)
   VALUES ('1234567890', 'emp-uuid', 'active', '2023-01-01');
   ```

#### Card Testing

1. **Individual Card Test:**
   - Test each card at reader
   - Verify correct ID transmission
   - Check read consistency

2. **Batch Testing:**
   ```bash
   # Script to test multiple cards
   for card in card_list.txt; do
       echo "Testing card: $card"
       # Test card reading
   done
   ```

## Camera System Setup

### IP Camera Configuration

#### Network Setup

1. **Camera Network Configuration:**
   ```
   IP Address: 192.168.1.101
   Subnet Mask: 255.255.255.0
   Gateway: 192.168.1.1
   DNS: 192.168.1.1
   ```

2. **Access Camera Interface:**
   - Open web browser to camera IP
   - Login with default credentials
   - Change default password immediately

#### Camera Settings

1. **Video Configuration:**
   ```
   Resolution: 1920x1080 (1080p)
   Frame Rate: 15-30 FPS
   Compression: H.264
   Bitrate: 2-4 Mbps
   ```

2. **Image Quality:**
   ```
   Brightness: Auto
   Contrast: Auto
   Saturation: Normal
   Sharpness: Medium
   White Balance: Auto
   ```

3. **Network Streaming:**
   ```
   Protocol: RTSP
   Port: 554
   Stream Path: /stream1
   Authentication: Basic
   ```

#### Integration with System

1. **Configure Camera Service:**
   ```json
   {
     "cameras": [
       {
         "id": "cam-001",
         "name": "Main Entrance",
         "type": "ip",
         "url": "rtsp://192.168.1.101:554/stream1",
         "username": "admin",
         "password": "secure_password",
         "location": "Main Gate"
       }
     ]
   }
   ```

2. **Test Camera Integration:**
   ```bash
   # Test camera capture
   curl -X POST http://localhost:3000/api/camera/capture \
        -H "Content-Type: application/json" \
        -d '{"cameraId": "cam-001", "employeeId": "test"}'
   ```

### USB Camera Setup

#### Hardware Connection

1. **Connect USB Camera:**
   - Use USB 2.0 or 3.0 port
   - Verify device recognition: `lsusb`
   - Check video device: `ls /dev/video*`

2. **Test Camera:**
   ```bash
   # Test with v4l2
   v4l2-ctl --list-devices
   v4l2-ctl --device=/dev/video0 --list-formats-ext
   
   # Capture test image
   fswebcam -d /dev/video0 test.jpg
   ```

#### Software Configuration

1. **Install Camera Drivers:**
   ```bash
   # Install Video4Linux utilities
   sudo apt install -y v4l-utils fswebcam
   
   # For specific camera drivers
   sudo apt install -y linux-modules-extra-$(uname -r)
   ```

2. **Configure Camera Settings:**
   ```bash
   # Set camera parameters
   v4l2-ctl --device=/dev/video0 --set-ctrl=brightness=128
   v4l2-ctl --device=/dev/video0 --set-ctrl=contrast=128
   v4l2-ctl --device=/dev/video0 --set-ctrl=saturation=128
   ```

## Network Configuration

### Network Infrastructure

#### Switch Configuration

1. **Basic Switch Setup:**
   ```
   Management IP: 192.168.1.10
   VLAN Configuration:
   - VLAN 1: Management (192.168.1.0/24)
   - VLAN 10: Kiosks (192.168.10.0/24)
   - VLAN 20: Cameras (192.168.20.0/24)
   ```

2. **Port Configuration:**
   ```
   Port 1-8: Kiosk terminals (VLAN 10)
   Port 9-16: IP cameras (VLAN 20)
   Port 17-20: Servers (VLAN 1)
   Port 21-24: Uplinks (Trunk)
   ```

#### DHCP Configuration

1. **DHCP Server Setup:**
   ```bash
   # Install DHCP server
   sudo apt install -y isc-dhcp-server
   
   # Configure /etc/dhcp/dhcpd.conf
   subnet 192.168.10.0 netmask 255.255.255.0 {
       range 192.168.10.100 192.168.10.200;
       option routers 192.168.10.1;
       option domain-name-servers 192.168.1.1, 8.8.8.8;
       default-lease-time 86400;
       max-lease-time 86400;
   }
   ```

2. **Static IP Reservations:**
   ```
   # Reserve IPs for critical devices
   host kiosk-001 {
       hardware ethernet 00:11:22:33:44:55;
       fixed-address 192.168.10.101;
   }
   
   host camera-001 {
       hardware ethernet 00:11:22:33:44:66;
       fixed-address 192.168.20.101;
   }
   ```

### Wireless Configuration

#### WiFi Access Point Setup

1. **Configure Access Point:**
   ```bash
   # Install hostapd
   sudo apt install -y hostapd dnsmasq
   
   # Configure /etc/hostapd/hostapd.conf
   interface=wlan0
   driver=nl80211
   ssid=FarmAttendance
   hw_mode=g
   channel=7
   wmm_enabled=0
   macaddr_acl=0
   auth_algs=1
   ignore_broadcast_ssid=0
   wpa=2
   wpa_passphrase=SecurePassword123
   wpa_key_mgmt=WPA-PSK
   wpa_pairwise=TKIP
   rsn_pairwise=CCMP
   ```

2. **Configure DHCP for WiFi:**
   ```bash
   # Configure dnsmasq
   echo 'interface=wlan0' >> /etc/dnsmasq.conf
   echo 'dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h' >> /etc/dnsmasq.conf
   ```

#### WiFi Client Configuration

1. **Configure WiFi on Kiosks:**
   ```bash
   # Configure wpa_supplicant
   sudo nano /etc/wpa_supplicant/wpa_supplicant.conf
   
   network={
       ssid="FarmWiFi"
       psk="WiFiPassword"
       key_mgmt=WPA-PSK
   }
   ```

2. **Test WiFi Connection:**
   ```bash
   # Test connection
   sudo wpa_cli -i wlan0 reconfigure
   iwconfig wlan0
   ping -c 4 8.8.8.8
   ```

### Firewall Configuration

#### Basic Firewall Rules

1. **Configure UFW:**
   ```bash
   # Enable firewall
   sudo ufw enable
   
   # Allow SSH
   sudo ufw allow ssh
   
   # Allow HTTP/HTTPS
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   
   # Allow application port
   sudo ufw allow 3000/tcp
   
   # Allow RTSP for cameras
   sudo ufw allow 554/tcp
   ```

2. **Advanced Rules:**
   ```bash
   # Allow specific subnets
   sudo ufw allow from 192.168.10.0/24 to any port 3000
   sudo ufw allow from 192.168.20.0/24 to any port 554
   
   # Deny all other traffic
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   ```

## Power and Environmental

### Power Requirements

#### Power Consumption

**Typical Power Usage:**
- Raspberry Pi 4 Kiosk: 15W
- 15" Touchscreen: 25W
- RFID Reader: 5W
- IP Camera: 10W
- Network Switch (24-port): 50W

**Total System Power:**
- 4 Kiosks: 180W
- 4 Cameras: 40W
- Network Equipment: 100W
- Server: 200W
- **Total: ~520W**

#### UPS Configuration

1. **UPS Sizing:**
   - Minimum capacity: 1000VA/600W
   - Recommended: 1500VA/900W
   - Runtime target: 30-60 minutes

2. **UPS Setup:**
   ```bash
   # Install NUT (Network UPS Tools)
   sudo apt install -y nut
   
   # Configure UPS monitoring
   sudo nano /etc/nut/ups.conf
   
   [myups]
   driver = usbhid-ups
   port = auto
   desc = "Main UPS"
   ```

### Environmental Considerations

#### Temperature Management

1. **Operating Ranges:**
   - Indoor kiosks: 0°C to 40°C
   - Outdoor kiosks: -10°C to 50°C
   - Server room: 18°C to 24°C

2. **Cooling Solutions:**
   - Passive cooling for fanless systems
   - Active cooling for high-performance systems
   - Environmental enclosures for outdoor use

#### Weatherproofing

1. **Outdoor Installations:**
   - IP65-rated enclosures
   - Weatherproof cable connections
   - Drainage considerations
   - UV-resistant materials

2. **Cable Management:**
   - Use outdoor-rated cables
   - Proper cable routing
   - Strain relief
   - Waterproof connectors

## Testing and Validation

### System Integration Testing

#### End-to-End Testing

1. **Complete Workflow Test:**
   ```bash
   # Test complete attendance workflow
   1. Employee approaches kiosk
   2. Taps RFID card
   3. System captures photo (if enabled)
   4. Records attendance
   5. Displays confirmation
   6. Syncs data to server
   ```

2. **Multi-Device Testing:**
   - Test multiple kiosks simultaneously
   - Verify data synchronization
   - Check conflict resolution
   - Test offline/online transitions

#### Performance Testing

1. **Load Testing:**
   ```bash
   # Simulate multiple concurrent users
   for i in {1..10}; do
       curl -X POST http://localhost:3000/api/kiosk/rfid-action \
            -H "Content-Type: application/json" \
            -d '{"rfidTag": "test'$i'", "action": "auto"}' &
   done
   ```

2. **Network Performance:**
   ```bash
   # Test network bandwidth
   iperf3 -s  # On server
   iperf3 -c server_ip  # On kiosk
   
   # Test latency
   ping -c 100 server_ip
   ```

### Hardware Validation

#### RFID System Testing

1. **Range Testing:**
   - Test read range at different distances
   - Verify consistent reading
   - Test with different card orientations

2. **Interference Testing:**
   - Test near metal objects
   - Test with multiple readers
   - Test in electromagnetic environments

#### Camera System Testing

1. **Image Quality Testing:**
   - Test in different lighting conditions
   - Verify image clarity and focus
   - Test motion detection (if enabled)

2. **Network Performance:**
   - Test streaming quality
   - Verify recording functionality
   - Test storage capacity

### Security Testing

#### Network Security

1. **Vulnerability Scanning:**
   ```bash
   # Scan for open ports
   nmap -sS -O target_ip
   
   # Test for common vulnerabilities
   nmap --script vuln target_ip
   ```

2. **Access Control Testing:**
   - Test authentication mechanisms
   - Verify authorization levels
   - Test session management

#### Physical Security

1. **Tamper Testing:**
   - Test physical access controls
   - Verify tamper detection
   - Test emergency procedures

2. **Data Security:**
   - Test data encryption
   - Verify secure communications
   - Test backup security

## Troubleshooting

### Common Hardware Issues

#### Kiosk Problems

**Touchscreen Not Responding:**
1. Check power connections
2. Verify display drivers
3. Calibrate touchscreen
4. Check for physical damage

**System Won't Boot:**
1. Check power supply
2. Verify SD card/storage
3. Check for corrupted files
4. Try different power source

#### RFID Issues

**Cards Not Reading:**
1. Check reader power
2. Verify card compatibility
3. Test with known good card
4. Check for interference

**Inconsistent Reading:**
1. Clean card and reader
2. Check mounting distance
3. Verify power supply stability
4. Update reader firmware

#### Camera Problems

**No Video Feed:**
1. Check network connection
2. Verify camera power
3. Test with different viewer
4. Check camera settings

**Poor Image Quality:**
1. Adjust lighting conditions
2. Clean camera lens
3. Check focus settings
4. Verify network bandwidth

### Diagnostic Tools

#### Network Diagnostics

```bash
# Network connectivity
ping -c 4 8.8.8.8
traceroute google.com
nslookup domain.com

# Port testing
telnet host port
nc -zv host port

# Bandwidth testing
iperf3 -c server
speedtest-cli
```

#### Hardware Diagnostics

```bash
# System information
lscpu
lsmem
lsusb
lspci

# Storage testing
df -h
iostat
hdparm -tT /dev/sda

# Memory testing
free -h
vmstat
```

#### Application Diagnostics

```bash
# Service status
systemctl status farm-attendance
journalctl -u farm-attendance -f

# Process monitoring
htop
ps aux | grep farm
netstat -tlnp
```

## Maintenance Procedures

### Preventive Maintenance

#### Daily Checks

1. **Visual Inspection:**
   - Check all devices are powered on
   - Verify network connectivity
   - Check for physical damage
   - Clean touchscreens if needed

2. **System Monitoring:**
   - Check system logs
   - Verify data synchronization
   - Monitor performance metrics
   - Check backup status

#### Weekly Maintenance

1. **Hardware Cleaning:**
   - Clean touchscreens with appropriate cleaner
   - Dust removal from ventilation areas
   - Check cable connections
   - Inspect mounting hardware

2. **Software Updates:**
   - Check for system updates
   - Update application software
   - Review security patches
   - Test backup procedures

#### Monthly Maintenance

1. **Comprehensive Testing:**
   - Test all hardware components
   - Verify system performance
   - Check data integrity
   - Test disaster recovery procedures

2. **Documentation Updates:**
   - Update hardware inventory
   - Review maintenance logs
   - Update configuration documentation
   - Train staff on new procedures

### Corrective Maintenance

#### Hardware Replacement

1. **Component Failure:**
   - Identify failed component
   - Order replacement parts
   - Schedule maintenance window
   - Replace and test component

2. **System Upgrades:**
   - Plan upgrade schedule
   - Backup current configuration
   - Install new hardware
   - Migrate configuration and data

#### Software Maintenance

1. **Bug Fixes:**
   - Identify and document issues
   - Apply software patches
   - Test fixes thoroughly
   - Update documentation

2. **Performance Optimization:**
   - Monitor system performance
   - Identify bottlenecks
   - Optimize configurations
   - Upgrade hardware if needed

Remember: Proper hardware setup and maintenance are crucial for system reliability. Follow manufacturer guidelines, maintain detailed documentation, and perform regular testing to ensure optimal performance.