import { apiSlice } from './apiSlice';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  clockInTime: string;
  clockOutTime?: string;
  totalHours?: number;
  timeCategory?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending' | 'synced' | 'conflict';
}

export interface ClockInRequest {
  employeeId: string;
}

export interface ClockOutRequest {
  employeeId: string;
}

export interface ShiftStatus {
  isActive: boolean;
  currentRecord?: AttendanceRecord;
  elapsedTime?: number;
}

export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  role: 'employee' | 'manager' | 'admin';
  isActive: boolean;
}

export interface EmployeeStatus {
  employee: Employee;
  shiftStatus: ShiftStatus;
  lastActivity?: string;
}

export interface DashboardData {
  employees: EmployeeStatus[];
  totalActive: number;
  totalEmployees: number;
  lastUpdated: string;
}

export interface AttendanceReportRequest {
  startDate: string;
  endDate: string;
  employeeIds?: string[];
  format?: 'summary' | 'detailed';
}

export interface AttendanceSummary {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  totalDays: number;
  averageHoursPerDay: number;
  timeCategories: {
    [category: string]: number;
  };
}

export interface AttendanceDetail {
  date: string;
  clockInTime?: string;
  clockOutTime?: string;
  totalHours: number;
  timeCategory: string;
  notes?: string;
  adjustments?: {
    originalHours: number;
    adjustedHours: number;
    reason: string;
    adjustedBy: string;
    adjustedAt: string;
  }[];
}

export interface AttendanceReport {
  reportPeriod: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalEmployees: number;
    totalHours: number;
    averageHoursPerEmployee: number;
    totalRegularHours: number;
    totalOvertimeHours: number;
  };
  employees: AttendanceSummary[];
  details?: {
    [employeeId: string]: AttendanceDetail[];
  };
  generatedAt: string;
}

export interface ExportRequest {
  startDate: string;
  endDate: string;
  employeeIds?: string[];
  format: 'summary' | 'detailed';
  exportType: 'csv' | 'excel' | 'pdf';
}

export interface ExportResponse {
  filename: string;
  downloadUrl: string;
  expiresAt: string;
}

export interface TimeAdjustment {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  attendanceRecordId: string;
  date: string;
  originalClockIn?: string;
  originalClockOut?: string;
  adjustedClockIn?: string;
  adjustedClockOut?: string;
  originalHours: number;
  adjustedHours: number;
  reason: string;
  justification: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvalNote?: string;
  rejectionReason?: string;
  auditTrail: AuditEntry[];
}

export interface AuditEntry {
  id: string;
  action: 'created' | 'updated' | 'approved' | 'rejected';
  performedBy: string;
  performedAt: string;
  details: string;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
}

export interface TimeAdjustmentFilter {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  status?: 'pending' | 'approved' | 'rejected';
}

export interface CreateTimeAdjustmentRequest {
  employeeId: string;
  attendanceRecordId: string;
  adjustedClockIn?: string;
  adjustedClockOut?: string;
  reason: string;
  justification: string;
}

export interface UpdateTimeAdjustmentRequest {
  id: string;
  adjustedClockIn?: string;
  adjustedClockOut?: string;
  reason?: string;
  justification?: string;
}

export const attendanceApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    clockIn: builder.mutation<AttendanceRecord, ClockInRequest>({
      query: (data) => ({
        url: '/attendance/clock-in',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Attendance'],
    }),
    clockOut: builder.mutation<AttendanceRecord, ClockOutRequest>({
      query: (data) => ({
        url: '/attendance/clock-out',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Attendance'],
    }),
    getCurrentShift: builder.query<ShiftStatus, string>({
      query: (employeeId) => `/attendance/current-shift/${employeeId}`,
      providesTags: ['Attendance'],
    }),
    getAttendanceHistory: builder.query<AttendanceRecord[], { 
      employeeId: string; 
      days?: number;
      startDate?: string;
      endDate?: string;
    }>({
      query: ({ employeeId, days = 30, startDate, endDate }) => {
        const params = new URLSearchParams();
        if (startDate && endDate) {
          params.append('startDate', startDate);
          params.append('endDate', endDate);
        } else {
          params.append('days', days.toString());
        }
        return `/attendance/history/${employeeId}?${params.toString()}`;
      },
      providesTags: ['Attendance'],
    }),
    // Manager endpoints
    getDashboardData: builder.query<DashboardData, { date?: string }>({
      query: ({ date }) => {
        const params = new URLSearchParams();
        if (date) {
          params.append('date', date);
        }
        return `/manager/dashboard?${params.toString()}`;
      },
      providesTags: ['Attendance', 'Employees'],
      // Poll every 30 seconds for real-time updates
      pollingInterval: 30000,
    }),
    getAllEmployees: builder.query<Employee[], void>({
      query: () => '/employees',
      providesTags: ['Employees'],
    }),
    // Reporting endpoints
    getAttendanceReport: builder.query<AttendanceReport, AttendanceReportRequest>({
      query: ({ startDate, endDate, employeeIds, format = 'summary' }) => {
        const params = new URLSearchParams();
        params.append('startDate', startDate);
        params.append('endDate', endDate);
        params.append('format', format);
        if (employeeIds && employeeIds.length > 0) {
          employeeIds.forEach(id => params.append('employeeIds', id));
        }
        return `/manager/reports/attendance?${params.toString()}`;
      },
      providesTags: ['Attendance'],
    }),
    exportAttendanceReport: builder.mutation<ExportResponse, ExportRequest>({
      query: ({ startDate, endDate, employeeIds, format, exportType }) => ({
        url: '/manager/reports/export',
        method: 'POST',
        body: { startDate, endDate, employeeIds, format, exportType },
        responseHandler: (response) => response.blob(),
      }),
    }),
    // Time adjustment endpoints
    getTimeAdjustments: builder.query<TimeAdjustment[], TimeAdjustmentFilter>({
      query: ({ startDate, endDate, employeeId, status }) => {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (employeeId) params.append('employeeId', employeeId);
        if (status) params.append('status', status);
        return `/manager/time-adjustments?${params.toString()}`;
      },
      providesTags: ['TimeAdjustments'],
    }),
    createTimeAdjustment: builder.mutation<TimeAdjustment, CreateTimeAdjustmentRequest>({
      query: (data) => ({
        url: '/manager/time-adjustments',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['TimeAdjustments', 'Attendance'],
    }),
    updateTimeAdjustment: builder.mutation<TimeAdjustment, UpdateTimeAdjustmentRequest>({
      query: ({ id, ...data }) => ({
        url: `/manager/time-adjustments/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['TimeAdjustments', 'Attendance'],
    }),
    approveTimeAdjustment: builder.mutation<TimeAdjustment, { id: string; approvalNote?: string }>({
      query: ({ id, approvalNote }) => ({
        url: `/manager/time-adjustments/${id}/approve`,
        method: 'POST',
        body: { approvalNote },
      }),
      invalidatesTags: ['TimeAdjustments', 'Attendance'],
    }),
    rejectTimeAdjustment: builder.mutation<TimeAdjustment, { id: string; rejectionReason: string }>({
      query: ({ id, rejectionReason }) => ({
        url: `/manager/time-adjustments/${id}/reject`,
        method: 'POST',
        body: { rejectionReason },
      }),
      invalidatesTags: ['TimeAdjustments', 'Attendance'],
    }),
  }),
});

export const {
  useClockInMutation,
  useClockOutMutation,
  useGetCurrentShiftQuery,
  useGetAttendanceHistoryQuery,
  useGetDashboardDataQuery,
  useGetAllEmployeesQuery,
  useGetAttendanceReportQuery,
  useExportAttendanceReportMutation,
  useGetTimeAdjustmentsQuery,
  useCreateTimeAdjustmentMutation,
  useUpdateTimeAdjustmentMutation,
  useApproveTimeAdjustmentMutation,
  useRejectTimeAdjustmentMutation,
} = attendanceApi;