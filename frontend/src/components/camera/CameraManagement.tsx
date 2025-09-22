import React, { useState } from 'react';
import {
  useGetCameraDevicesQuery,
  useGetCameraStatsQuery,
  useCapturePhotoMutation,
  CameraDevice,
} from '../../store/api/cameraApi';
import CameraDeviceList from './CameraDeviceList';
import PhotoGallery from './PhotoGallery';
import CameraCapture from './CameraCapture';
import CameraStats from './CameraStats';
import FaceRecognitionPanel from './FaceRecognitionPanel';
import './CameraManagement.css';

type CameraTab = 'devices' | 'capture' | 'gallery' | 'recognition' | 'stats';

const CameraManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CameraTab>('devices');
  const [selectedDevice, setSelectedDevice] = useState<CameraDevice | null>(null);

  const { data: devices = [], isLoading, error, refetch } = useGetCameraDevicesQuery();
  const { data: stats } = useGetCameraStatsQuery();
  const [capturePhoto, { isLoading: isCapturing }] = useCapturePhotoMutation();

  const activeDevices = devices.filter(device => device.status === 'active');

  const handleQuickCapture = async (deviceId: string) => {
    try {
      const result = await capturePhoto({
        deviceId,
        metadata: {
          purpose: 'manual',
          notes: 'Quick capture from camera management',
        },
      }).unwrap();
      
      alert(`Photo captured successfully! ID: ${result.id}`);
    } catch (error) {
      console.error('Quick capture failed:', error);
      alert('Failed to capture photo. Please try again.');
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'devices':
        return (
          <CameraDeviceList
            devices={devices}
            isLoading={isLoading}
            error={error}
            onRefresh={refetch}
            onSelectDevice={setSelectedDevice}
            onQuickCapture={handleQuickCapture}
            isCapturing={isCapturing}
          />
        );
      case 'capture':
        return (
          <CameraCapture
            devices={activeDevices}
            selectedDevice={selectedDevice}
            onDeviceSelect={setSelectedDevice}
          />
        );
      case 'gallery':
        return <PhotoGallery />;
      case 'recognition':
        return <FaceRecognitionPanel />;
      case 'stats':
        return <CameraStats stats={stats} />;
      default:
        return null;
    }
  };

  return (
    <div className="camera-management">
      <div className="camera-header">
        <h2>Camera Management</h2>
        <div className="header-status">
          {stats && (
            <div className="quick-stats">
              <span className="stat-item">
                <span className="stat-value">{activeDevices.length}</span>
                <span className="stat-label">Active Cameras</span>
              </span>
              <span className="stat-item">
                <span className="stat-value">{stats.todayPhotos}</span>
                <span className="stat-label">Today's Photos</span>
              </span>
              <span className="stat-item">
                <span className="stat-value">{Math.round(stats.faceDetectionRate * 100)}%</span>
                <span className="stat-label">Face Detection</span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="camera-nav">
        <button
          className={`nav-tab ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          Devices ({devices.length})
        </button>
        <button
          className={`nav-tab ${activeTab === 'capture' ? 'active' : ''}`}
          onClick={() => setActiveTab('capture')}
          disabled={activeDevices.length === 0}
        >
          Capture
        </button>
        <button
          className={`nav-tab ${activeTab === 'gallery' ? 'active' : ''}`}
          onClick={() => setActiveTab('gallery')}
        >
          Gallery
        </button>
        <button
          className={`nav-tab ${activeTab === 'recognition' ? 'active' : ''}`}
          onClick={() => setActiveTab('recognition')}
        >
          Face Recognition
        </button>
        <button
          className={`nav-tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Statistics
        </button>
      </div>

      <div className="camera-content">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default CameraManagement;