import { DatabaseManager } from '../database/DatabaseManager';
import { Employee, CreateEmployeeData, UpdateEmployeeData, EmployeeValidator } from '../models/Employee';
import { randomUUID } from 'crypto';

export class EmployeeNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Employee not found: ${identifier}`);
    this.name = 'EmployeeNotFoundError';
  }
}

export class EmployeeDuplicateError extends Error {
  constructor(field: string, value: string) {
    super(`Employee with ${field} '${value}' already exists`);
    this.name = 'EmployeeDuplicateError';
  }
}

export interface EmployeeFilters {
  role?: 'employee' | 'manager' | 'admin';
  isActive?: boolean;
  search?: string; // Search in name or employee number
}

export class EmployeeRepository {
  private dbManager: DatabaseManager;

  constructor() {
    this.dbManager = DatabaseManager.getInstance();
  }

  async create(data: CreateEmployeeData): Promise<Employee> {
    EmployeeValidator.validateCreate(data);

    // Check for duplicate employee number
    const existingByNumber = await this.findByEmployeeNumber(data.employeeNumber);
    if (existingByNumber) {
      throw new EmployeeDuplicateError('employee number', data.employeeNumber);
    }

    // Check for duplicate email if provided
    if (data.email) {
      const existingByEmail = await this.findByEmail(data.email);
      if (existingByEmail) {
        throw new EmployeeDuplicateError('email', data.email);
      }
    }

    const employee: Employee = {
      id: randomUUID(),
      employeeNumber: data.employeeNumber.trim().toUpperCase(),
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: data.email?.trim() || undefined,
      role: data.role || 'employee',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSyncAt: undefined
    };

    const sql = `
      INSERT INTO employees (
        id, employee_number, first_name, last_name, email, role, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.dbManager.run(sql, [
      employee.id,
      employee.employeeNumber,
      employee.firstName,
      employee.lastName,
      employee.email,
      employee.role,
      employee.isActive ? 1 : 0,
      employee.createdAt.toISOString(),
      employee.updatedAt.toISOString()
    ]);

    return employee;
  }

  async findById(id: string): Promise<Employee | null> {
    const sql = 'SELECT * FROM employees WHERE id = ?';
    const row = await this.dbManager.get<any>(sql, [id]);
    return row ? this.mapRowToEmployee(row) : null;
  }

  async findByEmployeeNumber(employeeNumber: string): Promise<Employee | null> {
    const sql = 'SELECT * FROM employees WHERE employee_number = ?';
    const row = await this.dbManager.get<any>(sql, [employeeNumber.toUpperCase()]);
    return row ? this.mapRowToEmployee(row) : null;
  }

  async findByEmail(email: string): Promise<Employee | null> {
    const sql = 'SELECT * FROM employees WHERE email = ?';
    const row = await this.dbManager.get<any>(sql, [email.toLowerCase()]);
    return row ? this.mapRowToEmployee(row) : null;
  }

  async findAll(filters?: EmployeeFilters): Promise<Employee[]> {
    let sql = 'SELECT * FROM employees WHERE 1=1';
    const params: any[] = [];

    if (filters?.role) {
      sql += ' AND role = ?';
      params.push(filters.role);
    }

    if (filters?.isActive !== undefined) {
      sql += ' AND is_active = ?';
      params.push(filters.isActive ? 1 : 0);
    }

    if (filters?.search) {
      sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR employee_number LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY last_name, first_name';

    const rows = await this.dbManager.all<any>(sql, params);
    return rows.map(row => this.mapRowToEmployee(row));
  }

  async update(id: string, data: UpdateEmployeeData): Promise<Employee> {
    EmployeeValidator.validateUpdate(data);

    const existing = await this.findById(id);
    if (!existing) {
      throw new EmployeeNotFoundError(id);
    }

    // Check for duplicate employee number if being updated
    if (data.employeeNumber && data.employeeNumber !== existing.employeeNumber) {
      const existingByNumber = await this.findByEmployeeNumber(data.employeeNumber);
      if (existingByNumber) {
        throw new EmployeeDuplicateError('employee number', data.employeeNumber);
      }
    }

    // Check for duplicate email if being updated
    if (data.email && data.email !== existing.email) {
      const existingByEmail = await this.findByEmail(data.email);
      if (existingByEmail) {
        throw new EmployeeDuplicateError('email', data.email);
      }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.employeeNumber !== undefined) {
      updates.push('employee_number = ?');
      params.push(data.employeeNumber.trim().toUpperCase());
    }

    if (data.firstName !== undefined) {
      updates.push('first_name = ?');
      params.push(data.firstName.trim());
    }

    if (data.lastName !== undefined) {
      updates.push('last_name = ?');
      params.push(data.lastName.trim());
    }

    if (data.email !== undefined) {
      updates.push('email = ?');
      params.push(data.email?.trim() || null);
    }

    if (data.role !== undefined) {
      updates.push('role = ?');
      params.push(data.role);
    }

    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(data.isActive ? 1 : 0);
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());

    params.push(id);

    const sql = `UPDATE employees SET ${updates.join(', ')} WHERE id = ?`;
    await this.dbManager.run(sql, params);

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Failed to retrieve updated employee');
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new EmployeeNotFoundError(id);
    }

    // Soft delete by setting isActive to false
    await this.update(id, { isActive: false });
  }

  async hardDelete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new EmployeeNotFoundError(id);
    }

    const sql = 'DELETE FROM employees WHERE id = ?';
    await this.dbManager.run(sql, [id]);
  }

  async authenticate(employeeNumber: string): Promise<Employee | null> {
    const employee = await this.findByEmployeeNumber(employeeNumber);
    return employee && employee.isActive ? employee : null;
  }

  async getEmployeesByRole(role: 'employee' | 'manager' | 'admin'): Promise<Employee[]> {
    return this.findAll({ role, isActive: true });
  }

  async getActiveEmployeesCount(): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM employees WHERE is_active = 1';
    const result = await this.dbManager.get<{ count: number }>(sql);
    return result?.count || 0;
  }

  private mapRowToEmployee(row: any): Employee {
    return {
      id: row.id,
      employeeNumber: row.employee_number,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email || undefined,
      role: row.role,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at) : undefined
    };
  }
}