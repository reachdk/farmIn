import {
  TimeCategoryValidator,
  TimeCategoryLogic,
  TimeCategoryValidationError,
  TimeCategoryConflictError,
  CreateTimeCategoryData,
  UpdateTimeCategoryData,
  TimeCategory
} from '../../models/TimeCategory';

describe('TimeCategoryValidator', () => {
  describe('validateCreate', () => {
    const validData: CreateTimeCategoryData = {
      name: 'Full Day',
      minHours: 8,
      maxHours: 10,
      payMultiplier: 1.0,
      color: '#007bff'
    };

    it('should validate valid create data', () => {
      expect(() => TimeCategoryValidator.validateCreate(validData)).not.toThrow();
    });

    it('should validate minimal create data', () => {
      const minimalData: CreateTimeCategoryData = {
        name: 'Half Day',
        minHours: 4
      };
      expect(() => TimeCategoryValidator.validateCreate(minimalData)).not.toThrow();
    });

    describe('name validation', () => {
      it('should reject empty name', () => {
        const data = { ...validData, name: '' };
        expect(() => TimeCategoryValidator.validateCreate(data))
          .toThrow(new TimeCategoryValidationError('Category name is required', 'name'));
      });

      it('should reject name too short', () => {
        const data = { ...validData, name: 'A' };
        expect(() => TimeCategoryValidator.validateCreate(data))
          .toThrow(new TimeCategoryValidationError('Category name must be 2-50 characters', 'name'));
      });

      it('should reject name too long', () => {
        const data = { ...validData, name: 'A'.repeat(51) };
        expect(() => TimeCategoryValidator.validateCreate(data))
          .toThrow(new TimeCategoryValidationError('Category name must be 2-50 characters', 'name'));
      });
    });

    describe('minHours validation', () => {
      it('should reject undefined minHours', () => {
        const data = { ...validData, minHours: undefined as any };
        expect(() => TimeCategoryValidator.validateCreate(data))
          .toThrow(new TimeCategoryValidationError('Minimum hours is required', 'minHours'));
      });

      it('should reject negative minHours', () => {
        const data = { ...validData, minHours: -1 };
        expect(() => TimeCategoryValidator.validateCreate(data))
          .toThrow(new TimeCategoryValidationError('Minimum hours cannot be negative', 'minHours'));
      });

      it('should reject minHours over 24', () => {
        const data = { ...validData, minHours: 25 };
        expect(() => TimeCategoryValidator.validateCreate(data))
          .toThrow(new TimeCategoryValidationError('Minimum hours cannot exceed 24', 'minHours'));
      });
    });

    describe('maxHours validation', () => {
      it('should accept undefined maxHours', () => {
        const data = { ...validData, maxHours: undefined };
        expect(() => TimeCategoryValidator.validateCreate(data)).not.toThrow();
      });

      it('should reject negative maxHours', () => {
        const data = { ...validData, maxHours: -1 };
        expect(() => TimeCategoryValidator.validateCreate(data))
          .toThrow(new TimeCategoryValidationError('Maximum hours cannot be negative', 'maxHours'));
      });

      it('should reject maxHours over 24', () => {
        const data = { ...validData, maxHours: 25 };
        expect(() => TimeCategoryValidator.validateCreate(data))
          .toThrow(new TimeCategoryValidationError('Maximum hours cannot exceed 24', 'maxHours'));
      });

      it('should reject maxHours less than or equal to minHours', () => {
        const data = { ...validData, minHours: 8, maxHours: 8 };
        expect(() => TimeCategoryValidator.validateCreate(data))
          .toThrow(new TimeCategoryValidationError('Maximum hours must be greater than minimum hours', 'maxHours'));
      });
    });

    describe('payMultiplier validation', () => {
      it('should reject negative payMultiplier', () => {
        const data = { ...validData, payMultiplier: -1 };
        expect(() => TimeCategoryValidator.validateCreate(data))
          .toThrow(new TimeCategoryValidationError('Pay multiplier cannot be negative', 'payMultiplier'));
      });

      it('should reject payMultiplier over 10', () => {
        const data = { ...validData, payMultiplier: 11 };
        expect(() => TimeCategoryValidator.validateCreate(data))
          .toThrow(new TimeCategoryValidationError('Pay multiplier cannot exceed 10', 'payMultiplier'));
      });
    });

    describe('color validation', () => {
      it('should accept valid hex colors', () => {
        const validColors = ['#FF0000', '#00ff00', '#0000FF', '#123', '#abc'];
        validColors.forEach(color => {
          const data = { ...validData, color };
          expect(() => TimeCategoryValidator.validateCreate(data)).not.toThrow();
        });
      });

      it('should reject invalid color formats', () => {
        const invalidColors = ['red', 'FF0000', '#GG0000', '#12345', 'rgb(255,0,0)'];
        invalidColors.forEach(color => {
          const data = { ...validData, color };
          expect(() => TimeCategoryValidator.validateCreate(data))
            .toThrow(new TimeCategoryValidationError('Invalid color format. Use hex format like #FF0000', 'color'));
        });
      });
    });
  });

  describe('validateUpdate', () => {
    it('should validate valid update data', () => {
      const updateData: UpdateTimeCategoryData = {
        name: 'Updated Name',
        minHours: 6,
        payMultiplier: 1.5
      };
      expect(() => TimeCategoryValidator.validateUpdate(updateData)).not.toThrow();
    });

    it('should validate empty update data', () => {
      expect(() => TimeCategoryValidator.validateUpdate({})).not.toThrow();
    });

    it('should reject invalid field values in updates', () => {
      const invalidUpdates = [
        { name: '' },
        { minHours: -1 },
        { maxHours: 25 },
        { payMultiplier: -1 },
        { color: 'invalid' }
      ];

      invalidUpdates.forEach(update => {
        expect(() => TimeCategoryValidator.validateUpdate(update)).toThrow(TimeCategoryValidationError);
      });
    });
  });
});

describe('TimeCategoryLogic', () => {
  const createCategory = (id: string, name: string, minHours: number, maxHours?: number): TimeCategory => ({
    id,
    name,
    minHours,
    maxHours,
    payMultiplier: 1.0,
    color: '#007bff',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  describe('detectConflicts', () => {
    it('should detect overlapping ranges', () => {
      const categories = [
        createCategory('1', 'Half Day', 4, 8),
        createCategory('2', 'Full Day', 6, 10) // Overlaps with Half Day
      ];

      const conflicts = TimeCategoryLogic.detectConflicts(categories);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].reason).toBe('Overlapping hour ranges');
    });

    it('should not detect conflicts for non-overlapping ranges', () => {
      const categories = [
        createCategory('1', 'Half Day', 4, 7.99),
        createCategory('2', 'Full Day', 8, 10)
      ];

      const conflicts = TimeCategoryLogic.detectConflicts(categories);
      expect(conflicts).toHaveLength(0);
    });

    it('should handle categories without max hours', () => {
      const categories = [
        createCategory('1', 'Regular', 4, 8),
        createCategory('2', 'Overtime', 10) // No max hours
      ];

      const conflicts = TimeCategoryLogic.detectConflicts(categories);
      expect(conflicts).toHaveLength(0);
    });

    it('should ignore inactive categories', () => {
      const categories = [
        createCategory('1', 'Half Day', 4, 8),
        { ...createCategory('2', 'Full Day', 6, 10), isActive: false }
      ];

      const conflicts = TimeCategoryLogic.detectConflicts(categories);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('validateNoConflicts', () => {
    const existingCategories = [
      createCategory('1', 'Half Day', 4, 7.99),
      createCategory('2', 'Full Day', 8, 10)
    ];

    it('should pass validation for non-conflicting category', () => {
      const newCategory = { minHours: 2, maxHours: 3.99 };
      expect(() => TimeCategoryLogic.validateNoConflicts(newCategory, existingCategories))
        .not.toThrow();
    });

    it('should throw error for conflicting category', () => {
      const newCategory = { minHours: 6, maxHours: 9 };
      expect(() => TimeCategoryLogic.validateNoConflicts(newCategory, existingCategories))
        .toThrow(TimeCategoryConflictError);
    });

    it('should exclude specified category from conflict check', () => {
      const newCategory = { minHours: 8, maxHours: 10 };
      expect(() => TimeCategoryLogic.validateNoConflicts(newCategory, existingCategories, '2'))
        .not.toThrow();
    });
  });

  describe('assignCategory', () => {
    const categories = [
      createCategory('1', 'Half Day', 4, 7.99),
      createCategory('2', 'Full Day', 8, 9.99),
      createCategory('3', 'Overtime', 10)
    ];

    it('should assign correct category for given hours', () => {
      expect(TimeCategoryLogic.assignCategory(6, categories)?.name).toBe('Half Day');
      expect(TimeCategoryLogic.assignCategory(8, categories)?.name).toBe('Full Day');
      expect(TimeCategoryLogic.assignCategory(12, categories)?.name).toBe('Overtime');
    });

    it('should return null for hours below minimum', () => {
      expect(TimeCategoryLogic.assignCategory(2, categories)).toBeNull();
    });

    it('should assign highest applicable category', () => {
      expect(TimeCategoryLogic.assignCategory(10, categories)?.name).toBe('Overtime');
    });

    it('should handle edge cases at boundaries', () => {
      expect(TimeCategoryLogic.assignCategory(4, categories)?.name).toBe('Half Day');
      expect(TimeCategoryLogic.assignCategory(7.99, categories)?.name).toBe('Half Day');
      expect(TimeCategoryLogic.assignCategory(8, categories)?.name).toBe('Full Day');
    });

    it('should ignore inactive categories', () => {
      const categoriesWithInactive = [
        ...categories,
        { ...createCategory('4', 'Special', 1, 3), isActive: false }
      ];

      expect(TimeCategoryLogic.assignCategory(2, categoriesWithInactive)).toBeNull();
    });
  });

  describe('getSuggestedCategories', () => {
    it('should return suggested categories', () => {
      const suggestions = TimeCategoryLogic.getSuggestedCategories();
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toHaveProperty('name');
      expect(suggestions[0]).toHaveProperty('minHours');
    });

    it('should include common work patterns', () => {
      const suggestions = TimeCategoryLogic.getSuggestedCategories();
      const names = suggestions.map(s => s.name);
      
      expect(names).toContain('Half Day');
      expect(names).toContain('Full Day');
      expect(names).toContain('Overtime');
    });
  });

  describe('calculatePay', () => {
    const categories = [
      createCategory('1', 'Regular', 4, 8),
      { ...createCategory('2', 'Overtime', 8), payMultiplier: 1.5 }
    ];

    it('should calculate pay with correct multiplier', () => {
      const baseRate = 20;
      
      expect(TimeCategoryLogic.calculatePay(6, baseRate, categories)).toBe(120); // 6 * 20 * 1.0
      expect(TimeCategoryLogic.calculatePay(10, baseRate, categories)).toBe(300); // 10 * 20 * 1.5
    });

    it('should use default multiplier when no category matches', () => {
      const baseRate = 20;
      expect(TimeCategoryLogic.calculatePay(2, baseRate, categories)).toBe(40); // 2 * 20 * 1.0
    });
  });
});