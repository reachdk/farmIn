import { CameraService } from '../../services/CameraService';
import { DatabaseManager } from '../../database/DatabaseManager';

// Mock dependencies
jest.mock('../../database/DatabaseManager');
jest.mock('../../services/PhotoStorageService');

describe('CameraService Basic Tests', () => {
  let cameraService: CameraService;
  let mockDb: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDb = {
      all: jest.fn(),
      get: jest.fn(),
      run: jest.fn(),
    } as any;
    
    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDb);
    
    cameraService = new CameraService();
  });

  describe('getAvailableDevices', () => {
    it('should return empty array when no devices exist', async () => {
      mockDb.all.mockResolvedValue([]);
      
      // Mock the private detectSystemCameras method to return empty array
      jest.spyOn(cameraService as any, 'detectSystemCameras').mockResolvedValue([]);

      const result = await cameraService.getAvailableDevices();

      expect(result).toEqual([]);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM camera_devices')
      );
    });

    it('should return formatted devices', async () => {
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
      
      // Mock system cameras to return one matching device
      jest.spyOn(cameraService as any, 'detectSystemCameras').mockResolvedValue([
        { deviceId: 'cam1', name: 'Camera 1', resolution: '1920x1080' }
      ]);

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

    it('should handle database errors', async () => {
      mockDb.all.mockRejectedValue(new Error('Database error'));
      jest.spyOn(cameraService as any, 'detectSystemCameras').mockResolvedValue([]);

      await expect(cameraService.getAvailableDevices()).rejects.toThrow('Database error');
    });
  });

  describe('getDevice', () => {
    it('should return null for non-existent device', async () => {
      mockDb.get.mockResolvedValue(undefined);

      const result = await cameraService.getDevice('nonexistent');

      expect(result).toBeNull();
    });

    it('should return formatted device', async () => {
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
  });

  describe('testDevice', () => {
    it('should return failure for non-existent device', async () => {
      mockDb.get.mockResolvedValue(undefined);

      const result = await cameraService.testDevice('nonexistent');

      expect(result).toEqual({
        success: false,
        message: 'Device not found'
      });
    });

    it('should return success for existing device', async () => {
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
  });
});