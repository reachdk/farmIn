import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Employee } from '../models/Employee';
import { EmployeeRepository } from '../repositories/EmployeeRepository';

export interface AuthToken {
  token: string;
  refreshToken: string;
  expiresIn: number;
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface LoginCredentials {
  employeeNumber: string;
  password?: string;
  cardId?: string;
}

export interface TokenPayload {
  employeeId: string;
  employeeNumber: string;
  role: string;
  type: 'access' | 'refresh';
}

export class AuthService {
  private static instance: AuthService;
  private employeeRepository: EmployeeRepository;
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'farm-attendance-secret-key';
  private readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'farm-attendance-refresh-secret';
  private readonly JWT_EXPIRES_IN = '15m';
  private readonly JWT_REFRESH_EXPIRES_IN = '7d';

  private constructor() {
    this.employeeRepository = new EmployeeRepository();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Authenticate employee with credentials
   */
  public async login(credentials: LoginCredentials): Promise<AuthToken> {
    const employee = await this.employeeRepository.findByEmployeeNumber(credentials.employeeNumber);
    
    if (!employee || !employee.isActive) {
      throw new Error('Invalid credentials or inactive employee');
    }

    // For now, we'll use a simple authentication method
    // In production, you'd verify password hash or card ID
    if (credentials.password) {
      // Password-based authentication (for web interface)
      const isValidPassword = await this.verifyPassword(credentials.password, employee.id);
      if (!isValidPassword) {
        throw new Error('Invalid credentials');
      }
    } else if (credentials.cardId) {
      // Card-based authentication (for kiosk)
      // For now, we'll assume card ID matches employee number
      if (credentials.cardId !== employee.employeeNumber) {
        throw new Error('Invalid card');
      }
    } else {
      throw new Error('Password or card ID required');
    }

    return this.generateTokens(employee);
  }

  /**
   * Refresh access token using refresh token
   */
  public async refreshToken(refreshToken: string): Promise<AuthToken> {
    try {
      const payload = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET) as TokenPayload;
      
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      const employee = await this.employeeRepository.findById(payload.employeeId);
      if (!employee || !employee.isActive) {
        throw new Error('Employee not found or inactive');
      }

      return this.generateTokens(employee);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Verify access token
   */
  public async verifyToken(token: string): Promise<TokenPayload> {
    try {
      const payload = jwt.verify(token, this.JWT_SECRET) as TokenPayload;
      
      if (payload.type !== 'access') {
        throw new Error('Invalid token type');
      }

      // Verify employee still exists and is active
      const employee = await this.employeeRepository.findById(payload.employeeId);
      if (!employee || !employee.isActive) {
        throw new Error('Employee not found or inactive');
      }

      return payload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Generate access and refresh tokens
   */
  private generateTokens(employee: Employee): AuthToken {
    const payload: Omit<TokenPayload, 'type'> = {
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      role: employee.role
    };

    const accessToken = jwt.sign(
      { ...payload, type: 'access' },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { ...payload, type: 'refresh' },
      this.JWT_REFRESH_SECRET,
      { expiresIn: this.JWT_REFRESH_EXPIRES_IN }
    );

    return {
      token: accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
      employee: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        role: employee.role
      }
    };
  }

  /**
   * Verify password (placeholder implementation)
   */
  private async verifyPassword(password: string, employeeId: string): Promise<boolean> {
    // For now, we'll use a simple default password system
    // In production, you'd store hashed passwords in the database
    const defaultPassword = 'farm123';
    return password === defaultPassword;
  }

  /**
   * Hash password for storage
   */
  public async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify hashed password
   */
  public async verifyHashedPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}