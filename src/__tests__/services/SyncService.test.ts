import { SyncService } from '../../services/SyncService';
import { ConnectivityService } from '../../services/ConnectivityService';
import { SyncQueueRepository } from '../../repositories/SyncQueueRepository';
import { DatabaseManager } from '../../database/DatabaseManager';
import { SyncQueue } from '../../models/SyncQueue';

// Mock fetch for ConnectivityService
global.fetch = jest.fn();

describe('SyncService', () => {
  let syncService: SyncService;
  let connectivityService: ConnectivityService;
  let syncQueueRepo: SyncQueueRepository;
  let db: DatabaseManager;

  beforeAll(async () => {
    db = DatabaseManager.getInstance();
    await db.initialize();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Reset singletons
    (SyncService as any).instance = undefined;
    (ConnectivityService as any).instance = undefined;

    // Clean up database in correct order due to foreign key constraints
    await db.run('DELETE FROM conflict_resolution_log');
    await db.run('DELETE FROM conflict_resolutions');
    await db.run('DELETE FROM sync_queue');
    await db.run('DELETE FROM sync_log');

    // Create services
    connectivityService = ConnectivityService.getInstance({
      checkInterval: 100,
      timeout: 50,
      endpoints: ['https://test.com']
    });
    
    syncQueueRepo = new SyncQueueRepository(db);
    
    syncService = SyncService.getInstance(syncQueueRepo, connectivityService, {
      batchSize: 5,
      syncInterval: 100,
      autoSyncEnabled: true
    });

    // Mock fetch to return online by default
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      status: 200
    } as Response);
  });

  afterEach(() => {
    syncService.stop();
    connectivityService.stop();
  });

  describe('initialization', () => {
    it('should create singleton instance', () => {
      const instance1 = SyncService.getInstance(syncQueueRepo, connectivityService);
      const instance2 = SyncService.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should throw error if required dependencies not provided on first call', () => {
      (SyncService as any).instance = undefined;
      
      expect(() => {
        SyncService.getInstance();
      }).toThrow('SyncQueueRepository and ConnectivityService are required for first initialization');
    });
  });

  describe('connectivity integration', () => {
    it('should trigger sync when connectivity is restored', async () => {
      const syncStartedHandler = jest.fn();
      syncService.on('syncStarted', syncStartedHandler);

      // Add some entries to sync
      await syncQueueRepo.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      
      // Start service
      await syncService.start();
      
      // Simulate going offline then online
      connectivityService.setStatus(false);
      connectivityService.setStatus(true);
      connectivityService.emit('online', connectivityService.getStatus());

      // Wait for sync to trigger
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(syncStartedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'connectivity-restored'
        })
      );
    });

    it('should pause sync when connectivity is lost', async () => {
      const syncPausedHandler = jest.fn();
      syncService.on('syncPaused', syncPausedHandler);

      await syncService.start();
      
      // Simulate going offline
      connectivityService.setStatus(false);
      connectivityService.emit('offline', connectivityService.getStatus());

      expect(syncPausedHandler).toHaveBeenCalledWith({
        reason: 'connectivity-lost'
      });
    });
  });

  describe('sync operations', () => {
    beforeEach(async () => {
      // Ensure we're online
      connectivityService.setStatus(true);
    });

    it('should sync pending entries successfully', async () => {
      // Add test entries
      await syncQueueRepo.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      await syncQueueRepo.addToQueue('update', 'employee', 'emp-2', { name: 'Jane' });

      const result = await syncService.triggerSync('manual');

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Check that entries are marked as completed
      const stats = await syncService.getQueueStats();
      expect(stats.completed).toBe(2);
      expect(stats.pending).toBe(0);
    });

    it('should handle sync failures gracefully', async () => {
      // Mock the simulateExternalSync to always fail
      const originalMethod = (syncService as any).simulateExternalSync;
      (syncService as any).simulateExternalSync = jest.fn().mockRejectedValue(new Error('Sync failed'));

      await syncQueueRepo.addToQueue('create', 'employee', 'emp-1', { name: 'John' });

      const result = await syncService.triggerSync('manual');

      expect(result.success).toBe(false);
      expect(result.processedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);

      // Restore original method
      (syncService as any).simulateExternalSync = originalMethod;
    });

    it('should respect batch size limits', async () => {
      // Add more entries than batch size
      for (let i = 0; i < 10; i++) {
        await syncQueueRepo.addToQueue('create', 'employee', `emp-${i}`, { name: `User ${i}` });
      }

      const result = await syncService.triggerSync('manual');

      // Should only process batch size (5) entries
      expect(result.processedCount).toBeLessThanOrEqual(5);
    });

    it('should throw error when trying to sync while offline', async () => {
      connectivityService.setStatus(false);

      await expect(syncService.triggerSync('manual')).rejects.toThrow('Cannot sync while offline');
    });

    it('should prevent concurrent syncs beyond limit', async () => {
      // Set max concurrent syncs to 1 for testing
      syncService.updateOptions({ maxConcurrentSyncs: 1 });

      await syncQueueRepo.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      await syncQueueRepo.addToQueue('create', 'employee', 'emp-2', { name: 'Jane' });

      // Start first sync (will be slow due to mocked delay)
      const sync1Promise = syncService.triggerSync('manual');

      // Try to start second sync immediately
      await expect(syncService.triggerSync('manual')).rejects.toThrow('Maximum concurrent syncs reached');

      // Wait for first sync to complete
      await sync1Promise;
    });
  });

  describe('retry mechanism', () => {
    beforeEach(() => {
      // Ensure we're online for retry tests
      connectivityService.setStatus(true);
    });

    it('should retry failed entries', async () => {
      // Add entry and mark it as failed
      const entry = await syncQueueRepo.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      const failed = SyncQueue.markAsFailed(entry);
      await syncQueueRepo.updateEntry(failed);

      const result = await syncService.retryFailedEntries();

      expect(result.processedCount).toBe(1);
      expect(result.success).toBe(true);
    });

    it('should not retry entries that exceeded max attempts', async () => {
      // Add entry and mark it as failed with max attempts
      let entry = await syncQueueRepo.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      
      // Fail it 5 times (max attempts)
      for (let i = 0; i < 5; i++) {
        entry = SyncQueue.markAsFailed(entry);
      }
      await syncQueueRepo.updateEntry(entry);

      const result = await syncService.retryFailedEntries();

      expect(result.processedCount).toBe(0);
      expect(result.success).toBe(true);
    });
  });

  describe('queue management', () => {
    it('should get queue statistics', async () => {
      await syncQueueRepo.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      
      const entry2 = await syncQueueRepo.addToQueue('create', 'employee', 'emp-2', { name: 'Jane' });
      const completed = SyncQueue.markAsCompleted(entry2);
      await syncQueueRepo.updateEntry(completed);

      const stats = await syncService.getQueueStats();

      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.total).toBe(2);
    });

    it('should get failed entries', async () => {
      const entry = await syncQueueRepo.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      const failed = SyncQueue.markAsFailed(entry);
      await syncQueueRepo.updateEntry(failed);

      const failedEntries = await syncService.getFailedEntries();

      expect(failedEntries).toHaveLength(1);
      expect(failedEntries[0].status).toBe('failed');
    });

    it('should clear completed entries', async () => {
      const entry = await syncQueueRepo.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      const completed = SyncQueue.markAsCompleted(entry);
      await syncQueueRepo.updateEntry(completed);

      // Manually set old date
      await db.run(
        'UPDATE sync_queue SET updated_at = ? WHERE id = ?',
        [new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), entry.id]
      );

      const removedCount = await syncService.clearCompletedEntries(7);

      expect(removedCount).toBe(1);
    });
  });

  describe('sync logging', () => {
    beforeEach(() => {
      // Ensure we're online for logging tests
      connectivityService.setStatus(true);
    });

    it('should log sync operations', async () => {
      await syncQueueRepo.addToQueue('create', 'employee', 'emp-1', { name: 'John' });

      await syncService.triggerSync('manual');

      const history = await syncService.getSyncHistory(10);

      expect(history).toHaveLength(1);
      expect(history[0].syncType).toBe('manual');
      expect(history[0].status).toBe('completed');
      expect(history[0].recordsProcessed).toBe(1);
    });

    it('should log failed sync operations', async () => {
      // Mock sync to fail by overriding the method directly
      const originalPerformSync = (syncService as any).performSync;
      (syncService as any).performSync = jest.fn().mockRejectedValue(new Error('Sync failed'));

      await syncQueueRepo.addToQueue('create', 'employee', 'emp-1', { name: 'John' });

      try {
        await syncService.triggerSync('manual');
      } catch (error) {
        // Expected to fail
      }

      const history = await syncService.getSyncHistory(10);

      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('failed');
      expect(history[0].errors).toBeDefined();

      // Restore original method
      (syncService as any).performSync = originalPerformSync;
    });
  });

  describe('service lifecycle', () => {
    it('should start and stop service', async () => {
      const startedHandler = jest.fn();
      const stoppedHandler = jest.fn();
      
      syncService.on('started', startedHandler);
      syncService.on('stopped', stoppedHandler);

      await syncService.start();
      expect(startedHandler).toHaveBeenCalled();
      expect(syncService.isActive()).toBe(false); // No active syncs initially

      syncService.stop();
      expect(stoppedHandler).toHaveBeenCalled();
    });

    it('should track active sync count', async () => {
      // Ensure we're online
      connectivityService.setStatus(true);
      
      expect(syncService.getActiveSyncCount()).toBe(0);

      await syncQueueRepo.addToQueue('create', 'employee', 'emp-1', { name: 'John' });
      
      // Mock a slower sync to test active count
      const originalMethod = (syncService as any).simulateExternalSync;
      (syncService as any).simulateExternalSync = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );
      
      const syncPromise = syncService.triggerSync('manual');
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // During sync, count should be 1
      expect(syncService.getActiveSyncCount()).toBe(1);
      expect(syncService.isActive()).toBe(true);

      await syncPromise;

      // After sync, count should be 0
      expect(syncService.getActiveSyncCount()).toBe(0);
      expect(syncService.isActive()).toBe(false);

      // Restore original method
      (syncService as any).simulateExternalSync = originalMethod;
    });
  });
});