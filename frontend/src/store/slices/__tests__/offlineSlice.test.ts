import offlineReducer, {
  setOnlineStatus,
  addPendingAction,
  removePendingAction,
  setSyncInProgress,
  setLastSyncTime,
} from '../offlineSlice';

describe('offlineSlice', () => {
  const initialState = {
    isOnline: true,
    pendingActions: [],
    syncInProgress: false,
    lastSyncTime: null,
  };

  test('should return the initial state', () => {
    expect(offlineReducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  test('should handle setOnlineStatus', () => {
    const actual = offlineReducer(initialState, setOnlineStatus(false));
    expect(actual.isOnline).toBe(false);
  });

  test('should handle addPendingAction', () => {
    const pendingAction = {
      id: 'action-1',
      type: 'CLOCK_IN',
      data: { employeeId: 'EMP001' },
    };

    const actual = offlineReducer(initialState, addPendingAction(pendingAction));
    
    expect(actual.pendingActions).toHaveLength(1);
    expect(actual.pendingActions[0]).toMatchObject(pendingAction);
    expect(actual.pendingActions[0].timestamp).toBeDefined();
  });

  test('should handle removePendingAction', () => {
    const stateWithPendingAction = {
      ...initialState,
      pendingActions: [{
        id: 'action-1',
        type: 'CLOCK_IN',
        data: { employeeId: 'EMP001' },
        timestamp: Date.now(),
      }],
    };

    const actual = offlineReducer(stateWithPendingAction, removePendingAction('action-1'));
    expect(actual.pendingActions).toHaveLength(0);
  });

  test('should handle setSyncInProgress', () => {
    const actual = offlineReducer(initialState, setSyncInProgress(true));
    expect(actual.syncInProgress).toBe(true);
  });

  test('should handle setLastSyncTime', () => {
    const timestamp = Date.now();
    const actual = offlineReducer(initialState, setLastSyncTime(timestamp));
    expect(actual.lastSyncTime).toBe(timestamp);
  });
});