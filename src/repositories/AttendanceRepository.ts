import { DatabaseManager } from '../database/DatabaseManager';
import { 
  AttendanceRecord, 
  CreateAttendanceRecordData, 
  ClockOutData, 
  UpdateAttendanceRecordData,
  TimeAdjustment,
  AttendanceValidator,
  AttendanceCalculator
} from '../models/AttendanceRecord';
import { v4 as uuidv4 } from 'uuid';

export class AttendanceNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Attendance record not found: ${identifier}`);
    this.name = 'AttendanceNotFoundError';
  }
}

export class EmployeeAlreadyClockedInError extends Error {
  constructor(employeeId: string) {
    super(`Employee ${employeeId} is already clocked in`);
    this.name = 'EmployeeAlreadyClockedInError';
  }
}

export class EmployeeNotClockedInError extends Error {
  constructor(employeeId: string) {
    super(`Employee ${employeeId} is not currently clocked in`);
    this.name = 'EmployeeNotClockedInError';
  }
}

export interface AttendanceFilters {
  employeeId?: string;
  startDate?: Date;
  endDate?: Date;
  syncStatus?: 'pending' | 'synced' | 'conflict';
  includeIncomplete?: boolean; // Include records without clock out
}

export interface AttendanceSummary {
  totalRecords: number;
  totalHours: number;
  averageHoursPerDay: number;
  categorySummary: Record<string, { count: number; hours: number }>;
}

export class AttendanceRepository {
  private dbManager: DatabaseManager;

  constructor() {
    this.dbManager = DatabaseManager.getInstance();
  }

  async clockIn(data: CreateAttendanceRecordData): Promise<AttendanceRecord> {
    AttendanceValidator.validateCreate(data);

    // Check if employee is already clocked in
    const currentShift = await this.getCurrentShift(data.employeeId);
    if (currentShift) {
      throw new EmployeeAlreadyClockedInError(data.employeeId);
    }

    const record: AttendanceRecord = {
      id: uuidv4(),
      employeeId: data.employeeId,
      clockInTime: data.clockInTime || new Date(),
      clockOutTime: undefined,
      totalHours: undefined,
      timeCategory: undefined,
      notes: data.notes?.trim() || undefined,
      adjustments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      syncStatus: 'pending'
    };

    const sql = `
      INSERT INTO attendance_records (
        id, employee_id, clock_in_time, notes, created_at, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await this.dbManager.run(sql, [
      record.id,
      record.employeeId,
      record.clockInTime.toISOString(),
      record.notes,
      record.createdAt.toISOString(),
      record.updatedAt.toISOString(),
      record.syncStatus
    ]);

    return record;
  }

  async clockOut(employeeId: string, data: ClockOutData = {}): Promise<AttendanceRecord> {
    // Get current shift
    const currentShift = await this.getCurrentShift(employeeId);
    if (!currentShift) {
      throw new EmployeeNotClockedInError(employeeId);
    }

    AttendanceValidator.validateClockOut(data, currentShift.clockInTime);

    const clockOutTime = data.clockOutTime || new Date();
    const totalHours = AttendanceCalculator.calculateTotalHours(currentShift.clockInTime, clockOutTime);

    // Get time categories to determine category
    const categories = await this.getTimeCategories();
    const timeCategory = AttendanceCalculator.determineTimeCategory(totalHours, categories);

    const updatedNotes = data.notes ? 
      (currentShift.notes ? `${currentShift.notes}\n${data.notes.trim()}` : data.notes.trim()) :
      currentShift.notes;

    const sql = `
      UPDATE attendance_records 
      SET clock_out_time = ?, total_hours = ?, time_category = ?, notes = ?, updated_at = ?, sync_status = 'pending'
      WHERE id = ?
    `;

    await this.dbManager.run(sql, [
      clockOutTime.toISOString(),
      totalHours,
      timeCategory,
      updatedNotes,
      new Date().toISOString(),
      currentShift.id
    ]);

    const updated = await this.findById(currentShift.id);
    if (!updated) {
      throw new Error('Failed to retrieve updated attendance record');
    }

    return updated;
  }

  async findById(id: string): Promise<AttendanceRecord | null> {
    const sql = 'SELECT * FROM attendance_records WHERE id = ?';
    const row = await this.dbManager.get<any>(sql, [id]);
    
    if (!row) {
      return null;
    }

    const adjustments = await this.getAdjustments(id);
    return this.mapRowToAttendanceRecord(row, adjustments);
  }

  async findByEmployeeId(employeeId: string, filters?: Omit<AttendanceFilters, 'employeeId'>): Promise<AttendanceRecord[]> {
    return this.findAll({ ...filters, employeeId });
  }

  async findAll(filters?: AttendanceFilters): Promise<AttendanceRecord[]> {
    let sql = 'SELECT * FROM attendance_records WHERE 1=1';
    const params: any[] = [];

    if (filters?.employeeId) {
      sql += ' AND employee_id = ?';
      params.push(filters.employeeId);
    }

    if (filters?.startDate) {
      sql += ' AND clock_in_time >= ?';
      params.push(filters.startDate.toISOString());
    }

    if (filters?.endDate) {
      sql += ' AND clock_in_time <= ?';
      params.push(filters.endDate.toISOString());
    }

    if (filters?.syncStatus) {
      sql += ' AND sync_status = ?';
      params.push(filters.syncStatus);
    }

    if (filters?.includeIncomplete === false) {
      sql += ' AND clock_out_time IS NOT NULL';
    }

    sql += ' ORDER BY clock_in_time DESC';

    const rows = await this.dbManager.all<any>(sql, params);
    
    // Get adjustments for all records
    const records = await Promise.all(
      rows.map(async (row) => {
        const adjustments = await this.getAdjustments(row.id);
        return this.mapRowToAttendanceRecord(row, adjustments);
      })
    );

    return records;
  }

  async getCurrentShift(employeeId: string): Promise<AttendanceRecord | null> {
    const sql = `
      SELECT * FROM attendance_records 
      WHERE employee_id = ? AND clock_out_time IS NULL 
      ORDER BY clock_in_time DESC 
      LIMIT 1
    `;
    
    const row = await this.dbManager.get<any>(sql, [employeeId]);
    
    if (!row) {
      return null;
    }

    const adjustments = await this.getAdjustments(row.id);
    return this.mapRowToAttendanceRecord(row, adjustments);
  }

  async isEmployeeClockedIn(employeeId: string): Promise<boolean> {
    const currentShift = await this.getCurrentShift(employeeId);
    return currentShift !== null;
  }

  async update(id: string, data: UpdateAttendanceRecordData, adjustedBy?: string): Promise<AttendanceRecord> {
    AttendanceValidator.validateUpdate(data);

    const existing = await this.findById(id);
    if (!existing) {
      throw new AttendanceNotFoundError(id);
    }

    const updates: string[] = [];
    const params: any[] = [];
    const adjustments: Omit<TimeAdjustment, 'id' | 'timestamp'>[] = [];

    if (data.clockInTime !== undefined && data.clockInTime.getTime() !== existing.clockInTime.getTime()) {
      updates.push('clock_in_time = ?');
      params.push(data.clockInTime.toISOString());
      
      if (adjustedBy) {
        adjustments.push({
          recordId: id,
          adjustedBy,
          originalValue: existing.clockInTime.toISOString(),
          newValue: data.clockInTime.toISOString(),
          reason: 'Clock in time adjustment'
        });
      }
    }

    if (data.clockOutTime !== undefined) {
      const clockOutValue = data.clockOutTime ? data.clockOutTime.toISOString() : null;
      const existingClockOut = existing.clockOutTime ? existing.clockOutTime.toISOString() : null;
      
      if (clockOutValue !== existingClockOut) {
        updates.push('clock_out_time = ?');
        params.push(clockOutValue);
        
        if (adjustedBy) {
          adjustments.push({
            recordId: id,
            adjustedBy,
            originalValue: existingClockOut,
            newValue: clockOutValue,
            reason: 'Clock out time adjustment'
          });
        }
      }
    }

    if (data.notes !== undefined && data.notes !== existing.notes) {
      updates.push('notes = ?');
      params.push(data.notes?.trim() || null);
    }

    if (data.timeCategory !== undefined && data.timeCategory !== existing.timeCategory) {
      updates.push('time_category = ?');
      params.push(data.timeCategory);
    }

    // Recalculate total hours if clock times changed
    const finalClockInTime = data.clockInTime || existing.clockInTime;
    const finalClockOutTime = data.clockOutTime !== undefined ? data.clockOutTime : existing.clockOutTime;
    
    if (finalClockOutTime && updates.some(u => u.includes('clock_in_time') || u.includes('clock_out_time'))) {
      const newTotalHours = AttendanceCalculator.calculateTotalHours(finalClockInTime, finalClockOutTime);
      updates.push('total_hours = ?');
      params.push(newTotalHours);

      // Auto-update time category if not explicitly set
      if (data.timeCategory === undefined) {
        const categories = await this.getTimeCategories();
        const newTimeCategory = AttendanceCalculator.determineTimeCategory(newTotalHours, categories);
        updates.push('time_category = ?');
        params.push(newTimeCategory);
      }
    }

    if (updates.length === 0) {
      return existing; // No changes
    }

    updates.push('updated_at = ?', 'sync_status = ?');
    params.push(new Date().toISOString(), 'pending');
    params.push(id);

    await this.dbManager.withTransaction(async () => {
      // Update the record
      const sql = `UPDATE attendance_records SET ${updates.join(', ')} WHERE id = ?`;
      await this.dbManager.run(sql, params);

      // Add adjustments if provided
      for (const adjustment of adjustments) {
        await this.addAdjustment(adjustment);
      }
    });

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Failed to retrieve updated attendance record');
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new AttendanceNotFoundError(id);
    }

    await this.dbManager.withTransaction(async () => {
      // Delete adjustments first
      await this.dbManager.run('DELETE FROM time_adjustments WHERE record_id = ?', [id]);
      
      // Delete the record
      await this.dbManager.run('DELETE FROM attendance_records WHERE id = ?', [id]);
    });
  }

  async getAttendanceSummary(employeeId: string, startDate: Date, endDate: Date): Promise<AttendanceSummary> {
    const records = await this.findByEmployeeId(employeeId, {
      startDate,
      endDate,
      includeIncomplete: false
    });

    const totalRecords = records.length;
    const totalHours = records.reduce((sum, record) => sum + (record.totalHours || 0), 0);
    
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const averageHoursPerDay = daysDiff > 0 ? totalHours / daysDiff : 0;

    const categorySummary: Record<string, { count: number; hours: number }> = {};
    
    records.forEach(record => {
      if (record.timeCategory) {
        if (!categorySummary[record.timeCategory]) {
          categorySummary[record.timeCategory] = { count: 0, hours: 0 };
        }
        categorySummary[record.timeCategory].count++;
        categorySummary[record.timeCategory].hours += record.totalHours || 0;
      }
    });

    return {
      totalRecords,
      totalHours: Math.round(totalHours * 100) / 100,
      averageHoursPerDay: Math.round(averageHoursPerDay * 100) / 100,
      categorySummary
    };
  }

  private async addAdjustment(adjustment: Omit<TimeAdjustment, 'id' | 'timestamp'>): Promise<void> {
    const sql = `
      INSERT INTO time_adjustments (id, record_id, adjusted_by, original_value, new_value, reason, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await this.dbManager.run(sql, [
      uuidv4(),
      adjustment.recordId,
      adjustment.adjustedBy,
      JSON.stringify(adjustment.originalValue),
      JSON.stringify(adjustment.newValue),
      adjustment.reason,
      new Date().toISOString()
    ]);
  }

  private async getAdjustments(recordId: string): Promise<TimeAdjustment[]> {
    const sql = 'SELECT * FROM time_adjustments WHERE record_id = ? ORDER BY timestamp DESC';
    const rows = await this.dbManager.all<any>(sql, [recordId]);

    if (!rows || !Array.isArray(rows)) {
      return [];
    }

    return rows.map(row => ({
      id: row.id,
      recordId: row.record_id,
      adjustedBy: row.adjusted_by,
      originalValue: JSON.parse(row.original_value),
      newValue: JSON.parse(row.new_value),
      reason: row.reason,
      timestamp: new Date(row.timestamp)
    }));
  }

  private async getTimeCategories(): Promise<Array<{ id: string; name: string; minHours: number; maxHours?: number }>> {
    const sql = 'SELECT id, name, min_hours, max_hours FROM time_categories WHERE is_active = 1 ORDER BY min_hours';
    const rows = await this.dbManager.all<any>(sql);

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      minHours: row.min_hours,
      maxHours: row.max_hours || undefined
    }));
  }

  private mapRowToAttendanceRecord(row: any, adjustments: TimeAdjustment[]): AttendanceRecord {
    return {
      id: row.id,
      employeeId: row.employee_id,
      clockInTime: new Date(row.clock_in_time),
      clockOutTime: row.clock_out_time ? new Date(row.clock_out_time) : undefined,
      totalHours: row.total_hours || undefined,
      timeCategory: row.time_category || undefined,
      notes: row.notes || undefined,
      adjustments,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      syncStatus: row.sync_status
    };
  }
}