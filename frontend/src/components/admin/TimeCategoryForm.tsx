import React, { useState, useEffect } from 'react';
import {
  useCreateTimeCategoryMutation,
  useUpdateTimeCategoryMutation,
  useGetSuggestedCategoriesQuery,
  useValidateCategoryConfigurationMutation,
  TimeCategory,
  CreateTimeCategoryRequest,
} from '../../store/api/timeCategoryApi';
import './TimeCategoryForm.css';

interface TimeCategoryFormProps {
  category?: TimeCategory | null;
  existingCategories: TimeCategory[];
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  name: string;
  minHours: number;
  maxHours: number | '';
  payMultiplier: number;
  color: string;
  isActive: boolean;
}

interface FormErrors {
  name?: string;
  minHours?: string;
  maxHours?: string;
  payMultiplier?: string;
  color?: string;
  general?: string;
}

const DEFAULT_COLORS = [
  '#28a745', '#17a2b8', '#007bff', '#6f42c1', 
  '#fd7e14', '#dc3545', '#20c997', '#6c757d'
];

const TimeCategoryForm: React.FC<TimeCategoryFormProps> = ({ 
  category, 
  existingCategories, 
  onClose, 
  onSuccess 
}) => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    minHours: 0,
    maxHours: '',
    payMultiplier: 1.0,
    color: DEFAULT_COLORS[0],
    isActive: true,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [createCategory] = useCreateTimeCategoryMutation();
  const [updateCategory] = useUpdateTimeCategoryMutation();
  const [validateConfiguration] = useValidateCategoryConfigurationMutation();
  const { data: suggestions } = useGetSuggestedCategoriesQuery();

  const isEditing = !!category;

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        minHours: category.minHours,
        maxHours: category.maxHours || '',
        payMultiplier: category.payMultiplier,
        color: category.color,
        isActive: category.isActive,
      });
    }
  }, [category]);

  const validateForm = async (): Promise<boolean> => {
    const newErrors: FormErrors = {};

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Category name is required';
    } else if (formData.name.trim().length < 2 || formData.name.trim().length > 50) {
      newErrors.name = 'Category name must be 2-50 characters';
    }

    // Min hours validation
    if (formData.minHours < 0) {
      newErrors.minHours = 'Minimum hours cannot be negative';
    } else if (formData.minHours > 24) {
      newErrors.minHours = 'Minimum hours cannot exceed 24';
    }

    // Max hours validation
    if (formData.maxHours !== '' && formData.maxHours !== undefined) {
      const maxHours = Number(formData.maxHours);
      if (maxHours < 0) {
        newErrors.maxHours = 'Maximum hours cannot be negative';
      } else if (maxHours > 24) {
        newErrors.maxHours = 'Maximum hours cannot exceed 24';
      } else if (maxHours <= formData.minHours) {
        newErrors.maxHours = 'Maximum hours must be greater than minimum hours';
      }
    }

    // Pay multiplier validation
    if (formData.payMultiplier < 0) {
      newErrors.payMultiplier = 'Pay multiplier cannot be negative';
    } else if (formData.payMultiplier > 10) {
      newErrors.payMultiplier = 'Pay multiplier cannot exceed 10';
    }

    // Color validation
    if (!formData.color || !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(formData.color)) {
      newErrors.color = 'Invalid color format. Use hex format like #FF0000';
    }

    // Check for conflicts with existing categories
    if (Object.keys(newErrors).length === 0) {
      try {
        const testCategories = existingCategories
          .filter(c => c.id !== category?.id)
          .map(c => ({ ...c }));
        
        testCategories.push({
          id: category?.id || 'new',
          name: formData.name.trim(),
          minHours: formData.minHours,
          maxHours: formData.maxHours === '' ? undefined : Number(formData.maxHours),
          payMultiplier: formData.payMultiplier,
          color: formData.color,
          isActive: formData.isActive,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        const validation = await validateConfiguration({ categories: testCategories }).unwrap();
        if (!validation.valid && validation.conflicts.length > 0) {
          newErrors.general = `Configuration conflicts detected: ${validation.conflicts[0].reason}`;
        }
      } catch (error) {
        console.error('Validation error:', error);
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!(await validateForm())) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const submitData = {
        name: formData.name.trim(),
        minHours: formData.minHours,
        maxHours: formData.maxHours === '' ? undefined : Number(formData.maxHours),
        payMultiplier: formData.payMultiplier,
        color: formData.color,
      };

      if (isEditing) {
        await updateCategory({
          id: category!.id,
          ...submitData,
          isActive: formData.isActive,
        }).unwrap();
      } else {
        await createCategory(submitData as CreateTimeCategoryRequest).unwrap();
      }

      onSuccess();
    } catch (error: any) {
      console.error('Form submission error:', error);
      
      if (error.data?.message) {
        setErrors({ general: error.data.message });
      } else if (error.data?.errors) {
        setErrors(error.data.errors);
      } else {
        setErrors({ general: 'An unexpected error occurred. Please try again.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const applySuggestion = (suggestion: any) => {
    setFormData(prev => ({
      ...prev,
      name: suggestion.name,
      minHours: suggestion.minHours,
      maxHours: suggestion.maxHours || '',
      payMultiplier: suggestion.payMultiplier,
      color: suggestion.color,
    }));
    setShowSuggestions(false);
  };

  return (
    <div className="time-category-form-overlay">
      <div className="time-category-form-modal">
        <div className="time-category-form-header">
          <h3>{isEditing ? 'Edit Time Category' : 'Add New Time Category'}</h3>
          <button className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="time-category-form">
          {errors.general && (
            <div className="error-message general-error">
              {errors.general}
            </div>
          )}

          {!isEditing && suggestions && suggestions.length > 0 && (
            <div className="suggestions-section">
              <button
                type="button"
                className="suggestions-toggle"
                onClick={() => setShowSuggestions(!showSuggestions)}
              >
                💡 Use Suggested Categories
              </button>
              {showSuggestions && (
                <div className="suggestions-list">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      className="suggestion-item"
                      onClick={() => applySuggestion(suggestion)}
                    >
                      <span className="suggestion-name">{suggestion.name}</span>
                      <span className="suggestion-details">
                        {suggestion.minHours}h{suggestion.maxHours ? `-${suggestion.maxHours}h` : '+'} 
                        × {suggestion.payMultiplier}
                      </span>
                      <span 
                        className="suggestion-color" 
                        style={{ backgroundColor: suggestion.color }}
                      ></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Category Name *</label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className={errors.name ? 'error' : ''}
                maxLength={50}
                placeholder="e.g., Full Day, Overtime"
              />
              {errors.name && (
                <span className="error-text">{errors.name}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="color">Color *</label>
              <div className="color-input-group">
                <input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => handleInputChange('color', e.target.value)}
                  className="color-picker"
                />
                <input
                  type="text"
                  value={formData.color}
                  onChange={(e) => handleInputChange('color', e.target.value)}
                  className={`color-text ${errors.color ? 'error' : ''}`}
                  placeholder="#FF0000"
                />
              </div>
              <div className="color-presets">
                {DEFAULT_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`color-preset ${formData.color === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleInputChange('color', color)}
                    title={color}
                  />
                ))}
              </div>
              {errors.color && (
                <span className="error-text">{errors.color}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="minHours">Minimum Hours *</label>
              <input
                id="minHours"
                type="number"
                value={formData.minHours}
                onChange={(e) => handleInputChange('minHours', Number(e.target.value))}
                className={errors.minHours ? 'error' : ''}
                min="0"
                max="24"
                step="0.25"
                placeholder="0"
              />
              {errors.minHours && (
                <span className="error-text">{errors.minHours}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="maxHours">Maximum Hours</label>
              <input
                id="maxHours"
                type="number"
                value={formData.maxHours}
                onChange={(e) => handleInputChange('maxHours', e.target.value === '' ? '' : Number(e.target.value))}
                className={errors.maxHours ? 'error' : ''}
                min="0"
                max="24"
                step="0.25"
                placeholder="No limit"
              />
              {errors.maxHours && (
                <span className="error-text">{errors.maxHours}</span>
              )}
              <small className="field-help">Leave empty for no upper limit</small>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="payMultiplier">Pay Multiplier *</label>
            <input
              id="payMultiplier"
              type="number"
              value={formData.payMultiplier}
              onChange={(e) => handleInputChange('payMultiplier', Number(e.target.value))}
              className={errors.payMultiplier ? 'error' : ''}
              min="0"
              max="10"
              step="0.1"
              placeholder="1.0"
            />
            {errors.payMultiplier && (
              <span className="error-text">{errors.payMultiplier}</span>
            )}
            <small className="field-help">1.0 = regular pay, 1.5 = time and a half, 2.0 = double time</small>
          </div>

          {isEditing && (
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => handleInputChange('isActive', e.target.checked)}
                />
                Active Category
              </label>
            </div>
          )}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-button">
              Cancel
            </button>
            <button 
              type="submit" 
              className="submit-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : (isEditing ? 'Update Category' : 'Create Category')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TimeCategoryForm;