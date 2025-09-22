import React, { useState } from 'react';
import {
  HardwareDevice,
  useGetDeviceStatusQuery,
  useSendDeviceCommandMutation,
  useDeleteDeviceMutation,
} from '../../store/api/hardwareApi';
import DeviceCard from './DeviceCard';
import DeviceDetails from './DeviceDetails';
import './DeviceList.css';

interface DeviceListProps {
  devices: HardwareDevice[];
  isLoading: boolean;
  error: any;
  onRefresh: () => void;
}

const DeviceList: React.FC<DeviceListProps> = ({ devices, isLoading, error, onRefresh }) => {
  const [selectedDevice, setSelectedDevice] = useState<HardwareDevice | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline' | 'error'>('all');
  const [filterType, setFilterType] = useState<'all' | 'kiosk' | 'rfid_reader' | 'camera'>('all');

  const [sendCommand] = useSendDeviceCommandMutation();
  const [deleteDevice] = useDeleteDeviceMutation();

  const filteredDevices = devices.filter(device => {
    if (filterStatus !== 'all' && device.status !== filterStatus) return false;
    if (filterType !== 'all' && device.type !== filterType) return false;
    return true;
  });

  const handleDeviceCommand = async (deviceId: string, command: string, parameters?: any) => {
    try {
      const result = await sendCommand({
        deviceId,
        command: { command, parameters },
      }).unwrap();

      if (result.success) {
        alert(`Command executed successfully: ${command}`);
      } else {
        alert(`Command failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Command failed:', error);
      alert('Failed to send command to device');
    }
  };

  const handleDeleteDevice = async (deviceId: string, deviceName: string) => {
    if (window.confirm(`Are you sure you want to delete device "${deviceName}"? This action cannot be undone.`)) {
      try {
        await deleteDevice(deviceId).unwrap();
        alert('Device deleted successfully');
        onRefresh();
      } catch (error) {
        console.error('Failed to delete device:', error);
        alert('Failed to delete device');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="device-list loading">
        <div className="loading-spinner"></div>
        <p>Loading devices...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="device-list error">
        <div className="error-message">
          Failed to load devices. Please try again.
          <button onClick={onRefresh} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="device-list">
      <div className="device-list-controls">
        <div className="filters">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="error">Error</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="filter-select"
          >
            <option value="all">All Types</option>
            <option value="kiosk">Kiosks</option>
            <option value="rfid_reader">RFID Readers</option>
            <option value="camera">Cameras</option>
          </select>
        </div>

        <div className="view-controls">
          <button
            className={`view-button ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            ⊞
          </button>
          <button
            className={`view-button ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            ☰
          </button>
        </div>
      </div>

      {filteredDevices.length === 0 ? (
        <div className="empty-state">
          <p>No devices found matching the current filters.</p>
          {devices.length === 0 && (
            <p>Get started by discovering or registering your first device.</p>
          )}
        </div>
      ) : (
        <div className={`devices-container ${viewMode}`}>
          {filteredDevices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              viewMode={viewMode}
              onSelect={() => setSelectedDevice(device)}
              onCommand={handleDeviceCommand}
              onDelete={() => handleDeleteDevice(device.id, device.name)}
            />
          ))}
        </div>
      )}

      {selectedDevice && (
        <DeviceDetails
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
          onCommand={handleDeviceCommand}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
};

export default DeviceList;