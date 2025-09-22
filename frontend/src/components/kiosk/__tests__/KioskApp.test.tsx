import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KioskApp from '../KioskApp';

// Mock the KioskInterface component
jest.mock('../KioskInterface', () => {
  return function MockKioskInterface({ deviceId, location }: any) {
    return (
      <div data-testid="kiosk-interface">
        <div>Device: {deviceId}</div>
        <div>Location: {location}</div>
      </div>
    );
  };
});

// Mock the store
jest.mock('../../../store', () => ({
  store: {
    getState: () => ({}),
    dispatch: jest.fn(),
    subscribe: jest.fn(),
  },
}));

// Mock the API hook
const mockUseGetDeviceQuery = jest.fn();
jest.mock('../../../store/api/hardwareApi', () => ({
  useGetDeviceQuery: () => mockUseGetDeviceQuery(),
}));

// Mock fullscreen API
const mockRequestFullscreen = jest.fn();
const mockExitFullscreen = jest.fn();

Object.defineProperty(document, 'documentElement', {
  value: {
    requestFullscreen: mockRequestFullscreen,
    webkitRequestFullscreen: mockRequestFullscreen,
    mozRequestFullScreen: mockRequestFullscreen,
    msRequestFullscreen: mockRequestFullscreen,
  },
});

Object.defineProperty(document, 'exitFullscreen', {
  value: mockExitFullscreen,
});

Object.defineProperty(document, 'webkitExitFullscreen', {
  value: mockExitFullscreen,
});

Object.defineProperty(document, 'mozCancelFullScreen', {
  value: mockExitFullscreen,
});

Object.defineProperty(document, 'msExitFullscreen', {
  value: mockExitFullscreen,
});

Object.defineProperty(document, 'fullscreenElement', {
  value: null,
  writable: true,
});

// Mock window.prompt and window.confirm
Object.defineProperty(window, 'prompt', {
  value: jest.fn(),
});

Object.defineProperty(window, 'confirm', {
  value: jest.fn(),
});

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: '',
  },
  writable: true,
});

describe('KioskApp', () => {
  beforeEach(() => {
    mockUseGetDeviceQuery.mockReturnValue({
      data: {
        id: 'kiosk_001',
        name: 'Test Kiosk',
        location: 'Main Entrance',
        status: 'online',
        type: 'kiosk',
      },
      error: null,
    });

    mockRequestFullscreen.mockClear();
    mockExitFullscreen.mockClear();
    (window.prompt as jest.Mock).mockClear();
    (window.confirm as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render kiosk interface with default props', () => {
      render(<KioskApp />);

      expect(screen.getByTestId('kiosk-interface')).toBeInTheDocument();
      expect(screen.getByText('Device: kiosk_001')).toBeInTheDocument();
      expect(screen.getByText('Location: Main Entrance')).toBeInTheDocument();
    });

    it('should render with custom props', () => {
      render(
        <KioskApp 
          deviceId="custom_kiosk" 
          location="Custom Location" 
          autoFullscreen={false}
        />
      );

      expect(screen.getByText('Device: custom_kiosk')).toBeInTheDocument();
      expect(screen.getByText('Location: Custom Location')).toBeInTheDocument();
    });

    it('should show loading state when device data is not available', () => {
      mockUseGetDeviceQuery.mockReturnValue({
        data: null,
        error: null,
      });

      render(<KioskApp />);

      expect(screen.getByText('Initializing Kiosk...')).toBeInTheDocument();
      expect(screen.getByTestId('loading-spinner') || document.querySelector('.loading-spinner')).toBeInTheDocument();
    });

    it('should use fallback device info when API fails', async () => {
      mockUseGetDeviceQuery.mockReturnValue({
        data: null,
        error: { message: 'Network error' },
      });

      render(<KioskApp deviceId="fallback_kiosk" location="Fallback Location" />);

      await waitFor(() => {
        expect(screen.getByTestId('kiosk-interface')).toBeInTheDocument();
        expect(screen.getByText('Device: fallback_kiosk')).toBeInTheDocument();
        expect(screen.getByText('Location: Fallback Location')).toBeInTheDocument();
      });
    });
  });

  describe('Fullscreen Functionality', () => {
    it('should enter fullscreen automatically by default', async () => {
      render(<KioskApp />);

      await waitFor(() => {
        expect(mockRequestFullscreen).toHaveBeenCalled();
      });
    });

    it('should not enter fullscreen when autoFullscreen is false', () => {
      render(<KioskApp autoFullscreen={false} />);

      expect(mockRequestFullscreen).not.toHaveBeenCalled();
    });

    it('should handle fullscreen API errors gracefully', async () => {
      mockRequestFullscreen.mockRejectedValue(new Error('Fullscreen not supported'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      render(<KioskApp />);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to enter fullscreen mode:',
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });

    it('should show fullscreen toggle in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(<KioskApp />);

      expect(screen.getByText('⛶ Enter Fullscreen')).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });

    it('should toggle fullscreen when button is clicked in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(<KioskApp autoFullscreen={false} />);

      const toggleButton = screen.getByText('⛶ Enter Fullscreen');
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(mockRequestFullscreen).toHaveBeenCalled();
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should exit fullscreen when toggle button is clicked while in fullscreen', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Mock fullscreen state
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.documentElement,
        writable: true,
      });

      render(<KioskApp autoFullscreen={false} />);

      // Simulate fullscreen change event
      fireEvent(document, new Event('fullscreenchange'));

      await waitFor(() => {
        expect(screen.getByText('⛶ Exit Fullscreen')).toBeInTheDocument();
      });

      const toggleButton = screen.getByText('⛶ Exit Fullscreen');
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(mockExitFullscreen).toHaveBeenCalled();
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Security Features', () => {
    it('should prevent context menu', () => {
      render(<KioskApp />);

      const contextMenuEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = jest.spyOn(contextMenuEvent, 'preventDefault');
      
      document.dispatchEvent(contextMenuEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent text selection', () => {
      render(<KioskApp />);

      const selectStartEvent = new Event('selectstart', {
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = jest.spyOn(selectStartEvent, 'preventDefault');
      
      document.dispatchEvent(selectStartEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent keyboard shortcuts', () => {
      render(<KioskApp />);

      // Test Ctrl+R (refresh)
      const refreshEvent = new KeyboardEvent('keydown', {
        key: 'r',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = jest.spyOn(refreshEvent, 'preventDefault');
      
      document.dispatchEvent(refreshEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should prevent F12 (dev tools)', () => {
      render(<KioskApp />);

      const f12Event = new KeyboardEvent('keydown', {
        key: 'F12',
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = jest.spyOn(f12Event, 'preventDefault');
      
      document.dispatchEvent(f12Event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('Admin Access', () => {
    it('should detect admin key sequence', async () => {
      (window.prompt as jest.Mock).mockReturnValue('admin123');
      (window.confirm as jest.Mock).mockReturnValue(true);

      render(<KioskApp />);

      // Type "admin" sequence
      const keys = ['a', 'd', 'm', 'i', 'n'];
      keys.forEach(key => {
        fireEvent.keyDown(document, { key });
      });

      await waitFor(() => {
        expect(window.prompt).toHaveBeenCalledWith('Enter admin password:');
      });

      expect(window.confirm).toHaveBeenCalledWith('Exit kiosk mode and access admin interface?');
      expect(window.location.href).toBe('/admin');
    });

    it('should reject incorrect admin password', async () => {
      (window.prompt as jest.Mock).mockReturnValue('wrong_password');

      render(<KioskApp />);

      // Type "admin" sequence
      const keys = ['a', 'd', 'm', 'i', 'n'];
      keys.forEach(key => {
        fireEvent.keyDown(document, { key });
      });

      await waitFor(() => {
        expect(window.prompt).toHaveBeenCalledWith('Enter admin password:');
      });

      expect(window.confirm).not.toHaveBeenCalled();
      expect(window.location.href).toBe('');
    });

    it('should handle cancelled admin access', async () => {
      (window.prompt as jest.Mock).mockReturnValue('admin123');
      (window.confirm as jest.Mock).mockReturnValue(false);

      render(<KioskApp />);

      // Type "admin" sequence
      const keys = ['a', 'd', 'm', 'i', 'n'];
      keys.forEach(key => {
        fireEvent.keyDown(document, { key });
      });

      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalled();
      });

      expect(window.location.href).toBe('');
    });

    it('should reset key sequence after partial match', async () => {
      render(<KioskApp />);

      // Type partial sequence then different key
      fireEvent.keyDown(document, { key: 'a' });
      fireEvent.keyDown(document, { key: 'd' });
      fireEvent.keyDown(document, { key: 'x' }); // Wrong key

      // Type correct sequence
      const keys = ['a', 'd', 'm', 'i', 'n'];
      keys.forEach(key => {
        fireEvent.keyDown(document, { key });
      });

      // Should still trigger admin access
      expect(window.prompt).toHaveBeenCalled();
    });
  });

  describe('Event Cleanup', () => {
    it('should clean up event listeners on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

      const { unmount } = render(<KioskApp />);

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('contextmenu', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('selectstart', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should handle multiple fullscreen change events', () => {
      render(<KioskApp />);

      // Simulate multiple fullscreen change events
      fireEvent(document, new Event('fullscreenchange'));
      fireEvent(document, new Event('webkitfullscreenchange'));
      fireEvent(document, new Event('mozfullscreenchange'));
      fireEvent(document, new Event('MSFullscreenChange'));

      // Should not throw errors
      expect(() => {
        fireEvent(document, new Event('fullscreenchange'));
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing fullscreen API gracefully', async () => {
      // Remove fullscreen API
      Object.defineProperty(document.documentElement, 'requestFullscreen', {
        value: undefined,
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      render(<KioskApp />);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to enter fullscreen mode:',
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });

    it('should handle device query errors gracefully', () => {
      mockUseGetDeviceQuery.mockReturnValue({
        data: null,
        error: { message: 'Network error' },
      });

      expect(() => {
        render(<KioskApp />);
      }).not.toThrow();
    });
  });

  describe('Responsive Design', () => {
    it('should apply kiosk-specific CSS classes', () => {
      render(<KioskApp />);

      expect(document.querySelector('.kiosk-app')).toBeInTheDocument();
    });

    it('should prevent scrollbars in kiosk mode', () => {
      render(<KioskApp />);

      const kioskApp = document.querySelector('.kiosk-app');
      expect(kioskApp).toHaveStyle('overflow: hidden');
    });
  });
});