import React from 'react';
import { HardwareDevice, useGetDeviceStatusQuery } from '../../store/api/hardwareApi';
import './DeviceCard.css';

interface DeviceCardProps {
  device: HardwareDevice;
  viewMode: 'grid' | 'list';
  onSelect: () => void;
  onCommand: (deviceId: string, command: string, parameters?: any) => void;
  onDelete: () => void;
}

const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  viewMode,
  onSelect,
  onCommand,
  onDelete,
}) => {
  const { data: status } = useGetDeviceStatusQuery(device.id);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#28a745';
      case 'offline': return '#6c757d';
      case 'error': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'kiosk': return '🖥️';
      case 'rfid_reader': return '📱';
      case 'camera': return '📷';
      default: return '🔧';
    }
  };

  const formatLastSeen = (dateString: string) => {
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

  const quickCommands = [
    { command: 'restart', label: 'Restart', icon: '🔄' },
    { command: 'show_message', label: 'Test Display', icon: '💬', parameters: { message: 'Test message', type: 'info' } },
  ];

  if (device.capabilities.includes('camera')) {
    quickCommands.push({ command: 'capture_photo', label: 'Capture Photo', icon: '📸' });
  }

  if (device.capabilities.includes('rfid')) {
    quickCommands.push({ command: 'read_rfid', label: 'Read RFID', icon: '📱' });
  }

  return (
    <div className={`device-card ${viewMode} ${device.status}`} onClick={onSelect}>
      <div className="device-header">
        <div className="device-info">
          <div className="device-icon">
            {getTypeIcon(device.type)}
          </div>
          <div className="device-details">
            <h3 className="device-name">{device.name}</h3>
            <p className="device-location">{device.location}</p>
            <p className="device-ip">{device.ipAddress}</p>
          </div>
        </div>
        <div className="device-status">
          <div 
            className="status-indicator"
            style={{ backgroundColor: getStatusColor(device.status) }}
            title={`Status: ${device.status}`}
          />
          <span className="status-text">{device.status.toUpperCase()}</span>
        </div>
      </div>

      <div className="device-body">
        <div className="device-type">
          <span className="type-badge">{device.type.replace('_', ' ').toUpperCase()}</span>
        </div>

        <div className="device-capabilities">
          {device.capabilities.map((capability) => (
            <span key={capability} className="capability-tag">
              {capability}
            </span>
          ))}
        </div>

        {status && (
          <div className="device-health">
            <div className="health-metric">
              <span className="metric-label">CPU:</span>
              <span className="metric-value">{status.systemHealth.cpuUsage.toFixed(1)}%</span>
            </div>
            <div className="health-metric">
              <span className="metric-label">Memory:</span>
              <span className="metric-value">{status.systemHealth.memoryUsage.toFixed(1)}%</span>
            </div>
            {status.systemHealth.temperature > 0 && (
              <div className="health-metric">
                <span className="metric-label">Temp:</span>
                <span className="metric-value">{status.systemHealth.temperature.toFixed(1)}°C</span>
              </div>
            )}
          </div>
        )}

        <div className="device-last-seen">
          Last seen: {formatLastSeen(device.lastSeen)}
        </div>
      </div>

      <div className="device-actions" onClick={(e) => e.stopPropagation()}>
        <div className="quick-commands">
          {quickCommands.slice(0, 2).map((cmd) => (
            <button
              key={cmd.command}
              className="quick-command-button"
              onClick={() => onCommand(device.id, cmd.command, cmd.parameters)}
              title={cmd.label}
              disabled={device.status !== 'online'}
            >
              {cmd.icon}
            </button>
          ))}
        </div>
        
        <div className="action-buttons">
          <button
            className="action-button details"
            onClick={onSelect}
            title="View details"
          >
            ℹ️
          </button>
          <button
            className="action-button delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete device"
          >
            🗑️
          </button>
        </div>
      </div>

      {status && status.errors.length > 0 && (
        <div className="device-errors">
          <div className="error-indicator">
            ⚠️ {status.errors.length} error{status.errors.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceCard;