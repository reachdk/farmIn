import request from 'supertest';
import app from '../../server';
import { DatabaseManager } from '../../database/DatabaseManager';
import jwt from 'jsonwebtoken';

describe('Camera Routes Integration', () => {
  let dbManager: DatabaseManager;
  let authToken: string;

  beforeAll(async () => {
    // Initialize test database
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();

    // Create test user and generate auth token
    const testUser = {
      id: 'test-user-1',
      employeeNumber: 'TEST001',
      firstName: 'Test',
      lastName: 'User',
      role: 'admin'
    };

    await dbManager.run(
      'INSERT OR REPLACE INTO employees (id, employee_number, first_name, last_name, role, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [testUser.id, testUser.employeeNumber, testUser.firstName, testUser.lastName, testUser.role]
    );

    authToken = jwt.sign(
      { 
        employeeId: testUser.id, 
        employeeNumber: testUser.employeeNumber,
        role: testUser.role,
        type: 'access'
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await dbManager.close();
  });

  beforeEach(async () => {
    // Clean up camera-related tables before each test
    await dbManager.run('DELETE FROM photos');
    await dbManager.run('DELETE FROM camera_devices');
    await dbManager.run('DELETE FROM face_detection_results');
    await dbManager.run('DELETE FROM face_recognition_results');
  });

  describe('GET /api/camera/devices', () => {
    it('should return system detected devices when no devices are registered', async () => {
      const response = await request(app)
        .get('/api/camera/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should return system-detected cameras
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        deviceId: expect.any(String),
        resolution: expect.any(String),
        status: 'active'
      });
    });

    it('should return list of registered and system devices', async () => {
      // Insert test device
      await dbManager.run(
        `INSERT INTO camera_devices (id, name, device_id, resolution, is_active, capabilities, settings, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          'device1',
          'Test Camera',
          'test_cam_1',
          '1920x1080',
          '{"autoFocus": true}',
          '{"quality": "high"}'
        ]
      );

      const response = await request(app)
        .get('/api/camera/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should include registered device plus system-detected cameras
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      
      // Find our registered device
      const registeredDevice = response.body.find((d: any) => d.id === 'device1');
      expect(registeredDevice).toMatchObject({
        id: 'device1',
        name: 'Test Camera',
        deviceId: 'test_cam_1',
        resolution: '1920x1080',
        capabilities: { autoFocus: true },
        settings: { quality: 'high' }
      });
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/camera/devices')
        .expect(401);
    });
  });

  describe('GET /api/camera/devices/:deviceId', () => {
    it('should return specific device', async () => {
      await dbManager.run(
        `INSERT INTO camera_devices (id, name, device_id, resolution, is_active, capabilities, settings, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          'device1',
          'Test Camera',
          'test_cam_1',
          '1920x1080',
          '{"autoFocus": true}',
          '{"quality": "high"}'
        ]
      );

      const response = await request(app)
        .get('/api/camera/devices/device1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'device1',
        name: 'Test Camera',
        deviceId: 'test_cam_1'
      });
    });

    it('should return 404 for non-existent device', async () => {
      await request(app)
        .get('/api/camera/devices/nonexistent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PUT /api/camera/devices/:deviceId/settings', () => {
    it('should update device settings', async () => {
      await dbManager.run(
        `INSERT INTO camera_devices (id, name, device_id, resolution, is_active, capabilities, settings, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          'device1',
          'Test Camera',
          'test_cam_1',
          '1920x1080',
          '{"autoFocus": true}',
          '{"quality": "high"}'
        ]
      );

      const newSettings = {
        quality: 'ultra',
        brightness: 75,
        contrast: 60
      };

      const response = await request(app)
        .put('/api/camera/devices/device1/settings')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newSettings)
        .expect(200);

      expect(response.body.settings).toMatchObject(newSettings);
    });
  });

  describe('POST /api/camera/devices/:deviceId/test', () => {
    it('should test device successfully', async () => {
      await dbManager.run(
        `INSERT INTO camera_devices (id, name, device_id, resolution, is_active, capabilities, settings, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          'device1',
          'Test Camera',
          'test_cam_1',
          '1920x1080',
          '{"autoFocus": true}',
          '{"quality": "high"}'
        ]
      );

      const response = await request(app)
        .post('/api/camera/devices/device1/test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/camera/capture', () => {
    it('should capture photo successfully', async () => {
      await dbManager.run(
        `INSERT INTO camera_devices (id, name, device_id, resolution, is_active, capabilities, settings, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          'device1',
          'Test Camera',
          'test_cam_1',
          '1920x1080',
          '{"autoFocus": true}',
          '{"quality": "high"}'
        ]
      );

      const captureRequest = {
        deviceId: 'device1',
        metadata: {
          purpose: 'manual',
          notes: 'Test capture'
        }
      };

      const response = await request(app)
        .post('/api/camera/capture')
        .set('Authorization', `Bearer ${authToken}`)
        .send(captureRequest)
        .expect(200);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        imageUrl: expect.stringContaining('/api/camera/photos/'),
        thumbnailUrl: expect.stringContaining('/api/camera/photos/'),
        timestamp: expect.any(String),
        metadata: {
          purpose: 'manual',
          notes: 'Test capture'
        }
      });
    });

    it('should require deviceId', async () => {
      const response = await request(app)
        .post('/api/camera/capture')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Device ID is required');
    });
  });

  describe('POST /api/camera/capture/batch', () => {
    it('should capture multiple photos successfully', async () => {
      await dbManager.run(
        `INSERT INTO camera_devices (id, name, device_id, resolution, is_active, capabilities, settings, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          'device1',
          'Test Camera',
          'test_cam_1',
          '1920x1080',
          '{"autoFocus": true}',
          '{"quality": "high"}'
        ]
      );

      const batchRequest = {
        deviceId: 'device1',
        count: 3,
        interval: 100
      };

      const response = await request(app)
        .post('/api/camera/capture/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send(batchRequest)
        .expect(200);

      expect(response.body).toHaveLength(3);
      expect(response.body[0]).toMatchObject({
        id: expect.any(String),
        imageUrl: expect.stringContaining('/api/camera/photos/'),
        thumbnailUrl: expect.stringContaining('/api/camera/photos/')
      });
    });

    it('should validate count parameter', async () => {
      const response = await request(app)
        .post('/api/camera/capture/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ deviceId: 'device1', count: 1 })
        .expect(400);

      expect(response.body.error).toContain('count (2-10) are required');
    });
  });

  describe('POST /api/camera/upload', () => {
    it('should upload photo file successfully', async () => {
      const testImageBuffer = Buffer.from('fake image data');

      const response = await request(app)
        .post('/api/camera/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('photo', testImageBuffer, 'test.jpg')
        .field('purpose', 'manual')
        .field('notes', 'Uploaded test photo')
        .expect(200);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        imageUrl: expect.stringContaining('/api/camera/photos/'),
        thumbnailUrl: expect.stringContaining('/api/camera/photos/'),
        metadata: {
          purpose: 'manual',
          notes: 'Uploaded test photo'
        }
      });
    });

    it('should require photo file', async () => {
      const response = await request(app)
        .post('/api/camera/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toBe('No photo file provided');
    });
  });

  describe('GET /api/camera/photos', () => {
    beforeEach(async () => {
      // Insert test photos
      await dbManager.run(
        `INSERT INTO photos (id, filename, thumbnail_filename, employee_id, file_size, width, height, format, purpose, notes, uploaded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1024, 1920, 1080, 'jpg', 'manual', 'Test photo', 'test-user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['photo1', 'photo1.jpg', 'photo1_thumb.jpg', 'test-user-1']
      );
    });

    it('should return paginated photos', async () => {
      const response = await request(app)
        .get('/api/camera/photos')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        photos: expect.arrayContaining([
          expect.objectContaining({
            id: 'photo1',
            imageUrl: '/api/camera/photos/photo1/image',
            thumbnailUrl: '/api/camera/photos/photo1/thumbnail'
          })
        ]),
        total: 1,
        page: 1,
        limit: 24,
        totalPages: 1
      });
    });

    it('should filter photos by purpose', async () => {
      const response = await request(app)
        .get('/api/camera/photos?purpose=manual')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.photos).toHaveLength(1);
      expect(response.body.photos[0].metadata.purpose).toBe('manual');
    });

    it('should filter photos by employee', async () => {
      const response = await request(app)
        .get('/api/camera/photos?employeeId=test-user-1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.photos).toHaveLength(1);
      expect(response.body.photos[0].employeeId).toBe('test-user-1');
    });
  });

  describe('GET /api/camera/photos/:photoId', () => {
    beforeEach(async () => {
      await dbManager.run(
        `INSERT INTO photos (id, filename, thumbnail_filename, employee_id, file_size, width, height, format, purpose, notes, uploaded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1024, 1920, 1080, 'jpg', 'manual', 'Test photo', 'test-user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['photo1', 'photo1.jpg', 'photo1_thumb.jpg', 'test-user-1']
      );
    });

    it('should return specific photo', async () => {
      const response = await request(app)
        .get('/api/camera/photos/photo1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'photo1',
        employeeId: 'test-user-1',
        metadata: {
          purpose: 'manual',
          notes: 'Test photo'
        }
      });
    });

    it('should return 404 for non-existent photo', async () => {
      await request(app)
        .get('/api/camera/photos/nonexistent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PUT /api/camera/photos/:photoId/metadata', () => {
    beforeEach(async () => {
      await dbManager.run(
        `INSERT INTO photos (id, filename, thumbnail_filename, employee_id, file_size, width, height, format, purpose, notes, uploaded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1024, 1920, 1080, 'jpg', 'manual', 'Test photo', 'test-user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['photo1', 'photo1.jpg', 'photo1_thumb.jpg', 'test-user-1']
      );
    });

    it('should update photo metadata', async () => {
      const updateData = {
        notes: 'Updated notes',
        purpose: 'verification'
      };

      const response = await request(app)
        .put('/api/camera/photos/photo1/metadata')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.metadata).toMatchObject({
        notes: 'Updated notes',
        purpose: 'verification'
      });
    });
  });

  describe('DELETE /api/camera/photos/:photoId', () => {
    beforeEach(async () => {
      await dbManager.run(
        `INSERT INTO photos (id, filename, thumbnail_filename, employee_id, file_size, width, height, format, purpose, notes, uploaded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1024, 1920, 1080, 'jpg', 'manual', 'Test photo', 'test-user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['photo1', 'photo1.jpg', 'photo1_thumb.jpg', 'test-user-1']
      );
    });

    it('should delete photo successfully', async () => {
      await request(app)
        .delete('/api/camera/photos/photo1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify photo is deleted
      const photo = await dbManager.get('SELECT * FROM photos WHERE id = ?', ['photo1']);
      expect(photo).toBeUndefined();
    });
  });

  describe('POST /api/camera/photos/bulk-delete', () => {
    beforeEach(async () => {
      await dbManager.run(
        `INSERT INTO photos (id, filename, thumbnail_filename, employee_id, file_size, width, height, format, purpose, notes, uploaded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1024, 1920, 1080, 'jpg', 'manual', 'Test photo 1', 'test-user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['photo1', 'photo1.jpg', 'photo1_thumb.jpg', 'test-user-1']
      );
      
      await dbManager.run(
        `INSERT INTO photos (id, filename, thumbnail_filename, employee_id, file_size, width, height, format, purpose, notes, uploaded_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1024, 1920, 1080, 'jpg', 'manual', 'Test photo 2', 'test-user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['photo2', 'photo2.jpg', 'photo2_thumb.jpg', 'test-user-1']
      );
    });

    it('should delete multiple photos', async () => {
      const response = await request(app)
        .post('/api/camera/photos/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ photoIds: ['photo1', 'photo2'] })
        .expect(200);

      expect(response.body).toMatchObject({
        deleted: 2,
        failed: 0
      });

      // Verify photos are deleted
      const photos = await dbManager.all('SELECT * FROM photos WHERE id IN (?, ?)', ['photo1', 'photo2']);
      expect(photos).toHaveLength(0);
    });

    it('should require photoIds array', async () => {
      const response = await request(app)
        .post('/api/camera/photos/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Photo IDs array is required');
    });
  });

  describe('GET /api/camera/stats', () => {
    beforeEach(async () => {
      // Insert test photos for statistics
      await dbManager.run(
        `INSERT INTO photos (id, filename, thumbnail_filename, file_size, width, height, format, purpose, uploaded_by, created_at, updated_at)
         VALUES (?, ?, ?, 1024, 1920, 1080, 'jpg', 'manual', 'test-user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['photo1', 'photo1.jpg', 'photo1_thumb.jpg']
      );
    });

    it('should return camera statistics', async () => {
      const response = await request(app)
        .get('/api/camera/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        totalPhotos: expect.any(Number),
        todayPhotos: expect.any(Number),
        weekPhotos: expect.any(Number),
        monthPhotos: expect.any(Number),
        photosByDevice: expect.any(Array),
        photosByPurpose: expect.any(Array),
        faceDetectionRate: expect.any(Number),
        faceRecognitionRate: expect.any(Number),
        averageProcessingTime: expect.any(Number)
      });
    });
  });

  describe('Face Recognition Endpoints', () => {
    beforeEach(async () => {
      await dbManager.run(
        `INSERT INTO photos (id, filename, thumbnail_filename, file_size, width, height, format, purpose, uploaded_by, created_at, updated_at)
         VALUES (?, ?, ?, 1024, 1920, 1080, 'jpg', 'manual', 'test-user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        ['photo1', 'photo1.jpg', 'photo1_thumb.jpg']
      );
    });

    it('should detect faces in photo', async () => {
      const response = await request(app)
        .post('/api/camera/photos/photo1/detect-faces')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        detected: expect.any(Boolean),
        confidence: expect.any(Number),
        matchedEmployees: expect.any(Array)
      });
    });

    it('should recognize faces in photo', async () => {
      const response = await request(app)
        .post('/api/camera/photos/photo1/recognize-faces')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        detected: expect.any(Boolean),
        confidence: expect.any(Number),
        matchedEmployees: expect.any(Array)
      });
    });

    it('should get face recognition status', async () => {
      const response = await request(app)
        .get('/api/camera/face-recognition/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        enabled: expect.any(Boolean),
        trainedEmployees: expect.any(Number),
        accuracy: expect.any(Number)
      });
    });

    it('should train face recognition model', async () => {
      const response = await request(app)
        .post('/api/camera/face-recognition/train')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ forceRetrain: true })
        .expect(200);

      expect(response.body).toMatchObject({
        message: expect.any(String),
        employeesProcessed: expect.any(Number)
      });
    });
  });
});