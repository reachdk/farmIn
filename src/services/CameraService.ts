import { v4 as uuidv4 } from 'uuid';
import { PhotoStorageService } from './PhotoStorageService';
import { DatabaseManager } from '../database/DatabaseManager';

export interface CameraDevice {
  id: string;
  name: string;
  deviceId: string;
  resolution: string;
  status: 'active' | 'inactive' | 'error';
  capabilities: {
    autoFocus: boolean;
    flash: boolean;
    zoom: boolean;
    nightVision: boolean;
    motionDetection: boolean;
  };
  settings: {
    brightness: number;
    contrast: number;
    saturation: number;
    quality: 'low' | 'medium' | 'high' | 'ultra';
    format: 'jpeg' | 'png' | 'webp';
  };
  lastUsed?: string;
}

export interface PhotoCaptureRequest {
  deviceId: string;
  employeeId?: string;
  attendanceRecordId?: string;
  settings?: {
    quality?: 'low' | 'medium' | 'high' | 'ultra';
    format?: 'jpeg' | 'png' | 'webp';
    width?: number;
    height?: number;
  };
  metadata?: {
    location?: string;
    purpose: 'attendance' | 'verification' | 'profile' | 'manual';
    notes?: string;
  };
  capturedBy: string;
}

export interface PhotoCaptureResponse {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  employeeId?: string;
  deviceId?: string;
  attendanceRecordId?: string;
  timestamp: string;
  metadata: {
    resolution: string;
    fileSize: number;
    format: string;
    location?: string;
    purpose: string;
    notes?: string;
  };
  processing?: {
    status: 'pending' | 'completed' | 'failed';
    faceDetected: boolean;
    confidence?: number;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    matchedEmployeeId?: string;
    matchConfidence?: number;
  };
}

export class CameraService {
  private db: DatabaseManager;
  private photoStorage: PhotoStorageService;

  constructor() {
    this.db = DatabaseManager.getInstance();
    this.photoStorage = new PhotoStorageService();
  }

  async getAvailableDevices(): Promise<CameraDevice[]> {
    try {
      // Get registered devices from database
      const query = `
        SELECT * FROM camera_devices 
        WHERE is_active = 1 
        ORDER BY name
      `;
      
      const devices = await this.db.all(query);
      
      // Add system detection for available cameras
      const systemDevices = await this.detectSystemCameras();
      
      // Merge registered devices with system detection
      const mergedDevices: CameraDevice[] = devices.map(device => ({
        id: device.id,
        name: device.name,
        deviceId: device.device_id,
        resolution: device.resolution,
        status: (systemDevices.find(sd => sd.deviceId === device.device_id) ? 'active' : 'inactive') as 'active' | 'inactive' | 'error',
        capabilities: JSON.parse(device.capabilities || '{}'),
        settings: JSON.parse(device.settings || '{}'),
        lastUsed: device.last_used
      }));

      // Add any new system devices not in database
      for (const sysDevice of systemDevices) {
        if (!devices.find(d => d.device_id === sysDevice.deviceId)) {
          const newDevice = await this.registerDevice(sysDevice);
          mergedDevices.push(newDevice);
        }
      }

      return mergedDevices;
    } catch (error) {
      console.error('Failed to get available devices:', error);
      throw error;
    }
  }

  async getDevice(deviceId: string): Promise<CameraDevice | null> {
    try {
      const query = `
        SELECT * FROM camera_devices 
        WHERE id = ? OR device_id = ?
      `;
      
      const device = await this.db.get(query, [deviceId, deviceId]);
      
      if (!device) {
        return null;
      }

      return {
        id: device.id,
        name: device.name,
        deviceId: device.device_id,
        resolution: device.resolution,
        status: device.is_active ? 'active' : 'inactive',
        capabilities: JSON.parse(device.capabilities || '{}'),
        settings: JSON.parse(device.settings || '{}'),
        lastUsed: device.last_used
      };
    } catch (error) {
      console.error('Failed to get device:', error);
      throw error;
    }
  }

  async updateDeviceSettings(deviceId: string, settings: any): Promise<CameraDevice> {
    try {
      const updateQuery = `
        UPDATE camera_devices 
        SET settings = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? OR device_id = ?
      `;
      
      await this.db.run(updateQuery, [
        JSON.stringify(settings),
        deviceId,
        deviceId
      ]);

      const updatedDevice = await this.getDevice(deviceId);
      if (!updatedDevice) {
        throw new Error('Device not found after update');
      }

      return updatedDevice;
    } catch (error) {
      console.error('Failed to update device settings:', error);
      throw error;
    }
  }

  async testDevice(deviceId: string): Promise<{ success: boolean; message: string }> {
    try {
      const device = await this.getDevice(deviceId);
      if (!device) {
        return { success: false, message: 'Device not found' };
      }

      // Simulate camera test - in real implementation, this would test actual hardware
      const isAvailable = await this.checkDeviceAvailability(device.deviceId);
      
      if (isAvailable) {
        // Update last tested timestamp
        await this.db.run(
          'UPDATE camera_devices SET last_tested = CURRENT_TIMESTAMP WHERE id = ?',
          [device.id]
        );
        
        return { success: true, message: 'Camera test successful' };
      } else {
        return { success: false, message: 'Camera not accessible' };
      }
    } catch (error) {
      console.error('Camera test failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: 'Camera test failed: ' + errorMessage };
    }
  }

  async capturePhoto(request: PhotoCaptureRequest): Promise<PhotoCaptureResponse> {
    try {
      const device = await this.getDevice(request.deviceId);
      if (!device) {
        throw new Error('Camera device not found');
      }

      if (device.status !== 'active') {
        throw new Error('Camera device is not active');
      }

      // Simulate photo capture - in real implementation, this would interface with camera hardware
      const photoBuffer = await this.simulatePhotoCapture(device, request.settings);
      
      // Store the photo
      const photo = await this.photoStorage.storePhoto({
        buffer: photoBuffer,
        originalName: `capture_${Date.now()}.${request.settings?.format || 'jpeg'}`,
        mimeType: `image/${request.settings?.format || 'jpeg'}`,
        metadata: {
          purpose: request.metadata?.purpose || 'manual',
          notes: request.metadata?.notes,
          location: request.metadata?.location,
          deviceId: device.id,
          employeeId: request.employeeId,
          attendanceRecordId: request.attendanceRecordId
        },
        uploadedBy: request.capturedBy
      });

      // Update device last used timestamp
      await this.db.run(
        'UPDATE camera_devices SET last_used = CURRENT_TIMESTAMP WHERE id = ?',
        [device.id]
      );

      return photo;
    } catch (error) {
      console.error('Photo capture failed:', error);
      throw error;
    }
  }

  async captureMultiplePhotos(request: {
    deviceId: string;
    count: number;
    interval: number;
    employeeId?: string;
    attendanceRecordId?: string;
    capturedBy: string;
  }): Promise<PhotoCaptureResponse[]> {
    try {
      const photos: PhotoCaptureResponse[] = [];
      
      for (let i = 0; i < request.count; i++) {
        const photo = await this.capturePhoto({
          deviceId: request.deviceId,
          employeeId: request.employeeId,
          attendanceRecordId: request.attendanceRecordId,
          metadata: {
            purpose: 'attendance',
            notes: `Batch capture ${i + 1}/${request.count}`
          },
          capturedBy: request.capturedBy
        });
        
        photos.push(photo);
        
        // Wait for interval before next capture (except for last photo)
        if (i < request.count - 1) {
          await new Promise(resolve => setTimeout(resolve, request.interval));
        }
      }

      return photos;
    } catch (error) {
      console.error('Batch capture failed:', error);
      throw error;
    }
  }

  private async detectSystemCameras(): Promise<Array<{
    deviceId: string;
    name: string;
    resolution: string;
  }>> {
    // Simulate system camera detection
    // In real implementation, this would use system APIs to detect cameras
    return [
      {
        deviceId: 'system_camera_0',
        name: 'Built-in Camera',
        resolution: '1920x1080'
      },
      {
        deviceId: 'usb_camera_1',
        name: 'USB Camera',
        resolution: '1280x720'
      }
    ];
  }

  private async registerDevice(systemDevice: {
    deviceId: string;
    name: string;
    resolution: string;
  }): Promise<CameraDevice> {
    const deviceId = uuidv4();
    const defaultCapabilities = {
      autoFocus: true,
      flash: false,
      zoom: false,
      nightVision: false,
      motionDetection: false
    };
    
    const defaultSettings = {
      brightness: 50,
      contrast: 50,
      saturation: 50,
      quality: 'high' as const,
      format: 'jpeg' as const
    };

    const insertQuery = `
      INSERT INTO camera_devices (
        id, name, device_id, resolution, is_active, 
        capabilities, settings, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

    await this.db.run(insertQuery, [
      deviceId,
      systemDevice.name,
      systemDevice.deviceId,
      systemDevice.resolution,
      JSON.stringify(defaultCapabilities),
      JSON.stringify(defaultSettings)
    ]);

    return {
      id: deviceId,
      name: systemDevice.name,
      deviceId: systemDevice.deviceId,
      resolution: systemDevice.resolution,
      status: 'active',
      capabilities: defaultCapabilities,
      settings: defaultSettings
    };
  }

  private async checkDeviceAvailability(deviceId: string): Promise<boolean> {
    // Simulate device availability check
    // In real implementation, this would check if the camera is accessible
    return Math.random() > 0.1; // 90% success rate for simulation
  }

  private async simulatePhotoCapture(
    device: CameraDevice, 
    settings?: any
  ): Promise<Buffer> {
    // Simulate photo capture by creating a simple image buffer
    // In real implementation, this would interface with camera hardware
    
    // Create a simple 1x1 pixel JPEG as placeholder
    const jpegHeader = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
      0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
      0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x8A, 0x00,
      0xFF, 0xD9
    ]);

    return jpegHeader;
  }
}