import React from 'react';
import { SyncStatus } from '../../store/api/systemApi';
import './SyncStatusCard.css';

interface SyncStatusCardProps {
  syncStatus?: SyncStatus;
  isLoading: boolean;
  onManualSync: () => void;
  isSyncing: boolean;
}

const SyncStatusCard: React.FC<SyncStatusCardProps> = ({ 
  syncStatus, 
  isLoading, 
  onManualSync, 
  isSyncing 
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return '#28a745';
      case 'syncing': return '#17a2b8';
      case 'error': return '#dc3545';
      case 'idle': return '#6c757d';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✅';
      case 'syncing': return '🔄';
      case 'error': return '❌';
      case 'idle': return '⏸️';
      default: return '❓';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (isLoading) {
    return (
      <div className="sync-status-card loading">
        <div className="card-header">
          <h3>Sync Status</h3>
        </div>
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>Loading sync status...</p>
        </div>
      </div>
    );
  }

  if (!syncStatus) {
    return (
      <div className="sync-status-card error">
        <div className="card-header">
          <h3>Sync Status</h3>
        </div>
        <div className="error-content">
          <p>Unable to load sync status</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sync-status-card">
      <div className="card-header">
        <h3>Sync Status</h3>
        <div 
          className="status-indicator"
          style={{ backgroundColor: getStatusColor(syncStatus.status) }}
          title={`Status: ${syncStatus.status}`}
        />
      </div>

      <div className="sync-content">
        <div className="sync-overview">
          <div className="status-display">
            <span className="status-icon">
              {getStatusIcon(syncStatus.status)}
            </span>
            <div className="status-info">
              <div 
                className="status-badge"
                style={{ backgroundColor: getStatusColor(syncStatus.status) }}
              >
                {syncStatus.status.toUpperCase()}
              </div>
              {syncStatus.lastSyncAt && (
                <div className="last-sync">
                  Last sync: {formatTimeAgo(syncStatus.lastSyncAt)}
                </div>
              )}
            </div>
          </div>

          {syncStatus.lastError && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{syncStatus.lastError}</span>
            </div>
          )}
        </div>

        <div className="sync-metrics">
          <div className="metric-row">
            <div className="metric">
              <span className="metric-label">Pending</span>
              <span className="metric-value pending">
                {syncStatus.pendingOperations}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Failed</span>
              <span className="metric-value failed">
                {syncStatus.failedOperations}
              </span>
            </div>
          </div>

          {syncStatus.nextSyncAt && (
            <div className="next-sync">
              <span className="next-sync-label">Next sync:</span>
              <span className="next-sync-time">
                {new Date(syncStatus.nextSyncAt).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>

        <div className="sync-actions">
          <button 
            className="manual-sync-button"
            onClick={onManualSync}
            disabled={isSyncing || syncStatus.status === 'syncing'}
          >
            {isSyncing || syncStatus.status === 'syncing' ? (
              <>
                <span className="sync-spinner">🔄</span>
                Syncing...
              </>
            ) : (
              <>
                <span>🔄</span>
                Manual Sync
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SyncStatusCard;