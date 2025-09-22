import React from 'react';
import { SystemHealth } from '../../store/api/systemApi';
import './SystemHealthCard.css';

interface SystemHealthCardProps {
  health?: SystemHealth;
  isLoading: boolean;
}

const SystemHealthCard: React.FC<SystemHealthCardProps> = ({ health, isLoading }) => {
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#28a745';
      case 'warning': return '#ffc107';
      case 'critical': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage < 70) return '#28a745';
    if (percentage < 85) return '#ffc107';
    return '#dc3545';
  };

  if (isLoading) {
    return (
      <div className="system-health-card loading">
        <div className="card-header">
          <h3>System Health</h3>
        </div>
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>Loading system health...</p>
        </div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="system-health-card error">
        <div className="card-header">
          <h3>System Health</h3>
        </div>
        <div className="error-content">
          <p>Unable to load system health data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="system-health-card">
      <div className="card-header">
        <h3>System Health</h3>
        <div 
          className="status-indicator"
          style={{ backgroundColor: getStatusColor(health.status) }}
          title={`Status: ${health.status}`}
        />
      </div>

      <div className="health-content">
        <div className="health-overview">
          <div className="status-badge" style={{ backgroundColor: getStatusColor(health.status) }}>
            {health.status.toUpperCase()}
          </div>
          <div className="uptime">
            <span className="uptime-label">Uptime:</span>
            <span className="uptime-value">{formatUptime(health.uptime)}</span>
          </div>
        </div>

        <div className="health-metrics">
          <div className="metric">
            <div className="metric-header">
              <span className="metric-label">Memory Usage</span>
              <span className="metric-value">
                {health.memoryUsage.percentage.toFixed(1)}%
              </span>
            </div>
            <div className="metric-bar">
              <div 
                className="metric-fill"
                style={{ 
                  width: `${health.memoryUsage.percentage}%`,
                  backgroundColor: getUsageColor(health.memoryUsage.percentage)
                }}
              />
            </div>
            <div className="metric-details">
              {formatBytes(health.memoryUsage.used)} / {formatBytes(health.memoryUsage.total)}
            </div>
          </div>

          <div className="metric">
            <div className="metric-header">
              <span className="metric-label">Disk Usage</span>
              <span className="metric-value">
                {health.diskUsage.percentage.toFixed(1)}%
              </span>
            </div>
            <div className="metric-bar">
              <div 
                className="metric-fill"
                style={{ 
                  width: `${health.diskUsage.percentage}%`,
                  backgroundColor: getUsageColor(health.diskUsage.percentage)
                }}
              />
            </div>
            <div className="metric-details">
              {formatBytes(health.diskUsage.used)} / {formatBytes(health.diskUsage.total)}
            </div>
          </div>

          <div className="database-status">
            <span className="db-label">Database:</span>
            <span 
              className={`db-status ${health.databaseStatus}`}
              style={{ 
                color: health.databaseStatus === 'connected' ? '#28a745' : '#dc3545' 
              }}
            >
              {health.databaseStatus.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="health-footer">
          <small>
            Last check: {new Date(health.lastHealthCheck).toLocaleString()}
          </small>
        </div>
      </div>
    </div>
  );
};

export default SystemHealthCard;