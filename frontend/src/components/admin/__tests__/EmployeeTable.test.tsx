import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EmployeeTable from '../EmployeeTable';

const mockEmployees = [
  {
    id: '1',
    employeeNumber: 'EMP001',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    role: 'employee' as const,
    isActive: true,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    employeeNumber: 'EMP002',
    firstName: 'Jane',
    lastName: 'Smith',
    email: '',
    role: 'manager' as const,
    isActive: false,
    createdAt: '2023-01-02T00:00:00Z',
    updatedAt: '2023-01-02T00:00:00Z',
  },
  {
    id: '3',
    employeeNumber: 'EMP003',
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@example.com',
    role: 'admin' as const,
    isActive: true,
    createdAt: '2023-01-03T00:00:00Z',
    updatedAt: '2023-01-03T00:00:00Z',
  },
];

const mockProps = {
  employees: mockEmployees,
  isLoading: false,
  selectedEmployees: [],
  sortBy: 'firstName',
  sortOrder: 'asc' as const,
  onSelectEmployee: jest.fn(),
  onSelectAll: jest.fn(),
  onSort: jest.fn(),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
};

describe('EmployeeTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state', () => {
    render(<EmployeeTable {...mockProps} isLoading={true} employees={[]} />);
    
    expect(screen.getByText('Loading employees...')).toBeInTheDocument();
    expect(document.querySelector('.loading-spinner')).toBeInTheDocument(); // Loading spinner
  });

  it('renders empty state', () => {
    render(<EmployeeTable {...mockProps} employees={[]} />);
    
    expect(screen.getByText('No employees found.')).toBeInTheDocument();
  });

  it('renders employee data correctly', () => {
    render(<EmployeeTable {...mockProps} />);
    
    // Check employee numbers
    expect(screen.getByText('EMP001')).toBeInTheDocument();
    expect(screen.getByText('EMP002')).toBeInTheDocument();
    expect(screen.getByText('EMP003')).toBeInTheDocument();
    
    // Check names
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    
    // Check emails
    expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('No email')).toBeInTheDocument();
    
    // Check roles
    expect(screen.getByText('Employee')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    
    // Check status
    expect(screen.getAllByText('Active')).toHaveLength(2);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('handles individual employee selection', () => {
    render(<EmployeeTable {...mockProps} />);
    
    const checkboxes = screen.getAllByRole('checkbox');
    const firstEmployeeCheckbox = checkboxes[1]; // Skip the "select all" checkbox
    
    fireEvent.click(firstEmployeeCheckbox);
    
    expect(mockProps.onSelectEmployee).toHaveBeenCalledWith('1', true);
  });

  it('handles select all functionality', () => {
    render(<EmployeeTable {...mockProps} />);
    
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAllCheckbox);
    
    expect(mockProps.onSelectAll).toHaveBeenCalledWith(true);
  });

  it('shows correct select all state when all employees are selected', () => {
    render(
      <EmployeeTable 
        {...mockProps} 
        selectedEmployees={['1', '2', '3']} 
      />
    );
    
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
    expect(selectAllCheckbox.checked).toBe(true);
  });

  it('shows indeterminate state when some employees are selected', () => {
    render(
      <EmployeeTable 
        {...mockProps} 
        selectedEmployees={['1', '2']} 
      />
    );
    
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
    expect(selectAllCheckbox.indeterminate).toBe(true);
  });

  it('highlights selected rows', () => {
    render(
      <EmployeeTable 
        {...mockProps} 
        selectedEmployees={['1']} 
      />
    );
    
    const rows = screen.getAllByRole('row');
    const selectedRow = rows.find(row => row.textContent?.includes('John Doe'));
    expect(selectedRow).toHaveClass('selected');
  });

  it('handles column sorting', () => {
    render(<EmployeeTable {...mockProps} />);
    
    const nameHeader = screen.getByText(/Name/);
    fireEvent.click(nameHeader);
    
    expect(mockProps.onSort).toHaveBeenCalledWith('firstName');
  });

  it('displays correct sort indicators', () => {
    render(<EmployeeTable {...mockProps} sortBy="firstName" sortOrder="asc" />);
    
    const nameHeader = screen.getByText(/Name/);
    expect(nameHeader.textContent).toContain('↑');
  });

  it('displays correct sort indicators for descending order', () => {
    render(<EmployeeTable {...mockProps} sortBy="firstName" sortOrder="desc" />);
    
    const nameHeader = screen.getByText(/Name/);
    expect(nameHeader.textContent).toContain('↓');
  });

  it('handles edit button clicks', () => {
    render(<EmployeeTable {...mockProps} />);
    
    const editButtons = screen.getAllByTitle('Edit employee');
    fireEvent.click(editButtons[0]);
    
    expect(mockProps.onEdit).toHaveBeenCalledWith(mockEmployees[0]);
  });

  it('handles delete button clicks', () => {
    render(<EmployeeTable {...mockProps} />);
    
    const deleteButtons = screen.getAllByTitle('Delete employee');
    fireEvent.click(deleteButtons[0]);
    
    expect(mockProps.onDelete).toHaveBeenCalledWith('1');
  });

  it('formats dates correctly', () => {
    render(<EmployeeTable {...mockProps} />);
    
    // Check that dates are formatted (exact format may vary by locale)
    expect(screen.getByText(/1\/1\/2023|2023-01-01|Jan 1, 2023/)).toBeInTheDocument();
  });

  it('applies correct CSS classes for role badges', () => {
    render(<EmployeeTable {...mockProps} />);
    
    const adminBadge = screen.getByText('Admin');
    const managerBadge = screen.getByText('Manager');
    const employeeBadge = screen.getByText('Employee');
    
    expect(adminBadge).toHaveClass('role-badge', 'admin');
    expect(managerBadge).toHaveClass('role-badge', 'manager');
    expect(employeeBadge).toHaveClass('role-badge', 'employee');
  });

  it('applies correct CSS classes for status badges', () => {
    render(<EmployeeTable {...mockProps} />);
    
    const activeBadges = screen.getAllByText('Active');
    const inactiveBadge = screen.getByText('Inactive');
    
    activeBadges.forEach(badge => {
      expect(badge).toHaveClass('status-badge', 'active');
    });
    expect(inactiveBadge).toHaveClass('status-badge', 'inactive');
  });

  it('handles empty email display', () => {
    render(<EmployeeTable {...mockProps} />);
    
    const noEmailText = screen.getByText('No email');
    expect(noEmailText).toHaveClass('no-email');
  });
});