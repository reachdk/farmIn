import React from 'react';
import { CameraDevice } from '../../store/api/cameraApi';

interface CameraDeviceListProps {
  devices: CameraDevice[];
  isLoading: boolean;
  error: any;
  onRefresh: () => void;
  onSelectDevice: (device: CameraDevice) => void;
  onQuickCapture: (deviceId: string) => void;
  isCapturing: boolean;
}

const CameraDeviceList: React.FC<CameraDeviceListProps> = ({
  devices,
  isLoading,
  error,
  onRefresh,
  onSelectDevice,
  onQuickCapture,
  isCapturing
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#28a745';
      case 'inactive': return '#6c757d';
      case 'error': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return '🟢';
      case 'inactive': return '⚫';
      case 'error': return '🔴';
      default: return '⚫';
    }
  };

  if (error) {
    return (
      <div className="camera-device-list error">
        <div className="error-message">
          <h3>Failed to load camera devices</h3>
          <p>There was an error loading the camera devices. Please try again.</p>
          <button onClick={onRefresh} className="retry-button">
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="camera-device-list loading">
        <div className="loading-spinner"></div>
        <p>Loading camera devices...</p>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="camera-device-list empty">
        <div className="empty-state">
          <span className="empty-icon">📷</span>
          <h3>No Camera Devices Found</h3>
          <p>No camera devices are currently available or registered.</p>
          <button onClick={onRefresh} className="refresh-button">
            🔄 Refresh Devices
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-device-list">
      <div className="device-list-header">
        <h3>Available Camera Devices ({devices.length})</h3>
        <button onClick={onRefresh} className="refresh-button">
          🔄 Refresh
        </button>
      </div>

      <div className="device-grid">
        {devices.map((device) => (
          <div key={device.id} className={`device-card ${device.status}`}>
            <div className="device-header">
              <div className="device-status">
                <span className="status-icon">{getStatusIcon(device.status)}</span>
                <span 
                  className="status-text"
                  style={{ color: getStatusColor(device.status) }}
                >
                  {device.status.toUpperCase()}
                </span>
              </div>
              <div className="device-actions">
                <button
                  onClick={() => onSelectDevice(device)}
                  className="select-button"
                  disabled={device.status !== 'active'}
                >
                  📋 Select
                </button>
                <button
                  onClick={() => onQuickCapture(device.id)}
                  className="quick-capture-button"
                  disabled={device.status !== 'active' || isCapturing}
                >
                  {isCapturing ? '📸...' : '📸 Capture'}
                </button>
              </div>
            </div>

            <div className="device-info">
              <h4 className="device-name">{device.name}</h4>
              <div className="device-details">
                <div className="detail-item">
                  <label>Device ID:</label>
                  <span>{device.deviceId}</span>
                </div>
                <div className="detail-item">
                  <label>Resolution:</label>
                  <span>{device.resolution}</span>
                </div>
                {device.lastUsed && (
                  <div className="detail-item">
                    <label>Last Used:</label>
                    <span>{new Date(device.lastUsed).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="device-capabilities">
              <h5>Capabilities</h5>
              <div className="capabilities-list">
                {Object.entries(device.capabilities)
                  .filter(([_, enabled]) => enabled)
                  .map(([capability]) => (
                    <span key={capability} className="capability-tag">
                      {capability.replace(/([A-Z])/g, ' $1').toLowerCase()}
                    </span>
                  ))}
              </div>
            </div>

            <div className="device-settings">
              <h5>Current Settings</h5>
              <div className="settings-grid">
                <div className="setting-item">
                  <label>Quality:</label>
                  <span>{device.settings.quality}</span>
                </div>
                <div className="setting-item">
                  <label>Format:</label>
                  <span>{device.settings.format.toUpperCase()}</span>
                </div>
                <div className="setting-item">
                  <label>Brightness:</label>
                  <span>{device.settings.brightness}%</span>
                </div>
                <div className="setting-item">
                  <label>Contrast:</label>
                  <span>{device.settings.contrast}%</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CameraDeviceList;