import { ConflictResolutionService } from '../../services/ConflictResolutionService';
import { DatabaseManager } from '../../database/DatabaseManager';
import { SyncQueueRepository } from '../../repositories/SyncQueueRepository';

describe('ConflictResolutionService', () => {
  let service: ConflictResolutionService;
  let db: DatabaseManager;
  let syncQueueRepo: SyncQueueRepository;

  beforeAll(async () => {
    db = DatabaseManager.getInstance();
    await db.initialize();
    syncQueueRepo = new SyncQueueRepository(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Reset singleton
    (ConflictResolutionService as any).instance = undefined;
    service = ConflictResolutionService.getInstance(db);

    // Clean up tables in correct order due to foreign key constraints
    await db.run('DELETE FROM conflict_resolution_log');
    await db.run('DELETE FROM conflict_resolutions');
    await db.run('DELETE FROM auto_resolution_rules');
    await db.run('DELETE FROM sync_queue');
  });

  describe('initialization', () => {
    it('should create singleton instance', () => {
      const instance1 = ConflictResolutionService.getInstance(db);
      const instance2 = ConflictResolutionService.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should throw error if DatabaseManager not provided on first call', () => {
      (ConflictResolutionService as any).instance = undefined;
      
      expect(() => {
        ConflictResolutionService.getInstance();
      }).toThrow('DatabaseManager is required for first initialization');
    });
  });

  describe('conflict detection', () => {
    it('should detect no conflict when data is identical', async () => {
      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { 
        name: 'John', 
        updatedAt: '2023-01-01T10:00:00Z' 
      });
      
      const remoteData = { 
        name: 'John', 
        updatedAt: '2023-01-01T10:00:00Z' 
      };

      const conflict = await service.detectAndResolveConflict(entry, remoteData);
      expect(conflict).toBeNull();
    });

    it('should detect data conflict when fields differ', async () => {
      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { 
        name: 'John Local',
        email: 'john@local.com',
        updatedAt: '2023-01-01T10:00:00Z' 
      });
      
      const remoteData = { 
        name: 'John Remote',
        email: 'john@local.com',
        updatedAt: '2023-01-01T10:00:00Z' 
      };

      const conflict = await service.detectAndResolveConflict(entry, remoteData);
      
      expect(conflict).toBeDefined();
      expect(conflict!.conflictType).toBe('data');
      expect(conflict!.conflictFields).toContain('name');
      expect(conflict!.conflictFields).not.toContain('email');
    });

    it('should detect timestamp conflict when both modified after sync', async () => {
      const lastSync = new Date('2023-01-01T09:00:00Z');
      
      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { 
        name: 'John Local',
        updatedAt: '2023-01-01T10:00:00Z' 
      });
      
      const remoteData = { 
        name: 'John Remote',
        updatedAt: '2023-01-01T11:00:00Z' 
      };

      const conflict = await service.detectAndResolveConflict(entry, remoteData, lastSync);
      
      expect(conflict).toBeDefined();
      expect(conflict!.conflictType).toBe('timestamp');
    });

    it('should detect deletion conflict', async () => {
      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { 
        name: 'John',
        updatedAt: '2023-01-01T10:00:00Z' 
      });
      
      const remoteData = null; // Deleted remotely

      const conflict = await service.detectAndResolveConflict(entry, remoteData);
      
      expect(conflict).toBeDefined();
      expect(conflict!.conflictType).toBe('deletion');
    });

    it('should not detect conflict within timestamp tolerance', async () => {
      const lastSync = new Date('2023-01-01T09:00:00Z');
      
      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { 
        name: 'John',
        updatedAt: '2023-01-01T10:00:00Z' 
      });
      
      const remoteData = { 
        name: 'John',
        updatedAt: '2023-01-01T10:00:00.500Z' // Within 1 second tolerance
      };

      const conflict = await service.detectAndResolveConflict(entry, remoteData, lastSync);
      expect(conflict).toBeNull();
    });
  });

  describe('auto resolution', () => {
    it('should auto-resolve using default resolution', async () => {
      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { 
        name: 'John Local',
        updatedAt: '2023-01-01T10:00:00Z' 
      });
      
      const remoteData = { 
        name: 'John Remote',
        updatedAt: '2023-01-01T10:00:00Z' 
      };

      const conflict = await service.detectAndResolveConflict(entry, remoteData);
      
      expect(conflict).toBeDefined();
      expect(conflict!.status).toBe('resolved');
      expect(conflict!.resolution).toBe('use_local'); // Default resolution
      expect(conflict!.resolvedData.name).toBe('John Local');
    });

    it('should apply auto resolution rules', async () => {
      // Create a rule that prefers remote data for name conflicts
      await service.createAutoResolutionRule({
        entityType: 'employee',
        conflictType: 'data',
        fieldPattern: 'name',
        resolution: 'use_remote',
        priority: 10,
        isActive: true
      });

      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { 
        name: 'John Local',
        updatedAt: '2023-01-01T10:00:00Z' 
      });
      
      const remoteData = { 
        name: 'John Remote',
        updatedAt: '2023-01-01T10:00:00Z' 
      };

      const conflict = await service.detectAndResolveConflict(entry, remoteData);
      
      expect(conflict).toBeDefined();
      expect(conflict!.status).toBe('resolved');
      expect(conflict!.resolution).toBe('use_remote');
      expect(conflict!.resolvedData.name).toBe('John Remote');
    });

    it('should apply highest priority rule', async () => {
      // Create two rules with different priorities
      await service.createAutoResolutionRule({
        entityType: 'employee',
        conflictType: 'data',
        resolution: 'use_remote',
        priority: 5,
        isActive: true
      });

      await service.createAutoResolutionRule({
        entityType: 'employee',
        conflictType: 'data',
        resolution: 'merge',
        priority: 10,
        isActive: true
      });

      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { 
        name: 'John Local',
        updatedAt: '2023-01-01T10:00:00Z' 
      });
      
      const remoteData = { 
        name: 'John Remote',
        updatedAt: '2023-01-01T11:00:00Z' 
      };

      const conflict = await service.detectAndResolveConflict(entry, remoteData);
      
      expect(conflict).toBeDefined();
      expect(conflict!.resolution).toBe('merge'); // Higher priority rule
    });
  });

  describe('manual resolution', () => {
    it('should allow manual resolution of conflicts', async () => {
      // Disable auto resolution
      service.updateOptions({ autoResolveEnabled: false });

      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { 
        name: 'John Local',
        updatedAt: '2023-01-01T10:00:00Z' 
      });
      
      const remoteData = { 
        name: 'John Remote',
        updatedAt: '2023-01-01T10:00:00Z' 
      };

      const conflict = await service.detectAndResolveConflict(entry, remoteData);
      
      expect(conflict).toBeDefined();
      expect(conflict!.status).toBe('pending');

      // Manually resolve
      const resolved = await service.applyResolution(conflict!, 'use_remote', 'admin-user');
      
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolution).toBe('use_remote');
      expect(resolved.resolvedBy).toBe('admin-user');
      expect(resolved.resolvedData.name).toBe('John Remote');
    });
  });

  describe('merge resolution', () => {
    it('should merge data using timestamp-based strategy', async () => {
      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { 
        name: 'John Local',
        email: 'john@local.com',
        updatedAt: '2023-01-01T10:00:00Z' 
      });
      
      const remoteData = { 
        name: 'John Remote',
        email: 'john@remote.com',
        updatedAt: '2023-01-01T11:00:00Z' // More recent
      };

      const conflict = await service.detectAndResolveConflict(entry, remoteData);
      const resolved = await service.applyResolution(conflict!, 'merge');
      
      // Should use remote values since they're more recent
      expect(resolved.resolvedData.name).toBe('John Remote');
      expect(resolved.resolvedData.email).toBe('john@remote.com');
    });

    it('should prefer local data when timestamps are equal', async () => {
      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { 
        name: 'John Local',
        updatedAt: '2023-01-01T10:00:00Z' 
      });
      
      const remoteData = { 
        name: 'John Remote',
        updatedAt: '2023-01-01T10:00:00Z' // Same timestamp
      };

      const conflict = await service.detectAndResolveConflict(entry, remoteData);
      const resolved = await service.applyResolution(conflict!, 'merge');
      
      // Should prefer local when timestamps are equal
      expect(resolved.resolvedData.name).toBe('John Local');
    });
  });

  describe('conflict management', () => {
    it('should get pending conflicts', async () => {
      service.updateOptions({ autoResolveEnabled: false });

      // Create multiple conflicts
      const entry1 = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { name: 'John Local' });
      const entry2 = await syncQueueRepo.addToQueue('update', 'employee', 'emp-2', { name: 'Jane Local' });
      
      await service.detectAndResolveConflict(entry1, { name: 'John Remote' });
      await service.detectAndResolveConflict(entry2, { name: 'Jane Remote' });

      const pending = await service.getPendingConflicts();
      expect(pending).toHaveLength(2);
      expect(pending.every(c => c.status === 'pending')).toBe(true);
    });

    it('should get conflict by ID', async () => {
      service.updateOptions({ autoResolveEnabled: false });

      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { name: 'John Local' });
      const conflict = await service.detectAndResolveConflict(entry, { name: 'John Remote' });

      const found = await service.getConflictById(conflict!.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(conflict!.id);
    });
  });

  describe('auto resolution rules', () => {
    it('should create and retrieve auto resolution rules', async () => {
      const rule = await service.createAutoResolutionRule({
        entityType: 'employee',
        conflictType: 'data',
        fieldPattern: 'name|email',
        resolution: 'use_remote',
        priority: 10,
        isActive: true
      });

      expect(rule.id).toBeDefined();
      expect(rule.createdAt).toBeInstanceOf(Date);

      const rules = await service.getAutoResolutionRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe(rule.id);
    });
  });

  describe('resolution history', () => {
    it('should track resolution history', async () => {
      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { name: 'John Local' });
      const conflict = await service.detectAndResolveConflict(entry, { name: 'John Remote' });

      const history = await service.getResolutionHistory(10);
      expect(history).toHaveLength(1);
      expect(history[0].conflictId).toBe(conflict!.id);
      expect(history[0].resolutionType).toBe('use_local');
      expect(history[0].resolvedBy).toBe('system');
    });
  });

  describe('events', () => {
    it('should emit conflictDetected event for manual resolution', async () => {
      service.updateOptions({ autoResolveEnabled: false });
      
      const conflictHandler = jest.fn();
      service.on('conflictDetected', conflictHandler);

      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { name: 'John Local' });
      await service.detectAndResolveConflict(entry, { name: 'John Remote' });

      expect(conflictHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          conflictType: 'data',
          status: 'pending'
        })
      );
    });

    it('should emit conflictResolved event', async () => {
      const resolvedHandler = jest.fn();
      service.on('conflictResolved', resolvedHandler);

      const entry = await syncQueueRepo.addToQueue('update', 'employee', 'emp-1', { name: 'John Local' });
      await service.detectAndResolveConflict(entry, { name: 'John Remote' });

      expect(resolvedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'resolved',
          resolution: 'use_local'
        })
      );
    });
  });
});