import { PhotoStorageService } from '../../services/PhotoStorageService';
import { DatabaseManager } from '../../database/DatabaseManager';

// Mock dependencies
jest.mock('../../database/DatabaseManager');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

describe('PhotoStorageService', () => {
  let photoStorageService: PhotoStorageService;
  let mockDb: jest.Mocked<DatabaseManager>;


  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock DatabaseManager
    mockDb = {
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(),
    } as any;
    
    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDb);
    
    // Mocks are set up in setup.ts
    
    photoStorageService = new PhotoStorageService();
  });

  describe('storePhoto', () => {
    it('should store photo successfully', async () => {
      const request = {
        buffer: Buffer.from('test image'),
        originalName: 'test.jpg',
        mimeType: 'image/jpeg',
        metadata: {
          purpose: 'manual',
          notes: 'Test photo',
          employeeId: 'emp1'
        },
        uploadedBy: 'user1'
      };

      mockDb.run.mockResolvedValue({} as any);

      const result = await photoStorageService.storePhoto(request);

      expect(result).toMatchObject({
        id: expect.any(String),
        imageUrl: expect.stringContaining('/api/camera/photos/'),
        thumbnailUrl: expect.stringContaining('/api/camera/photos/'),
        employeeId: 'emp1',
        timestamp: expect.any(String),
        metadata: {
          resolution: '1920x1080',
          fileSize: expect.any(Number),
          format: 'jpg',
          purpose: 'manual',
          notes: 'Test photo'
        }
      });

      const fs = require('fs/promises');
      expect(fs.writeFile).toHaveBeenCalledTimes(2); // Main image and thumbnail
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO photos'),
        expect.arrayContaining([
          expect.any(String), // id
          expect.stringContaining('.jpg'), // filename
          expect.stringContaining('_thumb.jpg'), // thumbnail_filename
          'emp1', // employee_id
          null, // device_id
          null, // attendance_record_id
          expect.any(Number), // file_size
          1920, // width
          1080, // height
          'jpg', // format
          'manual', // purpose
          null, // location
          'Test photo', // notes
          'user1', // uploaded_by
          expect.any(String), // created_at
          expect.any(String) // updated_at
        ])
      );
    });

    it('should handle storage errors gracefully', async () => {
      const request = {
        buffer: Buffer.from('test image'),
        originalName: 'test.jpg',
        mimeType: 'image/jpeg',
        metadata: {
          purpose: 'manual'
        },
        uploadedBy: 'user1'
      };

      const fs = require('fs/promises');
      fs.writeFile.mockRejectedValue(new Error('Disk full'));

      await expect(photoStorageService.storePhoto(request)).rejects.toThrow('Disk full');
    });
  });

  describe('getPhotos', () => {
    it('should return paginated photos with filters', async () => {
      const mockPhotos = [
        {
          id: 'photo1',
          filename: 'photo1.jpg',
          thumbnail_filename: 'photo1_thumb.jpg',
          employee_id: 'emp1',
          device_id: 'dev1',
          attendance_record_id: null,
          file_size: 1024,
          width: 1920,
          height: 1080,
          format: 'jpg',
          purpose: 'manual',
          location: null,
          notes: 'Test photo',
          created_at: '2023-01-01T00:00:00Z',
          first_name: 'John',
          last_name: 'Doe',
          device_name: 'Camera 1'
        }
      ];

      mockDb.get.mockResolvedValue({ total: 1 });
      mockDb.all.mockResolvedValue(mockPhotos);

      const filters = {
        page: 1,
        limit: 24,
        employeeId: 'emp1',
        purpose: 'manual' as const
      };

      const result = await photoStorageService.getPhotos(filters);

      expect(result).toMatchObject({
        photos: [
          {
            id: 'photo1',
            imageUrl: '/api/camera/photos/photo1/image',
            thumbnailUrl: '/api/camera/photos/photo1/thumbnail',
            employeeId: 'emp1',
            deviceId: 'dev1',
            attendanceRecordId: null,
            timestamp: '2023-01-01T00:00:00Z',
            metadata: {
              resolution: '1920x1080',
              fileSize: 1024,
              format: 'jpg',
              purpose: 'manual',
              notes: 'Test photo'
            }
          }
        ],
        total: 1,
        page: 1,
        limit: 24,
        totalPages: 1
      });

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE 1=1 AND employee_id = ? AND purpose = ?'),
        expect.arrayContaining(['emp1', 'manual', 24, 0])
      );
    });

    it('should handle date range filters', async () => {
      mockDb.get.mockResolvedValue({ total: 0 });
      mockDb.all.mockResolvedValue([]);

      const filters = {
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        page: 1,
        limit: 24
      };

      await photoStorageService.getPhotos(filters);

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('AND created_at >= ? AND created_at <= ?'),
        expect.arrayContaining(['2023-01-01', '2023-01-31', 24, 0])
      );
    });

    it('should handle attendance record filter', async () => {
      mockDb.get.mockResolvedValue({ total: 0 });
      mockDb.all.mockResolvedValue([]);

      const filters = {
        hasAttendanceRecord: true,
        page: 1,
        limit: 24
      };

      await photoStorageService.getPhotos(filters);

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('AND attendance_record_id IS NOT NULL'),
        expect.arrayContaining([24, 0])
      );
    });
  });

  describe('getPhoto', () => {
    it('should return specific photo by ID', async () => {
      const mockPhoto = {
        id: 'photo1',
        filename: 'photo1.jpg',
        thumbnail_filename: 'photo1_thumb.jpg',
        employee_id: 'emp1',
        device_id: 'dev1',
        attendance_record_id: null,
        file_size: 1024,
        width: 1920,
        height: 1080,
        format: 'jpg',
        purpose: 'manual',
        location: null,
        notes: 'Test photo',
        created_at: '2023-01-01T00:00:00Z'
      };

      mockDb.get.mockResolvedValue(mockPhoto);

      const result = await photoStorageService.getPhoto('photo1');

      expect(result).toMatchObject({
        id: 'photo1',
        imageUrl: '/api/camera/photos/photo1/image',
        thumbnailUrl: '/api/camera/photos/photo1/thumbnail',
        employeeId: 'emp1',
        deviceId: 'dev1',
        metadata: {
          resolution: '1920x1080',
          fileSize: 1024,
          format: 'jpg',
          purpose: 'manual',
          notes: 'Test photo'
        }
      });
    });

    it('should return null for non-existent photo', async () => {
      mockDb.get.mockResolvedValue(undefined);

      const result = await photoStorageService.getPhoto('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getPhotoFile', () => {
    it('should return photo file buffer', async () => {
      const mockPhoto = {
        filename: 'photo1.jpg',
        thumbnail_filename: 'photo1_thumb.jpg'
      };

      mockDb.get.mockResolvedValue(mockPhoto);
      const fs = require('fs/promises');
      fs.readFile.mockResolvedValue(Buffer.from('image data'));

      const result = await photoStorageService.getPhotoFile('photo1', false);

      expect(result).toEqual(Buffer.from('image data'));
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('photo1.jpg')
      );
    });

    it('should return thumbnail file buffer', async () => {
      const mockPhoto = {
        filename: 'photo1.jpg',
        thumbnail_filename: 'photo1_thumb.jpg'
      };

      mockDb.get.mockResolvedValue(mockPhoto);
      const fs = require('fs/promises');
      fs.readFile.mockResolvedValue(Buffer.from('thumbnail data'));

      const result = await photoStorageService.getPhotoFile('photo1', true);

      expect(result).toEqual(Buffer.from('thumbnail data'));
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('photo1_thumb.jpg')
      );
    });

    it('should return null for non-existent photo', async () => {
      mockDb.get.mockResolvedValue(undefined);

      const result = await photoStorageService.getPhotoFile('nonexistent', false);

      expect(result).toBeNull();
    });
  });

  describe('updatePhotoMetadata', () => {
    it('should update photo metadata successfully', async () => {
      const mockUpdatedPhoto = {
        id: 'photo1',
        filename: 'photo1.jpg',
        thumbnail_filename: 'photo1_thumb.jpg',
        employee_id: 'emp2',
        device_id: 'dev1',
        attendance_record_id: null,
        file_size: 1024,
        width: 1920,
        height: 1080,
        format: 'jpg',
        purpose: 'verification',
        location: null,
        notes: 'Updated notes',
        created_at: '2023-01-01T00:00:00Z'
      };

      mockDb.run.mockResolvedValue({} as any);
      mockDb.get.mockResolvedValue(mockUpdatedPhoto);

      const metadata = {
        employeeId: 'emp2',
        purpose: 'verification',
        notes: 'Updated notes'
      };

      const result = await photoStorageService.updatePhotoMetadata('photo1', metadata, 'user1');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE photos'),
        ['emp2', 'Updated notes', 'verification', 'photo1']
      );

      expect(result.metadata.purpose).toBe('verification');
      expect(result.metadata.notes).toBe('Updated notes');
    });
  });

  describe('deletePhoto', () => {
    it('should delete photo and files successfully', async () => {
      const mockPhoto = {
        filename: 'photo1.jpg',
        thumbnail_filename: 'photo1_thumb.jpg'
      };

      mockDb.get.mockResolvedValue(mockPhoto);
      mockDb.run.mockResolvedValue({} as any);
      const fs = require('fs/promises');
      fs.unlink.mockResolvedValue(undefined);

      await photoStorageService.deletePhoto('photo1', 'user1');

      expect(fs.unlink).toHaveBeenCalledTimes(2); // Main image and thumbnail
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM photos WHERE id = ?',
        ['photo1']
      );
    });

    it('should handle file deletion errors gracefully', async () => {
      const mockPhoto = {
        filename: 'photo1.jpg',
        thumbnail_filename: 'photo1_thumb.jpg'
      };

      mockDb.get.mockResolvedValue(mockPhoto);
      mockDb.run.mockResolvedValue({} as any);
      const fs = require('fs/promises');
      fs.unlink.mockRejectedValue(new Error('File not found'));

      // Should not throw error even if file deletion fails
      await expect(photoStorageService.deletePhoto('photo1', 'user1')).resolves.not.toThrow();
      expect(mockDb.run).toHaveBeenCalled(); // Database deletion should still happen
    });

    it('should throw error for non-existent photo', async () => {
      mockDb.get.mockResolvedValue(undefined);

      await expect(photoStorageService.deletePhoto('nonexistent', 'user1'))
        .rejects.toThrow('Photo not found');
    });
  });

  describe('bulkDeletePhotos', () => {
    it('should delete multiple photos and return results', async () => {
      const mockPhoto = {
        filename: 'photo1.jpg',
        thumbnail_filename: 'photo1_thumb.jpg'
      };

      mockDb.get.mockResolvedValue(mockPhoto);
      mockDb.run.mockResolvedValue({} as any);
      const fs = require('fs/promises');
      fs.unlink.mockResolvedValue(undefined);

      const result = await photoStorageService.bulkDeletePhotos(['photo1', 'photo2'], 'user1');

      expect(result).toEqual({ deleted: 2, failed: 0 });
    });

    it('should handle partial failures in bulk delete', async () => {
      mockDb.get
        .mockResolvedValueOnce({ filename: 'photo1.jpg', thumbnail_filename: 'photo1_thumb.jpg' })
        .mockResolvedValueOnce(undefined); // Second photo doesn't exist

      mockDb.run.mockResolvedValue({} as any);
      const fs = require('fs/promises');
      fs.unlink.mockResolvedValue(undefined);

      const result = await photoStorageService.bulkDeletePhotos(['photo1', 'photo2'], 'user1');

      expect(result).toEqual({ deleted: 1, failed: 1 });
    });
  });

  describe('getStatistics', () => {
    it('should return comprehensive photo statistics', async () => {
      const mockStats = {
        totalPhotos: { count: 100 },
        todayPhotos: { count: 10 },
        weekPhotos: { count: 50 },
        monthPhotos: { count: 80 }
      };

      const mockDeviceStats = [
        { device_id: 'dev1', device_name: 'Camera 1', count: 60 },
        { device_id: 'dev2', device_name: 'Camera 2', count: 40 }
      ];

      const mockPurposeStats = [
        { purpose: 'attendance', count: 70 },
        { purpose: 'manual', count: 30 }
      ];

      mockDb.get
        .mockResolvedValueOnce(mockStats.totalPhotos)
        .mockResolvedValueOnce(mockStats.todayPhotos)
        .mockResolvedValueOnce(mockStats.weekPhotos)
        .mockResolvedValueOnce(mockStats.monthPhotos);

      mockDb.all
        .mockResolvedValueOnce(mockDeviceStats)
        .mockResolvedValueOnce(mockPurposeStats);

      const result = await photoStorageService.getStatistics();

      expect(result).toMatchObject({
        totalPhotos: 100,
        todayPhotos: 10,
        weekPhotos: 50,
        monthPhotos: 80,
        photosByDevice: [
          { deviceId: 'dev1', deviceName: 'Camera 1', count: 60 },
          { deviceId: 'dev2', deviceName: 'Camera 2', count: 40 }
        ],
        photosByPurpose: [
          { purpose: 'attendance', count: 70 },
          { purpose: 'manual', count: 30 }
        ],
        faceDetectionRate: 0.85,
        faceRecognitionRate: 0.72,
        averageProcessingTime: 1.2
      });
    });
  });
});