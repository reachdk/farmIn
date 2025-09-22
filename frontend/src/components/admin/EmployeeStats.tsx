import React from 'react';
import './EmployeeStats.css';

interface EmployeeStatsProps {
  stats: {
    total: number;
    active: number;
    inactive: number;
    byRole: {
      employee: number;
      manager: number;
      admin: number;
    };
  };
}

const EmployeeStats: React.FC<EmployeeStatsProps> = ({ stats }) => {
  const activePercentage = stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

  return (
    <div className="employee-stats">
      <div className="stats-grid">
        <div className="stat-card total">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <div className="stat-number">{stats.total}</div>
            <div className="stat-label">Total Employees</div>
          </div>
        </div>

        <div className="stat-card active">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-number">{stats.active}</div>
            <div className="stat-label">Active</div>
            <div className="stat-percentage">{activePercentage}%</div>
          </div>
        </div>

        <div className="stat-card inactive">
          <div className="stat-icon">❌</div>
          <div className="stat-content">
            <div className="stat-number">{stats.inactive}</div>
            <div className="stat-label">Inactive</div>
            <div className="stat-percentage">{100 - activePercentage}%</div>
          </div>
        </div>

        <div className="stat-card roles">
          <div className="stat-icon">🏷️</div>
          <div className="stat-content">
            <div className="stat-label">By Role</div>
            <div className="role-breakdown">
              <div className="role-item">
                <span className="role-badge employee">Employee</span>
                <span className="role-count">{stats.byRole.employee}</span>
              </div>
              <div className="role-item">
                <span className="role-badge manager">Manager</span>
                <span className="role-count">{stats.byRole.manager}</span>
              </div>
              <div className="role-item">
                <span className="role-badge admin">Admin</span>
                <span className="role-count">{stats.byRole.admin}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeStats;