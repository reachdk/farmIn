import { CameraService } from '../../services/CameraService';
import { PhotoStorageService } from '../../services/PhotoStorageService';
import { DatabaseManager } from '../../database/DatabaseManager';

// Mock dependencies
jest.mock('../../database/DatabaseManager');
jest.mock('../../services/PhotoStorageService');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

describe('CameraService', () => {
  let cameraService: CameraService;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockPhotoStorage: jest.Mocked<PhotoStorageService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock DatabaseManager
    mockDb = {
      all: jest.fn(),
      get: jest.fn(),
      run: jest.fn(),
    } as any;
    
    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDb);
    
    // Mock PhotoStorageService
    mockPhotoStorage = {
      storePhoto: jest.fn(),
    } as any;
    
    (PhotoStorageService as jest.Mock).mockImplementation(() => mockPhotoStorage);
    
    cameraService = new CameraService();
  });

  describe('getAvailableDevices', () => {
    it('should return list of available camera devices', async () => {
      const mockDevices = [
        {
          id: 'device1',
          name: 'Camera 1',
          device_id: 'cam1',
          resolution: '1920x1080',
          is_active: 1,
          capabilities: '{"autoFocus": true}',
          settings: '{"quality": "high"}'
        }
      ];

      mockDb.all.mockResolvedValue(mockDevices);

      const result = await cameraService.getAvailableDevices();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'device1',
        name: 'Camera 1',
        deviceId: 'cam1',
        resolution: '1920x1080',
        status: 'active',
        capabilities: { autoFocus: true },
        settings: { quality: 'high' }
      });
    });

    it('should handle database errors gracefully', async () => {
      mockDb.all.mockRejectedValue(new Error('Database error'));

      await expect(cameraService.getAvailableDevices()).rejects.toThrow('Database error');
    });
  });

  describe('getDevice', () => {
    it('should return specific device by ID', async () => {
      const mockDevice = {
        id: 'device1',
        name: 'Camera 1',
        device_id: 'cam1',
        resolution: '1920x1080',
        is_active: 1,
        capabilities: '{"autoFocus": true}',
        settings: '{"quality": "high"}',
        last_used: '2023-01-01T00:00:00Z'
      };

      mockDb.get.mockResolvedValue(mockDevice);

      const result = await cameraService.getDevice('device1');

      expect(result).toMatchObject({
        id: 'device1',
        name: 'Camera 1',
        deviceId: 'cam1',
        resolution: '1920x1080',
        status: 'active',
        capabilities: { autoFocus: true },
        settings: { quality: 'high' },
        lastUsed: '2023-01-01T00:00:00Z'
      });
    });

    it('should return null for non-existent device', async () => {
      mockDb.get.mockResolvedValue(undefined);

      const result = await cameraService.getDevice('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateDeviceSettings', () => {
    it('should update device settings successfully', async () => {
      const mockDevice = {
        id: 'device1',
        name: 'Camera 1',
        device_id: 'cam1',
        resolution: '1920x1080',
        is_active: 1,
        capabilities: '{"autoFocus": true}',
        settings: '{"quality": "ultra"}',
      };

      mockDb.run.mockResolvedValue({} as any);
      mockDb.get.mockResolvedValue(mockDevice);

      const newSettings = { quality: 'ultra', brightness: 75 };
      const result = await cameraService.updateDeviceSettings('device1', newSettings);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE camera_devices'),
        expect.arrayContaining([JSON.stringify(newSettings), 'device1', 'device1'])
      );
      expect(result.settings).toEqual({ quality: 'ultra' });
    });

    it('should throw error if device not found after update', async () => {
      mockDb.run.mockResolvedValue({} as any);
      mockDb.get.mockResolvedValue(undefined);

      await expect(
        cameraService.updateDeviceSettings('device1', { quality: 'high' })
      ).rejects.toThrow('Device not found after update');
    });
  });

  describe('testDevice', () => {
    it('should return success for active device', async () => {
      const mockDevice = {
        id: 'device1',
        name: 'Camera 1',
        device_id: 'cam1',
        resolution: '1920x1080',
        is_active: 1,
        capabilities: '{"autoFocus": true}',
        settings: '{"quality": "high"}',
      };

      mockDb.get.mockResolvedValue(mockDevice);
      mockDb.run.mockResolvedValue({} as any);

      const result = await cameraService.testDevice('device1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Camera test successful');
    });

    it('should return failure for non-existent device', async () => {
      mockDb.get.mockResolvedValue(undefined);

      const result = await cameraService.testDevice('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Device not found');
    });
  });

  describe('capturePhoto', () => {
    it('should capture photo successfully', async () => {
      const mockDevice = {
        id: 'device1',
        name: 'Camera 1',
        device_id: 'cam1',
        resolution: '1920x1080',
        is_active: 1,
        capabilities: '{"autoFocus": true}',
        settings: '{"quality": "high"}',
        status: 'active'
      };

      const mockPhoto = {
        id: 'photo1',
        imageUrl: '/api/camera/photos/photo1/image',
        thumbnailUrl: '/api/camera/photos/photo1/thumbnail',
        timestamp: '2023-01-01T00:00:00Z',
        metadata: {
          resolution: '1920x1080',
          fileSize: 1024,
          format: 'jpeg',
          purpose: 'manual'
        }
      };

      mockDb.get.mockResolvedValue(mockDevice);
      mockDb.run.mockResolvedValue({} as any);
      mockPhotoStorage.storePhoto.mockResolvedValue(mockPhoto);

      const request = {
        deviceId: 'device1',
        metadata: { purpose: 'manual' as const },
        capturedBy: 'user1'
      };

      const result = await cameraService.capturePhoto(request);

      expect(result).toEqual(mockPhoto);
      expect(mockPhotoStorage.storePhoto).toHaveBeenCalledWith({
        buffer: expect.any(Buffer),
        originalName: expect.stringContaining('capture_'),
        mimeType: 'image/jpeg',
        metadata: expect.objectContaining({
          purpose: 'manual',
          deviceId: 'device1'
        }),
        uploadedBy: 'user1'
      });
    });

    it('should throw error for inactive device', async () => {
      const mockDevice = {
        id: 'device1',
        name: 'Camera 1',
        device_id: 'cam1',
        resolution: '1920x1080',
        is_active: 1,
        capabilities: '{"autoFocus": true}',
        settings: '{"quality": "high"}',
        status: 'inactive'
      };

      mockDb.get.mockResolvedValue(mockDevice);

      const request = {
        deviceId: 'device1',
        metadata: { purpose: 'manual' as const },
        capturedBy: 'user1'
      };

      await expect(cameraService.capturePhoto(request)).rejects.toThrow('Camera device is not active');
    });

    it('should throw error for non-existent device', async () => {
      mockDb.get.mockResolvedValue(undefined);

      const request = {
        deviceId: 'nonexistent',
        metadata: { purpose: 'manual' as const },
        capturedBy: 'user1'
      };

      await expect(cameraService.capturePhoto(request)).rejects.toThrow('Camera device not found');
    });
  });

  describe('captureMultiplePhotos', () => {
    it('should capture multiple photos successfully', async () => {
      const mockDevice = {
        id: 'device1',
        name: 'Camera 1',
        device_id: 'cam1',
        resolution: '1920x1080',
        is_active: 1,
        capabilities: '{"autoFocus": true}',
        settings: '{"quality": "high"}',
        status: 'active'
      };

      const mockPhoto = {
        id: 'photo1',
        imageUrl: '/api/camera/photos/photo1/image',
        thumbnailUrl: '/api/camera/photos/photo1/thumbnail',
        timestamp: '2023-01-01T00:00:00Z',
        metadata: {
          resolution: '1920x1080',
          fileSize: 1024,
          format: 'jpeg',
          purpose: 'attendance'
        }
      };

      mockDb.get.mockResolvedValue(mockDevice);
      mockDb.run.mockResolvedValue({} as any);
      mockPhotoStorage.storePhoto.mockResolvedValue(mockPhoto);

      const request = {
        deviceId: 'device1',
        count: 3,
        interval: 100, // Short interval for testing
        capturedBy: 'user1'
      };

      const result = await cameraService.captureMultiplePhotos(request);

      expect(result).toHaveLength(3);
      expect(mockPhotoStorage.storePhoto).toHaveBeenCalledTimes(3);
    });

    it('should handle capture failures in batch', async () => {
      const mockDevice = {
        id: 'device1',
        name: 'Camera 1',
        device_id: 'cam1',
        resolution: '1920x1080',
        is_active: 1,
        capabilities: '{"autoFocus": true}',
        settings: '{"quality": "high"}',
        status: 'active'
      };

      mockDb.get.mockResolvedValue(mockDevice);
      mockDb.run.mockResolvedValue({} as any);
      mockPhotoStorage.storePhoto.mockRejectedValue(new Error('Storage error'));

      const request = {
        deviceId: 'device1',
        count: 2,
        interval: 100,
        capturedBy: 'user1'
      };

      await expect(cameraService.captureMultiplePhotos(request)).rejects.toThrow('Storage error');
    });
  });
});