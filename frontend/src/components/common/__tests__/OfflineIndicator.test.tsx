import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import OfflineIndicator from '../OfflineIndicator';
import offlineReducer from '../../../store/slices/offlineSlice';

// Mock SyncService
jest.mock('../../../services/syncService', () => ({
  SyncService: {
    syncPendingActions: jest.fn(),
  },
}));

const createTestStore = (initialState: any) => configureStore({
  reducer: {
    offline: offlineReducer,
  },
  preloadedState: {
    offline: initialState,
  },
});

const renderWithStore = (offlineState: any) => {
  const store = createTestStore(offlineState);
  return render(
    <Provider store={store}>
      <OfflineIndicator />
    </Provider>
  );
};

describe('OfflineIndicator', () => {
  test('does not render when online with no pending actions', () => {
    const onlineState = {
      isOnline: true,
      pendingActions: [],
      syncInProgress: false,
      lastSyncTime: null,
    };

    const { container } = renderWithStore(onlineState);
    expect(container.firstChild).toBeNull();
  });

  test('renders offline indicator when offline', () => {
    const offlineState = {
      isOnline: false,
      pendingActions: [],
      syncInProgress: false,
      lastSyncTime: null,
    };

    renderWithStore(offlineState);
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('🔴')).toBeInTheDocument();
  });

  test('shows pending actions count', () => {
    const stateWithPending = {
      isOnline: true,
      pendingActions: [
        { id: '1', type: 'CLOCK_IN', data: {} },
        { id: '2', type: 'CLOCK_OUT', data: {} },
      ],
      syncInProgress: false,
      lastSyncTime: null,
    };

    renderWithStore(stateWithPending);
    expect(screen.getByText('2 pending')).toBeInTheDocument();
  });

  test('shows sync in progress indicator', () => {
    const syncingState = {
      isOnline: true,
      pendingActions: [{ id: '1', type: 'CLOCK_IN', data: {} }],
      syncInProgress: true,
      lastSyncTime: null,
    };

    renderWithStore(syncingState);
    expect(screen.getByText('Syncing...')).toBeInTheDocument();
  });

  test('shows last sync time', () => {
    const timestamp = new Date('2023-01-01T12:00:00Z').getTime();
    const stateWithSync = {
      isOnline: true,
      pendingActions: [{ id: '1', type: 'CLOCK_IN', data: {} }],
      syncInProgress: false,
      lastSyncTime: timestamp,
    };

    renderWithStore(stateWithSync);
    expect(screen.getByText(/Last sync:/)).toBeInTheDocument();
  });

  test('sync button triggers manual sync', () => {
    const { SyncService } = require('../../../services/syncService');
    
    const stateWithPending = {
      isOnline: true,
      pendingActions: [{ id: '1', type: 'CLOCK_IN', data: {} }],
      syncInProgress: false,
      lastSyncTime: null,
    };

    renderWithStore(stateWithPending);
    
    const syncButton = screen.getByText('Sync Now');
    fireEvent.click(syncButton);
    
    expect(SyncService.syncPendingActions).toHaveBeenCalled();
  });

  test('sync button is disabled during sync', () => {
    const syncingState = {
      isOnline: true,
      pendingActions: [{ id: '1', type: 'CLOCK_IN', data: {} }],
      syncInProgress: true,
      lastSyncTime: null,
    };

    renderWithStore(syncingState);
    
    const syncButton = screen.getByText('Sync Now');
    expect(syncButton).toBeDisabled();
  });
});