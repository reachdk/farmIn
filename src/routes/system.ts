import express from 'express';
import { DatabaseManager } from '../database/DatabaseManager';
import { authenticateToken, requireRole } from '../middleware/auth';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

const router = express.Router();

// Basic health check (public)
router.get('/health', async (req, res) => {
  try {
    const dbManager = DatabaseManager.getInstance();
    const dbHealthy = await dbManager.checkHealth();
    
    const health = {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      database: dbHealthy ? 'connected' : 'disconnected'
    };

    res.status(dbHealthy ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Detailed health check (admin only)
router.get('/health/detailed', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const dbManager = DatabaseManager.getInstance();
    
    // Database health
    const dbHealthy = await dbManager.checkHealth();
    const db = dbManager.getDatabase();
    
    // Get database statistics
    const dbStats = await new Promise<any>((resolve, reject) => {
      db.all(`
        SELECT 
          (SELECT COUNT(*) FROM employees) as employee_count,
          (SELECT COUNT(*) FROM attendance_records) as attendance_count,
          (SELECT COUNT(*) FROM time_categories) as category_count,
          (SELECT COUNT(*) FROM sync_queue WHERE status = 'pending') as pending_sync_count
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    });

    // System resources
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Disk usage
    const dataDir = path.join(process.cwd(), 'data');
    const uploadsDir = path.join(process.cwd(), 'uploads');
    
    let diskUsage = {};
    try {
      const stats = fs.statSync(dataDir);
      diskUsage = {
        dataDirectory: dataDir,
        exists: fs.existsSync(dataDir),
        writable: fs.accessSync ? true : false
      };
    } catch (error) {
      diskUsage = { error: 'Could not access data directory' };
    }

    // Network connectivity (basic check)
    let networkStatus = 'unknown';
    try {
      // Simple connectivity check
      networkStatus = 'connected';
    } catch (error) {
      networkStatus = 'disconnected';
    }

    const detailedHealth = {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      
      database: {
        status: dbHealthy ? 'connected' : 'disconnected',
        statistics: dbStats
      },
      
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        hostname: os.hostname(),
        loadAverage: os.loadavg(),
        
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          systemTotal: os.totalmem(),
          systemFree: os.freemem(),
          usage: {
            rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
            systemUsage: `${Math.round((os.totalmem() - os.freemem()) / os.totalmem() * 100)}%`
          }
        },
        
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
          cores: os.cpus().length
        },
        
        disk: diskUsage,
        network: {
          status: networkStatus,
          interfaces: os.networkInterfaces()
        }
      }
    };

    res.json(detailedHealth);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// System metrics endpoint
router.get('/metrics', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const dbManager = DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    // Get various metrics
    const metrics = await new Promise<any>((resolve, reject) => {
      db.all(`
        SELECT 
          -- Employee metrics
          (SELECT COUNT(*) FROM employees WHERE is_active = 1) as active_employees,
          (SELECT COUNT(*) FROM employees) as total_employees,
          
          -- Attendance metrics (today)
          (SELECT COUNT(*) FROM attendance_records 
           WHERE date(clock_in_time) = date('now')) as today_attendance,
          (SELECT COUNT(*) FROM attendance_records 
           WHERE date(clock_in_time) = date('now') AND clock_out_time IS NULL) as currently_clocked_in,
          
          -- Attendance metrics (this week)
          (SELECT COUNT(*) FROM attendance_records 
           WHERE date(clock_in_time) >= date('now', 'weekday 0', '-6 days')) as week_attendance,
          
          -- Sync metrics
          (SELECT COUNT(*) FROM sync_queue WHERE status = 'pending') as pending_sync,
          (SELECT COUNT(*) FROM sync_queue WHERE status = 'failed') as failed_sync,
          
          -- System metrics
          (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table') as table_count
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    });

    // Add system resource metrics
    const memUsage = process.memoryUsage();
    const systemMetrics = {
      ...metrics,
      system: {
        uptime: process.uptime(),
        memory_usage_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        memory_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
        cpu_cores: os.cpus().length,
        load_average: os.loadavg()[0],
        free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
        total_memory_mb: Math.round(os.totalmem() / 1024 / 1024)
      },
      timestamp: new Date().toISOString()
    };

    res.json(systemMetrics);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get metrics'
    });
  }
});

// Storage statistics
router.get('/storage-stats', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const dbManager = DatabaseManager.getInstance();
    const dbPath = path.join(process.cwd(), 'data', 'farm_attendance.db');
    
    let dbSize = 0;
    let dbExists = false;
    
    try {
      const stats = fs.statSync(dbPath);
      dbSize = stats.size;
      dbExists = true;
    } catch (error) {
      // Database file doesn't exist or can't be accessed
    }

    // Check uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads');
    let uploadsSize = 0;
    let uploadsCount = 0;
    
    try {
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir, { withFileTypes: true });
        for (const file of files) {
          if (file.isFile()) {
            const filePath = path.join(uploadsDir, file.name);
            const stats = fs.statSync(filePath);
            uploadsSize += stats.size;
            uploadsCount++;
          }
        }
      }
    } catch (error) {
      // Uploads directory issues
    }

    // Check backups directory
    const backupsDir = path.join(process.cwd(), 'backups');
    let backupsSize = 0;
    let backupsCount = 0;
    
    try {
      if (fs.existsSync(backupsDir)) {
        const files = fs.readdirSync(backupsDir, { withFileTypes: true });
        for (const file of files) {
          if (file.isFile() && file.name.endsWith('.gz')) {
            const filePath = path.join(backupsDir, file.name);
            const stats = fs.statSync(filePath);
            backupsSize += stats.size;
            backupsCount++;
          }
        }
      }
    } catch (error) {
      // Backups directory issues
    }

    // Get disk space information
    let diskSpace = {};
    try {
      if (process.platform !== 'win32') {
        const df = execSync('df -h .', { encoding: 'utf8' });
        const lines = df.split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(/\s+/);
          diskSpace = {
            filesystem: parts[0],
            size: parts[1],
            used: parts[2],
            available: parts[3],
            usePercent: parts[4],
            mountPoint: parts[5]
          };
        }
      }
    } catch (error) {
      diskSpace = { error: 'Could not get disk space information' };
    }

    const storageStats = {
      database: {
        exists: dbExists,
        path: dbPath,
        size: dbSize,
        sizeHuman: dbSize > 0 ? `${Math.round(dbSize / 1024 / 1024 * 100) / 100}MB` : '0MB'
      },
      uploads: {
        directory: uploadsDir,
        exists: fs.existsSync(uploadsDir),
        fileCount: uploadsCount,
        totalSize: uploadsSize,
        sizeHuman: uploadsSize > 0 ? `${Math.round(uploadsSize / 1024 / 1024 * 100) / 100}MB` : '0MB'
      },
      backups: {
        directory: backupsDir,
        exists: fs.existsSync(backupsDir),
        fileCount: backupsCount,
        totalSize: backupsSize,
        sizeHuman: backupsSize > 0 ? `${Math.round(backupsSize / 1024 / 1024 * 100) / 100}MB` : '0MB'
      },
      disk: diskSpace,
      total: {
        applicationSize: dbSize + uploadsSize,
        applicationSizeHuman: `${Math.round((dbSize + uploadsSize) / 1024 / 1024 * 100) / 100}MB`,
        backupSize: backupsSize,
        backupSizeHuman: `${Math.round(backupsSize / 1024 / 1024 * 100) / 100}MB`
      },
      timestamp: new Date().toISOString()
    };

    res.json(storageStats);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get storage statistics'
    });
  }
});

// Memory statistics
router.get('/memory-stats', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const systemMem = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    };

    const memoryStats = {
      process: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers || 0,
        
        // Human readable
        rssHuman: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapTotalHuman: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsedHuman: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        externalHuman: `${Math.round(memUsage.external / 1024 / 1024)}MB`
      },
      system: {
        total: systemMem.total,
        free: systemMem.free,
        used: systemMem.used,
        
        // Human readable
        totalHuman: `${Math.round(systemMem.total / 1024 / 1024 / 1024 * 100) / 100}GB`,
        freeHuman: `${Math.round(systemMem.free / 1024 / 1024)}MB`,
        usedHuman: `${Math.round(systemMem.used / 1024 / 1024)}MB`,
        usagePercent: Math.round(systemMem.used / systemMem.total * 100)
      },
      timestamp: new Date().toISOString()
    };

    res.json(memoryStats);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get memory statistics'
    });
  }
});

// Database statistics
router.get('/database-stats', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const dbManager = DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    // Get table information
    const tableStats = await new Promise<any[]>((resolve, reject) => {
      db.all(`
        SELECT 
          name as table_name,
          (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND tbl_name = m.name) as index_count
        FROM sqlite_master m 
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Get record counts for each table
    const recordCounts = {};
    for (const table of tableStats) {
      try {
        const count = await new Promise<number>((resolve, reject) => {
          db.get(`SELECT COUNT(*) as count FROM ${table.table_name}`, (err, row: any) => {
            if (err) reject(err);
            else resolve(row.count);
          });
        });
        recordCounts[table.table_name] = count;
      } catch (error) {
        recordCounts[table.table_name] = 'error';
      }
    }

    // Get database file size
    const dbPath = path.join(process.cwd(), 'data', 'farm_attendance.db');
    let dbSize = 0;
    try {
      const stats = fs.statSync(dbPath);
      dbSize = stats.size;
    } catch (error) {
      // Database file doesn't exist
    }

    // Get SQLite version and other info
    const sqliteInfo = await new Promise<any>((resolve, reject) => {
      db.get('SELECT sqlite_version() as version', (err, row: any) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const databaseStats = {
      file: {
        path: dbPath,
        size: dbSize,
        sizeHuman: dbSize > 0 ? `${Math.round(dbSize / 1024 / 1024 * 100) / 100}MB` : '0MB',
        exists: fs.existsSync(dbPath)
      },
      sqlite: {
        version: sqliteInfo.version
      },
      tables: tableStats.map(table => ({
        ...table,
        recordCount: recordCounts[table.table_name]
      })),
      summary: {
        totalTables: tableStats.length,
        totalRecords: Object.values(recordCounts).reduce((sum: number, count) => 
          typeof count === 'number' ? sum + count : sum, 0),
        totalIndexes: tableStats.reduce((sum, table) => sum + table.index_count, 0)
      },
      timestamp: new Date().toISOString()
    };

    res.json(databaseStats);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get database statistics'
    });
  }
});

// System logs endpoint
router.get('/logs', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const { lines = 100, level = 'all' } = req.query;
    const maxLines = Math.min(parseInt(lines as string) || 100, 1000);
    
    // This is a simplified log endpoint
    // In a real implementation, you'd read from actual log files
    const logs = [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'System health check endpoint accessed',
        source: 'system-routes'
      }
    ];

    res.json({
      logs: logs.slice(-maxLines),
      totalLines: logs.length,
      requestedLines: maxLines,
      level: level,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get system logs'
    });
  }
});

export default router;