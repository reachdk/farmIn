import { apiSlice } from './apiSlice';

export interface SyncStatus {
  lastSyncAt?: string;
  status: 'idle' | 'syncing' | 'error' | 'success';
  pendingOperations: number;
  failedOperations: number;
  lastError?: string;
  nextSyncAt?: string;
}

export interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  uptime: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  diskUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  databaseStatus: 'connected' | 'disconnected' | 'error';
  lastHealthCheck: string;
}

export interface SyncLog {
  id: string;
  timestamp: string;
  operation: string;
  status: 'success' | 'error' | 'pending';
  details: string;
  duration?: number;
  recordsProcessed?: number;
  errorMessage?: string;
}

export interface ConflictItem {
  id: string;
  entityType: 'employee' | 'attendance' | 'timeCategory';
  entityId: string;
  localData: any;
  remoteData: any;
  conflictType: 'update' | 'delete' | 'create';
  timestamp: string;
  status: 'pending' | 'resolved' | 'ignored';
}

export interface SystemStats {
  totalEmployees: number;
  activeEmployees: number;
  totalAttendanceRecords: number;
  todayAttendanceRecords: number;
  pendingSyncOperations: number;
  systemUptime: number;
  lastBackup?: string;
}

export interface BackupInfo {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
  type: 'manual' | 'automatic';
  status: 'completed' | 'failed' | 'in_progress';
}

export const systemApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Get current sync status
    getSyncStatus: builder.query<SyncStatus, void>({
      query: () => '/admin/system/sync-status',
      // Poll every 10 seconds for real-time updates
      pollingInterval: 10000,
    }),

    // Get system health information
    getSystemHealth: builder.query<SystemHealth, void>({
      query: () => '/admin/system/health',
      // Poll every 30 seconds
      pollingInterval: 30000,
    }),

    // Get sync logs with pagination
    getSyncLogs: builder.query<{ logs: SyncLog[]; total: number; page: number; totalPages: number }, {
      page?: number;
      limit?: number;
      status?: 'success' | 'error' | 'pending';
      startDate?: string;
      endDate?: string;
    }>({
      query: ({ page = 1, limit = 50, status, startDate, endDate }) => {
        const params = new URLSearchParams();
        params.append('page', page.toString());
        params.append('limit', limit.toString());
        if (status) params.append('status', status);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        return `/admin/system/sync-logs?${params.toString()}`;
      },
    }),

    // Get pending conflicts
    getConflicts: builder.query<ConflictItem[], void>({
      query: () => '/admin/system/conflicts',
    }),

    // Get system statistics
    getSystemStats: builder.query<SystemStats, void>({
      query: () => '/admin/system/stats',
      // Poll every 60 seconds
      pollingInterval: 60000,
    }),

    // Get backup information
    getBackups: builder.query<BackupInfo[], void>({
      query: () => '/admin/system/backups',
    }),

    // Manual sync trigger
    triggerSync: builder.mutation<{ message: string; syncId: string }, void>({
      query: () => ({
        url: '/admin/system/sync',
        method: 'POST',
      }),
      invalidatesTags: ['Attendance', 'Employee', 'TimeCategory'],
    }),

    // Resolve conflict
    resolveConflict: builder.mutation<void, {
      conflictId: string;
      resolution: 'use_local' | 'use_remote' | 'merge' | 'ignore';
      mergedData?: any;
    }>({
      query: ({ conflictId, resolution, mergedData }) => ({
        url: `/admin/system/conflicts/${conflictId}/resolve`,
        method: 'POST',
        body: { resolution, mergedData },
      }),
    }),

    // Create manual backup
    createBackup: builder.mutation<{ message: string; backupId: string }, { 
      includeAttendance?: boolean;
      includeEmployees?: boolean;
      includeSettings?: boolean;
    }>({
      query: (options) => ({
        url: '/admin/system/backup',
        method: 'POST',
        body: options,
      }),
    }),

    // Restore from backup
    restoreBackup: builder.mutation<{ message: string }, string>({
      query: (backupId) => ({
        url: `/admin/system/backup/${backupId}/restore`,
        method: 'POST',
      }),
      invalidatesTags: ['Attendance', 'Employee', 'TimeCategory'],
    }),

    // Delete backup
    deleteBackup: builder.mutation<void, string>({
      query: (backupId) => ({
        url: `/admin/system/backup/${backupId}`,
        method: 'DELETE',
      }),
    }),

    // Clear sync logs
    clearSyncLogs: builder.mutation<{ message: string }, {
      olderThan?: string;
      status?: 'success' | 'error';
    }>({
      query: (options) => ({
        url: '/admin/system/sync-logs/clear',
        method: 'POST',
        body: options,
      }),
    }),

    // Reset sync queue
    resetSyncQueue: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: '/admin/system/sync-queue/reset',
        method: 'POST',
      }),
    }),

    // Get system configuration
    getSystemConfig: builder.query<{
      syncInterval: number;
      backupInterval: number;
      logRetentionDays: number;
      maxSyncRetries: number;
    }, void>({
      query: () => '/admin/system/config',
    }),

    // Update system configuration
    updateSystemConfig: builder.mutation<void, {
      syncInterval?: number;
      backupInterval?: number;
      logRetentionDays?: number;
      maxSyncRetries?: number;
    }>({
      query: (config) => ({
        url: '/admin/system/config',
        method: 'PUT',
        body: config,
      }),
    }),
  }),
});

export const {
  useGetSyncStatusQuery,
  useGetSystemHealthQuery,
  useGetSyncLogsQuery,
  useGetConflictsQuery,
  useGetSystemStatsQuery,
  useGetBackupsQuery,
  useTriggerSyncMutation,
  useResolveConflictMutation,
  useCreateBackupMutation,
  useRestoreBackupMutation,
  useDeleteBackupMutation,
  useClearSyncLogsMutation,
  useResetSyncQueueMutation,
  useGetSystemConfigQuery,
  useUpdateSystemConfigMutation,
} = systemApi;