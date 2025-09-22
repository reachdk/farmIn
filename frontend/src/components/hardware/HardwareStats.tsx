import React from 'react';

interface HardwareStatsProps {
  stats?: {
    totalDevices: number;
    onlineDevices: number;
    offlineDevices: number;
    errorDevices: number;
    totalRFIDCards: number;
    activeRFIDCards: number;
    todayPhotos: number;
    todayAttendanceCaptures: number;
  };
}

const HardwareStats: React.FC<HardwareStatsProps> = ({ stats }) => {
  return (
    <div className="hardware-stats">
      <h3>Hardware Statistics</h3>
      {stats ? (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.totalDevices}</div>
            <div className="stat-label">Total Devices</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.onlineDevices}</div>
            <div className="stat-label">Online Devices</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalRFIDCards}</div>
            <div className="stat-label">RFID Cards</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.todayPhotos}</div>
            <div className="stat-label">Photos Today</div>
          </div>
        </div>
      ) : (
        <p>Loading statistics...</p>
      )}
    </div>
  );
};

export default HardwareStats;