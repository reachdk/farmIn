import {
  AttendanceValidator,
  AttendanceCalculator,
  AttendanceValidationError,
  CreateAttendanceRecordData,
  ClockOutData,
  UpdateAttendanceRecordData,
  AttendanceRecord,
  TimeAdjustment
} from '../../models/AttendanceRecord';

describe('AttendanceValidator', () => {
  describe('validateCreate', () => {
    const validData: CreateAttendanceRecordData = {
      employeeId: 'emp-123',
      clockInTime: new Date('2023-01-01T09:00:00Z'),
      notes: 'Starting work'
    };

    it('should validate valid create data', () => {
      expect(() => AttendanceValidator.validateCreate(validData)).not.toThrow();
    });

    it('should validate minimal create data', () => {
      const minimalData: CreateAttendanceRecordData = {
        employeeId: 'emp-123'
      };
      expect(() => AttendanceValidator.validateCreate(minimalData)).not.toThrow();
    });

    it('should reject empty employee ID', () => {
      const data = { ...validData, employeeId: '' };
      expect(() => AttendanceValidator.validateCreate(data))
        .toThrow(new AttendanceValidationError('Employee ID is required', 'employeeId'));
    });

    it('should reject future clock in time', () => {
      const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      const data = { ...validData, clockInTime: futureTime };
      expect(() => AttendanceValidator.validateCreate(data))
        .toThrow(new AttendanceValidationError('Clock in time cannot be in the future', 'clockInTime'));
    });

    it('should reject notes that are too long', () => {
      const longNotes = 'A'.repeat(501);
      const data = { ...validData, notes: longNotes };
      expect(() => AttendanceValidator.validateCreate(data))
        .toThrow(new AttendanceValidationError('Notes cannot exceed 500 characters', 'notes'));
    });
  });

  describe('validateClockOut', () => {
    const clockInTime = new Date('2023-01-01T09:00:00Z');
    const validClockOutData: ClockOutData = {
      clockOutTime: new Date('2023-01-01T17:00:00Z'),
      notes: 'End of shift'
    };

    it('should validate valid clock out data', () => {
      expect(() => AttendanceValidator.validateClockOut(validClockOutData, clockInTime)).not.toThrow();
    });

    it('should validate clock out without explicit time', () => {
      const data: ClockOutData = { notes: 'End of shift' };
      expect(() => AttendanceValidator.validateClockOut(data, clockInTime)).not.toThrow();
    });

    it('should reject clock out time before clock in time', () => {
      const earlyClockOut = new Date('2023-01-01T08:00:00Z');
      const data = { ...validClockOutData, clockOutTime: earlyClockOut };
      expect(() => AttendanceValidator.validateClockOut(data, clockInTime))
        .toThrow(new AttendanceValidationError('Clock out time must be after clock in time', 'clockOutTime'));
    });

    it('should reject future clock out time', () => {
      const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const data = { ...validClockOutData, clockOutTime: futureTime };
      expect(() => AttendanceValidator.validateClockOut(data, clockInTime))
        .toThrow(new AttendanceValidationError('Clock out time cannot be in the future', 'clockOutTime'));
    });
  });

  describe('validateUpdate', () => {
    it('should validate valid update data', () => {
      const updateData: UpdateAttendanceRecordData = {
        clockInTime: new Date('2023-01-01T09:00:00Z'),
        clockOutTime: new Date('2023-01-01T17:00:00Z'),
        notes: 'Updated notes'
      };
      expect(() => AttendanceValidator.validateUpdate(updateData)).not.toThrow();
    });

    it('should reject inconsistent clock times', () => {
      const updateData: UpdateAttendanceRecordData = {
        clockInTime: new Date('2023-01-01T17:00:00Z'),
        clockOutTime: new Date('2023-01-01T09:00:00Z')
      };
      expect(() => AttendanceValidator.validateUpdate(updateData))
        .toThrow(new AttendanceValidationError('Clock out time must be after clock in time', 'clockOutTime'));
    });
  });

  describe('validateTimeAdjustment', () => {
    const validAdjustment = {
      recordId: 'record-123',
      adjustedBy: 'manager-456',
      originalValue: '09:00',
      newValue: '09:15',
      reason: 'Corrected clock in time'
    };

    it('should validate valid adjustment', () => {
      expect(() => AttendanceValidator.validateTimeAdjustment(validAdjustment)).not.toThrow();
    });

    it('should reject adjustment without reason', () => {
      const adjustment = { ...validAdjustment, reason: '' };
      expect(() => AttendanceValidator.validateTimeAdjustment(adjustment))
        .toThrow(new AttendanceValidationError('Reason is required for adjustment', 'reason'));
    });

    it('should reject adjustment with long reason', () => {
      const adjustment = { ...validAdjustment, reason: 'A'.repeat(501) };
      expect(() => AttendanceValidator.validateTimeAdjustment(adjustment))
        .toThrow(new AttendanceValidationError('Adjustment reason cannot exceed 500 characters', 'reason'));
    });
  });
});

describe('AttendanceCalculator', () => {
  describe('calculateTotalHours', () => {
    it('should calculate hours correctly', () => {
      const clockIn = new Date('2023-01-01T09:00:00Z');
      const clockOut = new Date('2023-01-01T17:00:00Z');
      
      const hours = AttendanceCalculator.calculateTotalHours(clockIn, clockOut);
      expect(hours).toBe(8);
    });

    it('should handle partial hours', () => {
      const clockIn = new Date('2023-01-01T09:00:00Z');
      const clockOut = new Date('2023-01-01T13:30:00Z');
      
      const hours = AttendanceCalculator.calculateTotalHours(clockIn, clockOut);
      expect(hours).toBe(4.5);
    });

    it('should round to 2 decimal places', () => {
      const clockIn = new Date('2023-01-01T09:00:00Z');
      const clockOut = new Date('2023-01-01T13:20:00Z'); // 4 hours 20 minutes = 4.333... hours
      
      const hours = AttendanceCalculator.calculateTotalHours(clockIn, clockOut);
      expect(hours).toBe(4.33);
    });

    it('should throw error for invalid time range', () => {
      const clockIn = new Date('2023-01-01T17:00:00Z');
      const clockOut = new Date('2023-01-01T09:00:00Z');
      
      expect(() => AttendanceCalculator.calculateTotalHours(clockIn, clockOut))
        .toThrow(new AttendanceValidationError('Clock out time must be after clock in time'));
    });
  });

  describe('determineTimeCategory', () => {
    const categories = [
      { id: 'half-day', name: 'Half Day', minHours: 4, maxHours: 7.99 },
      { id: 'full-day', name: 'Full Day', minHours: 8 },
      { id: 'overtime', name: 'Overtime', minHours: 10 }
    ];

    it('should assign correct category for half day', () => {
      const category = AttendanceCalculator.determineTimeCategory(6, categories);
      expect(category).toBe('half-day');
    });

    it('should assign correct category for full day', () => {
      const category = AttendanceCalculator.determineTimeCategory(8, categories);
      expect(category).toBe('full-day');
    });

    it('should assign highest applicable category', () => {
      const category = AttendanceCalculator.determineTimeCategory(12, categories);
      expect(category).toBe('overtime');
    });

    it('should return undefined for hours below minimum', () => {
      const category = AttendanceCalculator.determineTimeCategory(2, categories);
      expect(category).toBeUndefined();
    });

    it('should handle edge cases at boundaries', () => {
      expect(AttendanceCalculator.determineTimeCategory(4, categories)).toBe('half-day');
      expect(AttendanceCalculator.determineTimeCategory(7.99, categories)).toBe('half-day');
      expect(AttendanceCalculator.determineTimeCategory(8, categories)).toBe('full-day');
      expect(AttendanceCalculator.determineTimeCategory(10, categories)).toBe('overtime');
    });

    it('should return undefined for empty categories', () => {
      const category = AttendanceCalculator.determineTimeCategory(8, []);
      expect(category).toBeUndefined();
    });
  });

  describe('isCurrentlyClocked', () => {
    const createRecord = (clockedOut: boolean): AttendanceRecord => ({
      id: 'record-1',
      employeeId: 'emp-1',
      clockInTime: new Date('2023-01-01T09:00:00Z'),
      clockOutTime: clockedOut ? new Date('2023-01-01T17:00:00Z') : undefined,
      totalHours: clockedOut ? 8 : undefined,
      adjustments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      syncStatus: 'pending'
    });

    it('should return true when employee is clocked in', () => {
      const records = [createRecord(false)];
      expect(AttendanceCalculator.isCurrentlyClocked(records)).toBe(true);
    });

    it('should return false when employee is clocked out', () => {
      const records = [createRecord(true)];
      expect(AttendanceCalculator.isCurrentlyClocked(records)).toBe(false);
    });

    it('should return false for empty records', () => {
      expect(AttendanceCalculator.isCurrentlyClocked([])).toBe(false);
    });

    it('should check most recent record', () => {
      const oldRecord = {
        ...createRecord(false),
        clockInTime: new Date('2023-01-01T09:00:00Z')
      };
      const newRecord = {
        ...createRecord(true),
        clockInTime: new Date('2023-01-02T09:00:00Z')
      };
      
      const records = [oldRecord, newRecord];
      expect(AttendanceCalculator.isCurrentlyClocked(records)).toBe(false);
    });
  });

  describe('getCurrentShift', () => {
    const createRecord = (clockInTime: Date, clockedOut: boolean): AttendanceRecord => ({
      id: `record-${clockInTime.getTime()}`,
      employeeId: 'emp-1',
      clockInTime,
      clockOutTime: clockedOut ? new Date(clockInTime.getTime() + 8 * 60 * 60 * 1000) : undefined,
      totalHours: clockedOut ? 8 : undefined,
      adjustments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      syncStatus: 'pending'
    });

    it('should return current shift when employee is clocked in', () => {
      const currentShift = createRecord(new Date('2023-01-02T09:00:00Z'), false);
      const oldShift = createRecord(new Date('2023-01-01T09:00:00Z'), true);
      
      const records = [oldShift, currentShift];
      const result = AttendanceCalculator.getCurrentShift(records);
      
      expect(result).toEqual(currentShift);
    });

    it('should return null when employee is not clocked in', () => {
      const records = [createRecord(new Date('2023-01-01T09:00:00Z'), true)];
      const result = AttendanceCalculator.getCurrentShift(records);
      
      expect(result).toBeNull();
    });

    it('should return null for empty records', () => {
      const result = AttendanceCalculator.getCurrentShift([]);
      expect(result).toBeNull();
    });
  });

  describe('calculateElapsedTime', () => {
    it('should calculate elapsed time correctly', () => {
      const clockIn = new Date('2023-01-01T09:00:00Z');
      const current = new Date('2023-01-01T13:30:00Z');
      
      const elapsed = AttendanceCalculator.calculateElapsedTime(clockIn, current);
      expect(elapsed).toBe(4.5);
    });

    it('should return 0 for invalid time range', () => {
      const clockIn = new Date('2023-01-01T13:00:00Z');
      const current = new Date('2023-01-01T09:00:00Z');
      
      const elapsed = AttendanceCalculator.calculateElapsedTime(clockIn, current);
      expect(elapsed).toBe(0);
    });

    it('should use current time when not provided', () => {
      const clockIn = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      
      const elapsed = AttendanceCalculator.calculateElapsedTime(clockIn);
      expect(elapsed).toBeCloseTo(2, 1); // Within 0.1 hours
    });
  });
});