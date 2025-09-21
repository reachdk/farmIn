export interface SyncQueueEntry {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entityType: string;
  entityId: string;
  data: any;
  attempts: number;
  lastAttempt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  conflictData?: any;
}

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictType?: 'timestamp' | 'data' | 'deletion';
  localData?: any;
  remoteData?: any;
  conflictFields?: string[];
}

export class SyncQueue {
  private static readonly MAX_RETRY_ATTEMPTS = 5;
  private static readonly INITIAL_RETRY_DELAY = 1000; // 1 second

  static validateEntry(entry: Partial<SyncQueueEntry>): string[] {
    const errors: string[] = [];

    if (!entry.operation || !['create', 'update', 'delete'].includes(entry.operation)) {
      errors.push('Operation must be create, update, or delete');
    }

    if (!entry.entityType || entry.entityType.trim().length === 0) {
      errors.push('Entity type is required');
    }

    if (!entry.entityId || entry.entityId.trim().length === 0) {
      errors.push('Entity ID is required');
    }

    if (entry.operation !== 'delete' && !entry.data) {
      errors.push('Data is required for create and update operations');
    }

    return errors;
  }

  static createEntry(
    operation: SyncQueueEntry['operation'],
    entityType: string,
    entityId: string,
    data?: any
  ): Omit<SyncQueueEntry, 'id'> {
    const now = new Date();
    return {
      operation,
      entityType,
      entityId,
      data: data || null,
      attempts: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };
  }

  static shouldRetry(entry: SyncQueueEntry): boolean {
    return entry.attempts < this.MAX_RETRY_ATTEMPTS && entry.status === 'failed';
  }

  static calculateRetryDelay(attempts: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    return this.INITIAL_RETRY_DELAY * Math.pow(2, attempts);
  }

  static detectConflict(localData: any, remoteData: any, lastSyncTimestamp?: Date): ConflictDetectionResult {
    if (!localData && !remoteData) {
      return { hasConflict: false };
    }

    // If one exists and the other doesn't, it's a deletion conflict
    if ((localData && !remoteData) || (!localData && remoteData)) {
      return {
        hasConflict: true,
        conflictType: 'deletion',
        localData,
        remoteData
      };
    }

    // Check timestamp conflicts
    if (localData.updatedAt && remoteData.updatedAt) {
      const localTime = new Date(localData.updatedAt);
      const remoteTime = new Date(remoteData.updatedAt);
      
      if (lastSyncTimestamp) {
        const syncTime = new Date(lastSyncTimestamp);
        // Both modified after last sync = conflict
        if (localTime > syncTime && remoteTime > syncTime) {
          return {
            hasConflict: true,
            conflictType: 'timestamp',
            localData,
            remoteData,
            conflictFields: this.findConflictingFields(localData, remoteData)
          };
        }
      }
    }

    // Check data conflicts by comparing field values
    const conflictFields = this.findConflictingFields(localData, remoteData);
    if (conflictFields.length > 0) {
      return {
        hasConflict: true,
        conflictType: 'data',
        localData,
        remoteData,
        conflictFields
      };
    }

    return { hasConflict: false };
  }

  private static findConflictingFields(localData: any, remoteData: any): string[] {
    const conflicts: string[] = [];
    const allKeys = new Set([...Object.keys(localData || {}), ...Object.keys(remoteData || {})]);

    for (const key of allKeys) {
      // Skip metadata fields
      if (['id', 'createdAt', 'updatedAt', 'lastSyncAt'].includes(key)) {
        continue;
      }

      const localValue = localData?.[key];
      const remoteValue = remoteData?.[key];

      if (JSON.stringify(localValue) !== JSON.stringify(remoteValue)) {
        conflicts.push(key);
      }
    }

    return conflicts;
  }

  static markAsProcessing(entry: SyncQueueEntry): SyncQueueEntry {
    return {
      ...entry,
      status: 'processing',
      updatedAt: new Date()
    };
  }

  static markAsCompleted(entry: SyncQueueEntry): SyncQueueEntry {
    return {
      ...entry,
      status: 'completed',
      updatedAt: new Date()
    };
  }

  static markAsFailed(entry: SyncQueueEntry, conflictData?: any): SyncQueueEntry {
    return {
      ...entry,
      status: 'failed',
      attempts: entry.attempts + 1,
      lastAttempt: new Date(),
      updatedAt: new Date(),
      conflictData
    };
  }
}