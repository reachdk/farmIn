import express, { Request, Response } from 'express';
import { AuthService, LoginCredentials } from '../services/AuthService';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();
const authService = AuthService.getInstance();

/**
 * POST /api/auth/login
 * Authenticate employee and return JWT tokens
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const credentials: LoginCredentials = req.body;

    // Validate required fields
    if (!credentials.employeeNumber) {
      res.status(400).json({
        error: 'Employee number is required',
        code: 'MISSING_EMPLOYEE_NUMBER'
      });
      return;
    }

    if (!credentials.password && !credentials.cardId) {
      res.status(400).json({
        error: 'Password or card ID is required',
        code: 'MISSING_CREDENTIALS'
      });
      return;
    }

    const authToken = await authService.login(credentials);

    res.status(200).json({
      success: true,
      data: authToken,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    
    res.status(401).json({
      error: error instanceof Error ? error.message : 'Login failed',
      code: 'LOGIN_FAILED'
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'Refresh token is required',
        code: 'MISSING_REFRESH_TOKEN'
      });
      return;
    }

    const authToken = await authService.refreshToken(refreshToken);

    res.status(200).json({
      success: true,
      data: authToken,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    
    res.status(401).json({
      error: error instanceof Error ? error.message : 'Token refresh failed',
      code: 'REFRESH_FAILED'
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal, server-side could implement token blacklisting)
 */
router.post('/logout', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    // In a more sophisticated implementation, you might:
    // 1. Add the token to a blacklist
    // 2. Store logout timestamp
    // 3. Invalidate refresh tokens
    
    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    
    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_FAILED'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'User not authenticated',
        code: 'NOT_AUTHENTICATED'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        employeeId: req.user.employeeId,
        employeeNumber: req.user.employeeNumber,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Get user info error:', error);
    
    res.status(500).json({
      error: 'Failed to get user information',
      code: 'USER_INFO_FAILED'
    });
  }
});

/**
 * POST /api/auth/verify
 * Verify if a token is valid
 */
router.post('/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        error: 'Token is required',
        code: 'MISSING_TOKEN'
      });
      return;
    }

    const payload = await authService.verifyToken(token);

    res.status(200).json({
      success: true,
      data: {
        valid: true,
        payload: {
          employeeId: payload.employeeId,
          employeeNumber: payload.employeeNumber,
          role: payload.role
        }
      }
    });
  } catch (error) {
    res.status(200).json({
      success: true,
      data: {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid token'
      }
    });
  }
});

export default router;