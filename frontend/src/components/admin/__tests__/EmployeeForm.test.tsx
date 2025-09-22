import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import EmployeeForm from '../EmployeeForm';
import { apiSlice } from '../../../store/api/apiSlice';
import authSlice from '../../../store/slices/authSlice';
import offlineSlice from '../../../store/slices/offlineSlice';

const mockEmployee = {
  id: '1',
  employeeNumber: 'EMP001',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  role: 'employee' as const,
  isActive: true,
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:00Z',
};

// Mock functions for API calls
const mockCreateEmployee = jest.fn();
const mockUpdateEmployee = jest.fn();

// Mock the entire employeeApi module
jest.mock('../../../store/api/employeeApi', () => ({
  useCreateEmployeeMutation: () => [
    jest.fn().mockImplementation((data) => ({
      unwrap: () => mockCreateEmployee(data)
    })),
    { isLoading: false }
  ],
  useUpdateEmployeeMutation: () => [
    jest.fn().mockImplementation((data) => ({
      unwrap: () => mockUpdateEmployee(data)
    })),
    { isLoading: false }
  ],
  useCheckEmployeeNumberQuery: (employeeNumber: string, options: any) => ({
    data: options?.skip ? null : { available: true }
  }),
}));

// Create a mock store
const createMockStore = () => {
  return configureStore({
    reducer: {
      api: apiSlice.reducer,
      auth: authSlice,
      offline: offlineSlice,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(apiSlice.middleware),
  });
};

const renderWithProvider = (component: React.ReactElement) => {
  const store = createMockStore();
  return render(
    <Provider store={store}>
      {component}
    </Provider>
  );
};

const mockProps = {
  onClose: jest.fn(),
  onSuccess: jest.fn(),
};

describe('EmployeeForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateEmployee.mockReset();
    mockUpdateEmployee.mockReset();
  });

  describe('Create Employee Mode', () => {
    it('renders create employee form', () => {
      renderWithProvider(<EmployeeForm {...mockProps} />);
      
      expect(screen.getByText('Add New Employee')).toBeInTheDocument();
      expect(screen.getByLabelText(/Employee Number/)).toBeInTheDocument();
      expect(screen.getByLabelText(/First Name/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Last Name/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Role/)).toBeInTheDocument();
      expect(screen.getByText('Create Employee')).toBeInTheDocument();
    });

    it('validates required fields', async () => {
      renderWithProvider(<EmployeeForm {...mockProps} />);
      
      const submitButton = screen.getByText('Create Employee');
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Employee number is required')).toBeInTheDocument();
        expect(screen.getByText('First name is required')).toBeInTheDocument();
        expect(screen.getByText('Last name is required')).toBeInTheDocument();
      });
    });

    it('validates employee number format', async () => {
      renderWithProvider(<EmployeeForm {...mockProps} />);
      
      const employeeNumberInput = screen.getByLabelText(/Employee Number/);
      const firstNameInput = screen.getByLabelText(/First Name/);
      const lastNameInput = screen.getByLabelText(/Last Name/);
      
      // Fill in valid first and last name to isolate employee number validation
      fireEvent.change(firstNameInput, { target: { value: 'John' } });
      fireEvent.change(lastNameInput, { target: { value: 'Doe' } });
      fireEvent.change(employeeNumberInput, { target: { value: 'ab' } }); // Too short - only 2 characters
      
      const submitButton = screen.getByText('Create Employee');
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        // The validation should catch that INVALID123 doesn't match the pattern
        expect(screen.getByText('Employee number must be 3-10 characters, alphanumeric uppercase only')).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('validates name length', async () => {
      renderWithProvider(<EmployeeForm {...mockProps} />);
      
      const employeeNumberInput = screen.getByLabelText(/Employee Number/);
      const firstNameInput = screen.getByLabelText(/First Name/);
      const lastNameInput = screen.getByLabelText(/Last Name/);
      
      // Fill valid employee number to isolate name validation
      fireEvent.change(employeeNumberInput, { target: { value: 'EMP001' } });
      fireEvent.change(firstNameInput, { target: { value: 'A' } });
      fireEvent.change(lastNameInput, { target: { value: 'B' } });
      
      const submitButton = screen.getByText('Create Employee');
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('First name must be 2-50 characters')).toBeInTheDocument();
        expect(screen.getByText('Last name must be 2-50 characters')).toBeInTheDocument();
      });
    });

    it('validates email format', async () => {
      renderWithProvider(<EmployeeForm {...mockProps} />);
      
      const employeeNumberInput = screen.getByLabelText(/Employee Number/);
      const firstNameInput = screen.getByLabelText(/First Name/);
      const lastNameInput = screen.getByLabelText(/Last Name/);
      const emailInput = screen.getByLabelText(/Email/);
      
      // Fill valid required fields to isolate email validation
      fireEvent.change(employeeNumberInput, { target: { value: 'EMP001' } });
      fireEvent.change(firstNameInput, { target: { value: 'John' } });
      fireEvent.change(lastNameInput, { target: { value: 'Doe' } });
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      
      const submitButton = screen.getByText('Create Employee');
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Invalid email format')).toBeInTheDocument();
      });
    });

    it('auto-formats employee number to uppercase', () => {
      renderWithProvider(<EmployeeForm {...mockProps} />);
      
      const employeeNumberInput = screen.getByLabelText(/Employee Number/) as HTMLInputElement;
      fireEvent.change(employeeNumberInput, { target: { value: 'emp001' } });
      
      expect(employeeNumberInput.value).toBe('EMP001');
    });

    it('submits valid form data', async () => {
      mockCreateEmployee.mockResolvedValue(mockEmployee);
      
      renderWithProvider(<EmployeeForm {...mockProps} />);
      
      // Fill out the form with valid data
      fireEvent.change(screen.getByLabelText(/Employee Number/), { target: { value: 'EMP001' } });
      fireEvent.change(screen.getByLabelText(/First Name/), { target: { value: 'John' } });
      fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Doe' } });
      fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'john.doe@example.com' } });
      fireEvent.change(screen.getByLabelText(/Role/), { target: { value: 'manager' } });
      
      const submitButton = screen.getByText('Create Employee');
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(mockCreateEmployee).toHaveBeenCalledWith({
          employeeNumber: 'EMP001',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          role: 'manager',
        });
        expect(mockProps.onSuccess).toHaveBeenCalled();
      });
    });

    it('handles API errors', async () => {
      const errorMessage = 'Employee number already exists';
      mockCreateEmployee.mockRejectedValue({
        data: { message: errorMessage },
      });
      
      renderWithProvider(<EmployeeForm {...mockProps} />);
      
      // Fill out the form
      fireEvent.change(screen.getByLabelText(/Employee Number/), { target: { value: 'EMP001' } });
      fireEvent.change(screen.getByLabelText(/First Name/), { target: { value: 'John' } });
      fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Doe' } });
      
      const submitButton = screen.getByText('Create Employee');
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });
  });

  describe('Edit Employee Mode', () => {
    it('renders edit employee form with existing data', () => {
      renderWithProvider(<EmployeeForm {...mockProps} employee={mockEmployee} />);
      
      expect(screen.getByText('Edit Employee')).toBeInTheDocument();
      expect(screen.getByDisplayValue('EMP001')).toBeInTheDocument();
      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('john.doe@example.com')).toBeInTheDocument();
      
      // Check select value using the select element
      const roleSelect = screen.getByLabelText(/Role/) as HTMLSelectElement;
      expect(roleSelect.value).toBe('employee');
      
      expect(screen.getByText('Update Employee')).toBeInTheDocument();
    });

    it('shows active employee checkbox in edit mode', () => {
      renderWithProvider(<EmployeeForm {...mockProps} employee={mockEmployee} />);
      
      expect(screen.getByLabelText('Active Employee')).toBeInTheDocument();
      expect(screen.getByLabelText('Active Employee')).toBeChecked();
    });

    it('disables employee number field in edit mode', () => {
      renderWithProvider(<EmployeeForm {...mockProps} employee={mockEmployee} />);
      
      const employeeNumberInput = screen.getByDisplayValue('EMP001');
      expect(employeeNumberInput).toBeDisabled();
    });

    it('submits update data', async () => {
      const updatedEmployee = { ...mockEmployee, firstName: 'Jane' };
      mockUpdateEmployee.mockResolvedValue(updatedEmployee);
      
      renderWithProvider(<EmployeeForm {...mockProps} employee={mockEmployee} />);
      
      // Update first name
      const firstNameInput = screen.getByDisplayValue('John');
      fireEvent.change(firstNameInput, { target: { value: 'Jane' } });
      
      const submitButton = screen.getByText('Update Employee');
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(mockUpdateEmployee).toHaveBeenCalledWith({
          id: '1',
          employeeNumber: 'EMP001',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          role: 'employee',
          isActive: true,
        });
        expect(mockProps.onSuccess).toHaveBeenCalled();
      });
    });
  });

  it('closes form when close button is clicked', () => {
    renderWithProvider(<EmployeeForm {...mockProps} />);
    
    const closeButton = screen.getByText('×');
    fireEvent.click(closeButton);
    
    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('closes form when cancel button is clicked', () => {
    renderWithProvider(<EmployeeForm {...mockProps} />);
    
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    
    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('clears field errors when user starts typing', async () => {
    renderWithProvider(<EmployeeForm {...mockProps} />);
    
    // Trigger validation error
    const submitButton = screen.getByText('Create Employee');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('First name is required')).toBeInTheDocument();
    });
    
    // Start typing in first name field
    const firstNameInput = screen.getByLabelText(/First Name/);
    fireEvent.change(firstNameInput, { target: { value: 'J' } });
    
    // Error should be cleared
    expect(screen.queryByText('First name is required')).not.toBeInTheDocument();
  });
});