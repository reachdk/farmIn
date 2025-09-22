import React, { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { store } from '../../store';
import KioskInterface from './KioskInterface';
import { useGetDeviceQuery } from '../../store/api/hardwareApi';
import './KioskApp.css';

interface KioskAppProps {
  deviceId?: string;
  location?: string;
  autoFullscreen?: boolean;
}

const KioskAppContent: React.FC<KioskAppProps> = ({ 
  deviceId = 'kiosk_001', 
  location = 'Main Entrance',
  autoFullscreen = true 
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  
  const { data: device, error: deviceError } = useGetDeviceQuery(deviceId, {
    pollingInterval: 60000, // Poll every minute
  });

  useEffect(() => {
    // Auto-enter fullscreen mode for kiosk
    if (autoFullscreen && !isFullscreen) {
      enterFullscreen();
    }

    // Handle fullscreen change events
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [autoFullscreen, isFullscreen]);

  useEffect(() => {
    // Set device info from query result or use defaults
    if (device) {
      setDeviceInfo(device);
    } else if (deviceError) {
      // Use fallback device info if API is unavailable
      setDeviceInfo({
        id: deviceId,
        name: `Kiosk ${deviceId}`,
        location: location,
        status: 'offline',
        type: 'kiosk'
      });
    }
  }, [device, deviceError, deviceId, location]);

  useEffect(() => {
    // Prevent context menu and text selection for kiosk mode
    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    const preventTextSelection = (e: Event) => {
      e.preventDefault();
      return false;
    };

    const preventKeyboardShortcuts = (e: KeyboardEvent) => {
      // Prevent common browser shortcuts
      if (
        (e.ctrlKey && (e.key === 'r' || e.key === 'R')) || // Refresh
        (e.ctrlKey && (e.key === 'w' || e.key === 'W')) || // Close tab
        (e.ctrlKey && (e.key === 't' || e.key === 'T')) || // New tab
        (e.ctrlKey && (e.key === 'n' || e.key === 'N')) || // New window
        (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I')) || // Dev tools
        (e.key === 'F12') || // Dev tools
        (e.altKey && e.key === 'F4') // Alt+F4
      ) {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('contextmenu', preventContextMenu);
    document.addEventListener('selectstart', preventTextSelection);
    document.addEventListener('keydown', preventKeyboardShortcuts);

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('selectstart', preventTextSelection);
      document.removeEventListener('keydown', preventKeyboardShortcuts);
    };
  }, []);

  const enterFullscreen = async () => {
    try {
      const element = document.documentElement;
      
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) {
        await (element as any).webkitRequestFullscreen();
      } else if ((element as any).mozRequestFullScreen) {
        await (element as any).mozRequestFullScreen();
      } else if ((element as any).msRequestFullscreen) {
        await (element as any).msRequestFullscreen();
      }
    } catch (error) {
      console.warn('Failed to enter fullscreen mode:', error);
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        await (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
    } catch (error) {
      console.warn('Failed to exit fullscreen mode:', error);
    }
  };

  // Admin access for maintenance (hidden shortcut)
  useEffect(() => {
    let keySequence: string[] = [];
    const adminSequence = ['a', 'd', 'm', 'i', 'n']; // Type "admin" to access admin mode
    
    const handleAdminAccess = (e: KeyboardEvent) => {
      keySequence.push(e.key.toLowerCase());
      
      // Keep only the last 5 keys
      if (keySequence.length > adminSequence.length) {
        keySequence = keySequence.slice(-adminSequence.length);
      }
      
      // Check if admin sequence is matched
      if (keySequence.length === adminSequence.length && 
          keySequence.every((key, index) => key === adminSequence[index])) {
        
        // Show admin access dialog
        const password = prompt('Enter admin password:');
        if (password === 'admin123') { // In production, use proper authentication
          if (confirm('Exit kiosk mode and access admin interface?')) {
            exitFullscreen();
            window.location.href = '/admin';
          }
        }
        
        keySequence = []; // Reset sequence
      }
    };

    document.addEventListener('keydown', handleAdminAccess);
    
    return () => {
      document.removeEventListener('keydown', handleAdminAccess);
    };
  }, []);

  if (!deviceInfo) {
    return (
      <div className="kiosk-loading">
        <div className="loading-spinner"></div>
        <div className="loading-text">Initializing Kiosk...</div>
      </div>
    );
  }

  return (
    <div className="kiosk-app">
      <KioskInterface 
        deviceId={deviceInfo.id} 
        location={deviceInfo.location || location} 
      />
      
      {/* Fullscreen toggle for development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="dev-controls">
          <button 
            onClick={isFullscreen ? exitFullscreen : enterFullscreen}
            className="fullscreen-toggle"
          >
            {isFullscreen ? '⛶ Exit Fullscreen' : '⛶ Enter Fullscreen'}
          </button>
        </div>
      )}
    </div>
  );
};

const KioskApp: React.FC<KioskAppProps> = (props) => {
  return (
    <Provider store={store}>
      <KioskAppContent {...props} />
    </Provider>
  );
};

export default KioskApp;