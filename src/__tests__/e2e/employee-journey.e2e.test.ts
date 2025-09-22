import request from 'supertest';
import app from '../../server';
import { DatabaseManager } from '../../database/DatabaseManager';
import { Employee } from '../../models/Employee';
import { AttendanceRecord } from '../../models/AttendanceRecord';
import { v4 as uuidv4 } from 'uuid';

describe('Employee Journey E2E Tests', () => {
  let dbManager: DatabaseManager;
  let testEmployee: Employee;
  let authToken: string;

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
    
    const db = dbManager.getDatabase();
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO employees (id, employee_number, first_name, last_name, email, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [testEmployee.id, testEmployee.employeeNumber, testEmployee.firstName, testEmployee.lastName, 
         testEmployee.email, testEmployee.role, testEmployee.isActive ? 1 : 0, 
         testEmployee.createdAt.toISOString(), testEmployee.updatedAt.toISOString()],
        function(err) {
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
        password: 'password123' // Default password for testing
      });
    
    authToken = loginResponse.body.token;
  });

  afterAll(async () => {
    await dbManager.close();
  });

  describe('Complete Employee Work Day Journey', () => {
    it('should complete a full work day cycle', async () => {
      // Step 1: Employee clocks in
      const clockInResponse = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      expect(clockInResponse.status).toBe(201);
      expect(clockInResponse.body.success).toBe(true);
      expect(clockInResponse.body.record).toHaveProperty('clockInTime');
      expect(clockInResponse.body.record.clockOutTime).toBeNull();

      const attendanceId = clockInResponse.body.record.id;

      // Step 2: Check current status
      const statusResponse = await request(app)
        .get(`/api/attendance/current/${testEmployee.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.isActive).toBe(true);
      expect(statusResponse.body.record.id).toBe(attendanceId);

      // Step 3: Get attendance history (should show current shift)
      const historyResponse = await request(app)
        .get(`/api/attendance/history/${testEmployee.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 10 });

      expect(historyResponse.status).toBe(200);
      expect(historyResponse.body.records).toHaveLength(1);
      expect(historyResponse.body.records[0].id).toBe(attendanceId);

      // Step 4: Simulate work time (wait a moment)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 5: Employee clocks out
      const clockOutResponse = await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      expect(clockOutResponse.status).toBe(200);
      expect(clockOutResponse.body.success).toBe(true);
      expect(clockOutResponse.body.record.clockOutTime).toBeTruthy();
      expect(clockOutResponse.body.record.totalHours).toBeGreaterThan(0);

      // Step 6: Verify final status
      const finalStatusResponse = await request(app)
        .get(`/api/attendance/current/${testEmployee.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(finalStatusResponse.status).toBe(200);
      expect(finalStatusResponse.body.isActive).toBe(false);

      // Step 7: Verify attendance history shows completed shift
      const finalHistoryResponse = await request(app)
        .get(`/api/attendance/history/${testEmployee.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 10 });

      expect(finalHistoryResponse.status).toBe(200);
      expect(finalHistoryResponse.body.records[0].clockOutTime).toBeTruthy();
      expect(finalHistoryResponse.body.records[0].totalHours).toBeGreaterThan(0);
    });

    it('should prevent duplicate clock-ins', async () => {
      // Clock in first time
      await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      // Try to clock in again
      const duplicateClockInResponse = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      expect(duplicateClockInResponse.status).toBe(400);
      expect(duplicateClockInResponse.body.error).toContain('already clocked in');

      // Clean up - clock out
      await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });
    });

    it('should handle clock-out without clock-in gracefully', async () => {
      const clockOutResponse = await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testEmployee.id
        });

      expect(clockOutResponse.status).toBe(400);
      expect(clockOutResponse.body.error).toContain('not currently clocked in');
    });
  });

  describe('Employee Authentication Journey', () => {
    it('should handle complete authentication flow', async () => {
      // Step 1: Login with valid credentials
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001',
          password: 'password123'
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.token).toBeTruthy();
      expect(loginResponse.body.employee.employeeNumber).toBe('EMP001');

      // Step 2: Access protected endpoint with token
      const protectedResponse = await request(app)
        .get(`/api/attendance/current/${testEmployee.id}`)
        .set('Authorization', `Bearer ${loginResponse.body.token}`);

      expect(protectedResponse.status).toBe(200);

      // Step 3: Try accessing without token
      const unauthorizedResponse = await request(app)
        .get(`/api/attendance/current/${testEmployee.id}`);

      expect(unauthorizedResponse.status).toBe(401);

      // Step 4: Try with invalid token
      const invalidTokenResponse = await request(app)
        .get(`/api/attendance/current/${testEmployee.id}`)
        .set('Authorization', 'Bearer invalid-token');

      expect(invalidTokenResponse.status).toBe(401);
    });

    it('should reject invalid login credentials', async () => {
      const invalidLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001',
          password: 'wrongpassword'
        });

      expect(invalidLoginResponse.status).toBe(401);
      expect(invalidLoginResponse.body.error).toContain('Invalid credentials');
    });
  });

  describe('Employee Data Access Journey', () => {
    it('should allow employees to access only their own data', async () => {
      // Create another employee
      const otherEmployee: Employee = {
        id: uuidv4(),
        employeeNumber: 'EMP002',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@farm.com',
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
          [otherEmployee.id, otherEmployee.employeeNumber, otherEmployee.firstName, otherEmployee.lastName,
           otherEmployee.email, otherEmployee.role, otherEmployee.isActive ? 1 : 0,
           otherEmployee.createdAt.toISOString(), otherEmployee.updatedAt.toISOString()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Try to access other employee's data
      const unauthorizedAccessResponse = await request(app)
        .get(`/api/attendance/history/${otherEmployee.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(unauthorizedAccessResponse.status).toBe(403);
      expect(unauthorizedAccessResponse.body.error).toContain('access denied');
    });
  });
});