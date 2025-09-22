// Test Redux slices individually to avoid RTK Query import issues
import authReducer, { setCredentials, logout } from '../slices/authSlice';
import offlineReducer, { setOnlineStatus, addPendingAction } from '../slices/offlineSlice';

describe('Redux Store Integration', () => {
  describe('Auth Slice Integration', () => {
    test('auth slice handles login correctly', () => {
      const initialState = {
        user: null,
        token: null,
        isAuthenticated: false,
      };

      const mockUser = {
        id: '1',
        employeeId: 'EMP001',
        name: 'John Doe',
        role: 'employee' as const,
      };
      const mockToken = 'test-token';

      // Test login
      let state = authReducer(initialState, setCredentials({ user: mockUser, token: mockToken }));
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
      expect(state.token).toBe(mockToken);

      // Test logout
      state = authReducer(state, logout());
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
    });
  });

  describe('Offline Slice Integration', () => {
    test('offline slice handles status and actions correctly', () => {
      const initialState = {
        isOnline: true,
        pendingActions: [],
        syncInProgress: false,
        lastSyncTime: null,
      };

      // Test going offline
      let state = offlineReducer(initialState, setOnlineStatus(false));
      expect(state.isOnline).toBe(false);

      // Test adding pending action
      const mockAction = {
        id: 'test-action-1',
        type: 'CLOCK_IN',
        data: { employeeId: 'EMP001' },
      };

      state = offlineReducer(state, addPendingAction(mockAction));
      expect(state.pendingActions).toHaveLength(1);
      expect(state.pendingActions[0]).toMatchObject(mockAction);
      expect(state.pendingActions[0].timestamp).toBeDefined();
    });
  });

  describe('Store Configuration', () => {
    test('reducers are properly exported and functional', () => {
      // Test that reducers can handle unknown actions without crashing
      expect(() => {
        authReducer(undefined, { type: 'UNKNOWN_ACTION' });
        offlineReducer(undefined, { type: 'UNKNOWN_ACTION' });
      }).not.toThrow();
    });

    test('action creators work correctly', () => {
      const mockUser = {
        id: '1',
        employeeId: 'EMP001',
        name: 'John Doe',
        role: 'employee' as const,
      };

      const loginAction = setCredentials({ user: mockUser, token: 'token' });
      expect(loginAction.type).toBe('auth/setCredentials');
      expect(loginAction.payload.user).toEqual(mockUser);

      const logoutAction = logout();
      expect(logoutAction.type).toBe('auth/logout');

      const offlineAction = setOnlineStatus(false);
      expect(offlineAction.type).toBe('offline/setOnlineStatus');
      expect(offlineAction.payload).toBe(false);
    });
  });
});