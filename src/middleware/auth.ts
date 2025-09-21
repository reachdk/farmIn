import { Request, Response, NextFunction } from 'express';
import { AuthService, TokenPayload } from '../services/AuthService';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: TokenPayload;
}

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
      return;
    }

    const authService = AuthService.getInstance();
    const payload = await authService.verifyToken(token);
    
    req.user = payload;
    next();
  } catch (error) {
    res.status(403).json({
      error: 'Invalid or expired token',
      code: 'TOKEN_INVALID'
    });
  }
};

/**
 * Middleware to authorize specific roles
 */
export const authorizeRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: roles,
        current: req.user.role
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to authorize employee access (can access own data or manager/admin can access any)
 */
export const authorizeEmployeeAccess = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  const targetEmployeeId = req.params.employeeId || req.body.employeeId;
  const isOwnData = req.user.employeeId === targetEmployeeId;
  const isManagerOrAdmin = ['manager', 'admin'].includes(req.user.role);

  if (!isOwnData && !isManagerOrAdmin) {
    res.status(403).json({
      error: 'Can only access own data or require manager/admin role',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
    return;
  }

  next();
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const authService = AuthService.getInstance();
      const payload = await authService.verifyToken(token);
      req.user = payload;
    }
  } catch (error) {
    // Ignore authentication errors for optional auth
  }
  
  next();
};