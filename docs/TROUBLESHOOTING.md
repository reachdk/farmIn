# Farm Attendance System - Troubleshooting Guide

This comprehensive troubleshooting guide helps diagnose and resolve common issues with the Farm Attendance System.

## Table of Contents

1. [Quick Diagnostic Checklist](#quick-diagnostic-checklist)
2. [System Issues](#system-issues)
3. [Authentication Problems](#authentication-problems)
4. [Attendance Tracking Issues](#attendance-tracking-issues)
5. [Hardware Problems](#hardware-problems)
6. [Network and Connectivity](#network-and-connectivity)
7. [Data and Synchronization](#data-and-synchronization)
8. [Performance Issues](#performance-issues)
9. [Error Messages](#error-messages)
10. [Emergency Procedures](#emergency-procedures)

## Quick Diagnostic Checklist

### Before You Start

**Information to Gather:**
- What exactly is the problem?
- When did it start occurring?
- Is it affecting one user or multiple users?
- What error messages are displayed?
- What steps were taken before the problem occurred?

**Initial Checks:**
- [ ] Is the system powered on?
- [ ] Are network connections active?
- [ ] Can you access the web interface?
- [ ] Are there any error messages in logs?
- [ ] Is the database accessible?

### System Status Check

```bash
# Quick system health check
curl http://localhost:3000/health

# Check system services
systemctl status farm-attendance
systemctl status nginx
systemctl status postgresql  # if using PostgreSQL

# Check disk space
df -h

# Check memory usage
free -h

# Check system load
uptime
```

## System Issues

### Application Won't Start

#### Symptoms
- Service fails to start
- "Connection refused" errors
- Blank web pages
- Service crashes immediately

#### Diagnostic Steps

1. **Check Service Status:**
   ```bash
   systemctl status farm-attendance
   journalctl -u farm-attendance -n 50
   ```

2. **Check Port Availability:**
   ```bash
   netstat -tlnp | grep :3000
   lsof -i :3000
   ```

3. **Check Configuration:**
   ```bash
   # Verify configuration files
   cat /etc/farm-attendance/config.json
   
   # Check environment variables
   env | grep FARM_
   ```

4. **Check Dependencies:**
   ```bash
   # Node.js version
   node --version
   npm --version
   
   # Database connectivity
   sqlite3 data/farm_attendance.db ".tables"
   ```

#### Solutions

**Port Already in Use:**
```bash
# Find and kill process using port 3000
sudo lsof -ti:3000 | xargs sudo kill -9

# Or change port in configuration
export PORT=3001
```

**Missing Dependencies:**
```bash
# Reinstall dependencies
npm install

# Rebuild native modules
npm rebuild
```

**Database Issues:**
```bash
# Check database file permissions
ls -la data/farm_attendance.db
chmod 644 data/farm_attendance.db

# Run database migrations
npm run migrate
```

**Configuration Errors:**
```bash
# Validate JSON configuration
cat config.json | jq .

# Reset to default configuration
cp config.json.example config.json
```

### Database Connection Issues

#### Symptoms
- "Database connection failed" errors
- Slow query responses
- Data not saving
- Sync failures

#### Diagnostic Steps

1. **Check Database File:**
   ```bash
   # Verify database exists and is accessible
   ls -la data/farm_attendance.db
   
   # Check database integrity
   sqlite3 data/farm_attendance.db "PRAGMA integrity_check;"
   ```

2. **Check Database Locks:**
   ```bash
   # Check for database locks
   lsof data/farm_attendance.db
   
   # Check SQLite processes
   ps aux | grep sqlite
   ```

3. **Test Database Queries:**
   ```bash
   # Test basic query
   sqlite3 data/farm_attendance.db "SELECT COUNT(*) FROM employees;"
   
   # Check database size
   du -h data/farm_attendance.db
   ```

#### Solutions

**Database Locked:**
```bash
# Kill processes holding database locks
sudo lsof data/farm_attendance.db | awk 'NR>1 {print $2}' | xargs sudo kill

# Restart application
systemctl restart farm-attendance
```

**Corrupted Database:**
```bash
# Backup current database
cp data/farm_attendance.db data/farm_attendance.db.backup

# Restore from backup
./scripts/restore-database.sh backups/latest_backup.db.gz

# Or rebuild database
rm data/farm_attendance.db
npm run migrate
```

**Insufficient Permissions:**
```bash
# Fix file permissions
sudo chown farm-user:farm-user data/farm_attendance.db
chmod 644 data/farm_attendance.db

# Fix directory permissions
sudo chown -R farm-user:farm-user data/
chmod 755 data/
```

## Authentication Problems

### Login Failures

#### Symptoms
- "Invalid credentials" errors
- Account lockouts
- Password reset not working
- Session timeouts

#### Diagnostic Steps

1. **Check User Account:**
   ```bash
   # Query user in database
   sqlite3 data/farm_attendance.db "SELECT * FROM employees WHERE employee_number = 'EMP001';"
   
   # Check account status
   sqlite3 data/farm_attendance.db "SELECT employee_number, is_active FROM employees WHERE employee_number = 'EMP001';"
   ```

2. **Check Authentication Logs:**
   ```bash
   # Check application logs for auth errors
   journalctl -u farm-attendance | grep -i "auth\|login"
   
   # Check failed login attempts
   grep "Login failed" /var/log/farm-attendance/app.log
   ```

#### Solutions

**Account Locked/Inactive:**
```sql
-- Activate user account
UPDATE employees SET is_active = 1 WHERE employee_number = 'EMP001';

-- Reset failed login attempts
UPDATE employees SET failed_login_attempts = 0 WHERE employee_number = 'EMP001';
```

**Password Issues:**
```bash
# Reset user password (admin only)
curl -X POST http://localhost:3000/api/admin/reset-password \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"employeeNumber": "EMP001", "newPassword": "TempPassword123"}'
```

**Session Problems:**
```bash
# Clear session data
rm -rf /tmp/farm-attendance-sessions/*

# Restart application to clear memory sessions
systemctl restart farm-attendance
```

### RFID Authentication Issues

#### Symptoms
- RFID cards not recognized
- "Card not found" errors
- Inconsistent card reading
- Wrong employee identified

#### Diagnostic Steps

1. **Check RFID Card Assignment:**
   ```sql
   -- Check card assignment
   SELECT c.card_id, e.employee_number, e.first_name, e.last_name 
   FROM rfid_cards c 
   JOIN employees e ON c.employee_id = e.id 
   WHERE c.card_id = '1234567890';
   ```

2. **Test RFID Reader:**
   ```bash
   # Check RFID reader device
   lsusb | grep -i rfid
   ls -la /dev/ttyUSB* /dev/hidraw*
   
   # Test card reading
   cat /dev/hidraw0  # Tap card and check output
   ```

#### Solutions

**Card Not Assigned:**
```sql
-- Assign card to employee
INSERT INTO rfid_cards (card_id, employee_id, status, issued_date)
VALUES ('1234567890', 'employee-uuid', 'active', datetime('now'));
```

**Card Deactivated:**
```sql
-- Reactivate card
UPDATE rfid_cards SET status = 'active' WHERE card_id = '1234567890';
```

**Reader Hardware Issues:**
```bash
# Restart RFID service
systemctl restart rfid-service

# Check reader permissions
sudo chmod 666 /dev/hidraw0

# Test with different USB port
# Unplug and reconnect reader
```

## Attendance Tracking Issues

### Clock In/Out Problems

#### Symptoms
- "Already clocked in" when not clocked in
- "Not clocked in" when trying to clock out
- Missing attendance records
- Incorrect time calculations

#### Diagnostic Steps

1. **Check Current Status:**
   ```sql
   -- Check employee's current attendance status
   SELECT * FROM attendance_records 
   WHERE employee_id = 'employee-uuid' 
   AND clock_out_time IS NULL 
   ORDER BY clock_in_time DESC 
   LIMIT 1;
   ```

2. **Check Recent Records:**
   ```sql
   -- Check recent attendance records
   SELECT * FROM attendance_records 
   WHERE employee_id = 'employee-uuid' 
   AND date(clock_in_time) = date('now')
   ORDER BY clock_in_time DESC;
   ```

#### Solutions

**Stuck in "Clocked In" State:**
```sql
-- Find incomplete records
SELECT id, clock_in_time FROM attendance_records 
WHERE employee_id = 'employee-uuid' AND clock_out_time IS NULL;

-- Complete the record (adjust time as needed)
UPDATE attendance_records 
SET clock_out_time = datetime('now', '-1 hour'),
    total_hours = (julianday(datetime('now', '-1 hour')) - julianday(clock_in_time)) * 24,
    updated_at = datetime('now')
WHERE id = 'record-uuid';
```

**Missing Clock-In Record:**
```sql
-- Create missing clock-in record
INSERT INTO attendance_records (id, employee_id, clock_in_time, created_at, updated_at)
VALUES (
    lower(hex(randomblob(16))),
    'employee-uuid',
    '2023-01-01 08:00:00',
    datetime('now'),
    datetime('now')
);
```

**Incorrect Time Calculations:**
```sql
-- Recalculate total hours
UPDATE attendance_records 
SET total_hours = (julianday(clock_out_time) - julianday(clock_in_time)) * 24
WHERE clock_out_time IS NOT NULL AND total_hours IS NULL;
```

### Time Category Issues

#### Symptoms
- Incorrect overtime calculations
- Wrong pay categories assigned
- Missing time categories
- Conflicting category rules

#### Diagnostic Steps

1. **Check Time Categories:**
   ```sql
   -- List all time categories
   SELECT * FROM time_categories WHERE is_active = 1 ORDER BY min_hours;
   
   -- Check for overlapping categories
   SELECT * FROM time_categories t1, time_categories t2 
   WHERE t1.id != t2.id 
   AND t1.is_active = 1 AND t2.is_active = 1
   AND t1.max_hours > t2.min_hours AND t1.min_hours < t2.max_hours;
   ```

2. **Check Category Assignment:**
   ```sql
   -- Check how hours are categorized
   SELECT ar.total_hours, tc.name, tc.pay_multiplier
   FROM attendance_records ar
   LEFT JOIN time_categories tc ON ar.total_hours >= tc.min_hours AND ar.total_hours < tc.max_hours
   WHERE ar.employee_id = 'employee-uuid'
   AND date(ar.clock_in_time) = date('now');
   ```

#### Solutions

**Fix Overlapping Categories:**
```sql
-- Adjust category ranges to eliminate overlaps
UPDATE time_categories SET max_hours = 8.0 WHERE name = 'Regular Time';
UPDATE time_categories SET min_hours = 8.0, max_hours = 12.0 WHERE name = 'Overtime';
```

**Recalculate Category Assignments:**
```bash
# Run category recalculation script
curl -X POST http://localhost:3000/api/admin/recalculate-categories \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"startDate": "2023-01-01", "endDate": "2023-01-31"}'
```

## Hardware Problems

### Kiosk Issues

#### Symptoms
- Black screen
- Touchscreen not responding
- System freezing
- Network connectivity lost

#### Diagnostic Steps

1. **Check Power and Connections:**
   ```bash
   # Check system status
   systemctl status lightdm
   systemctl status farm-attendance-kiosk
   
   # Check display
   xrandr
   xset q
   ```

2. **Check Hardware:**
   ```bash
   # Check USB devices
   lsusb
   
   # Check input devices
   xinput list
   
   # Check system resources
   htop
   df -h
   ```

#### Solutions

**Screen Issues:**
```bash
# Restart display manager
sudo systemctl restart lightdm

# Reset display configuration
xrandr --auto

# Calibrate touchscreen
xinput_calibrator
```

**System Freezing:**
```bash
# Check system logs
journalctl -n 100

# Check for overheating
vcgencmd measure_temp  # Raspberry Pi
sensors  # Other systems

# Free up memory
sudo sync
sudo echo 3 > /proc/sys/vm/drop_caches
```

**Network Issues:**
```bash
# Check network interface
ip addr show
iwconfig  # for WiFi

# Restart networking
sudo systemctl restart networking

# Test connectivity
ping -c 4 8.8.8.8
```

### RFID Reader Problems

#### Symptoms
- Cards not detected
- Intermittent reading
- Wrong card IDs
- Reader not responding

#### Diagnostic Steps

1. **Check Hardware Connection:**
   ```bash
   # Check USB connection
   lsusb | grep -i rfid
   dmesg | grep -i usb
   
   # Check device files
   ls -la /dev/ttyUSB* /dev/hidraw*
   ```

2. **Test Reader Functionality:**
   ```bash
   # Test raw card reading
   cat /dev/hidraw0  # Tap card
   
   # Check reader configuration
   curl http://localhost:3000/api/hardware/rfid/status
   ```

#### Solutions

**Connection Issues:**
```bash
# Reset USB device
echo '1-1.2' | sudo tee /sys/bus/usb/drivers/usb/unbind
echo '1-1.2' | sudo tee /sys/bus/usb/drivers/usb/bind

# Fix permissions
sudo chmod 666 /dev/hidraw0
sudo usermod -a -G dialout $USER
```

**Reader Configuration:**
```bash
# Restart RFID service
sudo systemctl restart rfid-reader

# Reconfigure reader
curl -X POST http://localhost:3000/api/hardware/rfid/configure \
     -H "Content-Type: application/json" \
     -d '{"device": "/dev/hidraw0", "baudRate": 9600}'
```

### Camera Problems

#### Symptoms
- No video feed
- Poor image quality
- Camera not detected
- Recording failures

#### Diagnostic Steps

1. **Check Camera Connection:**
   ```bash
   # Check USB cameras
   lsusb | grep -i camera
   ls /dev/video*
   
   # Check IP cameras
   ping camera_ip
   curl -I http://camera_ip
   ```

2. **Test Camera Functionality:**
   ```bash
   # Test USB camera
   fswebcam -d /dev/video0 test.jpg
   
   # Test IP camera stream
   ffmpeg -i rtsp://camera_ip/stream -frames:v 1 test.jpg
   ```

#### Solutions

**USB Camera Issues:**
```bash
# Install camera drivers
sudo apt install -y v4l-utils
sudo modprobe uvcvideo

# Reset camera
echo '1-1.3' | sudo tee /sys/bus/usb/drivers/usb/unbind
echo '1-1.3' | sudo tee /sys/bus/usb/drivers/usb/bind
```

**IP Camera Issues:**
```bash
# Check network connectivity
ping camera_ip
telnet camera_ip 554

# Reset camera (power cycle)
# Check camera web interface
curl -u admin:password http://camera_ip/cgi-bin/hi3510/param.cgi?cmd=getserverinfo
```

## Network and Connectivity

### Network Connection Issues

#### Symptoms
- "Network unreachable" errors
- Slow response times
- Intermittent connectivity
- DNS resolution failures

#### Diagnostic Steps

1. **Basic Connectivity Tests:**
   ```bash
   # Test local connectivity
   ping -c 4 127.0.0.1
   ping -c 4 192.168.1.1
   
   # Test internet connectivity
   ping -c 4 8.8.8.8
   ping -c 4 google.com
   
   # Test DNS resolution
   nslookup google.com
   dig google.com
   ```

2. **Network Configuration Check:**
   ```bash
   # Check network interfaces
   ip addr show
   ip route show
   
   # Check network services
   systemctl status networking
   systemctl status NetworkManager
   ```

#### Solutions

**Network Interface Issues:**
```bash
# Restart network interface
sudo ip link set eth0 down
sudo ip link set eth0 up

# Restart networking service
sudo systemctl restart networking

# Reset network configuration
sudo dhclient -r eth0
sudo dhclient eth0
```

**DNS Issues:**
```bash
# Check DNS configuration
cat /etc/resolv.conf

# Set temporary DNS
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf

# Flush DNS cache
sudo systemctl restart systemd-resolved
```

**WiFi Issues:**
```bash
# Check WiFi status
iwconfig
sudo iwlist scan

# Restart WiFi
sudo ifdown wlan0
sudo ifup wlan0

# Reconfigure WiFi
sudo wpa_cli -i wlan0 reconfigure
```

### Firewall Issues

#### Symptoms
- Connection timeouts
- "Connection refused" errors
- Services unreachable
- Port blocking

#### Diagnostic Steps

1. **Check Firewall Status:**
   ```bash
   # Check UFW status
   sudo ufw status verbose
   
   # Check iptables rules
   sudo iptables -L -n
   
   # Check listening ports
   netstat -tlnp
   ss -tlnp
   ```

2. **Test Port Connectivity:**
   ```bash
   # Test from local machine
   telnet localhost 3000
   nc -zv localhost 3000
   
   # Test from remote machine
   telnet server_ip 3000
   nmap -p 3000 server_ip
   ```

#### Solutions

**Open Required Ports:**
```bash
# Allow application port
sudo ufw allow 3000/tcp

# Allow from specific subnet
sudo ufw allow from 192.168.1.0/24 to any port 3000

# Allow SSH (if locked out)
sudo ufw allow ssh
```

**Reset Firewall:**
```bash
# Reset UFW to defaults
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 3000/tcp
sudo ufw enable
```

## Data and Synchronization

### Sync Failures

#### Symptoms
- Data not syncing between devices
- Sync conflicts
- "Sync failed" errors
- Outdated data on kiosks

#### Diagnostic Steps

1. **Check Sync Status:**
   ```bash
   # Check sync service status
   curl http://localhost:3000/api/sync/status
   
   # Check sync queue
   sqlite3 data/farm_attendance.db "SELECT * FROM sync_queue WHERE status = 'pending';"
   
   # Check sync logs
   journalctl -u farm-attendance | grep -i sync
   ```

2. **Check Network Connectivity:**
   ```bash
   # Test connectivity between devices
   ping kiosk_ip
   curl http://kiosk_ip:3000/health
   ```

#### Solutions

**Clear Sync Queue:**
```sql
-- Clear failed sync items
DELETE FROM sync_queue WHERE status = 'failed' AND attempts > 5;

-- Reset pending items
UPDATE sync_queue SET status = 'pending', attempts = 0 WHERE status = 'processing';
```

**Force Manual Sync:**
```bash
# Trigger manual sync
curl -X POST http://localhost:3000/api/sync/trigger \
     -H "Authorization: Bearer $ADMIN_TOKEN"

# Sync specific device
curl -X POST http://localhost:3000/api/sync/device \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"deviceId": "kiosk-001"}'
```

**Resolve Sync Conflicts:**
```bash
# Get conflicts
curl http://localhost:3000/api/sync/conflicts \
     -H "Authorization: Bearer $ADMIN_TOKEN"

# Resolve conflict (use local data)
curl -X POST http://localhost:3000/api/sync/resolve-conflict \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"conflictId": "conflict-uuid", "resolution": "use_local"}'
```

### Data Corruption

#### Symptoms
- Database errors
- Missing records
- Inconsistent data
- Application crashes

#### Diagnostic Steps

1. **Check Database Integrity:**
   ```bash
   # SQLite integrity check
   sqlite3 data/farm_attendance.db "PRAGMA integrity_check;"
   
   # Check for corruption
   sqlite3 data/farm_attendance.db "PRAGMA quick_check;"
   
   # Check database size
   ls -lh data/farm_attendance.db
   ```

2. **Validate Data Consistency:**
   ```sql
   -- Check for orphaned records
   SELECT COUNT(*) FROM attendance_records ar 
   LEFT JOIN employees e ON ar.employee_id = e.id 
   WHERE e.id IS NULL;
   
   -- Check for invalid time records
   SELECT COUNT(*) FROM attendance_records 
   WHERE clock_out_time < clock_in_time;
   ```

#### Solutions

**Repair Database:**
```bash
# Backup current database
cp data/farm_attendance.db data/farm_attendance.db.backup

# Dump and restore database
sqlite3 data/farm_attendance.db ".dump" > backup.sql
rm data/farm_attendance.db
sqlite3 data/farm_attendance.db < backup.sql

# Vacuum database
sqlite3 data/farm_attendance.db "VACUUM;"
```

**Restore from Backup:**
```bash
# List available backups
ls -la backups/

# Restore from latest backup
./scripts/restore-database.sh backups/farm_attendance_latest.db.gz

# Verify restored data
sqlite3 data/farm_attendance.db "SELECT COUNT(*) FROM employees;"
```

## Performance Issues

### Slow Response Times

#### Symptoms
- Web interface loading slowly
- API timeouts
- Database query delays
- Kiosk responsiveness issues

#### Diagnostic Steps

1. **Check System Resources:**
   ```bash
   # Check CPU usage
   top
   htop
   
   # Check memory usage
   free -h
   cat /proc/meminfo
   
   # Check disk I/O
   iostat -x 1
   iotop
   ```

2. **Check Database Performance:**
   ```bash
   # Check database size
   du -h data/farm_attendance.db
   
   # Analyze query performance
   sqlite3 data/farm_attendance.db "EXPLAIN QUERY PLAN SELECT * FROM attendance_records WHERE employee_id = 'uuid';"
   ```

#### Solutions

**Optimize Database:**
```bash
# Vacuum database
sqlite3 data/farm_attendance.db "VACUUM;"

# Analyze and optimize
sqlite3 data/farm_attendance.db "ANALYZE;"

# Add missing indexes
sqlite3 data/farm_attendance.db "CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, date(clock_in_time));"
```

**Free System Resources:**
```bash
# Clear system cache
sudo sync
sudo echo 3 > /proc/sys/vm/drop_caches

# Restart services
sudo systemctl restart farm-attendance

# Check for memory leaks
valgrind --tool=memcheck --leak-check=full node app.js
```

**Optimize Application:**
```bash
# Update to latest version
git pull
npm install
npm run build

# Optimize Node.js settings
export NODE_OPTIONS="--max-old-space-size=2048"
```

### High Resource Usage

#### Symptoms
- High CPU usage
- Memory exhaustion
- Disk space full
- System slowdown

#### Diagnostic Steps

1. **Identify Resource Hogs:**
   ```bash
   # Top processes by CPU
   ps aux --sort=-%cpu | head -10
   
   # Top processes by memory
   ps aux --sort=-%mem | head -10
   
   # Check disk usage
   df -h
   du -sh /* | sort -hr
   ```

2. **Monitor Resource Usage:**
   ```bash
   # Continuous monitoring
   watch -n 1 'free -h && df -h'
   
   # Log resource usage
   sar -u -r 1 60 > resource_usage.log
   ```

#### Solutions

**Reduce CPU Usage:**
```bash
# Lower process priority
renice 10 $(pgrep node)

# Limit CPU usage
cpulimit -l 50 -p $(pgrep node)

# Optimize application settings
export NODE_ENV=production
```

**Free Memory:**
```bash
# Kill unnecessary processes
pkill -f "unnecessary_process"

# Clear buffers and cache
sudo sync
sudo echo 1 > /proc/sys/vm/drop_caches

# Restart application
sudo systemctl restart farm-attendance
```

**Free Disk Space:**
```bash
# Clean log files
sudo journalctl --vacuum-time=7d
find /var/log -name "*.log" -mtime +7 -delete

# Clean old backups
find backups/ -name "*.gz" -mtime +30 -delete

# Clean temporary files
sudo rm -rf /tmp/*
sudo rm -rf /var/tmp/*
```

## Error Messages

### Common Error Messages and Solutions

#### "Database is locked"
**Cause:** Another process is accessing the database
**Solution:**
```bash
# Find processes using database
lsof data/farm_attendance.db

# Kill blocking processes
sudo kill -9 <process_id>

# Restart application
sudo systemctl restart farm-attendance
```

#### "EADDRINUSE: address already in use"
**Cause:** Port 3000 is already in use
**Solution:**
```bash
# Find process using port
sudo lsof -i :3000

# Kill process
sudo kill -9 <process_id>

# Or use different port
export PORT=3001
```

#### "ENOENT: no such file or directory"
**Cause:** Missing files or directories
**Solution:**
```bash
# Create missing directories
mkdir -p data uploads backups logs

# Check file permissions
ls -la data/
sudo chown -R farm-user:farm-user data/
```

#### "RFID reader not found"
**Cause:** RFID reader not connected or configured
**Solution:**
```bash
# Check USB devices
lsusb

# Check device permissions
sudo chmod 666 /dev/hidraw0

# Restart RFID service
sudo systemctl restart rfid-service
```

#### "Camera not accessible"
**Cause:** Camera device not available
**Solution:**
```bash
# Check camera devices
ls /dev/video*

# Test camera
fswebcam -d /dev/video0 test.jpg

# Fix permissions
sudo usermod -a -G video farm-user
```

#### "Network timeout"
**Cause:** Network connectivity issues
**Solution:**
```bash
# Test connectivity
ping -c 4 8.8.8.8

# Check network configuration
ip addr show
ip route show

# Restart networking
sudo systemctl restart networking
```

## Emergency Procedures

### System Down Emergency

#### Immediate Actions
1. **Assess the situation**
   - Determine scope of outage
   - Identify affected components
   - Check for obvious causes

2. **Implement workarounds**
   - Switch to manual time tracking
   - Notify all employees
   - Document manual records

3. **Begin recovery**
   - Follow recovery procedures
   - Contact support if needed
   - Keep stakeholders informed

#### Recovery Steps
```bash
# 1. Check system status
systemctl status farm-attendance
journalctl -u farm-attendance -n 50

# 2. Try service restart
sudo systemctl restart farm-attendance

# 3. Check database
sqlite3 data/farm_attendance.db "PRAGMA integrity_check;"

# 4. Restore from backup if needed
./scripts/restore-database.sh backups/latest_backup.db.gz

# 5. Verify system functionality
curl http://localhost:3000/health
```

### Data Loss Emergency

#### Immediate Actions
1. **Stop all system access**
   - Prevent further data corruption
   - Isolate affected systems
   - Document the incident

2. **Assess data loss extent**
   - Check what data is affected
   - Identify last known good state
   - Review available backups

3. **Begin recovery process**
   - Restore from most recent backup
   - Verify data integrity
   - Test system functionality

#### Recovery Commands
```bash
# 1. Stop application
sudo systemctl stop farm-attendance

# 2. Backup current state (even if corrupted)
cp data/farm_attendance.db data/farm_attendance.db.emergency_backup

# 3. List available backups
ls -la backups/

# 4. Restore from backup
./scripts/restore-database.sh backups/farm_attendance_20231201_120000.db.gz

# 5. Verify restoration
sqlite3 data/farm_attendance.db "SELECT COUNT(*) FROM employees;"
sqlite3 data/farm_attendance.db "SELECT COUNT(*) FROM attendance_records;"

# 6. Start application
sudo systemctl start farm-attendance

# 7. Test functionality
curl http://localhost:3000/health
```

### Security Incident Response

#### Immediate Actions
1. **Contain the threat**
   - Isolate affected systems
   - Change passwords
   - Block suspicious access

2. **Assess the damage**
   - Check for data breaches
   - Review access logs
   - Identify compromised accounts

3. **Begin remediation**
   - Apply security patches
   - Update configurations
   - Monitor for further activity

#### Security Commands
```bash
# 1. Check for suspicious activity
journalctl -u farm-attendance | grep -i "failed\|error\|unauthorized"
last -f /var/log/wtmp
netstat -an | grep ESTABLISHED

# 2. Change critical passwords
# (Use admin interface or direct database update)

# 3. Update system
sudo apt update && sudo apt upgrade -y

# 4. Check file integrity
find /opt/farm-attendance -type f -exec md5sum {} \; > current_checksums.txt
diff original_checksums.txt current_checksums.txt

# 5. Review firewall rules
sudo ufw status verbose
sudo iptables -L -n
```

### Contact Information

**Internal Support:**
- System Administrator: [contact info]
- IT Manager: [contact info]
- Emergency Contact: [contact info]

**External Support:**
- Vendor Support: [contact info]
- Hardware Support: [contact info]
- Network Support: [contact info]

**Emergency Procedures:**
- Document all actions taken
- Keep detailed logs
- Communicate with stakeholders
- Follow up with post-incident review

Remember: When in doubt, document everything, contact support, and prioritize data integrity over system availability.