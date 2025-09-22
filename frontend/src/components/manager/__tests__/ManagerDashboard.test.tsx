import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ManagerDashboard from '../ManagerDashboard';
import authReducer from '../../../store/slices/authSlice';
import offlineReducer from '../../../store/slices/offlineSlice';
import { apiSlice } from '../../../store/api/apiSlice';

// Mock the entire attendanceApi module
jest.mock('../../../store/api/attendanceApi', () => {
  const originalModule = jest.requireActual('../../../store/api/attendanceApi');
  return {
    ...originalModule,
    useGetDashboardDataQuery: jest.fn(),
  };
});

// Import the mocked hook
import { useGetDashboardDataQuery } from '../../../store/api/attendanceApi';
const mockUseGetDashboardDataQuery = useGetDashboardDataQuery as jest.MockedFunction<typeof useGetDashboardDataQuery>;

// Mock data
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

const createTestStore = (initialState = {}) => configureStore({
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
    ...initialState,
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

describe('ManagerDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should display loading spinner when data is loading', () => {
      mockUseGetDashboardDataQuery.mockReturnValue({
        data: undefined,
        error: undefined,
        isLoading: true,
        refetch: jest.fn(),
      });

      renderWithProviders(<ManagerDashboard />);
      expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should display error message when API call fails', () => {
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
  });

  describe('Dashboard Content', () => {
    beforeEach(() => {
      mockUseGetDashboardDataQuery.mockReturnValue({
        data: mockDashboardData,
        error: undefined,
        isLoading: false,
        refetch: jest.fn(),
      });
    });

    it('should display welcome message with user name', () => {
      renderWithProviders(<ManagerDashboard />);
      expect(screen.getByText('Welcome, John Manager!')).toBeInTheDocument();
    });

    it('should display dashboard statistics', () => {
      renderWithProviders(<ManagerDashboard />);
      expect(screen.getByText('1')).toBeInTheDocument(); // Active Now
      expect(screen.getByText('Active Now')).toBeInTheDocument();
      expect(screen.getByText('Total Employees')).toBeInTheDocument();
      expect(screen.getByText('Filtered Results')).toBeInTheDocument();
      
      // Check that we have the correct number of stat cards
      const statNumbers = screen.getAllByText('2');
      expect(statNumbers).toHaveLength(2); // Total Employees and Filtered Results
    });

    it('should display employee cards with correct information', () => {
      renderWithProviders(<ManagerDashboard />);
      
      // Check for employee names
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      
      // Check for employee numbers
      expect(screen.getByText('#EMP001')).toBeInTheDocument();
      expect(screen.getByText('#EMP002')).toBeInTheDocument();
      
      // Check for status indicators
      expect(screen.getAllByText('ACTIVE')).toHaveLength(1);
      expect(screen.getAllByText('INACTIVE')).toHaveLength(1);
    });

    it('should display shift details for active employees', () => {
      renderWithProviders(<ManagerDashboard />);
      
      // Check for clock in time and elapsed time
      expect(screen.getByText('Clock In:')).toBeInTheDocument();
      expect(screen.getByText('Elapsed:')).toBeInTheDocument();
      expect(screen.getByText('1h 0m')).toBeInTheDocument();
    });

    it('should display last activity for inactive employees', () => {
      renderWithProviders(<ManagerDashboard />);
      expect(screen.getByText('Last Activity:')).toBeInTheDocument();
    });
  });

  describe('Search and Filter Functionality', () => {
    beforeEach(() => {
      mockUseGetDashboardDataQuery.mockReturnValue({
        data: mockDashboardData,
        error: undefined,
        isLoading: false,
        refetch: jest.fn(),
      });
    });

    it('should filter employees by search term', async () => {
      renderWithProviders(<ManagerDashboard />);
      
      const searchInput = screen.getByPlaceholderText('Search by name or employee number...');
      fireEvent.change(searchInput, { target: { value: 'Alice' } });
      
      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
        expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
      });
    });

    it('should filter employees by employee number', async () => {
      renderWithProviders(<ManagerDashboard />);
      
      const searchInput = screen.getByPlaceholderText('Search by name or employee number...');
      fireEvent.change(searchInput, { target: { value: 'EMP002' } });
      
      await waitFor(() => {
        expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
        expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      });
    });

    it('should filter employees by status', async () => {
      renderWithProviders(<ManagerDashboard />);
      
      const statusFilter = screen.getByDisplayValue('All Employees');
      fireEvent.change(statusFilter, { target: { value: 'active' } });
      
      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
        expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
      });
    });

    it('should show no results message when no employees match criteria', async () => {
      renderWithProviders(<ManagerDashboard />);
      
      const searchInput = screen.getByPlaceholderText('Search by name or employee number...');
      fireEvent.change(searchInput, { target: { value: 'NonExistent' } });
      
      await waitFor(() => {
        expect(screen.getByText('No employees found matching your criteria.')).toBeInTheDocument();
      });
    });

    it('should update filtered results count', async () => {
      renderWithProviders(<ManagerDashboard />);
      
      // Initially shows 2 filtered results
      expect(screen.getByText('Filtered Results')).toBeInTheDocument();
      
      const searchInput = screen.getByPlaceholderText('Search by name or employee number...');
      fireEvent.change(searchInput, { target: { value: 'Alice' } });
      
      await waitFor(() => {
        // Check that filtered results count updated to 1
        const filteredResultsCard = screen.getByText('Filtered Results').closest('.stat-card');
        expect(filteredResultsCard?.querySelector('.stat-number')?.textContent).toBe('1');
      });
    });
  });

  describe('Real-time Updates', () => {
    it('should call refetch when refresh button is clicked', () => {
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

    it('should display last updated timestamp', () => {
      mockUseGetDashboardDataQuery.mockReturnValue({
        data: mockDashboardData,
        error: undefined,
        isLoading: false,
        refetch: jest.fn(),
      });

      renderWithProviders(<ManagerDashboard />);
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });
  });

  describe('Time Formatting', () => {
    beforeEach(() => {
      mockUseGetDashboardDataQuery.mockReturnValue({
        data: {
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
        },
        error: undefined,
        isLoading: false,
        refetch: jest.fn(),
      });
    });

    it('should format elapsed time correctly', () => {
      renderWithProviders(<ManagerDashboard />);
      expect(screen.getByText('2h 11m')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      mockUseGetDashboardDataQuery.mockReturnValue({
        data: mockDashboardData,
        error: undefined,
        isLoading: false,
        refetch: jest.fn(),
      });
    });

    it('should have proper heading structure', () => {
      renderWithProviders(<ManagerDashboard />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Manager Dashboard');
    });

    it('should have accessible form controls', () => {
      renderWithProviders(<ManagerDashboard />);
      
      const searchInput = screen.getByPlaceholderText('Search by name or employee number...');
      expect(searchInput).toHaveAttribute('type', 'text');
      
      const statusFilter = screen.getByDisplayValue('All Employees');
      expect(statusFilter.tagName.toLowerCase()).toBe('select');
    });

    it('should have accessible buttons', () => {
      renderWithProviders(<ManagerDashboard />);
      
      const refreshButton = screen.getByText('Refresh');
      expect(refreshButton.tagName.toLowerCase()).toBe('button');
    });
  });
});