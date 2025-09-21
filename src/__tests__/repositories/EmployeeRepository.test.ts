import { EmployeeRepository, EmployeeNotFoundError, EmployeeDuplicateError } from '../../repositories/EmployeeRepository';
import { DatabaseManager } from '../../database/DatabaseManager';
import { CreateEmployeeData, UpdateEmployeeData, Employee } from '../../models/Employee';

// Mock the DatabaseManager
jest.mock('../../database/DatabaseManager');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-123')
}));

describe('EmployeeRepository', () => {
  let repository: EmployeeRepository;
  let mockDbManager: jest.Mocked<DatabaseManager>;

  const mockEmployee = {
    id: 'mock-uuid-123',
    employee_number: 'EMP001',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@example.com',
    role: 'employee',
    is_active: 1,
    created_at: '2023-01-01T00:00:00.000Z',
    updated_at: '2023-01-01T00:00:00.000Z',
    last_sync_at: null
  };

  beforeEach(() => {
    mockDbManager = {
      run: jest.fn().mockResolvedValue({ changes: 1, lastID: 1 } as any),
      get: jest.fn(),
      all: jest.fn(),
      withTransaction: jest.fn()
    } as any;

    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDbManager);
    repository = new EmployeeRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const validCreateData: CreateEmployeeData = {
      employeeNumber: 'EMP001',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      role: 'employee'
    };

    it('should create a new employee successfully', async () => {
      mockDbManager.get.mockResolvedValueOnce(null); // No existing employee by number
      mockDbManager.get.mockResolvedValueOnce(null); // No existing employee by email
      mockDbManager.run.mockResolvedValueOnce({ changes: 1, lastID: 1 } as any);

      const result = await repository.create(validCreateData);

      expect(result).toMatchObject({
        id: 'mock-uuid-123',
        employeeNumber: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        role: 'employee',
        isActive: true
      });

      expect(mockDbManager.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO employees'),
        expect.arrayContaining(['mock-uuid-123', 'EMP001', 'John', 'Doe', 'john.doe@example.com', 'employee', 1])
      );
    });

    it('should create employee without optional fields', async () => {
      const minimalData: CreateEmployeeData = {
        employeeNumber: 'EMP002',
        firstName: 'Jane',
        lastName: 'Smith'
      };

      mockDbManager.get.mockResolvedValueOnce(null); // No existing employee
      mockDbManager.run.mockResolvedValueOnce({ changes: 1, lastID: 1 } as any);

      const result = await repository.create(minimalData);

      expect(result).toMatchObject({
        employeeNumber: 'EMP002',
        firstName: 'Jane',
        lastName: 'Smith',
        email: undefined,
        role: 'employee'
      });
    });

    it('should normalize employee number to uppercase', async () => {
      const dataWithLowercase = { ...validCreateData, employeeNumber: 'EMP001' }; // Use valid format for test

      mockDbManager.get.mockResolvedValueOnce(null);
      mockDbManager.get.mockResolvedValueOnce(null);
      mockDbManager.run.mockResolvedValueOnce({ changes: 1, lastID: 1 } as any);

      const result = await repository.create(dataWithLowercase);

      expect(result.employeeNumber).toBe('EMP001');
    });

    it('should throw error for duplicate employee number', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockEmployee); // Existing employee found

      await expect(repository.create(validCreateData))
        .rejects.toThrow(new EmployeeDuplicateError('employee number', 'EMP001'));
    });

    it('should throw error for duplicate email', async () => {
      mockDbManager.get.mockResolvedValueOnce(null); // No existing by number
      mockDbManager.get.mockResolvedValueOnce(mockEmployee); // Existing by email

      await expect(repository.create(validCreateData))
        .rejects.toThrow(new EmployeeDuplicateError('email', 'john.doe@example.com'));
    });

    it('should throw validation error for invalid data', async () => {
      const invalidData = { ...validCreateData, firstName: '' };

      await expect(repository.create(invalidData))
        .rejects.toThrow('First name is required');
    });
  });

  describe('findById', () => {
    it('should return employee when found', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockEmployee);

      const result = await repository.findById('mock-uuid-123');

      expect(result).toMatchObject({
        id: 'mock-uuid-123',
        employeeNumber: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        isActive: true
      });
    });

    it('should return null when employee not found', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmployeeNumber', () => {
    it('should return employee when found', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockEmployee);

      const result = await repository.findByEmployeeNumber('EMP001');

      expect(result).toMatchObject({
        employeeNumber: 'EMP001'
      });
      expect(mockDbManager.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE employee_number = ?'),
        ['EMP001']
      );
    });

    it('should normalize search to uppercase', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockEmployee);

      await repository.findByEmployeeNumber('emp001');

      expect(mockDbManager.get).toHaveBeenCalledWith(
        expect.any(String),
        ['EMP001']
      );
    });
  });

  describe('findByEmail', () => {
    it('should return employee when found', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockEmployee);

      const result = await repository.findByEmail('john.doe@example.com');

      expect(result).toMatchObject({
        email: 'john.doe@example.com'
      });
    });

    it('should normalize search to lowercase', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockEmployee);

      await repository.findByEmail('JOHN.DOE@EXAMPLE.COM');

      expect(mockDbManager.get).toHaveBeenCalledWith(
        expect.any(String),
        ['john.doe@example.com']
      );
    });
  });

  describe('findAll', () => {
    const mockEmployees = [mockEmployee, { ...mockEmployee, id: 'emp2', employee_number: 'EMP002' }];

    it('should return all employees without filters', async () => {
      mockDbManager.all.mockResolvedValueOnce(mockEmployees);

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM employees WHERE 1=1'),
        []
      );
    });

    it('should filter by role', async () => {
      mockDbManager.all.mockResolvedValueOnce([mockEmployee]);

      const result = await repository.findAll({ role: 'employee' });

      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('AND role = ?'),
        ['employee']
      );
    });

    it('should filter by active status', async () => {
      mockDbManager.all.mockResolvedValueOnce([mockEmployee]);

      await repository.findAll({ isActive: true });

      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('AND is_active = ?'),
        [1]
      );
    });

    it('should filter by search term', async () => {
      mockDbManager.all.mockResolvedValueOnce([mockEmployee]);

      await repository.findAll({ search: 'John' });

      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('AND (first_name LIKE ? OR last_name LIKE ? OR employee_number LIKE ?)'),
        ['%John%', '%John%', '%John%']
      );
    });

    it('should combine multiple filters', async () => {
      mockDbManager.all.mockResolvedValueOnce([mockEmployee]);

      await repository.findAll({ role: 'manager', isActive: true, search: 'John' });

      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('AND role = ?'),
        expect.arrayContaining(['manager', 1, '%John%', '%John%', '%John%'])
      );
    });
  });

  describe('update', () => {
    const updateData: UpdateEmployeeData = {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com'
    };

    it('should update employee successfully', async () => {
      const existingEmployee = { ...mockEmployee };
      const updatedEmployee = { ...mockEmployee, first_name: 'Jane', last_name: 'Smith' };

      mockDbManager.get.mockResolvedValueOnce(existingEmployee); // findById for existing check
      mockDbManager.get.mockResolvedValueOnce(null); // findByEmail - no duplicate
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);
      mockDbManager.get.mockResolvedValueOnce(updatedEmployee); // findById for return value

      const result = await repository.update('mock-uuid-123', updateData);

      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
      expect(mockDbManager.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE employees SET'),
        expect.arrayContaining(['Jane', 'Smith', 'jane.smith@example.com'])
      );
    });

    it('should throw error when employee not found', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      await expect(repository.update('non-existent', updateData))
        .rejects.toThrow(new EmployeeNotFoundError('non-existent'));
    });

    it('should check for duplicate employee number on update', async () => {
      const existingEmployee = { ...mockEmployee };
      const duplicateEmployee = { ...mockEmployee, id: 'other-id' };

      mockDbManager.get.mockResolvedValueOnce(existingEmployee); // findById
      mockDbManager.get.mockResolvedValueOnce(duplicateEmployee); // findByEmployeeNumber

      await expect(repository.update('mock-uuid-123', { employeeNumber: 'EMP002' }))
        .rejects.toThrow(new EmployeeDuplicateError('employee number', 'EMP002'));
    });

    it('should allow updating to same employee number', async () => {
      const existingEmployee = { ...mockEmployee };

      mockDbManager.get.mockResolvedValueOnce(existingEmployee); // findById
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);
      mockDbManager.get.mockResolvedValueOnce(existingEmployee); // findById for return

      await expect(repository.update('mock-uuid-123', { employeeNumber: 'EMP001' }))
        .resolves.not.toThrow();
    });
  });

  describe('delete', () => {
    it('should soft delete employee', async () => {
      const existingEmployee = { ...mockEmployee };
      const deactivatedEmployee = { ...mockEmployee, is_active: 0 };

      mockDbManager.get.mockResolvedValueOnce(existingEmployee); // findById in delete
      mockDbManager.get.mockResolvedValueOnce(existingEmployee); // findById in update
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any); // update query
      mockDbManager.get.mockResolvedValueOnce(deactivatedEmployee); // findById for return

      await repository.delete('mock-uuid-123');

      expect(mockDbManager.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE employees SET'),
        expect.arrayContaining([0]) // isActive = false
      );
    });

    it('should throw error when employee not found', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      await expect(repository.delete('non-existent'))
        .rejects.toThrow(new EmployeeNotFoundError('non-existent'));
    });
  });

  describe('hardDelete', () => {
    it('should permanently delete employee', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockEmployee);
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);

      await repository.hardDelete('mock-uuid-123');

      expect(mockDbManager.run).toHaveBeenCalledWith(
        'DELETE FROM employees WHERE id = ?',
        ['mock-uuid-123']
      );
    });
  });

  describe('authenticate', () => {
    it('should return employee for valid active employee', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockEmployee);

      const result = await repository.authenticate('EMP001');

      expect(result).toMatchObject({
        employeeNumber: 'EMP001',
        isActive: true
      });
    });

    it('should return null for inactive employee', async () => {
      const inactiveEmployee = { ...mockEmployee, is_active: 0 };
      mockDbManager.get.mockResolvedValueOnce(inactiveEmployee);

      const result = await repository.authenticate('EMP001');

      expect(result).toBeNull();
    });

    it('should return null for non-existent employee', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      const result = await repository.authenticate('NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('getEmployeesByRole', () => {
    it('should return employees with specific role', async () => {
      const managers = [{ ...mockEmployee, role: 'manager' }];
      mockDbManager.all.mockResolvedValueOnce(managers);

      const result = await repository.getEmployeesByRole('manager');

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('manager');
    });
  });

  describe('getActiveEmployeesCount', () => {
    it('should return count of active employees', async () => {
      mockDbManager.get.mockResolvedValueOnce({ count: 5 });

      const result = await repository.getActiveEmployeesCount();

      expect(result).toBe(5);
      expect(mockDbManager.get).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM employees WHERE is_active = 1'
      );
    });

    it('should return 0 when no result', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      const result = await repository.getActiveEmployeesCount();

      expect(result).toBe(0);
    });
  });
});