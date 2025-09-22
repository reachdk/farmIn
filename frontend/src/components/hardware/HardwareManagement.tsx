import React, { useState } from 'react';
import {
  useGetDevicesQuery,
  useGetHardwareStatsQuery,
  useDiscoverDevicesMutation,
  HardwareDevice,
} from '../../store/api/hardwareApi';
import DeviceList from './DeviceList';
import DeviceRegistration from './DeviceRegistration';
import RFIDCardManager from './RFIDCardManager';
import PhotoGallery from './PhotoGallery';
import HardwareStats from './HardwareStats';
import './HardwareManagement.css';

type HardwareTab = 'devices' | 'rfid' | 'photos' | 'stats';

const HardwareManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<HardwareTab>('devices');
  const [showRegistration, setShowRegistration] = useState(false);

  const { data: devices = [], isLoading, error, refetch } = useGetDevicesQuery();
  const { data: stats } = useGetHardwareStatsQuery();
  const [discoverDevices, { isLoading: isDiscovering }] = useDiscoverDevicesMutation();

  const handleDiscoverDevices = async () => {
    try {
      const result = await discoverDevices({
        networkRange: '192.168.1.0/24',
        timeout: 30000,
      }).unwrap();
      
      alert(`Discovered ${result.count} devices. Check the device list for new devices.`);
      refetch();
    } catch (error) {
      console.error('Device discovery failed:', error);
      alert('Device discovery failed. Please try again.');
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'devices':
        return (
          <div className="devices-tab">
            <div className="devices-header">
              <div className="devices-actions">
                <button 
                  className="discover-button"
                  onClick={handleDiscoverDevices}
                  disabled={isDiscovering}
                >
                  {isDiscovering ? '🔍 Discovering...' : '🔍 Discover Devices'}
                </button>
                <button 
                  className="register-button"
                  onClick={() => setShowRegistration(true)}
                >
                  ➕ Register Device
                </button>
              </div>
            </div>
            <DeviceList 
              devices={devices} 
              isLoading={isLoading} 
              error={error}
              onRefresh={refetch}
            />
          </div>
        );
      case 'rfid':
        return <RFIDCardManager />;
      case 'photos':
        return <PhotoGallery />;
      case 'stats':
        return <HardwareStats stats={stats} />;
      default:
        return null;
    }
  };

  return (
    <div className="hardware-management">
      <div className="hardware-header">
        <h2>Hardware Management</h2>
        <div className="header-status">
          {stats && (
            <div className="quick-stats">
              <span className="stat-item">
                <span className="stat-value">{stats.onlineDevices}</span>
                <span className="stat-label">Online</span>
              </span>
              <span className="stat-item">
                <span className="stat-value">{stats.offlineDevices}</span>
                <span className="stat-label">Offline</span>
              </span>
              {stats.errorDevices > 0 && (
                <span className="stat-item error">
                  <span className="stat-value">{stats.errorDevices}</span>
                  <span className="stat-label">Errors</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="hardware-nav">
        <button
          className={`nav-tab ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          Devices ({devices.length})
        </button>
        <button
          className={`nav-tab ${activeTab === 'rfid' ? 'active' : ''}`}
          onClick={() => setActiveTab('rfid')}
        >
          RFID Cards
        </button>
        <button
          className={`nav-tab ${activeTab === 'photos' ? 'active' : ''}`}
          onClick={() => setActiveTab('photos')}
        >
          Photos
        </button>
        <button
          className={`nav-tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Statistics
        </button>
      </div>

      <div className="hardware-content">
        {renderTabContent()}
      </div>

      {showRegistration && (
        <DeviceRegistration
          onClose={() => setShowRegistration(false)}
          onSuccess={() => {
            setShowRegistration(false);
            refetch();
          }}
        />
      )}
    </div>
  );
};

export default HardwareManagement;