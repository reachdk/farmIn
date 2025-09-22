import React, { useState } from 'react';
import {
  useGetTimeCategoriesQuery,
  useDeleteTimeCategoryMutation,
  useGetTimeCategoryStatsQuery,
  useUpdateCategoryOrderMutation,
  TimeCategory,
} from '../../store/api/timeCategoryApi';
import TimeCategoryForm from './TimeCategoryForm';
import TimeCategoryTable from './TimeCategoryTable';
import TimeCategoryStats from './TimeCategoryStats';
import TimeCategoryPreview from './TimeCategoryPreview';
import ConflictResolution from './ConflictResolution';
import './TimeCategoryManagement.css';

const TimeCategoryManagement: React.FC = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TimeCategory | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  const {
    data: categories = [],
    isLoading,
    error,
    refetch,
  } = useGetTimeCategoriesQuery();

  const { data: stats } = useGetTimeCategoryStatsQuery();

  const [deleteCategory] = useDeleteTimeCategoryMutation();
  const [updateCategoryOrder] = useUpdateCategoryOrderMutation();

  const handleEdit = (category: TimeCategory) => {
    setEditingCategory(category);
    setShowForm(true);
  };

  const handleDelete = async (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    const confirmMessage = `Are you sure you want to delete the "${category.name}" category? This action cannot be undone.`;
    if (window.confirm(confirmMessage)) {
      try {
        await deleteCategory(categoryId).unwrap();
      } catch (error) {
        console.error('Failed to delete category:', error);
        alert('Failed to delete category. Please try again.');
      }
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingCategory(null);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingCategory(null);
    refetch();
  };

  const handleReorderCategories = async (newOrder: string[]) => {
    try {
      await updateCategoryOrder({ categoryIds: newOrder }).unwrap();
    } catch (error) {
      console.error('Failed to reorder categories:', error);
      alert('Failed to reorder categories. Please try again.');
    }
  };

  if (error) {
    return (
      <div className="time-category-management error">
        <h2>Time Category Management</h2>
        <div className="error-message">
          Failed to load time categories. Please try again.
          <button onClick={() => refetch()} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="time-category-management">
      <div className="time-category-header">
        <h2>Time Category Management</h2>
        <div className="header-actions">
          <button 
            className="preview-button"
            onClick={() => setShowPreview(true)}
          >
            Preview Assignment
          </button>
          {stats && stats.conflicts.length > 0 && (
            <button 
              className="conflicts-button warning"
              onClick={() => setShowConflicts(true)}
            >
              ⚠️ {stats.conflicts.length} Conflict{stats.conflicts.length !== 1 ? 's' : ''}
            </button>
          )}
          <button 
            className="add-category-button"
            onClick={() => setShowForm(true)}
          >
            Add Category
          </button>
        </div>
      </div>

      {stats && <TimeCategoryStats stats={stats} />}

      <div className="time-category-content">
        <TimeCategoryTable
          categories={categories}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onReorder={handleReorderCategories}
        />
      </div>

      {showForm && (
        <TimeCategoryForm
          category={editingCategory}
          existingCategories={categories}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}

      {showPreview && (
        <TimeCategoryPreview
          categories={categories}
          onClose={() => setShowPreview(false)}
        />
      )}

      {showConflicts && stats && stats.conflicts.length > 0 && (
        <ConflictResolution
          conflicts={stats.conflicts}
          categories={categories}
          onClose={() => setShowConflicts(false)}
          onResolve={refetch}
        />
      )}
    </div>
  );
};

export default TimeCategoryManagement;