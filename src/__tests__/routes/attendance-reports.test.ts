import request from 'supertest';
import app from '../../server';
import { DatabaseManager } from '../../database/DatabaseManager';
import { EmployeeRepository } from '../../repositories/EmployeeRepository';
import { AttendanceRepository } from '../../repositories/AttendanceRepository';
import { Employee } from '../../models/Employee';
import { AuthService } from '../../services/AuthService';

describe('Attendance Reports API', () => {
  let dbManager: DatabaseManager;
  let employeeRepository: EmployeeRepository;
  let attendanceRepository: AttendanceRepository;
  let authService: AuthService;
  let testEmployee: Employee;
  let testEmployee2: Employee;
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
    authService = AuthService.getInstance();
  });

  beforeEach(async () => {
    // Clean up database (order matters due to foreign keys)
    await dbManager.run('DELETE FROM time_adjustments');
    await dbManager.run('DELETE FROM attendance_records');
    await dbManager.run('DELETE FROM employees');
    
    // Create test employees
    testEmployee = await employeeRepository.create({
      employeeNumber: 'EMP001',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@farm.com',
      role: 'employee'
    });

    testEmployee2 = await employeeRepository.create({
      employeeNumber: 'EMP002',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@farm.com',
      role: 'employee'
    });

    testManager = await employeeRepository.create({
      employeeNumber: 'MGR001',
      firstName: 'Manager',
      lastName: 'Boss',
      email: 'manager@farm.com',
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

    // Create some test attendance records
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(9, 0, 0, 0);

    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(17, 0, 0, 0);

    // Employee 1 - completed shift yesterday
    const record1 = await attendanceRepository.clockIn({
      employeeId: testEmployee.id,
      clockInTime: yesterday
    });
    await attendanceRepository.clockOut(testEmployee.id, {
      clockOutTime: yesterdayEnd
    });

    // Employee 2 - incomplete shift (still clocked in)
    await attendanceRepository.clockIn({
      employeeId: testEmployee2.id,
      clockInTime: new Date()
    });
  });

  afterAll(async () => {
    await dbManager.close();
  });

  describe('GET /api/attendance/history/:employeeId?', () => {
    it('should return employee attendance history', async () => {
      const response = await request(app)
        .get('/api/attendance/history')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('records');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.records)).toBe(true);
      expect(response.body.data.pagination).toMatchObject({
        page: 1,
        limit: 50,
        total: expect.any(Number),
        totalPages: expect.any(Number)
      });
    });

    it('should allow manager to view employee history', async () => {
      const response = await request(app)
        .get(`/api/attendance/history/${testEmployee.id}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toBeDefined();
    });

    it('should support date filtering', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const response = await request(app)
        .get('/api/attendance/history')
        .query({
          startDate: today,
          endDate: today
        })
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/attendance/history')
        .query({
          page: '1',
          limit: '10'
        })
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(10);
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/attendance/history');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('TOKEN_MISSING');
    });

    it('should fail when employee tries to view another employee history', async () => {
      const response = await request(app)
        .get(`/api/attendance/history/${testEmployee2.id}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('GET /api/attendance/summary/:employeeId?', () => {
    it('should return employee attendance summary', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();

      const response = await request(app)
        .get('/api/attendance/summary')
        .query({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        })
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('employeeId');
      expect(response.body.data).toHaveProperty('dateRange');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data.summary).toMatchObject({
        totalRecords: expect.any(Number),
        totalHours: expect.any(Number),
        averageHoursPerDay: expect.any(Number),
        categorySummary: expect.any(Object)
      });
    });

    it('should fail without date range', async () => {
      const response = await request(app)
        .get('/api/attendance/summary')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_DATE_RANGE');
    });

    it('should fail with invalid date range', async () => {
      const response = await request(app)
        .get('/api/attendance/summary')
        .query({
          startDate: '2023-12-31',
          endDate: '2023-01-01'
        })
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_DATE_RANGE');
    });
  });

  describe('GET /api/attendance/dashboard', () => {
    it('should return dashboard data for managers', async () => {
      const response = await request(app)
        .get('/api/attendance/dashboard')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('employees');
      expect(response.body.data.summary).toMatchObject({
        totalEmployees: expect.any(Number),
        clockedIn: expect.any(Number),
        clockedOut: expect.any(Number)
      });
      expect(Array.isArray(response.body.data.employees)).toBe(true);
    });

    it('should fail for regular employees', async () => {
      const response = await request(app)
        .get('/api/attendance/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/attendance/dashboard');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('TOKEN_MISSING');
    });
  });

  describe('GET /api/attendance/reports/daily', () => {
    it('should return daily report for managers', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const response = await request(app)
        .get('/api/attendance/reports/daily')
        .query({ date: today })
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('date');
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('employees');
      expect(response.body.data.summary).toMatchObject({
        totalEmployees: expect.any(Number),
        totalHours: expect.any(Number),
        completedShifts: expect.any(Number),
        incompleteShifts: expect.any(Number)
      });
    });

    it('should fail without date parameter', async () => {
      const response = await request(app)
        .get('/api/attendance/reports/daily')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_DATE');
    });

    it('should fail for regular employees', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const response = await request(app)
        .get('/api/attendance/reports/daily')
        .query({ date: today })
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should fail without authentication', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const response = await request(app)
        .get('/api/attendance/reports/daily')
        .query({ date: today });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('TOKEN_MISSING');
    });
  });
});