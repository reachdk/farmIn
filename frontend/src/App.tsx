import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter as Router } from 'react-router-dom';
import { store } from './store';
import { useAppDispatch } from './hooks/redux';
import { setOnlineStatus } from './store/slices/offlineSlice';
import { SessionManager } from './utils/sessionManager';
import { SyncService } from './services/syncService';
import AppRoutes from './components/routing/AppRoutes';
import OfflineIndicator from './components/common/OfflineIndicator';
import './App.css';
import './components/common/OfflineIndicator.css';

function AppContent() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Load saved session on app start
    SessionManager.loadSession();

    // Initialize sync service
    SyncService.startAutoSync();

    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('SW registered: ', registration);
          })
          .catch((registrationError) => {
            console.log('SW registration failed: ', registrationError);
          });
      });
    }

    // Monitor online/offline status
    const handleOnline = () => {
      dispatch(setOnlineStatus(true));
      // Download latest data when coming online
      SyncService.downloadLatestData();
    };
    const handleOffline = () => dispatch(setOnlineStatus(false));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Extend session on user activity
    const handleUserActivity = () => SessionManager.extendSession();
    window.addEventListener('click', handleUserActivity);
    window.addEventListener('keypress', handleUserActivity);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('keypress', handleUserActivity);
    };
  }, [dispatch]);

  return (
    <div className="App">
      <OfflineIndicator />
      <AppRoutes />
    </div>
  );
}

function App() {
  return (
    <Provider store={store}>
      <Router>
        <AppContent />
      </Router>
    </Provider>
  );
}

export default App;
