import express from 'express';
import { DatabaseManager } from '../database/DatabaseManager';
import { getRFIDService } from '../services/RFIDService';
import { CameraService } from '../services/CameraService';

const router = express.Router();
const db = DatabaseManager.getInstance();
const rfidService = getRFIDService();

// Get kiosk device information
router.get('/device/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const device = await db.get(`
      SELECT * FROM hardware_devices 
      WHERE id = ? OR device_id = ?
    `, [deviceId, deviceId]);

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    return res.json({
      id: device.id,
      name: device.name,
      type: device.type,
      location: device.location,
      status: device.status,
      capabilities: JSON.parse(device.capabilities || '[]'),
      configuration: JSON.parse(device.configuration || '{}'),
      lastSeen: device.last_seen,
      createdAt: device.created_at,
      updatedAt: device.updated_at
    });
  } catch (error) {
    console.error('Failed to get device:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update device status (heartbeat)
router.post('/device/:deviceId/heartbeat', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { status, systemHealth, errors } = req.body;

    await db.run(`
      UPDATE hardware_devices 
      SET status = ?, last_seen = CURRENT_TIMESTAMP, 
          system_health = ?, errors = ?
      WHERE id = ? OR device_id = ?
    `, [
      status || 'online',
      JSON.stringify(systemHealth || {}),
      JSON.stringify(errors || []),
      deviceId,
      deviceId
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update device status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get employee by RFID card
router.get('/employee/by-card/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;
    
    const employee = await rfidService.getEmployeeByCard(cardId);
    
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found for this card' });
    }

    return res.json({
      id: employee.id,
      employeeNumber: employee.employee_number,
      firstName: employee.first_name,
      lastName: employee.last_name,
      email: employee.email,
      role: employee.role,
      isActive: Boolean(employee.is_active)
    });
  } catch (error) {
    console.error('Failed to get employee by card:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Process attendance capture from kiosk
router.post('/attendance/capture', async (req, res) => {
  try {
    const { employeeId, cardId, deviceId, action, timestamp, location, photoId } = req.body;

    if (!employeeId || !action || !deviceId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate action
    if (!['clock_in', 'clock_out'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    // Check if employee exists and is active
    const employee = await db.get(
      'SELECT * FROM employees WHERE id = ? AND is_active = 1',
      [employeeId]
    );

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found or inactive' });
    }

    // Check for existing open attendance record
    const existingRecord = await db.get(`
      SELECT * FROM attendance_records 
      WHERE employee_id = ? AND clock_out_time IS NULL 
      ORDER BY clock_in_time DESC 
      LIMIT 1
    `, [employeeId]);

    let attendanceRecord;

    if (action === 'clock_in') {
      // Prevent duplicate clock-ins
      if (existingRecord) {
        return res.status(400).json({ 
          error: 'Employee is already clocked in',
          existingRecord: {
            id: existingRecord.id,
            clockInTime: existingRecord.clock_in_time
          }
        });
      }

      // Create new attendance record
      const recordId = `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await db.run(`
        INSERT INTO attendance_records (
          id, employee_id, clock_in_time, location, device_id, photo_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [recordId, employeeId, timestamp, location, deviceId, photoId]);

      attendanceRecord = await db.get(
        'SELECT * FROM attendance_records WHERE id = ?',
        [recordId]
      );

    } else { // clock_out
      if (!existingRecord) {
        return res.status(400).json({ 
          error: 'No open attendance record found. Please clock in first.' 
        });
      }

      // Update existing record with clock out time
      await db.run(`
        UPDATE attendance_records 
        SET clock_out_time = ?, clock_out_device_id = ?, clock_out_photo_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [timestamp, deviceId, photoId, existingRecord.id]);

      // Calculate total hours and assign time category
      const clockInTime = new Date(existingRecord.clock_in_time);
      const clockOutTime = new Date(timestamp);
      const totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

      // Get time category based on hours worked
      const timeCategory = await getTimeCategoryForHours(totalHours);

      await db.run(`
        UPDATE attendance_records 
        SET total_hours = ?, time_category = ?
        WHERE id = ?
      `, [totalHours, timeCategory, existingRecord.id]);

      attendanceRecord = await db.get(
        'SELECT * FROM attendance_records WHERE id = ?',
        [existingRecord.id]
      );
    }

    // Record RFID scan if card was used
    if (cardId) {
      await rfidService.recordScan({
        cardId,
        readerId: deviceId,
        timestamp,
        signalStrength: 100, // Assume good signal for successful scan
        rawData: `KIOSK_SCAN_${cardId}_${timestamp}`
      });
    }

    // Format response
    const response = {
      attendanceRecord: {
        id: attendanceRecord.id,
        employeeId: attendanceRecord.employee_id,
        clockInTime: attendanceRecord.clock_in_time,
        clockOutTime: attendanceRecord.clock_out_time,
        totalHours: attendanceRecord.total_hours,
        timeCategory: attendanceRecord.time_category,
        location: attendanceRecord.location,
        deviceId: attendanceRecord.device_id,
        photoId: attendanceRecord.photo_id
      },
      employee: {
        id: employee.id,
        firstName: employee.first_name,
        lastName: employee.last_name,
        employeeNumber: employee.employee_number
      },
      action,
      timestamp
    };

    return res.json(response);
  } catch (error) {
    console.error('Failed to capture attendance:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current attendance status for employee
router.get('/attendance/status/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;

    const currentRecord = await db.get(`
      SELECT * FROM attendance_records 
      WHERE employee_id = ? AND clock_out_time IS NULL 
      ORDER BY clock_in_time DESC 
      LIMIT 1
    `, [employeeId]);

    if (!currentRecord) {
      return res.json({ 
        status: 'clocked_out',
        currentRecord: null 
      });
    }

    const clockInTime = new Date(currentRecord.clock_in_time);
    const now = new Date();
    const elapsedHours = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

    return res.json({
      status: 'clocked_in',
      currentRecord: {
        id: currentRecord.id,
        clockInTime: currentRecord.clock_in_time,
        elapsedHours: Math.round(elapsedHours * 100) / 100,
        location: currentRecord.location,
        deviceId: currentRecord.device_id
      }
    });
  } catch (error) {
    console.error('Failed to get attendance status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Capture photo for attendance verification
router.post('/photo/capture', async (req, res) => {
  try {
    const { deviceId, employeeId, attendanceRecordId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    const cameraService = new CameraService();
    
    const photo = await cameraService.capturePhoto({
      deviceId,
      employeeId,
      attendanceRecordId,
      metadata: {
        purpose: 'attendance',
        location: 'kiosk'
      },
      capturedBy: 'kiosk_system'
    });

    return res.json(photo);
  } catch (error) {
    console.error('Failed to capture photo:', error);
    return res.status(500).json({ error: 'Failed to capture photo' });
  }
});

// Get offline data for synchronization
router.get('/offline/sync-data', async (req, res) => {
  try {
    // Get employees for offline cache
    const employees = await db.all(`
      SELECT e.*, r.card_id 
      FROM employees e
      LEFT JOIN rfid_cards r ON e.id = r.employee_id AND r.is_active = 1
      WHERE e.is_active = 1
    `);

    // Get time categories
    const timeCategories = await db.all(`
      SELECT * FROM time_categories 
      WHERE is_active = 1 
      ORDER BY min_hours ASC
    `);

    // Get recent attendance records for status determination
    const recentAttendance = await db.all(`
      SELECT employee_id, clock_in_time, clock_out_time, id
      FROM attendance_records 
      WHERE clock_in_time >= date('now', '-7 days')
      ORDER BY clock_in_time DESC
    `);

    return res.json({
      employees: employees.map(emp => ({
        id: emp.id,
        employeeNumber: emp.employee_number,
        firstName: emp.first_name,
        lastName: emp.last_name,
        cardId: emp.card_id,
        role: emp.role
      })),
      timeCategories: timeCategories.map(cat => ({
        id: cat.id,
        name: cat.name,
        minHours: cat.min_hours,
        maxHours: cat.max_hours,
        payMultiplier: cat.pay_multiplier
      })),
      recentAttendance: recentAttendance.map(att => ({
        employeeId: att.employee_id,
        clockInTime: att.clock_in_time,
        clockOutTime: att.clock_out_time,
        id: att.id
      })),
      syncTimestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to get offline sync data:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to determine time category based on hours worked
async function getTimeCategoryForHours(hours: number): Promise<string | null> {
  try {
    const categories = await db.all(`
      SELECT * FROM time_categories 
      WHERE is_active = 1 AND min_hours <= ?
      ORDER BY min_hours DESC
      LIMIT 1
    `, [hours]);

    return categories.length > 0 ? categories[0].name : null;
  } catch (error) {
    console.error('Failed to get time category:', error);
    return null;
  }
}

export default router;