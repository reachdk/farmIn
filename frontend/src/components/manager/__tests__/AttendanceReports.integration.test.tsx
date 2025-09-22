import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AttendanceReports from '../AttendanceReports';
import authReducer from '../../../store/slices/authSlice';
import offlineReducer from '../../../store/slices/offlineSlice';
import { apiSlice } from '../../../store/api/apiSlice';

// Mock the attendance API hooks
const mockUseGetAttendanceReportQuery = jest.fn();
const mockUseExportAttendanceReportMutation = jest.fn();
const mockUseGetAllEmployeesQuery = jest.fn();

jest.mock('../../../store/api/attendanceApi', () => ({
  useGetAttendanceReportQuery: () => mockUseGetAttendanceReportQuery(),
  useExportAttendanceReportMutation: () => mockUseExportAttendanceReportMutation(),
  useGetAllEmployeesQuery: () => mockUseGetAllEmployeesQuery(),
}));

// Mock URL.createObjectURL for file downloads
global.URL.createObjectURL = jest.fn(() => 'mock-blob-url');
global.URL.revokeObjectURL = jest.fn();

// Mock data
const mockEmployees = [
  {
    id: '1',
    employeeNumber: 'EMP001',
    firstName: 'Alice',
    lastName: 'Johnson',
    email: 'alice@farm.com',
    role: 'employee' as const,
    isActive: true,
  },
  {
    id: '2',
    employeeNumber: 'EMP002',
    firstName: 'Bob',
    lastName: 'Smith',
    email: 'bob@farm.com',
    role: 'employee' as const,
    isActive: true,
  },
];

const mockReportData = {
  reportPeriod: {
    startDate: '2023-11-01',
    endDate: '2023-11-30',
  },
  summary: {
    totalEmployees: 2,
    totalHours: 320,
    averageHoursPerEmployee: 160,
    totalRegularHours: 280,
    totalOvertimeHours: 40,
  },
  employees: [
    {
      employeeId: '1',
      employeeName: 'Alice Johnson',
      employeeNumber: 'EMP001',
      totalHours: 180,
      regularHours: 160,
      overtimeHours: 20,
      totalDays: 22,
      averageHoursPerDay: 8.2,
      timeCategories: {
        'Regular': 160,
        'Overtime': 20,
      },
    },
    {
      employeeId: '2',
      employeeName: 'Bob Smith',
      employeeNumber: 'EMP002',
      totalHours: 140,
      regularHours: 120,
      overtimeHours: 20,
      totalDays: 18,
      averageHoursPerDay: 7.8,
      timeCategories: {
        'Regular': 120,
        'Overtime': 20,
      },
    },
  ],
  generatedAt: '2023-12-01T10:00:00Z',
};

const mockUser = {
  id: '1',
  employeeId: 'MGR001',
  name: 'John Manager',
  role: 'manager' as const,
};

const createTestStore = (preloadedState?: any) => configureStore({
  reducer: {
    auth: authReducer,
    offline: offlineReducer,
    [apiSlice.reducerPath]: apiSlice.reducer,
  },
  preloadedState: {
    auth: {
      user: mockUser,
      token: 'mock-token',
      isAuthenticated: true,
    },
    offline: {
      isOnline: true,
      pendingActions: [],
      lastSyncAttempt: null,
    },
    ...preloadedState,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
      },
    }).concat(apiSlice.middleware),
});

const renderWithProviders = (component: React.ReactElement, options: { initialState?: any } = {}) => {
  const store = createTestStore(options.initialState);
  return {
    ...render(
      <Provider store={store}>
        {component}
      </Provider>
    ),
    store,
  };
};

describe('AttendanceReports Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Ensure DOM is available
    if (!document.body) {
      document.body = document.createElement('body');
    }
    
    // Default mock implementations
    mockUseGetAllEmployeesQuery.mockReturnValue({
      data: mockEmployees,
      error: undefined,
      isLoading: false,
    });
    
    mockUseGetAttendanceReportQuery.mockReturnValue({
      data: mockReportData,
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });
    
    mockUseExportAttendanceReportMutation.mockReturnValue([
      jest.fn(),
      { isLoading: false }
    ]);
  });

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = '';
  });

  test('renders loading state', () => {
    mockUseGetAttendanceReportQuery.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      refetch: jest.fn(),
    });

    renderWithProviders(<AttendanceReports />);
    expect(screen.getByText('Loading report...')).toBeInTheDocument();
  });

  test('renders error state with retry functionality', () => {
    const mockRefetch = jest.fn();
    mockUseGetAttendanceReportQuery.mockReturnValue({
      data: undefined,
      error: { status: 500, message: 'Server error' },
      isLoading: false,
      refetch: mockRefetch,
    });

    renderWithProviders(<AttendanceReports />);
    
    expect(screen.getByText('Error Loading Report')).toBeInTheDocument();
    expect(screen.getByText('Unable to load attendance report. Please try again.')).toBeInTheDocument();
    
    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalled();
  });

  test('renders report with all required elements', () => {
    renderWithProviders(<AttendanceReports />);
    
    // Check header
    expect(screen.getByText('Attendance Reports')).toBeInTheDocument();
    expect(screen.getByText('Generate and export attendance reports for payroll processing')).toBeInTheDocument();
    
    // Check controls
    expect(screen.getByLabelText('Start Date:')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date:')).toBeInTheDocument();
    expect(screen.getByLabelText('Report Format:')).toBeInTheDocument();
    expect(screen.getByText('Show Filters')).toBeInTheDocument();
    
    // Check export buttons
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
    expect(screen.getByText('Export Excel')).toBeInTheDocument();
    expect(screen.getByText('Export PDF')).toBeInTheDocument();
  });

  test('displays report summary correctly', () => {
    renderWithProviders(<AttendanceReports />);
    
    expect(screen.getByText('Report Summary')).toBeInTheDocument();
    expect(screen.getByText('11/1/2023 - 11/30/2023')).toBeInTheDocument();
    
    // Check summary statistics
    expect(screen.getByText('2')).toBeInTheDocument(); // Total employees
    expect(screen.getByText('320.0h')).toBeInTheDocument(); // Total hours
    expect(screen.getAllByText('160.0h')).toHaveLength(2); // Average hours per employee (appears in summary and table)
    expect(screen.getByText('280.0h')).toBeInTheDocument(); // Regular hours
    expect(screen.getByText('40.0h')).toBeInTheDocument(); // Overtime hours
  });

  test('displays employee breakdown table', () => {
    renderWithProviders(<AttendanceReports />);
    
    expect(screen.getByText('Employee Breakdown')).toBeInTheDocument();
    
    // Check table headers
    expect(screen.getByText('Employee')).toBeInTheDocument();
    expect(screen.getByText('Employee #')).toBeInTheDocument();
    expect(screen.getAllByText('Total Hours')).toHaveLength(2); // Appears in summary and table header
    expect(screen.getAllByText('Regular Hours')).toHaveLength(2); // Appears in summary and table header
    expect(screen.getAllByText('Overtime Hours')).toHaveLength(2); // Appears in summary and table header
    expect(screen.getByText('Days Worked')).toBeInTheDocument();
    expect(screen.getByText('Avg Hours/Day')).toBeInTheDocument();
    expect(screen.getByText('Time Categories')).toBeInTheDocument();
    
    // Check employee data
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('#EMP001')).toBeInTheDocument();
    expect(screen.getByText('#EMP002')).toBeInTheDocument();
  });

  test('handles date range changes', async () => {
    renderWithProviders(<AttendanceReports />);
    
    const startDateInput = screen.getByLabelText('Start Date:') as HTMLInputElement;
    const endDateInput = screen.getByLabelText('End Date:') as HTMLInputElement;
    
    fireEvent.change(startDateInput, { target: { value: '2023-12-01' } });
    fireEvent.change(endDateInput, { target: { value: '2023-12-31' } });
    
    expect(startDateInput.value).toBe('2023-12-01');
    expect(endDateInput.value).toBe('2023-12-31');
  });

  test('handles report format changes', () => {
    renderWithProviders(<AttendanceReports />);
    
    const formatSelect = screen.getByLabelText('Report Format:') as HTMLSelectElement;
    
    fireEvent.change(formatSelect, { target: { value: 'detailed' } });
    expect(formatSelect.value).toBe('detailed');
    
    fireEvent.change(formatSelect, { target: { value: 'summary' } });
    expect(formatSelect.value).toBe('summary');
  });

  test('toggles employee filters visibility', () => {
    renderWithProviders(<AttendanceReports />);
    
    const filterToggle = screen.getByText('Show Filters');
    
    // Initially filters should be hidden
    expect(screen.queryByText('Employee Selection')).not.toBeInTheDocument();
    
    // Show filters
    fireEvent.click(filterToggle);
    expect(screen.getByText('Employee Selection')).toBeInTheDocument();
    expect(screen.getByText('Hide Filters')).toBeInTheDocument();
    
    // Hide filters
    fireEvent.click(screen.getByText('Hide Filters'));
    expect(screen.queryByText('Employee Selection')).not.toBeInTheDocument();
    expect(screen.getByText('Show Filters')).toBeInTheDocument();
  });

  test('handles employee selection', () => {
    renderWithProviders(<AttendanceReports />);
    
    // Show filters
    fireEvent.click(screen.getByText('Show Filters'));
    
    // Check individual employee selection
    const aliceCheckbox = screen.getByLabelText('Alice Johnson (#EMP001)') as HTMLInputElement;
    const bobCheckbox = screen.getByLabelText('Bob Smith (#EMP002)') as HTMLInputElement;
    
    expect(aliceCheckbox.checked).toBe(false);
    expect(bobCheckbox.checked).toBe(false);
    
    fireEvent.click(aliceCheckbox);
    expect(aliceCheckbox.checked).toBe(true);
    
    fireEvent.click(bobCheckbox);
    expect(bobCheckbox.checked).toBe(true);
  });

  test('handles select all employees functionality', () => {
    renderWithProviders(<AttendanceReports />);
    
    // Show filters
    fireEvent.click(screen.getByText('Show Filters'));
    
    const selectAllCheckbox = screen.getByLabelText('Select All Employees') as HTMLInputElement;
    const aliceCheckbox = screen.getByLabelText('Alice Johnson (#EMP001)') as HTMLInputElement;
    const bobCheckbox = screen.getByLabelText('Bob Smith (#EMP002)') as HTMLInputElement;
    
    // Initially nothing selected
    expect(selectAllCheckbox.checked).toBe(false);
    expect(aliceCheckbox.checked).toBe(false);
    expect(bobCheckbox.checked).toBe(false);
    
    // Select all
    fireEvent.click(selectAllCheckbox);
    expect(selectAllCheckbox.checked).toBe(true);
    expect(aliceCheckbox.checked).toBe(true);
    expect(bobCheckbox.checked).toBe(true);
    
    // Deselect all
    fireEvent.click(selectAllCheckbox);
    expect(selectAllCheckbox.checked).toBe(false);
    expect(aliceCheckbox.checked).toBe(false);
    expect(bobCheckbox.checked).toBe(false);
  });

  test('handles export functionality', async () => {
    const mockExportFn = jest.fn().mockResolvedValue({
      unwrap: () => Promise.resolve({
        filename: 'attendance-report.csv',
        downloadUrl: 'blob:mock-url',
        expiresAt: '2023-12-02T10:00:00Z',
      }),
    });
    
    mockUseExportAttendanceReportMutation.mockReturnValue([
      mockExportFn,
      { isLoading: false }
    ]);

    // Create a more robust DOM setup
    const originalCreateElement = document.createElement;
    const mockLink = {
      href: '',
      download: '',
      click: jest.fn(),
      style: {},
    };
    
    // Mock createElement only for 'a' elements
    document.createElement = jest.fn((tagName: string) => {
      if (tagName === 'a') {
        return mockLink as any;
      }
      return originalCreateElement.call(document, tagName);
    });

    const mockAppendChild = jest.fn();
    const mockRemoveChild = jest.fn();
    document.body.appendChild = mockAppendChild;
    document.body.removeChild = mockRemoveChild;

    renderWithProviders(<AttendanceReports />);
    
    const csvExportButton = screen.getByText('Export CSV');
    fireEvent.click(csvExportButton);
    
    await waitFor(() => {
      expect(mockExportFn).toHaveBeenCalledWith({
        startDate: expect.any(String),
        endDate: expect.any(String),
        employeeIds: undefined,
        format: 'summary',
        exportType: 'csv',
      });
    });
    
    // Verify DOM manipulation was called
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockAppendChild).toHaveBeenCalledWith(mockLink);
    expect(mockRemoveChild).toHaveBeenCalledWith(mockLink);

    // Restore original methods
    document.createElement = originalCreateElement;
  });

  test('disables export buttons when exporting', () => {
    mockUseExportAttendanceReportMutation.mockReturnValue([
      jest.fn(),
      { isLoading: true }
    ]);

    renderWithProviders(<AttendanceReports />);
    
    const csvButton = screen.getByText('Export CSV');
    const excelButton = screen.getByText('Export Excel');
    const pdfButton = screen.getByText('Export PDF');
    
    expect(csvButton).toBeDisabled();
    expect(excelButton).toBeDisabled();
    expect(pdfButton).toBeDisabled();
  });

  test('displays generated timestamp', () => {
    renderWithProviders(<AttendanceReports />);
    
    expect(screen.getByText(/Report generated on:/)).toBeInTheDocument();
    expect(screen.getByText(/12\/1\/2023/)).toBeInTheDocument(); // Based on mockReportData.generatedAt
  });

  test('formats hours correctly', () => {
    renderWithProviders(<AttendanceReports />);
    
    // Check that hours are formatted with one decimal place and 'h' suffix
    expect(screen.getByText('180.0h')).toBeInTheDocument(); // Alice's total hours
    expect(screen.getByText('140.0h')).toBeInTheDocument(); // Bob's total hours
    expect(screen.getByText('8.2h')).toBeInTheDocument(); // Alice's avg hours per day
    expect(screen.getByText('7.8h')).toBeInTheDocument(); // Bob's avg hours per day
  });

  test('displays time categories as tags', () => {
    renderWithProviders(<AttendanceReports />);
    
    // Check that time categories are displayed as tags with proper formatting
    expect(screen.getByText('Regular: 160.0h')).toBeInTheDocument(); // Alice's regular hours
    expect(screen.getByText('Regular: 120.0h')).toBeInTheDocument(); // Bob's regular hours
    expect(screen.getAllByText('Overtime: 20.0h')).toHaveLength(2); // Both employees' overtime
  });

  test('has proper accessibility attributes', () => {
    renderWithProviders(<AttendanceReports />);
    
    // Check heading structure
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Attendance Reports');
    expect(screen.getByRole('heading', { level: 2, name: 'Report Summary' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Employee Breakdown' })).toBeInTheDocument();
    
    // Check form labels
    expect(screen.getByLabelText('Start Date:')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date:')).toBeInTheDocument();
    expect(screen.getByLabelText('Report Format:')).toBeInTheDocument();
    
    // Check table structure
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    
    // Check buttons have accessible text
    const exportButtons = screen.getAllByRole('button');
    expect(exportButtons.length).toBeGreaterThan(0);
    exportButtons.forEach(button => {
      expect(button).toHaveTextContent(/Export|Show|Hide|Retry/);
    });
  });

  test('handles empty report data gracefully', () => {
    mockUseGetAttendanceReportQuery.mockReturnValue({
      data: {
        ...mockReportData,
        employees: [],
        summary: {
          totalEmployees: 0,
          totalHours: 0,
          averageHoursPerEmployee: 0,
          totalRegularHours: 0,
          totalOvertimeHours: 0,
        },
      },
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });

    renderWithProviders(<AttendanceReports />);
    
    // Should still render the structure but with zero values
    expect(screen.getByText('0')).toBeInTheDocument(); // Total employees
    expect(screen.getByText('0.0h')).toBeInTheDocument(); // Total hours
    
    // Table should still be present but empty
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Employee Breakdown')).toBeInTheDocument();
  });

  test('handles API errors gracefully', () => {
    mockUseGetAttendanceReportQuery.mockReturnValue({
      data: undefined,
      error: { status: 'FETCH_ERROR', error: 'Network error' },
      isLoading: false,
      refetch: jest.fn(),
    });

    // This should not throw
    expect(() => {
      renderWithProviders(<AttendanceReports />);
    }).not.toThrow();

    expect(screen.getByText('Error Loading Report')).toBeInTheDocument();
    expect(screen.getByText('Unable to load attendance report. Please try again.')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  test('handles malformed data gracefully', () => {
    mockUseGetAttendanceReportQuery.mockReturnValue({
      data: {
        // Malformed data missing required fields
        reportPeriod: {},
        summary: {},
        employees: null,
        generatedAt: null,
      } as any,
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });

    // This should not throw even with malformed data
    expect(() => {
      renderWithProviders(<AttendanceReports />);
    }).not.toThrow();
    
    // Should still render basic structure
    expect(screen.getByText('Attendance Reports')).toBeInTheDocument();
  });
});