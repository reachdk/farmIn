import React from 'react';
import { TimeCategory } from '../../store/api/timeCategoryApi';
import './TimeCategoryTable.css';

interface TimeCategoryTableProps {
  categories: TimeCategory[];
  isLoading: boolean;
  onEdit: (category: TimeCategory) => void;
  onDelete: (categoryId: string) => void;
  onReorder: (newOrder: string[]) => void;
}

const TimeCategoryTable: React.FC<TimeCategoryTableProps> = ({
  categories,
  isLoading,
  onEdit,
  onDelete,
  onReorder,
}) => {
  const formatHours = (hours: number) => {
    return hours % 1 === 0 ? hours.toString() : hours.toFixed(2);
  };

  const formatRange = (minHours: number, maxHours?: number) => {
    if (maxHours) {
      return `${formatHours(minHours)} - ${formatHours(maxHours)} hours`;
    }
    return `${formatHours(minHours)}+ hours`;
  };

  if (isLoading) {
    return (
      <div className="time-category-table-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading time categories...</p>
        </div>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="time-category-table-container">
        <div className="empty-state">
          <p>No time categories found. Create your first category to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="time-category-table-container">
      <table className="time-category-table">
        <thead>
          <tr>
            <th className="color-column">Color</th>
            <th className="name-column">Name</th>
            <th className="range-column">Hour Range</th>
            <th className="multiplier-column">Pay Multiplier</th>
            <th className="status-column">Status</th>
            <th className="created-column">Created</th>
            <th className="actions-column">Actions</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr 
              key={category.id}
              className={!category.isActive ? 'inactive' : ''}
            >
              <td className="color-cell">
                <div 
                  className="color-indicator"
                  style={{ backgroundColor: category.color }}
                  title={category.color}
                />
              </td>
              <td className="name-cell">
                <span className="category-name">{category.name}</span>
              </td>
              <td className="range-cell">
                {formatRange(category.minHours, category.maxHours)}
              </td>
              <td className="multiplier-cell">
                <span className="multiplier-value">
                  {category.payMultiplier}x
                </span>
                {category.payMultiplier > 1 && (
                  <span className="multiplier-label">
                    ({category.payMultiplier === 1.5 ? 'Time & Half' : 
                      category.payMultiplier === 2 ? 'Double Time' : 
                      `${category.payMultiplier}x Pay`})
                  </span>
                )}
              </td>
              <td className="status-cell">
                <span className={`status-badge ${category.isActive ? 'active' : 'inactive'}`}>
                  {category.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="created-cell">
                {new Date(category.createdAt).toLocaleDateString()}
              </td>
              <td className="actions-cell">
                <button
                  className="action-button edit"
                  onClick={() => onEdit(category)}
                  title="Edit category"
                >
                  ✏️
                </button>
                <button
                  className="action-button delete"
                  onClick={() => onDelete(category.id)}
                  title="Delete category"
                >
                  🗑️
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TimeCategoryTable;