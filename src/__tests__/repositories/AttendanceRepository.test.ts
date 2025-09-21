import {
  AttendanceRepository,
  AttendanceNotFoundError,
  EmployeeAlreadyClockedInError,
  EmployeeNotClockedInError
} from '../../repositories/AttendanceRepository';
import { DatabaseManager } from '../../database/DatabaseManager';
import { CreateAttendanceRecordData, ClockOutData, UpdateAttendanceRecordData } from '../../models/AttendanceRecord';

// Mock the DatabaseManager
jest.mock('../../database/DatabaseManager');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-123')
}));

describe('AttendanceRepository', () => {
  let repository: AttendanceRepository;
  let mockDbManager: jest.Mocked<DatabaseManager>;

  const mockAttendanceRow = {
    id: 'mock-uuid-123',
    employee_id: 'emp-123',
    clock_in_time: '2023-01-01T09:00:00.000Z',
    clock_out_time: '2023-01-01T17:00:00.000Z',
    total_hours: 8,
    time_category: 'full-day',
    notes: 'Regular shift',
    created_at: '2023-01-01T09:00:00.000Z',
    updated_at: '2023-01-01T17:00:00.000Z',
    sync_status: 'pending'
  };

  const mockActiveShiftRow = {
    ...mockAttendanceRow,
    clock_out_time: null,
    total_hours: null,
    time_category: null
  };

  const mockTimeCategories = [
    { id: 'half-day', name: 'Half Day', min_hours: 4, max_hours: 7.99 },
    { id: 'full-day', name: 'Full Day', min_hours: 8, max_hours: null }
  ];

  beforeEach(() => {
    mockDbManager = {
      run: jest.fn().mockResolvedValue({ changes: 1, lastID: 1 } as any),
      get: jest.fn(),
      all: jest.fn(),
      withTransaction: jest.fn().mockImplementation(async (callback) => await callback())
    } as any;

    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDbManager);
    repository = new AttendanceRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('clockIn', () => {
    const validClockInData: CreateAttendanceRecordData = {
      employeeId: 'emp-123',
      notes: 'Starting work'
    };

    it('should clock in employee successfully', async () => {
      mockDbManager.get.mockResolvedValueOnce(null); // No current shift
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);

      const result = await repository.clockIn(validClockInData);

      expect(result).toMatchObject({
        id: 'mock-uuid-123',
        employeeId: 'emp-123',
        notes: 'Starting work',
        clockOutTime: undefined,
        totalHours: undefined
      });

      expect(mockDbManager.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO attendance_records'),
        expect.arrayContaining(['mock-uuid-123', 'emp-123'])
      );
    });

    it('should use current time when clockInTime not provided', async () => {
      const dataWithoutTime = { employeeId: 'emp-123' };
      mockDbManager.get.mockResolvedValueOnce(null);
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);

      const result = await repository.clockIn(dataWithoutTime);

      expect(result.clockInTime).toBeInstanceOf(Date);
      expect(result.clockInTime.getTime()).toBeCloseTo(Date.now(), -2); // Within 2 seconds
    });

    it('should throw error when employee already clocked in', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockActiveShiftRow); // Current shift exists
      mockDbManager.all.mockResolvedValueOnce([]); // No adjustments

      await expect(repository.clockIn(validClockInData))
        .rejects.toThrow(new EmployeeAlreadyClockedInError('emp-123'));
    });

    it('should throw validation error for invalid data', async () => {
      const invalidData = { employeeId: '' };

      await expect(repository.clockIn(invalidData))
        .rejects.toThrow('Employee ID is required');
    });
  });

  describe('clockOut', () => {
    const validClockOutData: ClockOutData = {
      notes: 'End of shift'
    };

    it('should clock out employee successfully', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockActiveShiftRow); // Current shift
      mockDbManager.all.mockResolvedValueOnce([]); // No adjustments for current shift
      mockDbManager.all.mockResolvedValueOnce(mockTimeCategories); // Time categories
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);
      mockDbManager.get.mockResolvedValueOnce(mockAttendanceRow); // Updated record
      mockDbManager.all.mockResolvedValueOnce([]); // No adjustments for updated record

      const result = await repository.clockOut('emp-123', validClockOutData);

      expect(result.clockOutTime).toBeInstanceOf(Date);
      expect(result.totalHours).toBeGreaterThan(0);
      expect(mockDbManager.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE attendance_records'),
        expect.arrayContaining([expect.any(String), expect.any(Number)])
      );
    });

    it('should use current time when clockOutTime not provided', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockActiveShiftRow);
      mockDbManager.all.mockResolvedValueOnce([]);
      mockDbManager.all.mockResolvedValueOnce(mockTimeCategories);
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);
      mockDbManager.get.mockResolvedValueOnce(mockAttendanceRow);
      mockDbManager.all.mockResolvedValueOnce([]);

      const result = await repository.clockOut('emp-123');

      expect(result.clockOutTime).toBeInstanceOf(Date);
    });

    it('should throw error when employee not clocked in', async () => {
      mockDbManager.get.mockResolvedValueOnce(null); // No current shift

      await expect(repository.clockOut('emp-123', validClockOutData))
        .rejects.toThrow(new EmployeeNotClockedInError('emp-123'));
    });

    it('should determine time category based on hours worked', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockActiveShiftRow);
      mockDbManager.all.mockResolvedValueOnce([]);
      mockDbManager.all.mockResolvedValueOnce(mockTimeCategories);
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);
      mockDbManager.get.mockResolvedValueOnce({ ...mockAttendanceRow, time_category: 'full-day' });
      mockDbManager.all.mockResolvedValueOnce([]);

      const result = await repository.clockOut('emp-123');

      expect(result.timeCategory).toBe('full-day');
    });
  });

  describe('findById', () => {
    it('should return attendance record when found', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockAttendanceRow);
      mockDbManager.all.mockResolvedValueOnce([]); // No adjustments

      const result = await repository.findById('mock-uuid-123');

      expect(result).toMatchObject({
        id: 'mock-uuid-123',
        employeeId: 'emp-123',
        totalHours: 8,
        timeCategory: 'full-day'
      });
    });

    it('should return null when record not found', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should include adjustments in the result', async () => {
      const mockAdjustments = [{
        id: 'adj-1',
        record_id: 'mock-uuid-123',
        adjusted_by: 'manager-1',
        original_value: '"09:00"',
        new_value: '"09:15"',
        reason: 'Corrected time',
        timestamp: '2023-01-01T18:00:00.000Z'
      }];

      mockDbManager.get.mockResolvedValueOnce(mockAttendanceRow);
      mockDbManager.all.mockResolvedValueOnce(mockAdjustments);

      const result = await repository.findById('mock-uuid-123');

      expect(result?.adjustments).toHaveLength(1);
      expect(result?.adjustments[0]).toMatchObject({
        id: 'adj-1',
        adjustedBy: 'manager-1',
        reason: 'Corrected time'
      });
    });
  });

  describe('findAll', () => {
    const mockRecords = [mockAttendanceRow, { ...mockAttendanceRow, id: 'record-2' }];

    it('should return all records without filters', async () => {
      mockDbManager.all.mockResolvedValueOnce(mockRecords);
      mockDbManager.all.mockResolvedValueOnce([]); // Adjustments for first record
      mockDbManager.all.mockResolvedValueOnce([]); // Adjustments for second record

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM attendance_records WHERE 1=1'),
        []
      );
    });

    it('should filter by employee ID', async () => {
      mockDbManager.all.mockResolvedValueOnce([mockAttendanceRow]);
      mockDbManager.all.mockResolvedValueOnce([]);

      await repository.findAll({ employeeId: 'emp-123' });

      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('AND employee_id = ?'),
        ['emp-123']
      );
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-01-31');

      mockDbManager.all.mockResolvedValueOnce([mockAttendanceRow]);
      mockDbManager.all.mockResolvedValueOnce([]);

      await repository.findAll({ startDate, endDate });

      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('AND clock_in_time >= ?'),
        expect.arrayContaining([startDate.toISOString(), endDate.toISOString()])
      );
    });

    it('should exclude incomplete records when requested', async () => {
      mockDbManager.all.mockResolvedValueOnce([mockAttendanceRow]);
      mockDbManager.all.mockResolvedValueOnce([]);

      await repository.findAll({ includeIncomplete: false });

      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('AND clock_out_time IS NOT NULL'),
        []
      );
    });
  });

  describe('getCurrentShift', () => {
    it('should return current shift when employee is clocked in', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockActiveShiftRow);
      mockDbManager.all.mockResolvedValueOnce([]);

      const result = await repository.getCurrentShift('emp-123');

      expect(result).toMatchObject({
        employeeId: 'emp-123',
        clockOutTime: undefined
      });
    });

    it('should return null when employee is not clocked in', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      const result = await repository.getCurrentShift('emp-123');

      expect(result).toBeNull();
    });
  });

  describe('isEmployeeClockedIn', () => {
    it('should return true when employee is clocked in', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockActiveShiftRow);
      mockDbManager.all.mockResolvedValueOnce([]);

      const result = await repository.isEmployeeClockedIn('emp-123');

      expect(result).toBe(true);
    });

    it('should return false when employee is not clocked in', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      const result = await repository.isEmployeeClockedIn('emp-123');

      expect(result).toBe(false);
    });
  });

  describe('update', () => {
    const updateData: UpdateAttendanceRecordData = {
      clockInTime: new Date('2023-01-01T09:15:00Z'),
      notes: 'Updated notes'
    };

    it('should update attendance record successfully', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockAttendanceRow); // findById for existing check
      mockDbManager.all.mockResolvedValueOnce([]); // adjustments for existing record
      mockDbManager.all.mockResolvedValueOnce(mockTimeCategories); // time categories
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);
      mockDbManager.get.mockResolvedValueOnce({ ...mockAttendanceRow, notes: 'Updated notes' }); // updated record
      mockDbManager.all.mockResolvedValueOnce([]); // adjustments for updated record

      const result = await repository.update('mock-uuid-123', updateData);

      expect(result.notes).toBe('Updated notes');
      expect(mockDbManager.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE attendance_records SET'),
        expect.arrayContaining(['Updated notes'])
      );
    });

    it('should throw error when record not found', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      await expect(repository.update('non-existent', updateData))
        .rejects.toThrow(new AttendanceNotFoundError('non-existent'));
    });

    it('should recalculate total hours when times are updated', async () => {
      const updateWithTimes: UpdateAttendanceRecordData = {
        clockInTime: new Date('2023-01-01T09:00:00Z'),
        clockOutTime: new Date('2023-01-01T18:00:00Z')
      };

      mockDbManager.get.mockResolvedValueOnce(mockAttendanceRow);
      mockDbManager.all.mockResolvedValueOnce([]);
      mockDbManager.all.mockResolvedValueOnce(mockTimeCategories);
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);
      mockDbManager.get.mockResolvedValueOnce({ ...mockAttendanceRow, total_hours: 9 });
      mockDbManager.all.mockResolvedValueOnce([]);

      const result = await repository.update('mock-uuid-123', updateWithTimes);

      expect(mockDbManager.run).toHaveBeenCalledWith(
        expect.stringContaining('total_hours = ?'),
        expect.arrayContaining([9])
      );
    });

    it('should create adjustments when adjustedBy is provided', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockAttendanceRow);
      mockDbManager.all.mockResolvedValueOnce([]); // adjustments for existing record
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any); // update record
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any); // insert adjustment
      mockDbManager.get.mockResolvedValueOnce(mockAttendanceRow);
      mockDbManager.all.mockResolvedValueOnce([]); // adjustments for updated record

      await repository.update('mock-uuid-123', updateData, 'manager-456');

      expect(mockDbManager.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO time_adjustments'),
        expect.arrayContaining(['manager-456'])
      );
    });
  });

  describe('delete', () => {
    it('should delete attendance record and adjustments', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockAttendanceRow);
      mockDbManager.all.mockResolvedValueOnce([]);
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any); // delete adjustments
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any); // delete record

      await repository.delete('mock-uuid-123');

      expect(mockDbManager.run).toHaveBeenCalledWith(
        'DELETE FROM time_adjustments WHERE record_id = ?',
        ['mock-uuid-123']
      );
      expect(mockDbManager.run).toHaveBeenCalledWith(
        'DELETE FROM attendance_records WHERE id = ?',
        ['mock-uuid-123']
      );
    });

    it('should throw error when record not found', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      await expect(repository.delete('non-existent'))
        .rejects.toThrow(new AttendanceNotFoundError('non-existent'));
    });
  });

  describe('getAttendanceSummary', () => {
    const mockSummaryRecords = [
      { ...mockAttendanceRow, total_hours: 8, time_category: 'full-day' },
      { ...mockAttendanceRow, id: 'record-2', total_hours: 4, time_category: 'half-day' }
    ];

    it('should calculate attendance summary correctly', async () => {
      mockDbManager.all.mockResolvedValueOnce(mockSummaryRecords);
      mockDbManager.all.mockResolvedValueOnce([]); // adjustments for record 1
      mockDbManager.all.mockResolvedValueOnce([]); // adjustments for record 2

      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-01-31');

      const result = await repository.getAttendanceSummary('emp-123', startDate, endDate);

      expect(result).toMatchObject({
        totalRecords: 2,
        totalHours: 12,
        categorySummary: {
          'full-day': { count: 1, hours: 8 },
          'half-day': { count: 1, hours: 4 }
        }
      });
    });

    it('should calculate average hours per day', async () => {
      mockDbManager.all.mockResolvedValueOnce([mockAttendanceRow]);
      mockDbManager.all.mockResolvedValueOnce([]);

      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-01-08'); // 7 days

      const result = await repository.getAttendanceSummary('emp-123', startDate, endDate);

      expect(result.averageHoursPerDay).toBeCloseTo(1.14, 2); // 8 hours / 7 days
    });
  });
});