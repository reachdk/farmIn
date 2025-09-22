import request from 'supertest';
import app from '../../server';
import { DatabaseManager } from '../../database/DatabaseManager';
import { getRFIDService } from '../../services/RFIDService';

describe('Kiosk Interface E2E Tests', () => {
  let db: DatabaseManager;
  let rfidService: any;
  let testEmployeeId: string;
  let testDeviceId: string;
  let testCardId: string;

  beforeAll(async () => {
    db = DatabaseManager.getInstance();
    await db.initialize();
    rfidService = getRFIDService();
  });

  beforeEach(async () => {
    // Clean up test data in correct order to avoid foreign key constraints
    await db.run('DELETE FROM attendance_records WHERE employee_id LIKE "test_%"');
    await db.run('DELETE FROM rfid_scans WHERE card_id LIKE "test_%"');
    await db.run('DELETE FROM rfid_cards WHERE card_id LIKE "test_%"');
    await db.run('DELETE FROM rfid_readers WHERE id LIKE "test_%"');
    await db.run('DELETE FROM hardware_devices WHERE id LIKE "test_%"');
    await db.run('DELETE FROM employees WHERE id LIKE "test_%"');

    // Create test employee
    testEmployeeId = 'test_employee_001';
    await db.run(`
      INSERT INTO employees (id, employee_number, first_name, last_name, role, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [testEmployeeId, 'EMP001', 'John', 'Doe', 'employee', 1]);

    // Create test device
    testDeviceId = 'test_kiosk_001';
    await db.run(`
      INSERT INTO hardware_devices (id, name, type, location, status, capabilities)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [testDeviceId, 'Test Kiosk', 'kiosk', 'Test Location', 'online', '["rfid", "camera"]']);

    // Create test RFID card
    testCardId = 'test_card_001';
    await db.run(`
      INSERT INTO rfid_cards (card_id, employee_id, is_active)
      VALUES (?, ?, ?)
    `, [testCardId, testEmployeeId, 1]);
  });

  afterAll(async () => {
    // Clean up test data in correct order to avoid foreign key constraints
    await db.run('DELETE FROM attendance_records WHERE employee_id LIKE "test_%"');
    await db.run('DELETE FROM rfid_scans WHERE card_id LIKE "test_%"');
    await db.run('DELETE FROM rfid_cards WHERE card_id LIKE "test_%"');
    await db.run('DELETE FROM rfid_readers WHERE id LIKE "test_%"');
    await db.run('DELETE FROM hardware_devices WHERE id LIKE "test_%"');
    await db.run('DELETE FROM employees WHERE id LIKE "test_%"');
    
    await rfidService.shutdown();
    await db.close();
  });

  describe('Device Management', () => {
    it('should get device information', async () => {
      const response = await request(app)
        .get(`/api/kiosk/device/${testDeviceId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testDeviceId,
        name: 'Test Kiosk',
        type: 'kiosk',
        location: 'Test Location',
        status: 'online'
      });
    });

    it('should return 404 for non-existent device', async () => {
      await request(app)
        .get('/api/kiosk/device/non_existent')
        .expect(404);
    });

    it('should update device heartbeat', async () => {
      const heartbeatData = {
        status: 'online',
        systemHealth: {
          cpuUsage: 45,
          memoryUsage: 60,
          diskUsage: 30,
          temperature: 42
        },
        errors: []
      };

      await request(app)
        .post(`/api/kiosk/device/${testDeviceId}/heartbeat`)
        .send(heartbeatData)
        .expect(200);

      // Verify device was updated
      const device = await db.get(
        'SELECT * FROM hardware_devices WHERE id = ?',
        [testDeviceId]
      );

      expect(device.status).toBe('online');
      expect(JSON.parse(device.system_health)).toMatchObject(heartbeatData.systemHealth);
    });
  });

  describe('Employee Identification', () => {
    it('should get employee by RFID card', async () => {
      const response = await request(app)
        .get(`/api/kiosk/employee/by-card/${testCardId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testEmployeeId,
        employeeNumber: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        role: 'employee',
        isActive: true
      });
    });

    it('should return 404 for non-existent card', async () => {
      await request(app)
        .get('/api/kiosk/employee/by-card/non_existent_card')
        .expect(404);
    });

    it('should return 404 for inactive card', async () => {
      // Deactivate the card
      await db.run('UPDATE rfid_cards SET is_active = 0 WHERE card_id = ?', [testCardId]);

      await request(app)
        .get(`/api/kiosk/employee/by-card/${testCardId}`)
        .expect(404);
    });
  });

  describe('Attendance Capture', () => {
    it('should successfully clock in employee', async () => {
      const clockInData = {
        employeeId: testEmployeeId,
        cardId: testCardId,
        deviceId: testDeviceId,
        action: 'clock_in',
        timestamp: new Date().toISOString(),
        location: 'Test Location'
      };

      const response = await request(app)
        .post('/api/kiosk/attendance/capture')
        .send(clockInData)
        .expect(200);

      expect(response.body).toMatchObject({
        attendanceRecord: {
          employeeId: testEmployeeId,
          clockInTime: clockInData.timestamp,
          clockOutTime: null,
          location: 'Test Location',
          deviceId: testDeviceId
        },
        employee: {
          id: testEmployeeId,
          firstName: 'John',
          lastName: 'Doe',
          employeeNumber: 'EMP001'
        },
        action: 'clock_in'
      });

      // Verify attendance record was created
      const record = await db.get(
        'SELECT * FROM attendance_records WHERE employee_id = ? AND clock_out_time IS NULL',
        [testEmployeeId]
      );

      expect(record).toBeTruthy();
      expect(record.employee_id).toBe(testEmployeeId);
      expect(record.device_id).toBe(testDeviceId);
      expect(record.location).toBe('Test Location');
    });

    it('should successfully clock out employee', async () => {
      // First clock in
      const clockInTime = new Date().toISOString();
      const recordId = 'test_record_001';
      
      await db.run(`
        INSERT INTO attendance_records (id, employee_id, clock_in_time, device_id, location)
        VALUES (?, ?, ?, ?, ?)
      `, [recordId, testEmployeeId, clockInTime, testDeviceId, 'Test Location']);

      // Then clock out
      const clockOutData = {
        employeeId: testEmployeeId,
        cardId: testCardId,
        deviceId: testDeviceId,
        action: 'clock_out',
        timestamp: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours later
        location: 'Test Location'
      };

      const response = await request(app)
        .post('/api/kiosk/attendance/capture')
        .send(clockOutData)
        .expect(200);

      expect(response.body).toMatchObject({
        attendanceRecord: {
          employeeId: testEmployeeId,
          clockInTime: clockInTime,
          clockOutTime: clockOutData.timestamp
        },
        action: 'clock_out'
      });

      // Verify attendance record was updated
      const record = await db.get(
        'SELECT * FROM attendance_records WHERE id = ?',
        [recordId]
      );

      expect(record.clock_out_time).toBe(clockOutData.timestamp);
      expect(record.total_hours).toBeCloseTo(8, 1);
      expect(record.time_category).toBe('Full Day');
    });

    it('should prevent duplicate clock-ins', async () => {
      // First clock in
      const clockInData = {
        employeeId: testEmployeeId,
        cardId: testCardId,
        deviceId: testDeviceId,
        action: 'clock_in',
        timestamp: new Date().toISOString(),
        location: 'Test Location'
      };

      await request(app)
        .post('/api/kiosk/attendance/capture')
        .send(clockInData)
        .expect(200);

      // Try to clock in again
      await request(app)
        .post('/api/kiosk/attendance/capture')
        .send(clockInData)
        .expect(400);
    });

    it('should prevent clock-out without clock-in', async () => {
      const clockOutData = {
        employeeId: testEmployeeId,
        cardId: testCardId,
        deviceId: testDeviceId,
        action: 'clock_out',
        timestamp: new Date().toISOString(),
        location: 'Test Location'
      };

      await request(app)
        .post('/api/kiosk/attendance/capture')
        .send(clockOutData)
        .expect(400);
    });

    it('should return 404 for inactive employee', async () => {
      // Deactivate employee
      await db.run('UPDATE employees SET is_active = 0 WHERE id = ?', [testEmployeeId]);

      const clockInData = {
        employeeId: testEmployeeId,
        cardId: testCardId,
        deviceId: testDeviceId,
        action: 'clock_in',
        timestamp: new Date().toISOString(),
        location: 'Test Location'
      };

      await request(app)
        .post('/api/kiosk/attendance/capture')
        .send(clockInData)
        .expect(404);
    });

    it('should validate required fields', async () => {
      const incompleteData = {
        cardId: testCardId,
        deviceId: testDeviceId,
        action: 'clock_in'
        // Missing employeeId and timestamp
      };

      await request(app)
        .post('/api/kiosk/attendance/capture')
        .send(incompleteData)
        .expect(400);
    });

    it('should validate action field', async () => {
      const invalidData = {
        employeeId: testEmployeeId,
        cardId: testCardId,
        deviceId: testDeviceId,
        action: 'invalid_action',
        timestamp: new Date().toISOString(),
        location: 'Test Location'
      };

      await request(app)
        .post('/api/kiosk/attendance/capture')
        .send(invalidData)
        .expect(400);
    });
  });

  describe('Attendance Status', () => {
    it('should return clocked_out status when no active record', async () => {
      const response = await request(app)
        .get(`/api/kiosk/attendance/status/${testEmployeeId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'clocked_out',
        currentRecord: null
      });
    });

    it('should return clocked_in status with current record', async () => {
      // Create active attendance record
      const clockInTime = new Date().toISOString();
      const recordId = 'test_record_002';
      
      await db.run(`
        INSERT INTO attendance_records (id, employee_id, clock_in_time, device_id, location)
        VALUES (?, ?, ?, ?, ?)
      `, [recordId, testEmployeeId, clockInTime, testDeviceId, 'Test Location']);

      const response = await request(app)
        .get(`/api/kiosk/attendance/status/${testEmployeeId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'clocked_in',
        currentRecord: {
          id: recordId,
          clockInTime: clockInTime,
          location: 'Test Location',
          deviceId: testDeviceId
        }
      });

      expect(response.body.currentRecord.elapsedHours).toBeGreaterThan(0);
    });
  });

  describe('Offline Sync Data', () => {
    it('should provide offline sync data', async () => {
      const response = await request(app)
        .get('/api/kiosk/offline/sync-data')
        .expect(200);

      expect(response.body).toHaveProperty('employees');
      expect(response.body).toHaveProperty('timeCategories');
      expect(response.body).toHaveProperty('recentAttendance');
      expect(response.body).toHaveProperty('syncTimestamp');

      // Check that our test employee is included
      const testEmployee = response.body.employees.find((emp: any) => emp.id === testEmployeeId);
      expect(testEmployee).toMatchObject({
        id: testEmployeeId,
        employeeNumber: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        cardId: testCardId
      });
    });
  });

  describe('RFID Integration', () => {
    it('should record RFID scan when capturing attendance', async () => {
      const clockInData = {
        employeeId: testEmployeeId,
        cardId: testCardId,
        deviceId: testDeviceId,
        action: 'clock_in',
        timestamp: new Date().toISOString(),
        location: 'Test Location'
      };

      await request(app)
        .post('/api/kiosk/attendance/capture')
        .send(clockInData)
        .expect(200);

      // Verify RFID scan was recorded
      const scan = await db.get(
        'SELECT * FROM rfid_scans WHERE card_id = ? ORDER BY timestamp DESC LIMIT 1',
        [testCardId]
      );

      expect(scan).toBeTruthy();
      expect(scan.card_id).toBe(testCardId);
      expect(scan.reader_id).toBe(testDeviceId);
    });

    it('should update card last_used timestamp', async () => {
      const clockInData = {
        employeeId: testEmployeeId,
        cardId: testCardId,
        deviceId: testDeviceId,
        action: 'clock_in',
        timestamp: new Date().toISOString(),
        location: 'Test Location'
      };

      await request(app)
        .post('/api/kiosk/attendance/capture')
        .send(clockInData)
        .expect(200);

      // Verify card last_used was updated
      const card = await db.get(
        'SELECT * FROM rfid_cards WHERE card_id = ?',
        [testCardId]
      );

      expect(card.last_used).toBeTruthy();
    });
  });

  describe('Time Category Assignment', () => {
    it('should assign correct time category based on hours worked', async () => {
      // Clock in
      const clockInTime = new Date().toISOString();
      const recordId = 'test_record_003';
      
      await db.run(`
        INSERT INTO attendance_records (id, employee_id, clock_in_time, device_id, location)
        VALUES (?, ?, ?, ?, ?)
      `, [recordId, testEmployeeId, clockInTime, testDeviceId, 'Test Location']);

      // Clock out after 4.5 hours (should be Half Day)
      const clockOutTime = new Date(Date.now() + 4.5 * 60 * 60 * 1000).toISOString();
      const clockOutData = {
        employeeId: testEmployeeId,
        cardId: testCardId,
        deviceId: testDeviceId,
        action: 'clock_out',
        timestamp: clockOutTime,
        location: 'Test Location'
      };

      await request(app)
        .post('/api/kiosk/attendance/capture')
        .send(clockOutData)
        .expect(200);

      // Verify time category assignment
      const record = await db.get(
        'SELECT * FROM attendance_records WHERE id = ?',
        [recordId]
      );

      expect(record.time_category).toBe('Half Day');
      expect(record.total_hours).toBeCloseTo(4.5, 1);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close database to simulate error
      await db.close();

      const clockInData = {
        employeeId: testEmployeeId,
        cardId: testCardId,
        deviceId: testDeviceId,
        action: 'clock_in',
        timestamp: new Date().toISOString(),
        location: 'Test Location'
      };

      await request(app)
        .post('/api/kiosk/attendance/capture')
        .send(clockInData)
        .expect(500);

      // Reinitialize database for cleanup
      await db.initialize();
    });

    it('should handle invalid JSON gracefully', async () => {
      await request(app)
        .post('/api/kiosk/attendance/capture')
        .send('invalid json')
        .expect(400);
    });
  });
});