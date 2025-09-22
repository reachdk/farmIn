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
      },
      {
        version: 5,
        name: 'Create camera and photo tables',
        up: async () => {
          await this.createCameraTables();
        }
      },
      {
        version: 6,
        name: 'Create hardware and RFID tables',
        up: async () => {
          await this.createHardwareTables();
          await this.createRFIDTables();
        }
      },
      {
        version: 7,
        name: 'Update attendance records for kiosk support',
        up: async () => {
          await this.updateAttendanceRecordsTable();
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

  private async createCameraTables(): Promise<void> {
    // Camera devices table
    await this.run(`
      CREATE TABLE IF NOT EXISTS camera_devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        device_id TEXT UNIQUE NOT NULL,
        resolution TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        capabilities TEXT NOT NULL DEFAULT '{}',
        settings TEXT NOT NULL DEFAULT '{}',
        last_used DATETIME,
        last_tested DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Photos table
    await this.run(`
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        thumbnail_filename TEXT NOT NULL,
        employee_id TEXT,
        device_id TEXT,
        attendance_record_id TEXT,
        file_size INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        format TEXT NOT NULL,
        purpose TEXT NOT NULL CHECK (purpose IN ('attendance', 'verification', 'profile', 'manual')),
        location TEXT,
        notes TEXT,
        uploaded_by TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees (id),
        FOREIGN KEY (device_id) REFERENCES camera_devices (id),
        FOREIGN KEY (attendance_record_id) REFERENCES attendance_records (id),
        FOREIGN KEY (uploaded_by) REFERENCES employees (id)
      )
    `);

    // Face detection results table
    await this.run(`
      CREATE TABLE IF NOT EXISTS face_detection_results (
        id TEXT PRIMARY KEY,
        photo_id TEXT NOT NULL,
        detected BOOLEAN NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        bounding_box TEXT,
        landmarks TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (photo_id) REFERENCES photos (id) ON DELETE CASCADE
      )
    `);

    // Face recognition results table
    await this.run(`
      CREATE TABLE IF NOT EXISTS face_recognition_results (
        id TEXT PRIMARY KEY,
        photo_id TEXT NOT NULL,
        detected BOOLEAN NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        matched_employee_id TEXT,
        match_confidence REAL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (photo_id) REFERENCES photos (id) ON DELETE CASCADE,
        FOREIGN KEY (matched_employee_id) REFERENCES employees (id)
      )
    `);

    // Face recognition models table
    await this.run(`
      CREATE TABLE IF NOT EXISTS face_recognition_models (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        model_data TEXT NOT NULL,
        training_photos INTEGER NOT NULL DEFAULT 0,
        accuracy REAL NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees (id)
      )
    `);

    // Photo processing jobs table
    await this.run(`
      CREATE TABLE IF NOT EXISTS photo_processing_jobs (
        id TEXT PRIMARY KEY,
        photo_id TEXT NOT NULL,
        job_type TEXT NOT NULL CHECK (job_type IN ('face_detection', 'face_recognition', 'quality_enhancement')),
        status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')) DEFAULT 'queued',
        progress INTEGER NOT NULL DEFAULT 0,
        result TEXT,
        error TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (photo_id) REFERENCES photos (id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    await this.run('CREATE INDEX IF NOT EXISTS idx_photos_employee_id ON photos (employee_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_photos_device_id ON photos (device_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_photos_attendance_record_id ON photos (attendance_record_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_photos_purpose ON photos (purpose)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos (created_at DESC)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_face_detection_results_photo_id ON face_detection_results (photo_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_face_recognition_results_photo_id ON face_recognition_results (photo_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_face_recognition_results_matched_employee ON face_recognition_results (matched_employee_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_face_recognition_models_employee_id ON face_recognition_models (employee_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_photo_processing_jobs_status ON photo_processing_jobs (status)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_camera_devices_device_id ON camera_devices (device_id)');
  }

  private async createHardwareTables(): Promise<void> {
    // Hardware devices table
    await this.run(`
      CREATE TABLE IF NOT EXISTS hardware_devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('kiosk', 'rfid_reader', 'camera')),
        location TEXT NOT NULL,
        ip_address TEXT,
        status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'error')) DEFAULT 'offline',
        last_seen DATETIME,
        capabilities TEXT NOT NULL DEFAULT '[]',
        configuration TEXT NOT NULL DEFAULT '{}',
        system_health TEXT DEFAULT '{}',
        errors TEXT DEFAULT '[]',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Device heartbeat log table
    await this.run(`
      CREATE TABLE IF NOT EXISTS device_heartbeats (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL,
        system_health TEXT,
        errors TEXT,
        FOREIGN KEY (device_id) REFERENCES hardware_devices (id) ON DELETE CASCADE
      )
    `);

    // Device commands table
    await this.run(`
      CREATE TABLE IF NOT EXISTS device_commands (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        command TEXT NOT NULL,
        parameters TEXT DEFAULT '{}',
        status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'completed', 'failed')) DEFAULT 'pending',
        result TEXT,
        error TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (device_id) REFERENCES hardware_devices (id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    await this.run('CREATE INDEX IF NOT EXISTS idx_hardware_devices_type ON hardware_devices (type)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_hardware_devices_status ON hardware_devices (status)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_hardware_devices_location ON hardware_devices (location)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_device_heartbeats_device_id ON device_heartbeats (device_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_device_heartbeats_timestamp ON device_heartbeats (timestamp DESC)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_device_commands_device_id ON device_commands (device_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_device_commands_status ON device_commands (status)');
  }

  private async createRFIDTables(): Promise<void> {
    // RFID cards table
    await this.run(`
      CREATE TABLE IF NOT EXISTS rfid_cards (
        card_id TEXT PRIMARY KEY,
        employee_id TEXT,
        is_active INTEGER DEFAULT 1,
        last_used TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees (id)
      )
    `);

    // RFID readers table
    await this.run(`
      CREATE TABLE IF NOT EXISTS rfid_readers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        device_path TEXT NOT NULL,
        baud_rate INTEGER DEFAULT 9600,
        status TEXT DEFAULT 'disconnected',
        last_heartbeat TEXT,
        capabilities TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // RFID scans table
    await this.run(`
      CREATE TABLE IF NOT EXISTS rfid_scans (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        reader_id TEXT NOT NULL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        signal_strength INTEGER,
        raw_data TEXT,
        processed INTEGER DEFAULT 0,
        FOREIGN KEY (card_id) REFERENCES rfid_cards (card_id),
        FOREIGN KEY (reader_id) REFERENCES rfid_readers (id)
      )
    `);

    // Create indexes for better performance
    await this.run('CREATE INDEX IF NOT EXISTS idx_rfid_cards_employee_id ON rfid_cards (employee_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_rfid_cards_is_active ON rfid_cards (is_active)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_rfid_readers_status ON rfid_readers (status)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_rfid_scans_card_id ON rfid_scans (card_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_rfid_scans_reader_id ON rfid_scans (reader_id)');
    await this.run('CREATE INDEX IF NOT EXISTS idx_rfid_scans_timestamp ON rfid_scans (timestamp DESC)');
  }

  // Add missing columns to attendance_records for kiosk functionality
  private async updateAttendanceRecordsTable(): Promise<void> {
    const tableInfo = await this.all("PRAGMA table_info(attendance_records)") as Array<{name: string}>;
    const columnNames = tableInfo.map(col => col.name);
    
    if (!columnNames.includes('location')) {
      await this.run('ALTER TABLE attendance_records ADD COLUMN location TEXT');
    }
    
    if (!columnNames.includes('device_id')) {
      await this.run('ALTER TABLE attendance_records ADD COLUMN device_id TEXT');
    }
    
    if (!columnNames.includes('photo_id')) {
      await this.run('ALTER TABLE attendance_records ADD COLUMN photo_id TEXT');
    }
    
    if (!columnNames.includes('clock_out_device_id')) {
      await this.run('ALTER TABLE attendance_records ADD COLUMN clock_out_device_id TEXT');
    }
    
    if (!columnNames.includes('clock_out_photo_id')) {
      await this.run('ALTER TABLE attendance_records ADD COLUMN clock_out_photo_id TEXT');
    }
  }
}