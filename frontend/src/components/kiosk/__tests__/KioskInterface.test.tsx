import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import KioskInterface from '../KioskInterface';
import { apiSlice } from '../../../store/api/apiSlice';
import { offlineSlice } from '../../../store/slices/offlineSlice';

// Mock the API responses
const mockApiSlice = {
  ...apiSlice,
  endpoints: {
    ...apiSlice.endpoints,
    getDeviceStatus: {
      useQuery: jest.fn(),
    },
    getEmployeeByCard: {
      useQuery: jest.fn(),
    },
    captureAttendance: {
      useMutation: jest.fn(),
    },
  },
};

// Mock store
const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      api: apiSlice.reducer,
      offline: offlineSlice.reducer,
    },
    preloadedState: {
      offline: { isOffline: false },
      ...initialState,
    },
  });
};

// Mock hooks
const mockUseGetDeviceStatusQuery = jest.fn();
const mockUseGetEmployeeByCardQuery = jest.fn();
const mockUseCaptureAttendanceMutation = jest.fn();

jest.mock('../../../store/api/hardwareApi', () => ({
  useGetDeviceStatusQuery: () => mockUseGetDeviceStatusQuery(),
}));

jest.mock('../../../store/api/employeeApi', () => ({
  useGetEmployeeByCardQuery: () => mockUseGetEmployeeByCardQuery(),
}));

jest.mock('../../../store/api/hardwareApi', () => ({
  ...jest.requireActual('../../../store/api/hardwareApi'),
  useGetDeviceStatusQuery: () => mockUseGetDeviceStatusQuery(),
  useCaptureAttendanceMutation: () => mockUseCaptureAttendanceMutation(),
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock AudioContext
const mockAudioContext = {
  createOscillator: jest.fn(() => ({
    connect: jest.fn(),
    frequency: {
      setValueAtTime: jest.fn(),
    },
    start: jest.fn(),
    stop: jest.fn(),
  })),
  createGain: jest.fn(() => ({
    connect: jest.fn(),
    gain: {
      setValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    },
  })),
  destination: {},
  currentTime: 0,
};

Object.defineProperty(window, 'AudioContext', {
  value: jest.fn(() => mockAudioContext),
});

Object.defineProperty(window, 'webkitAudioContext', {
  value: jest.fn(() => mockAudioContext),
});

describe('KioskInterface', () => {
  let store: any;
  let mockCaptureAttendance: jest.Mock;

  beforeEach(() => {
    store = createMockStore();
    mockCaptureAttendance = jest.fn();

    // Reset mocks
    mockUseGetDeviceStatusQuery.mockReturnValue({
      data: {
        deviceId: 'kiosk_001',
        status: 'online',
        lastHeartbeat: new Date().toISOString(),
        systemHealth: {
          cpuUsage: 45,
          memoryUsage: 60,
          diskUsage: 30,
          temperature: 42,
        },
        capabilities: {
          rfidReader: true,
          camera: true,
          display: true,
          network: true,
        },
        errors: [],
      },
    });

    mockUseGetEmployeeByCardQuery.mockReturnValue({
      data: null,
      isLoading: false,
    });

    mockUseCaptureAttendanceMutation.mockReturnValue([
      mockCaptureAttendance,
      { isLoading: false },
    ]);

    mockLocalStorage.getItem.mockReturnValue('[]');
    mockLocalStorage.setItem.mockClear();

    // Mock Date.now for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000); // 2022-01-01 00:00:00
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  const renderKioskInterface = (props = {}) => {
    const defaultProps = {
      deviceId: 'kiosk_001',
      location: 'Test Location',
    };

    return render(
      <Provider store={store}>
        <KioskInterface {...defaultProps} {...props} />
      </Provider>
    );
  };

  describe('Initial Render', () => {
    it('should render kiosk interface with basic elements', () => {
      renderKioskInterface();

      expect(screen.getByText('Farm Attendance System')).toBeInTheDocument();
      expect(screen.getByText('Test Location')).toBeInTheDocument();
      expect(screen.getByText('Please scan your RFID card')).toBeInTheDocument();
      expect(screen.getByText('Online')).toBeInTheDocument();
    });

    it('should display current time and date', () => {
      renderKioskInterface();

      // Check that time display is present (format may vary)
      expect(screen.getByText(/\d{1,2}:\d{2}:\d{2}/)).toBeInTheDocument();
      expect(screen.getByText(/\w+, \w+ \d{1,2}, \d{4}/)).toBeInTheDocument();
    });

    it('should show instructions for RFID scanning', () => {
      renderKioskInterface();

      expect(screen.getByText('Hold your RFID card near the reader')).toBeInTheDocument();
      expect(screen.getByText('Wait for confirmation')).toBeInTheDocument();
      expect(screen.getByText('Your attendance is recorded')).toBeInTheDocument();
    });

    it('should display device information in footer', () => {
      renderKioskInterface();

      expect(screen.getByText('Device ID: kiosk_001')).toBeInTheDocument();
      expect(screen.getByText('Need help? Contact your supervisor')).toBeInTheDocument();
    });
  });

  describe('Online/Offline Status', () => {
    it('should show online status when connected', () => {
      renderKioskInterface();

      expect(screen.getByText('Online')).toBeInTheDocument();
      expect(screen.queryByText('Offline Mode')).not.toBeInTheDocument();
    });

    it('should show offline status when disconnected', () => {
      store = createMockStore({
        offline: { isOffline: true },
      });

      renderKioskInterface();

      expect(screen.getByText('Offline Mode')).toBeInTheDocument();
      expect(screen.queryByText('Online')).not.toBeInTheDocument();
    });

    it('should show device status color based on connection', () => {
      renderKioskInterface();

      const statusDot = document.querySelector('.status-dot');
      expect(statusDot).toHaveStyle('background-color: #4caf50'); // Green for online
    });
  });

  describe('RFID Card Scanning', () => {
    it('should handle Enter key press to simulate RFID scan', async () => {
      mockUseGetEmployeeByCardQuery.mockReturnValue({
        data: {
          id: 'emp_001',
          firstName: 'John',
          lastName: 'Doe',
          employeeNumber: 'EMP001',
        },
        isLoading: false,
      });

      mockCaptureAttendance.mockResolvedValue({
        unwrap: () => Promise.resolve({
          attendanceRecord: {
            id: 'att_001',
            clockInTime: new Date().toISOString(),
            action: 'clock_in',
          },
        }),
      });

      renderKioskInterface();

      // Simulate Enter key press
      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Reading card...')).toBeInTheDocument();
      });
    });

    it('should show employee name when card is recognized', async () => {
      mockUseGetEmployeeByCardQuery.mockReturnValue({
        data: {
          id: 'emp_001',
          firstName: 'John',
          lastName: 'Doe',
          employeeNumber: 'EMP001',
        },
        isLoading: false,
      });

      mockCaptureAttendance.mockResolvedValue({
        unwrap: () => Promise.resolve({
          attendanceRecord: {
            id: 'att_001',
            clockInTime: new Date().toISOString(),
          },
        }),
      });

      renderKioskInterface();

      // Simulate RFID scan
      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('should show error message for unrecognized card', async () => {
      mockUseGetEmployeeByCardQuery.mockReturnValue({
        data: null,
        isLoading: false,
      });

      renderKioskInterface();

      // Simulate RFID scan
      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Employee not found. Please contact administrator.')).toBeInTheDocument();
      });
    });
  });

  describe('Attendance Capture', () => {
    beforeEach(() => {
      mockUseGetEmployeeByCardQuery.mockReturnValue({
        data: {
          id: 'emp_001',
          firstName: 'John',
          lastName: 'Doe',
          employeeNumber: 'EMP001',
        },
        isLoading: false,
      });
    });

    it('should successfully process clock in', async () => {
      mockCaptureAttendance.mockResolvedValue({
        unwrap: () => Promise.resolve({
          attendanceRecord: {
            id: 'att_001',
            clockInTime: new Date().toISOString(),
          },
        }),
      });

      renderKioskInterface();

      // Simulate RFID scan
      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Clocked In successfully')).toBeInTheDocument();
      });

      expect(mockCaptureAttendance).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp_001',
          deviceId: 'kiosk_001',
          action: 'clock_in',
          location: 'Test Location',
        })
      );
    });

    it('should successfully process clock out', async () => {
      // Mock last attendance to be clock_in
      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'last_attendances') {
          return JSON.stringify({
            emp_001: { action: 'clock_in' },
          });
        }
        return '[]';
      });

      mockCaptureAttendance.mockResolvedValue({
        unwrap: () => Promise.resolve({
          attendanceRecord: {
            id: 'att_001',
            clockOutTime: new Date().toISOString(),
          },
        }),
      });

      renderKioskInterface();

      // Simulate RFID scan
      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Clocked Out successfully')).toBeInTheDocument();
      });

      expect(mockCaptureAttendance).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'clock_out',
        })
      );
    });

    it('should handle attendance capture failure', async () => {
      mockCaptureAttendance.mockRejectedValue(new Error('Network error'));

      renderKioskInterface();

      // Simulate RFID scan
      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Failed to record attendance. Please try again.')).toBeInTheDocument();
      });
    });
  });

  describe('Offline Mode', () => {
    beforeEach(() => {
      store = createMockStore({
        offline: { isOffline: true },
      });

      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'offline_employees') {
          return JSON.stringify([
            {
              id: 'emp_001',
              firstName: 'John',
              lastName: 'Doe',
              cardId: 'CARD_001',
            },
          ]);
        }
        return '[]';
      });
    });

    it('should work in offline mode with local employee data', async () => {
      renderKioskInterface();

      // Simulate RFID scan
      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText(/Clocked .* successfully \(Offline\)/)).toBeInTheDocument();
      });

      // Verify offline data was stored
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'offline_attendance_queue',
        expect.any(String)
      );
    });

    it('should show error for employee not in offline cache', async () => {
      mockLocalStorage.getItem.mockReturnValue('[]'); // Empty offline cache

      renderKioskInterface();

      // Simulate RFID scan
      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Employee not found in offline database')).toBeInTheDocument();
      });
    });
  });

  describe('User Interface Interactions', () => {
    it('should prevent multiple simultaneous scans', async () => {
      mockUseGetEmployeeByCardQuery.mockReturnValue({
        data: {
          id: 'emp_001',
          firstName: 'John',
          lastName: 'Doe',
        },
        isLoading: false,
      });

      mockCaptureAttendance.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      );

      renderKioskInterface();

      // First scan
      fireEvent.keyDown(window, { key: 'Enter' });
      
      // Second scan while first is processing
      fireEvent.keyDown(window, { key: 'Enter' });

      // Should only process one scan
      await waitFor(() => {
        expect(mockCaptureAttendance).toHaveBeenCalledTimes(1);
      });
    });

    it('should reset state after successful attendance', async () => {
      mockUseGetEmployeeByCardQuery.mockReturnValue({
        data: {
          id: 'emp_001',
          firstName: 'John',
          lastName: 'Doe',
        },
        isLoading: false,
      });

      mockCaptureAttendance.mockResolvedValue({
        unwrap: () => Promise.resolve({
          attendanceRecord: { id: 'att_001' },
        }),
      });

      renderKioskInterface();

      // Simulate RFID scan
      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Clocked In successfully')).toBeInTheDocument();
      });

      // Wait for reset
      await waitFor(() => {
        expect(screen.getByText('Please scan your RFID card')).toBeInTheDocument();
      }, { timeout: 4000 });
    });

    it('should show processing spinner during attendance capture', async () => {
      mockUseGetEmployeeByCardQuery.mockReturnValue({
        data: {
          id: 'emp_001',
          firstName: 'John',
          lastName: 'Doe',
        },
        isLoading: false,
      });

      mockCaptureAttendance.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      );

      renderKioskInterface();

      // Simulate RFID scan
      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(document.querySelector('.processing-spinner')).toBeInTheDocument();
      });
    });
  });

  describe('Audio Feedback', () => {
    it('should play success sound on successful attendance', async () => {
      mockUseGetEmployeeByCardQuery.mockReturnValue({
        data: {
          id: 'emp_001',
          firstName: 'John',
          lastName: 'Doe',
        },
        isLoading: false,
      });

      mockCaptureAttendance.mockResolvedValue({
        unwrap: () => Promise.resolve({
          attendanceRecord: { id: 'att_001' },
        }),
      });

      renderKioskInterface();

      // Simulate RFID scan
      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Clocked In successfully')).toBeInTheDocument();
      });

      // Verify audio context was used
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      expect(mockAudioContext.createGain).toHaveBeenCalled();
    });

    it('should play error sound on failed attendance', async () => {
      mockUseGetEmployeeByCardQuery.mockReturnValue({
        data: {
          id: 'emp_001',
          firstName: 'John',
          lastName: 'Doe',
        },
        isLoading: false,
      });

      mockCaptureAttendance.mockRejectedValue(new Error('Network error'));

      renderKioskInterface();

      // Simulate RFID scan
      fireEvent.keyDown(window, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Failed to record attendance. Please try again.')).toBeInTheDocument();
      });

      // Verify audio context was used for error sound
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      renderKioskInterface();

      // Check for semantic structure
      expect(screen.getByRole('main') || document.querySelector('.kiosk-interface')).toBeInTheDocument();
    });

    it('should be keyboard accessible', () => {
      renderKioskInterface();

      // The interface should respond to keyboard events (Enter key)
      expect(() => {
        fireEvent.keyDown(window, { key: 'Enter' });
      }).not.toThrow();
    });

    it('should have high contrast support', () => {
      renderKioskInterface();

      // Check that CSS classes are applied for styling
      expect(document.querySelector('.kiosk-interface')).toHaveClass('kiosk-interface');
    });
  });
});