import { SyncQueue, SyncQueueEntry } from '../../models/SyncQueue';

describe('SyncQueue', () => {
  describe('validateEntry', () => {
    it('should return no errors for valid entry', () => {
      const entry: Partial<SyncQueueEntry> = {
        operation: 'create',
        entityType: 'employee',
        entityId: 'emp-123',
        data: { name: 'John Doe' }
      };

      const errors = SyncQueue.validateEntry(entry);
      expect(errors).toHaveLength(0);
    });

    it('should require valid operation', () => {
      const entry: Partial<SyncQueueEntry> = {
        operation: 'invalid' as any,
        entityType: 'employee',
        entityId: 'emp-123',
        data: { name: 'John Doe' }
      };

      const errors = SyncQueue.validateEntry(entry);
      expect(errors).toContain('Operation must be create, update, or delete');
    });

    it('should require entity type', () => {
      const entry: Partial<SyncQueueEntry> = {
        operation: 'create',
        entityType: '',
        entityId: 'emp-123',
        data: { name: 'John Doe' }
      };

      const errors = SyncQueue.validateEntry(entry);
      expect(errors).toContain('Entity type is required');
    });

    it('should require entity ID', () => {
      const entry: Partial<SyncQueueEntry> = {
        operation: 'create',
        entityType: 'employee',
        entityId: '',
        data: { name: 'John Doe' }
      };

      const errors = SyncQueue.validateEntry(entry);
      expect(errors).toContain('Entity ID is required');
    });

    it('should require data for create and update operations', () => {
      const createEntry: Partial<SyncQueueEntry> = {
        operation: 'create',
        entityType: 'employee',
        entityId: 'emp-123'
      };

      const updateEntry: Partial<SyncQueueEntry> = {
        operation: 'update',
        entityType: 'employee',
        entityId: 'emp-123'
      };

      expect(SyncQueue.validateEntry(createEntry)).toContain('Data is required for create and update operations');
      expect(SyncQueue.validateEntry(updateEntry)).toContain('Data is required for create and update operations');
    });

    it('should not require data for delete operations', () => {
      const entry: Partial<SyncQueueEntry> = {
        operation: 'delete',
        entityType: 'employee',
        entityId: 'emp-123'
      };

      const errors = SyncQueue.validateEntry(entry);
      expect(errors).not.toContain('Data is required for create and update operations');
    });
  });

  describe('createEntry', () => {
    it('should create valid entry with all required fields', () => {
      const entry = SyncQueue.createEntry('create', 'employee', 'emp-123', { name: 'John' });

      expect(entry.operation).toBe('create');
      expect(entry.entityType).toBe('employee');
      expect(entry.entityId).toBe('emp-123');
      expect(entry.data).toEqual({ name: 'John' });
      expect(entry.attempts).toBe(0);
      expect(entry.status).toBe('pending');
      expect(entry.createdAt).toBeInstanceOf(Date);
      expect(entry.updatedAt).toBeInstanceOf(Date);
    });

    it('should handle null data for delete operations', () => {
      const entry = SyncQueue.createEntry('delete', 'employee', 'emp-123');

      expect(entry.data).toBeNull();
    });
  });

  describe('shouldRetry', () => {
    it('should return true for failed entries under max attempts', () => {
      const entry: SyncQueueEntry = {
        id: '1',
        operation: 'create',
        entityType: 'employee',
        entityId: 'emp-123',
        data: {},
        attempts: 3,
        status: 'failed',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(SyncQueue.shouldRetry(entry)).toBe(true);
    });

    it('should return false for entries at max attempts', () => {
      const entry: SyncQueueEntry = {
        id: '1',
        operation: 'create',
        entityType: 'employee',
        entityId: 'emp-123',
        data: {},
        attempts: 5,
        status: 'failed',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(SyncQueue.shouldRetry(entry)).toBe(false);
    });

    it('should return false for non-failed entries', () => {
      const entry: SyncQueueEntry = {
        id: '1',
        operation: 'create',
        entityType: 'employee',
        entityId: 'emp-123',
        data: {},
        attempts: 2,
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(SyncQueue.shouldRetry(entry)).toBe(false);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff delays', () => {
      expect(SyncQueue.calculateRetryDelay(0)).toBe(1000);  // 1s
      expect(SyncQueue.calculateRetryDelay(1)).toBe(2000);  // 2s
      expect(SyncQueue.calculateRetryDelay(2)).toBe(4000);  // 4s
      expect(SyncQueue.calculateRetryDelay(3)).toBe(8000);  // 8s
      expect(SyncQueue.calculateRetryDelay(4)).toBe(16000); // 16s
    });
  });

  describe('detectConflict', () => {
    it('should detect no conflict when both data are null', () => {
      const result = SyncQueue.detectConflict(null, null);
      expect(result.hasConflict).toBe(false);
    });

    it('should detect deletion conflict when one exists and other does not', () => {
      const localData = { id: '1', name: 'John' };
      const result = SyncQueue.detectConflict(localData, null);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe('deletion');
      expect(result.localData).toEqual(localData);
      expect(result.remoteData).toBeNull();
    });

    it('should detect timestamp conflict when both modified after last sync', () => {
      const lastSync = new Date('2023-01-01T10:00:00Z');
      const localData = { 
        id: '1', 
        name: 'John Local', 
        updatedAt: new Date('2023-01-01T11:00:00Z') 
      };
      const remoteData = { 
        id: '1', 
        name: 'John Remote', 
        updatedAt: new Date('2023-01-01T12:00:00Z') 
      };

      const result = SyncQueue.detectConflict(localData, remoteData, lastSync);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe('timestamp');
      expect(result.conflictFields).toContain('name');
    });

    it('should detect data conflicts by comparing field values', () => {
      const localData = { id: '1', name: 'John', age: 30 };
      const remoteData = { id: '1', name: 'Jane', age: 30 };

      const result = SyncQueue.detectConflict(localData, remoteData);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe('data');
      expect(result.conflictFields).toEqual(['name']);
    });

    it('should ignore metadata fields in conflict detection', () => {
      const localData = { 
        id: '1', 
        name: 'John', 
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-02'),
        lastSyncAt: new Date('2023-01-03')
      };
      const remoteData = { 
        id: '1', 
        name: 'John', 
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-04'),
        lastSyncAt: new Date('2023-01-05')
      };

      const result = SyncQueue.detectConflict(localData, remoteData);

      expect(result.hasConflict).toBe(false);
    });

    it('should not detect conflict when data is identical', () => {
      const data = { id: '1', name: 'John', age: 30 };
      const result = SyncQueue.detectConflict(data, { ...data });

      expect(result.hasConflict).toBe(false);
    });
  });

  describe('status management', () => {
    let baseEntry: SyncQueueEntry;

    beforeEach(() => {
      baseEntry = {
        id: '1',
        operation: 'create',
        entityType: 'employee',
        entityId: 'emp-123',
        data: { name: 'John' },
        attempts: 0,
        status: 'pending',
        createdAt: new Date('2023-01-01T10:00:00Z'),
        updatedAt: new Date('2023-01-01T10:00:00Z')
      };
    });

    it('should mark entry as processing', () => {
      const result = SyncQueue.markAsProcessing(baseEntry);

      expect(result.status).toBe('processing');
      expect(result.updatedAt.getTime()).toBeGreaterThan(baseEntry.updatedAt.getTime());
    });

    it('should mark entry as completed', () => {
      const result = SyncQueue.markAsCompleted(baseEntry);

      expect(result.status).toBe('completed');
      expect(result.updatedAt.getTime()).toBeGreaterThan(baseEntry.updatedAt.getTime());
    });

    it('should mark entry as failed and increment attempts', () => {
      const conflictData = { error: 'Conflict detected' };
      const result = SyncQueue.markAsFailed(baseEntry, conflictData);

      expect(result.status).toBe('failed');
      expect(result.attempts).toBe(1);
      expect(result.lastAttempt).toBeInstanceOf(Date);
      expect(result.updatedAt.getTime()).toBeGreaterThan(baseEntry.updatedAt.getTime());
      expect(result.conflictData).toEqual(conflictData);
    });
  });
});