import authReducer, { setCredentials, logout } from '../authSlice';

describe('authSlice', () => {
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

  const mockToken = 'mock-jwt-token';

  test('should return the initial state', () => {
    expect(authReducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  test('should handle setCredentials', () => {
    const actual = authReducer(initialState, setCredentials({
      user: mockUser,
      token: mockToken,
    }));

    expect(actual.user).toEqual(mockUser);
    expect(actual.token).toEqual(mockToken);
    expect(actual.isAuthenticated).toBe(true);
  });

  test('should handle logout', () => {
    const authenticatedState = {
      user: mockUser,
      token: mockToken,
      isAuthenticated: true,
    };

    const actual = authReducer(authenticatedState, logout());

    expect(actual.user).toBeNull();
    expect(actual.token).toBeNull();
    expect(actual.isAuthenticated).toBe(false);
  });
});