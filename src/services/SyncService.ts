import { EventEmitter } from 'events';
import { SyncQueueRepository } from '../repositories/SyncQueueRepository';
import { SyncQueueEntry, SyncQueue } from '../models/SyncQueue';
import { ConnectivityService } from './ConnectivityService';
import { RetryService } from './RetryService';
import { DatabaseManager } from '../database/DatabaseManager';

export interface SyncResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors: string[];
  duration: number;
  timestamp: Date;
}

export interface SyncOptions {
  batchSize: number;
  maxConcurrentSyncs: number;
  syncInterval: number; // milliseconds
  autoSyncEnabled: boolean;
}

export interface SyncLogEntry {
  id: string;
  syncType: 'manual' | 'automatic' | 'connectivity-restored';
  status: 'started' | 'completed' | 'failed';
  recordsProcessed: number;
  errors?: string;
  startedAt: Date;
  completedAt?: Date;
}

export class SyncService extends EventEmitter {
  private static instance: SyncService;
  private syncQueueRepo: SyncQueueRepository;
  private connectivityService: ConnectivityService;
  private options: SyncOptions;
  private syncTimer?: NodeJS.Timeout;
  private isSyncing = false;
  private activeSyncs = 0;

  private static readonly DEFAULT_OPTIONS: SyncOptions = {
    batchSize: 10,
    maxConcurrentSyncs: 3,
    syncInterval: 300000, // 5 minutes
    autoSyncEnabled: true
  };

  private constructor(
    syncQueueRepo: SyncQueueRepository,
    connectivityService: ConnectivityService,
    options: Partial<SyncOptions> = {}
  ) {
    super();
    this.syncQueueRepo = syncQueueRepo;
    this.connectivityService = connectivityService;
    this.options = { ...SyncService.DEFAULT_OPTIONS, ...options };

    this.setupConnectivityListeners();
  }

  public static getInstance(
    syncQueueRepo?: SyncQueueRepository,
    connectivityService?: ConnectivityService,
    options?: Partial<SyncOptions>
  ): SyncService {
    if (!SyncService.instance) {
      if (!syncQueueRepo || !connectivityService) {
        throw new Error('SyncQueueRepository and ConnectivityService are required for first initialization');
      }
      SyncService.instance = new SyncService(syncQueueRepo, connectivityService, options);
    }
    return SyncService.instance;
  }

  private setupConnectivityListeners(): void {
    this.connectivityService.on('online', async () => {
      if (this.options.autoSyncEnabled) {
        await this.triggerSync('connectivity-restored');
      }
    });

    this.connectivityService.on('offline', () => {
      this.emit('syncPaused', { reason: 'connectivity-lost' });
    });
  }

  public async start(): Promise<void> {
    if (this.syncTimer) {
      return; // Already started
    }

    // Start connectivity monitoring
    await this.connectivityService.start();

    // Initial sync if online
    if (this.connectivityService.isOnline() && this.options.autoSyncEnabled) {
      await this.triggerSync('automatic');
    }

    // Start periodic sync
    if (this.options.autoSyncEnabled) {
      this.syncTimer = setInterval(async () => {
        if (this.connectivityService.isOnline() && !this.isSyncing) {
          await this.triggerSync('automatic');
        }
      }, this.options.syncInterval);
    }

    this.emit('started');
  }

  public stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    this.connectivityService.stop();
    this.emit('stopped');
  }

  public async triggerSync(type: SyncLogEntry['syncType'] = 'manual'): Promise<SyncResult> {
    if (!this.connectivityService.isOnline()) {
      throw new Error('Cannot sync while offline');
    }

    if (this.activeSyncs >= this.options.maxConcurrentSyncs) {
      throw new Error('Maximum concurrent syncs reached');
    }

    const startTime = Date.now();
    const syncId = this.generateSyncId();
    
    this.activeSyncs++;
    this.isSyncing = true;

    try {
      await this.logSyncStart(syncId, type);
      this.emit('syncStarted', { syncId, type });

      const result = await this.performSync();
      
      await this.logSyncComplete(syncId, result);
      this.emit('syncCompleted', { syncId, result });

      return {
        ...result,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.logSyncFailed(syncId, errorMessage);
      this.emit('syncFailed', { syncId, error: errorMessage });
      
      throw error;
    } finally {
      this.activeSyncs--;
      this.isSyncing = this.activeSyncs > 0;
    }
  }

  private async performSync(): Promise<Omit<SyncResult, 'duration' | 'timestamp'>> {
    const pendingEntries = await this.syncQueueRepo.getPendingEntries(this.options.batchSize);
    
    if (pendingEntries.length === 0) {
      return {
        success: true,
        processedCount: 0,
        failedCount: 0,
        errors: []
      };
    }

    let processedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Process entries in batches
    for (const entry of pendingEntries) {
      try {
        await this.syncEntry(entry);
        processedCount++;
      } catch (error) {
        failedCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Entry ${entry.id}: ${errorMessage}`);
      }
    }

    return {
      success: failedCount === 0,
      processedCount,
      failedCount,
      errors
    };
  }

  private async syncEntry(entry: SyncQueueEntry): Promise<void> {
    // Mark as processing
    const processing = SyncQueue.markAsProcessing(entry);
    await this.syncQueueRepo.updateEntry(processing);

    try {
      // Simulate sync operation (in real implementation, this would call external API)
      await this.simulateExternalSync(entry);
      
      // Mark as completed
      const completed = SyncQueue.markAsCompleted(processing);
      await this.syncQueueRepo.updateEntry(completed);
      
    } catch (error) {
      // Mark as failed
      const failed = SyncQueue.markAsFailed(processing);
      await this.syncQueueRepo.updateEntry(failed);
      throw error;
    }
  }

  private async simulateExternalSync(entry: SyncQueueEntry): Promise<void> {
    // Simulate network delay and potential failures
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    // Simulate occasional failures for testing
    if (Math.random() < 0.1) { // 10% failure rate
      throw new Error(`Simulated sync failure for ${entry.entityType}:${entry.entityId}`);
    }
  }

  public async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    return await this.syncQueueRepo.getQueueStats();
  }

  public async getFailedEntries(): Promise<SyncQueueEntry[]> {
    return await this.syncQueueRepo.getFailedEntries();
  }

  public async retryFailedEntries(): Promise<SyncResult> {
    const retryableEntries = await this.syncQueueRepo.getRetryableEntries();
    
    if (retryableEntries.length === 0) {
      return {
        success: true,
        processedCount: 0,
        failedCount: 0,
        errors: [],
        duration: 0,
        timestamp: new Date()
      };
    }

    // Reset entries to pending status for retry
    for (const entry of retryableEntries) {
      const retryEntry = { ...entry, status: 'pending' as const };
      await this.syncQueueRepo.updateEntry(retryEntry);
    }

    return await this.triggerSync('manual');
  }

  public async clearCompletedEntries(olderThanDays: number = 7): Promise<number> {
    return await this.syncQueueRepo.clearCompletedEntries(olderThanDays);
  }

  private generateSyncId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async logSyncStart(syncId: string, type: SyncLogEntry['syncType']): Promise<void> {
    const db = DatabaseManager.getInstance();
    await db.run(`
      INSERT INTO sync_log (id, sync_type, status, records_processed, started_at)
      VALUES (?, ?, 'started', 0, ?)
    `, [syncId, type, new Date().toISOString()]);
  }

  private async logSyncComplete(syncId: string, result: Omit<SyncResult, 'duration' | 'timestamp'>): Promise<void> {
    const db = DatabaseManager.getInstance();
    await db.run(`
      UPDATE sync_log 
      SET status = 'completed', records_processed = ?, completed_at = ?, errors = ?
      WHERE id = ?
    `, [
      result.processedCount,
      new Date().toISOString(),
      result.errors.length > 0 ? JSON.stringify(result.errors) : null,
      syncId
    ]);
  }

  private async logSyncFailed(syncId: string, error: string): Promise<void> {
    const db = DatabaseManager.getInstance();
    await db.run(`
      UPDATE sync_log 
      SET status = 'failed', completed_at = ?, errors = ?
      WHERE id = ?
    `, [new Date().toISOString(), JSON.stringify([error]), syncId]);
  }

  public async getSyncHistory(limit: number = 50): Promise<SyncLogEntry[]> {
    const db = DatabaseManager.getInstance();
    const rows = await db.all(`
      SELECT * FROM sync_log 
      ORDER BY started_at DESC 
      LIMIT ?
    `, [limit]);

    return rows.map((row: any) => ({
      id: row.id,
      syncType: row.sync_type,
      status: row.status,
      recordsProcessed: row.records_processed,
      errors: row.errors ? JSON.parse(row.errors) : undefined,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined
    }));
  }

  public updateOptions(newOptions: Partial<SyncOptions>): void {
    this.options = { ...this.options, ...newOptions };
    
    // Restart with new options if currently running
    if (this.syncTimer) {
      this.stop();
      this.start();
    }
  }

  public isActive(): boolean {
    return this.isSyncing;
  }

  public getActiveSyncCount(): number {
    return this.activeSyncs;
  }
}