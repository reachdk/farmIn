import { EventEmitter } from 'events';
import { SyncQueueEntry, ConflictDetectionResult } from '../models/SyncQueue';
import { DatabaseManager } from '../database/DatabaseManager';
import { randomUUID } from 'crypto';

export interface ConflictResolution {
  id: string;
  syncQueueEntryId: string;
  conflictType: 'timestamp' | 'data' | 'deletion';
  localData: any;
  remoteData: any;
  conflictFields: string[];
  resolution: 'use_local' | 'use_remote' | 'merge' | 'manual';
  resolvedData?: any;
  resolvedBy?: string;
  resolvedAt?: Date;
  status: 'pending' | 'resolved' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface AutoResolutionRule {
  id: string;
  entityType: string;
  conflictType: 'timestamp' | 'data' | 'deletion';
  fieldPattern?: string; // regex pattern for field names
  resolution: 'use_local' | 'use_remote' | 'merge';
  priority: number; // higher priority rules are applied first
  isActive: boolean;
  createdAt: Date;
}

export interface ConflictResolutionOptions {
  autoResolveEnabled: boolean;
  defaultResolution: 'use_local' | 'use_remote' | 'merge';
  timestampTolerance: number; // milliseconds
}

export class ConflictResolutionService extends EventEmitter {
  private static instance: ConflictResolutionService;
  private db: DatabaseManager;
  private options: ConflictResolutionOptions;

  private static readonly DEFAULT_OPTIONS: ConflictResolutionOptions = {
    autoResolveEnabled: true,
    defaultResolution: 'use_local', // Prefer local changes by default
    timestampTolerance: 1000 // 1 second tolerance for timestamp conflicts
  };

  private constructor(db: DatabaseManager, options: Partial<ConflictResolutionOptions> = {}) {
    super();
    this.db = db;
    this.options = { ...ConflictResolutionService.DEFAULT_OPTIONS, ...options };
  }

  public static getInstance(
    db?: DatabaseManager,
    options?: Partial<ConflictResolutionOptions>
  ): ConflictResolutionService {
    if (!ConflictResolutionService.instance) {
      if (!db) {
        throw new Error('DatabaseManager is required for first initialization');
      }
      ConflictResolutionService.instance = new ConflictResolutionService(db, options);
    }
    return ConflictResolutionService.instance;
  }

  public async detectAndResolveConflict(
    entry: SyncQueueEntry,
    remoteData: any,
    lastSyncTimestamp?: Date
  ): Promise<ConflictResolution | null> {
    const conflictResult = this.detectConflict(entry.data, remoteData, lastSyncTimestamp);
    
    if (!conflictResult.hasConflict) {
      return null;
    }

    // Create conflict resolution record
    const conflict = await this.createConflictResolution(entry, conflictResult);

    // Try to auto-resolve if enabled
    if (this.options.autoResolveEnabled) {
      const resolved = await this.attemptAutoResolution(conflict);
      if (resolved) {
        return resolved;
      }
    }

    // Emit event for manual resolution
    this.emit('conflictDetected', conflict);
    return conflict;
  }

  private detectConflict(
    localData: any,
    remoteData: any,
    lastSyncTimestamp?: Date
  ): ConflictDetectionResult {
    if (!localData && !remoteData) {
      return { hasConflict: false };
    }

    // Deletion conflict
    if ((localData && !remoteData) || (!localData && remoteData)) {
      return {
        hasConflict: true,
        conflictType: 'deletion',
        localData,
        remoteData
      };
    }

    // Timestamp conflict with tolerance
    if (localData.updatedAt && remoteData.updatedAt && lastSyncTimestamp) {
      const localTime = new Date(localData.updatedAt);
      const remoteTime = new Date(remoteData.updatedAt);
      const syncTime = new Date(lastSyncTimestamp);
      
      const localModifiedAfterSync = localTime > syncTime;
      const remoteModifiedAfterSync = remoteTime > syncTime;
      
      if (localModifiedAfterSync && remoteModifiedAfterSync) {
        const timeDiff = Math.abs(localTime.getTime() - remoteTime.getTime());
        
        if (timeDiff > this.options.timestampTolerance) {
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

    // Data conflict
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

  private findConflictingFields(localData: any, remoteData: any): string[] {
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

  private async createConflictResolution(
    entry: SyncQueueEntry,
    conflictResult: ConflictDetectionResult
  ): Promise<ConflictResolution> {
    const conflict: ConflictResolution = {
      id: randomUUID(),
      syncQueueEntryId: entry.id,
      conflictType: conflictResult.conflictType!,
      localData: conflictResult.localData,
      remoteData: conflictResult.remoteData,
      conflictFields: conflictResult.conflictFields || [],
      resolution: 'manual',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.db.run(`
      INSERT INTO conflict_resolutions (
        id, sync_queue_entry_id, conflict_type, local_data, remote_data,
        conflict_fields, resolution, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      conflict.id,
      conflict.syncQueueEntryId,
      conflict.conflictType,
      JSON.stringify(conflict.localData),
      JSON.stringify(conflict.remoteData),
      JSON.stringify(conflict.conflictFields),
      conflict.resolution,
      conflict.status,
      conflict.createdAt.toISOString(),
      conflict.updatedAt.toISOString()
    ]);

    return conflict;
  }

  private async attemptAutoResolution(conflict: ConflictResolution): Promise<ConflictResolution | null> {
    const rules = await this.getApplicableRules(conflict);
    
    if (rules.length === 0) {
      // Use default resolution
      return await this.applyResolution(conflict, this.options.defaultResolution);
    }

    // Apply highest priority rule
    const rule = rules[0];
    return await this.applyResolution(conflict, rule.resolution);
  }

  private async getApplicableRules(conflict: ConflictResolution): Promise<AutoResolutionRule[]> {
    const rows = await this.db.all(`
      SELECT * FROM auto_resolution_rules 
      WHERE is_active = 1 
        AND conflict_type = ?
      ORDER BY priority DESC
    `, [conflict.conflictType]);

    const rules = rows.map(this.mapRowToRule);
    
    // Filter rules by field pattern if applicable
    return rules.filter(rule => {
      if (!rule.fieldPattern || conflict.conflictFields.length === 0) {
        return true;
      }
      
      const pattern = new RegExp(rule.fieldPattern);
      return conflict.conflictFields.some(field => pattern.test(field));
    });
  }

  public async applyResolution(
    conflict: ConflictResolution,
    resolution: 'use_local' | 'use_remote' | 'merge',
    resolvedBy?: string
  ): Promise<ConflictResolution> {
    let resolvedData: any;

    switch (resolution) {
      case 'use_local':
        resolvedData = conflict.localData;
        break;
      case 'use_remote':
        resolvedData = conflict.remoteData;
        break;
      case 'merge':
        resolvedData = this.mergeData(conflict.localData, conflict.remoteData, conflict.conflictFields);
        break;
      default:
        throw new Error(`Invalid resolution type: ${resolution}`);
    }

    const updatedConflict: ConflictResolution = {
      ...conflict,
      resolution,
      resolvedData,
      resolvedBy,
      resolvedAt: new Date(),
      status: 'resolved',
      updatedAt: new Date()
    };

    await this.db.run(`
      UPDATE conflict_resolutions 
      SET resolution = ?, resolved_data = ?, resolved_by = ?, resolved_at = ?, 
          status = ?, updated_at = ?
      WHERE id = ?
    `, [
      updatedConflict.resolution,
      JSON.stringify(updatedConflict.resolvedData),
      updatedConflict.resolvedBy || null,
      updatedConflict.resolvedAt!.toISOString(),
      updatedConflict.status,
      updatedConflict.updatedAt.toISOString(),
      updatedConflict.id
    ]);

    // Log the resolution
    await this.logResolution(updatedConflict);

    this.emit('conflictResolved', updatedConflict);
    return updatedConflict;
  }

  private mergeData(localData: any, remoteData: any, conflictFields: string[]): any {
    // Simple merge strategy: prefer local for conflicting fields, merge non-conflicting
    const merged = { ...remoteData, ...localData };
    
    // For specific merge strategies, you could implement field-specific logic here
    // For now, we'll use a timestamp-based approach for conflicting fields
    for (const field of conflictFields) {
      if (localData.updatedAt && remoteData.updatedAt) {
        const localTime = new Date(localData.updatedAt);
        const remoteTime = new Date(remoteData.updatedAt);
        
        // Use the more recent value
        if (remoteTime > localTime) {
          merged[field] = remoteData[field];
        } else {
          merged[field] = localData[field];
        }
      } else {
        // Default to local value
        merged[field] = localData[field];
      }
    }

    return merged;
  }

  public async getPendingConflicts(): Promise<ConflictResolution[]> {
    const rows = await this.db.all(`
      SELECT * FROM conflict_resolutions 
      WHERE status = 'pending' 
      ORDER BY created_at ASC
    `);

    return rows.map(this.mapRowToConflict);
  }

  public async getConflictById(id: string): Promise<ConflictResolution | null> {
    const row = await this.db.get(`
      SELECT * FROM conflict_resolutions WHERE id = ?
    `, [id]);

    return row ? this.mapRowToConflict(row) : null;
  }

  public async createAutoResolutionRule(rule: Omit<AutoResolutionRule, 'id' | 'createdAt'>): Promise<AutoResolutionRule> {
    const newRule: AutoResolutionRule = {
      ...rule,
      id: randomUUID(),
      createdAt: new Date()
    };

    await this.db.run(`
      INSERT INTO auto_resolution_rules (
        id, entity_type, conflict_type, field_pattern, resolution, 
        priority, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      newRule.id,
      newRule.entityType,
      newRule.conflictType,
      newRule.fieldPattern || null,
      newRule.resolution,
      newRule.priority,
      newRule.isActive ? 1 : 0,
      newRule.createdAt.toISOString()
    ]);

    return newRule;
  }

  public async getAutoResolutionRules(): Promise<AutoResolutionRule[]> {
    const rows = await this.db.all(`
      SELECT * FROM auto_resolution_rules 
      ORDER BY priority DESC, created_at ASC
    `);

    return rows.map(this.mapRowToRule);
  }

  private async logResolution(conflict: ConflictResolution): Promise<void> {
    await this.db.run(`
      INSERT INTO conflict_resolution_log (
        id, conflict_id, resolution_type, resolved_by, resolved_at, details
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      randomUUID(),
      conflict.id,
      conflict.resolution,
      conflict.resolvedBy || 'system',
      conflict.resolvedAt!.toISOString(),
      JSON.stringify({
        conflictType: conflict.conflictType,
        conflictFields: conflict.conflictFields,
        resolvedData: conflict.resolvedData
      })
    ]);
  }

  public async getResolutionHistory(limit: number = 50): Promise<any[]> {
    const rows = await this.db.all(`
      SELECT crl.*, cr.conflict_type, cr.conflict_fields
      FROM conflict_resolution_log crl
      JOIN conflict_resolutions cr ON crl.conflict_id = cr.id
      ORDER BY crl.resolved_at DESC
      LIMIT ?
    `, [limit]);

    return rows.map((row: any) => ({
      id: row.id,
      conflictId: row.conflict_id,
      resolutionType: row.resolution_type,
      resolvedBy: row.resolved_by,
      resolvedAt: new Date(row.resolved_at),
      conflictType: row.conflict_type,
      conflictFields: JSON.parse(row.conflict_fields),
      details: JSON.parse(row.details)
    }));
  }

  private mapRowToConflict(row: any): ConflictResolution {
    return {
      id: row.id,
      syncQueueEntryId: row.sync_queue_entry_id,
      conflictType: row.conflict_type,
      localData: JSON.parse(row.local_data),
      remoteData: JSON.parse(row.remote_data),
      conflictFields: JSON.parse(row.conflict_fields),
      resolution: row.resolution,
      resolvedData: row.resolved_data ? JSON.parse(row.resolved_data) : undefined,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapRowToRule(row: any): AutoResolutionRule {
    return {
      id: row.id,
      entityType: row.entity_type,
      conflictType: row.conflict_type,
      fieldPattern: row.field_pattern,
      resolution: row.resolution,
      priority: row.priority,
      isActive: row.is_active === 1,
      createdAt: new Date(row.created_at)
    };
  }

  public updateOptions(newOptions: Partial<ConflictResolutionOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }
}