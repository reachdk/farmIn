import React, { useState } from 'react';
import { PhotoCaptureResponse } from '../../store/api/cameraApi';

interface PhotoCardProps {
  photo: PhotoCaptureResponse;
  viewMode: 'grid' | 'list';
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onView: () => void;
  onDelete: () => void;
  onUpdateMetadata: (metadata: any) => void;
}

const PhotoCard: React.FC<PhotoCardProps> = ({
  photo,
  viewMode,
  isSelected,
  onSelect,
  onView,
  onDelete,
  onUpdateMetadata
}) => {
  const [showActions, setShowActions] = useState(false);

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

  const getPurposeColor = (purpose: string) => {
    switch (purpose) {
      case 'attendance': return '#007bff';
      case 'verification': return '#28a745';
      case 'profile': return '#6f42c1';
      case 'manual': return '#6c757d';
      default: return '#6c757d';
    }
  };

  if (viewMode === 'list') {
    return (
      <div className={`photo-card list-view ${isSelected ? 'selected' : ''}`}>
        <div className="photo-checkbox">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(e.target.checked)}
          />
        </div>
        
        <div className="photo-thumbnail">
          <img
            src={photo.thumbnailUrl}
            alt="Photo thumbnail"
            onClick={onView}
            style={{ cursor: 'pointer' }}
          />
        </div>
        
        <div className="photo-info">
          <div className="photo-id">{photo.id}</div>
          <div className="photo-timestamp">{formatDate(photo.timestamp)}</div>
          <div className="photo-metadata">
            <span className="resolution">{photo.metadata.resolution}</span>
            <span className="file-size">{formatFileSize(photo.metadata.fileSize)}</span>
            <span 
              className="purpose"
              style={{ backgroundColor: getPurposeColor(photo.metadata.purpose) }}
            >
              {photo.metadata.purpose}
            </span>
          </div>
          {photo.metadata.notes && (
            <div className="photo-notes">{photo.metadata.notes}</div>
          )}
        </div>
        
        <div className="photo-actions">
          <button onClick={onView} className="action-button view">
            👁️ View
          </button>
          <button onClick={onDelete} className="action-button delete">
            🗑️ Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`photo-card grid-view ${isSelected ? 'selected' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="photo-checkbox">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(e.target.checked)}
        />
      </div>
      
      <div className="photo-thumbnail">
        <img
          src={photo.thumbnailUrl}
          alt="Photo thumbnail"
          onClick={onView}
          style={{ cursor: 'pointer' }}
        />
        
        {showActions && (
          <div className="photo-overlay">
            <div className="overlay-actions">
              <button onClick={onView} className="overlay-button">
                👁️
              </button>
              <button onClick={onDelete} className="overlay-button delete">
                🗑️
              </button>
            </div>
          </div>
        )}
      </div>
      
      <div className="photo-details">
        <div className="photo-timestamp">{formatDate(photo.timestamp)}</div>
        <div className="photo-metadata">
          <span className="resolution">{photo.metadata.resolution}</span>
          <span 
            className="purpose"
            style={{ backgroundColor: getPurposeColor(photo.metadata.purpose) }}
          >
            {photo.metadata.purpose}
          </span>
        </div>
        {photo.metadata.notes && (
          <div className="photo-notes" title={photo.metadata.notes}>
            {photo.metadata.notes.length > 30 
              ? photo.metadata.notes.substring(0, 30) + '...'
              : photo.metadata.notes
            }
          </div>
        )}
      </div>
    </div>
  );
};

export default PhotoCard;