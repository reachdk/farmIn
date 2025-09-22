import React from 'react';
import { useAppSelector } from '../../hooks/redux';
import { SyncService } from '../../services/syncService';

const OfflineIndicator: React.FC = () => {
  const { isOnline, pendingActions, syncInProgress, lastSyncTime } = useAppSelector(
    (state) => state.offline
  );

  const formatLastSync = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const handleManualSync = () => {
    SyncService.syncPendingActions();
  };

  if (isOnline && pendingActions.length === 0) {
    return null; // Don't show indicator when online and no pending actions
  }

  return (
    <div className={`offline-indicator ${isOnline ? 'online' : 'offline'}`}>
      <div className="status-info">
        <span className="status-icon">
          {isOnline ? '🟢' : '🔴'}
        </span>
        <span className="status-text">
          {isOnline ? 'Online' : 'Offline'}
        </span>
        
        {pendingActions.length > 0 && (
          <span className="pending-count">
            {pendingActions.length} pending
          </span>
        )}
      </div>

      {syncInProgress && (
        <div className="sync-progress">
          <span>Syncing...</span>
        </div>
      )}

      <div className="sync-info">
        <small>Last sync: {formatLastSync(lastSyncTime)}</small>
        {isOnline && pendingActions.length > 0 && (
          <button 
            onClick={handleManualSync}
            disabled={syncInProgress}
            className="sync-button"
          >
            Sync Now
          </button>
        )}
      </div>
    </div>
  );
};

export default OfflineIndicator;