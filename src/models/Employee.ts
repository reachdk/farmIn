export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  role: 'employee' | 'manager' | 'admin';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSyncAt?: Date;
}

export interface CreateEmployeeData {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  role?: 'employee' | 'manager' | 'admin';
}

export interface UpdateEmployeeData {
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: 'employee' | 'manager' | 'admin';
  isActive?: boolean;
}

export class EmployeeValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'EmployeeValidationError';
  }
}

export class EmployeeValidator {
  static validateCreate(data: CreateEmployeeData): void {
    if (!data.employeeNumber?.trim()) {
      throw new EmployeeValidationError('Employee number is required', 'employeeNumber');
    }

    if (!/^[A-Z0-9]{3,10}$/.test(data.employeeNumber.trim())) {
      throw new EmployeeValidationError(
        'Employee number must be 3-10 characters, alphanumeric uppercase only',
        'employeeNumber'
      );
    }

    if (!data.firstName?.trim()) {
      throw new EmployeeValidationError('First name is required', 'firstName');
    }

    if (data.firstName.trim().length < 2 || data.firstName.trim().length > 50) {
      throw new EmployeeValidationError('First name must be 2-50 characters', 'firstName');
    }

    if (!data.lastName?.trim()) {
      throw new EmployeeValidationError('Last name is required', 'lastName');
    }

    if (data.lastName.trim().length < 2 || data.lastName.trim().length > 50) {
      throw new EmployeeValidationError('Last name must be 2-50 characters', 'lastName');
    }

    if (data.email && !this.isValidEmail(data.email)) {
      throw new EmployeeValidationError('Invalid email format', 'email');
    }

    if (data.role && !['employee', 'manager', 'admin'].includes(data.role)) {
      throw new EmployeeValidationError('Invalid role', 'role');
    }
  }

  static validateUpdate(data: UpdateEmployeeData): void {
    if (data.employeeNumber !== undefined) {
      if (!data.employeeNumber?.trim()) {
        throw new EmployeeValidationError('Employee number cannot be empty', 'employeeNumber');
      }

      if (!/^[A-Z0-9]{3,10}$/.test(data.employeeNumber.trim())) {
        throw new EmployeeValidationError(
          'Employee number must be 3-10 characters, alphanumeric uppercase only',
          'employeeNumber'
        );
      }
    }

    if (data.firstName !== undefined) {
      if (!data.firstName?.trim()) {
        throw new EmployeeValidationError('First name cannot be empty', 'firstName');
      }

      if (data.firstName.trim().length < 2 || data.firstName.trim().length > 50) {
        throw new EmployeeValidationError('First name must be 2-50 characters', 'firstName');
      }
    }

    if (data.lastName !== undefined) {
      if (!data.lastName?.trim()) {
        throw new EmployeeValidationError('Last name cannot be empty', 'lastName');
      }

      if (data.lastName.trim().length < 2 || data.lastName.trim().length > 50) {
        throw new EmployeeValidationError('Last name must be 2-50 characters', 'lastName');
      }
    }

    if (data.email !== undefined && data.email && !this.isValidEmail(data.email)) {
      throw new EmployeeValidationError('Invalid email format', 'email');
    }

    if (data.role && !['employee', 'manager', 'admin'].includes(data.role)) {
      throw new EmployeeValidationError('Invalid role', 'role');
    }
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}