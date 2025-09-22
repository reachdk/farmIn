import React, { useState, useMemo } from 'react';
import {
  useGetTimeAdjustmentsQuery,
  useCreateTimeAdjustmentMutation,
  useUpdateTimeAdjustmentMutation,
  useApproveTimeAdjustmentMutation,
  useRejectTimeAdjustmentMutation,
  useGetAllEmployeesQuery,
  TimeAdjustment,
} from '../../store/api/attendanceApi';
import './TimeAdjustments.css';

const TimeAdjustments: React.FC = () => {
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    employeeId: '',
    status: '' as '' | 'pending' | 'approved' | 'rejected',
  });
  
  const [selectedAdjustment, setSelectedAdjustment] = useState<TimeAdjustment | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [modalType, setModalType] = useState<'approve' | 'reject' | null>(null);

  const { data: employees } = useGetAllEmployeesQuery();
  const {
    data: adjustments,
    error,
    isLoading,
    refetch,
  } = useGetTimeAdjustmentsQuery(filters);

  const [createAdjustment, { isLoading: isCreating }] = useCreateTimeAdjustmentMutation();
  const [updateAdjustment, { isLoading: isUpdating }] = useUpdateTimeAdjustmentMutation();
  const [approveAdjustment, { isLoading: isApproving }] = useApproveTimeAdjustmentMutation();
  const [rejectAdjustment, { isLoading: isRejecting }] = useRejectTimeAdjustmentMutation();

  const filteredAdjustments = useMemo(() => {
    if (!adjustments) return [];
    return adjustments.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  }, [adjustments]);

  const handleFilterChange = (field: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleApprove = async (adjustment: TimeAdjustment) => {
    try {
      await approveAdjustment({
        id: adjustment.id,
        approvalNote: approvalNote.trim() || undefined,
      }).unwrap();
      setSelectedAdjustment(null);
      setModalType(null);
      setApprovalNote('');
    } catch (error) {
      console.error('Failed to approve adjustment:', error);
    }
  };

  const handleReject = async (adjustment: TimeAdjustment) => {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }
    
    try {
      await rejectAdjustment({
        id: adjustment.id,
        rejectionReason: rejectionReason.trim(),
      }).unwrap();
      setSelectedAdjustment(null);
      setModalType(null);
      setRejectionReason('');
    } catch (error) {
      console.error('Failed to reject adjustment:', error);
    }
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return '--';
    return new Date(timeString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatHours = (hours: number) => {
    return `${hours.toFixed(2)}h`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#f39c12';
      case 'approved': return '#27ae60';
      case 'rejected': return '#e74c3c';
      default: return '#7f8c8d';
    }
  };

  if (isLoading) {
    return (
      <div className="time-adjustments">
        <div className="loading-spinner">Loading time adjustments...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="time-adjustments">
        <div className="error-message">
          <h2>Error Loading Time Adjustments</h2>
          <p>Unable to load time adjustment data. Please try again.</p>
          <button onClick={() => refetch()} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="time-adjustments">
      <header className="adjustments-header">
        <h1>Time Adjustments</h1>
        <p className="subtitle">Review and approve manual time entry corrections</p>
      </header>

      <div className="adjustments-controls">
        <div className="filter-controls">
          <div className="filter-group">
            <label htmlFor="startDate">Start Date:</label>
            <input
              id="startDate"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="filter-input"
            />
          </div>
          
          <div className="filter-group">
            <label htmlFor="endDate">End Date:</label>
            <input
              id="endDate"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label htmlFor="employeeFilter">Employee:</label>
            <select
              id="employeeFilter"
              value={filters.employeeId}
              onChange={(e) => handleFilterChange('employeeId', e.target.value)}
              className="filter-select"
            >
              <option value="">All Employees</option>
              {employees?.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName} (#{employee.employeeNumber})
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="statusFilter">Status:</label>
            <select
              id="statusFilter"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value as any)}
              className="filter-select"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="create-adjustment-button"
        >
          Create Manual Adjustment
        </button>
      </div>

      <div className="adjustments-list">
        {filteredAdjustments.length === 0 ? (
          <div className="no-adjustments">
            <p>No time adjustments found for the selected criteria.</p>
          </div>
        ) : (
          <div className="adjustments-table-container">
            <table className="adjustments-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Original Times</th>
                  <th>Adjusted Times</th>
                  <th>Hours Change</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdjustments.map(adjustment => (
                  <tr key={adjustment.id} className={`adjustment-row ${adjustment.status}`}>
                    <td className="employee-cell">
                      <div className="employee-info">
                        <span className="employee-name">{adjustment.employeeName}</span>
                        <span className="employee-number">#{adjustment.employeeNumber}</span>
                      </div>
                    </td>
                    <td className="date-cell">
                      {formatDate(adjustment.date)}
                    </td>
                    <td className="times-cell">
                      <div className="time-range">
                        <span className="time-in">{formatTime(adjustment.originalClockIn)}</span>
                        <span className="time-separator">→</span>
                        <span className="time-out">{formatTime(adjustment.originalClockOut)}</span>
                      </div>
                      <div className="hours-display">
                        {formatHours(adjustment.originalHours)}
                      </div>
                    </td>
                    <td className="times-cell">
                      <div className="time-range adjusted">
                        <span className="time-in">{formatTime(adjustment.adjustedClockIn)}</span>
                        <span className="time-separator">→</span>
                        <span className="time-out">{formatTime(adjustment.adjustedClockOut)}</span>
                      </div>
                      <div className="hours-display adjusted">
                        {formatHours(adjustment.adjustedHours)}
                      </div>
                    </td>
                    <td className="hours-change-cell">
                      <span className={`hours-change ${adjustment.adjustedHours > adjustment.originalHours ? 'positive' : 'negative'}`}>
                        {adjustment.adjustedHours > adjustment.originalHours ? '+' : ''}
                        {formatHours(adjustment.adjustedHours - adjustment.originalHours)}
                      </span>
                    </td>
                    <td className="reason-cell">
                      <div className="reason-content">
                        <span className="reason-type">{adjustment.reason}</span>
                        <span className="justification">{adjustment.justification}</span>
                      </div>
                    </td>
                    <td className="status-cell">
                      <span 
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(adjustment.status) }}
                      >
                        {adjustment.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="requested-cell">
                      <div className="request-info">
                        <span className="request-date">
                          {formatDate(adjustment.requestedAt)}
                        </span>
                        <span className="request-by">by {adjustment.requestedBy}</span>
                      </div>
                    </td>
                    <td className="actions-cell">
                      <div className="action-buttons">
                        {adjustment.status === 'pending' && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedAdjustment(adjustment);
                                setModalType('approve');
                                setApprovalNote('');
                              }}
                              className="approve-button"
                              disabled={isApproving}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setSelectedAdjustment(adjustment);
                                setModalType('reject');
                                setRejectionReason('');
                              }}
                              className="reject-button"
                              disabled={isRejecting}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => {
                            setSelectedAdjustment(adjustment);
                            setShowAuditModal(true);
                          }}
                          className="audit-button"
                        >
                          Audit Trail
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approval/Rejection Modal */}
      {selectedAdjustment && modalType && !showAuditModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>
                {modalType === 'reject' ? 'Reject' : 'Approve'} Time Adjustment
              </h3>
              <button
                onClick={() => {
                  setSelectedAdjustment(null);
                  setModalType(null);
                  setApprovalNote('');
                  setRejectionReason('');
                }}
                className="modal-close"
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <div className="adjustment-summary">
                <h4>{selectedAdjustment.employeeName} - {formatDate(selectedAdjustment.date)}</h4>
                <div className="time-comparison">
                  <div className="time-block">
                    <label>Original:</label>
                    <span>{formatTime(selectedAdjustment.originalClockIn)} → {formatTime(selectedAdjustment.originalClockOut)}</span>
                    <span className="hours">{formatHours(selectedAdjustment.originalHours)}</span>
                  </div>
                  <div className="time-block adjusted">
                    <label>Adjusted:</label>
                    <span>{formatTime(selectedAdjustment.adjustedClockIn)} → {formatTime(selectedAdjustment.adjustedClockOut)}</span>
                    <span className="hours">{formatHours(selectedAdjustment.adjustedHours)}</span>
                  </div>
                </div>
                <div className="justification-display">
                  <label>Justification:</label>
                  <p>{selectedAdjustment.justification}</p>
                </div>
              </div>

              {modalType === 'reject' ? (
                <div className="form-group">
                  <label htmlFor="rejectionReason">Rejection Reason *</label>
                  <textarea
                    id="rejectionReason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Please provide a reason for rejecting this adjustment..."
                    className="rejection-textarea"
                    rows={4}
                    required
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label htmlFor="approvalNote">Approval Note (Optional)</label>
                  <textarea
                    id="approvalNote"
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    placeholder="Add any notes about this approval..."
                    className="approval-textarea"
                    rows={3}
                  />
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                onClick={() => {
                  setSelectedAdjustment(null);
                  setModalType(null);
                  setApprovalNote('');
                  setRejectionReason('');
                }}
                className="cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (modalType === 'reject') {
                    handleReject(selectedAdjustment);
                  } else {
                    handleApprove(selectedAdjustment);
                  }
                }}
                className={modalType === 'reject' ? 'reject-confirm-button' : 'approve-confirm-button'}
                disabled={isApproving || isRejecting || (modalType === 'reject' && !rejectionReason.trim())}
              >
                {isApproving || isRejecting ? 'Processing...' : (modalType === 'reject' ? 'Reject' : 'Approve')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Trail Modal */}
      {selectedAdjustment && showAuditModal && (
        <div className="modal-overlay">
          <div className="modal audit-modal">
            <div className="modal-header">
              <h3>Audit Trail - {selectedAdjustment.employeeName}</h3>
              <button
                onClick={() => {
                  setShowAuditModal(false);
                  setSelectedAdjustment(null);
                }}
                className="modal-close"
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <div className="audit-trail">
                {selectedAdjustment.auditTrail.map(entry => (
                  <div key={entry.id} className="audit-entry">
                    <div className="audit-header">
                      <span className="audit-action">{entry.action.toUpperCase()}</span>
                      <span className="audit-date">
                        {new Date(entry.performedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="audit-details">
                      <span className="audit-performer">by {entry.performedBy}</span>
                      <p className="audit-description">{entry.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeAdjustments;