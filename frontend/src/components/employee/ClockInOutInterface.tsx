import React, { useState, useEffect } from 'react';
import { useAppSelector } from '../../hooks/redux';
import { 
  useClockInMutation, 
  useClockOutMutation, 
  useGetCurrentShiftQuery 
} from '../../store/api/attendanceApi';
import './ClockInOutInterface.css';

const ClockInOutInterface: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [clockIn, { isLoading: isClockingIn }] = useClockInMutation();
  const [clockOut, { isLoading: isClockingOut }] = useClockOutMutation();
  
  const { 
    data: shiftStatus, 
    refetch: refetchShiftStatus,
    isLoading: isLoadingShift 
  } = useGetCurrentShiftQuery(user?.employeeId || '', {
    skip: !user?.employeeId,
    pollingInterval: 30000, // Poll every 30 seconds for real-time updates
  });

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Clear feedback after 5 seconds
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const handleClockIn = async () => {
    if (!user?.employeeId) return;

    try {
      await clockIn({ employeeId: user.employeeId }).unwrap();
      setFeedback({ message: 'Successfully clocked in!', type: 'success' });
      refetchShiftStatus();
    } catch (error: any) {
      setFeedback({ 
        message: error?.data?.message || 'Failed to clock in. Please try again.', 
        type: 'error' 
      });
    }
  };

  const handleClockOut = async () => {
    if (!user?.employeeId) return;

    try {
      await clockOut({ employeeId: user.employeeId }).unwrap();
      setFeedback({ message: 'Successfully clocked out!', type: 'success' });
      refetchShiftStatus();
    } catch (error: any) {
      setFeedback({ 
        message: error?.data?.message || 'Failed to clock out. Please try again.', 
        type: 'error' 
      });
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const calculateElapsedTime = (): string => {
    if (!shiftStatus?.isActive || !shiftStatus.currentRecord?.clockInTime) {
      return '00:00:00';
    }

    const clockInTime = new Date(shiftStatus.currentRecord.clockInTime);
    const now = new Date();
    const elapsed = now.getTime() - clockInTime.getTime();
    
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (isLoadingShift) {
    return (
      <div className="clock-interface">
        <div className="loading">Loading shift status...</div>
      </div>
    );
  }

  return (
    <div className="clock-interface">
      <div className="current-time-section">
        <div className="current-time">{formatTime(currentTime)}</div>
        <div className="current-date">{formatDate(currentTime)}</div>
      </div>

      <div className="shift-status-section">
        {shiftStatus?.isActive ? (
          <div className="shift-active">
            <div className="status-indicator active">
              <span className="status-dot"></span>
              Currently Clocked In
            </div>
            <div className="shift-details">
              <div className="clock-in-time">
                Started: {shiftStatus.currentRecord?.clockInTime ? 
                  formatTime(new Date(shiftStatus.currentRecord.clockInTime)) : 'Unknown'}
              </div>
              <div className="elapsed-time">
                Elapsed: <span className="time-counter">{calculateElapsedTime()}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="shift-inactive">
            <div className="status-indicator inactive">
              <span className="status-dot"></span>
              Not Clocked In
            </div>
          </div>
        )}
      </div>

      <div className="action-buttons">
        {shiftStatus?.isActive ? (
          <button
            className="clock-out-btn"
            onClick={handleClockOut}
            disabled={isClockingOut}
          >
            {isClockingOut ? 'Clocking Out...' : 'Clock Out'}
          </button>
        ) : (
          <button
            className="clock-in-btn"
            onClick={handleClockIn}
            disabled={isClockingIn}
          >
            {isClockingIn ? 'Clocking In...' : 'Clock In'}
          </button>
        )}
      </div>

      {feedback && (
        <div className={`feedback ${feedback.type}`}>
          <div className="feedback-message">{feedback.message}</div>
        </div>
      )}
    </div>
  );
};

export default ClockInOutInterface;