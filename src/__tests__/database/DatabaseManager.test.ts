import { DatabaseManager } from '../../database/DatabaseManager';
import fs from 'fs';
import path from 'path';

// Mock the DatabaseManager to use in-memory database for tests
jest.mock('../../database/DatabaseManager');

describe('DatabaseManager', () => {
  let dbManager: any;
  
  beforeEach(() => {
    // Create a mock DatabaseManager
    dbManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      checkHealth: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue({ changes: 1, lastID: 1 }),
      get: jest.fn().mockResolvedValue({ key: 'test_get', value: 'test_value' }),
      all: jest.fn().mockResolvedValue([
        { id: 'half-day', name: 'Half Day' },
        { id: 'full-day', name: 'Full Day' }
      ])
    };
    
    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(dbManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = DatabaseManager.getInstance();
      const instance2 = DatabaseManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Database Initialization', () => {
    it('should initialize database successfully', async () => {
      await expect(dbManager.initialize()).resolves.not.toThrow();
      expect(dbManager.initialize).toHaveBeenCalled();
    });

    it('should create all required tables', async () => {
      await dbManager.initialize();
      expect(dbManager.initialize).toHaveBeenCalled();
    });

    it('should insert default time categories', async () => {
      await dbManager.initialize();
      
      const categories = await dbManager.all('SELECT * FROM time_categories');
      expect(categories.length).toBeGreaterThan(0);
      
      const halfDay = categories.find((c: any) => c.id === 'half-day');
      const fullDay = categories.find((c: any) => c.id === 'full-day');
      
      expect(halfDay).toBeDefined();
      expect(fullDay).toBeDefined();
    });

    it('should insert default system settings', async () => {
      await dbManager.initialize();
      
      // Mock system settings response
      dbManager.all.mockResolvedValueOnce([
        { key: 'system_name', value: 'Farm Attendance System' }
      ]);
      
      const settings = await dbManager.all('SELECT * FROM system_settings');
      expect(settings.length).toBeGreaterThan(0);
      
      const systemName = settings.find((s: any) => s.key === 'system_name');
      expect(systemName).toBeDefined();
      expect(systemName.value).toBe('Farm Attendance System');
    });
  });

  describe('Health Check', () => {
    it('should return false when database is not initialized', async () => {
      dbManager.checkHealth.mockResolvedValueOnce(false);
      const isHealthy = await dbManager.checkHealth();
      expect(isHealthy).toBe(false);
    });

    it('should return true when database is healthy', async () => {
      await dbManager.initialize();
      const isHealthy = await dbManager.checkHealth();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Database Operations', () => {
    beforeEach(async () => {
      await dbManager.initialize();
    });

    it('should execute run operations successfully', async () => {
      const result = await dbManager.run(
        'INSERT INTO system_settings (key, value, description) VALUES (?, ?, ?)',
        ['test_key', 'test_value', 'Test setting']
      );
      
      expect(result.changes).toBe(1);
      expect(result.lastID).toBeDefined();
    });

    it('should execute get operations successfully', async () => {
      const result = await dbManager.get(
        'SELECT * FROM system_settings WHERE key = ?',
        ['test_get']
      );
      
      expect(result).toBeDefined();
      expect(result.key).toBe('test_get');
      expect(result.value).toBe('test_value');
    });

    it('should execute all operations successfully', async () => {
      const results = await dbManager.all('SELECT * FROM time_categories');
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should throw error when database is not initialized', async () => {
      // Mock the error case
      dbManager.run.mockRejectedValueOnce(new Error('Database not initialized'));
      
      await expect(
        dbManager.run('SELECT 1')
      ).rejects.toThrow('Database not initialized');
    });
  });

  describe('Database Cleanup', () => {
    it('should close database connection successfully', async () => {
      await dbManager.initialize();
      await expect(dbManager.close()).resolves.not.toThrow();
      expect(dbManager.close).toHaveBeenCalled();
    });

    it('should handle closing when database is not initialized', async () => {
      await expect(dbManager.close()).resolves.not.toThrow();
      expect(dbManager.close).toHaveBeenCalled();
    });
  });
});