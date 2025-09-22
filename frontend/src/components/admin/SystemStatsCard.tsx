import React from 'react';
import { SystemStats } from '../../store/api/systemApi';
import './SystemStatsCard.css';

interface SystemStatsCardProps {
  stats?: SystemStats;
  isLoading: boolean;
}

const SystemStatsCard: React.FC<SystemStatsCardProps> = ({ stats, isLoading }) => {
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${Math.floor(seconds / 60)}m`;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Less than 1h ago';
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (isLoading) {
    return (
      <div className="system-stats-card loading">
        <div className="card-header">
          <h3>System Statistics</h3>
        </div>
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="system-stats-card error">
        <div className="card-header">
          <h3>System Statistics</h3>
        </div>
        <div className="error-content">
          <p>Unable to load system statistics</p>
        </div>
      </div>
    );
  }

  const activeEmployeePercentage = stats.totalEmployees > 0 
    ? Math.round((stats.activeEmployees / stats.totalEmployees) * 100) 
    : 0;

  return (
    <div className="system-stats-card">
      <div className="card-header">
        <h3>System Statistics</h3>
      </div>

      <div className="stats-content">
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-icon">👥</div>
            <div className="stat-info">
              <div className="stat-value">{stats.totalEmployees}</div>
              <div className="stat-label">Total Employees</div>
            </div>
          </div>

          <div className="stat-item">
            <div className="stat-icon">✅</div>
            <div className="stat-info">
              <div className="stat-value">{stats.activeEmployees}</div>
              <div className="stat-label">Active Employees</div>
              <div className="stat-percentage">{activeEmployeePercentage}%</div>
            </div>
          </div>

          <div className="stat-item">
            <div className="stat-icon">📊</div>
            <div className="stat-info">
              <div className="stat-value">{stats.totalAttendanceRecords.toLocaleString()}</div>
              <div className="stat-label">Total Records</div>
            </div>
          </div>

          <div className="stat-item">
            <div className="stat-icon">📅</div>
            <div className="stat-info">
              <div className="stat-value">{stats.todayAttendanceRecords}</div>
              <div className="stat-label">Today's Records</div>
            </div>
          </div>
        </div>

        <div className="stats-details">
          <div className="detail-row">
            <span className="detail-label">Pending Sync Operations:</span>
            <span className={`detail-value ${stats.pendingSyncOperations > 0 ? 'warning' : 'success'}`}>
              {stats.pendingSyncOperations}
            </span>
          </div>

          <div className="detail-row">
            <span className="detail-label">System Uptime:</span>
            <span className="detail-value">
              {formatUptime(stats.systemUptime)}
            </span>
          </div>

          {stats.lastBackup && (
            <div className="detail-row">
              <span className="detail-label">Last Backup:</span>
              <span className="detail-value">
                {formatTimeAgo(stats.lastBackup)}
              </span>
            </div>
          )}
        </div>

        <div className="stats-summary">
          <div className="summary-item">
            <div className="summary-label">Data Health</div>
            <div className={`summary-status ${stats.pendingSyncOperations === 0 ? 'healthy' : 'warning'}`}>
              {stats.pendingSyncOperations === 0 ? 'All Synced' : 'Sync Pending'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemStatsCard;