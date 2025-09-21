import express, { Request, Response } from 'express';
import { AttendanceRepository } from '../repositories/AttendanceRepository';
import { TimeCategoryRepository } from '../repositories/TimeCategoryRepository';
import { EmployeeRepository } from '../repositories/EmployeeRepository';
import { authenticateToken, authorizeEmployeeAccess } from '../middleware/auth';
import { AttendanceRecord, AttendanceCalculator } from '../models/AttendanceRecord';

const router = express.Router();
const attendanceRepository = new AttendanceRepository();
const timeCategoryRepository = new TimeCategoryRepository();
const employeeRepository = new EmployeeRepository();

/**
 * POST /api/attendance/clock-in
 * Clock in an employee
 */
router.post('/clock-in', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.body;
    const requestingUserId = req.user?.employeeId;

    // Use authenticated user's ID if not provided or if employee is clocking themselves in
    const targetEmployeeId = employeeId || requestingUserId;

    if (!targetEmployeeId) {
      res.status(400).json({
        error: 'Employee ID is required',
        code: 'MISSING_EMPLOYEE_ID'
      });
      return;
    }

    // Check if user can clock in for this employee
    const isOwnClockIn = requestingUserId === targetEmployeeId;
    const isManagerOrAdmin = req.user && ['manager', 'admin'].includes(req.user.role);

    if (!isOwnClockIn && !isManagerOrAdmin) {
      res.status(403).json({
        error: 'Can only clock in for yourself or require manager/admin role',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
      return;
    }

    // Verify employee exists and is active
    const employee = await employeeRepository.findById(targetEmployeeId);
    if (!employee || !employee.isActive) {
      res.status(404).json({
        error: 'Employee not found or inactive',
        code: 'EMPLOYEE_NOT_FOUND'
      });
      return;
    }

    // Check if employee is already clocked in
    const currentShift = await attendanceRepository.getCurrentShift(targetEmployeeId);
    if (currentShift) {
      res.status(409).json({
        error: 'Employee is already clocked in',
        code: 'ALREADY_CLOCKED_IN',
        data: {
          currentShift: {
            id: currentShift.id,
            clockInTime: currentShift.clockInTime,
            elapsedHours: AttendanceCalculator.calculateElapsedTime(currentShift.clockInTime)
          }
        }
      });
      return;
    }

    // Create clock in record
    const clockInTime = new Date();
    const attendanceRecord = await attendanceRepository.clockIn({
      employeeId: targetEmployeeId,
      clockInTime
    });

    res.status(201).json({
      success: true,
      data: {
        id: attendanceRecord.id,
        employeeId: attendanceRecord.employeeId,
        clockInTime: attendanceRecord.clockInTime,
        status: 'clocked_in'
      },
      message: 'Successfully clocked in'
    });
  } catch (error) {
    console.error('Clock in error:', error);
    
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Clock in failed',
      code: 'CLOCK_IN_FAILED'
    });
  }
});

/**
 * POST /api/attendance/clock-out
 * Clock out an employee
 */
router.post('/clock-out', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.body;
    const requestingUserId = req.user?.employeeId;

    // Use authenticated user's ID if not provided or if employee is clocking themselves out
    const targetEmployeeId = employeeId || requestingUserId;

    if (!targetEmployeeId) {
      res.status(400).json({
        error: 'Employee ID is required',
        code: 'MISSING_EMPLOYEE_ID'
      });
      return;
    }

    // Check if user can clock out for this employee
    const isOwnClockOut = requestingUserId === targetEmployeeId;
    const isManagerOrAdmin = req.user && ['manager', 'admin'].includes(req.user.role);

    if (!isOwnClockOut && !isManagerOrAdmin) {
      res.status(403).json({
        error: 'Can only clock out for yourself or require manager/admin role',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
      return;
    }

    // Verify employee exists and is active
    const employee = await employeeRepository.findById(targetEmployeeId);
    if (!employee || !employee.isActive) {
      res.status(404).json({
        error: 'Employee not found or inactive',
        code: 'EMPLOYEE_NOT_FOUND'
      });
      return;
    }

    // Check if employee is currently clocked in
    const currentShift = await attendanceRepository.getCurrentShift(targetEmployeeId);
    if (!currentShift) {
      res.status(409).json({
        error: 'Employee is not currently clocked in',
        code: 'NOT_CLOCKED_IN'
      });
      return;
    }

    // Clock out the employee
    const clockOutTime = new Date();
    const attendanceRecord = await attendanceRepository.clockOut(targetEmployeeId, {
      clockOutTime
    });

    // Automatically assign time category based on hours worked
    if (attendanceRecord.totalHours) {
      try {
        const timeCategory = await timeCategoryRepository.getCategoryForHours(attendanceRecord.totalHours);
        if (timeCategory) {
          attendanceRecord.timeCategory = timeCategory.name;
          await attendanceRepository.update(attendanceRecord.id, {
            timeCategory: timeCategory.name
          });
        }
      } catch (categoryError) {
        console.warn('Failed to assign time category:', categoryError);
        // Continue without category assignment - this is not critical
      }
    }

    res.status(200).json({
      success: true,
      data: {
        id: attendanceRecord.id,
        employeeId: attendanceRecord.employeeId,
        clockInTime: attendanceRecord.clockInTime,
        clockOutTime: attendanceRecord.clockOutTime,
        totalHours: attendanceRecord.totalHours,
        timeCategory: attendanceRecord.timeCategory,
        status: 'clocked_out'
      },
      message: 'Successfully clocked out'
    });
  } catch (error) {
    console.error('Clock out error:', error);
    
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Clock out failed',
      code: 'CLOCK_OUT_FAILED'
    });
  }
});

/**
 * GET /api/attendance/current-shift/:employeeId?
 * Get current shift status for an employee
 */
router.get('/current-shift/:employeeId?', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const requestingUserId = req.user?.employeeId;

    // Use authenticated user's ID if not provided
    const targetEmployeeId = employeeId || requestingUserId;

    if (!targetEmployeeId) {
      res.status(400).json({
        error: 'Employee ID is required',
        code: 'MISSING_EMPLOYEE_ID'
      });
      return;
    }

    // Check if user can view this employee's data
    const isOwnData = requestingUserId === targetEmployeeId;
    const isManagerOrAdmin = req.user && ['manager', 'admin'].includes(req.user.role);

    if (!isOwnData && !isManagerOrAdmin) {
      res.status(403).json({
        error: 'Can only view own data or require manager/admin role',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
      return;
    }

    // Get current shift
    const currentShift = await attendanceRepository.getCurrentShift(targetEmployeeId);

    if (!currentShift) {
      res.status(200).json({
        success: true,
        data: {
          employeeId: targetEmployeeId,
          status: 'not_clocked_in',
          currentShift: null
        }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        employeeId: targetEmployeeId,
        status: 'clocked_in',
        currentShift: {
          id: currentShift.id,
          clockInTime: currentShift.clockInTime,
          elapsedHours: AttendanceCalculator.calculateElapsedTime(currentShift.clockInTime)
        }
      }
    });
  } catch (error) {
    console.error('Get current shift error:', error);
    
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get current shift',
      code: 'GET_CURRENT_SHIFT_FAILED'
    });
  }
});

/**
 * GET /api/attendance/history/:employeeId?
 * Get attendance history for an employee with filtering and pagination
 */
router.get('/history/:employeeId?', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const requestingUserId = req.user?.employeeId;

    // Use authenticated user's ID if not provided
    const targetEmployeeId = employeeId || requestingUserId;

    if (!targetEmployeeId) {
      res.status(400).json({
        error: 'Employee ID is required',
        code: 'MISSING_EMPLOYEE_ID'
      });
      return;
    }

    // Check if user can view this employee's data
    const isOwnData = requestingUserId === targetEmployeeId;
    const isManagerOrAdmin = req.user && ['manager', 'admin'].includes(req.user.role);

    if (!isOwnData && !isManagerOrAdmin) {
      res.status(403).json({
        error: 'Can only view own data or require manager/admin role',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
      return;
    }

    // Parse query parameters
    const {
      startDate,
      endDate,
      includeIncomplete = 'true',
      page = '1',
      limit = '50'
    } = req.query;

    const filters: any = {
      employeeId: targetEmployeeId
    };

    if (startDate) {
      filters.startDate = new Date(startDate as string);
    }

    if (endDate) {
      filters.endDate = new Date(endDate as string);
    }

    if (includeIncomplete === 'false') {
      filters.includeIncomplete = false;
    }

    // Get attendance records
    const allRecords = await attendanceRepository.findAll(filters);

    // Apply pagination
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;
    const paginatedRecords = allRecords.slice(offset, offset + limitNum);

    res.status(200).json({
      success: true,
      data: {
        records: paginatedRecords.map(record => ({
          id: record.id,
          employeeId: record.employeeId,
          clockInTime: record.clockInTime,
          clockOutTime: record.clockOutTime,
          totalHours: record.totalHours,
          timeCategory: record.timeCategory,
          notes: record.notes,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          syncStatus: record.syncStatus
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: allRecords.length,
          totalPages: Math.ceil(allRecords.length / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Get attendance history error:', error);
    
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get attendance history',
      code: 'GET_HISTORY_FAILED'
    });
  }
});

/**
 * GET /api/attendance/summary/:employeeId?
 * Get attendance summary for an employee within a date range
 */
router.get('/summary/:employeeId?', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const requestingUserId = req.user?.employeeId;

    // Use authenticated user's ID if not provided
    const targetEmployeeId = employeeId || requestingUserId;

    if (!targetEmployeeId) {
      res.status(400).json({
        error: 'Employee ID is required',
        code: 'MISSING_EMPLOYEE_ID'
      });
      return;
    }

    // Check if user can view this employee's data
    const isOwnData = requestingUserId === targetEmployeeId;
    const isManagerOrAdmin = req.user && ['manager', 'admin'].includes(req.user.role);

    if (!isOwnData && !isManagerOrAdmin) {
      res.status(403).json({
        error: 'Can only view own data or require manager/admin role',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
      return;
    }

    // Parse query parameters
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({
        error: 'Start date and end date are required',
        code: 'MISSING_DATE_RANGE'
      });
      return;
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (start >= end) {
      res.status(400).json({
        error: 'Start date must be before end date',
        code: 'INVALID_DATE_RANGE'
      });
      return;
    }

    // Get attendance summary
    const summary = await attendanceRepository.getAttendanceSummary(targetEmployeeId, start, end);

    res.status(200).json({
      success: true,
      data: {
        employeeId: targetEmployeeId,
        dateRange: {
          startDate: start,
          endDate: end
        },
        summary
      }
    });
  } catch (error) {
    console.error('Get attendance summary error:', error);
    
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get attendance summary',
      code: 'GET_SUMMARY_FAILED'
    });
  }
});

/**
 * GET /api/attendance/dashboard
 * Get dashboard data for managers/admins (all employees' current status)
 */
router.get('/dashboard', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    // Only managers and admins can access dashboard
    if (!req.user || !['manager', 'admin'].includes(req.user.role)) {
      res.status(403).json({
        error: 'Manager or admin role required',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
      return;
    }

    // Get all active employees
    const employees = await employeeRepository.findAll({ isActive: true });

    // Get current shift status for each employee
    const dashboardData = await Promise.all(
      employees.map(async (employee) => {
        const currentShift = await attendanceRepository.getCurrentShift(employee.id);
        
        return {
          employee: {
            id: employee.id,
            employeeNumber: employee.employeeNumber,
            firstName: employee.firstName,
            lastName: employee.lastName,
            role: employee.role
          },
          currentShift: currentShift ? {
            id: currentShift.id,
            clockInTime: currentShift.clockInTime,
            elapsedHours: AttendanceCalculator.calculateElapsedTime(currentShift.clockInTime)
          } : null,
          status: currentShift ? 'clocked_in' : 'not_clocked_in'
        };
      })
    );

    // Calculate summary statistics
    const totalEmployees = employees.length;
    const clockedInCount = dashboardData.filter(item => item.status === 'clocked_in').length;
    const clockedOutCount = totalEmployees - clockedInCount;

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalEmployees,
          clockedIn: clockedInCount,
          clockedOut: clockedOutCount
        },
        employees: dashboardData
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get dashboard data',
      code: 'GET_DASHBOARD_FAILED'
    });
  }
});

/**
 * GET /api/attendance/reports/daily
 * Get daily attendance report for a specific date
 */
router.get('/reports/daily', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    // Only managers and admins can access reports
    if (!req.user || !['manager', 'admin'].includes(req.user.role)) {
      res.status(403).json({
        error: 'Manager or admin role required',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
      return;
    }

    const { date } = req.query;

    if (!date) {
      res.status(400).json({
        error: 'Date is required',
        code: 'MISSING_DATE'
      });
      return;
    }

    const reportDate = new Date(date as string);
    const startOfDay = new Date(reportDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(reportDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all attendance records for the date
    const records = await attendanceRepository.findAll({
      startDate: startOfDay,
      endDate: endOfDay,
      includeIncomplete: true
    });

    // Group by employee
    const employeeRecords = new Map();
    
    for (const record of records) {
      if (!employeeRecords.has(record.employeeId)) {
        const employee = await employeeRepository.findById(record.employeeId);
        employeeRecords.set(record.employeeId, {
          employee: employee ? {
            id: employee.id,
            employeeNumber: employee.employeeNumber,
            firstName: employee.firstName,
            lastName: employee.lastName
          } : null,
          records: []
        });
      }
      employeeRecords.get(record.employeeId).records.push(record);
    }

    // Calculate totals
    let totalHours = 0;
    let completedShifts = 0;
    let incompleteShifts = 0;

    const employeeData = Array.from(employeeRecords.values()).map(item => {
      const dayTotalHours = item.records.reduce((sum: number, record: any) => {
        if (record.totalHours) {
          completedShifts++;
          return sum + record.totalHours;
        } else {
          incompleteShifts++;
          return sum;
        }
      }, 0);

      totalHours += dayTotalHours;

      return {
        employee: item.employee,
        records: item.records.map((record: any) => ({
          id: record.id,
          clockInTime: record.clockInTime,
          clockOutTime: record.clockOutTime,
          totalHours: record.totalHours,
          timeCategory: record.timeCategory,
          status: record.clockOutTime ? 'completed' : 'in_progress'
        })),
        totalHours: Math.round(dayTotalHours * 100) / 100
      };
    });

    res.status(200).json({
      success: true,
      data: {
        date: reportDate,
        summary: {
          totalEmployees: employeeData.length,
          totalHours: Math.round(totalHours * 100) / 100,
          completedShifts,
          incompleteShifts
        },
        employees: employeeData
      }
    });
  } catch (error) {
    console.error('Get daily report error:', error);
    
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get daily report',
      code: 'GET_DAILY_REPORT_FAILED'
    });
  }
});

export default router;