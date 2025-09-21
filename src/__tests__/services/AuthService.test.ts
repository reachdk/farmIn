import { AuthService } from '../../services/AuthService';
import { DatabaseManager } from '../../database/DatabaseManager';
import { EmployeeRepository } from '../../repositories/EmployeeRepository';
import { Employee } from '../../models/Employee';

describe('AuthService', () => {
  let authService: AuthService;
  let dbManager: DatabaseManager;
  let employeeRepository: EmployeeRepository;
  let testEmployee: Employee;

  beforeAll(async () => {
    // Initialize test database
    process.env.NODE_ENV = 'test';
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    employeeRepository = new EmployeeRepository();
    authService = AuthService.getInstance();
  });

  beforeEach(async () => {
    // Clean up database
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

  describe('login', () => {
    it('should login successfully with valid password', async () => {
      const result = await authService.login({
        employeeNumber: 'EMP001',
        password: 'farm123'
      });

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result.employee).toMatchObject({
        id: testEmployee.id,
        employeeNumber: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        role: 'employee'
      });
    });

    it('should login successfully with valid card ID', async () => {
      const result = await authService.login({
        employeeNumber: 'EMP001',
        cardId: 'EMP001'
      });

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw error for invalid employee number', async () => {
      await expect(authService.login({
        employeeNumber: 'INVALID',
        password: 'farm123'
      })).rejects.toThrow('Invalid credentials or inactive employee');
    });

    it('should throw error for invalid password', async () => {
      await expect(authService.login({
        employeeNumber: 'EMP001',
        password: 'wrongpassword'
      })).rejects.toThrow('Invalid credentials');
    });

    it('should throw error for inactive employee', async () => {
      await employeeRepository.update(testEmployee.id, { isActive: false });

      await expect(authService.login({
        employeeNumber: 'EMP001',
        password: 'farm123'
      })).rejects.toThrow('Invalid credentials or inactive employee');
    });

    it('should throw error when no credentials provided', async () => {
      await expect(authService.login({
        employeeNumber: 'EMP001'
      })).rejects.toThrow('Password or card ID required');
    });
  });

  describe('verifyToken', () => {
    let validToken: string;

    beforeEach(async () => {
      const result = await authService.login({
        employeeNumber: 'EMP001',
        password: 'farm123'
      });
      validToken = result.token;
    });

    it('should verify valid token', async () => {
      const payload = await authService.verifyToken(validToken);

      expect(payload).toMatchObject({
        employeeId: testEmployee.id,
        employeeNumber: 'EMP001',
        role: 'employee',
        type: 'access'
      });
    });

    it('should throw error for invalid token', async () => {
      await expect(authService.verifyToken('invalid-token'))
        .rejects.toThrow('Invalid or expired token');
    });

    it('should throw error for refresh token used as access token', async () => {
      const result = await authService.login({
        employeeNumber: 'EMP001',
        password: 'farm123'
      });

      await expect(authService.verifyToken(result.refreshToken))
        .rejects.toThrow('Invalid or expired token');
    });
  });

  describe('refreshToken', () => {
    let validRefreshToken: string;

    beforeEach(async () => {
      const result = await authService.login({
        employeeNumber: 'EMP001',
        password: 'farm123'
      });
      validRefreshToken = result.refreshToken;
    });

    it('should refresh token successfully', async () => {
      const result = await authService.refreshToken(validRefreshToken);

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result.employee).toMatchObject({
        id: testEmployee.id,
        employeeNumber: 'EMP001'
      });
    });

    it('should throw error for invalid refresh token', async () => {
      await expect(authService.refreshToken('invalid-token'))
        .rejects.toThrow('Invalid refresh token');
    });

    it('should throw error for access token used as refresh token', async () => {
      const result = await authService.login({
        employeeNumber: 'EMP001',
        password: 'farm123'
      });

      await expect(authService.refreshToken(result.token))
        .rejects.toThrow('Invalid refresh token');
    });
  });

  describe('password hashing', () => {
    it('should hash password correctly', async () => {
      const password = 'testpassword123';
      const hash = await authService.hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should verify hashed password correctly', async () => {
      const password = 'testpassword123';
      const hash = await authService.hashPassword(password);

      const isValid = await authService.verifyHashedPassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await authService.verifyHashedPassword('wrongpassword', hash);
      expect(isInvalid).toBe(false);
    });
  });
});