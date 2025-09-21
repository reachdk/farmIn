export interface TimeCategory {
  id: string;
  name: string;
  minHours: number;
  maxHours?: number;
  payMultiplier: number;
  color: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTimeCategoryData {
  name: string;
  minHours: number;
  maxHours?: number;
  payMultiplier?: number;
  color?: string;
}

export interface UpdateTimeCategoryData {
  name?: string;
  minHours?: number;
  maxHours?: number;
  payMultiplier?: number;
  color?: string;
  isActive?: boolean;
}

export class TimeCategoryValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'TimeCategoryValidationError';
  }
}

export class TimeCategoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeCategoryConflictError';
  }
}

export class TimeCategoryValidator {
  static validateCreate(data: CreateTimeCategoryData): void {
    if (!data.name?.trim()) {
      throw new TimeCategoryValidationError('Category name is required', 'name');
    }

    if (data.name.trim().length < 2 || data.name.trim().length > 50) {
      throw new TimeCategoryValidationError('Category name must be 2-50 characters', 'name');
    }

    if (data.minHours === undefined || data.minHours === null) {
      throw new TimeCategoryValidationError('Minimum hours is required', 'minHours');
    }

    if (data.minHours < 0) {
      throw new TimeCategoryValidationError('Minimum hours cannot be negative', 'minHours');
    }

    if (data.minHours > 24) {
      throw new TimeCategoryValidationError('Minimum hours cannot exceed 24', 'minHours');
    }

    if (data.maxHours !== undefined && data.maxHours !== null) {
      if (data.maxHours < 0) {
        throw new TimeCategoryValidationError('Maximum hours cannot be negative', 'maxHours');
      }

      if (data.maxHours > 24) {
        throw new TimeCategoryValidationError('Maximum hours cannot exceed 24', 'maxHours');
      }

      if (data.maxHours <= data.minHours) {
        throw new TimeCategoryValidationError('Maximum hours must be greater than minimum hours', 'maxHours');
      }
    }

    if (data.payMultiplier !== undefined && data.payMultiplier !== null) {
      if (data.payMultiplier < 0) {
        throw new TimeCategoryValidationError('Pay multiplier cannot be negative', 'payMultiplier');
      }

      if (data.payMultiplier > 10) {
        throw new TimeCategoryValidationError('Pay multiplier cannot exceed 10', 'payMultiplier');
      }
    }

    if (data.color && !this.isValidColor(data.color)) {
      throw new TimeCategoryValidationError('Invalid color format. Use hex format like #FF0000', 'color');
    }
  }

  static validateUpdate(data: UpdateTimeCategoryData): void {
    if (data.name !== undefined) {
      if (!data.name?.trim()) {
        throw new TimeCategoryValidationError('Category name cannot be empty', 'name');
      }

      if (data.name.trim().length < 2 || data.name.trim().length > 50) {
        throw new TimeCategoryValidationError('Category name must be 2-50 characters', 'name');
      }
    }

    if (data.minHours !== undefined) {
      if (data.minHours < 0) {
        throw new TimeCategoryValidationError('Minimum hours cannot be negative', 'minHours');
      }

      if (data.minHours > 24) {
        throw new TimeCategoryValidationError('Minimum hours cannot exceed 24', 'minHours');
      }
    }

    if (data.maxHours !== undefined && data.maxHours !== null) {
      if (data.maxHours < 0) {
        throw new TimeCategoryValidationError('Maximum hours cannot be negative', 'maxHours');
      }

      if (data.maxHours > 24) {
        throw new TimeCategoryValidationError('Maximum hours cannot exceed 24', 'maxHours');
      }
    }

    if (data.payMultiplier !== undefined) {
      if (data.payMultiplier < 0) {
        throw new TimeCategoryValidationError('Pay multiplier cannot be negative', 'payMultiplier');
      }

      if (data.payMultiplier > 10) {
        throw new TimeCategoryValidationError('Pay multiplier cannot exceed 10', 'payMultiplier');
      }
    }

    if (data.color && !this.isValidColor(data.color)) {
      throw new TimeCategoryValidationError('Invalid color format. Use hex format like #FF0000', 'color');
    }
  }

  private static isValidColor(color: string): boolean {
    // Check for hex color format (#RRGGBB or #RGB)
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexColorRegex.test(color);
  }
}

export class TimeCategoryLogic {
  /**
   * Check for conflicts between time categories
   */
  static detectConflicts(categories: TimeCategory[]): Array<{ category1: TimeCategory; category2: TimeCategory; reason: string }> {
    const conflicts: Array<{ category1: TimeCategory; category2: TimeCategory; reason: string }> = [];
    const activeCategories = categories.filter(c => c.isActive);

    for (let i = 0; i < activeCategories.length; i++) {
      for (let j = i + 1; j < activeCategories.length; j++) {
        const cat1 = activeCategories[i];
        const cat2 = activeCategories[j];

        // Check for overlapping ranges
        if (this.hasOverlap(cat1, cat2)) {
          conflicts.push({
            category1: cat1,
            category2: cat2,
            reason: 'Overlapping hour ranges'
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Validate that a new/updated category doesn't conflict with existing ones
   */
  static validateNoConflicts(
    newCategory: { minHours: number; maxHours?: number },
    existingCategories: TimeCategory[],
    excludeId?: string
  ): void {
    const activeCategories = existingCategories
      .filter(c => c.isActive && c.id !== excludeId);

    for (const existing of activeCategories) {
      if (this.hasOverlap(newCategory, existing)) {
        throw new TimeCategoryConflictError(
          `Category conflicts with existing category "${existing.name}". Hour ranges overlap.`
        );
      }
    }
  }

  /**
   * Get the optimal category assignment for given hours
   */
  static assignCategory(hours: number, categories: TimeCategory[]): TimeCategory | null {
    const activeCategories = categories
      .filter(c => c.isActive)
      .sort((a, b) => b.minHours - a.minHours); // Sort by minHours descending

    for (const category of activeCategories) {
      if (hours >= category.minHours) {
        // Check if there's a max hours constraint
        if (category.maxHours === undefined || hours <= category.maxHours) {
          return category;
        }
      }
    }

    return null;
  }

  /**
   * Get category suggestions based on common work patterns
   */
  static getSuggestedCategories(): CreateTimeCategoryData[] {
    return [
      {
        name: 'Quarter Day',
        minHours: 2,
        maxHours: 3.99,
        payMultiplier: 1.0,
        color: '#28a745'
      },
      {
        name: 'Half Day',
        minHours: 4,
        maxHours: 7.99,
        payMultiplier: 1.0,
        color: '#17a2b8'
      },
      {
        name: 'Full Day',
        minHours: 8,
        maxHours: 9.99,
        payMultiplier: 1.0,
        color: '#007bff'
      },
      {
        name: 'Overtime',
        minHours: 10,
        payMultiplier: 1.5,
        color: '#fd7e14'
      },
      {
        name: 'Double Time',
        minHours: 12,
        payMultiplier: 2.0,
        color: '#dc3545'
      }
    ];
  }

  /**
   * Calculate total pay for hours worked based on category
   */
  static calculatePay(hours: number, baseRate: number, categories: TimeCategory[]): number {
    const category = this.assignCategory(hours, categories);
    const multiplier = category?.payMultiplier || 1.0;
    return hours * baseRate * multiplier;
  }

  private static hasOverlap(
    cat1: { minHours: number; maxHours?: number },
    cat2: { minHours: number; maxHours?: number }
  ): boolean {
    const cat1Max = cat1.maxHours || Number.MAX_SAFE_INTEGER;
    const cat2Max = cat2.maxHours || Number.MAX_SAFE_INTEGER;

    // Check if ranges overlap: ranges overlap if one starts before the other ends
    return !(cat1Max <= cat2.minHours || cat2Max <= cat1.minHours);
  }
}