export interface AttendanceRecord {
  id: string;
  employeeId: string;
  clockInTime: Date;
  clockOutTime?: Date;
  totalHours?: number;
  timeCategory?: string;
  notes?: string;
  adjustments: TimeAdjustment[];
  createdAt: Date;
  updatedAt: Date;
  syncStatus: 'pending' | 'synced' | 'conflict';
}

export interface TimeAdjustment {
  id: string;
  recordId: string;
  adjustedBy: string;
  originalValue: any;
  newValue: any;
  reason: string;
  timestamp: Date;
}

export interface CreateAttendanceRecordData {
  employeeId: string;
  clockInTime?: Date; // Optional, defaults to now
  notes?: string;
}

export interface ClockOutData {
  clockOutTime?: Date; // Optional, defaults to now
  notes?: string;
}

export interface UpdateAttendanceRecordData {
  clockInTime?: Date;
  clockOutTime?: Date;
  notes?: string;
  timeCategory?: string;
}

export class AttendanceValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'AttendanceValidationError';
  }
}

export class AttendanceCalculator {
  /**
   * Calculate total hours between clock in and clock out times
   */
  static calculateTotalHours(clockInTime: Date, clockOutTime: Date): number {
    if (clockOutTime <= clockInTime) {
      throw new AttendanceValidationError('Clock out time must be after clock in time');
    }

    const diffInMs = clockOutTime.getTime() - clockInTime.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    
    // Round to 2 decimal places
    return Math.round(diffInHours * 100) / 100;
  }

  /**
   * Calculate time category based on total hours and category thresholds
   */
  static determineTimeCategory(totalHours: number, categories: Array<{ id: string; name: string; minHours: number; maxHours?: number }>): string | undefined {
    if (!categories || categories.length === 0) {
      return undefined;
    }

    // Sort categories by minHours in descending order to find the highest applicable category
    const sortedCategories = [...categories].sort((a, b) => b.minHours - a.minHours);

    for (const category of sortedCategories) {
      if (totalHours >= category.minHours) {
        // Check if there's a max hours constraint
        if (category.maxHours === undefined || totalHours <= category.maxHours) {
          return category.id;
        }
      }
    }

    return undefined;
  }

  /**
   * Check if an employee is currently clocked in
   */
  static isCurrentlyClocked(records: AttendanceRecord[]): boolean {
    if (!records || records.length === 0) {
      return false;
    }

    // Sort by clock in time descending to get the most recent record
    const sortedRecords = [...records].sort((a, b) => b.clockInTime.getTime() - a.clockInTime.getTime());
    const mostRecentRecord = sortedRecords[0];

    return !mostRecentRecord.clockOutTime;
  }

  /**
   * Get the current active shift for an employee
   */
  static getCurrentShift(records: AttendanceRecord[]): AttendanceRecord | null {
    if (!records || records.length === 0) {
      return null;
    }

    // Sort by clock in time descending to get the most recent record
    const sortedRecords = [...records].sort((a, b) => b.clockInTime.getTime() - a.clockInTime.getTime());
    const mostRecentRecord = sortedRecords[0];

    return !mostRecentRecord.clockOutTime ? mostRecentRecord : null;
  }

  /**
   * Calculate elapsed time for current shift
   */
  static calculateElapsedTime(clockInTime: Date, currentTime: Date = new Date()): number {
    if (currentTime <= clockInTime) {
      return 0;
    }

    const diffInMs = currentTime.getTime() - clockInTime.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    
    return Math.round(diffInHours * 100) / 100;
  }
}

export class AttendanceValidator {
  static validateCreate(data: CreateAttendanceRecordData): void {
    if (!data.employeeId?.trim()) {
      throw new AttendanceValidationError('Employee ID is required', 'employeeId');
    }

    if (data.clockInTime && data.clockInTime > new Date()) {
      throw new AttendanceValidationError('Clock in time cannot be in the future', 'clockInTime');
    }

    if (data.notes && data.notes.length > 500) {
      throw new AttendanceValidationError('Notes cannot exceed 500 characters', 'notes');
    }
  }

  static validateClockOut(data: ClockOutData, clockInTime: Date): void {
    const clockOutTime = data.clockOutTime || new Date();

    if (clockOutTime <= clockInTime) {
      throw new AttendanceValidationError('Clock out time must be after clock in time', 'clockOutTime');
    }

    if (clockOutTime > new Date()) {
      throw new AttendanceValidationError('Clock out time cannot be in the future', 'clockOutTime');
    }

    if (data.notes && data.notes.length > 500) {
      throw new AttendanceValidationError('Notes cannot exceed 500 characters', 'notes');
    }
  }

  static validateUpdate(data: UpdateAttendanceRecordData): void {
    if (data.clockInTime && data.clockInTime > new Date()) {
      throw new AttendanceValidationError('Clock in time cannot be in the future', 'clockInTime');
    }

    if (data.clockOutTime && data.clockOutTime > new Date()) {
      throw new AttendanceValidationError('Clock out time cannot be in the future', 'clockOutTime');
    }

    if (data.clockInTime && data.clockOutTime && data.clockOutTime <= data.clockInTime) {
      throw new AttendanceValidationError('Clock out time must be after clock in time', 'clockOutTime');
    }

    if (data.notes && data.notes.length > 500) {
      throw new AttendanceValidationError('Notes cannot exceed 500 characters', 'notes');
    }
  }

  static validateTimeAdjustment(adjustment: Omit<TimeAdjustment, 'id' | 'timestamp'>): void {
    if (!adjustment.recordId?.trim()) {
      throw new AttendanceValidationError('Record ID is required for adjustment', 'recordId');
    }

    if (!adjustment.adjustedBy?.trim()) {
      throw new AttendanceValidationError('Adjusted by user ID is required', 'adjustedBy');
    }

    if (!adjustment.reason?.trim()) {
      throw new AttendanceValidationError('Reason is required for adjustment', 'reason');
    }

    if (adjustment.reason.length > 500) {
      throw new AttendanceValidationError('Adjustment reason cannot exceed 500 characters', 'reason');
    }
  }
}