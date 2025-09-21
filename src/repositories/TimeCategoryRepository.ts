import { DatabaseManager } from '../database/DatabaseManager';
import { 
  TimeCategory, 
  CreateTimeCategoryData, 
  UpdateTimeCategoryData,
  TimeCategoryValidator,
  TimeCategoryLogic,
  TimeCategoryConflictError
} from '../models/TimeCategory';
import { v4 as uuidv4 } from 'uuid';

export class TimeCategoryNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Time category not found: ${identifier}`);
    this.name = 'TimeCategoryNotFoundError';
  }
}

export class TimeCategoryDuplicateError extends Error {
  constructor(name: string) {
    super(`Time category with name '${name}' already exists`);
    this.name = 'TimeCategoryDuplicateError';
  }
}

export interface TimeCategoryFilters {
  isActive?: boolean;
  search?: string; // Search in name
}

export class TimeCategoryRepository {
  private dbManager: DatabaseManager;

  constructor() {
    this.dbManager = DatabaseManager.getInstance();
  }

  async create(data: CreateTimeCategoryData): Promise<TimeCategory> {
    TimeCategoryValidator.validateCreate(data);

    // Check for duplicate name
    const existingByName = await this.findByName(data.name);
    if (existingByName) {
      throw new TimeCategoryDuplicateError(data.name);
    }

    // Check for conflicts with existing categories
    const existingCategories = await this.findAll({ isActive: true });
    TimeCategoryLogic.validateNoConflicts(data, existingCategories);

    const category: TimeCategory = {
      id: uuidv4(),
      name: data.name.trim(),
      minHours: data.minHours,
      maxHours: data.maxHours || undefined,
      payMultiplier: data.payMultiplier || 1.0,
      color: data.color || '#007bff',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const sql = `
      INSERT INTO time_categories (
        id, name, min_hours, max_hours, pay_multiplier, color, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.dbManager.run(sql, [
      category.id,
      category.name,
      category.minHours,
      category.maxHours,
      category.payMultiplier,
      category.color,
      category.isActive ? 1 : 0,
      category.createdAt.toISOString(),
      category.updatedAt.toISOString()
    ]);

    return category;
  }

  async findById(id: string): Promise<TimeCategory | null> {
    const sql = 'SELECT * FROM time_categories WHERE id = ?';
    const row = await this.dbManager.get<any>(sql, [id]);
    return row ? this.mapRowToTimeCategory(row) : null;
  }

  async findByName(name: string): Promise<TimeCategory | null> {
    const sql = 'SELECT * FROM time_categories WHERE LOWER(name) = LOWER(?)';
    const row = await this.dbManager.get<any>(sql, [name.trim()]);
    return row ? this.mapRowToTimeCategory(row) : null;
  }

  async findAll(filters?: TimeCategoryFilters): Promise<TimeCategory[]> {
    let sql = 'SELECT * FROM time_categories WHERE 1=1';
    const params: any[] = [];

    if (filters?.isActive !== undefined) {
      sql += ' AND is_active = ?';
      params.push(filters.isActive ? 1 : 0);
    }

    if (filters?.search) {
      sql += ' AND name LIKE ?';
      params.push(`%${filters.search}%`);
    }

    sql += ' ORDER BY min_hours ASC';

    const rows = await this.dbManager.all<any>(sql, params);
    return rows.map(row => this.mapRowToTimeCategory(row));
  }

  async update(id: string, data: UpdateTimeCategoryData): Promise<TimeCategory> {
    TimeCategoryValidator.validateUpdate(data);

    const existing = await this.findById(id);
    if (!existing) {
      throw new TimeCategoryNotFoundError(id);
    }

    // Check for duplicate name if being updated
    if (data.name && data.name !== existing.name) {
      const existingByName = await this.findByName(data.name);
      if (existingByName) {
        throw new TimeCategoryDuplicateError(data.name);
      }
    }

    // Prepare the updated category data for conflict checking
    const updatedCategory = {
      minHours: data.minHours !== undefined ? data.minHours : existing.minHours,
      maxHours: data.maxHours !== undefined ? data.maxHours : existing.maxHours
    };

    // Check for conflicts if hours are being updated
    if (data.minHours !== undefined || data.maxHours !== undefined) {
      const existingCategories = await this.findAll({ isActive: true });
      TimeCategoryLogic.validateNoConflicts(updatedCategory, existingCategories, id);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name.trim());
    }

    if (data.minHours !== undefined) {
      updates.push('min_hours = ?');
      params.push(data.minHours);
    }

    if (data.maxHours !== undefined) {
      updates.push('max_hours = ?');
      params.push(data.maxHours);
    }

    if (data.payMultiplier !== undefined) {
      updates.push('pay_multiplier = ?');
      params.push(data.payMultiplier);
    }

    if (data.color !== undefined) {
      updates.push('color = ?');
      params.push(data.color);
    }

    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(data.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing; // No changes
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    const sql = `UPDATE time_categories SET ${updates.join(', ')} WHERE id = ?`;
    await this.dbManager.run(sql, params);

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Failed to retrieve updated time category');
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new TimeCategoryNotFoundError(id);
    }

    // Check if category is being used in attendance records
    const usageCount = await this.getCategoryUsageCount(id);
    if (usageCount > 0) {
      // Soft delete by deactivating instead of hard delete
      await this.update(id, { isActive: false });
    } else {
      // Hard delete if not used
      await this.hardDelete(id);
    }
  }

  async hardDelete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new TimeCategoryNotFoundError(id);
    }

    const sql = 'DELETE FROM time_categories WHERE id = ?';
    await this.dbManager.run(sql, [id]);
  }

  async getActiveCategories(): Promise<TimeCategory[]> {
    return this.findAll({ isActive: true });
  }

  async getCategoryForHours(hours: number): Promise<TimeCategory | null> {
    const categories = await this.getActiveCategories();
    return TimeCategoryLogic.assignCategory(hours, categories);
  }

  async detectConflicts(): Promise<Array<{ category1: TimeCategory; category2: TimeCategory; reason: string }>> {
    const categories = await this.getActiveCategories();
    return TimeCategoryLogic.detectConflicts(categories);
  }

  async getCategoryUsageCount(categoryId: string): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM attendance_records WHERE time_category = ?';
    const result = await this.dbManager.get<{ count: number }>(sql, [categoryId]);
    return result?.count || 0;
  }

  async getCategoryUsageStats(): Promise<Array<{ category: TimeCategory; usageCount: number; totalHours: number }>> {
    const categories = await this.findAll();
    const stats = [];

    for (const category of categories) {
      const usageCount = await this.getCategoryUsageCount(category.id);
      
      const sql = `
        SELECT COALESCE(SUM(total_hours), 0) as total_hours 
        FROM attendance_records 
        WHERE time_category = ? AND total_hours IS NOT NULL
      `;
      const result = await this.dbManager.get<{ total_hours: number }>(sql, [category.id]);
      const totalHours = result?.total_hours || 0;

      stats.push({
        category,
        usageCount,
        totalHours
      });
    }

    return stats.sort((a, b) => b.usageCount - a.usageCount);
  }

  async createDefaultCategories(): Promise<TimeCategory[]> {
    const suggestions = TimeCategoryLogic.getSuggestedCategories();
    const createdCategories: TimeCategory[] = [];

    for (const suggestion of suggestions) {
      try {
        // Check if category with similar name already exists
        const existing = await this.findByName(suggestion.name);
        if (!existing) {
          const created = await this.create(suggestion);
          createdCategories.push(created);
        }
      } catch (error) {
        // Skip categories that conflict or fail validation
        console.warn(`Skipped creating default category "${suggestion.name}":`, error);
      }
    }

    return createdCategories;
  }

  async validateCategoryConfiguration(): Promise<{ isValid: boolean; errors: string[] }> {
    const categories = await this.getActiveCategories();
    const errors: string[] = [];

    if (categories.length === 0) {
      errors.push('No active time categories configured');
      return { isValid: false, errors };
    }

    // Check for conflicts
    const conflicts = TimeCategoryLogic.detectConflicts(categories);
    if (conflicts.length > 0) {
      conflicts.forEach(conflict => {
        errors.push(`Conflict between "${conflict.category1.name}" and "${conflict.category2.name}": ${conflict.reason}`);
      });
    }

    // Check for gaps in coverage
    const sortedCategories = [...categories].sort((a, b) => a.minHours - b.minHours);
    for (let i = 0; i < sortedCategories.length - 1; i++) {
      const current = sortedCategories[i];
      const next = sortedCategories[i + 1];
      
      if (current.maxHours && current.maxHours < next.minHours) {
        errors.push(`Gap in coverage between "${current.name}" (max: ${current.maxHours}h) and "${next.name}" (min: ${next.minHours}h)`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private mapRowToTimeCategory(row: any): TimeCategory {
    return {
      id: row.id,
      name: row.name,
      minHours: row.min_hours,
      maxHours: row.max_hours || undefined,
      payMultiplier: row.pay_multiplier,
      color: row.color,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}