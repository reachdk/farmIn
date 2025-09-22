import React from 'react';
import { Employee } from '../../store/api/employeeApi';
import './EmployeeTable.css';

interface EmployeeTableProps {
  employees: Employee[];
  isLoading: boolean;
  selectedEmployees: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSelectEmployee: (employeeId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onSort: (field: string) => void;
  onEdit: (employee: Employee) => void;
  onDelete: (employeeId: string) => void;
}

const EmployeeTable: React.FC<EmployeeTableProps> = ({
  employees,
  isLoading,
  selectedEmployees,
  sortBy,
  sortOrder,
  onSelectEmployee,
  onSelectAll,
  onSort,
  onEdit,
  onDelete,
}) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin': return 'role-badge admin';
      case 'manager': return 'role-badge manager';
      default: return 'role-badge employee';
    }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const allSelected = employees.length > 0 && selectedEmployees.length === employees.length;
  const someSelected = selectedEmployees.length > 0 && selectedEmployees.length < employees.length;

  if (isLoading) {
    return (
      <div className="employee-table-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading employees...</p>
        </div>
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="employee-table-container">
        <div className="empty-state">
          <p>No employees found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="employee-table-container">
      <table className="employee-table">
        <thead>
          <tr>
            <th className="checkbox-column">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(input) => {
                  if (input) input.indeterminate = someSelected;
                }}
                onChange={(e) => onSelectAll(e.target.checked)}
              />
            </th>
            <th 
              className="sortable"
              onClick={() => onSort('employeeNumber')}
            >
              Employee # {getSortIcon('employeeNumber')}
            </th>
            <th 
              className="sortable"
              onClick={() => onSort('firstName')}
            >
              Name {getSortIcon('firstName')}
            </th>
            <th>Email</th>
            <th 
              className="sortable"
              onClick={() => onSort('role')}
            >
              Role {getSortIcon('role')}
            </th>
            <th>Status</th>
            <th 
              className="sortable"
              onClick={() => onSort('createdAt')}
            >
              Created {getSortIcon('createdAt')}
            </th>
            <th className="actions-column">Actions</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr 
              key={employee.id}
              className={selectedEmployees.includes(employee.id) ? 'selected' : ''}
            >
              <td>
                <input
                  type="checkbox"
                  checked={selectedEmployees.includes(employee.id)}
                  onChange={(e) => onSelectEmployee(employee.id, e.target.checked)}
                />
              </td>
              <td className="employee-number">
                {employee.employeeNumber}
              </td>
              <td className="employee-name">
                <div className="name-container">
                  <span className="full-name">
                    {employee.firstName} {employee.lastName}
                  </span>
                </div>
              </td>
              <td className="employee-email">
                {employee.email || <span className="no-email">No email</span>}
              </td>
              <td>
                <span className={getRoleBadgeClass(employee.role)}>
                  {employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}
                </span>
              </td>
              <td>
                <span className={`status-badge ${employee.isActive ? 'active' : 'inactive'}`}>
                  {employee.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="created-date">
                {formatDate(employee.createdAt)}
              </td>
              <td className="actions">
                <button
                  className="action-button edit"
                  onClick={() => onEdit(employee)}
                  title="Edit employee"
                >
                  ✏️
                </button>
                <button
                  className="action-button delete"
                  onClick={() => onDelete(employee.id)}
                  title="Delete employee"
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

export default EmployeeTable;