import request from 'supertest';
import app from '../../server';
import { DatabaseManager } from '../../database/DatabaseManager';
import { Employee } from '../../models/Employee';
import { TimeCategory } from '../../models/TimeCategory';
import { v4 as uuidv4 } from 'uuid';

describe('Admin Journey E2E Tests', () => {
  let dbManager: DatabaseManager;
  let adminEmployee: Employee;
  let adminAuthToken: string;

  beforeAll(async () => {
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    
    // Create admin employee
    adminEmployee = {
      id: uuidv4(),
      employeeNumber: 'ADM001',
      firstName: 'Super',
      lastName: 'Admin',
      email: 'admin@farm.com',
      role: 'admin',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const db = dbManager.getDatabase();
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO employees (id, employee_number, first_name, last_name, email, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [adminEmployee.id, adminEmployee.employeeNumber, adminEmployee.firstName, adminEmployee.lastName, 
         adminEmployee.email, adminEmployee.role, adminEmployee.isActive ? 1 : 0, 
         adminEmployee.createdAt.toISOString(), adminEmployee.updatedAt.toISOString()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Get admin auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        employeeNumber: 'ADM001',
        password: 'password123'
      });
    
    adminAuthToken = loginResponse.body.token;
  });

  afterAll(async () => {
    await dbManager.close();
  });

  describe('Employee Management Journey', () => {
    let testEmployeeId: string;

    it('should complete full employee lifecycle management', async () => {
      // Step 1: Create new employee
      const newEmployeeData = {
        employeeNumber: 'EMP999',
        firstName: 'Test',
        lastName: 'Employee',
        email: 'test.employee@farm.com',
        role: 'employee',
        isActive: true
      };

      const createResponse = await request(app)
        .post('/api/admin/employees')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(newEmployeeData);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.employee.employeeNumber).toBe(newEmployeeData.employeeNumber);
      
      testEmployeeId = createResponse.body.employee.id;

      // Step 2: Retrieve employee
      const getResponse = await request(app)
        .get(`/api/admin/employees/${testEmployeeId}`)
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.employee.firstName).toBe(newEmployeeData.firstName);

      // Step 3: Update employee
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
        role: 'manager'
      };

      const updateResponse = await request(app)
        .put(`/api/admin/employees/${testEmployeeId}`)
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(updateData);

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.employee.firstName).toBe(updateData.firstName);
      expect(updateResponse.body.employee.role).toBe(updateData.role);

      // Step 4: List all employees
      const listResponse = await request(app)
        .get('/api/admin/employees')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body.employees)).toBe(true);
      expect(listResponse.body.employees.length).toBeGreaterThanOrEqual(2);

      // Step 5: Deactivate employee
      const deactivateResponse = await request(app)
        .patch(`/api/admin/employees/${testEmployeeId}/deactivate`)
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(deactivateResponse.status).toBe(200);
      expect(deactivateResponse.body.employee.isActive).toBe(false);

      // Step 6: Verify deactivated employee cannot login
      const loginAttemptResponse = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP999',
          password: 'password123'
        });

      expect(loginAttemptResponse.status).toBe(401);
      expect(loginAttemptResponse.body.error).toContain('inactive');
    });

    it('should handle bulk employee operations', async () => {
      // Create multiple employees for bulk testing
      const bulkEmployees = [
        {
          employeeNumber: 'BULK001',
          firstName: 'Bulk',
          lastName: 'Employee1',
          email: 'bulk1@farm.com',
          role: 'employee'
        },
        {
          employeeNumber: 'BULK002',
          firstName: 'Bulk',
          lastName: 'Employee2',
          email: 'bulk2@farm.com',
          role: 'employee'
        }
      ];

      const bulkCreateResponse = await request(app)
        .post('/api/admin/employees/bulk')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({ employees: bulkEmployees });

      expect(bulkCreateResponse.status).toBe(201);
      expect(bulkCreateResponse.body.success).toBe(true);
      expect(bulkCreateResponse.body.created).toBe(2);
      expect(Array.isArray(bulkCreateResponse.body.employees)).toBe(true);

      // Bulk deactivate
      const employeeIds = bulkCreateResponse.body.employees.map((emp: any) => emp.id);
      const bulkDeactivateResponse = await request(app)
        .patch('/api/admin/employees/bulk/deactivate')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({ employeeIds });

      expect(bulkDeactivateResponse.status).toBe(200);
      expect(bulkDeactivateResponse.body.updated).toBe(2);
    });

    it('should validate employee data integrity', async () => {
      // Try to create employee with duplicate employee number
      const duplicateEmployeeData = {
        employeeNumber: 'ADM001', // Already exists
        firstName: 'Duplicate',
        lastName: 'Employee',
        email: 'duplicate@farm.com',
        role: 'employee'
      };

      const duplicateResponse = await request(app)
        .post('/api/admin/employees')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(duplicateEmployeeData);

      expect(duplicateResponse.status).toBe(400);
      expect(duplicateResponse.body.error).toContain('employee number already exists');

      // Try to create employee with invalid email
      const invalidEmailData = {
        employeeNumber: 'INV001',
        firstName: 'Invalid',
        lastName: 'Email',
        email: 'not-an-email',
        role: 'employee'
      };

      const invalidEmailResponse = await request(app)
        .post('/api/admin/employees')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(invalidEmailData);

      expect(invalidEmailResponse.status).toBe(400);
      expect(invalidEmailResponse.body.error).toContain('invalid email');
    });
  });

  describe('Time Category Management Journey', () => {
    let testCategoryId: string;

    it('should complete full time category lifecycle', async () => {
      // Step 1: Create new time category
      const newCategoryData = {
        name: 'Overtime',
        minHours: 8,
        maxHours: 12,
        payMultiplier: 1.5,
        color: '#ff6b6b',
        isActive: true
      };

      const createResponse = await request(app)
        .post('/api/admin/time-categories')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(newCategoryData);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.category.name).toBe(newCategoryData.name);
      
      testCategoryId = createResponse.body.category.id;

      // Step 2: Retrieve category
      const getResponse = await request(app)
        .get(`/api/admin/time-categories/${testCategoryId}`)
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.category.payMultiplier).toBe(newCategoryData.payMultiplier);

      // Step 3: Update category
      const updateData = {
        name: 'Updated Overtime',
        payMultiplier: 2.0,
        color: '#ff0000'
      };

      const updateResponse = await request(app)
        .put(`/api/admin/time-categories/${testCategoryId}`)
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(updateData);

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.category.name).toBe(updateData.name);
      expect(updateResponse.body.category.payMultiplier).toBe(updateData.payMultiplier);

      // Step 4: List all categories
      const listResponse = await request(app)
        .get('/api/admin/time-categories')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body.categories)).toBe(true);

      // Step 5: Test category assignment logic
      const testAssignmentResponse = await request(app)
        .post('/api/admin/time-categories/test-assignment')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({ hours: 10 });

      expect(testAssignmentResponse.status).toBe(200);
      expect(testAssignmentResponse.body.assignedCategory).toBeTruthy();

      // Step 6: Deactivate category
      const deactivateResponse = await request(app)
        .patch(`/api/admin/time-categories/${testCategoryId}/deactivate`)
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(deactivateResponse.status).toBe(200);
      expect(deactivateResponse.body.category.isActive).toBe(false);
    });

    it('should validate time category configuration', async () => {
      // Try to create category with invalid hours
      const invalidCategoryData = {
        name: 'Invalid Category',
        minHours: 10,
        maxHours: 5, // Max less than min
        payMultiplier: 1.0,
        color: '#000000'
      };

      const invalidResponse = await request(app)
        .post('/api/admin/time-categories')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(invalidCategoryData);

      expect(invalidResponse.status).toBe(400);
      expect(invalidResponse.body.error).toContain('maxHours must be greater than minHours');

      // Try to create category with negative pay multiplier
      const negativePay = {
        name: 'Negative Pay',
        minHours: 0,
        maxHours: 8,
        payMultiplier: -1.0,
        color: '#000000'
      };

      const negativeResponse = await request(app)
        .post('/api/admin/time-categories')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(negativePay);

      expect(negativeResponse.status).toBe(400);
      expect(negativeResponse.body.error).toContain('payMultiplier must be positive');
    });

    it('should detect and prevent category conflicts', async () => {
      // Create overlapping categories
      const category1 = {
        name: 'Category 1',
        minHours: 4,
        maxHours: 8,
        payMultiplier: 1.0,
        color: '#ff0000'
      };

      const category2 = {
        name: 'Category 2',
        minHours: 6, // Overlaps with category1
        maxHours: 10,
        payMultiplier: 1.2,
        color: '#00ff00'
      };

      await request(app)
        .post('/api/admin/time-categories')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(category1);

      const conflictResponse = await request(app)
        .post('/api/admin/time-categories')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(category2);

      expect(conflictResponse.status).toBe(400);
      expect(conflictResponse.body.error).toContain('overlapping hours');
    });
  });

  describe('System Configuration Journey', () => {
    it('should manage system settings', async () => {
      // Get current settings
      const getSettingsResponse = await request(app)
        .get('/api/admin/system/settings')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(getSettingsResponse.status).toBe(200);
      expect(getSettingsResponse.body).toHaveProperty('settings');

      // Update settings
      const newSettings = {
        autoSyncInterval: 300, // 5 minutes
        maxOfflineDays: 7,
        requirePhotoForClockIn: true,
        allowManualTimeEntry: false
      };

      const updateSettingsResponse = await request(app)
        .put('/api/admin/system/settings')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(newSettings);

      expect(updateSettingsResponse.status).toBe(200);
      expect(updateSettingsResponse.body.settings.autoSyncInterval).toBe(newSettings.autoSyncInterval);

      // Verify settings were saved
      const verifyResponse = await request(app)
        .get('/api/admin/system/settings')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(verifyResponse.body.settings.requirePhotoForClockIn).toBe(true);
    });

    it('should provide system health monitoring', async () => {
      const healthResponse = await request(app)
        .get('/api/admin/system/health')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(healthResponse.status).toBe(200);
      expect(healthResponse.body).toHaveProperty('status');
      expect(healthResponse.body).toHaveProperty('database');
      expect(healthResponse.body).toHaveProperty('storage');
      expect(healthResponse.body).toHaveProperty('sync');
      expect(healthResponse.body).toHaveProperty('uptime');
    });

    it('should manage sync configuration and status', async () => {
      // Get sync status
      const syncStatusResponse = await request(app)
        .get('/api/admin/sync/status')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(syncStatusResponse.status).toBe(200);
      expect(syncStatusResponse.body).toHaveProperty('lastSync');
      expect(syncStatusResponse.body).toHaveProperty('pendingItems');
      expect(syncStatusResponse.body).toHaveProperty('conflicts');

      // Trigger manual sync
      const manualSyncResponse = await request(app)
        .post('/api/admin/sync/trigger')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(manualSyncResponse.status).toBe(200);
      expect(manualSyncResponse.body.success).toBe(true);

      // Get sync logs
      const syncLogsResponse = await request(app)
        .get('/api/admin/sync/logs')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .query({ limit: 10 });

      expect(syncLogsResponse.status).toBe(200);
      expect(Array.isArray(syncLogsResponse.body.logs)).toBe(true);
    });
  });

  describe('Admin Authorization Journey', () => {
    it('should allow admins to access all system functions', async () => {
      // Test access to all major admin endpoints
      const endpoints = [
        '/api/admin/employees',
        '/api/admin/time-categories',
        '/api/admin/system/settings',
        '/api/admin/system/health',
        '/api/admin/sync/status'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${adminAuthToken}`);

        expect(response.status).toBeLessThan(400);
      }
    });

    it('should prevent non-admin access to admin functions', async () => {
      // Create a manager employee
      const managerEmployee: Employee = {
        id: uuidv4(),
        employeeNumber: 'MGR999',
        firstName: 'Test',
        lastName: 'Manager',
        email: 'test.manager@farm.com',
        role: 'manager',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const db = dbManager.getDatabase();
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

      // Get manager token
      const managerLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'MGR999',
          password: 'password123'
        });

      const managerToken = managerLoginResponse.body.token;

      // Try to access admin endpoints
      const unauthorizedResponse = await request(app)
        .get('/api/admin/system/settings')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(unauthorizedResponse.status).toBe(403);
      expect(unauthorizedResponse.body.error).toContain('admin access required');
    });
  });

  describe('Data Backup and Recovery Journey', () => {
    it('should create and restore database backups', async () => {
      // Create backup
      const backupResponse = await request(app)
        .post('/api/admin/backup/create')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(backupResponse.status).toBe(200);
      expect(backupResponse.body.success).toBe(true);
      expect(backupResponse.body).toHaveProperty('backupId');
      expect(backupResponse.body).toHaveProperty('filename');

      const backupId = backupResponse.body.backupId;

      // List backups
      const listBackupsResponse = await request(app)
        .get('/api/admin/backup/list')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(listBackupsResponse.status).toBe(200);
      expect(Array.isArray(listBackupsResponse.body.backups)).toBe(true);
      expect(listBackupsResponse.body.backups.length).toBeGreaterThan(0);

      // Verify backup exists in list
      const backup = listBackupsResponse.body.backups.find((b: any) => b.id === backupId);
      expect(backup).toBeDefined();
      expect(backup).toHaveProperty('createdAt');
      expect(backup).toHaveProperty('size');
    });

    it('should validate backup integrity', async () => {
      const backupResponse = await request(app)
        .post('/api/admin/backup/create')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      const backupId = backupResponse.body.backupId;

      // Validate backup
      const validateResponse = await request(app)
        .post(`/api/admin/backup/validate/${backupId}`)
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(validateResponse.status).toBe(200);
      expect(validateResponse.body.valid).toBe(true);
      expect(validateResponse.body).toHaveProperty('checksum');
      expect(validateResponse.body).toHaveProperty('recordCount');
    });
  });
});