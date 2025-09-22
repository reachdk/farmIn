import React, { useState, useMemo } from 'react';
import { useAppSelector } from '../../hooks/redux';
import { useGetAttendanceHistoryQuery } from '../../store/api/attendanceApi';
import { AttendanceRecord } from '../../store/api/attendanceApi';
import './AttendanceHistory.css';

interface DateFilter {
  startDate: string;
  endDate: string;
  preset: 'week' | 'month' | 'quarter' | 'custom';
}

const AttendanceHistory: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);
  const [dateFilter, setDateFilter] = useState<DateFilter>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    preset: 'month',
  });

  const { 
    data: attendanceRecords = [], 
    isLoading, 
    error 
  } = useGetAttendanceHistoryQuery(
    { 
      employeeId: user?.employeeId || '', 
      startDate: dateFilter.startDate,
      endDate: dateFilter.endDate,
    },
    { skip: !user?.employeeId }
  );

  // Calculate summary statistics
  const summary = useMemo(() => {
    const totalHours = attendanceRecords.reduce((sum, record) => {
      return sum + (record.totalHours || 0);
    }, 0);

    const categorySummary = attendanceRecords.reduce((acc, record) => {
      const category = record.timeCategory || 'Regular';
      acc[category] = (acc[category] || 0) + (record.totalHours || 0);
      return acc;
    }, {} as Record<string, number>);

    const totalDays = attendanceRecords.filter(record => record.clockOutTime).length;

    return {
      totalHours,
      totalDays,
      averageHoursPerDay: totalDays > 0 ? totalHours / totalDays : 0,
      categorySummary,
    };
  }, [attendanceRecords]);

  const handlePresetChange = (preset: DateFilter['preset']) => {
    const today = new Date();
    let startDate: Date;

    switch (preset) {
      case 'week':
        startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        return; // Don't change dates for custom
    }

    setDateFilter({
      startDate: startDate.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
      preset,
    });
  };

  const handleCustomDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setDateFilter(prev => ({
      ...prev,
      [field]: value,
      preset: 'custom',
    }));
  };

  const exportToCSV = () => {
    if (attendanceRecords.length === 0) return;

    const headers = ['Date', 'Clock In', 'Clock Out', 'Total Hours', 'Category', 'Notes'];
    const csvData = [
      headers.join(','),
      ...attendanceRecords.map(record => [
        new Date(record.clockInTime).toLocaleDateString(),
        new Date(record.clockInTime).toLocaleTimeString(),
        record.clockOutTime ? new Date(record.clockOutTime).toLocaleTimeString() : 'In Progress',
        record.totalHours?.toFixed(2) || '0.00',
        record.timeCategory || 'Regular',
        record.notes || '',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance-history-${user?.employeeId}-${dateFilter.startDate}-to-${dateFilter.endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const formatTime = (dateString: string): string => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="attendance-history">
        <div className="loading">Loading attendance history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="attendance-history">
        <div className="error">Failed to load attendance history. Please try again.</div>
      </div>
    );
  }

  return (
    <div className="attendance-history">
      <div className="history-header">
        <h2>Attendance History</h2>
        <button 
          className="export-btn"
          onClick={exportToCSV}
          disabled={attendanceRecords.length === 0}
        >
          Export CSV
        </button>
      </div>

      <div className="date-filters">
        <div className="preset-filters">
          <button
            className={`preset-btn ${dateFilter.preset === 'week' ? 'active' : ''}`}
            onClick={() => handlePresetChange('week')}
          >
            Last 7 Days
          </button>
          <button
            className={`preset-btn ${dateFilter.preset === 'month' ? 'active' : ''}`}
            onClick={() => handlePresetChange('month')}
          >
            Last 30 Days
          </button>
          <button
            className={`preset-btn ${dateFilter.preset === 'quarter' ? 'active' : ''}`}
            onClick={() => handlePresetChange('quarter')}
          >
            Last 90 Days
          </button>
        </div>
        
        <div className="custom-date-range">
          <label>
            From:
            <input
              type="date"
              value={dateFilter.startDate}
              onChange={(e) => handleCustomDateChange('startDate', e.target.value)}
              max={dateFilter.endDate}
            />
          </label>
          <label>
            To:
            <input
              type="date"
              value={dateFilter.endDate}
              onChange={(e) => handleCustomDateChange('endDate', e.target.value)}
              min={dateFilter.startDate}
              max={new Date().toISOString().split('T')[0]}
            />
          </label>
        </div>
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-value">{summary.totalHours.toFixed(1)}</div>
          <div className="summary-label">Total Hours</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">{summary.totalDays}</div>
          <div className="summary-label">Days Worked</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">{summary.averageHoursPerDay.toFixed(1)}</div>
          <div className="summary-label">Avg Hours/Day</div>
        </div>
      </div>

      {Object.keys(summary.categorySummary).length > 1 && (
        <div className="category-breakdown">
          <h3>Hours by Category</h3>
          <div className="category-list">
            {Object.entries(summary.categorySummary).map(([category, hours]) => (
              <div key={category} className="category-item">
                <span className="category-name">{category}</span>
                <span className="category-hours">{hours.toFixed(1)}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="records-table">
        {attendanceRecords.length === 0 ? (
          <div className="no-records">
            No attendance records found for the selected date range.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Total Hours</th>
                <th>Category</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRecords.map((record) => (
                <tr key={record.id} className={`record-row ${record.syncStatus}`}>
                  <td className="date-cell">
                    {formatDate(record.clockInTime)}
                  </td>
                  <td className="time-cell">
                    {formatTime(record.clockInTime)}
                  </td>
                  <td className="time-cell">
                    {record.clockOutTime ? formatTime(record.clockOutTime) : (
                      <span className="in-progress">In Progress</span>
                    )}
                  </td>
                  <td className="hours-cell">
                    {record.totalHours ? `${record.totalHours.toFixed(2)}h` : '-'}
                  </td>
                  <td className="category-cell">
                    <span className={`category-tag ${record.timeCategory?.toLowerCase() || 'regular'}`}>
                      {record.timeCategory || 'Regular'}
                    </span>
                  </td>
                  <td className="status-cell">
                    <span className={`sync-status ${record.syncStatus}`}>
                      {record.syncStatus === 'synced' ? '✓' : 
                       record.syncStatus === 'pending' ? '⏳' : '⚠️'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AttendanceHistory;