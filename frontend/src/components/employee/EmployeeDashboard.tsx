import React, { useState } from 'react';
import { useAppSelector } from '../../hooks/redux';
import ClockInOutInterface from './ClockInOutInterface';
import AttendanceHistory from './AttendanceHistory';
import './EmployeeDashboard.css';

const EmployeeDashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);
  const [activeTab, setActiveTab] = useState<'clock' | 'history'>('clock');

  return (
    <div className="employee-dashboard">
      <div className="dashboard-header">
        <h1>Employee Dashboard</h1>
        <p>Welcome, {user?.name}!</p>
        <p>Employee ID: {user?.employeeId}</p>
      </div>
      
      <div className="dashboard-tabs">
        <button
          className={`tab-button ${activeTab === 'clock' ? 'active' : ''}`}
          onClick={() => setActiveTab('clock')}
        >
          Clock In/Out
        </button>
        <button
          className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Attendance History
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'clock' && <ClockInOutInterface />}
        {activeTab === 'history' && <AttendanceHistory />}
      </div>
    </div>
  );
};

export default EmployeeDashboard;