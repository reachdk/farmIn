import { store } from '../store';
import { logout, setCredentials } from '../store/slices/authSlice';

const SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
const SESSION_KEY = 'farm_attendance_session';

interface SessionData {
  user: {
    id: string;
    employeeId: string;
    name: string;
    role: 'employee' | 'manager' | 'admin';
  };
  token: string;
  timestamp: number;
}

export class SessionManager {
  private static timeoutId: NodeJS.Timeout | null = null;

  static saveSession(user: any, token: string) {
    const sessionData: SessionData = {
      user,
      token,
      timestamp: Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    this.startSessionTimeout();
  }

  static loadSession(): boolean {
    try {
      const sessionStr = localStorage.getItem(SESSION_KEY);
      if (!sessionStr) return false;

      const sessionData: SessionData = JSON.parse(sessionStr);
      const now = Date.now();
      
      // Check if session has expired
      if (now - sessionData.timestamp > SESSION_TIMEOUT) {
        this.clearSession();
        return false;
      }

      // Restore session
      store.dispatch(setCredentials({
        user: sessionData.user,
        token: sessionData.token,
      }));

      this.startSessionTimeout();
      return true;
    } catch (error) {
      console.error('Error loading session:', error);
      this.clearSession();
      return false;
    }
  }

  static clearSession() {
    localStorage.removeItem(SESSION_KEY);
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    store.dispatch(logout());
  }

  static startSessionTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      console.log('Session expired - logging out');
      this.clearSession();
    }, SESSION_TIMEOUT);
  }

  static extendSession() {
    const sessionStr = localStorage.getItem(SESSION_KEY);
    if (sessionStr) {
      const sessionData: SessionData = JSON.parse(sessionStr);
      sessionData.timestamp = Date.now();
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      this.startSessionTimeout();
    }
  }
}