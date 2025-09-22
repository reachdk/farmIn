import request from 'supertest';
import app from '../../server';
import { DatabaseManager } from '../../database/DatabaseManager';
import { Employee } from '../../models/Employee';
import { SyncService } from '../../services/SyncService';
import { ConnectivityService } from '../../services/ConnectivityService';
import { v4 as uuidv4 } from 'uuid';

// Mock network connectivity for testing
class MockConnectivityService extends ConnectivityService {
  private isOnline: boolean = true;

  setOnlineStatus(online: boolean) {
    this.isOnline = online;
  }

  async checkConnectivity(): Promise<boolean> {
    return this.isOnline;
  }

  async isConnected(): Promise<boolean> {
    return this.isOnline;
  }
}

describe('Offline Scenarios E2E Tests', () => {
  let dbManager: DatabaseManager;
  let testEmployee: Employee;
  let authToken: string;
  let mockConnectivity: MockConnectivityService;
  let syncService: SyncService;

  beforeAll(async () => {
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    
    // Initialize mock connectivity service
    mockConnectivity = new MockConnectivityService();
    syncService = new SyncService(dbManager, mockConnectivity);
    
    // Create test employee
    testEmployee = {
      id: uuidv4(),
      employeeNumber: 'EMP001',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@farm.com',
      role: 'employee',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const db = dbManager.getDatabase();
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO employees (id, employee_number, first_name, last_name, email, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [testEmployee.id, testEmployee.employeeNumber, testEmployee.firstName, testEmployee.lastName, 
         testEmployee.email, testEmployee.role, testEmployee.isActive ? 1 : 0, 
         testEmployee.createdAt.toISOString(), testEmployee.updatedAt.toISOString()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        employeeNumber: 'EMP001',
        password: 'password123'
      });
    
    authToken = loginResponse.body.token;
  });

  afterAll(async () => {
    await dbManager.close();
  });

  beforeEach(() => {
    // Reset to online state before each test
    mockConnectivity.setOnlineStatus(true);
  });

  describe('Offline Clock In/Out Operations', () => {
    it('should handle clock in while offline', async () => {
      // Simulate going offline
      mockConnectivity.setOnlineStatus(false);

      // Clock in while offline
      const clockInResponse = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      expect(clockInResponse.status).toBe(201);
      expect(clockInResponse.body.success).toBe(true);
      expect(clockInResponse.body.record).toHaveProperty('clockInTime');
      expect(clockInResponse.body.offline).toBe(true);

      // Verify record is stored locally
      const statusResponse = await request(app)
        .get(`/api/attendance/current/${testEmployee.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.isActive).toBe(true);

      // Verify sync queue has pending item
      const syncStatusResponse = await request(app)
        .get('/api/sync/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(syncStatusResponse.status).toBe(200);
      expect(syncStatusResponse.body.pendingItems).toBeGreaterThan(0);
    });

    it('should handle clock out while offline', async () => {
      // First clock in while online
      await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      // Go offline
      mockConnectivity.setOnlineStatus(false);

      // Clock out while offline
      const clockOutResponse = await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      expect(clockOutResponse.status).toBe(200);
      expect(clockOutResponse.body.success).toBe(true);
      expect(clockOutResponse.body.record.clockOutTime).toBeTruthy();
      expect(clockOutResponse.body.offline).toBe(true);

      // Verify total hours calculated locally
      expect(clockOutResponse.body.record.totalHours).toBeGreaterThan(0);
    });

    it('should queue multiple offline operations', async () => {
      // Go offline
      mockConnectivity.setOnlineStatus(false);

      // Perform multiple operations
      const operations = [];
      
      // Clock in
      operations.push(
        request(app)
          .post('/api/attendance/clock-in')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ employeeId: testEmployee.id })
      );

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clock out
      operations.push(
        request(app)
          .post('/api/attendance/clock-out')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ employeeId: testEmployee.id })
      );

      const responses = await Promise.all(operations);
      
      responses.forEach(response => {
        expect(response.status).toBeLessThan(400);
        expect(response.body.offline).toBe(true);
      });

      // Verify multiple items in sync queue
      const syncStatusResponse = await request(app)
        .get('/api/sync/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(syncStatusResponse.body.pendingItems).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Offline Data Persistence', () => {
    it('should persist offline data across application restarts', async () => {
      // Go offline and create data
      mockConnectivity.setOnlineStatus(false);

      const clockInResponse = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      const attendanceId = clockInResponse.body.record.id;

      // Simulate application restart by reinitializing database connection
      await dbManager.close();
      await dbManager.initialize(':memory:');

      // Verify data still exists
      const recordResponse = await request(app)
        .get(`/api/attendance/record/${attendanceId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(recordResponse.status).toBe(200);
      expect(recordResponse.body.record.id).toBe(attendanceId);
    });

    it('should maintain data integrity during offline operations', async () => {
      mockConnectivity.setOnlineStatus(false);

      // Create attendance record
      const clockInResponse = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      const attendanceId = clockInResponse.body.record.id;

      // Clock out
      const clockOutResponse = await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      // Verify data consistency
      const finalRecord = clockOutResponse.body.record;
      expect(finalRecord.id).toBe(attendanceId);
      expect(new Date(finalRecord.clockOutTime).getTime())
        .toBeGreaterThan(new Date(finalRecord.clockInTime).getTime());
      expect(finalRecord.totalHours).toBeGreaterThan(0);
    });
  });

  describe('Online/Offline Transitions', () => {
    it('should handle going offline during operation', async () => {
      // Start online
      mockConnectivity.setOnlineStatus(true);

      // Begin clock in
      const clockInPromise = request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      // Simulate network loss during operation
      setTimeout(() => {
        mockConnectivity.setOnlineStatus(false);
      }, 50);

      const clockInResponse = await clockInPromise;

      // Operation should still succeed locally
      expect(clockInResponse.status).toBe(201);
      expect(clockInResponse.body.success).toBe(true);
    });

    it('should automatically sync when coming back online', async () => {
      // Start offline and create data
      mockConnectivity.setOnlineStatus(false);

      await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      // Verify items in sync queue
      let syncStatusResponse = await request(app)
        .get('/api/sync/status')
        .set('Authorization', `Bearer ${authToken}`);

      const pendingItemsBefore = syncStatusResponse.body.pendingItems;
      expect(pendingItemsBefore).toBeGreaterThan(0);

      // Come back online
      mockConnectivity.setOnlineStatus(true);

      // Trigger sync
      const syncResponse = await request(app)
        .post('/api/sync/trigger')
        .set('Authorization', `Bearer ${authToken}`);

      expect(syncResponse.status).toBe(200);
      expect(syncResponse.body.success).toBe(true);

      // Verify sync queue is cleared
      syncStatusResponse = await request(app)
        .get('/api/sync/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(syncStatusResponse.body.pendingItems).toBeLessThan(pendingItemsBefore);
    });

    it('should handle intermittent connectivity', async () => {
      const operations = [];

      // Simulate intermittent connectivity with multiple operations
      for (let i = 0; i < 5; i++) {
        // Randomly go online/offline
        mockConnectivity.setOnlineStatus(Math.random() > 0.5);

        if (i % 2 === 0) {
          // Clock in
          operations.push(
            request(app)
              .post('/api/attendance/clock-in')
              .set('Authorization', `Bearer ${authToken}`)
              .send({ employeeId: testEmployee.id })
          );
        } else {
          // Clock out
          operations.push(
            request(app)
              .post('/api/attendance/clock-out')
              .set('Authorization', `Bearer ${authToken}`)
              .send({ employeeId: testEmployee.id })
          );
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const responses = await Promise.all(operations);

      // All operations should succeed regardless of connectivity
      responses.forEach(response => {
        expect(response.status).toBeLessThan(400);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Offline Conflict Resolution', () => {
    it('should detect conflicts when syncing offline changes', async () => {
      // Create initial record online
      const clockInResponse = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      const attendanceId = clockInResponse.body.record.id;

      // Go offline
      mockConnectivity.setOnlineStatus(false);

      // Make local changes
      await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      // Simulate remote changes (would normally come from another device)
      const db = dbManager.getDatabase();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE attendance_records SET notes = ?, updated_at = ? WHERE id = ?`,
          ['Remote update', new Date().toISOString(), attendanceId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Come back online and sync
      mockConnectivity.setOnlineStatus(true);

      const syncResponse = await request(app)
        .post('/api/sync/trigger')
        .set('Authorization', `Bearer ${authToken}`);

      // Should detect conflicts
      expect(syncResponse.body.conflicts).toBeGreaterThan(0);
    });

    it('should provide conflict resolution options', async () => {
      // Create a conflict scenario (simplified)
      mockConnectivity.setOnlineStatus(false);

      const clockInResponse = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      const attendanceId = clockInResponse.body.record.id;

      // Come online and check for conflicts
      mockConnectivity.setOnlineStatus(true);

      const conflictsResponse = await request(app)
        .get('/api/sync/conflicts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(conflictsResponse.status).toBe(200);
      expect(Array.isArray(conflictsResponse.body.conflicts)).toBe(true);

      // If conflicts exist, test resolution
      if (conflictsResponse.body.conflicts.length > 0) {
        const conflict = conflictsResponse.body.conflicts[0];

        const resolveResponse = await request(app)
          .post('/api/sync/resolve-conflict')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            conflictId: conflict.id,
            resolution: 'use_local',
            reason: 'Local data is more accurate'
          });

        expect(resolveResponse.status).toBe(200);
        expect(resolveResponse.body.success).toBe(true);
      }
    });
  });

  describe('Offline Performance and Storage', () => {
    it('should handle large amounts of offline data efficiently', async () => {
      mockConnectivity.setOnlineStatus(false);

      const startTime = Date.now();
      const operations = [];

      // Create many offline operations
      for (let i = 0; i < 50; i++) {
        operations.push(
          request(app)
            .post('/api/attendance/clock-in')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ employeeId: testEmployee.id })
            .then(() => 
              request(app)
                .post('/api/attendance/clock-out')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ employeeId: testEmployee.id })
            )
        );
      }

      await Promise.all(operations);
      const endTime = Date.now();

      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).toBeLessThan(30000); // 30 seconds

      // Verify all operations were queued
      const syncStatusResponse = await request(app)
        .get('/api/sync/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(syncStatusResponse.body.pendingItems).toBeGreaterThan(90); // ~100 operations
    });

    it('should manage storage efficiently during extended offline periods', async () => {
      mockConnectivity.setOnlineStatus(false);

      // Get initial storage stats
      const initialStatsResponse = await request(app)
        .get('/api/system/storage-stats')
        .set('Authorization', `Bearer ${authToken}`);

      const initialSize = initialStatsResponse.body.databaseSize;

      // Create substantial offline data
      for (let i = 0; i < 100; i++) {
        await request(app)
          .post('/api/attendance/clock-in')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ employeeId: testEmployee.id });

        await request(app)
          .post('/api/attendance/clock-out')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ employeeId: testEmployee.id });
      }

      // Get final storage stats
      const finalStatsResponse = await request(app)
        .get('/api/system/storage-stats')
        .set('Authorization', `Bearer ${authToken}`);

      const finalSize = finalStatsResponse.body.databaseSize;
      const growthRatio = finalSize / initialSize;

      // Storage growth should be reasonable (adjust threshold as needed)
      expect(growthRatio).toBeLessThan(10); // Less than 10x growth
      expect(finalStatsResponse.body.availableSpace).toBeGreaterThan(0);
    });
  });

  describe('Offline User Experience', () => {
    it('should provide clear offline status indicators', async () => {
      mockConnectivity.setOnlineStatus(false);

      const statusResponse = await request(app)
        .get('/api/system/connectivity-status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.isOnline).toBe(false);
      expect(statusResponse.body.lastOnline).toBeTruthy();
      expect(statusResponse.body.offlineDuration).toBeGreaterThanOrEqual(0);
    });

    it('should provide offline operation feedback', async () => {
      mockConnectivity.setOnlineStatus(false);

      const clockInResponse = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      expect(clockInResponse.body.offline).toBe(true);
      expect(clockInResponse.body.message).toContain('offline');
      expect(clockInResponse.body.syncStatus).toBe('pending');
    });

    it('should handle offline authentication gracefully', async () => {
      mockConnectivity.setOnlineStatus(false);

      // Existing token should still work offline
      const protectedResponse = await request(app)
        .get(`/api/attendance/current/${testEmployee.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(protectedResponse.status).toBe(200);

      // New login attempts should be handled appropriately
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001',
          password: 'password123'
        });

      // Should either succeed with cached credentials or provide appropriate offline message
      expect([200, 503]).toContain(loginResponse.status);
      
      if (loginResponse.status === 503) {
        expect(loginResponse.body.error).toContain('offline');
      }
    });
  });
});