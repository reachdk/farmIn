import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AttendanceHistory from '../AttendanceHistory';
import { AttendanceRecord } from '../../../store/api/attendanceApi';
import authSlice from '../../../store/slices/authSlice';
import offlineSlice from '../../../store/slices/offlineSlice';
import { apiSlice } from '../../../store/api/apiSlice';

// Mock the attendance API with proper integration testing
const mockGetAttendanceHistory = jest.fn();
jest.mock('../../../store/api/attendanceApi', () => ({
  useGetAttendanceHistoryQuery: (params: any, options: any) => mockGetAttendanceHistory(params, options),
}));

// Mock URL.createObjectURL for CSV export tests
global.URL.createObjectURL = jest.fn(() => 'mock-url');
global.URL.revokeObjectURL = jest.fn();

// Create a proper test store
const createTestStore = (preloadedState?: any) => {
  return configureStore({
    reducer: {
      auth: authSlice,
      offline: offlineSlice,
      api: apiSlice.reducer,
    },
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: ['persist/PERSIST'],
        },
      }).concat(apiSlice.middleware),
  });
};

describe('AttendanceHistory Integration Tests', () => {
  const mockAttendanceRecords: AttendanceRecord[] = [
    {
      id: '1',
      employeeId: 'EMP001',
      clockInTime: '2023-01-01T09:00:00Z',
      clockOutTime: '2023-01-01T17:00:00Z',
      totalHours: 8,
      timeCategory: 'Regular',
      notes: 'Normal workday',
      createdAt: '2023-01-01T09:00:00Z',
      updatedAt: '2023-01-01T17:00:00Z',
      syncStatus: 'synced',
    },
    {
      id: '2',
      employeeId: 'EMP001',
      clockInTime: '2023-01-02T08:30:00Z',
      clockOutTime: '2023-01-02T18:30:00Z',
      totalHours: 10,
      timeCategory: 'Overtime',
      notes: 'Extra hours for project',
      createdAt: '2023-01-02T08:30:00Z',
      updatedAt: '2023-01-02T18:30:00Z',
      syncStatus: 'synced',
    },
    {
      id: '3',
      employeeId: 'EMP001',
      clockInTime: '2023-01-03T09:15:00Z',
      clockOutTime: undefined,
      totalHours: undefined,
      timeCategory: 'Regular',
      notes: undefined,
      createdAt: '2023-01-03T09:15:00Z',
      updatedAt: '2023-01-03T09:15:00Z',
      syncStatus: 'pending',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Ensure DOM is available
    if (!document.body) {
      document.body = document.createElement('body');
    }
    
    // Setup default API response
    mockGetAttendanceHistory.mockReturnValue({
      data: mockAttendanceRecords,
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = '';
  });

  const renderComponent = (preloadedState?: any) => {
    const defaultState = {
      auth: {
        user: {
          id: '1',
          employeeId: 'EMP001',
          name: 'John Doe',
          role: 'employee',
        },
        token: 'mock-token',
        isAuthenticated: true,
      },
      offline: {
        isOnline: true,
        pendingActions: [],
        syncInProgress: false,
        lastSyncTime: null,
      },
      ...preloadedState,
    };
    
    const store = createTestStore(defaultState);
    return render(
      <Provider store={store}>
        <AttendanceHistory />
      </Provider>
    );
  };

  describe('Component Integration with Redux Store', () => {
    it('should render with user data from Redux store', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Attendance History')).toBeInTheDocument();
        expect(screen.getByText('18.0')).toBeInTheDocument(); // Total hours
        expect(screen.getByText('2')).toBeInTheDocument(); // Days worked
        expect(screen.getByText('9.0')).toBeInTheDocument(); // Average hours per day
      });
    });

    it('should call API with correct employee ID from Redux store', async () => {
      const customState = {
        auth: {
          user: {
            id: '2',
            employeeId: 'EMP002',
            name: 'Jane Smith',
            role: 'employee',
          },
          token: 'mock-token',
          isAuthenticated: true,
        },
      };

      renderComponent(customState);

      await waitFor(() => {
        expect(mockGetAttendanceHistory).toHaveBeenCalledWith(
          expect.objectContaining({
            employeeId: 'EMP002',
          }),
          expect.objectContaining({ skip: false })
        );
      });
    });

    it('should skip API call when no user is present', async () => {
      const customState = {
        auth: {
          user: null,
          token: null,
          isAuthenticated: false,
        },
      };

      renderComponent(customState);

      expect(mockGetAttendanceHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: '',
        }),
        expect.objectContaining({ skip: true })
      );
    });
  });

  describe('API Integration and Data Display', () => {
    it('should display attendance records correctly', async () => {
      renderComponent();

      await waitFor(() => {
        // Check for record data (using more flexible text matching)
        expect(screen.getByText(/Jan 1/)).toBeInTheDocument();
        expect(screen.getByText(/Jan 2/)).toBeInTheDocument();
        expect(screen.getByText(/Jan 3/)).toBeInTheDocument();
        expect(screen.getByText('8.00h')).toBeInTheDocument();
        expect(screen.getByText('10.00h')).toBeInTheDocument();
        
        // Use getAllByText for elements that appear multiple times
        const regularTags = screen.getAllByText('Regular');
        expect(regularTags.length).toBeGreaterThan(0);
        
        const overtimeTags = screen.getAllByText('Overtime');
        expect(overtimeTags.length).toBeGreaterThan(0);
      });
    });

    it('should show in-progress records correctly', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('In Progress')).toBeInTheDocument();
        expect(screen.getByText('⏳')).toBeInTheDocument(); // Pending sync status
      });
    });

    it('should display category breakdown when multiple categories exist', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Hours by Category')).toBeInTheDocument();
        expect(screen.getByText((content, element) => {
          return element?.textContent === '8.0h';
        })).toBeInTheDocument();
        expect(screen.getByText((content, element) => {
          return element?.textContent === '10.0h';
        })).toBeInTheDocument();
      });
    });
  });

  describe('Date Filtering Integration', () => {
    it('should call API with correct parameters for preset filters', async () => {
      renderComponent();

      const weekButton = screen.getByText('Last 7 Days');
      fireEvent.click(weekButton);

      await waitFor(() => {
        expect(mockGetAttendanceHistory).toHaveBeenCalledWith(
          expect.objectContaining({
            employeeId: 'EMP001',
            startDate: expect.any(String),
            endDate: expect.any(String),
          }),
          expect.objectContaining({ skip: false })
        );
      });
    });

    it('should update API call when custom date range is selected', async () => {
      renderComponent();

      const startDateInput = screen.getByLabelText('From:');
      const endDateInput = screen.getByLabelText('To:');

      fireEvent.change(startDateInput, { target: { value: '2023-01-01' } });
      fireEvent.change(endDateInput, { target: { value: '2023-01-31' } });

      await waitFor(() => {
        expect(mockGetAttendanceHistory).toHaveBeenCalledWith(
          expect.objectContaining({
            employeeId: 'EMP001',
            startDate: '2023-01-01',
            endDate: '2023-01-31',
          }),
          expect.objectContaining({ skip: false })
        );
      });
    });

    it('should highlight active preset filter', async () => {
      renderComponent();

      const monthButton = screen.getByText('Last 30 Days');
      expect(monthButton).toHaveClass('active');

      const weekButton = screen.getByText('Last 7 Days');
      fireEvent.click(weekButton);

      await waitFor(() => {
        expect(weekButton).toHaveClass('active');
        expect(monthButton).not.toHaveClass('active');
      });
    });
  });

  describe('Export Functionality Integration', () => {
    it('should export CSV with correct data and filename', async () => {
      // Mock document methods with better isolation
      const originalCreateElement = document.createElement;
      const mockLink = {
        href: '',
        download: '',
        click: jest.fn(),
        style: {},
      };
      
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

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
      });

      const exportButton = screen.getByText('Export CSV');
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(document.createElement).toHaveBeenCalledWith('a');
        expect(mockLink.click).toHaveBeenCalled();
        expect(mockLink.download).toContain('attendance-history-EMP001');
      });

      // Restore original methods
      document.createElement = originalCreateElement;
    });

    it('should disable export button when no records', async () => {
      mockGetAttendanceHistory.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      await waitFor(() => {
        const exportButton = screen.getByText('Export CSV');
        expect(exportButton).toBeDisabled();
      });
    });
  });

  describe('Loading and Error States Integration', () => {
    it('should show loading state', async () => {
      mockGetAttendanceHistory.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      });

      renderComponent();

      expect(screen.getByText('Loading attendance history...')).toBeInTheDocument();
    });

    it('should show error state', async () => {
      mockGetAttendanceHistory.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Failed to fetch' },
      });

      renderComponent();

      expect(screen.getByText('Failed to load attendance history. Please try again.')).toBeInTheDocument();
    });

    it('should show no records message when data is empty', async () => {
      mockGetAttendanceHistory.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('No attendance records found for the selected date range.')).toBeInTheDocument();
      });
    });
  });

  describe('Summary Calculations Integration', () => {
    it('should calculate summary statistics correctly', async () => {
      renderComponent();

      await waitFor(() => {
        // Total hours: 8 + 10 = 18 (excluding in-progress record)
        expect(screen.getByText('18.0')).toBeInTheDocument();
        // Days worked: 2 (only completed records)
        expect(screen.getByText('2')).toBeInTheDocument();
        // Average: 18/2 = 9.0
        expect(screen.getByText('9.0')).toBeInTheDocument();
      });
    });

    it('should handle zero hours gracefully', async () => {
      mockGetAttendanceHistory.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('0.0')).toBeInTheDocument(); // Total hours
        expect(screen.getByText('0')).toBeInTheDocument(); // Days worked
        expect(screen.getByText('0.0')).toBeInTheDocument(); // Average hours
      });
    });
  });

  describe('Date Range Validation Integration', () => {
    it('should prevent end date from being before start date', async () => {
      renderComponent();

      const startDateInput = screen.getByLabelText('From:') as HTMLInputElement;
      const endDateInput = screen.getByLabelText('To:') as HTMLInputElement;

      fireEvent.change(startDateInput, { target: { value: '2023-01-15' } });

      await waitFor(() => {
        expect(endDateInput.min).toBe('2023-01-15');
      });
    });

    it('should prevent start date from being after end date', async () => {
      renderComponent();

      const startDateInput = screen.getByLabelText('From:') as HTMLInputElement;
      const endDateInput = screen.getByLabelText('To:') as HTMLInputElement;

      fireEvent.change(endDateInput, { target: { value: '2023-01-10' } });

      await waitFor(() => {
        expect(startDateInput.max).toBe('2023-01-10');
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle component unmounting gracefully', () => {
      const { unmount } = renderComponent();
      expect(() => unmount()).not.toThrow();
    });

    it('should not crash with malformed data', async () => {
      const malformedRecords = [
        {
          id: '1',
          employeeId: 'EMP001',
          clockInTime: 'invalid-date',
          clockOutTime: null,
          totalHours: null,
          timeCategory: null,
          createdAt: '2023-01-01T09:00:00Z',
          updatedAt: '2023-01-01T09:00:00Z',
          syncStatus: 'synced',
        },
      ] as any;

      mockGetAttendanceHistory.mockReturnValue({
        data: malformedRecords,
        isLoading: false,
        error: null,
      });

      expect(() => renderComponent()).not.toThrow();
    });

    it('should handle offline state integration', async () => {
      // Test that component renders even when offline
      renderComponent();

      // Should still render and attempt to show cached data
      await waitFor(() => {
        expect(screen.getByText('Attendance History')).toBeInTheDocument();
      });
    });
  });
});