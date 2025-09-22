import { SessionManager } from '../sessionManager';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock store
jest.mock('../../store', () => ({
  store: {
    dispatch: jest.fn(),
  },
}));

describe('SessionManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockUser = {
    id: '1',
    employeeId: 'EMP001',
    name: 'John Doe',
    role: 'employee' as const,
  };

  const mockToken = 'mock-jwt-token';

  test('saves session to localStorage', () => {
    SessionManager.saveSession(mockUser, mockToken);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'farm_attendance_session',
      expect.stringContaining(mockToken)
    );
  });

  test('loads valid session from localStorage', () => {
    const sessionData = {
      user: mockUser,
      token: mockToken,
      timestamp: Date.now(),
    };

    localStorageMock.getItem.mockReturnValue(JSON.stringify(sessionData));

    const result = SessionManager.loadSession();

    expect(result).toBe(true);
    expect(localStorageMock.getItem).toHaveBeenCalledWith('farm_attendance_session');
  });

  test('rejects expired session', () => {
    const expiredSessionData = {
      user: mockUser,
      token: mockToken,
      timestamp: Date.now() - (9 * 60 * 60 * 1000), // 9 hours ago (expired)
    };

    localStorageMock.getItem.mockReturnValue(JSON.stringify(expiredSessionData));

    const result = SessionManager.loadSession();

    expect(result).toBe(false);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('farm_attendance_session');
  });

  test('clears session', () => {
    SessionManager.clearSession();

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('farm_attendance_session');
  });

  test('extends session timestamp', () => {
    const sessionData = {
      user: mockUser,
      token: mockToken,
      timestamp: Date.now() - 1000, // 1 second ago
    };

    localStorageMock.getItem.mockReturnValue(JSON.stringify(sessionData));

    SessionManager.extendSession();

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'farm_attendance_session',
      expect.stringContaining(mockToken)
    );
  });
});