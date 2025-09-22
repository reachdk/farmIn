import request from 'supertest';
import app from '../../server';
import { DatabaseManager } from '../../database/DatabaseManager';
import { Employee } from '../../models/Employee';
import { AttendanceRecord } from '../../models/AttendanceRecord';
import { v4 as uuidv4 } from 'uuid';

describe('Manager Journey E2E Tests', () => {
  let dbManager: DatabaseManager;
  let managerEmployee: Employee;
  let regularEmployee: Employee;
  let managerAuthToken: string;

  beforeAll(async () => {
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    
    // Create manager employee
    managerEmployee = {
      id: uuidv4(),
      employeeNumber: 'MGR001',
      firstName: 'Alice',
      lastName: 'Manager',
      email: 'alice.manager@farm.com',
      role: 'manager',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create regular employee
    regularEmployee = {
      id: uuidv4(),
      employeeNumber: 'EMP001',
      firstName: 'Bob',
      lastName: 'Worker',
      email: 'bob.worker@farm.com',
      role: 'employee',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const db = dbManager.getDatabase();
    
    // Insert manager
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO employees (id, employee_number, first_name, last_name, email, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [managerEmployee.id, managerEmployee.employeeNumber, managerEmployee.firstName, managerEmployee.lastName, 
         managerEmployee.email, managerEmployee.role, managerEmployee.isActive ? 1 : 0, 
         managerEmployee.createdAt.toISOString(), managerEmployee.updatedAt.toISOString()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Insert regular employee
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO employees (id, employee_number, first_name, last_name, email, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [regularEmployee.id, regularEmployee.employeeNumber, regularEmployee.firstName, regularEmployee.lastName, 
         regularEmployee.email, regularEmployee.role, regularEmployee.isActive ? 1 : 0, 
         regularEmployee.createdAt.toISOString(), regularEmployee.updatedAt.toISOString()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Get manager auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        employeeNumber: 'MGR001',
        password: 'password123'
      });
    
    managerAuthToken = loginResponse.body.token;
  });

  afterAll(async () => {
    await dbManager.close();
  });

  describe('Manager Dashboard Journey', () => {
    it('should provide comprehensive dashboard view', async () => {
      // Create some test attendance data
      const clockInTime = new Date();
      const attendanceRecord: AttendanceRecord = {
        id: uuidv4(),
        employeeId: regularEmployee.id,
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

      // Step 1: Get dashboard data
      const dashboardResponse = await request(app)
        .get('/api/manager/dashboard')
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .query({
          date: new Date().toISOString().split('T')[0]
        });

      expect(dashboardResponse.status).toBe(200);
      expect(dashboardResponse.body).toHaveProperty('activeEmployees');
      expect(dashboardResponse.body).toHaveProperty('totalEmployees');
      expect(dashboardResponse.body).toHaveProperty('attendanceRecords');
      expect(dashboardResponse.body.activeEmployees).toBeGreaterThan(0);
    });

    it('should show real-time employee status', async () => {
      const statusResponse = await request(app)
        .get('/api/manager/employee-status')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(statusResponse.status).toBe(200);
      expect(Array.isArray(statusResponse.body.employees)).toBe(true);
      
      const employeeStatus = statusResponse.body.employees.find(
        (emp: any) => emp.id === regularEmployee.id
      );
      expect(employeeStatus).toBeDefined();
      expect(employeeStatus).toHaveProperty('isActive');
      expect(employeeStatus).toHaveProperty('currentShift');
    });
  });

  describe('Manager Reporting Journey', () => {
    it('should generate comprehensive attendance reports', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();

      const reportResponse = await request(app)
        .get('/api/manager/reports/attendance')
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .query({
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          employeeId: regularEmployee.id
        });

      expect(reportResponse.status).toBe(200);
      expect(reportResponse.body).toHaveProperty('summary');
      expect(reportResponse.body).toHaveProperty('records');
      expect(reportResponse.body).toHaveProperty('totalHours');
      expect(reportResponse.body).toHaveProperty('categorizedHours');
    });

    it('should generate payroll-ready reports', async () => {
      const payrollResponse = await request(app)
        .get('/api/manager/reports/payroll')
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .query({
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0]
        });

      expect(payrollResponse.status).toBe(200);
      expect(Array.isArray(payrollResponse.body.employees)).toBe(true);
      
      if (payrollResponse.body.employees.length > 0) {
        const employeeData = payrollResponse.body.employees[0];
        expect(employeeData).toHaveProperty('employeeId');
        expect(employeeData).toHaveProperty('totalHours');
        expect(employeeData).toHaveProperty('categorizedHours');
        expect(employeeData).toHaveProperty('adjustments');
      }
    });
  });

  describe('Manager Time Adjustment Journey', () => {
    let testAttendanceId: string;

    beforeEach(async () => {
      // Create a completed attendance record for adjustment testing
      const clockInTime = new Date(Date.now() - 8 * 60 * 60 * 1000); // 8 hours ago
      const clockOutTime = new Date();
      
      const attendanceRecord: AttendanceRecord = {
        id: uuidv4(),
        employeeId: regularEmployee.id,
        clockInTime: clockInTime,
        clockOutTime: clockOutTime,
        totalHours: 8,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const db = dbManager.getDatabase();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO attendance_records (id, employee_id, clock_in_time, clock_out_time, total_hours, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [attendanceRecord.id, attendanceRecord.employeeId, attendanceRecord.clockInTime.toISOString(),
           attendanceRecord.clockOutTime.toISOString(), attendanceRecord.totalHours,
           attendanceRecord.createdAt.toISOString(), attendanceRecord.updatedAt.toISOString()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      testAttendanceId = attendanceRecord.id;
    });

    it('should allow managers to adjust time entries with audit trail', async () => {
      const adjustmentData = {
        recordId: testAttendanceId,
        field: 'clockOutTime',
        newValue: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
        reason: 'Employee forgot to clock out, left at 5:30 PM'
      };

      // Step 1: Make the adjustment
      const adjustmentResponse = await request(app)
        .post('/api/manager/adjust-time')
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .send(adjustmentData);

      expect(adjustmentResponse.status).toBe(200);
      expect(adjustmentResponse.body.success).toBe(true);
      expect(adjustmentResponse.body.adjustment).toHaveProperty('id');

      // Step 2: Verify the adjustment was recorded
      const auditResponse = await request(app)
        .get(`/api/manager/audit-trail/${testAttendanceId}`)
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(auditResponse.status).toBe(200);
      expect(Array.isArray(auditResponse.body.adjustments)).toBe(true);
      expect(auditResponse.body.adjustments).toHaveLength(1);
      
      const adjustment = auditResponse.body.adjustments[0];
      expect(adjustment.field).toBe('clockOutTime');
      expect(adjustment.reason).toBe(adjustmentData.reason);
      expect(adjustment.adjustedBy).toBe(managerEmployee.id);

      // Step 3: Verify the record was updated
      const recordResponse = await request(app)
        .get(`/api/attendance/record/${testAttendanceId}`)
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(recordResponse.status).toBe(200);
      expect(new Date(recordResponse.body.record.clockOutTime).getTime())
        .toBe(new Date(adjustmentData.newValue).getTime());
    });

    it('should require justification for time adjustments', async () => {
      const adjustmentWithoutReason = {
        recordId: testAttendanceId,
        field: 'clockOutTime',
        newValue: new Date().toISOString()
        // Missing reason
      };

      const response = await request(app)
        .post('/api/manager/adjust-time')
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .send(adjustmentWithoutReason);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('reason is required');
    });
  });

  describe('Manager Employee Oversight Journey', () => {
    it('should provide employee performance metrics', async () => {
      const metricsResponse = await request(app)
        .get(`/api/manager/employee-metrics/${regularEmployee.id}`)
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .query({
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0]
        });

      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body).toHaveProperty('totalDays');
      expect(metricsResponse.body).toHaveProperty('averageHours');
      expect(metricsResponse.body).toHaveProperty('attendanceRate');
      expect(metricsResponse.body).toHaveProperty('categoryBreakdown');
    });

    it('should detect attendance anomalies', async () => {
      const anomaliesResponse = await request(app)
        .get('/api/manager/attendance-alerts')
        .set('Authorization', `Bearer ${managerAuthToken}`)
        .query({
          date: new Date().toISOString().split('T')[0]
        });

      expect(anomaliesResponse.status).toBe(200);
      expect(Array.isArray(anomaliesResponse.body.alerts)).toBe(true);
      
      // Each alert should have required fields
      anomaliesResponse.body.alerts.forEach((alert: any) => {
        expect(alert).toHaveProperty('type');
        expect(alert).toHaveProperty('employeeId');
        expect(alert).toHaveProperty('message');
        expect(alert).toHaveProperty('severity');
      });
    });
  });

  describe('Manager Authorization Journey', () => {
    it('should allow managers to access all employee data', async () => {
      const allEmployeesResponse = await request(app)
        .get('/api/manager/employees')
        .set('Authorization', `Bearer ${managerAuthToken}`);

      expect(allEmployeesResponse.status).toBe(200);
      expect(Array.isArray(allEmployeesResponse.body.employees)).toBe(true);
      expect(allEmployeesResponse.body.employees.length).toBeGreaterThanOrEqual(2);
    });

    it('should prevent regular employees from accessing manager endpoints', async () => {
      // Get regular employee token
      const employeeLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001',
          password: 'password123'
        });

      const employeeToken = employeeLoginResponse.body.token;

      // Try to access manager dashboard
      const unauthorizedResponse = await request(app)
        .get('/api/manager/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(unauthorizedResponse.status).toBe(403);
      expect(unauthorizedResponse.body.error).toContain('insufficient permissions');
    });
  });
});