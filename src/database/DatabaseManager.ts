import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: sqlite3.Database | null = null;
  private readonly dbPath: string;

  private constructor() {
    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.dbPath = path.join(dataDir, 'farm_attendance.db');
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(new Error(`Failed to initialize database: ${err.message}`));
        } else {
          console.log('Connected to SQLite database at:', this.dbPath);
          // Enable foreign key constraints
          this.enableForeignKeys()
            .then(() => this.runMigrations())
            .then(() => resolve())
            .catch((migrationError) => {
              console.error('Migration error:', migrationError);
              reject(new Error(`Migration failed: ${migrationError.message}`));
            });
        }
      });
    });
  }

  private async enableForeignKeys(): Promise<void> {
    await this.run('PRAGMA foreign_keys = ON');
    await this.run('PRAGMA journal_mode = WAL'); // Enable WAL mode for better concurrency
  }

  public async checkHealth(): Promise<boolean> {
    if (!this.db) {
      return false;
    }

    return new Promise((resolve) => {
      this.db!.get('SELECT 1', (err) => {
        resolve(!err);
      });
    });
  }

  public async close(): Promise<void> {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db!.close((err) => {
          if (err) {
            reject(err);
          } else {
            console.log('Database connection closed');
            this.db = null;
            resolve();
          }
        });
      });
    }
  }

  public getDatabase(): sqlite3.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  public async run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(err) {
        if (err) {
          console.error('Database run error:', { sql, params, error: err.message });
          reject(new Error(`Database operation failed: ${err.message}`));
        } else {
          resolve(this);
        }
      });
    });
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err, row) => {
        if (err) {
          console.error('Database get error:', { sql, params, error: err.message });
          reject(new Error(`Database query failed: ${err.message}`));
        } else {
          resolve(row as T);
        }
      });
    });
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          console.error('Database all error:', { sql, params, error: err.message });
          reject(new Error(`Database query failed: ${err.message}`));
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  public async beginTransaction(): Promise<void> {
    await this.run('BEGIN TRANSACTION');
  }

  public async commitTransaction(): Promise<void> {
    await this.run('COMMIT');
  }

  public async rollbackTransaction(): Promise<void> {
    await this.run('ROLLBACK');
  }

  public async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    await this.beginTransaction();
    try {
      const result = await operation();
      await this.commitTransaction();
      return result;
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }

  public prepare(sql: string): sqlite3.Statement {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db.prepare(sql);
  }

  private async runMigrations(): Promise<void> {
    try {
      // Create migrations table first to track schema versions
      await this.createMigrationsTable();
      
      const currentVersion = await this.getCurrentSchemaVersion();
      console.log(`Current schema version: ${currentVersion}`);
      
      const migrations = this.getMigrations();
      
      for (const migration of migrations) {
        if (migration.version > currentVersion) {
          console.log(`Running migration ${migration.version}: ${migration.name}`);
          await this.runSingleMigration(migration);
          await this.updateSchemaVersion(migration.version, migration.name);
          console.log(`Migration ${migration.version} completed successfully`);
        }
      }
      
      console.log('All database migrations completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  private async createMigrationsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.run(sql);
  }

  private async getCurrentSchemaVersion(): Promise<number> {
    try {
      const result = await this.get<{ version: number }>('SELECT MAX(version) as version FROM schema_migrations');
      return result?.version || 0;
    } catch (error) {
      // If table doesn't exist or query fails, assume version 0
      return 0;
    }
  }

  private async updateSchemaVersion(version: number, name: string): Promise<void> {
    await this.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [version, name]);
  }

  private getMigrations(): Array<{ version: number; name: string; up: () => Promise<void> }> {
    return [
      {
        version: 1,
        name: 'Create core tables',
        up: async () => {
          await this.createEmployeesTable();
          await this.createTimeCategoriesTable();
          await this.createAttendanceRecordsTable();
          await this.createTimeAdjustmentsTable();
          await this.createSyncQueueTable();
          await this.createSystemSettingsTable();
          await this.createSyncLogTable();
        }
      },
      {
        version: 2,
        name: 'Insert default data',
        up: async () => {
          await this.insertDefaultTimeCategories();
          await this.insertDefaultSystemSettings();
        }
      },
      {
        version: 3,
        name: 'Update sync_queue table',
        up: async () => {
          await this.updateSyncQueueTable();
        }
      },
      {
        version: 4,
        name: 'Create conflict resolution tables',
        up: async () => {
          await this.createConflictResolutionTables();
        }
      }
    ];
  }

  private async runSingleMigration(migration: { version: number; name: string; up: () => Promise<void> }): Promise<void> {
    try {
      await migration.up();
    } catch (error) {
      console.error(`Migration ${migration.version} failed:`, error);
      throw error;
    }
  }

  private async createEmployeesTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        employee_number TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        role TEXT NOT NULL CHECK (role IN ('employee', 'manager', 'admin')) DEFAULT 'employee',
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_sync_at DATETIME
      )
    `;
    await this.run(sql);
  }

  private async createAttendanceRecordsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS attendance_records (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        clock_in_time DATETIME NOT NULL,
        clock_out_time DATETIME,
        total_hours REAL,
        time_category TEXT,
        notes TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'conflict')) DEFAULT 'pending',
        FOREIGN KEY (employee_id) REFERENCES employees (id)
      )
    `;
    await this.run(sql);
  }

  private async createTimeCategoriesTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS time_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        min_hours REAL NOT NULL,
        max_hours REAL,
        pay_multiplier REAL NOT NULL DEFAULT 1.0,
        color TEXT NOT NULL DEFAULT '#007bff',
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.run(sql);
  }

  private async createTimeAdjustmentsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS time_adjustments (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL,
        adjusted_by TEXT NOT NULL,
        original_value TEXT NOT NULL,
        new_value TEXT NOT NULL,
        reason TEXT NOT NULL,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (record_id) REFERENCES attendance_records (id),
        FOREIGN KEY (adjusted_by) REFERENCES employees (id)
      )
    `;
    await this.run(sql);
  }

  private async createSyncQueueTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        data TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt DATETIME,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        conflict_data TEXT
      )
    `;
    await this.run(sql);
  }

  private async createSystemSettingsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.run(sql);
  }

  private async createSyncLogTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS sync_log (
        id TEXT PRIMARY KEY,
        sync_type TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
        records_processed INTEGER DEFAULT 0,
        errors TEXT,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `;
    await this.run(sql);
  }

  private async insertDefaultTimeCategories(): Promise<void> {
    const categories = [
      {
        id: 'half-day',
        name: 'Half Day',
        min_hours: 4,
        max_hours: 7.99,
        pay_multiplier: 1.0,
        color: '#28a745'
      },
      {
        id: 'full-day',
        name: 'Full Day',
        min_hours: 8,
        max_hours: null,
        pay_multiplier: 1.0,
        color: '#007bff'
      }
    ];

    for (const category of categories) {
      try {
        const existing = await this.get('SELECT id FROM time_categories WHERE id = ?', [category.id]);
        if (!existing) {
          await this.run(
            'INSERT INTO time_categories (id, name, min_hours, max_hours, pay_multiplier, color) VALUES (?, ?, ?, ?, ?, ?)',
            [category.id, category.name, category.min_hours, category.max_hours, category.pay_multiplier, category.color]
          );
        }
      } catch (error) {
        console.error(`Error inserting time category ${category.id}:`, error);
        throw error;
      }
    }
  }

  private async insertDefaultSystemSettings(): Promise<void> {
    const settings = [
      {
        key: 'system_name',
        value: 'Farm Attendance System',
        description: 'Display name for the system'
      },
      {
        key: 'sync_enabled',
        value: 'true',
        description: 'Enable automatic synchronization'
      },
      {
        key: 'sync_interval_minutes',
        value: '15',
        description: 'Automatic sync interval in minutes'
      }
    ];

    for (const setting of settings) {
      try {
        const existing = await this.get('SELECT key FROM system_settings WHERE key = ?', [setting.key]);
        if (!existing) {
          await this.run(
            'INSERT INTO system_settings (key, value, description) VALUES (?, ?, ?)',
            [setting.key, setting.value, setting.description]
          );
        }
      } catch (error) {
        console.error(`Error inserting system setting ${setting.key}:`, error);
        throw error;
      }
    }
  }

  private async updateSyncQueueTable(): Promise<void> {
    // Check if columns already exist
    const tableInfo = await this.all("PRAGMA table_info(sync_queue)") as Array<{name: string}>;
    const columnNames = tableInfo.map(col => col.name);
    
    if (!columnNames.includes('updated_at')) {
      await this.run('ALTER TABLE sync_queue ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    }
    
    if (!columnNames.includes('conflict_data')) {
      await this.run('ALTER TABLE sync_queue ADD COLUMN conflict_data TEXT');
    }
  }

  private async createConflictResolutionTables(): Promise<void> {
    // Conflict resolutions table
    await this.run(`
      CREATE TABLE IF NOT EXISTS conflict_resolutions (
        id TEXT PRIMARY KEY,
        sync_queue_entry_id TEXT NOT NULL,
        conflict_type TEXT NOT NULL CHECK (conflict_type IN ('timestamp', 'data', 'deletion')),
        local_data TEXT NOT NULL,
        remote_data TEXT NOT NULL,
        conflict_fields TEXT NOT NULL,
        resolution TEXT NOT NULL CHECK (resolution IN ('use_local', 'use_remote', 'merge', 'manual')),
        resolved_data TEXT,
        resolved_by TEXT,
        resolved_at DATETIME,
        status TEXT NOT NULL CHECK (status IN ('pending', 'resolved', 'failed')) DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sync_queue_entry_id) REFERENCES sync_queue (id)
      )
    `);

    // Auto resolution rules table
    await this.run(`
      CREATE TABLE IF NOT EXISTS auto_resolution_rules (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        conflict_type TEXT NOT NULL CHECK (conflict_type IN ('timestamp', 'data', 'deletion')),
        field_pattern TEXT,
        resolution TEXT NOT NULL CHECK (resolution IN ('use_local', 'use_remote', 'merge')),
        priority INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Conflict resolution log table
    await this.run(`
      CREATE TABLE IF NOT EXISTS conflict_resolution_log (
        id TEXT PRIMARY KEY,
        conflict_id TEXT NOT NULL,
        resolution_type TEXT NOT NULL,
        resolved_by TEXT NOT NULL,
        resolved_at DATETIME NOT NULL,
        details TEXT,
        FOREIGN KEY (conflict_id) REFERENCES conflict_resolutions (id)
      )
    `);

    // Create indexes for better performance
    await this.run('CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_status ON conflict_resolutions (status)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_created_at ON conflict_resolutions (created_at)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_auto_resolution_rules_priority ON auto_resolution_rules (priority DESC)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_conflict_resolution_log_resolved_at ON conflict_resolution_log (resolved_at DESC)');
  }
}