import { EmployeeValidator, EmployeeValidationError, CreateEmployeeData, UpdateEmployeeData } from '../../models/Employee';

describe('EmployeeValidator', () => {
  describe('validateCreate', () => {
    const validData: CreateEmployeeData = {
      employeeNumber: 'EMP001',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      role: 'employee'
    };

    it('should validate valid employee data', () => {
      expect(() => EmployeeValidator.validateCreate(validData)).not.toThrow();
    });

    it('should validate without optional fields', () => {
      const minimalData: CreateEmployeeData = {
        employeeNumber: 'EMP001',
        firstName: 'John',
        lastName: 'Doe'
      };
      expect(() => EmployeeValidator.validateCreate(minimalData)).not.toThrow();
    });

    describe('employeeNumber validation', () => {
      it('should reject empty employee number', () => {
        const data = { ...validData, employeeNumber: '' };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('Employee number is required', 'employeeNumber'));
      });

      it('should reject employee number with spaces only', () => {
        const data = { ...validData, employeeNumber: '   ' };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('Employee number is required', 'employeeNumber'));
      });

      it('should reject employee number too short', () => {
        const data = { ...validData, employeeNumber: 'AB' };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('Employee number must be 3-10 characters, alphanumeric uppercase only', 'employeeNumber'));
      });

      it('should reject employee number too long', () => {
        const data = { ...validData, employeeNumber: 'ABCDEFGHIJK' };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('Employee number must be 3-10 characters, alphanumeric uppercase only', 'employeeNumber'));
      });

      it('should reject employee number with lowercase', () => {
        const data = { ...validData, employeeNumber: 'emp001' };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('Employee number must be 3-10 characters, alphanumeric uppercase only', 'employeeNumber'));
      });

      it('should reject employee number with special characters', () => {
        const data = { ...validData, employeeNumber: 'EMP-001' };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('Employee number must be 3-10 characters, alphanumeric uppercase only', 'employeeNumber'));
      });

      it('should accept valid alphanumeric uppercase employee numbers', () => {
        const validNumbers = ['EMP001', 'ABC123', 'FARM99', '123ABC'];
        validNumbers.forEach(number => {
          const data = { ...validData, employeeNumber: number };
          expect(() => EmployeeValidator.validateCreate(data)).not.toThrow();
        });
      });
    });

    describe('firstName validation', () => {
      it('should reject empty first name', () => {
        const data = { ...validData, firstName: '' };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('First name is required', 'firstName'));
      });

      it('should reject first name too short', () => {
        const data = { ...validData, firstName: 'J' };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('First name must be 2-50 characters', 'firstName'));
      });

      it('should reject first name too long', () => {
        const data = { ...validData, firstName: 'A'.repeat(51) };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('First name must be 2-50 characters', 'firstName'));
      });

      it('should accept valid first names', () => {
        const validNames = ['Jo', 'John', 'Mary-Jane', "O'Connor"];
        validNames.forEach(name => {
          const data = { ...validData, firstName: name };
          expect(() => EmployeeValidator.validateCreate(data)).not.toThrow();
        });
      });
    });

    describe('lastName validation', () => {
      it('should reject empty last name', () => {
        const data = { ...validData, lastName: '' };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('Last name is required', 'lastName'));
      });

      it('should reject last name too short', () => {
        const data = { ...validData, lastName: 'D' };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('Last name must be 2-50 characters', 'lastName'));
      });

      it('should reject last name too long', () => {
        const data = { ...validData, lastName: 'A'.repeat(51) };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('Last name must be 2-50 characters', 'lastName'));
      });
    });

    describe('email validation', () => {
      it('should accept valid email addresses', () => {
        const validEmails = [
          'test@example.com',
          'user.name@domain.co.uk',
          'user+tag@example.org'
        ];
        validEmails.forEach(email => {
          const data = { ...validData, email };
          expect(() => EmployeeValidator.validateCreate(data)).not.toThrow();
        });
      });

      it('should reject invalid email addresses', () => {
        const invalidEmails = [
          'invalid-email',
          '@example.com',
          'user@',
          'user@domain',
          'user name@example.com'
        ];
        invalidEmails.forEach(email => {
          const data = { ...validData, email };
          expect(() => EmployeeValidator.validateCreate(data))
            .toThrow(new EmployeeValidationError('Invalid email format', 'email'));
        });
      });
    });

    describe('role validation', () => {
      it('should accept valid roles', () => {
        const validRoles: Array<'employee' | 'manager' | 'admin'> = ['employee', 'manager', 'admin'];
        validRoles.forEach(role => {
          const data = { ...validData, role };
          expect(() => EmployeeValidator.validateCreate(data)).not.toThrow();
        });
      });

      it('should reject invalid roles', () => {
        const data = { ...validData, role: 'invalid' as any };
        expect(() => EmployeeValidator.validateCreate(data))
          .toThrow(new EmployeeValidationError('Invalid role', 'role'));
      });
    });
  });

  describe('validateUpdate', () => {
    it('should validate valid update data', () => {
      const updateData: UpdateEmployeeData = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com'
      };
      expect(() => EmployeeValidator.validateUpdate(updateData)).not.toThrow();
    });

    it('should validate empty update data', () => {
      expect(() => EmployeeValidator.validateUpdate({})).not.toThrow();
    });

    it('should validate partial updates', () => {
      const partialUpdates = [
        { firstName: 'Jane' },
        { lastName: 'Smith' },
        { email: 'new@example.com' },
        { role: 'manager' as const },
        { isActive: false }
      ];

      partialUpdates.forEach(update => {
        expect(() => EmployeeValidator.validateUpdate(update)).not.toThrow();
      });
    });

    it('should reject invalid field values in updates', () => {
      const invalidUpdates = [
        { firstName: '' },
        { lastName: 'A' },
        { email: 'invalid-email' },
        { employeeNumber: 'abc' },
        { role: 'invalid' as any }
      ];

      invalidUpdates.forEach(update => {
        expect(() => EmployeeValidator.validateUpdate(update)).toThrow(EmployeeValidationError);
      });
    });

    it('should allow clearing email with empty string', () => {
      const updateData: UpdateEmployeeData = { email: '' };
      expect(() => EmployeeValidator.validateUpdate(updateData)).not.toThrow();
    });
  });
});