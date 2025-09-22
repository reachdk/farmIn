import React from 'react';
import { HardwareDevice } from '../../store/api/hardwareApi';

interface DeviceDetailsProps {
  device: HardwareDevice;
  onClose: () => void;
  onCommand: (deviceId: string, command: string, parameters?: any) => void;
  onRefresh: () => void;
}

const DeviceDetails: React.FC<DeviceDetailsProps> = ({ device, onClose, onCommand, onRefresh }) => {
  return (
    <div className="device-details-overlay">
      <div className="device-details-modal">
        <div className="details-header">
          <h3>Device Details: {device.name}</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="details-content">
          <p>Device details interface will be implemented here.</p>
        </div>
      </div>
    </div>
  );
};

export default DeviceDetails;