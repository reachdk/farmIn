import React, { useState } from 'react';
import './BulkOperations.css';

interface BulkOperationsProps {
  selectedCount: number;
  onBulkOperation: (operation: string, newRole?: string) => void;
  onClearSelection: () => void;
}

const BulkOperations: React.FC<BulkOperationsProps> = ({
  selectedCount,
  onBulkOperation,
  onClearSelection,
}) => {
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'employee' | 'manager' | 'admin'>('employee');

  const handleRoleUpdate = () => {
    onBulkOperation('updateRole', selectedRole);
    setShowRoleSelector(false);
  };

  return (
    <div className="bulk-operations">
      <div className="bulk-operations-header">
        <span className="selection-count">
          {selectedCount} employee{selectedCount !== 1 ? 's' : ''} selected
        </span>
        <button 
          className="clear-selection"
          onClick={onClearSelection}
          title="Clear selection"
        >
          ✕
        </button>
      </div>

      <div className="bulk-actions">
        <button
          className="bulk-action-button activate"
          onClick={() => onBulkOperation('activate')}
        >
          ✅ Activate
        </button>

        <button
          className="bulk-action-button deactivate"
          onClick={() => onBulkOperation('deactivate')}
        >
          ❌ Deactivate
        </button>

        <div className="role-update-section">
          {!showRoleSelector ? (
            <button
              className="bulk-action-button update-role"
              onClick={() => setShowRoleSelector(true)}
            >
              🏷️ Update Role
            </button>
          ) : (
            <div className="role-selector">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as any)}
                className="role-select"
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
              <button
                className="apply-role-button"
                onClick={handleRoleUpdate}
              >
                Apply
              </button>
              <button
                className="cancel-role-button"
                onClick={() => setShowRoleSelector(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <button
          className="bulk-action-button delete"
          onClick={() => onBulkOperation('delete')}
        >
          🗑️ Delete
        </button>
      </div>

      <div className="bulk-operations-note">
        <small>
          Note: Bulk operations will be applied to all selected employees. 
          This action cannot be undone.
        </small>
      </div>
    </div>
  );
};

export default BulkOperations;