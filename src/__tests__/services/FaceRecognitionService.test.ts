import { FaceRecognitionService } from '../../services/FaceRecognitionService';
import { DatabaseManager } from '../../database/DatabaseManager';
import { PhotoStorageService } from '../../services/PhotoStorageService';

// Mock dependencies
jest.mock('../../database/DatabaseManager');
jest.mock('../../services/PhotoStorageService');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

describe('FaceRecognitionService', () => {
  let faceRecognitionService: FaceRecognitionService;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockPhotoStorage: jest.Mocked<PhotoStorageService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock environment variable
    process.env.FACE_RECOGNITION_ENABLED = 'true';
    
    // Mock DatabaseManager
    mockDb = {
      get: jest.fn(),
      all: jest.fn(),
      run: jest.fn(),
    } as any;
    
    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDb);
    
    // Mock PhotoStorageService
    mockPhotoStorage = {
      getPhoto: jest.fn(),
      getPhotoFile: jest.fn(),
    } as any;
    
    (PhotoStorageService as jest.Mock).mockImplementation(() => mockPhotoStorage);
    
    faceRecognitionService = new FaceRecognitionService();
  });

  afterEach(() => {
    delete process.env.FACE_RECOGNITION_ENABLED;
  });

  describe('detectFaces', () => {
    it('should detect faces in photo successfully', async () => {
      const mockPhoto = {
        id: 'photo1',
        imageUrl: '/api/camera/photos/photo1/image',
        thumbnailUrl: '/api/camera/photos/photo1/thumbnail',
        timestamp: '2023-01-01T00:00:00Z',
        metadata: {
          resolution: '1920x1080',
          fileSize: 1024,
          format: 'jpg',
          purpose: 'manual'
        }
      };

      const mockPhotoBuffer = Buffer.from('image data');

      mockPhotoStorage.getPhoto.mockResolvedValue(mockPhoto);
      mockPhotoStorage.getPhotoFile.mockResolvedValue(mockPhotoBuffer);
      mockDb.run.mockResolvedValue({} as any);

      const result = await faceRecognitionService.detectFaces('photo1');

      expect(result.detected).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.matchedEmployees).toEqual([]);

      if (result.detected) {
        expect(result.boundingBox).toBeDefined();
        expect(result.landmarks).toBeDefined();
      }

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO face_detection_results'),
        expect.arrayContaining([
          expect.any(String), // id
          'photo1', // photo_id
          result.detected ? 1 : 0, // detected
          result.confidence, // confidence
          result.boundingBox ? JSON.stringify(result.boundingBox) : null,
          result.landmarks ? JSON.stringify(result.landmarks) : null
        ])
      );
    });

    it('should return no detection when face recognition is disabled', async () => {
      process.env.FACE_RECOGNITION_ENABLED = 'false';
      faceRecognitionService = new FaceRecognitionService();

      const result = await faceRecognitionService.detectFaces('photo1');

      expect(result).toEqual({
        detected: false,
        confidence: 0,
        matchedEmployees: []
      });
    });

    it('should throw error for non-existent photo', async () => {
      mockPhotoStorage.getPhoto.mockResolvedValue(null);

      await expect(faceRecognitionService.detectFaces('nonexistent'))
        .rejects.toThrow('Photo not found');
    });

    it('should throw error when photo file not found', async () => {
      const mockPhoto = {
        id: 'photo1',
        imageUrl: '/api/camera/photos/photo1/image',
        thumbnailUrl: '/api/camera/photos/photo1/thumbnail',
        timestamp: '2023-01-01T00:00:00Z',
        metadata: {
          resolution: '1920x1080',
          fileSize: 1024,
          format: 'jpg',
          purpose: 'manual'
        }
      };

      mockPhotoStorage.getPhoto.mockResolvedValue(mockPhoto);
      mockPhotoStorage.getPhotoFile.mockResolvedValue(null);

      await expect(faceRecognitionService.detectFaces('photo1'))
        .rejects.toThrow('Photo file not found');
    });
  });

  describe('recognizeFaces', () => {
    it('should recognize faces in photo successfully', async () => {
      const mockPhoto = {
        id: 'photo1',
        imageUrl: '/api/camera/photos/photo1/image',
        thumbnailUrl: '/api/camera/photos/photo1/thumbnail',
        timestamp: '2023-01-01T00:00:00Z',
        metadata: {
          resolution: '1920x1080',
          fileSize: 1024,
          format: 'jpg',
          purpose: 'manual'
        }
      };

      const mockEmployees = [
        { id: 'emp1', first_name: 'John', last_name: 'Doe' },
        { id: 'emp2', first_name: 'Jane', last_name: 'Smith' }
      ];

      mockPhotoStorage.getPhoto.mockResolvedValue(mockPhoto);
      mockPhotoStorage.getPhotoFile.mockResolvedValue(Buffer.from('image data'));
      mockDb.all.mockResolvedValue(mockEmployees);
      mockDb.run.mockResolvedValue({} as any);

      const result = await faceRecognitionService.recognizeFaces('photo1');

      expect(result.detected).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.matchedEmployees).toBeInstanceOf(Array);

      // Should store both detection and recognition results
      expect(mockDb.run).toHaveBeenCalledTimes(2);
    });

    it('should return no matches when no face detected', async () => {
      const mockPhoto = {
        id: 'photo1',
        imageUrl: '/api/camera/photos/photo1/image',
        thumbnailUrl: '/api/camera/photos/photo1/thumbnail',
        timestamp: '2023-01-01T00:00:00Z',
        metadata: {
          resolution: '1920x1080',
          fileSize: 1024,
          format: 'jpg',
          purpose: 'manual'
        }
      };

      mockPhotoStorage.getPhoto.mockResolvedValue(mockPhoto);
      mockPhotoStorage.getPhotoFile.mockResolvedValue(Buffer.from('image data'));
      mockDb.run.mockResolvedValue({} as any);

      // Mock the detection to return no face detected
      jest.spyOn(faceRecognitionService as any, 'simulateFaceDetection')
        .mockResolvedValue({
          detected: false,
          confidence: 0,
          matchedEmployees: []
        });

      const result = await faceRecognitionService.recognizeFaces('photo1');

      expect(result.detected).toBe(false);
      expect(result.matchedEmployees).toEqual([]);
    });
  });

  describe('trainModel', () => {
    it('should train model for all employees successfully', async () => {
      const mockEmployees = [
        { employee_id: 'emp1' },
        { employee_id: 'emp2' }
      ];

      const mockPhotos = [
        { id: 'photo1', filename: 'photo1.jpg' },
        { id: 'photo2', filename: 'photo2.jpg' },
        { id: 'photo3', filename: 'photo3.jpg' }
      ];

      mockDb.all
        .mockResolvedValueOnce(mockEmployees) // Employees with photos
        .mockResolvedValue(mockPhotos); // Photos for each employee

      mockDb.get.mockResolvedValue(undefined); // No existing models
      mockDb.run.mockResolvedValue({} as any);

      const result = await faceRecognitionService.trainModel();

      expect(result.employeesProcessed).toBe(2);
      expect(result.message).toContain('Training completed for 2 employees');

      // Should update training timestamp
      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE system_settings SET value = ? WHERE key = ?',
        [expect.any(String), 'face_recognition_last_training']
      );
    });

    it('should train model for specific employee', async () => {
      const mockPhotos = [
        { id: 'photo1', filename: 'photo1.jpg' },
        { id: 'photo2', filename: 'photo2.jpg' }
      ];

      mockDb.all.mockResolvedValue(mockPhotos);
      mockDb.get.mockResolvedValue(undefined); // No existing model
      mockDb.run.mockResolvedValue({} as any);

      const result = await faceRecognitionService.trainModel('emp1');

      expect(result.employeesProcessed).toBe(1);
      expect(result.message).toContain('Training completed for 1 employees');
    });

    it('should skip training if model exists and not forcing retrain', async () => {
      const mockPhotos = [
        { id: 'photo1', filename: 'photo1.jpg' },
        { id: 'photo2', filename: 'photo2.jpg' }
      ];

      const existingModel = { id: 'model1' };

      mockDb.all.mockResolvedValue(mockPhotos);
      mockDb.get.mockResolvedValue(existingModel); // Existing model
      mockDb.run.mockResolvedValue({} as any);

      const result = await faceRecognitionService.trainModel('emp1', false);

      expect(result.employeesProcessed).toBe(1);
      // Should not create new model, just update timestamp
    });

    it('should force retrain existing model', async () => {
      const mockPhotos = [
        { id: 'photo1', filename: 'photo1.jpg' },
        { id: 'photo2', filename: 'photo2.jpg' }
      ];

      const existingModel = { id: 'model1' };

      mockDb.all.mockResolvedValue(mockPhotos);
      mockDb.get.mockResolvedValue(existingModel);
      mockDb.run.mockResolvedValue({} as any);

      const result = await faceRecognitionService.trainModel('emp1', true);

      expect(result.employeesProcessed).toBe(1);
      
      // Should update existing model
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE face_recognition_models'),
        expect.arrayContaining([
          expect.any(String), // model_data
          mockPhotos.length, // training_photos
          expect.any(Number), // accuracy
          'emp1' // employee_id
        ])
      );
    });

    it('should handle insufficient training photos', async () => {
      const mockPhotos = [
        { id: 'photo1', filename: 'photo1.jpg' }
      ]; // Only 1 photo, need at least 2

      mockDb.all.mockResolvedValue(mockPhotos);

      const result = await faceRecognitionService.trainModel('emp1');

      expect(result.employeesProcessed).toBe(0);
      expect(result.message).toContain('Training completed for 0 employees');
    });

    it('should return disabled message when face recognition is disabled', async () => {
      process.env.FACE_RECOGNITION_ENABLED = 'false';
      faceRecognitionService = new FaceRecognitionService();

      const result = await faceRecognitionService.trainModel();

      expect(result).toEqual({
        message: 'Face recognition is disabled',
        employeesProcessed: 0
      });
    });
  });

  describe('getStatus', () => {
    it('should return comprehensive face recognition status', async () => {
      const mockTrainedCount = { count: 5 };
      const mockLastTraining = { value: '2023-01-01T00:00:00Z' };
      const mockAccuracy = { avg_confidence: 0.85 };

      mockDb.get
        .mockResolvedValueOnce(mockTrainedCount)
        .mockResolvedValueOnce(mockLastTraining)
        .mockResolvedValueOnce(mockAccuracy);

      const result = await faceRecognitionService.getStatus();

      expect(result).toEqual({
        enabled: true,
        trainedEmployees: 5,
        lastTraining: '2023-01-01T00:00:00Z',
        accuracy: 0.85
      });
    });

    it('should handle missing data gracefully', async () => {
      mockDb.get
        .mockResolvedValueOnce(undefined) // No trained employees
        .mockResolvedValueOnce(undefined) // No last training
        .mockResolvedValueOnce(undefined); // No accuracy data

      const result = await faceRecognitionService.getStatus();

      expect(result).toEqual({
        enabled: true,
        trainedEmployees: 0,
        lastTraining: undefined,
        accuracy: 0
      });
    });

    it('should return disabled status when face recognition is disabled', async () => {
      process.env.FACE_RECOGNITION_ENABLED = 'false';
      faceRecognitionService = new FaceRecognitionService();

      mockDb.get.mockResolvedValue({ count: 0 });

      const result = await faceRecognitionService.getStatus();

      expect(result.enabled).toBe(false);
    });
  });
});