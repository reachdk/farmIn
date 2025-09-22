import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ManagerDashboard from '../ManagerDashboard';
import authReducer from '../../../store/slices/authSlice';
import offlineReducer from '../../../store/slices/offlineSlice';
import { apiSlice } from '../../../store/api/apiSlice';

// Mock the attendance API hook
const mockUseGetDashboardDataQuery = jest.fn();
jest.mock('../../../store/api/attendanceApi', () => ({
  useGetDashboardDataQuery: () => mockUseGetDashboardDataQuery(),
}));

const mockUser = {
  id: '1',
  employeeId: 'MGR001',
  name: 'John Manager',
  role: 'manager' as const,
};

const mockDashboardData = {
  employees: [
    {
      employee: {
        id: '1',
        employeeNumber: 'EMP001',
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'alice@farm.com',
        role: 'employee' as const,
        isActive: true,
      },
      shiftStatus: {
        isActive: true,
        currentRecord: {
          id: '1',
          employeeId: '1',
          clockInTime: '2023-12-01T08:00:00Z',
          totalHours: 1,
          timeCategory: 'Regular',
          notes: '',
          createdAt: '2023-12-01T08:00:00Z',
          updatedAt: '2023-12-01T08:00:00Z',
          syncStatus: 'synced' as const,
        },
        elapsedTime: 3600, // 1 hour
      },
      lastActivity: '2023-12-01T08:00:00Z',
    },
    {
      employee: {
        id: '2',
        employeeNumber: 'EMP002',
        firstName: 'Bob',
        lastName: 'Smith',
        email: 'bob@farm.com',
        role: 'employee' as const,
        isActive: true,
      },
      shiftStatus: {
        isActive: false,
      },
      lastActivity: '2023-11-30T17:00:00Z',
    },
  ],
  totalActive: 1,
  totalEmployees: 2,
  lastUpdated: '2023-12-01T09:00:00Z',
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
  return render(
    <Provider store={store}>
      {component}
    </Provider>
  );
};

describe('ManagerDashboard Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders loading state', () => {
    mockUseGetDashboardDataQuery.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      refetch: jest.fn(),
    });

    renderWithProviders(<ManagerDashboard />);
    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
  });

  test('renders error state with retry functionality', () => {
    const mockRefetch = jest.fn();
    mockUseGetDashboardDataQuery.mockReturnValue({
      data: undefined,
      error: { status: 500, message: 'Server error' },
      isLoading: false,
      refetch: mockRefetch,
    });

    renderWithProviders(<ManagerDashboard />);
    
    expect(screen.getByText('Error Loading Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Unable to load employee data. Please check your connection.')).toBeInTheDocument();
    
    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalled();
  });

  test('renders dashboard with employee data', () => {
    mockUseGetDashboardDataQuery.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });

    renderWithProviders(<ManagerDashboard />);
    
    // Check welcome message
    expect(screen.getByText('Welcome, John Manager!')).toBeInTheDocument();
    
    // Check statistics
    expect(screen.getByText('1')).toBeInTheDocument(); // Active Now
    expect(screen.getAllByText('2')).toHaveLength(2); // Total Employees and Filtered Results
    expect(screen.getByText('Active Now')).toBeInTheDocument();
    expect(screen.getByText('Total Employees')).toBeInTheDocument();
    
    // Check employee cards
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('#EMP001')).toBeInTheDocument();
    expect(screen.getByText('#EMP002')).toBeInTheDocument();
  });

  test('filters employees by search term', async () => {
    mockUseGetDashboardDataQuery.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });

    renderWithProviders(<ManagerDashboard />);
    
    const searchInput = screen.getByPlaceholderText('Search by name or employee number...');
    fireEvent.change(searchInput, { target: { value: 'Alice' } });
    
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
    });
  });

  test('filters employees by status', async () => {
    mockUseGetDashboardDataQuery.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });

    renderWithProviders(<ManagerDashboard />);
    
    const statusFilter = screen.getByDisplayValue('All Employees');
    fireEvent.change(statusFilter, { target: { value: 'active' } });
    
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
    });
  });

  test('displays shift details for active employees', () => {
    mockUseGetDashboardDataQuery.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });

    renderWithProviders(<ManagerDashboard />);
    
    expect(screen.getByText('Clock In:')).toBeInTheDocument();
    expect(screen.getByText('Elapsed:')).toBeInTheDocument();
    expect(screen.getByText('1h 0m')).toBeInTheDocument();
    expect(screen.getByText('Regular')).toBeInTheDocument(); // Time category
  });

  test('refreshes data when refresh button is clicked', () => {
    const mockRefetch = jest.fn();
    mockUseGetDashboardDataQuery.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      refetch: mockRefetch,
    });

    renderWithProviders(<ManagerDashboard />);
    
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);
    
    expect(mockRefetch).toHaveBeenCalled();
  });

  test('shows no results message when search yields no matches', async () => {
    mockUseGetDashboardDataQuery.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });

    renderWithProviders(<ManagerDashboard />);
    
    const searchInput = screen.getByPlaceholderText('Search by name or employee number...');
    fireEvent.change(searchInput, { target: { value: 'NonExistent' } });
    
    await waitFor(() => {
      expect(screen.getByText('No employees found matching your criteria.')).toBeInTheDocument();
    });
  });

  test('formats elapsed time correctly', () => {
    const dataWithLongerTime = {
      ...mockDashboardData,
      employees: [
        {
          ...mockDashboardData.employees[0],
          shiftStatus: {
            ...mockDashboardData.employees[0].shiftStatus,
            elapsedTime: 7890, // 2h 11m 30s
          },
        },
      ],
    };

    mockUseGetDashboardDataQuery.mockReturnValue({
      data: dataWithLongerTime,
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });

    renderWithProviders(<ManagerDashboard />);
    expect(screen.getByText('2h 11m')).toBeInTheDocument();
  });

  test('displays last updated timestamp', () => {
    mockUseGetDashboardDataQuery.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });

    renderWithProviders(<ManagerDashboard />);
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });

  test('has proper accessibility attributes', () => {
    mockUseGetDashboardDataQuery.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      refetch: jest.fn(),
    });

    renderWithProviders(<ManagerDashboard />);
    
    // Check heading structure
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Manager Dashboard');
    
    // Check form controls
    const searchInput = screen.getByPlaceholderText('Search by name or employee number...');
    expect(searchInput).toHaveAttribute('type', 'text');
    
    const statusFilter = screen.getByDisplayValue('All Employees');
    expect(statusFilter.tagName.toLowerCase()).toBe('select');
    
    const refreshButton = screen.getByText('Refresh');
    expect(refreshButton.tagName.toLowerCase()).toBe('button');
  });
});