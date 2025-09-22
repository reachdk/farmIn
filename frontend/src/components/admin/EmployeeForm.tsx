import React, { useState, useEffect } from 'react';
import {
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
  useCheckEmployeeNumberQuery,
  Employee,
  CreateEmployeeRequest,
} from '../../store/api/employeeApi';
import './EmployeeForm.css';

interface EmployeeFormProps {
  employee?: Employee | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'employee' | 'manager' | 'admin';
  isActive: boolean;
}

interface FormErrors {
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  general?: string;
}

const EmployeeForm: React.FC<EmployeeFormProps> = ({ employee, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<FormData>({
    employeeNumber: '',
    firstName: '',
    lastName: '',
    email: '',
    role: 'employee',
    isActive: true,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkEmployeeNumber, setCheckEmployeeNumber] = useState('');

  const [createEmployee] = useCreateEmployeeMutation();
  const [updateEmployee] = useUpdateEmployeeMutation();

  // Check employee number availability (only for new employees)
  const { data: numberCheck } = useCheckEmployeeNumberQuery(checkEmployeeNumber, {
    skip: !checkEmployeeNumber || !!employee,
  });

  const isEditing = !!employee;

  useEffect(() => {
    if (employee) {
      setFormData({
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email || '',
        role: employee.role,
        isActive: employee.isActive,
      });
    }
  }, [employee]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Employee Number validation
    if (!formData.employeeNumber.trim()) {
      newErrors.employeeNumber = 'Employee number is required';
    } else if (!/^[A-Z0-9]{3,10}$/.test(formData.employeeNumber.trim())) {
      newErrors.employeeNumber = 'Employee number must be 3-10 characters, alphanumeric uppercase only';
    } else if (!isEditing && numberCheck && !numberCheck.available) {
      newErrors.employeeNumber = 'Employee number is already in use';
    }

    // First Name validation
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    } else if (formData.firstName.trim().length < 2 || formData.firstName.trim().length > 50) {
      newErrors.firstName = 'First name must be 2-50 characters';
    }

    // Last Name validation
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    } else if (formData.lastName.trim().length < 2 || formData.lastName.trim().length > 50) {
      newErrors.lastName = 'Last name must be 2-50 characters';
    }

    // Email validation (optional)
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }

    // Check employee number availability for new employees
    if (field === 'employeeNumber' && typeof value === 'string' && !isEditing) {
      const trimmedValue = value.trim().toUpperCase();
      if (trimmedValue.length >= 3 && /^[A-Z0-9]+$/.test(trimmedValue)) {
        setCheckEmployeeNumber(trimmedValue);
      } else {
        setCheckEmployeeNumber('');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const submitData = {
        employeeNumber: formData.employeeNumber.trim().toUpperCase(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim() || undefined,
        role: formData.role,
      };

      if (isEditing) {
        await updateEmployee({
          id: employee!.id,
          ...submitData,
          isActive: formData.isActive,
        }).unwrap();
      } else {
        await createEmployee(submitData as CreateEmployeeRequest).unwrap();
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

  const handleEmployeeNumberChange = (value: string) => {
    // Auto-uppercase and filter invalid characters
    const cleanValue = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    handleInputChange('employeeNumber', cleanValue);
  };

  return (
    <div className="employee-form-overlay">
      <div className="employee-form-modal">
        <div className="employee-form-header">
          <h3>{isEditing ? 'Edit Employee' : 'Add New Employee'}</h3>
          <button className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="employee-form">
          {errors.general && (
            <div className="error-message general-error">
              {errors.general}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="employeeNumber">
                Employee Number *
                {!isEditing && checkEmployeeNumber && numberCheck && (
                  <span className={`availability-indicator ${numberCheck.available ? 'available' : 'unavailable'}`}>
                    {numberCheck.available ? '✓ Available' : '✗ Already in use'}
                  </span>
                )}
              </label>
              <input
                id="employeeNumber"
                type="text"
                value={formData.employeeNumber}
                onChange={(e) => handleEmployeeNumberChange(e.target.value)}
                className={errors.employeeNumber ? 'error' : ''}
                maxLength={10}
                placeholder="e.g., EMP001"
                disabled={isEditing} // Don't allow changing employee number when editing
              />
              {errors.employeeNumber && (
                <span className="error-text">{errors.employeeNumber}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="role">Role *</label>
              <select
                id="role"
                value={formData.role}
                onChange={(e) => handleInputChange('role', e.target.value as any)}
                className={errors.role ? 'error' : ''}
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
              {errors.role && (
                <span className="error-text">{errors.role}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstName">First Name *</label>
              <input
                id="firstName"
                type="text"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                className={errors.firstName ? 'error' : ''}
                maxLength={50}
                placeholder="Enter first name"
              />
              {errors.firstName && (
                <span className="error-text">{errors.firstName}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="lastName">Last Name *</label>
              <input
                id="lastName"
                type="text"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                className={errors.lastName ? 'error' : ''}
                maxLength={50}
                placeholder="Enter last name"
              />
              {errors.lastName && (
                <span className="error-text">{errors.lastName}</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className={errors.email ? 'error' : ''}
              placeholder="Enter email address (optional)"
            />
            {errors.email && (
              <span className="error-text">{errors.email}</span>
            )}
          </div>

          {isEditing && (
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => handleInputChange('isActive', e.target.checked)}
                />
                Active Employee
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
              disabled={isSubmitting || (!isEditing && checkEmployeeNumber && numberCheck && !numberCheck.available)}
            >
              {isSubmitting ? 'Saving...' : (isEditing ? 'Update Employee' : 'Create Employee')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmployeeForm;