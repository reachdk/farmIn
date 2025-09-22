import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import TimeAdjustments from '../TimeAdjustments';
import authReducer from '../../../store/slices/authSlice';
import offlineReducer from '../../../store/slices/offlineSlice';
import { apiSlice } from '../../../store/api/apiSlice';

// Ensure proper cleanup after each test
afterEach(cleanup);

// Mock the time adjustment API hooks
const mockUseGetTimeAdjustmentsQuery = jest.fn();
const mockUseCreateTimeAdjustmentMutation = jest.fn();
const mockUseUpdateTimeAdjustmentMutation = jest.fn();
const mockUseApproveTimeAdjustmentMutation = jest.fn();
const mockUseRejectTimeAdjustmentMutation = jest.fn();
const mockUseGetAllEmployeesQuery = jest.fn();

jest.mock('../../../store/api/attendanceApi', () => ({
  useGetTimeAdjustmentsQuery: () => mockUseGetTimeAdjustmentsQuery(),
  useCreateTimeAdjustmentMutation: () => mockUseCreateTimeAdjustmentMutation(),
  useUpdateTimeAdjustmentMutation: () => mockUseUpdateTimeAdjustmentMutation(),
  useApproveTimeAdjustmentMutation: () => mockUseApproveTimeAdjustmentMutation(),
  useRejectTimeAdjustmentMutation: () => mockUseRejectTimeAdjustmentMutation(),
  useGetAllEmployeesQuery: () => mockUseGetAllEmployeesQuery(),
}));

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

const mockTimeAdjustments = [
  {
    id: '1',
    employeeId: '1',
    employeeName: 'Alice Johnson',
    employeeNumber: 'EMP001',
    attendanceRecordId: 'att-1',
    date: '2023-12-01',
    originalClockIn: '2023-12-01T08:00:00Z',
    originalClockOut: '2023-12-01T17:00:00Z',
    adjustedClockIn: '2023-12-01T08:00:00Z',
    adjustedClockOut: '2023-12-01T18:00:00Z',
    originalHours: 8,
    adjustedHours: 9,
    reason: 'Overtime Work',
    justification: 'Employee worked late to complete urgent project deliverables',
    status: 'pending' as const,
    requestedBy: 'Alice Johnson',
    requestedAt: '2023-12-01T18:30:00Z',
    auditTrail: [
      {
        id: 'audit-1',
        action: 'created' as const,
        performedBy: 'Alice Johnson',
        performedAt: '2023-12-01T18:30:00Z',
        details: 'Time adjustment request created',
      },
    ],
  },
  {
    id: '2',
    employeeId: '2',
    employeeName: 'Bob Smith',
    employeeNumber: 'EMP002',
    attendanceRecordId: 'att-2',
    date: '2023-11-30',
    originalClockIn: '2023-11-30T08:00:00Z',
    originalClockOut: '2023-11-30T17:00:00Z',
    adjustedClockIn: '2023-11-30T07:30:00Z',
    adjustedClockOut: '2023-11-30T17:00:00Z',
    originalHours: 8,
    adjustedHours: 8.5,
    reason: 'Early Start',
    justification: 'Started work early to prepare for morning meeting',
    status: 'approved' as const,
    requestedBy: 'Bob Smith',
    requestedAt: '2023-11-30T17:30:00Z',
    reviewedBy: 'Manager',
    reviewedAt: '2023-12-01T09:00:00Z',
    approvalNote: 'Approved - valid business reason',
    auditTrail: [
      {
        id: 'audit-2',
        action: 'created' as const,
        performedBy: 'Bob Smith',
        performedAt: '2023-11-30T17:30:00Z',
        details: 'Time adjustment request created',
      },
      {
        id: 'audit-3',
        action: 'approved' as const,
        performedBy: 'Manager',
        performedAt: '2023-12-01T09:00:00Z',
        details: 'Time adjustment approved',
      },
    ],
  },
];

const mockUser = {
  id: '1',
  employeeId: 'MGR001',
  name: 'John Manager',
  role: 'manager' as const,
};

const createTestStore = () => configureStore({
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
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }).concat(apiSlice.middleware),
});

const renderWithProviders = (component: React.ReactElement) => {
  const store = createTestStore();
  
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      {children}
    </Provider>
  );

  return {
    ...render(component, { wrapper: Wrapper }),
    store,
  };
};

describe('TimeAdjustments Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockUseGetAllEmployeesQuery.mockReturnValue({
      data: mockEmployees,
      error: undefined,
      isLoading: false,
    });
    
    mockUseGetTimeAdjustmentsQuery.mockReturnValue({
      data: mockTimeAdjustments,
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });
    
    mockUseCreateTimeAdjustmentMutation.mockReturnValue([
      jest.fn(),
      { isLoading: false }
    ]);
    
    mockUseUpdateTimeAdjustmentMutation.mockReturnValue([
      jest.fn(),
      { isLoading: false }
    ]);
    
    mockUseApproveTimeAdjustmentMutation.mockReturnValue([
      jest.fn(),
      { isLoading: false }
    ]);
    
    mockUseRejectTimeAdjustmentMutation.mockReturnValue([
      jest.fn(),
      { isLoading: false }
    ]);
  });

  test('renders loading state', () => {
    mockUseGetTimeAdjustmentsQuery.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      refetch: jest.fn(),
    });

    renderWithProviders(<TimeAdjustments />);
    expect(screen.getByText('Loading time adjustments...')).toBeInTheDocument();
  });

  test('renders error state with retry functionality', () => {
    const mockRefetch = jest.fn();
    mockUseGetTimeAdjustmentsQuery.mockReturnValue({
      data: undefined,
      error: { status: 500, message: 'Server error' },
      isLoading: false,
      refetch: mockRefetch,
    });

    renderWithProviders(<TimeAdjustments />);
    
    expect(screen.getByText('Error Loading Time Adjustments')).toBeInTheDocument();
    expect(screen.getByText('Unable to load time adjustment data. Please try again.')).toBeInTheDocument();
    
    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalled();
  });

  test('renders time adjustments interface with all required elements', () => {
    renderWithProviders(<TimeAdjustments />);
    
    // Check header
    expect(screen.getByText('Time Adjustments')).toBeInTheDocument();
    expect(screen.getByText('Review and approve manual time entry corrections')).toBeInTheDocument();
    
    // Check filter controls
    expect(screen.getByLabelText('Start Date:')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date:')).toBeInTheDocument();
    expect(screen.getByLabelText('Employee:')).toBeInTheDocument();
    expect(screen.getByLabelText('Status:')).toBeInTheDocument();
    
    // Check create button
    expect(screen.getByText('Create Manual Adjustment')).toBeInTheDocument();
  });

  test('displays time adjustments table with correct data', () => {
    renderWithProviders(<TimeAdjustments />);
    
    // Check table headers
    expect(screen.getByText('Employee')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Original Times')).toBeInTheDocument();
    expect(screen.getByText('Adjusted Times')).toBeInTheDocument();
    expect(screen.getByText('Hours Change')).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Requested')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    
    // Check employee data
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('#EMP001')).toBeInTheDocument();
    expect(screen.getByText('#EMP002')).toBeInTheDocument();
    
    // Check status badges
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });

  test('handles filter changes', async () => {
    renderWithProviders(<TimeAdjustments />);
    
    // Test date filters
    const startDateInput = screen.getByLabelText('Start Date:') as HTMLInputElement;
    const endDateInput = screen.getByLabelText('End Date:') as HTMLInputElement;
    
    fireEvent.change(startDateInput, { target: { value: '2023-12-01' } });
    fireEvent.change(endDateInput, { target: { value: '2023-12-31' } });
    
    expect(startDateInput.value).toBe('2023-12-01');
    expect(endDateInput.value).toBe('2023-12-31');
    
    // Test employee filter
    const employeeFilter = screen.getByLabelText('Employee:') as HTMLSelectElement;
    fireEvent.change(employeeFilter, { target: { value: '1' } });
    expect(employeeFilter.value).toBe('1');
    
    // Test status filter
    const statusFilter = screen.getByLabelText('Status:') as HTMLSelectElement;
    fireEvent.change(statusFilter, { target: { value: 'pending' } });
    expect(statusFilter.value).toBe('pending');
  });

  test('displays time formatting correctly', () => {
    renderWithProviders(<TimeAdjustments />);
    
    // Check time formatting (times should be displayed in local format)
    expect(screen.getAllByText('01:30 PM')).toHaveLength(3); // Original clock in (appears multiple times)
    expect(screen.getByText('11:30 PM')).toBeInTheDocument(); // Adjusted clock out
    
    // Check hours formatting
    expect(screen.getAllByText('8.00h')).toHaveLength(2); // Original hours (appears twice)
    expect(screen.getByText('9.00h')).toBeInTheDocument(); // Adjusted hours
    expect(screen.getByText('+1.00h')).toBeInTheDocument(); // Hours change
  });

  test('shows approval modal for pending adjustments', async () => {
    renderWithProviders(<TimeAdjustments />);
    
    const approveButton = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approveButton);
    
    await waitFor(() => {
      expect(screen.getByText('Approval Note (Optional)')).toBeInTheDocument();
      expect(screen.getByText('Alice Johnson - Dec 1, 2023')).toBeInTheDocument();
      expect(screen.getAllByText('Employee worked late to complete urgent project deliverables')).toHaveLength(2); // Appears in table and modal
    });
  });

  test('shows rejection modal for pending adjustments', async () => {
    renderWithProviders(<TimeAdjustments />);
    
    const rejectButton = screen.getByRole('button', { name: 'Reject' });
    fireEvent.click(rejectButton);
    
    await waitFor(() => {
      expect(screen.getByLabelText('Rejection Reason *')).toBeInTheDocument();
    });
  });

  test('handles approval process', async () => {
    const mockApproveFn = jest.fn().mockReturnValue({
      unwrap: () => Promise.resolve({}),
    });
    
    mockUseApproveTimeAdjustmentMutation.mockReturnValue([
      mockApproveFn,
      { isLoading: false }
    ]);

    renderWithProviders(<TimeAdjustments />);
    
    // Open approval modal
    const approveButton = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approveButton);
    
    await waitFor(() => {
      expect(screen.getByText('Approval Note (Optional)')).toBeInTheDocument();
    });
    
    // Add approval note
    const approvalNote = screen.getByLabelText('Approval Note (Optional)');
    fireEvent.change(approvalNote, { target: { value: 'Approved for valid overtime' } });
    
    // Confirm approval - get the confirm button in the modal
    const confirmButton = screen.getAllByText('Approve')[1]; // Second "Approve" is the confirm button
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(mockApproveFn).toHaveBeenCalledWith({
        id: '1',
        approvalNote: 'Approved for valid overtime',
      });
    });
  });

  test('handles rejection process', async () => {
    const mockRejectFn = jest.fn().mockReturnValue({
      unwrap: () => Promise.resolve({}),
    });
    
    mockUseRejectTimeAdjustmentMutation.mockReturnValue([
      mockRejectFn,
      { isLoading: false }
    ]);

    renderWithProviders(<TimeAdjustments />);
    
    // Open rejection modal
    const rejectButton = screen.getByText('Reject');
    fireEvent.click(rejectButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Reject.*Time Adjustment/)).toBeInTheDocument();
    });
    
    // Add rejection reason
    const rejectionReason = screen.getByLabelText('Rejection Reason *');
    fireEvent.change(rejectionReason, { target: { value: 'Insufficient justification provided' } });
    
    // Confirm rejection - get the confirm button in the modal
    const confirmButton = screen.getAllByText('Reject')[1]; // Second "Reject" is the confirm button
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(mockRejectFn).toHaveBeenCalledWith({
        id: '1',
        rejectionReason: 'Insufficient justification provided',
      });
    });
  });

  test('prevents rejection without reason', async () => {
    renderWithProviders(<TimeAdjustments />);
    
    // Open rejection modal
    const rejectButton = screen.getByText('Reject');
    fireEvent.click(rejectButton);
    
    await waitFor(() => {
      expect(screen.getByText('Reject Time Adjustment')).toBeInTheDocument();
    });
    
    // Try to confirm without reason - get the confirm button in the modal
    const confirmButton = screen.getAllByText('Reject')[1]; // Second "Reject" is the confirm button
    expect(confirmButton).toBeDisabled();
  });

  test('shows audit trail modal', async () => {
    renderWithProviders(<TimeAdjustments />);
    
    const auditButton = screen.getAllByText('Audit Trail')[0];
    fireEvent.click(auditButton);
    
    await waitFor(() => {
      expect(screen.getByText('Audit Trail - Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('CREATED')).toBeInTheDocument();
      expect(screen.getByText('Time adjustment request created')).toBeInTheDocument();
    });
  });

  test('closes modals when cancel is clicked', async () => {
    renderWithProviders(<TimeAdjustments />);
    
    // Open approval modal
    const approveButton = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approveButton);
    
    await waitFor(() => {
      expect(screen.getByText('Approval Note (Optional)')).toBeInTheDocument();
    });
    
    // Close modal
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    
    await waitFor(() => {
      expect(screen.queryByText('Approval Note (Optional)')).not.toBeInTheDocument();
    });
  });

  test('closes modals when X button is clicked', async () => {
    renderWithProviders(<TimeAdjustments />);
    
    // Open audit modal
    const auditButton = screen.getAllByText('Audit Trail')[0];
    fireEvent.click(auditButton);
    
    await waitFor(() => {
      expect(screen.getByText('Audit Trail - Alice Johnson')).toBeInTheDocument();
    });
    
    // Close modal
    const closeButton = screen.getByText('×');
    fireEvent.click(closeButton);
    
    await waitFor(() => {
      expect(screen.queryByText('Audit Trail - Alice Johnson')).not.toBeInTheDocument();
    });
  });

  test('shows no adjustments message when list is empty', () => {
    mockUseGetTimeAdjustmentsQuery.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });

    renderWithProviders(<TimeAdjustments />);
    
    expect(screen.getByText('No time adjustments found for the selected criteria.')).toBeInTheDocument();
  });

  test('displays loading states for actions', () => {
    mockUseApproveTimeAdjustmentMutation.mockReturnValue([
      jest.fn(),
      { isLoading: true }
    ]);

    renderWithProviders(<TimeAdjustments />);
    
    const approveButton = screen.getByText('Approve');
    expect(approveButton).toBeDisabled();
  });

  test('handles hours change display correctly', () => {
    renderWithProviders(<TimeAdjustments />);
    
    // Check positive hours change
    expect(screen.getByText('+1.00h')).toBeInTheDocument();
    
    // Check that it has the positive class (would be green)
    const positiveChange = screen.getByText('+1.00h');
    expect(positiveChange).toHaveClass('hours-change', 'positive');
  });

  test('has proper accessibility attributes', () => {
    renderWithProviders(<TimeAdjustments />);
    
    // Check heading structure
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Time Adjustments');
    
    // Check form labels
    expect(screen.getByLabelText('Start Date:')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date:')).toBeInTheDocument();
    expect(screen.getByLabelText('Employee:')).toBeInTheDocument();
    expect(screen.getByLabelText('Status:')).toBeInTheDocument();
    
    // Check table structure
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    
    // Check buttons
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  test('sorts adjustments by request date (newest first)', () => {
    renderWithProviders(<TimeAdjustments />);
    
    const rows = screen.getAllByRole('row');
    // First row is header, second should be Alice (newer), third should be Bob (older)
    expect(rows[1]).toHaveTextContent('Alice Johnson');
    expect(rows[2]).toHaveTextContent('Bob Smith');
  });

  test('handles create adjustment button click', () => {
    renderWithProviders(<TimeAdjustments />);
    
    const createButton = screen.getByText('Create Manual Adjustment');
    expect(createButton).toBeInTheDocument();
    
    // Note: The actual modal implementation would be tested here
    // For now, we just verify the button exists and is clickable
    fireEvent.click(createButton);
  });
});