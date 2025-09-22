import React, { useState, useMemo } from 'react';
import { 
  useGetAttendanceReportQuery, 
  useExportAttendanceReportMutation,
  useGetAllEmployeesQuery 
} from '../../store/api/attendanceApi';
import './AttendanceReports.css';

const AttendanceReports: React.FC = () => {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    endDate: new Date().toISOString().split('T')[0], // today
  });
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [reportFormat, setReportFormat] = useState<'summary' | 'detailed'>('summary');
  const [showFilters, setShowFilters] = useState(false);

  const { data: employees } = useGetAllEmployeesQuery();
  const { 
    data: reportData, 
    error: reportError, 
    isLoading: isLoadingReport,
    refetch: refetchReport 
  } = useGetAttendanceReportQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    employeeIds: selectedEmployees.length > 0 ? selectedEmployees : undefined,
    format: reportFormat,
  });

  const [exportReport, { isLoading: isExporting }] = useExportAttendanceReportMutation();

  const filteredEmployees = useMemo(() => {
    if (!reportData?.employees) return [];
    return reportData.employees.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [reportData?.employees]);

  const handleDateRangeChange = (field: 'startDate' | 'endDate', value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const handleEmployeeSelection = (employeeId: string, selected: boolean) => {
    setSelectedEmployees(prev => 
      selected 
        ? [...prev, employeeId]
        : prev.filter(id => id !== employeeId)
    );
  };

  const handleSelectAllEmployees = (selected: boolean) => {
    if (selected && employees) {
      setSelectedEmployees(employees.map(emp => emp.id));
    } else {
      setSelectedEmployees([]);
    }
  };

  const handleExport = async (exportType: 'csv' | 'excel' | 'pdf') => {
    try {
      const result = await exportReport({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        employeeIds: selectedEmployees.length > 0 ? selectedEmployees : undefined,
        format: reportFormat,
        exportType,
      }).unwrap();

      // Create download link
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Export failed:', error);
      // Handle error (show toast notification, etc.)
    }
  };

  const formatHours = (hours: number) => {
    return `${hours.toFixed(1)}h`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (isLoadingReport) {
    return (
      <div className="attendance-reports">
        <div className="loading-spinner">Loading report...</div>
      </div>
    );
  }

  if (reportError) {
    return (
      <div className="attendance-reports">
        <div className="error-message">
          <h2>Error Loading Report</h2>
          <p>Unable to load attendance report. Please try again.</p>
          <button onClick={() => refetchReport()} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="attendance-reports">
      <header className="reports-header">
        <h1>Attendance Reports</h1>
        <p className="subtitle">Generate and export attendance reports for payroll processing</p>
      </header>

      <div className="report-controls">
        <div className="date-range-controls">
          <div className="date-input-group">
            <label htmlFor="startDate">Start Date:</label>
            <input
              id="startDate"
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleDateRangeChange('startDate', e.target.value)}
              className="date-input"
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="endDate">End Date:</label>
            <input
              id="endDate"
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleDateRangeChange('endDate', e.target.value)}
              className="date-input"
            />
          </div>
        </div>

        <div className="format-controls">
          <label htmlFor="reportFormat">Report Format:</label>
          <select
            id="reportFormat"
            value={reportFormat}
            onChange={(e) => setReportFormat(e.target.value as 'summary' | 'detailed')}
            className="format-select"
          >
            <option value="summary">Summary</option>
            <option value="detailed">Detailed</option>
          </select>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="filter-toggle-button"
        >
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </button>

        <div className="export-controls">
          <button
            onClick={() => handleExport('csv')}
            disabled={isExporting}
            className="export-button csv"
          >
            Export CSV
          </button>
          <button
            onClick={() => handleExport('excel')}
            disabled={isExporting}
            className="export-button excel"
          >
            Export Excel
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={isExporting}
            className="export-button pdf"
          >
            Export PDF
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="employee-filters">
          <h3>Employee Selection</h3>
          <div className="filter-controls">
            <label className="select-all-checkbox">
              <input
                type="checkbox"
                checked={employees ? selectedEmployees.length === employees.length : false}
                onChange={(e) => handleSelectAllEmployees(e.target.checked)}
              />
              Select All Employees
            </label>
          </div>
          <div className="employee-checkboxes">
            {employees?.map(employee => (
              <label key={employee.id} className="employee-checkbox">
                <input
                  type="checkbox"
                  checked={selectedEmployees.includes(employee.id)}
                  onChange={(e) => handleEmployeeSelection(employee.id, e.target.checked)}
                />
                {employee.firstName} {employee.lastName} (#{employee.employeeNumber})
              </label>
            ))}
          </div>
        </div>
      )}

      {reportData && (
        <div className="report-content">
          <div className="report-summary">
            <h2>Report Summary</h2>
            <div className="summary-period">
              <strong>Period:</strong> {new Date(reportData.reportPeriod.startDate).toLocaleDateString()} - {new Date(reportData.reportPeriod.endDate).toLocaleDateString()}
            </div>
            <div className="summary-stats">
              <div className="stat-card">
                <span className="stat-number">{reportData.summary.totalEmployees}</span>
                <span className="stat-label">Employees</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{formatHours(reportData.summary.totalHours)}</span>
                <span className="stat-label">Total Hours</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{formatHours(reportData.summary.averageHoursPerEmployee)}</span>
                <span className="stat-label">Avg Hours/Employee</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{formatHours(reportData.summary.totalRegularHours)}</span>
                <span className="stat-label">Regular Hours</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{formatHours(reportData.summary.totalOvertimeHours)}</span>
                <span className="stat-label">Overtime Hours</span>
              </div>
            </div>
          </div>

          <div className="employee-reports">
            <h2>Employee Breakdown</h2>
            <div className="report-table-container">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Employee #</th>
                    <th>Total Hours</th>
                    <th>Regular Hours</th>
                    <th>Overtime Hours</th>
                    <th>Days Worked</th>
                    <th>Avg Hours/Day</th>
                    <th>Time Categories</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map(employee => (
                    <tr key={employee.employeeId}>
                      <td className="employee-name">{employee.employeeName}</td>
                      <td className="employee-number">#{employee.employeeNumber}</td>
                      <td className="hours-cell">{formatHours(employee.totalHours)}</td>
                      <td className="hours-cell">{formatHours(employee.regularHours)}</td>
                      <td className="hours-cell overtime">{formatHours(employee.overtimeHours)}</td>
                      <td className="days-cell">{employee.totalDays}</td>
                      <td className="hours-cell">{formatHours(employee.averageHoursPerDay)}</td>
                      <td className="categories-cell">
                        <div className="time-categories">
                          {Object.entries(employee.timeCategories).map(([category, hours]) => (
                            <span key={category} className="category-tag">
                              {category}: {formatHours(hours)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <footer className="report-footer">
            <p className="generated-at">
              Report generated on: {new Date(reportData.generatedAt).toLocaleString()}
            </p>
          </footer>
        </div>
      )}
    </div>
  );
};

export default AttendanceReports;