import React, { useState } from 'react';
import { PhotoCaptureResponse } from '../../store/api/cameraApi';

interface PhotoViewerProps {
  photo: PhotoCaptureResponse;
  onClose: () => void;
  onDelete: () => void;
  onUpdateMetadata: (metadata: any) => void;
}

const PhotoViewer: React.FC<PhotoViewerProps> = ({
  photo,
  onClose,
  onDelete,
  onUpdateMetadata
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    notes: photo.metadata.notes || '',
    purpose: photo.metadata.purpose
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSave = () => {
    onUpdateMetadata(editData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData({
      notes: photo.metadata.notes || '',
      purpose: photo.metadata.purpose
    });
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="photo-viewer-overlay" onClick={onClose} onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="photo-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="photo-viewer-header">
          <h3>Photo Details</h3>
          <div className="header-actions">
            {!isEditing && (
              <button onClick={() => setIsEditing(true)} className="edit-button">
                ✏️ Edit
              </button>
            )}
            <button onClick={onDelete} className="delete-button">
              🗑️ Delete
            </button>
            <button onClick={onClose} className="close-button">
              ✕
            </button>
          </div>
        </div>

        <div className="photo-viewer-content">
          <div className="photo-display">
            <img
              src={photo.imageUrl}
              alt="Full size photo"
              className="full-photo"
            />
          </div>

          <div className="photo-metadata">
            <div className="metadata-section">
              <h4>Basic Information</h4>
              <div className="metadata-grid">
                <div className="metadata-item">
                  <label>ID:</label>
                  <span>{photo.id}</span>
                </div>
                <div className="metadata-item">
                  <label>Timestamp:</label>
                  <span>{formatDate(photo.timestamp)}</span>
                </div>
                <div className="metadata-item">
                  <label>Resolution:</label>
                  <span>{photo.metadata.resolution}</span>
                </div>
                <div className="metadata-item">
                  <label>File Size:</label>
                  <span>{formatFileSize(photo.metadata.fileSize)}</span>
                </div>
                <div className="metadata-item">
                  <label>Format:</label>
                  <span>{photo.metadata.format.toUpperCase()}</span>
                </div>
              </div>
            </div>

            <div className="metadata-section">
              <h4>Capture Details</h4>
              <div className="metadata-grid">
                <div className="metadata-item">
                  <label>Purpose:</label>
                  {isEditing ? (
                    <select
                      value={editData.purpose}
                      onChange={(e) => setEditData({ ...editData, purpose: e.target.value })}
                    >
                      <option value="manual">Manual Capture</option>
                      <option value="attendance">Attendance Verification</option>
                      <option value="verification">Identity Verification</option>
                      <option value="profile">Profile Photo</option>
                    </select>
                  ) : (
                    <span className={`purpose-badge ${photo.metadata.purpose}`}>
                      {photo.metadata.purpose}
                    </span>
                  )}
                </div>
                {photo.metadata.location && (
                  <div className="metadata-item">
                    <label>Location:</label>
                    <span>{photo.metadata.location}</span>
                  </div>
                )}
                {photo.employeeId && (
                  <div className="metadata-item">
                    <label>Employee ID:</label>
                    <span>{photo.employeeId}</span>
                  </div>
                )}
                {photo.deviceId && (
                  <div className="metadata-item">
                    <label>Device ID:</label>
                    <span>{photo.deviceId}</span>
                  </div>
                )}
                {photo.attendanceRecordId && (
                  <div className="metadata-item">
                    <label>Attendance Record:</label>
                    <span>{photo.attendanceRecordId}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="metadata-section">
              <h4>Notes</h4>
              {isEditing ? (
                <textarea
                  value={editData.notes}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  placeholder="Add notes about this photo..."
                  rows={4}
                  className="notes-textarea"
                />
              ) : (
                <div className="notes-display">
                  {photo.metadata.notes || 'No notes available'}
                </div>
              )}
            </div>

            {photo.processing && (
              <div className="metadata-section">
                <h4>Processing Results</h4>
                <div className="metadata-grid">
                  <div className="metadata-item">
                    <label>Status:</label>
                    <span className={`status-badge ${photo.processing.status}`}>
                      {photo.processing.status}
                    </span>
                  </div>
                  <div className="metadata-item">
                    <label>Face Detected:</label>
                    <span>{photo.processing.faceDetected ? 'Yes' : 'No'}</span>
                  </div>
                  {photo.processing.confidence && (
                    <div className="metadata-item">
                      <label>Confidence:</label>
                      <span>{Math.round(photo.processing.confidence * 100)}%</span>
                    </div>
                  )}
                  {photo.processing.matchedEmployeeId && (
                    <div className="metadata-item">
                      <label>Matched Employee:</label>
                      <span>{photo.processing.matchedEmployeeId}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isEditing && (
              <div className="edit-actions">
                <button onClick={handleSave} className="save-button">
                  💾 Save Changes
                </button>
                <button onClick={handleCancel} className="cancel-button">
                  ❌ Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoViewer;