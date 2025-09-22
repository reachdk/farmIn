import React, { useState, useRef, useEffect } from 'react';
import {
  CameraDevice,
  useCapturePhotoMutation,
  useCaptureMultiplePhotosMutation,
  useGetAllEmployeesQuery,
} from '../../store/api/cameraApi';
import './CameraCapture.css';

interface CameraCaptureProps {
  devices: CameraDevice[];
  selectedDevice: CameraDevice | null;
  onDeviceSelect: (device: CameraDevice) => void;
}

interface CaptureSettings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  format: 'jpeg' | 'png' | 'webp';
  employeeId?: string;
  purpose: 'attendance' | 'verification' | 'profile' | 'manual';
  notes: string;
  batchCount: number;
  batchInterval: number;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({
  devices,
  selectedDevice,
  onDeviceSelect,
}) => {
  const [settings, setSettings] = useState<CaptureSettings>({
    quality: 'high',
    format: 'jpeg',
    purpose: 'manual',
    notes: '',
    batchCount: 1,
    batchInterval: 1000,
  });

  const [preview, setPreview] = useState<string | null>(null);
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [capturePhoto, { isLoading: isCapturing }] = useCapturePhotoMutation();
  const [captureMultiple, { isLoading: isBatchCapturing }] = useCaptureMultiplePhotosMutation();
  
  // Mock employee query - in real implementation this would come from employee API
  const employees = [
    { id: '1', name: 'John Doe', employeeNumber: 'EMP001' },
    { id: '2', name: 'Jane Smith', employeeNumber: 'EMP002' },
  ];

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  const startPreview = async () => {
    if (!selectedDevice) {
      alert('Please select a camera device first');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: selectedDevice.deviceId,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsPreviewActive(true);
      }
    } catch (error) {
      console.error('Failed to start camera preview:', error);
      alert('Failed to access camera. Please check permissions and device availability.');
    }
  };

  const stopPreview = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsPreviewActive(false);
    setPreview(null);
  };

  const captureFromPreview = () => {
    if (!videoRef.current || !canvasRef.current) return null;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    if (!context) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    return canvas.toDataURL(`image/${settings.format}`, 
      settings.quality === 'low' ? 0.6 : 
      settings.quality === 'medium' ? 0.8 : 
      settings.quality === 'high' ? 0.9 : 1.0
    );
  };

  const handleSingleCapture = async () => {
    if (!selectedDevice) {
      alert('Please select a camera device first');
      return;
    }

    // Capture from preview if active, otherwise use API
    let previewData = null;
    if (isPreviewActive) {
      previewData = captureFromPreview();
      setPreview(previewData);
    }

    try {
      const result = await capturePhoto({
        deviceId: selectedDevice.id,
        employeeId: settings.employeeId,
        settings: {
          quality: settings.quality,
          format: settings.format,
        },
        metadata: {
          purpose: settings.purpose,
          notes: settings.notes,
          location: selectedDevice.name,
        },
      }).unwrap();

      alert(`Photo captured successfully! ID: ${result.id}`);
      
      // Show captured photo if no preview
      if (!previewData && result.thumbnailUrl) {
        setPreview(result.thumbnailUrl);
      }
    } catch (error) {
      console.error('Photo capture failed:', error);
      alert('Failed to capture photo. Please try again.');
    }
  };

  const handleBatchCapture = async () => {
    if (!selectedDevice) {
      alert('Please select a camera device first');
      return;
    }

    if (settings.batchCount < 2 || settings.batchCount > 10) {
      alert('Batch count must be between 2 and 10');
      return;
    }

    try {
      const result = await captureMultiple({
        deviceId: selectedDevice.id,
        count: settings.batchCount,
        interval: settings.batchInterval,
        employeeId: settings.employeeId,
      }).unwrap();

      alert(`Batch capture completed! ${result.length} photos captured.`);
      
      // Show first photo as preview
      if (result.length > 0 && result[0].thumbnailUrl) {
        setPreview(result[0].thumbnailUrl);
      }
    } catch (error) {
      console.error('Batch capture failed:', error);
      alert('Failed to capture batch photos. Please try again.');
    }
  };

  const handleSettingChange = (field: keyof CaptureSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="camera-capture">
      <div className="capture-layout">
        <div className="capture-main">
          <div className="device-selector">
            <label>Select Camera Device:</label>
            <select
              value={selectedDevice?.id || ''}
              onChange={(e) => {
                const device = devices.find(d => d.id === e.target.value);
                if (device) onDeviceSelect(device);
              }}
            >
              <option value="">Choose a camera...</option>
              {devices.map(device => (
                <option key={device.id} value={device.id}>
                  {device.name} ({device.resolution}) - {device.status}
                </option>
              ))}
            </select>
          </div>

          <div className="preview-section">
            <div className="preview-container">
              {isPreviewActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="camera-preview"
                />
              ) : preview ? (
                <img src={preview} alt="Captured photo" className="photo-preview" />
              ) : (
                <div className="preview-placeholder">
                  <span>📷</span>
                  <p>Camera preview will appear here</p>
                </div>
              )}
            </div>

            <div className="preview-controls">
              {!isPreviewActive ? (
                <button
                  onClick={startPreview}
                  disabled={!selectedDevice}
                  className="preview-button start"
                >
                  Start Preview
                </button>
              ) : (
                <button
                  onClick={stopPreview}
                  className="preview-button stop"
                >
                  Stop Preview
                </button>
              )}
            </div>
          </div>

          <div className="capture-controls">
            <button
              onClick={handleSingleCapture}
              disabled={!selectedDevice || isCapturing}
              className="capture-button single"
            >
              {isCapturing ? 'Capturing...' : '📸 Capture Photo'}
            </button>

            <button
              onClick={handleBatchCapture}
              disabled={!selectedDevice || isBatchCapturing || settings.batchCount < 2}
              className="capture-button batch"
            >
              {isBatchCapturing ? 'Capturing Batch...' : `📷 Capture ${settings.batchCount} Photos`}
            </button>
          </div>
        </div>

        <div className="capture-settings">
          <h3>Capture Settings</h3>

          <div className="setting-group">
            <label>Quality:</label>
            <select
              value={settings.quality}
              onChange={(e) => handleSettingChange('quality', e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="ultra">Ultra</option>
            </select>
          </div>

          <div className="setting-group">
            <label>Format:</label>
            <select
              value={settings.format}
              onChange={(e) => handleSettingChange('format', e.target.value)}
            >
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
            </select>
          </div>

          <div className="setting-group">
            <label>Purpose:</label>
            <select
              value={settings.purpose}
              onChange={(e) => handleSettingChange('purpose', e.target.value)}
            >
              <option value="manual">Manual Capture</option>
              <option value="attendance">Attendance Verification</option>
              <option value="verification">Identity Verification</option>
              <option value="profile">Profile Photo</option>
            </select>
          </div>

          <div className="setting-group">
            <label>Employee (Optional):</label>
            <select
              value={settings.employeeId || ''}
              onChange={(e) => handleSettingChange('employeeId', e.target.value || undefined)}
            >
              <option value="">No specific employee</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.employeeNumber})
                </option>
              ))}
            </select>
          </div>

          <div className="setting-group">
            <label>Notes:</label>
            <textarea
              value={settings.notes}
              onChange={(e) => handleSettingChange('notes', e.target.value)}
              placeholder="Optional notes about this capture..."
              rows={3}
            />
          </div>

          <div className="batch-settings">
            <h4>Batch Capture Settings</h4>
            
            <div className="setting-group">
              <label>Number of Photos:</label>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.batchCount}
                onChange={(e) => handleSettingChange('batchCount', parseInt(e.target.value))}
              />
            </div>

            <div className="setting-group">
              <label>Interval (ms):</label>
              <input
                type="number"
                min="500"
                max="5000"
                step="100"
                value={settings.batchInterval}
                onChange={(e) => handleSettingChange('batchInterval', parseInt(e.target.value))}
              />
            </div>
          </div>

          {selectedDevice && (
            <div className="device-info">
              <h4>Selected Device</h4>
              <p><strong>Name:</strong> {selectedDevice.name}</p>
              <p><strong>Resolution:</strong> {selectedDevice.resolution}</p>
              <p><strong>Status:</strong> {selectedDevice.status}</p>
              <p><strong>Capabilities:</strong></p>
              <ul>
                {Object.entries(selectedDevice.capabilities)
                  .filter(([_, enabled]) => enabled)
                  .map(([capability]) => (
                    <li key={capability}>{capability.replace(/([A-Z])/g, ' $1').toLowerCase()}</li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default CameraCapture;