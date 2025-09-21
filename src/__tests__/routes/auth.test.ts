import request from 'supertest';
import app from '../../server';
import { DatabaseManager } from '../../database/DatabaseManager';
import { EmployeeRepository } from '../../repositories/EmployeeRepository';
import { Employee } from '../../models/Employee';

describe('Authentication API', () => {
  let dbManager: DatabaseManager;
  let employeeRepository: EmployeeRepository;
  let testEmployee: Employee;

  beforeAll(async () => {
    // Initialize test database
    process.env.NODE_ENV = 'test';
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    employeeRepository = new EmployeeRepository();
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
  });

  afterAll(async () => {
    await dbManager.close();
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001',
          password: 'farm123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data).toHaveProperty('expiresIn');
      expect(response.body.data.employee).toMatchObject({
        id: testEmployee.id,
        employeeNumber: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        role: 'employee'
      });
    });

    it('should login successfully with card ID', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001',
          cardId: 'EMP001'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
    });

    it('should fail with invalid employee number', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'INVALID',
          password: 'farm123'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should fail with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should fail with missing employee number', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'farm123'
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_EMPLOYEE_NUMBER');
    });

    it('should fail with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001'
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_CREDENTIALS');
    });

    it('should fail with inactive employee', async () => {
      // Deactivate employee
      await employeeRepository.update(testEmployee.id, { isActive: false });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001',
          password: 'farm123'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid credentials or inactive employee');
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Get refresh token from login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001',
          password: 'farm123'
        });
      
      refreshToken = loginResponse.body.data.refreshToken;
    });

    it('should refresh token successfully', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('should fail with invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-token'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid refresh token');
    });

    it('should fail with missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_REFRESH_TOKEN');
    });
  });

  describe('GET /api/auth/me', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Get access token from login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001',
          password: 'farm123'
        });
      
      accessToken = loginResponse.body.data.token;
    });

    it('should return user info with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        employeeId: testEmployee.id,
        employeeNumber: 'EMP001',
        role: 'employee'
      });
    });

    it('should fail without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('TOKEN_MISSING');
    });

    it('should fail with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('TOKEN_INVALID');
    });
  });

  describe('POST /api/auth/logout', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Get access token from login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001',
          password: 'farm123'
        });
      
      accessToken = loginResponse.body.data.token;
    });

    it('should logout successfully with valid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should fail without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('TOKEN_MISSING');
    });
  });

  describe('POST /api/auth/verify', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Get access token from login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          employeeNumber: 'EMP001',
          password: 'farm123'
        });
      
      accessToken = loginResponse.body.data.token;
    });

    it('should verify valid token', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({
          token: accessToken
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.payload).toMatchObject({
        employeeId: testEmployee.id,
        employeeNumber: 'EMP001',
        role: 'employee'
      });
    });

    it('should return invalid for bad token', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({
          token: 'invalid-token'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(false);
    });

    it('should fail with missing token', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_TOKEN');
    });
  });
});