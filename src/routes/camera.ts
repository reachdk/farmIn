import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth';
import { CameraService } from '../services/CameraService';
import { PhotoStorageService } from '../services/PhotoStorageService';
import { FaceRecognitionService } from '../services/FaceRecognitionService';

const router = express.Router();
const cameraService = new CameraService();
const photoStorageService = new PhotoStorageService();
const faceRecognitionService = new FaceRecognitionService();

// Configure multer for photo uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  },
});

// Camera Device Management
router.get('/devices', authenticateToken, async (req, res) => {
  try {
    const devices = await cameraService.getAvailableDevices();
    res.json(devices);
  } catch (error) {
    console.error('Failed to get camera devices:', error);
    res.status(500).json({ error: 'Failed to retrieve camera devices' });
  }
});

router.get('/devices/:deviceId', authenticateToken, async (req, res) => {
  try {
    const device = await cameraService.getDevice(req.params.deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Camera device not found' });
    }
    return res.json(device);
  } catch (error) {
    console.error('Failed to get camera device:', error);
    return res.status(500).json({ error: 'Failed to retrieve camera device' });
  }
});

router.put('/devices/:deviceId/settings', authenticateToken, async (req, res) => {
  try {
    const updatedDevice = await cameraService.updateDeviceSettings(
      req.params.deviceId,
      req.body
    );
    res.json(updatedDevice);
  } catch (error) {
    console.error('Failed to update camera settings:', error);
    res.status(500).json({ error: 'Failed to update camera settings' });
  }
});

router.post('/devices/:deviceId/test', authenticateToken, async (req, res) => {
  try {
    const result = await cameraService.testDevice(req.params.deviceId);
    res.json(result);
  } catch (error) {
    console.error('Camera test failed:', error);
    res.status(500).json({ error: 'Camera test failed' });
  }
});

// Photo Capture
router.post('/capture', authenticateToken, async (req, res) => {
  try {
    const {
      deviceId,
      employeeId,
      attendanceRecordId,
      settings,
      metadata
    } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    const photo = await cameraService.capturePhoto({
      deviceId,
      employeeId,
      attendanceRecordId,
      settings,
      metadata,
      capturedBy: req.user!.employeeId
    });

    return res.json(photo);
  } catch (error) {
    console.error('Photo capture failed:', error);
    return res.status(500).json({ error: 'Failed to capture photo' });
  }
});

router.post('/capture/batch', authenticateToken, async (req, res) => {
  try {
    const {
      deviceId,
      count,
      interval = 1000,
      employeeId,
      attendanceRecordId
    } = req.body;

    if (!deviceId || !count || count < 2 || count > 10) {
      return res.status(400).json({ 
        error: 'Device ID and count (2-10) are required' 
      });
    }

    const photos = await cameraService.captureMultiplePhotos({
      deviceId,
      count,
      interval,
      employeeId,
      attendanceRecordId,
      capturedBy: req.user!.employeeId
    });

    return res.json(photos);
  } catch (error) {
    console.error('Batch capture failed:', error);
    return res.status(500).json({ error: 'Failed to capture batch photos' });
  }
});

// Photo upload endpoint for manual uploads
router.post('/upload', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file provided' });
    }

    const metadata = {
      purpose: req.body.purpose || 'manual',
      notes: req.body.notes,
      location: req.body.location,
      employeeId: req.body.employeeId,
      attendanceRecordId: req.body.attendanceRecordId
    };

    const photo = await photoStorageService.storePhoto({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      metadata,
      uploadedBy: req.user!.employeeId
    });

    return res.json(photo);
  } catch (error) {
    console.error('Photo upload failed:', error);
    return res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// Photo Gallery and Management
router.get('/photos', authenticateToken, async (req, res) => {
  try {
    const filters = {
      employeeId: req.query.employeeId as string,
      deviceId: req.query.deviceId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      purpose: req.query.purpose as string,
      hasAttendanceRecord: req.query.hasAttendanceRecord === 'true',
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 24,
      sortBy: req.query.sortBy as string || 'timestamp',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc'
    };

    const result = await photoStorageService.getPhotos(filters);
    res.json(result);
  } catch (error) {
    console.error('Failed to get photos:', error);
    res.status(500).json({ error: 'Failed to retrieve photos' });
  }
});

router.get('/photos/:photoId', authenticateToken, async (req, res) => {
  try {
    const photo = await photoStorageService.getPhoto(req.params.photoId);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    return res.json(photo);
  } catch (error) {
    console.error('Failed to get photo:', error);
    return res.status(500).json({ error: 'Failed to retrieve photo' });
  }
});

router.put('/photos/:photoId/metadata', authenticateToken, async (req, res) => {
  try {
    const updatedPhoto = await photoStorageService.updatePhotoMetadata(
      req.params.photoId,
      req.body,
      req.user!.employeeId
    );
    return res.json(updatedPhoto);
  } catch (error) {
    console.error('Failed to update photo metadata:', error);
    return res.status(500).json({ error: 'Failed to update photo metadata' });
  }
});

router.delete('/photos/:photoId', authenticateToken, async (req, res) => {
  try {
    await photoStorageService.deletePhoto(req.params.photoId, req.user!.employeeId);
    return res.status(204).send();
  } catch (error) {
    console.error('Failed to delete photo:', error);
    return res.status(500).json({ error: 'Failed to delete photo' });
  }
});

router.post('/photos/bulk-delete', authenticateToken, async (req, res) => {
  try {
    const { photoIds } = req.body;
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({ error: 'Photo IDs array is required' });
    }

    const result = await photoStorageService.bulkDeletePhotos(photoIds, req.user!.employeeId);
    return res.json(result);
  } catch (error) {
    console.error('Bulk delete failed:', error);
    return res.status(500).json({ error: 'Failed to delete photos' });
  }
});

// Face Recognition
router.post('/photos/:photoId/detect-faces', authenticateToken, async (req, res) => {
  try {
    const result = await faceRecognitionService.detectFaces(req.params.photoId);
    res.json(result);
  } catch (error) {
    console.error('Face detection failed:', error);
    res.status(500).json({ error: 'Face detection failed' });
  }
});

router.post('/photos/:photoId/recognize-faces', authenticateToken, async (req, res) => {
  try {
    const result = await faceRecognitionService.recognizeFaces(req.params.photoId);
    res.json(result);
  } catch (error) {
    console.error('Face recognition failed:', error);
    res.status(500).json({ error: 'Face recognition failed' });
  }
});

router.post('/face-recognition/train', authenticateToken, async (req, res) => {
  try {
    const { employeeId, forceRetrain } = req.body;
    const result = await faceRecognitionService.trainModel(employeeId, forceRetrain);
    res.json(result);
  } catch (error) {
    console.error('Face recognition training failed:', error);
    res.status(500).json({ error: 'Face recognition training failed' });
  }
});

router.get('/face-recognition/status', authenticateToken, async (req, res) => {
  try {
    const status = await faceRecognitionService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Failed to get face recognition status:', error);
    res.status(500).json({ error: 'Failed to get face recognition status' });
  }
});

// Statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await photoStorageService.getStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Failed to get camera stats:', error);
    res.status(500).json({ error: 'Failed to retrieve camera statistics' });
  }
});

// Export
router.post('/photos/export', authenticateToken, async (req, res) => {
  try {
    const { filters, format = 'zip', includeMetadata = true } = req.body;
    const result = await photoStorageService.exportPhotos(filters, format, includeMetadata);
    res.json(result);
  } catch (error) {
    console.error('Photo export failed:', error);
    res.status(500).json({ error: 'Failed to export photos' });
  }
});

// Serve photo files
router.get('/photos/:photoId/image', authenticateToken, async (req, res) => {
  try {
    const photoBuffer = await photoStorageService.getPhotoFile(req.params.photoId, false);
    if (!photoBuffer) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    return res.send(photoBuffer);
  } catch (error) {
    console.error('Failed to serve photo:', error);
    return res.status(500).json({ error: 'Failed to serve photo' });
  }
});

router.get('/photos/:photoId/thumbnail', authenticateToken, async (req, res) => {
  try {
    const thumbnailBuffer = await photoStorageService.getPhotoFile(req.params.photoId, true);
    if (!thumbnailBuffer) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }
    
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    return res.send(thumbnailBuffer);
  } catch (error) {
    console.error('Failed to serve thumbnail:', error);
    return res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

// Serve export files
router.get('/exports/:filename', authenticateToken, async (req, res) => {
  try {
    const filename = req.params.filename;
    const exportPath = path.join(process.cwd(), 'data', 'exports', filename);
    
    // Check if file exists
    try {
      await fs.access(exportPath);
    } catch {
      return res.status(404).json({ error: 'Export file not found' });
    }
    
    res.download(exportPath, filename, (err) => {
      if (err) {
        console.error('Failed to download export file:', err);
        res.status(500).json({ error: 'Failed to download export file' });
      }
    });
    return;
  } catch (error) {
    console.error('Failed to serve export file:', error);
    return res.status(500).json({ error: 'Failed to serve export file' });
  }
});

export default router;