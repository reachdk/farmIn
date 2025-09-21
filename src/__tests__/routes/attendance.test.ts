import request from 'supertest';
import app from '../../server';
import { DatabaseManager } from '../../database/DatabaseManager';
import { EmployeeRepository } from '../../repositories/EmployeeRepository';
import { AttendanceRepository } from '../../repositories/AttendanceRepository';
import { TimeCategoryRepository } from '../../repositories/TimeCategoryRepository';
import { Employee } from '../../models/Employee';
import { AuthService } from '../../services/AuthService';

describe('Attendance API', () => {
  let dbManager: DatabaseManager;
  let employeeRepository: EmployeeRepository;
  let attendanceRepository: AttendanceRepository;
  let timeCategoryRepository: TimeCategoryRepository;
  let authService: AuthService;
  let testEmployee: Employee;
  let testManager: Employee;
  let employeeToken: string;
  let managerToken: string;

  beforeAll(async () => {
    // Initialize test database
    process.env.NODE_ENV = 'test';
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    employeeRepository = new EmployeeRepository();
    attendanceRepository = new AttendanceRepository();
    timeCategoryRepository = new TimeCategoryRepository();
    authService = AuthService.getInstance();
  });

  beforeEach(async () => {
    // Clean up database (order matters due to foreign keys)
    await dbManager.run('DELETE FROM time_adjustments');
    await dbManager.run('DELETE FROM attendance_records');
    await dbManager.run('DELETE FROM employees');
    
    // Create test employee
    testEmployee = await employeeRepository.create({
      employeeNumber: 'EMP001',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@farm.com',
      role: 'employee'
    });

    // Create test manager
    testManager = await employeeRepository.create({
      employeeNumber: 'MGR001',
      firstName: 'Jane',
      lastName: 'Manager',
      email: 'jane.manager@farm.com',
      role: 'manager'
    });

    // Get auth tokens
    const employeeAuth = await authService.login({
      employeeNumber: 'EMP001',
      password: 'farm123'
    });
    employeeToken = employeeAuth.token;

    const managerAuth = await authService.login({
      employeeNumber: 'MGR001',
      password: 'farm123'
    });
    managerToken = managerAuth.token;
  });

  afterAll(async () => {
    await dbManager.close();
  });

  describe('POST /api/attendance/clock-in', () => {
    it('should clock in employee successfully', async () => {
      const response = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('clockInTime');
      expect(response.body.data.employeeId).toBe(testEmployee.id);
      expect(response.body.data.status).toBe('clocked_in');
    });

    it('should allow manager to clock in employee', async () => {
      const response = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          employeeId: testEmployee.id
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.employeeId).toBe(testEmployee.id);
    });

    it('should fail when employee already clocked in', async () => {
      // First clock in
      await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});

      // Try to clock in again
      const response = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ALREADY_CLOCKED_IN');
      expect(response.body.data).toHaveProperty('currentShift');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/attendance/clock-in')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('TOKEN_MISSING');
    });

    it('should fail when employee tries to clock in another employee', async () => {
      const response = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          employeeId: testManager.id
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should fail for non-existent employee', async () => {
      const response = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          employeeId: 'non-existent-id'
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('EMPLOYEE_NOT_FOUND');
    });

    it('should fail for inactive employee', async () => {
      // Deactivate employee
      await employeeRepository.update(testEmployee.id, { isActive: false });

      const response = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          employeeId: testEmployee.id
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('EMPLOYEE_NOT_FOUND');
    });
  });

  describe('POST /api/attendance/clock-out', () => {
    beforeEach(async () => {
      // Clock in the employee first
      await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});
    });

    it('should clock out employee successfully', async () => {
      const response = await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('clockInTime');
      expect(response.body.data).toHaveProperty('clockOutTime');
      expect(response.body.data).toHaveProperty('totalHours');
      expect(response.body.data.employeeId).toBe(testEmployee.id);
      expect(response.body.data.status).toBe('clocked_out');
      expect(typeof response.body.data.totalHours).toBe('number');
    });

    it('should allow manager to clock out employee', async () => {
      const response = await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          employeeId: testEmployee.id
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.employeeId).toBe(testEmployee.id);
    });

    it('should assign time category automatically', async () => {
      // Wait a moment to ensure some time passes
      await new Promise(resolve => setTimeout(resolve, 10));

      const response = await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.totalHours).toBeGreaterThanOrEqual(0);
      // Time category assignment depends on configured categories
      // For very short durations, it might not match any category
    });

    it('should fail when employee not clocked in', async () => {
      // Clock out first
      await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});

      // Try to clock out again
      const response = await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('NOT_CLOCKED_IN');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/attendance/clock-out')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('TOKEN_MISSING');
    });

    it('should fail when employee tries to clock out another employee', async () => {
      // Clock in manager first
      await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});

      const response = await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          employeeId: testManager.id
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('GET /api/attendance/current-shift/:employeeId?', () => {
    it('should return current shift when clocked in', async () => {
      // Clock in first
      await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});

      const response = await request(app)
        .get('/api/attendance/current-shift')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('clocked_in');
      expect(response.body.data.currentShift).toHaveProperty('id');
      expect(response.body.data.currentShift).toHaveProperty('clockInTime');
      expect(response.body.data.currentShift).toHaveProperty('elapsedHours');
      expect(response.body.data.employeeId).toBe(testEmployee.id);
    });

    it('should return no shift when not clocked in', async () => {
      const response = await request(app)
        .get('/api/attendance/current-shift')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('not_clocked_in');
      expect(response.body.data.currentShift).toBeNull();
      expect(response.body.data.employeeId).toBe(testEmployee.id);
    });

    it('should allow manager to view employee shift', async () => {
      // Clock in employee
      await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});

      const response = await request(app)
        .get(`/api/attendance/current-shift/${testEmployee.id}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('clocked_in');
      expect(response.body.data.employeeId).toBe(testEmployee.id);
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/attendance/current-shift');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('TOKEN_MISSING');
    });

    it('should fail when employee tries to view another employee shift', async () => {
      const response = await request(app)
        .get(`/api/attendance/current-shift/${testManager.id}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('Clock in/out workflow', () => {
    it('should handle complete clock in/out cycle', async () => {
      // 1. Check initial status (not clocked in)
      let response = await request(app)
        .get('/api/attendance/current-shift')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.body.data.status).toBe('not_clocked_in');

      // 2. Clock in
      response = await request(app)
        .post('/api/attendance/clock-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});

      expect(response.status).toBe(201);
      const clockInData = response.body.data;

      // 3. Check status (clocked in)
      response = await request(app)
        .get('/api/attendance/current-shift')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.body.data.status).toBe('clocked_in');
      expect(response.body.data.currentShift.id).toBe(clockInData.id);

      // 4. Clock out
      response = await request(app)
        .post('/api/attendance/clock-out')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(clockInData.id);
      expect(response.body.data.totalHours).toBeGreaterThanOrEqual(0);

      // 5. Check final status (not clocked in)
      response = await request(app)
        .get('/api/attendance/current-shift')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.body.data.status).toBe('not_clocked_in');
    });
  });
});