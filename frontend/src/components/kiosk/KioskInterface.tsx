import React, { useState, useEffect, useCallback } from 'react';
import { useCaptureAttendanceMutation, useGetDeviceStatusQuery } from '../../store/api/hardwareApi';
import { useGetEmployeeByCardQuery } from '../../store/api/employeeApi';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import './KioskInterface.css';

interface KioskProps {
  deviceId: string;
  location: string;
}

interface AttendanceState {
  employeeId?: string;
  employeeName?: string;
  cardId?: string;
  action?: 'clock_in' | 'clock_out';
  isProcessing: boolean;
  message: string;
  messageType: 'info' | 'success' | 'error' | 'warning';
}

const KioskInterface: React.FC<KioskProps> = ({ deviceId, location }) => {
  const [attendanceState, setAttendanceState] = useState<AttendanceState>({
    isProcessing: false,
    message: 'Please scan your RFID card',
    messageType: 'info'
  });
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [rfidListening, setRfidListening] = useState(true);
  
  const isOffline = useSelector((state: RootState) => state.offline.isOffline);
  
  const { data: deviceStatus } = useGetDeviceStatusQuery(deviceId, {
    pollingInterval: 30000,
    skip: isOffline
  });
  
  const { data: employee, isLoading: isLoadingEmployee } = useGetEmployeeByCardQuery(
    attendanceState.cardId || '', 
    { skip: !attendanceState.cardId }
  );
  
  const [captureAttendance] = useCaptureAttendanceMutation();

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  // Simulate RFID card reading
  useEffect(() => {
    if (!rfidListening || attendanceState.isProcessing) return;

    const handleKeyPress = (event: KeyboardEvent) => {
      // Simulate RFID card scan with Enter key for demo
      if (event.key === 'Enter' && !attendanceState.isProcessing) {
        // Generate a demo card ID
        const demoCardId = `CARD_${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
        handleRFIDScan(demoCardId);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [rfidListening, attendanceState.isProcessing]);

  const handleRFIDScan = useCallback(async (cardId: string) => {
    if (attendanceState.isProcessing) return;

    setAttendanceState(prev => ({
      ...prev,
      cardId,
      isProcessing: true,
      message: 'Reading card...',
      messageType: 'info'
    }));

    try {
      // In offline mode, try to get employee from local storage
      if (isOffline) {
        const localEmployee = getEmployeeFromLocalStorage(cardId);
        if (localEmployee) {
          await processAttendance(cardId, localEmployee.id, localEmployee.name);
        } else {
          setAttendanceState(prev => ({
            ...prev,
            isProcessing: false,
            message: 'Employee not found in offline database',
            messageType: 'error'
          }));
          setTimeout(resetState, 3000);
        }
      }
    } catch (error) {
      console.error('RFID scan error:', error);
      setAttendanceState(prev => ({
        ...prev,
        isProcessing: false,
        message: 'Card reading failed. Please try again.',
        messageType: 'error'
      }));
      setTimeout(resetState, 3000);
    }
  }, [attendanceState.isProcessing, isOffline]);

  // Process employee data when loaded
  useEffect(() => {
    if (employee && attendanceState.cardId && !attendanceState.isProcessing) {
      processAttendance(attendanceState.cardId, employee.id, `${employee.firstName} ${employee.lastName}`);
    } else if (!isLoadingEmployee && !employee && attendanceState.cardId) {
      setAttendanceState(prev => ({
        ...prev,
        isProcessing: false,
        message: 'Employee not found. Please contact administrator.',
        messageType: 'error'
      }));
      setTimeout(resetState, 3000);
    }
  }, [employee, isLoadingEmployee, attendanceState.cardId]);

  const processAttendance = async (cardId: string, employeeId: string, employeeName: string) => {
    try {
      // Determine action based on current attendance status
      const action = await determineAttendanceAction(employeeId);
      
      setAttendanceState(prev => ({
        ...prev,
        employeeId,
        employeeName,
        action,
        message: `Processing ${action === 'clock_in' ? 'Clock In' : 'Clock Out'} for ${employeeName}...`,
        messageType: 'info'
      }));

      const attendanceData = {
        employeeId,
        cardId,
        deviceId,
        action,
        timestamp: new Date().toISOString(),
        location
      };

      if (isOffline) {
        // Store in local queue for sync later
        storeOfflineAttendance(attendanceData);
        setAttendanceState(prev => ({
          ...prev,
          isProcessing: false,
          message: `${action === 'clock_in' ? 'Clocked In' : 'Clocked Out'} successfully (Offline)`,
          messageType: 'success'
        }));
      } else {
        const result = await captureAttendance(attendanceData).unwrap();
        setAttendanceState(prev => ({
          ...prev,
          isProcessing: false,
          message: `${action === 'clock_in' ? 'Clocked In' : 'Clocked Out'} successfully`,
          messageType: 'success'
        }));
      }

      // Play success sound
      playSound('success');
      
      setTimeout(resetState, 3000);
    } catch (error) {
      console.error('Attendance capture error:', error);
      setAttendanceState(prev => ({
        ...prev,
        isProcessing: false,
        message: 'Failed to record attendance. Please try again.',
        messageType: 'error'
      }));
      playSound('error');
      setTimeout(resetState, 3000);
    }
  };

  const determineAttendanceAction = async (employeeId: string): Promise<'clock_in' | 'clock_out'> => {
    // Check if employee is currently clocked in
    // In a real implementation, this would check the current attendance status
    const lastAttendance = getLastAttendanceFromStorage(employeeId);
    
    if (!lastAttendance || lastAttendance.action === 'clock_out') {
      return 'clock_in';
    } else {
      return 'clock_out';
    }
  };

  const getEmployeeFromLocalStorage = (cardId: string) => {
    try {
      const employees = JSON.parse(localStorage.getItem('offline_employees') || '[]');
      return employees.find((emp: any) => emp.cardId === cardId);
    } catch {
      return null;
    }
  };

  const storeOfflineAttendance = (attendanceData: any) => {
    try {
      const offlineQueue = JSON.parse(localStorage.getItem('offline_attendance_queue') || '[]');
      offlineQueue.push({
        ...attendanceData,
        id: `offline_${Date.now()}`,
        synced: false
      });
      localStorage.setItem('offline_attendance_queue', JSON.stringify(offlineQueue));
      
      // Also update last attendance for action determination
      const lastAttendances = JSON.parse(localStorage.getItem('last_attendances') || '{}');
      lastAttendances[attendanceData.employeeId] = attendanceData;
      localStorage.setItem('last_attendances', JSON.stringify(lastAttendances));
    } catch (error) {
      console.error('Failed to store offline attendance:', error);
    }
  };

  const getLastAttendanceFromStorage = (employeeId: string) => {
    try {
      const lastAttendances = JSON.parse(localStorage.getItem('last_attendances') || '{}');
      return lastAttendances[employeeId];
    } catch {
      return null;
    }
  };

  const playSound = (type: 'success' | 'error' | 'beep') => {
    // Create audio context for sound feedback
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      switch (type) {
        case 'success':
          oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
          break;
        case 'error':
          oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(300, audioContext.currentTime + 0.1);
          break;
        case 'beep':
          oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
          break;
      }
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.warn('Audio feedback not available:', error);
    }
  };

  const resetState = () => {
    setAttendanceState({
      isProcessing: false,
      message: 'Please scan your RFID card',
      messageType: 'info'
    });
  };

  const getStatusColor = () => {
    if (isOffline) return '#ff9800'; // Orange for offline
    if (deviceStatus?.status === 'online') return '#4caf50'; // Green for online
    if (deviceStatus?.status === 'error') return '#f44336'; // Red for error
    return '#9e9e9e'; // Gray for unknown
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="kiosk-interface">
      <div className="kiosk-header">
        <div className="kiosk-title">
          <h1>Farm Attendance System</h1>
          <div className="location">{location}</div>
        </div>
        <div className="kiosk-status">
          <div className={`status-indicator ${isOffline ? 'offline' : 'online'}`}>
            <div className="status-dot" style={{ backgroundColor: getStatusColor() }}></div>
            <span>{isOffline ? 'Offline Mode' : 'Online'}</span>
          </div>
        </div>
      </div>

      <div className="kiosk-content">
        <div className="time-display">
          <div className="current-time">{formatTime(currentTime)}</div>
          <div className="current-date">{formatDate(currentTime)}</div>
        </div>

        <div className={`attendance-area ${attendanceState.messageType}`}>
          <div className="attendance-icon">
            {attendanceState.isProcessing ? (
              <div className="processing-spinner">⟳</div>
            ) : attendanceState.messageType === 'success' ? (
              <div className="success-icon">✓</div>
            ) : attendanceState.messageType === 'error' ? (
              <div className="error-icon">✗</div>
            ) : (
              <div className="rfid-icon">📱</div>
            )}
          </div>
          
          <div className="attendance-message">
            {attendanceState.employeeName && (
              <div className="employee-name">{attendanceState.employeeName}</div>
            )}
            <div className="message-text">{attendanceState.message}</div>
          </div>
        </div>

        <div className="instructions">
          <div className="instruction-item">
            <span className="instruction-icon">1️⃣</span>
            <span>Hold your RFID card near the reader</span>
          </div>
          <div className="instruction-item">
            <span className="instruction-icon">2️⃣</span>
            <span>Wait for confirmation</span>
          </div>
          <div className="instruction-item">
            <span className="instruction-icon">3️⃣</span>
            <span>Your attendance is recorded</span>
          </div>
        </div>
      </div>

      <div className="kiosk-footer">
        <div className="device-info">
          Device ID: {deviceId}
        </div>
        <div className="help-text">
          Need help? Contact your supervisor
        </div>
      </div>

      {/* Demo helper - remove in production */}
      <div className="demo-helper">
        <small>Demo: Press Enter to simulate RFID card scan</small>
      </div>
    </div>
  );
};

export default KioskInterface;