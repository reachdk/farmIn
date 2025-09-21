import { DatabaseManager } from '../../database/DatabaseManager';
import { SyncQueueRepository } from '../../repositories/SyncQueueRepository';
import { SyncQueue } from '../../models/SyncQueue';

describe('SyncQueueRepository', () => {
  let db: DatabaseManager;
  let repository: SyncQueueRepository;

  beforeAll(async () => {
    db = DatabaseManager.getInstance();
    await db.initialize();
    repository = new SyncQueueRepository(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clean up tables in correct order due to foreign key constraints
    await db.run('DELETE FROM conflict_resolution_log');
    await db.run('DELETE FROM conflict_resolutions');
    await db.run('DELETE FROM sync_queue');
  });

  describe('addToQueue', () => {
    it('should add entry to queue with generated ID', async () => {
      const entry = await repository.addToQueue('create', 'employee', 'emp-123', { name: 'John' });

      expect(entry.id).toBeDefined();
      expect(entry.operation).toBe('create');
      expect(entry.entityType).toBe('employee');
      expect(entry.entityId).toBe('emp-123');
      expect(entry.data).toEqual({ name: 'John' });
      expect(entry.status).toBe('pending');
      expect(entry.attempts).toBe(0);
    });

    it('should handle null data for delete operations', async () => {
      const entry = await repository.addToQueue('delete', 'employee', 'emp-123');

      expect(entry.data).toBeNull();
      expect(entry.operation).toBe('delete');
    });
  });

  describe('getPendingEntries', () => {
    beforeEach(async () => {
      await repository.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      await repository.addToQueue('update', 'employee', 'emp-2', { name: 'Jane' });
      
      // Add a completed entry that should not be returned
      const completedEntry = await repository.addToQueue('create', 'employee', 'emp-3', { name: 'Bob' });
      const updated = SyncQueue.markAsCompleted(completedEntry);
      await repository.updateEntry(updated);
    });

    it('should return only pending and failed entries', async () => {
      const entries = await repository.getPendingEntries();

      expect(entries).toHaveLength(2);
      expect(entries.every(e => ['pending', 'failed'].includes(e.status))).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const entries = await repository.getPendingEntries(1);

      expect(entries).toHaveLength(1);
    });

    it('should return entries in creation order', async () => {
      const entries = await repository.getPendingEntries();

      expect(entries[0].entityId).toBe('emp-1');
      expect(entries[1].entityId).toBe('emp-2');
    });
  });

  describe('getEntryById', () => {
    it('should return entry by ID', async () => {
      const created = await repository.addToQueue('create', 'employee', 'emp-123', { name: 'John' });
      const found = await repository.getEntryById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.entityId).toBe('emp-123');
    });

    it('should return null for non-existent ID', async () => {
      const found = await repository.getEntryById('non-existent');

      expect(found).toBeNull();
    });
  });

  describe('updateEntry', () => {
    it('should update entry status and metadata', async () => {
      const entry = await repository.addToQueue('create', 'employee', 'emp-123', { name: 'John' });
      
      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const updated = SyncQueue.markAsProcessing(entry);
      await repository.updateEntry(updated);

      const found = await repository.getEntryById(entry.id);
      expect(found!.status).toBe('processing');
      expect(found!.updatedAt.getTime()).toBeGreaterThan(entry.updatedAt.getTime());
    });

    it('should update conflict data', async () => {
      const entry = await repository.addToQueue('create', 'employee', 'emp-123', { name: 'John' });
      const conflictData = { error: 'Conflict detected' };
      const failed = SyncQueue.markAsFailed(entry, conflictData);

      await repository.updateEntry(failed);

      const found = await repository.getEntryById(entry.id);
      expect(found!.status).toBe('failed');
      expect(found!.attempts).toBe(1);
      expect(found!.conflictData).toEqual(conflictData);
      expect(found!.lastAttempt).toBeDefined();
    });
  });

  describe('removeEntry', () => {
    it('should remove entry from queue', async () => {
      const entry = await repository.addToQueue('create', 'employee', 'emp-123', { name: 'John' });

      await repository.removeEntry(entry.id);

      const found = await repository.getEntryById(entry.id);
      expect(found).toBeNull();
    });
  });

  describe('getEntriesForEntity', () => {
    beforeEach(async () => {
      await repository.addToQueue('create', 'employee', 'emp-123', { name: 'John' });
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      await repository.addToQueue('update', 'employee', 'emp-123', { name: 'John Updated' });
      await new Promise(resolve => setTimeout(resolve, 10));
      await repository.addToQueue('create', 'employee', 'emp-456', { name: 'Jane' });
    });

    it('should return entries for specific entity', async () => {
      const entries = await repository.getEntriesForEntity('employee', 'emp-123');

      expect(entries).toHaveLength(2);
      expect(entries.every(e => e.entityId === 'emp-123')).toBe(true);
    });

    it('should return entries in reverse creation order', async () => {
      const entries = await repository.getEntriesForEntity('employee', 'emp-123');

      expect(entries[0].operation).toBe('update'); // Most recent first
      expect(entries[1].operation).toBe('create');
    });
  });

  describe('getFailedEntries', () => {
    beforeEach(async () => {
      const entry1 = await repository.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      const entry2 = await repository.addToQueue('create', 'employee', 'emp-2', { name: 'Jane' });
      
      const failed1 = SyncQueue.markAsFailed(entry1);
      const failed2 = SyncQueue.markAsFailed(entry2);
      
      await repository.updateEntry(failed1);
      await repository.updateEntry(failed2);
    });

    it('should return only failed entries', async () => {
      const entries = await repository.getFailedEntries();

      expect(entries).toHaveLength(2);
      expect(entries.every(e => e.status === 'failed')).toBe(true);
    });
  });

  describe('getRetryableEntries', () => {
    beforeEach(async () => {
      // Create entry with max attempts (should not be retryable)
      const maxAttemptsEntry = await repository.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      let failed = maxAttemptsEntry;
      for (let i = 0; i < 5; i++) {
        failed = SyncQueue.markAsFailed(failed);
      }
      await repository.updateEntry(failed);

      // Create entry with few attempts (should be retryable)
      const retryableEntry = await repository.addToQueue('create', 'employee', 'emp-2', { name: 'Jane' });
      const failedRetryable = SyncQueue.markAsFailed(retryableEntry);
      await repository.updateEntry(failedRetryable);
    });

    it('should return only retryable failed entries', async () => {
      const entries = await repository.getRetryableEntries();

      expect(entries).toHaveLength(1);
      expect(entries[0].entityId).toBe('emp-2');
      expect(entries[0].attempts).toBeLessThan(5);
    });
  });

  describe('clearCompletedEntries', () => {
    beforeEach(async () => {
      // Create old completed entry
      const oldEntry = await repository.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      const oldCompleted = SyncQueue.markAsCompleted(oldEntry);
      await repository.updateEntry(oldCompleted);
      
      // Manually set old date
      await db.run(
        'UPDATE sync_queue SET updated_at = ? WHERE id = ?',
        [new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), oldEntry.id]
      );

      // Create recent completed entry
      const recentEntry = await repository.addToQueue('create', 'employee', 'emp-2', { name: 'Jane' });
      const recentCompleted = SyncQueue.markAsCompleted(recentEntry);
      await repository.updateEntry(recentCompleted);
    });

    it('should remove old completed entries', async () => {
      const removedCount = await repository.clearCompletedEntries(7);

      expect(removedCount).toBe(1);

      const remaining = await repository.getPendingEntries();
      expect(remaining).toHaveLength(0); // Recent completed entry should remain
    });
  });

  describe('getQueueStats', () => {
    beforeEach(async () => {
      // Create entries with different statuses
      await repository.addToQueue('create', 'employee', 'emp-1', { name: 'John' }); // pending
      
      const entry2 = await repository.addToQueue('create', 'employee', 'emp-2', { name: 'Jane' });
      const processing = SyncQueue.markAsProcessing(entry2);
      await repository.updateEntry(processing);

      const entry3 = await repository.addToQueue('create', 'employee', 'emp-3', { name: 'Bob' });
      const completed = SyncQueue.markAsCompleted(entry3);
      await repository.updateEntry(completed);

      const entry4 = await repository.addToQueue('create', 'employee', 'emp-4', { name: 'Alice' });
      const failed = SyncQueue.markAsFailed(entry4);
      await repository.updateEntry(failed);
    });

    it('should return correct statistics', async () => {
      const stats = await repository.getQueueStats();

      expect(stats.pending).toBe(1);
      expect(stats.processing).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.total).toBe(4);
    });
  });
});