import React, { useState, useMemo } from 'react';
import { useAppSelector } from '../../hooks/redux';
import { useGetDashboardDataQuery } from '../../store/api/attendanceApi';
import './ManagerDashboard.css';

const ManagerDashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  
  const today = new Date().toISOString().split('T')[0];
  const { 
    data: dashboardData, 
    error, 
    isLoading,
    refetch 
  } = useGetDashboardDataQuery({ date: today });

  // Filter and search employees
  const filteredEmployees = useMemo(() => {
    if (!dashboardData?.employees) return [];
    
    return dashboardData.employees.filter(employeeStatus => {
      const { employee, shiftStatus } = employeeStatus;
      const fullName = `${employee.firstName} ${employee.lastName}`.toLowerCase();
      const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || 
                           employee.employeeNumber.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || 
                           (statusFilter === 'active' && shiftStatus.isActive) ||
                           (statusFilter === 'inactive' && !shiftStatus.isActive);
      
      return matchesSearch && matchesStatus;
    });
  }, [dashboardData?.employees, searchTerm, statusFilter]);

  const formatElapsedTime = (elapsedTime?: number) => {
    if (!elapsedTime) return '0h 0m';
    const hours = Math.floor(elapsedTime / 3600);
    const minutes = Math.floor((elapsedTime % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return '--';
    return new Date(timeString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="manager-dashboard">
        <div className="loading-spinner">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="manager-dashboard">
        <div className="error-message">
          <h2>Error Loading Dashboard</h2>
          <p>Unable to load employee data. Please check your connection.</p>
          <button onClick={() => refetch()} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="manager-dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Manager Dashboard</h1>
          <p className="welcome-text">Welcome, {user?.name}!</p>
        </div>
        <div className="dashboard-stats">
          <div className="stat-card">
            <span className="stat-number">{dashboardData?.totalActive || 0}</span>
            <span className="stat-label">Active Now</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{dashboardData?.totalEmployees || 0}</span>
            <span className="stat-label">Total Employees</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{filteredEmployees.length}</span>
            <span className="stat-label">Filtered Results</span>
          </div>
        </div>
      </header>

      <div className="dashboard-controls">
        <div className="search-container">
          <input
            type="text"
            placeholder="Search by name or employee number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-container">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className="status-filter"
          >
            <option value="all">All Employees</option>
            <option value="active">Currently Active</option>
            <option value="inactive">Not Active</option>
          </select>
        </div>
        <button onClick={() => refetch()} className="refresh-button">
          Refresh
        </button>
      </div>

      <div className="employee-grid">
        {filteredEmployees.length === 0 ? (
          <div className="no-results">
            <p>No employees found matching your criteria.</p>
          </div>
        ) : (
          filteredEmployees.map(({ employee, shiftStatus, lastActivity }) => (
            <div 
              key={employee.id} 
              className={`employee-card ${shiftStatus.isActive ? 'active' : 'inactive'}`}
            >
              <div className="employee-header">
                <div className="employee-info">
                  <h3 className="employee-name">
                    {employee.firstName} {employee.lastName}
                  </h3>
                  <p className="employee-number">#{employee.employeeNumber}</p>
                </div>
                <div className={`status-indicator ${shiftStatus.isActive ? 'active' : 'inactive'}`}>
                  {shiftStatus.isActive ? 'ACTIVE' : 'INACTIVE'}
                </div>
              </div>
              
              <div className="shift-details">
                {shiftStatus.isActive && shiftStatus.currentRecord ? (
                  <>
                    <div className="shift-info">
                      <span className="label">Clock In:</span>
                      <span className="value">
                        {formatTime(shiftStatus.currentRecord.clockInTime)}
                      </span>
                    </div>
                    <div className="shift-info">
                      <span className="label">Elapsed:</span>
                      <span className="value elapsed-time">
                        {formatElapsedTime(shiftStatus.elapsedTime)}
                      </span>
                    </div>
                    {shiftStatus.currentRecord.timeCategory && (
                      <div className="shift-info">
                        <span className="label">Category:</span>
                        <span className="value category">
                          {shiftStatus.currentRecord.timeCategory}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="shift-info">
                    <span className="label">Last Activity:</span>
                    <span className="value">
                      {lastActivity ? formatTime(lastActivity) : 'No recent activity'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {dashboardData?.lastUpdated && (
        <footer className="dashboard-footer">
          <p className="last-updated">
            Last updated: {new Date(dashboardData.lastUpdated).toLocaleString()}
          </p>
        </footer>
      )}
    </div>
  );
};

export default ManagerDashboard;