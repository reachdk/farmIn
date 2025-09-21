import { DatabaseManager } from '../database/DatabaseManager';
import { SyncQueueEntry, SyncQueue } from '../models/SyncQueue';
import { randomUUID } from 'crypto';

export class SyncQueueRepository {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  async addToQueue(
    operation: SyncQueueEntry['operation'],
    entityType: string,
    entityId: string,
    data?: any
  ): Promise<SyncQueueEntry> {
    const entry = SyncQueue.createEntry(operation, entityType, entityId, data);
    const id = randomUUID();

    await this.db.run(`
      INSERT INTO sync_queue (
        id, operation, entity_type, entity_id, data, attempts, 
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      entry.operation,
      entry.entityType,
      entry.entityId,
      JSON.stringify(entry.data),
      entry.attempts,
      entry.status,
      entry.createdAt.toISOString(),
      entry.updatedAt.toISOString()
    ]);

    return { ...entry, id };
  }

  async getPendingEntries(limit?: number): Promise<SyncQueueEntry[]> {
    const sql = `
      SELECT * FROM sync_queue 
      WHERE status IN ('pending', 'failed') 
      ORDER BY created_at ASC
      ${limit ? 'LIMIT ?' : ''}
    `;

    const rows = limit ? await this.db.all(sql, [limit]) : await this.db.all(sql);
    return rows.map(this.mapRowToEntry);
  }

  async getEntryById(id: string): Promise<SyncQueueEntry | null> {
    const row = await this.db.get('SELECT * FROM sync_queue WHERE id = ?', [id]);
    return row ? this.mapRowToEntry(row) : null;
  }

  async updateEntry(entry: SyncQueueEntry): Promise<void> {
    await this.db.run(`
      UPDATE sync_queue 
      SET operation = ?, entity_type = ?, entity_id = ?, data = ?, 
          attempts = ?, last_attempt = ?, status = ?, updated_at = ?, 
          conflict_data = ?
      WHERE id = ?
    `, [
      entry.operation,
      entry.entityType,
      entry.entityId,
      JSON.stringify(entry.data),
      entry.attempts,
      entry.lastAttempt?.toISOString() || null,
      entry.status,
      entry.updatedAt.toISOString(),
      entry.conflictData ? JSON.stringify(entry.conflictData) : null,
      entry.id
    ]);
  }

  async removeEntry(id: string): Promise<void> {
    await this.db.run('DELETE FROM sync_queue WHERE id = ?', [id]);
  }

  async getEntriesForEntity(entityType: string, entityId: string): Promise<SyncQueueEntry[]> {
    const rows = await this.db.all(`
      SELECT * FROM sync_queue 
      WHERE entity_type = ? AND entity_id = ? 
      ORDER BY created_at DESC
    `, [entityType, entityId]);

    return rows.map(this.mapRowToEntry);
  }

  async getFailedEntries(): Promise<SyncQueueEntry[]> {
    const rows = await this.db.all(`
      SELECT * FROM sync_queue 
      WHERE status = 'failed' 
      ORDER BY created_at ASC
    `);

    return rows.map(this.mapRowToEntry);
  }

  async getRetryableEntries(): Promise<SyncQueueEntry[]> {
    const entries = await this.getFailedEntries();
    return entries.filter(entry => SyncQueue.shouldRetry(entry));
  }

  async clearCompletedEntries(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.db.run(`
      DELETE FROM sync_queue 
      WHERE status = 'completed' AND updated_at < ?
    `, [cutoffDate.toISOString()]);
    
    return result.changes || 0;
  }

  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const rows = await this.db.all(`
      SELECT 
        status,
        COUNT(*) as count
      FROM sync_queue 
      GROUP BY status
    `) as { status: string; count: number }[];

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      total: 0
    };

    rows.forEach(row => {
      stats[row.status as keyof typeof stats] = row.count;
      stats.total += row.count;
    });

    return stats;
  }

  private mapRowToEntry(row: any): SyncQueueEntry {
    return {
      id: row.id,
      operation: row.operation,
      entityType: row.entity_type,
      entityId: row.entity_id,
      data: row.data ? JSON.parse(row.data) : null,
      attempts: row.attempts,
      lastAttempt: row.last_attempt ? new Date(row.last_attempt) : undefined,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      conflictData: row.conflict_data ? JSON.parse(row.conflict_data) : undefined
    };
  }
}