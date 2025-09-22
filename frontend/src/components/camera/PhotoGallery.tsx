import React, { useState } from 'react';
import {
  useGetPhotosQuery,
  useDeletePhotoMutation,
  useBulkDeletePhotosMutation,
  useUpdatePhotoMetadataMutation,
  PhotoGalleryFilter,
  PhotoCaptureResponse,
} from '../../store/api/cameraApi';
import PhotoCard from './PhotoCard';
import PhotoViewer from './PhotoViewer';
import PhotoFilters from './PhotoFilters';
import './PhotoGallery.css';

const PhotoGallery: React.FC = () => {
  const [filters, setFilters] = useState<PhotoGalleryFilter>({
    page: 1,
    limit: 24,
    sortBy: 'timestamp',
    sortOrder: 'desc',
  });

  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [viewingPhoto, setViewingPhoto] = useState<PhotoCaptureResponse | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const {
    data: photoData,
    isLoading,
    error,
    refetch,
  } = useGetPhotosQuery(filters);

  const [deletePhoto] = useDeletePhotoMutation();
  const [bulkDeletePhotos] = useBulkDeletePhotosMutation();
  const [updatePhotoMetadata] = useUpdatePhotoMetadataMutation();

  const handleFilterChange = (newFilters: Partial<PhotoGalleryFilter>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handlePhotoSelect = (photoId: string, selected: boolean) => {
    setSelectedPhotos(prev => 
      selected 
        ? [...prev, photoId]
        : prev.filter(id => id !== photoId)
    );
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected && photoData?.photos) {
      setSelectedPhotos(photoData.photos.map(photo => photo.id));
    } else {
      setSelectedPhotos([]);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (window.confirm('Are you sure you want to delete this photo? This action cannot be undone.')) {
      try {
        await deletePhoto(photoId).unwrap();
        setSelectedPhotos(prev => prev.filter(id => id !== photoId));
      } catch (error) {
        console.error('Failed to delete photo:', error);
        alert('Failed to delete photo. Please try again.');
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPhotos.length === 0) {
      alert('Please select photos to delete');
      return;
    }

    const confirmMessage = `Are you sure you want to delete ${selectedPhotos.length} photo(s)? This action cannot be undone.`;
    if (window.confirm(confirmMessage)) {
      try {
        const result = await bulkDeletePhotos(selectedPhotos).unwrap();
        alert(`Deleted ${result.deleted} photos. ${result.failed} failed.`);
        setSelectedPhotos([]);
        refetch();
      } catch (error) {
        console.error('Bulk delete failed:', error);
        alert('Failed to delete photos. Please try again.');
      }
    }
  };

  const handleUpdateMetadata = async (photoId: string, metadata: any) => {
    try {
      await updatePhotoMetadata({ photoId, metadata }).unwrap();
      refetch();
    } catch (error) {
      console.error('Failed to update photo metadata:', error);
      alert('Failed to update photo metadata. Please try again.');
    }
  };

  if (error) {
    return (
      <div className="photo-gallery error">
        <h3>Photo Gallery</h3>
        <div className="error-message">
          Failed to load photos. Please try again.
          <button onClick={() => refetch()} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="photo-gallery">
      <div className="gallery-header">
        <h3>Photo Gallery</h3>
        <div className="header-actions">
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
          
          {selectedPhotos.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="bulk-delete-button"
            >
              🗑️ Delete Selected ({selectedPhotos.length})
            </button>
          )}
        </div>
      </div>

      <PhotoFilters
        filters={filters}
        onFilterChange={handleFilterChange}
      />

      {isLoading ? (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading photos...</p>
        </div>
      ) : photoData?.photos.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📷</span>
          <p>No photos found matching your filters.</p>
          <p>Start by capturing some photos from the Capture tab.</p>
        </div>
      ) : (
        <>
          <div className="selection-controls">
            <label className="select-all-label">
              <input
                type="checkbox"
                checked={photoData?.photos.length > 0 && selectedPhotos.length === photoData.photos.length}
                onChange={(e) => handleSelectAll(e.target.checked)}
              />
              Select All ({photoData?.photos.length || 0} photos)
            </label>
          </div>

          <div className={`photos-container ${viewMode}`}>
            {photoData?.photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                viewMode={viewMode}
                isSelected={selectedPhotos.includes(photo.id)}
                onSelect={(selected) => handlePhotoSelect(photo.id, selected)}
                onView={() => setViewingPhoto(photo)}
                onDelete={() => handleDeletePhoto(photo.id)}
                onUpdateMetadata={(metadata) => handleUpdateMetadata(photo.id, metadata)}
              />
            ))}
          </div>

          {photoData && (
            <div className="pagination">
              <div className="pagination-info">
                Showing {((photoData.page - 1) * photoData.limit) + 1} to{' '}
                {Math.min(photoData.page * photoData.limit, photoData.total)} of{' '}
                {photoData.total} photos
              </div>
              <div className="pagination-controls">
                <button
                  disabled={photoData.page <= 1}
                  onClick={() => handlePageChange(photoData.page - 1)}
                >
                  Previous
                </button>
                <span>Page {photoData.page} of {photoData.totalPages}</span>
                <button
                  disabled={photoData.page >= photoData.totalPages}
                  onClick={() => handlePageChange(photoData.page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {viewingPhoto && (
        <PhotoViewer
          photo={viewingPhoto}
          onClose={() => setViewingPhoto(null)}
          onDelete={() => {
            handleDeletePhoto(viewingPhoto.id);
            setViewingPhoto(null);
          }}
          onUpdateMetadata={(metadata) => {
            handleUpdateMetadata(viewingPhoto.id, metadata);
            setViewingPhoto(null);
          }}
        />
      )}
    </div>
  );
};

export default PhotoGallery;