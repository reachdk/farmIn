import request from 'supertest';
import app from '../server';
import { DatabaseManager } from '../database/DatabaseManager';

// Mock the DatabaseManager to avoid actual database operations in tests
jest.mock('../database/DatabaseManager');

describe('Server Health Checks', () => {
  beforeAll(() => {
    // Mock DatabaseManager methods
    const mockDbManager = {
      getInstance: jest.fn().mockReturnThis(),
      initialize: jest.fn().mockResolvedValue(undefined),
      checkHealth: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(undefined)
    };
    
    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDbManager);
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        uptime: expect.any(Number),
        version: expect.any(String)
      });
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /health/database', () => {
    it('should return healthy database status', async () => {
      const response = await request(app)
        .get('/health/database')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        database: 'connected'
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return unhealthy status when database is down', async () => {
      // Mock database health check to return false
      const mockDbManager = DatabaseManager.getInstance();
      (mockDbManager.checkHealth as jest.Mock).mockResolvedValueOnce(false);

      const response = await request(app)
        .get('/health/database')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'unhealthy',
        database: 'disconnected'
      });
    });

    it('should handle database errors gracefully', async () => {
      // Mock database health check to throw error
      const mockDbManager = DatabaseManager.getInstance();
      (mockDbManager.checkHealth as jest.Mock).mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/health/database')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'unhealthy',
        database: 'error',
        error: 'Database connection failed'
      });
    });
  });
});