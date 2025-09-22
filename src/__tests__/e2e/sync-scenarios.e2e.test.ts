import request from 'supertest';
import app from '../../server';
import { DatabaseManager } from '../../database/DatabaseManager';
import { Employee } from '../../models/Employee';
import { AttendanceRecord } from '../../models/AttendanceRecord';
import { SyncQueue } from '../../models/SyncQueue';
import { v4 as uuidv4 } from 'uuid';

describe('Sync Scenarios E2E Tests', () => {
  let dbManager: DatabaseManager;
  let testEmployee: Employee;
  let managerEmployee: Employee;
  let employeeAuthToken: string;
  let managerAuthToken: string;

  beforeAll(async () => {
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    
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

    // Create manager employee
    managerEmployee = {
      id: uuidv4(),
      employeeNumber: 'MGR001',
      firstName: 'Jane',
      lastName: 'Manager',
      email: 'jane.manager@farm.com',
      role: 'manager',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const db = dbManager.getDatabase();
    
    // Insert employees
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO employees (id, employee_number, first_name, last_name, email, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          testEmployee.id, testEmployee.employeeNumber, testEmployee.firstName, testEmployee.lastName, 
          testEmployee.email, testEmployee.role, testEmployee.isActive ? 1 : 0, 
          testEmployee.createdAt.toISOString(), testEmployee.updatedAt.toISOString(),
          managerEmployee.id, managerEmployee.employeeNumber, managerEmployee.firstName, managerEmployee.lastName, 
          managerEmployee.email, managerEmployee.role, managerEmployee.isActive ? 1 : 0, 
          managerEmployee.createdAt.toISOString(), managerEmployee.updatedAt.toISOString()
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Get auth tokens
    const employeeLoginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        employeeNumber: 'EMP001',
        password: 'password123'
      });
    
    const managerLoginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        employeeNumber: 'MGR001',
        password: 'password123'
      });
    
    employeeAuthToken = employeeLoginResponse.body.token;
    managerAuthToken = managerLoginResponse.body.token;
  });

  afterAll(async () => {
    await dbManager.close();
  });

  describe('Basic Sync Operations', () => {
    it('should queue operations for sync when offline', async () => {
      // Simulate offline mode by creating records directly in sync queue
      const clockInResponse = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${employeeAuthToken}`)
        .send({
          employeeId: testEmployee.id,
          offline: true // Force offline mode
        });

      expect(clockInResponse.status).toBe(201);
      expect(clockInResponse.body.success).toBe(true);

      // Verify item was added to sync queue
      const syncStatusResponse = await request(app)
        .get('/api/sync/status')
        .set('Authorization', `Bearer ${employeeAuthToken}`);

      expect(syncStatusResponse.status).toBe(200);
      expect(syncStatusResponse.body.pendingItems).toBeGreaterThan(0);
      expect(Array.isArray(syncStatusResponse.body.queueItems)).toBe(true);
    });

    it('should process sync queue when connectivity is restored', async () => {
      // Add multiple items to sync queue
      const operations = [
        { operation: 'create', entityType: 'attendance_record', data: { employeeId: testEmployee.id, type: 'clock_in' } },
        { operation: 'update', entityType: 'attendance_record', data: { employeeId: testEmployee.id, type: 'clock_out' } },
        { operation: 'create', entityType: 'attendance_record', data: { employeeId: testEmployee.id, type: 'clock_in' } }
      ];

      for (const op of operations) {
        const syncItem: SyncQueue = {
          id: uuidv4(),
          operation: op.operation as any,
          entityType: op.entityType,
          entityId: `test-${Date.now()}-${Math.random()}`,
          data: op.data,
          attempts: 0,
          status: 'pending',
          createdAt: new Date()
        };

        const db = dbManager.getDatabase();
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO sync_queue (id, operation, entity_type, entity_id, data, attempts, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [syncItem.id, syncItem.operation, syncItem.entityType, syncItem.entityId, 
             JSON.stringify(syncItem.data), syncItem.attempts, syncItem.status, syncItem.createdAt.toISOString()],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      // Trigger sync
      const syncResponse = await request(app)
        .post('/api/sync/trigger')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(syncResponse.status).toBe(200);
      expect(syncResponse.body.success).toBe(true);
      expect(syncResponse.body.processed).toBeGreaterThan(0);

      // Verify queue was processed
      const finalStatusResponse = await request(app)
        .get('/api/sync/status')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(finalStatusResponse.body.pendingItems).toBeLessThan(operations.length);
    });

    it('should handle sync failures with retry logic', async () => {
      // Create a sync item that will fail
      const failingSyncItem: SyncQueue = {
        id: uuidv4(),
        operation: 'create',
        entityType: 'invalid_entity',
        entityId: 'failing-item',
        data: { invalid: 'data' },
        attempts: 0,
        status: 'pending',
        createdAt: new Date()
      };

      const db = dbManager.getDatabase();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO sync_queue (id, operation, entity_type, entity_id, data, attempts, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [failingSyncItem.id, failingSyncItem.operation, failingSyncItem.entityType, failingSyncItem.entityId, 
           JSON.stringify(failingSyncItem.data), failingSyncItem.attempts, failingSyncItem.status, failingSyncItem.createdAt.toISOString()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Trigger sync (should fail and retry)
      const syncResponse = await request(app)
        .post('/api/sync/trigger')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(syncResponse.status).toBe(200);
      expect(syncResponse.body.failed).toBeGreaterThan(0);

      // Check that failed item has increased attempt count
      const failedItemsResponse = await request(app)
        .get('/api/sync/failed-items')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(failedItemsResponse.status).toBe(200);
      expect(Array.isArray(failedItemsResponse.body.items)).toBe(true);
      
      const failedItem = failedItemsResponse.body.items.find((item: any) => item.id === failingSyncItem.id);
      if (failedItem) {
        expect(failedItem.attempts).toBeGreaterThan(0);
        expect(failedItem.status).toBe('failed');
      }
    });
  });

  describe('Conflict Detection and Resolution', () => {
    let testAttendanceId: string;

    beforeEach(async () => {
      // Create a base attendance record
      const clockInTime = new Date(Date.now() - 8 * 60 * 60 * 1000); // 8 hours ago
      const attendanceRecord: AttendanceRecord = {
        id: uuidv4(),
        employeeId: testEmployee.id,
        clockInTime: clockInTime,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const db = dbManager.getDatabase();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO attendance_records (id, employee_id, clock_in_time, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [attendanceRecord.id, attendanceRecord.employeeId, attendanceRecord.clockInTime.toISOString(),
           attendanceRecord.createdAt.toISOString(), attendanceRecord.updatedAt.toISOString()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      testAttendanceId = attendanceRecord.id;
    });

    it('should detect conflicts when same record is modified locally and remotely', async () => {
      // Simulate local modification (offline)
      const localClockOutTime = new Date();
      const localUpdateResponse = await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${employeeAuthToken}`)
        .send({
          employeeId: testEmployee.id,
          offline: true
        });

      expect(localUpdateResponse.status).toBe(200);

      // Simulate remote modification (from another device/user)
      const remoteClockOutTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      const db = dbManager.getDatabase();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE attendance_records SET clock_out_time = ?, total_hours = ?, updated_at = ?, last_sync_at = ?
           WHERE id = ?`,
          [remoteClockOutTime.toISOString(), 7.5, new Date().toISOString(), new Date().toISOString(), testAttendanceId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Trigger sync - should detect conflict
      const syncResponse = await request(app)
        .post('/api/sync/trigger')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(syncResponse.status).toBe(200);
      expect(syncResponse.body.conflicts).toBeGreaterThan(0);

      // Get conflict details
      const conflictsResponse = await request(app)
        .get('/api/sync/conflicts')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(conflictsResponse.status).toBe(200);
      expect(Array.isArray(conflictsResponse.body.conflicts)).toBe(true);
      expect(conflictsResponse.body.conflicts.length).toBeGreaterThan(0);

      const conflict = conflictsResponse.body.conflicts[0];
      expect(conflict).toHaveProperty('entityId');
      expect(conflict).toHaveProperty('localData');
      expect(conflict).toHaveProperty('remoteData');
      expect(conflict).toHaveProperty('conflictType');
    });

    it('should allow manual conflict resolution', async () => {
      // Create a conflict scenario
      await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${employeeAuthToken}`)
        .send({
          employeeId: testEmployee.id,
          offline: true
        });

      // Simulate remote change
      const db = dbManager.getDatabase();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE attendance_records SET notes = ?, updated_at = ? WHERE id = ?`,
          ['Remote update', new Date().toISOString(), testAttendanceId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Trigger sync to detect conflict
      await request(app)
        .post('/api/sync/trigger')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      // Get conflicts
      const conflictsResponse = await request(app)
        .get('/api/sync/conflicts')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      if (conflictsResponse.body.conflicts.length > 0) {
        const conflict = conflictsResponse.body.conflicts[0];

        // Resolve conflict - choose local version
        const resolveResponse = await request(app)
          .post('/api/sync/resolve-conflict')
          .set('Authorization', `Bearer ${managerAuthToken}`)
          .send({
            conflictId: conflict.id,
            resolution: 'use_local',
            reason: 'Local data is more recent and accurate'
          });

        expect(resolveResponse.status).toBe(200);
        expect(resolveResponse.body.success).toBe(true);

        // Verify conflict is resolved
        const finalConflictsResponse = await request(app)
          .get('/api/sync/conflicts')
          .set('Authorization', `Bearer ${managerAuthToken}`);

        const remainingConflicts = finalConflictsResponse.body.conflicts.filter(
          (c: any) => c.id === conflict.id
        );
        expect(remainingConflicts.length).toBe(0);
      }
    });

    it('should support automatic conflict resolution rules', async () => {
      // Set up automatic resolution rules
      const rulesResponse = await request(app)
        .put('/api/sync/auto-resolution-rules')
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .send({
          rules: [
            {
              entityType: 'attendance_record',
              conflictType: 'timestamp_conflict',
              resolution: 'use_latest',
              priority: 1
            },
            {
              entityType: 'attendance_record',
              conflictType: 'data_conflict',
              resolution: 'use_local',
              priority: 2
            }
          ]
        });

      expect(rulesResponse.status).toBe(200);

      // Create conflict scenario
      await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${employeeAuthToken}`)
        .send({
          employeeId: testEmployee.id,
          offline: true
        });

      // Simulate older remote change
      const db = dbManager.getDatabase();
      const olderTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE attendance_records SET notes = ?, updated_at = ? WHERE id = ?`,
          ['Older remote update', olderTime.toISOString(), testAttendanceId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Trigger sync with auto-resolution
      const syncResponse = await request(app)
        .post('/api/sync/trigger')
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .send({
          autoResolve: true
        });

      expect(syncResponse.status).toBe(200);
      expect(syncResponse.body.autoResolved).toBeGreaterThanOrEqual(0);

      // Verify no unresolved conflicts remain
      const conflictsResponse = await request(app)
        .get('/api/sync/conflicts')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(conflictsResponse.body.conflicts.length).toBe(0);
    });
  });

  describe('Complex Sync Scenarios', () => {
    it('should handle cascading updates during sync', async () => {
      // Create employee with attendance records
      const newEmployee = new Employee({
        employeeNumber: 'CASCADE001',
        firstName: 'Cascade',
        lastName: 'Test',
        email: 'cascade@farm.com',
        role: 'employee',
        isActive: true
      });

      const db = dbManager.getDatabase();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO employees (id, employee_number, first_name, last_name, email, role, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newEmployee.id, newEmployee.employeeNumber, newEmployee.firstName, newEmployee.lastName, 
           newEmployee.email, newEmployee.role, newEmployee.isActive ? 1 : 0, 
           newEmployee.createdAt.toISOString(), newEmployee.updatedAt.toISOString()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Create attendance records
      const attendanceRecords = [];
      for (let i = 0; i < 5; i++) {
        const clockInTime = new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000);
        const clockOutTime = new Date(clockInTime.getTime() + 8 * 60 * 60 * 1000);
        
        const record = new AttendanceRecord({
          employeeId: newEmployee.id,
          clockInTime: clockInTime,
          clockOutTime: clockOutTime,
          totalHours: 8
        });

        attendanceRecords.push(record);
      }

      // Insert attendance records
      for (const record of attendanceRecords) {
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO attendance_records (id, employee_id, clock_in_time, clock_out_time, total_hours, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [record.id, record.employeeId, record.clockInTime.toISOString(),
             record.clockOutTime!.toISOString(), record.totalHours,
             record.createdAt.toISOString(), record.updatedAt.toISOString()],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      // Update employee (should cascade to attendance records)
      const updateResponse = await request(app)
        .put(`/api/admin/employees/${newEmployee.id}`)
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .send({
          firstName: 'Updated',
          lastName: 'Name',
          offline: true
        });

      expect(updateResponse.status).toBe(200);

      // Trigger sync
      const syncResponse = await request(app)
        .post('/api/sync/trigger')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(syncResponse.status).toBe(200);
      expect(syncResponse.body.processed).toBeGreaterThan(0);

      // Verify cascading updates were handled
      const employeeResponse = await request(app)
        .get(`/api/admin/employees/${newEmployee.id}`)
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(employeeResponse.body.employee.firstName).toBe('Updated');
    });

    it('should handle partial sync failures gracefully', async () => {
      // Create mixed valid and invalid sync items
      const syncItems = [
        {
          operation: 'create',
          entityType: 'attendance_record',
          entityId: 'valid-1',
          data: { employeeId: testEmployee.id, clockInTime: new Date().toISOString() }
        },
        {
          operation: 'create',
          entityType: 'invalid_entity',
          entityId: 'invalid-1',
          data: { invalid: 'data' }
        },
        {
          operation: 'update',
          entityType: 'attendance_record',
          entityId: 'valid-2',
          data: { employeeId: testEmployee.id, clockOutTime: new Date().toISOString() }
        }
      ];

      const db = dbManager.getDatabase();
      for (const item of syncItems) {
        const syncItem: SyncQueue = {
          id: uuidv4(),
          operation: item.operation as any,
          entityType: item.entityType,
          entityId: item.entityId,
          data: item.data,
          attempts: 0,
          status: 'pending',
          createdAt: new Date()
        };

        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO sync_queue (id, operation, entity_type, entity_id, data, attempts, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [syncItem.id, syncItem.operation, syncItem.entityType, syncItem.entityId, 
             JSON.stringify(syncItem.data), syncItem.attempts, syncItem.status, syncItem.createdAt.toISOString()],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      // Trigger sync
      const syncResponse = await request(app)
        .post('/api/sync/trigger')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(syncResponse.status).toBe(200);
      expect(syncResponse.body.processed).toBeGreaterThan(0);
      expect(syncResponse.body.failed).toBeGreaterThan(0);
      expect(syncResponse.body.succeeded).toBeGreaterThan(0);

      // Verify partial success
      const statusResponse = await request(app)
        .get('/api/sync/status')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(statusResponse.body.pendingItems).toBeGreaterThan(0); // Failed items still pending
      expect(statusResponse.body.lastSyncStatus).toBe('partial_success');
    });

    it('should maintain sync integrity across multiple devices', async () => {
      // Simulate multiple devices by creating sync items with different sources
      const device1Items = [
        { deviceId: 'device-1', operation: 'create', data: { type: 'clock_in', timestamp: new Date().toISOString() } },
        { deviceId: 'device-1', operation: 'update', data: { type: 'clock_out', timestamp: new Date().toISOString() } }
      ];

      const device2Items = [
        { deviceId: 'device-2', operation: 'create', data: { type: 'clock_in', timestamp: new Date().toISOString() } },
        { deviceId: 'device-2', operation: 'update', data: { type: 'clock_out', timestamp: new Date().toISOString() } }
      ];

      const db = dbManager.getDatabase();
      
      // Add items from device 1
      for (const item of device1Items) {
        const syncItem: SyncQueue = {
          id: uuidv4(),
          operation: item.operation as any,
          entityType: 'attendance_record',
          entityId: `${item.deviceId}-${Date.now()}-${Math.random()}`,
          data: { ...item.data, deviceId: item.deviceId, employeeId: testEmployee.id },
          attempts: 0,
          status: 'pending',
          createdAt: new Date()
        };

        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO sync_queue (id, operation, entity_type, entity_id, data, attempts, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [syncItem.id, syncItem.operation, syncItem.entityType, syncItem.entityId, 
             JSON.stringify(syncItem.data), syncItem.attempts, syncItem.status, syncItem.createdAt.toISOString()],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      // Add items from device 2
      for (const item of device2Items) {
        const syncItem: SyncQueue = {
          id: uuidv4(),
          operation: item.operation as any,
          entityType: 'attendance_record',
          entityId: `${item.deviceId}-${Date.now()}-${Math.random()}`,
          data: { ...item.data, deviceId: item.deviceId, employeeId: testEmployee.id },
          attempts: 0,
          status: 'pending',
          createdAt: new Date()
        };

        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO sync_queue (id, operation, entity_type, entity_id, data, attempts, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [syncItem.id, syncItem.operation, syncItem.entityType, syncItem.entityId, 
             JSON.stringify(syncItem.data), syncItem.attempts, syncItem.status, syncItem.createdAt.toISOString()],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      // Trigger sync
      const syncResponse = await request(app)
        .post('/api/sync/trigger')
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .send({
          maintainDeviceOrder: true
        });

      expect(syncResponse.status).toBe(200);
      expect(syncResponse.body.processed).toBe(device1Items.length + device2Items.length);

      // Verify sync maintained device integrity
      const syncLogResponse = await request(app)
        .get('/api/sync/logs')
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .query({ limit: 10 });

      expect(syncLogResponse.status).toBe(200);
      expect(Array.isArray(syncLogResponse.body.logs)).toBe(true);
      
      // Check that device operations were processed in order
      const logs = syncLogResponse.body.logs;
      const device1Logs = logs.filter((log: any) => log.details?.deviceId === 'device-1');
      const device2Logs = logs.filter((log: any) => log.details?.deviceId === 'device-2');
      
      expect(device1Logs.length).toBeGreaterThan(0);
      expect(device2Logs.length).toBeGreaterThan(0);
    });
  });

  describe('Sync Performance and Reliability', () => {
    it('should handle large sync queues efficiently', async () => {
      const itemCount = 500;
      const db = dbManager.getDatabase();

      // Create large number of sync items
      const items = [];
      for (let i = 0; i < itemCount; i++) {
        const syncItem: SyncQueue = {
          id: uuidv4(),
          operation: 'create',
          entityType: 'attendance_record',
          entityId: `bulk-${i}`,
          data: { 
            employeeId: testEmployee.id, 
            clockInTime: new Date(Date.now() - i * 60000).toISOString(),
            bulkIndex: i
          },
          attempts: 0,
          status: 'pending',
          createdAt: new Date()
        };

        items.push(syncItem);
      }

      // Batch insert sync items
      const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values = items.flatMap(item => [
        item.id, item.operation, item.entityType, item.entityId,
        JSON.stringify(item.data), item.attempts, item.status, item.createdAt.toISOString()
      ]);

      const insertStart = Date.now();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO sync_queue (id, operation, entity_type, entity_id, data, attempts, status, created_at)
           VALUES ${placeholders}`,
          values,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      const insertEnd = Date.now();

      // Trigger sync
      const syncStart = Date.now();
      const syncResponse = await request(app)
        .post('/api/sync/trigger')
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .send({
          batchSize: 50 // Process in batches
        });
      const syncEnd = Date.now();

      expect(syncResponse.status).toBe(200);
      expect(syncResponse.body.processed).toBe(itemCount);

      // Performance assertions
      expect(insertEnd - insertStart).toBeLessThan(5000); // 5 seconds to insert
      expect(syncEnd - syncStart).toBeLessThan(30000); // 30 seconds to sync

      console.log(`Inserted ${itemCount} items in ${insertEnd - insertStart}ms`);
      console.log(`Synced ${itemCount} items in ${syncEnd - syncStart}ms`);
    });

    it('should recover from sync interruptions', async () => {
      // Create sync items
      const items = [];
      for (let i = 0; i < 10; i++) {
        const syncItem: SyncQueue = {
          id: uuidv4(),
          operation: 'create',
          entityType: 'attendance_record',
          entityId: `interrupt-${i}`,
          data: { employeeId: testEmployee.id, index: i },
          attempts: 0,
          status: 'pending',
          createdAt: new Date()
        };

        items.push(syncItem);
      }

      const db = dbManager.getDatabase();
      for (const item of items) {
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO sync_queue (id, operation, entity_type, entity_id, data, attempts, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [item.id, item.operation, item.entityType, item.entityId, 
             JSON.stringify(item.data), item.attempts, item.status, item.createdAt.toISOString()],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      // Start sync but simulate interruption by marking some items as processing
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE sync_queue SET status = 'processing' WHERE entity_id LIKE 'interrupt-%' LIMIT 3`,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Trigger sync recovery
      const recoveryResponse = await request(app)
        .post('/api/sync/recover')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(recoveryResponse.status).toBe(200);
      expect(recoveryResponse.body.recovered).toBeGreaterThan(0);

      // Verify items were reset to pending
      const statusResponse = await request(app)
        .get('/api/sync/status')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(statusResponse.body.pendingItems).toBe(items.length);
      expect(statusResponse.body.processingItems).toBe(0);
    });
  });
});