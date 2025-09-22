import React, { useState } from 'react';
import { useAppSelector } from '../../hooks/redux';
import EmployeeManagement from './EmployeeManagement';
import TimeCategoryManagement from './TimeCategoryManagement';
import SystemMonitoring from './SystemMonitoring';
import './AdminDashboard.css';

type AdminTab = 'overview' | 'employees' | 'categories' | 'system';

const AdminDashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="admin-overview">
            <h2>System Overview</h2>
            <p>Welcome, {user?.name}!</p>
            <p>Role: {user?.role}</p>
            <div className="overview-cards">
              <div className="overview-card">
                <h3>Employee Management</h3>
                <p>Manage employee records, roles, and permissions</p>
                <button onClick={() => setActiveTab('employees')}>
                  Go to Employees
                </button>
              </div>
              <div className="overview-card">
                <h3>Time Categories</h3>
                <p>Configure work time categories and thresholds</p>
                <button onClick={() => setActiveTab('categories')}>
                  Go to Categories
                </button>
              </div>
              <div className="overview-card">
                <h3>System Monitoring</h3>
                <p>Monitor sync status and system health</p>
                <button onClick={() => setActiveTab('system')}>
                  Go to System
                </button>
              </div>
            </div>
          </div>
        );
      case 'employees':
        return <EmployeeManagement />;
      case 'categories':
        return <TimeCategoryManagement />;
      case 'system':
        return <SystemMonitoring />;
      default:
        return null;
    }
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-nav">
        <button
          className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`nav-tab ${activeTab === 'employees' ? 'active' : ''}`}
          onClick={() => setActiveTab('employees')}
        >
          Employees
        </button>
        <button
          className={`nav-tab ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          Time Categories
        </button>
        <button
          className={`nav-tab ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          System
        </button>
      </div>
      
      <div className="admin-content">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default AdminDashboard;