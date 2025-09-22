#!/usr/bin/env node

/**
 * Farm Attendance System - Backup Scheduler
 * Automated backup service that runs as a separate process
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// Configuration
const CONFIG = {
  DATABASE_PATH: process.env.DATABASE_PATH || '/app/data/farm_attendance.db',
  BACKUP_PATH: process.env.BACKUP_PATH || '/app/backups',
  BACKUP_INTERVAL: process.env.BACKUP_INTERVAL || '0 2 * * *', // Daily at 2 AM
  RETENTION_DAYS: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
  MAX_BACKUP_FILES: parseInt(process.env.MAX_BACKUP_FILES) || 50,
  HEALTH_CHECK_INTERVAL: process.env.HEALTH_CHECK_INTERVAL || '*/5 * * * *', // Every 5 minutes
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

// Logging
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLogLevel = LOG_LEVELS[CONFIG.LOG_LEVEL] || LOG_LEVELS.info;

function log(level, message, data = null) {
  if (LOG_LEVELS[level] <= currentLogLevel) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(data && { data })
    };
    console.log(JSON.stringify(logEntry));
  }
}

// Backup functions
async function createBackup() {
  try {
    log('info', 'Starting scheduled backup...');
    
    // Check if database exists
    if (!fs.existsSync(CONFIG.DATABASE_PATH)) {
      log('warn', 'Database file not found, skipping backup', { path: CONFIG.DATABASE_PATH });
      return false;
    }

    // Ensure backup directory exists
    if (!fs.existsSync(CONFIG.BACKUP_PATH)) {
      fs.mkdirSync(CONFIG.BACKUP_PATH, { recursive: true });
      log('info', 'Created backup directory', { path: CONFIG.BACKUP_PATH });
    }

    // Execute backup script
    const backupScript = path.join(__dirname, 'backup-database.sh');
    const command = `${backupScript} "${CONFIG.DATABASE_PATH}" "${CONFIG.BACKUP_PATH}" ${CONFIG.RETENTION_DAYS}`;
    
    log('debug', 'Executing backup command', { command });
    
    const output = execSync(command, { 
      encoding: 'utf8',
      timeout: 300000 // 5 minutes timeout
    });
    
    log('info', 'Backup completed successfully');
    log('debug', 'Backup output', { output: output.trim() });
    
    // Clean up old backups if we have too many
    await cleanupOldBackups();
    
    return true;
  } catch (error) {
    log('error', 'Backup failed', { 
      error: error.message,
      stack: error.stack 
    });
    return false;
  }
}

async function cleanupOldBackups() {
  try {
    const backupFiles = fs.readdirSync(CONFIG.BACKUP_PATH)
      .filter(file => file.match(/^farm_attendance_.*\.db\.gz$/))
      .map(file => ({
        name: file,
        path: path.join(CONFIG.BACKUP_PATH, file),
        stats: fs.statSync(path.join(CONFIG.BACKUP_PATH, file))
      }))
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

    if (backupFiles.length > CONFIG.MAX_BACKUP_FILES) {
      const filesToDelete = backupFiles.slice(CONFIG.MAX_BACKUP_FILES);
      
      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        
        // Also delete metadata file if it exists
        const metaFile = `${file.path}.meta`;
        if (fs.existsSync(metaFile)) {
          fs.unlinkSync(metaFile);
        }
        
        log('info', 'Deleted old backup file', { file: file.name });
      }
      
      log('info', 'Cleaned up old backups', { 
        deleted: filesToDelete.length,
        remaining: CONFIG.MAX_BACKUP_FILES 
      });
    }
  } catch (error) {
    log('error', 'Failed to cleanup old backups', { error: error.message });
  }
}

// Health check functions
async function performHealthCheck() {
  try {
    log('debug', 'Performing health check...');
    
    const checks = {
      database: await checkDatabase(),
      storage: await checkStorage(),
      backups: await checkBackups()
    };
    
    const allHealthy = Object.values(checks).every(check => check.healthy);
    
    if (!allHealthy) {
      log('warn', 'Health check found issues', { checks });
    } else {
      log('debug', 'Health check passed', { checks });
    }
    
    return { healthy: allHealthy, checks };
  } catch (error) {
    log('error', 'Health check failed', { error: error.message });
    return { healthy: false, error: error.message };
  }
}

async function checkDatabase() {
  try {
    if (!fs.existsSync(CONFIG.DATABASE_PATH)) {
      return { healthy: false, message: 'Database file not found' };
    }
    
    const stats = fs.statSync(CONFIG.DATABASE_PATH);
    const sizeGB = stats.size / (1024 * 1024 * 1024);
    
    // Check if database is too large (warning at 1GB)
    if (sizeGB > 1) {
      log('warn', 'Database file is large', { sizeGB: sizeGB.toFixed(2) });
    }
    
    return { 
      healthy: true, 
      size: stats.size,
      sizeGB: sizeGB.toFixed(2),
      lastModified: stats.mtime
    };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

async function checkStorage() {
  try {
    // Check available disk space
    const df = execSync('df -h .', { encoding: 'utf8' });
    const lines = df.split('\n');
    
    if (lines.length > 1) {
      const parts = lines[1].split(/\s+/);
      const usePercent = parseInt(parts[4].replace('%', ''));
      
      // Warning if disk usage > 80%
      if (usePercent > 80) {
        log('warn', 'High disk usage detected', { usePercent });
      }
      
      return {
        healthy: usePercent < 90, // Critical if > 90%
        usePercent,
        available: parts[3],
        total: parts[1]
      };
    }
    
    return { healthy: true, message: 'Could not determine disk usage' };
  } catch (error) {
    return { healthy: true, error: error.message }; // Non-critical
  }
}

async function checkBackups() {
  try {
    if (!fs.existsSync(CONFIG.BACKUP_PATH)) {
      return { healthy: false, message: 'Backup directory not found' };
    }
    
    const backupFiles = fs.readdirSync(CONFIG.BACKUP_PATH)
      .filter(file => file.match(/^farm_attendance_.*\.db\.gz$/));
    
    if (backupFiles.length === 0) {
      return { healthy: false, message: 'No backup files found' };
    }
    
    // Check if latest backup is recent (within last 25 hours)
    const latestBackup = backupFiles
      .map(file => ({
        name: file,
        stats: fs.statSync(path.join(CONFIG.BACKUP_PATH, file))
      }))
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime())[0];
    
    const hoursSinceLastBackup = (Date.now() - latestBackup.stats.mtime.getTime()) / (1000 * 60 * 60);
    
    return {
      healthy: hoursSinceLastBackup < 25, // Allow some flexibility
      backupCount: backupFiles.length,
      latestBackup: latestBackup.name,
      hoursSinceLastBackup: hoursSinceLastBackup.toFixed(1)
    };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

// Signal handlers
function setupSignalHandlers() {
  process.on('SIGTERM', () => {
    log('info', 'Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    log('info', 'Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });
  
  process.on('uncaughtException', (error) => {
    log('error', 'Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    log('error', 'Unhandled rejection', { reason, promise });
    process.exit(1);
  });
}

// Main function
async function main() {
  log('info', 'Starting Farm Attendance Backup Scheduler', { 
    config: {
      ...CONFIG,
      // Don't log sensitive paths in production
      DATABASE_PATH: CONFIG.DATABASE_PATH.replace(/\/app\//, '/****/'),
      BACKUP_PATH: CONFIG.BACKUP_PATH.replace(/\/app\//, '/****/')
    }
  });
  
  setupSignalHandlers();
  
  // Schedule backup job
  log('info', 'Scheduling backup job', { interval: CONFIG.BACKUP_INTERVAL });
  cron.schedule(CONFIG.BACKUP_INTERVAL, async () => {
    log('info', 'Backup job triggered by schedule');
    await createBackup();
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'UTC'
  });
  
  // Schedule health check job
  log('info', 'Scheduling health check job', { interval: CONFIG.HEALTH_CHECK_INTERVAL });
  cron.schedule(CONFIG.HEALTH_CHECK_INTERVAL, async () => {
    await performHealthCheck();
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'UTC'
  });
  
  // Perform initial health check
  log('info', 'Performing initial health check...');
  await performHealthCheck();
  
  // Create initial backup if none exists
  const backupFiles = fs.existsSync(CONFIG.BACKUP_PATH) ? 
    fs.readdirSync(CONFIG.BACKUP_PATH).filter(file => file.match(/^farm_attendance_.*\.db\.gz$/)) : [];
  
  if (backupFiles.length === 0) {
    log('info', 'No existing backups found, creating initial backup...');
    await createBackup();
  }
  
  log('info', 'Backup scheduler is running and ready');
  
  // Keep the process alive
  setInterval(() => {
    log('debug', 'Backup scheduler heartbeat', { 
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    });
  }, 300000); // Every 5 minutes
}

// Start the scheduler
if (require.main === module) {
  main().catch(error => {
    log('error', 'Failed to start backup scheduler', { 
      error: error.message, 
      stack: error.stack 
    });
    process.exit(1);
  });
}

module.exports = {
  createBackup,
  performHealthCheck,
  cleanupOldBackups
};