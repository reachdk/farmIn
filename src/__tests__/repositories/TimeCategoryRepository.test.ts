import {
  TimeCategoryRepository,
  TimeCategoryNotFoundError,
  TimeCategoryDuplicateError
} from '../../repositories/TimeCategoryRepository';
import { DatabaseManager } from '../../database/DatabaseManager';
import { CreateTimeCategoryData, UpdateTimeCategoryData, TimeCategoryConflictError } from '../../models/TimeCategory';

// Mock the DatabaseManager
jest.mock('../../database/DatabaseManager');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-123')
}));

describe('TimeCategoryRepository', () => {
  let repository: TimeCategoryRepository;
  let mockDbManager: jest.Mocked<DatabaseManager>;

  const mockTimeCategoryRow = {
    id: 'mock-uuid-123',
    name: 'Full Day',
    min_hours: 8,
    max_hours: 10,
    pay_multiplier: 1.0,
    color: '#007bff',
    is_active: 1,
    created_at: '2023-01-01T00:00:00.000Z',
    updated_at: '2023-01-01T00:00:00.000Z'
  };

  beforeEach(() => {
    mockDbManager = {
      run: jest.fn().mockResolvedValue({ changes: 1, lastID: 1 } as any),
      get: jest.fn(),
      all: jest.fn(),
      withTransaction: jest.fn().mockImplementation(async (callback) => await callback())
    } as any;

    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDbManager);
    repository = new TimeCategoryRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const validCreateData: CreateTimeCategoryData = {
      name: 'Full Day',
      minHours: 8,
      maxHours: 10,
      payMultiplier: 1.0,
      color: '#007bff'
    };

    it('should create a new time category successfully', async () => {
      mockDbManager.get.mockResolvedValueOnce(null); // No existing category by name
      mockDbManager.all.mockResolvedValueOnce([]); // No existing categories for conflict check
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);

      const result = await repository.create(validCreateData);

      expect(result).toMatchObject({
        id: 'mock-uuid-123',
        name: 'Full Day',
        minHours: 8,
        maxHours: 10,
        payMultiplier: 1.0,
        color: '#007bff',
        isActive: true
      });

      expect(mockDbManager.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO time_categories'),
        expect.arrayContaining(['mock-uuid-123', 'Full Day', 8, 10, 1.0, '#007bff', 1])
      );
    });

    it('should create category with default values', async () => {
      const minimalData: CreateTimeCategoryData = {
        name: 'Half Day',
        minHours: 4
      };

      mockDbManager.get.mockResolvedValueOnce(null);
      mockDbManager.all.mockResolvedValueOnce([]);
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);

      const result = await repository.create(minimalData);

      expect(result).toMatchObject({
        name: 'Half Day',
        minHours: 4,
        maxHours: undefined,
        payMultiplier: 1.0,
        color: '#007bff'
      });
    });

    it('should throw error for duplicate name', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockTimeCategoryRow); // Existing category found

      await expect(repository.create(validCreateData))
        .rejects.toThrow(new TimeCategoryDuplicateError('Full Day'));
    });

    it('should throw error for conflicting hours', async () => {
      const conflictingData = { ...validCreateData, name: 'Conflicting', minHours: 6, maxHours: 12 }; // Overlaps with 8-10
      const existingCategoryRow = {
        id: 'existing-1',
        name: 'Existing',
        min_hours: 8,
        max_hours: 10,
        pay_multiplier: 1.0,
        color: '#000000',
        is_active: 1,
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockDbManager.get.mockResolvedValueOnce(null); // No duplicate name
      mockDbManager.all.mockResolvedValueOnce([existingCategoryRow]); // Existing categories

      await expect(repository.create(conflictingData))
        .rejects.toThrow(TimeCategoryConflictError);
    });

    it('should throw validation error for invalid data', async () => {
      const invalidData = { ...validCreateData, name: '' };

      await expect(repository.create(invalidData))
        .rejects.toThrow('Category name is required');
    });
  });

  describe('findById', () => {
    it('should return time category when found', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockTimeCategoryRow);

      const result = await repository.findById('mock-uuid-123');

      expect(result).toMatchObject({
        id: 'mock-uuid-123',
        name: 'Full Day',
        minHours: 8,
        maxHours: 10,
        isActive: true
      });
    });

    it('should return null when category not found', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should return category when found', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockTimeCategoryRow);

      const result = await repository.findByName('Full Day');

      expect(result).toMatchObject({
        name: 'Full Day'
      });
      expect(mockDbManager.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE LOWER(name) = LOWER(?)'),
        ['Full Day']
      );
    });

    it('should be case insensitive', async () => {
      mockDbManager.get.mockResolvedValueOnce(mockTimeCategoryRow);

      await repository.findByName('FULL DAY');

      expect(mockDbManager.get).toHaveBeenCalledWith(
        expect.any(String),
        ['FULL DAY']
      );
    });
  });

  describe('findAll', () => {
    const mockCategories = [mockTimeCategoryRow, { ...mockTimeCategoryRow, id: 'cat-2', name: 'Half Day' }];

    it('should return all categories without filters', async () => {
      mockDbManager.all.mockResolvedValueOnce(mockCategories);

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM time_categories WHERE 1=1'),
        []
      );
    });

    it('should filter by active status', async () => {
      mockDbManager.all.mockResolvedValueOnce([mockTimeCategoryRow]);

      await repository.findAll({ isActive: true });

      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('AND is_active = ?'),
        [1]
      );
    });

    it('should filter by search term', async () => {
      mockDbManager.all.mockResolvedValueOnce([mockTimeCategoryRow]);

      await repository.findAll({ search: 'Full' });

      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('AND name LIKE ?'),
        ['%Full%']
      );
    });

    it('should order by min_hours', async () => {
      mockDbManager.all.mockResolvedValueOnce(mockCategories);

      await repository.findAll();

      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY min_hours ASC'),
        []
      );
    });
  });

  describe('update', () => {
    const updateData: UpdateTimeCategoryData = {
      name: 'Updated Full Day',
      payMultiplier: 1.5
    };

    it('should update time category successfully', async () => {
      const existingCategory = {
        id: 'mock-uuid-123',
        name: 'Full Day',
        minHours: 8,
        maxHours: 10,
        payMultiplier: 1.0,
        color: '#007bff',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDbManager.get.mockResolvedValueOnce(existingCategory); // findById for existing check
      mockDbManager.get.mockResolvedValueOnce(null); // findByName - no duplicate
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any);
      mockDbManager.get.mockResolvedValueOnce({ ...mockTimeCategoryRow, name: 'Updated Full Day' }); // updated record

      const result = await repository.update('mock-uuid-123', updateData);

      expect(result.name).toBe('Updated Full Day');
      expect(mockDbManager.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE time_categories SET'),
        expect.arrayContaining(['Updated Full Day', 1.5])
      );
    });

    it('should throw error when category not found', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      await expect(repository.update('non-existent', updateData))
        .rejects.toThrow(new TimeCategoryNotFoundError('non-existent'));
    });

    it('should throw error for duplicate name', async () => {
      const existingCategory = {
        id: 'mock-uuid-123',
        name: 'Full Day',
        minHours: 8,
        maxHours: 10,
        payMultiplier: 1.0,
        color: '#007bff',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDbManager.get.mockResolvedValueOnce(existingCategory); // findById
      mockDbManager.get.mockResolvedValueOnce(mockTimeCategoryRow); // findByName - duplicate found

      await expect(repository.update('mock-uuid-123', { name: 'Duplicate Name' }))
        .rejects.toThrow(new TimeCategoryDuplicateError('Duplicate Name'));
    });

    it('should validate conflicts when updating hours', async () => {
      const existingCategoryRow = {
        id: 'mock-uuid-123',
        name: 'Full Day',
        min_hours: 8,
        max_hours: 10,
        pay_multiplier: 1.0,
        color: '#007bff',
        is_active: 1,
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      const conflictingCategoryRow = {
        id: 'other-id',
        name: 'Other',
        min_hours: 4,
        max_hours: 8,
        pay_multiplier: 1.0,
        color: '#000000',
        is_active: 1,
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockDbManager.get.mockResolvedValueOnce(existingCategoryRow); // findById
      mockDbManager.all.mockResolvedValueOnce([existingCategoryRow, conflictingCategoryRow]); // existing categories

      await expect(repository.update('mock-uuid-123', { minHours: 6 })) // This would overlap with 4-8
        .rejects.toThrow(TimeCategoryConflictError);
    });

    it('should return existing category when no changes', async () => {
      const existingCategoryRow = {
        id: 'mock-uuid-123',
        name: 'Full Day',
        min_hours: 8,
        max_hours: 10,
        pay_multiplier: 1.0,
        color: '#007bff',
        is_active: 1,
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z'
      };

      mockDbManager.get.mockResolvedValueOnce(existingCategoryRow);

      const result = await repository.update('mock-uuid-123', {});

      expect(result).toMatchObject({
        id: 'mock-uuid-123',
        name: 'Full Day',
        minHours: 8,
        maxHours: 10,
        payMultiplier: 1.0,
        color: '#007bff',
        isActive: true
      });
      expect(mockDbManager.run).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should soft delete when category is in use', async () => {
      const existingCategory = {
        id: 'mock-uuid-123',
        name: 'Full Day',
        minHours: 8,
        maxHours: 10,
        payMultiplier: 1.0,
        color: '#007bff',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDbManager.get.mockResolvedValueOnce(existingCategory); // findById
      mockDbManager.get.mockResolvedValueOnce({ count: 5 }); // usage count > 0
      mockDbManager.get.mockResolvedValueOnce(existingCategory); // findById in update
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any); // update to inactive
      mockDbManager.get.mockResolvedValueOnce({ ...existingCategory, isActive: false }); // updated record

      await repository.delete('mock-uuid-123');

      expect(mockDbManager.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE time_categories SET'),
        expect.arrayContaining([0]) // isActive = false
      );
    });

    it('should hard delete when category is not in use', async () => {
      const existingCategory = {
        id: 'mock-uuid-123',
        name: 'Full Day',
        minHours: 8,
        maxHours: 10,
        payMultiplier: 1.0,
        color: '#007bff',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDbManager.get.mockResolvedValueOnce(existingCategory); // findById
      mockDbManager.get.mockResolvedValueOnce({ count: 0 }); // usage count = 0
      mockDbManager.get.mockResolvedValueOnce(existingCategory); // findById in hardDelete
      mockDbManager.run.mockResolvedValueOnce({ changes: 1 } as any); // delete

      await repository.delete('mock-uuid-123');

      expect(mockDbManager.run).toHaveBeenCalledWith(
        'DELETE FROM time_categories WHERE id = ?',
        ['mock-uuid-123']
      );
    });

    it('should throw error when category not found', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      await expect(repository.delete('non-existent'))
        .rejects.toThrow(new TimeCategoryNotFoundError('non-existent'));
    });
  });

  describe('getActiveCategories', () => {
    it('should return only active categories', async () => {
      const activeCategories = [mockTimeCategoryRow];
      mockDbManager.all.mockResolvedValueOnce(activeCategories);

      const result = await repository.getActiveCategories();

      expect(result).toHaveLength(1);
      expect(mockDbManager.all).toHaveBeenCalledWith(
        expect.stringContaining('AND is_active = ?'),
        [1]
      );
    });
  });

  describe('getCategoryForHours', () => {
    it('should return appropriate category for given hours', async () => {
      const categories = [
        { ...mockTimeCategoryRow, min_hours: 4, max_hours: 7.99, name: 'Half Day' },
        { ...mockTimeCategoryRow, min_hours: 8, max_hours: null, name: 'Full Day' }
      ];
      mockDbManager.all.mockResolvedValueOnce(categories);

      const result = await repository.getCategoryForHours(8);

      expect(result?.name).toBe('Full Day');
    });

    it('should return null when no category matches', async () => {
      mockDbManager.all.mockResolvedValueOnce([mockTimeCategoryRow]);

      const result = await repository.getCategoryForHours(2);

      expect(result).toBeNull();
    });
  });

  describe('detectConflicts', () => {
    it('should detect conflicts between categories', async () => {
      const conflictingCategories = [
        { ...mockTimeCategoryRow, min_hours: 4, max_hours: 8, name: 'Half Day' },
        { ...mockTimeCategoryRow, id: 'cat-2', min_hours: 6, max_hours: 10, name: 'Full Day' }
      ];
      mockDbManager.all.mockResolvedValueOnce(conflictingCategories);

      const result = await repository.detectConflicts();

      expect(result).toHaveLength(1);
      expect(result[0].reason).toBe('Overlapping hour ranges');
    });
  });

  describe('getCategoryUsageCount', () => {
    it('should return usage count for category', async () => {
      mockDbManager.get.mockResolvedValueOnce({ count: 15 });

      const result = await repository.getCategoryUsageCount('mock-uuid-123');

      expect(result).toBe(15);
      expect(mockDbManager.get).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM attendance_records WHERE time_category = ?',
        ['mock-uuid-123']
      );
    });

    it('should return 0 when no usage found', async () => {
      mockDbManager.get.mockResolvedValueOnce(null);

      const result = await repository.getCategoryUsageCount('mock-uuid-123');

      expect(result).toBe(0);
    });
  });

  describe('getCategoryUsageStats', () => {
    it('should return usage statistics for all categories', async () => {
      const categories = [mockTimeCategoryRow];
      mockDbManager.all.mockResolvedValueOnce(categories); // findAll
      mockDbManager.get.mockResolvedValueOnce({ count: 5 }); // usage count
      mockDbManager.get.mockResolvedValueOnce({ total_hours: 40 }); // total hours

      const result = await repository.getCategoryUsageStats();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        usageCount: 5,
        totalHours: 40
      });
      expect(result[0].category.name).toBe('Full Day');
    });
  });

  describe('createDefaultCategories', () => {
    it('should create default categories that do not exist', async () => {
      // Mock that no categories exist
      mockDbManager.get.mockResolvedValue(null); // findByName always returns null
      mockDbManager.all.mockResolvedValue([]); // no existing categories for conflict check
      mockDbManager.run.mockResolvedValue({ changes: 1 } as any);

      const result = await repository.createDefaultCategories();

      expect(result.length).toBeGreaterThan(0);
      expect(mockDbManager.run).toHaveBeenCalledTimes(result.length);
    });

    it('should skip existing categories', async () => {
      // Mock that some categories already exist
      mockDbManager.get.mockResolvedValueOnce(mockTimeCategoryRow); // First category exists
      mockDbManager.get.mockResolvedValueOnce(null); // Second category doesn't exist
      mockDbManager.all.mockResolvedValue([]);
      mockDbManager.run.mockResolvedValue({ changes: 1 } as any);

      const result = await repository.createDefaultCategories();

      // Should create fewer categories than suggested since some exist
      expect(result.length).toBeLessThan(5); // Assuming 5 suggestions
    });
  });

  describe('validateCategoryConfiguration', () => {
    it('should return valid for good configuration', async () => {
      const goodCategories = [
        { ...mockTimeCategoryRow, min_hours: 4, max_hours: 8, name: 'Half Day' },
        { ...mockTimeCategoryRow, id: 'cat-2', min_hours: 8, max_hours: 10, name: 'Full Day' }
      ];
      mockDbManager.all.mockResolvedValueOnce(goodCategories);

      const result = await repository.validateCategoryConfiguration();

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect no active categories', async () => {
      mockDbManager.all.mockResolvedValueOnce([]);

      const result = await repository.validateCategoryConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No active time categories configured');
    });

    it('should detect conflicts', async () => {
      const conflictingCategories = [
        { ...mockTimeCategoryRow, min_hours: 4, max_hours: 8, name: 'Half Day' },
        { ...mockTimeCategoryRow, id: 'cat-2', min_hours: 6, max_hours: 10, name: 'Full Day' }
      ];
      mockDbManager.all.mockResolvedValueOnce(conflictingCategories);

      const result = await repository.validateCategoryConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Conflict between'))).toBe(true);
    });

    it('should detect gaps in coverage', async () => {
      const gappedCategories = [
        { ...mockTimeCategoryRow, min_hours: 4, max_hours: 6, name: 'Half Day' },
        { ...mockTimeCategoryRow, id: 'cat-2', min_hours: 8, max_hours: null, name: 'Full Day' }
      ];
      mockDbManager.all.mockResolvedValueOnce(gappedCategories);

      const result = await repository.validateCategoryConfiguration();

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Gap in coverage'))).toBe(true);
    });
  });
});