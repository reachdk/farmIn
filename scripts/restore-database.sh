#!/bin/bash

# Farm Attendance System - Database Restore Script
# Restores database from compressed backup with verification

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULT_DB_PATH="$PROJECT_ROOT/data/farm_attendance.db"
DEFAULT_BACKUP_DIR="$PROJECT_ROOT/backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Show usage
show_usage() {
    echo "Usage: $0 <backup_file> [target_db_path] [--force]"
    echo ""
    echo "Arguments:"
    echo "  backup_file      Path to the compressed backup file (.db.gz)"
    echo "  target_db_path   Target database path (default: $DEFAULT_DB_PATH)"
    echo "  --force          Skip confirmation prompts"
    echo ""
    echo "Examples:"
    echo "  $0 backups/farm_attendance_20231201_120000.db.gz"
    echo "  $0 backups/farm_attendance_20231201_120000.db.gz /tmp/restored.db"
    echo "  $0 backups/farm_attendance_20231201_120000.db.gz --force"
    echo ""
    echo "Available backups:"
    if [ -d "$DEFAULT_BACKUP_DIR" ]; then
        ls -1t "$DEFAULT_BACKUP_DIR"/farm_attendance_*.db.gz 2>/dev/null | head -10 || echo "  No backups found"
    else
        echo "  Backup directory not found: $DEFAULT_BACKUP_DIR"
    fi
}

# Parse arguments
BACKUP_FILE=""
TARGET_DB_PATH="$DEFAULT_DB_PATH"
FORCE_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_usage
            exit 0
            ;;
        --force)
            FORCE_MODE=true
            shift
            ;;
        *)
            if [ -z "$BACKUP_FILE" ]; then
                BACKUP_FILE="$1"
            elif [ "$TARGET_DB_PATH" = "$DEFAULT_DB_PATH" ]; then
                TARGET_DB_PATH="$1"
            else
                error "Too many arguments. Use --help for usage information."
            fi
            shift
            ;;
    esac
done

# Validate arguments
if [ -z "$BACKUP_FILE" ]; then
    echo "Error: Backup file not specified."
    echo ""
    show_usage
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    error "Backup file not found: $BACKUP_FILE"
fi

# Check if backup file is compressed
if [[ "$BACKUP_FILE" != *.gz ]]; then
    error "Backup file must be compressed (.gz extension expected)"
fi

# Find metadata file
METADATA_FILE="${BACKUP_FILE}.meta"
if [ ! -f "$METADATA_FILE" ]; then
    warn "Metadata file not found: $METADATA_FILE"
    warn "Proceeding without metadata verification"
fi

log "Starting database restore..."
log "Backup file: $BACKUP_FILE"
log "Target database: $TARGET_DB_PATH"

# Read and display metadata if available
if [ -f "$METADATA_FILE" ]; then
    log "Reading backup metadata..."
    
    BACKUP_TIMESTAMP=$(jq -r '.backup_info.timestamp' "$METADATA_FILE" 2>/dev/null || echo "unknown")
    BACKUP_HOSTNAME=$(jq -r '.backup_info.hostname' "$METADATA_FILE" 2>/dev/null || echo "unknown")
    ORIGINAL_SIZE=$(jq -r '.database_info.original_size_human' "$METADATA_FILE" 2>/dev/null || echo "unknown")
    COMPRESSED_SIZE=$(jq -r '.backup_info.compressed_size_human' "$METADATA_FILE" 2>/dev/null || echo "unknown")
    EXPECTED_CHECKSUM=$(jq -r '.backup_info.sha256_checksum' "$METADATA_FILE" 2>/dev/null || echo "")
    
    echo ""
    echo "Backup Information:"
    echo "  Created: $BACKUP_TIMESTAMP"
    echo "  Source host: $BACKUP_HOSTNAME"
    echo "  Original size: $ORIGINAL_SIZE"
    echo "  Compressed size: $COMPRESSED_SIZE"
    echo ""
    
    # Verify checksum if available
    if [ -n "$EXPECTED_CHECKSUM" ] && [ "$EXPECTED_CHECKSUM" != "null" ]; then
        log "Verifying backup file integrity..."
        ACTUAL_CHECKSUM=$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)
        if [ "$ACTUAL_CHECKSUM" = "$EXPECTED_CHECKSUM" ]; then
            log "Checksum verification passed"
        else
            error "Checksum verification failed! Backup file may be corrupted."
        fi
    fi
fi

# Check if target database exists
if [ -f "$TARGET_DB_PATH" ]; then
    if [ "$FORCE_MODE" = false ]; then
        echo ""
        warn "Target database already exists: $TARGET_DB_PATH"
        echo "This will overwrite the existing database."
        read -p "Do you want to continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Restore cancelled by user"
            exit 0
        fi
    fi
    
    # Create backup of existing database
    EXISTING_BACKUP="${TARGET_DB_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
    log "Creating backup of existing database: $EXISTING_BACKUP"
    cp "$TARGET_DB_PATH" "$EXISTING_BACKUP"
fi

# Create target directory if it doesn't exist
TARGET_DIR=$(dirname "$TARGET_DB_PATH")
mkdir -p "$TARGET_DIR"

# Create temporary file for decompression
TEMP_DB=$(mktemp)
trap "rm -f $TEMP_DB" EXIT

# Decompress backup
log "Decompressing backup file..."
gunzip -c "$BACKUP_FILE" > "$TEMP_DB"

# Verify decompressed database integrity
log "Verifying restored database integrity..."
if ! sqlite3 "$TEMP_DB" "PRAGMA integrity_check;" | grep -q "ok"; then
    error "Restored database failed integrity check"
fi

# Get record counts from restored database
log "Checking restored database contents..."
RESTORED_COUNTS=$(sqlite3 "$TEMP_DB" "
SELECT 
    'Employees: ' || COUNT(*) FROM employees
UNION ALL
SELECT 
    'Attendance records: ' || COUNT(*) FROM attendance_records
UNION ALL
SELECT 
    'Time categories: ' || COUNT(*) FROM time_categories
UNION ALL
SELECT 
    'Sync queue items: ' || COUNT(*) FROM sync_queue;
" 2>/dev/null || echo "Could not read table counts")

echo ""
echo "Restored database contents:"
echo "$RESTORED_COUNTS"
echo ""

# Final confirmation if not in force mode
if [ "$FORCE_MODE" = false ]; then
    read -p "Proceed with restore? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Restore cancelled by user"
        exit 0
    fi
fi

# Move restored database to target location
log "Moving restored database to target location..."
mv "$TEMP_DB" "$TARGET_DB_PATH"

# Set appropriate permissions
chmod 644 "$TARGET_DB_PATH"

# Verify final database
log "Performing final verification..."
if sqlite3 "$TARGET_DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
    log "Final integrity check passed"
else
    error "Final integrity check failed"
fi

# Get final database size
FINAL_SIZE=$(stat -f%z "$TARGET_DB_PATH" 2>/dev/null || stat -c%s "$TARGET_DB_PATH" 2>/dev/null)

log "Database restore completed successfully!"
log "Restored database: $TARGET_DB_PATH"
log "Final size: $(numfmt --to=iec $FINAL_SIZE)"

# Show restore summary
echo ""
echo "Restore Summary:"
echo "  Source backup: $BACKUP_FILE"
echo "  Target database: $TARGET_DB_PATH"
echo "  Final size: $(numfmt --to=iec $FINAL_SIZE)"
if [ -f "$METADATA_FILE" ]; then
    echo "  Original backup date: $BACKUP_TIMESTAMP"
    echo "  Original backup host: $BACKUP_HOSTNAME"
fi
echo ""

log "Restore process completed successfully!"

# Suggest next steps
echo ""
echo "Next steps:"
echo "1. Restart the Farm Attendance System application"
echo "2. Verify that all data is accessible"
echo "3. Check system logs for any issues"
if [ -f "${TARGET_DB_PATH}.backup.*" ]; then
    echo "4. Remove the backup of the old database if everything works correctly:"
    echo "   rm ${TARGET_DB_PATH}.backup.*"
fi