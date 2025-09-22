#!/bin/bash

# Farm Attendance System - Database Backup Script
# Creates compressed backups of the SQLite database with metadata

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULT_DB_PATH="$PROJECT_ROOT/data/farm_attendance.db"
DEFAULT_BACKUP_DIR="$PROJECT_ROOT/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
HOSTNAME=$(hostname)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse command line arguments
DB_PATH="${1:-$DEFAULT_DB_PATH}"
BACKUP_DIR="${2:-$DEFAULT_BACKUP_DIR}"
RETENTION_DAYS="${3:-30}"

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

# Validate inputs
if [ ! -f "$DB_PATH" ]; then
    error "Database file not found: $DB_PATH"
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate backup filename
BACKUP_FILENAME="farm_attendance_${HOSTNAME}_${TIMESTAMP}.db"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILENAME"
METADATA_PATH="$BACKUP_DIR/${BACKUP_FILENAME}.meta"
COMPRESSED_PATH="$BACKUP_PATH.gz"

log "Starting database backup..."
log "Source: $DB_PATH"
log "Destination: $COMPRESSED_PATH"

# Check database integrity before backup
log "Checking database integrity..."
if ! sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
    error "Database integrity check failed. Backup aborted."
fi

# Get database statistics
DB_SIZE=$(stat -f%z "$DB_PATH" 2>/dev/null || stat -c%s "$DB_PATH" 2>/dev/null)
RECORD_COUNTS=$(sqlite3 "$DB_PATH" "
SELECT 
    'employees: ' || COUNT(*) FROM employees
UNION ALL
SELECT 
    'attendance_records: ' || COUNT(*) FROM attendance_records
UNION ALL
SELECT 
    'time_categories: ' || COUNT(*) FROM time_categories
UNION ALL
SELECT 
    'sync_queue: ' || COUNT(*) FROM sync_queue;
")

# Create backup using SQLite backup API (ensures consistency)
log "Creating database backup..."
sqlite3 "$DB_PATH" ".backup '$BACKUP_PATH'"

# Verify backup integrity
log "Verifying backup integrity..."
if ! sqlite3 "$BACKUP_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
    rm -f "$BACKUP_PATH"
    error "Backup integrity check failed. Backup file removed."
fi

# Create metadata file
log "Creating backup metadata..."
cat > "$METADATA_PATH" << EOF
{
    "backup_info": {
        "timestamp": "$TIMESTAMP",
        "hostname": "$HOSTNAME",
        "source_path": "$DB_PATH",
        "backup_path": "$COMPRESSED_PATH",
        "created_by": "$(whoami)",
        "script_version": "1.0"
    },
    "database_info": {
        "original_size_bytes": $DB_SIZE,
        "original_size_human": "$(numfmt --to=iec $DB_SIZE)",
        "record_counts": {
$(echo "$RECORD_COUNTS" | sed 's/employees: /            "employees": /' | sed 's/attendance_records: /            "attendance_records": /' | sed 's/time_categories: /            "time_categories": /' | sed 's/sync_queue: /            "sync_queue": /' | sed 's/$/,/' | sed '$s/,$//')
        }
    },
    "system_info": {
        "os": "$(uname -s)",
        "architecture": "$(uname -m)",
        "sqlite_version": "$(sqlite3 --version | cut -d' ' -f1)"
    }
}
EOF

# Compress backup
log "Compressing backup..."
gzip "$BACKUP_PATH"

# Get compressed size
COMPRESSED_SIZE=$(stat -f%z "$COMPRESSED_PATH" 2>/dev/null || stat -c%s "$COMPRESSED_PATH" 2>/dev/null)
COMPRESSION_RATIO=$(echo "scale=2; $COMPRESSED_SIZE * 100 / $DB_SIZE" | bc)

# Update metadata with compression info
TEMP_META=$(mktemp)
jq --arg compressed_size "$COMPRESSED_SIZE" \
   --arg compressed_size_human "$(numfmt --to=iec $COMPRESSED_SIZE)" \
   --arg compression_ratio "$COMPRESSION_RATIO" \
   '.backup_info.compressed_size_bytes = ($compressed_size | tonumber) |
    .backup_info.compressed_size_human = $compressed_size_human |
    .backup_info.compression_ratio_percent = ($compression_ratio | tonumber)' \
   "$METADATA_PATH" > "$TEMP_META" && mv "$TEMP_META" "$METADATA_PATH"

# Create checksum
CHECKSUM=$(sha256sum "$COMPRESSED_PATH" | cut -d' ' -f1)
TEMP_META=$(mktemp)
jq --arg checksum "$CHECKSUM" \
   '.backup_info.sha256_checksum = $checksum' \
   "$METADATA_PATH" > "$TEMP_META" && mv "$TEMP_META" "$METADATA_PATH"

log "Backup completed successfully!"
log "Backup file: $COMPRESSED_PATH"
log "Metadata file: $METADATA_PATH"
log "Original size: $(numfmt --to=iec $DB_SIZE)"
log "Compressed size: $(numfmt --to=iec $COMPRESSED_SIZE) (${COMPRESSION_RATIO}% of original)"
log "SHA256 checksum: $CHECKSUM"

# Clean up old backups
if [ "$RETENTION_DAYS" -gt 0 ]; then
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    find "$BACKUP_DIR" -name "farm_attendance_*.db.gz" -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "farm_attendance_*.db.gz.meta" -mtime +$RETENTION_DAYS -delete
    CLEANED=$(find "$BACKUP_DIR" -name "farm_attendance_*.db.gz" -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)
    if [ "$CLEANED" -gt 0 ]; then
        log "Cleaned up $CLEANED old backup files"
    fi
fi

# List recent backups
log "Recent backups:"
ls -lah "$BACKUP_DIR"/farm_attendance_*.db.gz | tail -5

log "Backup process completed successfully!"

# Return backup path for use by other scripts
echo "$COMPRESSED_PATH"