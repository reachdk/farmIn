import React, { useState, useMemo } from 'react';
import {
  useGetEmployeesQuery,
  useDeleteEmployeeMutation,
  useBulkEmployeeOperationMutation,
  useGetEmployeeStatsQuery,
  Employee,
  EmployeeFilter,
} from '../../store/api/employeeApi';
import EmployeeForm from './EmployeeForm';
import EmployeeTable from './EmployeeTable';
import EmployeeStats from './EmployeeStats';
import BulkOperations from './BulkOperations';
import './EmployeeManagement.css';

const EmployeeManagement: React.FC = () => {
  const [filters, setFilters] = useState<EmployeeFilter>({
    page: 1,
    limit: 20,
    sortBy: 'firstName',
    sortOrder: 'asc',
  });
  
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Debounced search
  const debouncedFilters = useMemo(() => ({
    ...filters,
    search: searchTerm.trim() || undefined,
  }), [filters, searchTerm]);

  const {
    data: employeeData,
    isLoading,
    error,
    refetch,
  } = useGetEmployeesQuery(debouncedFilters);

  const { data: stats } = useGetEmployeeStatsQuery();

  const [deleteEmployee] = useDeleteEmployeeMutation();
  const [bulkOperation] = useBulkEmployeeOperationMutation();

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setFilters(prev => ({ ...prev, page: 1 }));
  };

  const handleFilterChange = (newFilters: Partial<EmployeeFilter>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handleSort = (sortBy: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: sortBy as any,
      sortOrder: prev.sortBy === sortBy && prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleSelectEmployee = (employeeId: string, selected: boolean) => {
    setSelectedEmployees(prev => 
      selected 
        ? [...prev, employeeId]
        : prev.filter(id => id !== employeeId)
    );
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected && employeeData?.employees) {
      setSelectedEmployees(employeeData.employees.map(emp => emp.id));
    } else {
      setSelectedEmployees([]);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setShowForm(true);
  };

  const handleDelete = async (employeeId: string) => {
    if (window.confirm('Are you sure you want to delete this employee? This action cannot be undone.')) {
      try {
        await deleteEmployee(employeeId).unwrap();
        setSelectedEmployees(prev => prev.filter(id => id !== employeeId));
      } catch (error) {
        console.error('Failed to delete employee:', error);
        alert('Failed to delete employee. Please try again.');
      }
    }
  };

  const handleBulkOperation = async (operation: string, newRole?: string) => {
    if (selectedEmployees.length === 0) {
      alert('Please select employees first.');
      return;
    }

    const confirmMessage = `Are you sure you want to ${operation} ${selectedEmployees.length} employee(s)?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const result = await bulkOperation({
        operation: operation as any,
        employeeIds: selectedEmployees,
        newRole: newRole as any,
      }).unwrap();

      alert(`Operation completed. ${result.success} successful, ${result.failed} failed.`);
      setSelectedEmployees([]);
    } catch (error) {
      console.error('Bulk operation failed:', error);
      alert('Bulk operation failed. Please try again.');
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingEmployee(null);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingEmployee(null);
    refetch();
  };

  if (error) {
    return (
      <div className="employee-management error">
        <h2>Employee Management</h2>
        <div className="error-message">
          Failed to load employees. Please try again.
          <button onClick={() => refetch()} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="employee-management">
      <div className="employee-management-header">
        <h2>Employee Management</h2>
        <button 
          className="add-employee-button"
          onClick={() => setShowForm(true)}
        >
          Add Employee
        </button>
      </div>

      {stats && <EmployeeStats stats={stats} />}

      <div className="employee-management-controls">
        <div className="search-section">
          <input
            type="text"
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-section">
          <select
            value={filters.role || ''}
            onChange={(e) => handleFilterChange({ role: e.target.value as any || undefined })}
            className="filter-select"
          >
            <option value="">All Roles</option>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>

          <select
            value={filters.isActive === undefined ? '' : filters.isActive.toString()}
            onChange={(e) => handleFilterChange({ 
              isActive: e.target.value === '' ? undefined : e.target.value === 'true' 
            })}
            className="filter-select"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {selectedEmployees.length > 0 && (
        <BulkOperations
          selectedCount={selectedEmployees.length}
          onBulkOperation={handleBulkOperation}
          onClearSelection={() => setSelectedEmployees([])}
        />
      )}

      <EmployeeTable
        employees={employeeData?.employees || []}
        isLoading={isLoading}
        selectedEmployees={selectedEmployees}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
        onSelectEmployee={handleSelectEmployee}
        onSelectAll={handleSelectAll}
        onSort={handleSort}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {employeeData && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {((employeeData.page - 1) * employeeData.limit) + 1} to{' '}
            {Math.min(employeeData.page * employeeData.limit, employeeData.total)} of{' '}
            {employeeData.total} employees
          </div>
          <div className="pagination-controls">
            <button
              disabled={employeeData.page <= 1}
              onClick={() => handlePageChange(employeeData.page - 1)}
            >
              Previous
            </button>
            <span>Page {employeeData.page} of {employeeData.totalPages}</span>
            <button
              disabled={employeeData.page >= employeeData.totalPages}
              onClick={() => handlePageChange(employeeData.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <EmployeeForm
          employee={editingEmployee}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
};

export default EmployeeManagement;