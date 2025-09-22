import React from 'react';
import { PhotoGalleryFilter } from '../../store/api/cameraApi';

interface PhotoFiltersProps {
  filters: PhotoGalleryFilter;
  onFilterChange: (filters: Partial<PhotoGalleryFilter>) => void;
}

const PhotoFilters: React.FC<PhotoFiltersProps> = ({ filters, onFilterChange }) => {
  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    onFilterChange({ [field]: value || undefined });
  };

  const handleSelectChange = (field: keyof PhotoGalleryFilter, value: string) => {
    onFilterChange({ [field]: value || undefined });
  };

  const clearFilters = () => {
    onFilterChange({
      employeeId: undefined,
      deviceId: undefined,
      startDate: undefined,
      endDate: undefined,
      purpose: undefined,
      hasAttendanceRecord: undefined,
      sortBy: 'timestamp',
      sortOrder: 'desc'
    });
  };

  const hasActiveFilters = !!(
    filters.employeeId ||
    filters.deviceId ||
    filters.startDate ||
    filters.endDate ||
    filters.purpose ||
    filters.hasAttendanceRecord !== undefined
  );

  return (
    <div className="photo-filters">
      <div className="filters-row">
        <div className="filter-group">
          <label>Date Range:</label>
          <div className="date-range">
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              placeholder="Start date"
            />
            <span className="date-separator">to</span>
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              placeholder="End date"
            />
          </div>
        </div>

        <div className="filter-group">
          <label>Purpose:</label>
          <select
            value={filters.purpose || ''}
            onChange={(e) => handleSelectChange('purpose', e.target.value)}
          >
            <option value="">All purposes</option>
            <option value="attendance">Attendance</option>
            <option value="verification">Verification</option>
            <option value="profile">Profile</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Employee ID:</label>
          <input
            type="text"
            value={filters.employeeId || ''}
            onChange={(e) => handleSelectChange('employeeId', e.target.value)}
            placeholder="Enter employee ID"
          />
        </div>

        <div className="filter-group">
          <label>Device ID:</label>
          <input
            type="text"
            value={filters.deviceId || ''}
            onChange={(e) => handleSelectChange('deviceId', e.target.value)}
            placeholder="Enter device ID"
          />
        </div>
      </div>

      <div className="filters-row">
        <div className="filter-group">
          <label>Attendance Record:</label>
          <select
            value={
              filters.hasAttendanceRecord === undefined 
                ? '' 
                : filters.hasAttendanceRecord.toString()
            }
            onChange={(e) => {
              const value = e.target.value;
              onFilterChange({
                hasAttendanceRecord: value === '' ? undefined : value === 'true'
              });
            }}
          >
            <option value="">All photos</option>
            <option value="true">With attendance record</option>
            <option value="false">Without attendance record</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Sort by:</label>
          <select
            value={filters.sortBy || 'timestamp'}
            onChange={(e) => handleSelectChange('sortBy', e.target.value)}
          >
            <option value="timestamp">Date/Time</option>
            <option value="employeeName">Employee Name</option>
            <option value="deviceName">Device Name</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Order:</label>
          <select
            value={filters.sortOrder || 'desc'}
            onChange={(e) => handleSelectChange('sortOrder', e.target.value)}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Per page:</label>
          <select
            value={filters.limit || 24}
            onChange={(e) => handleSelectChange('limit', parseInt(e.target.value))}
          >
            <option value={12}>12</option>
            <option value={24}>24</option>
            <option value={48}>48</option>
            <option value={96}>96</option>
          </select>
        </div>

        <div className="filter-actions">
          {hasActiveFilters && (
            <button onClick={clearFilters} className="clear-filters-button">
              🗑️ Clear Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhotoFilters;