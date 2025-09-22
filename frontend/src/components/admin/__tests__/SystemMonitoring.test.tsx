import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import SystemMonitoring from '../SystemMonitoring';
import { apiSlice } from '../../../store/api/apiSlice';
import authSlice from '../../../store/slices/authSlice';
import offlineSlice from '../../../store/slices/offlineSlice';

const mockSystemHealth = {
  status: 'healthy' as const,
  uptime: 86400,
  memoryUsage: {
    used: 1073741824,
    total: 4294967296,
    percentage: 25,
  },
  diskUsage: {
    used: 10737418240,
    total: 107374182400,
    percentage: 10,
  },
  databaseStatus: 'connected' as const,
  lastHealthCheck: '2023-01-01T12:00:00Z',
};

const mockSyncStatus = {
  lastSyncAt: '2023-01-01T11:30:00Z',
  status: 'success' as const,
  pendingOperations: 0,
  failedOperations: 0,
  nextSyncAt: '2023-01-01T12:30:00Z',
};

const mockSystemStats = {
  totalEmployees: 10,
  activeEmployees: 8,
  totalAttendanceRecords: 1000,
  todayAttendanceRecords: 15,
  pendingSyncOperations: 0,
  systemUptime: 86400,
  lastBackup: '2023-01-01T06:00:00Z',
};

const mockConflicts: any[] = [];

// Mock the API hooks
jest.mock('../../../store/api/systemApi', () => ({
  useGetSyncStatusQuery: () => ({
    data: mockSyncStatus,
    isLoading: false,
  }),
  useGetSystemHealthQuery: () => ({
    data: mockSystemHealth,
    isLoading: false,
  }),
  useGetSystemStatsQuery: () => ({
    data: mockSystemStats,
    isLoading: false,
  }),
  useGetConflictsQuery: () => ({
    data: mockConflicts,
  }),
  useTriggerSyncMutation: () => [
    jest.fn().mockImplementation(() => ({
      unwrap: () => Promise.resolve({ message: 'Sync started', syncId: '123' })
    })),
    { isLoading: false },
  ],
}));

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

describe('SystemMonitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.alert
    window.alert = jest.fn();
  });

  it('renders system monitoring interface', () => {
    renderWithProvider(<SystemMonitoring />);
    
    expect(screen.getByText('System Monitoring')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Sync Logs')).toBeInTheDocument();
    expect(screen.getByText('Conflicts')).toBeInTheDocument();
    expect(screen.getByText('Backups')).toBeInTheDocument();
    expect(screen.getByText('Configuration')).toBeInTheDocument();
  });

  it('displays system health card in overview', () => {
    renderWithProvider(<SystemMonitoring />);
    
    expect(screen.getByText('System Health')).toBeInTheDocument();
    expect(screen.getByText('HEALTHY')).toBeInTheDocument();
  });

  it('displays sync status card in overview', () => {
    renderWithProvider(<SystemMonitoring />);
    
    expect(screen.getByText('Sync Status')).toBeInTheDocument();
    expect(screen.getByText('SUCCESS')).toBeInTheDocument();
    expect(screen.getByText('Manual Sync')).toBeInTheDocument();
  });

  it('displays system stats card in overview', () => {
    renderWithProvider(<SystemMonitoring />);
    
    expect(screen.getByText('System Statistics')).toBeInTheDocument();
    expect(screen.getByText('Total Employees')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('switches between tabs', () => {
    renderWithProvider(<SystemMonitoring />);
    
    // Click on Sync Logs tab
    fireEvent.click(screen.getByText('Sync Logs'));
    expect(screen.getByText('Sync logs viewer will be implemented here.')).toBeInTheDocument();
    
    // Click on Conflicts tab
    fireEvent.click(screen.getByText('Conflicts'));
    expect(screen.getByText('Conflict resolution interface will be implemented here.')).toBeInTheDocument();
    
    // Click on Backups tab
    fireEvent.click(screen.getByText('Backups'));
    expect(screen.getByText('Backup management interface will be implemented here.')).toBeInTheDocument();
    
    // Click on Configuration tab
    fireEvent.click(screen.getByText('Configuration'));
    expect(screen.getByText('System configuration interface will be implemented here.')).toBeInTheDocument();
    
    // Click back to Overview
    fireEvent.click(screen.getByText('Overview'));
    expect(screen.getByText('System Health')).toBeInTheDocument();
  });

  it('handles manual sync trigger', async () => {
    renderWithProvider(<SystemMonitoring />);
    
    const manualSyncButton = screen.getByText('Manual Sync');
    fireEvent.click(manualSyncButton);
    
    // Wait for the async operation to complete
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(window.alert).toHaveBeenCalledWith('Sync initiated: Sync started');
  });

  it('shows refresh button', () => {
    renderWithProvider(<SystemMonitoring />);
    
    expect(screen.getByText('🔄 Refresh')).toBeInTheDocument();
  });
});