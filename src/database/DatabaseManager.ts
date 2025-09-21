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
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database at:', this.dbPath);
          this.runMigrations()
            .then(() => resolve())
            .catch(reject);
        }
      });
    });
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
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  public async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  private async runMigrations(): Promise<void> {
    console.log('Creating employees table...');
    await this.createEmployeesTable();
    
    console.log('Creating time categories table...');
    await this.createTimeCategoriesTable();
    
    console.log('Creating attendance records table...');
    await this.createAttendanceRecordsTable();
    
    console.log('Creating time adjustments table...');
    await this.createTimeAdjustmentsTable();
    
    console.log('Creating sync queue table...');
    await this.createSyncQueueTable();
    
    console.log('Creating system settings table...');
    await this.createSystemSettingsTable();
    
    console.log('Creating sync log table...');
    await this.createSyncLogTable();
    
    console.log('Inserting default time categories...');
    await this.insertDefaultTimeCategories();
    
    console.log('Inserting default system settings...');
    await this.insertDefaultSystemSettings();

    console.log('Database migrations completed successfully');
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
        data TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt DATETIME,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
}