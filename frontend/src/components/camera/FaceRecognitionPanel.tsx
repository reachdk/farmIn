import React, { useState } from 'react';
import {
  useGetFaceRecognitionStatusQuery,
  useTrainFaceRecognitionMutation,
  useGetAllEmployeesQuery,
} from '../../store/api/cameraApi';

const FaceRecognitionPanel: React.FC = () => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [forceRetrain, setForceRetrain] = useState(false);

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useGetFaceRecognitionStatusQuery();
  const { data: employees = [] } = useGetAllEmployeesQuery();
  const [trainModel, { isLoading: isTraining }] = useTrainFaceRecognitionMutation();

  const handleTrainModel = async () => {
    try {
      const result = await trainModel({
        employeeId: selectedEmployeeId || undefined,
        forceRetrain
      }).unwrap();
      
      alert(result.message);
      refetchStatus();
    } catch (error) {
      console.error('Training failed:', error);
      alert('Face recognition training failed. Please try again.');
    }
  };

  const getStatusColor = (enabled: boolean, accuracy: number) => {
    if (!enabled) return '#6c757d';
    if (accuracy > 0.8) return '#28a745';
    if (accuracy > 0.6) return '#ffc107';
    return '#dc3545';
  };

  const getStatusText = (enabled: boolean, accuracy: number) => {
    if (!enabled) return 'Disabled';
    if (accuracy > 0.8) return 'Excellent';
    if (accuracy > 0.6) return 'Good';
    if (accuracy > 0.3) return 'Needs Training';
    return 'Poor';
  };

  if (statusLoading) {
    return (
      <div className="face-recognition-panel loading">
        <div className="loading-spinner"></div>
        <p>Loading face recognition status...</p>
      </div>
    );
  }

  return (
    <div className="face-recognition-panel">
      <div className="panel-header">
        <h3>Face Recognition System</h3>
        <button onClick={() => refetchStatus()} className="refresh-button">
          🔄 Refresh Status
        </button>
      </div>

      {status && (
        <div className="status-section">
          <h4>System Status</h4>
          <div className="status-grid">
            <div className="status-card">
              <div className="status-icon">
                {status.enabled ? '🟢' : '⚫'}
              </div>
              <div className="status-info">
                <div className="status-label">System Status</div>
                <div className="status-value">
                  {status.enabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>
            </div>

            <div className="status-card">
              <div className="status-icon">👥</div>
              <div className="status-info">
                <div className="status-label">Trained Employees</div>
                <div className="status-value">{status.trainedEmployees}</div>
              </div>
            </div>

            <div className="status-card">
              <div className="status-icon">🎯</div>
              <div className="status-info">
                <div className="status-label">Accuracy</div>
                <div 
                  className="status-value"
                  style={{ color: getStatusColor(status.enabled, status.accuracy) }}
                >
                  {Math.round(status.accuracy * 100)}% - {getStatusText(status.enabled, status.accuracy)}
                </div>
              </div>
            </div>

            <div className="status-card">
              <div className="status-icon">📅</div>
              <div className="status-info">
                <div className="status-label">Last Training</div>
                <div className="status-value">
                  {status.lastTraining 
                    ? new Date(status.lastTraining).toLocaleString()
                    : 'Never'
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="training-section">
        <h4>Model Training</h4>
        <div className="training-form">
          <div className="form-group">
            <label>Employee (Optional):</label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              disabled={isTraining}
            >
              <option value="">Train all employees</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.employeeNumber})
                </option>
              ))}
            </select>
            <small>Leave empty to train models for all employees with photos</small>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={forceRetrain}
                onChange={(e) => setForceRetrain(e.target.checked)}
                disabled={isTraining}
              />
              Force retrain existing models
            </label>
            <small>Check this to retrain models even if they already exist</small>
          </div>

          <div className="form-actions">
            <button
              onClick={handleTrainModel}
              disabled={isTraining || !status?.enabled}
              className="train-button"
            >
              {isTraining ? '🔄 Training...' : '🎯 Start Training'}
            </button>
          </div>

          {!status?.enabled && (
            <div className="warning-message">
              <span className="warning-icon">⚠️</span>
              Face recognition is currently disabled. Enable it in system settings to use this feature.
            </div>
          )}
        </div>
      </div>

      <div className="info-section">
        <h4>How Face Recognition Works</h4>
        <div className="info-content">
          <div className="info-item">
            <div className="info-icon">📸</div>
            <div className="info-text">
              <strong>Photo Collection:</strong> The system uses profile and verification photos 
              to train recognition models for each employee.
            </div>
          </div>
          
          <div className="info-item">
            <div className="info-icon">🧠</div>
            <div className="info-text">
              <strong>Model Training:</strong> Machine learning models are created to identify 
              unique facial features for each employee.
            </div>
          </div>
          
          <div className="info-item">
            <div className="info-icon">🔍</div>
            <div className="info-text">
              <strong>Recognition:</strong> When new photos are captured, the system attempts 
              to match faces against trained employee models.
            </div>
          </div>
          
          <div className="info-item">
            <div className="info-icon">📊</div>
            <div className="info-text">
              <strong>Accuracy:</strong> Recognition accuracy improves with more training photos 
              and regular model updates.
            </div>
          </div>
        </div>
      </div>

      <div className="requirements-section">
        <h4>Training Requirements</h4>
        <ul className="requirements-list">
          <li>Each employee needs at least 2-3 clear profile photos</li>
          <li>Photos should show the face clearly with good lighting</li>
          <li>Different angles and expressions improve accuracy</li>
          <li>Regular retraining helps maintain accuracy over time</li>
          <li>System requires face recognition to be enabled in settings</li>
        </ul>
      </div>
    </div>
  );
};

export default FaceRecognitionPanel;