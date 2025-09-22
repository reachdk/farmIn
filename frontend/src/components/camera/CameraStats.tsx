import React from 'react';

interface CameraStatsProps {
  stats?: {
    totalPhotos: number;
    todayPhotos: number;
    weekPhotos: number;
    monthPhotos: number;
    photosByDevice: { deviceId: string; deviceName: string; count: number }[];
    photosByPurpose: { purpose: string; count: number }[];
    faceDetectionRate: number;
    faceRecognitionRate: number;
    averageProcessingTime: number;
  };
}

const CameraStats: React.FC<CameraStatsProps> = ({ stats }) => {
  if (!stats) {
    return (
      <div className="camera-stats loading">
        <div className="loading-spinner"></div>
        <p>Loading camera statistics...</p>
      </div>
    );
  }

  const formatPercentage = (value: number) => {
    return `${Math.round(value * 100)}%`;
  };

  const formatTime = (seconds: number) => {
    return `${seconds.toFixed(1)}s`;
  };

  return (
    <div className="camera-stats">
      <div className="stats-header">
        <h3>Camera System Statistics</h3>
        <div className="stats-timestamp">
          Last updated: {new Date().toLocaleString()}
        </div>
      </div>

      <div className="stats-grid">
        {/* Photo Count Statistics */}
        <div className="stats-section">
          <h4>Photo Counts</h4>
          <div className="stats-cards">
            <div className="stat-card">
              <div className="stat-value">{stats.totalPhotos.toLocaleString()}</div>
              <div className="stat-label">Total Photos</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.todayPhotos.toLocaleString()}</div>
              <div className="stat-label">Today</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.weekPhotos.toLocaleString()}</div>
              <div className="stat-label">This Week</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.monthPhotos.toLocaleString()}</div>
              <div className="stat-label">This Month</div>
            </div>
          </div>
        </div>

        {/* Processing Statistics */}
        <div className="stats-section">
          <h4>Processing Performance</h4>
          <div className="stats-cards">
            <div className="stat-card">
              <div className="stat-value">{formatPercentage(stats.faceDetectionRate)}</div>
              <div className="stat-label">Face Detection Rate</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{formatPercentage(stats.faceRecognitionRate)}</div>
              <div className="stat-label">Face Recognition Rate</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{formatTime(stats.averageProcessingTime)}</div>
              <div className="stat-label">Avg Processing Time</div>
            </div>
          </div>
        </div>

        {/* Photos by Device */}
        <div className="stats-section">
          <h4>Photos by Device</h4>
          <div className="stats-chart">
            {stats.photosByDevice.length > 0 ? (
              <div className="chart-bars">
                {stats.photosByDevice.map((device, index) => {
                  const maxCount = Math.max(...stats.photosByDevice.map(d => d.count));
                  const percentage = (device.count / maxCount) * 100;
                  
                  return (
                    <div key={device.deviceId} className="chart-bar">
                      <div className="bar-info">
                        <span className="bar-label">{device.deviceName}</span>
                        <span className="bar-value">{device.count}</span>
                      </div>
                      <div className="bar-container">
                        <div 
                          className="bar-fill"
                          style={{ 
                            width: `${percentage}%`,
                            backgroundColor: `hsl(${index * 60}, 70%, 50%)`
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="no-data">No device data available</div>
            )}
          </div>
        </div>

        {/* Photos by Purpose */}
        <div className="stats-section">
          <h4>Photos by Purpose</h4>
          <div className="stats-chart">
            {stats.photosByPurpose.length > 0 ? (
              <div className="chart-bars">
                {stats.photosByPurpose.map((purpose, index) => {
                  const maxCount = Math.max(...stats.photosByPurpose.map(p => p.count));
                  const percentage = (purpose.count / maxCount) * 100;
                  
                  const purposeColors = {
                    attendance: '#007bff',
                    verification: '#28a745',
                    profile: '#6f42c1',
                    manual: '#6c757d'
                  };
                  
                  return (
                    <div key={purpose.purpose} className="chart-bar">
                      <div className="bar-info">
                        <span className="bar-label">
                          {purpose.purpose.charAt(0).toUpperCase() + purpose.purpose.slice(1)}
                        </span>
                        <span className="bar-value">{purpose.count}</span>
                      </div>
                      <div className="bar-container">
                        <div 
                          className="bar-fill"
                          style={{ 
                            width: `${percentage}%`,
                            backgroundColor: purposeColors[purpose.purpose as keyof typeof purposeColors] || '#6c757d'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="no-data">No purpose data available</div>
            )}
          </div>
        </div>

        {/* System Health */}
        <div className="stats-section">
          <h4>System Health</h4>
          <div className="health-indicators">
            <div className="health-item">
              <div className="health-icon">
                {stats.faceDetectionRate > 0.8 ? '🟢' : stats.faceDetectionRate > 0.6 ? '🟡' : '🔴'}
              </div>
              <div className="health-info">
                <div className="health-label">Face Detection</div>
                <div className="health-status">
                  {stats.faceDetectionRate > 0.8 ? 'Excellent' : 
                   stats.faceDetectionRate > 0.6 ? 'Good' : 'Needs Attention'}
                </div>
              </div>
            </div>
            
            <div className="health-item">
              <div className="health-icon">
                {stats.faceRecognitionRate > 0.7 ? '🟢' : stats.faceRecognitionRate > 0.5 ? '🟡' : '🔴'}
              </div>
              <div className="health-info">
                <div className="health-label">Face Recognition</div>
                <div className="health-status">
                  {stats.faceRecognitionRate > 0.7 ? 'Excellent' : 
                   stats.faceRecognitionRate > 0.5 ? 'Good' : 'Needs Training'}
                </div>
              </div>
            </div>
            
            <div className="health-item">
              <div className="health-icon">
                {stats.averageProcessingTime < 2 ? '🟢' : stats.averageProcessingTime < 5 ? '🟡' : '🔴'}
              </div>
              <div className="health-info">
                <div className="health-label">Processing Speed</div>
                <div className="health-status">
                  {stats.averageProcessingTime < 2 ? 'Fast' : 
                   stats.averageProcessingTime < 5 ? 'Normal' : 'Slow'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraStats;