import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import archiver from 'archiver';
import { DatabaseManager } from '../database/DatabaseManager';

export interface PhotoStorageRequest {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  metadata: {
    purpose: string;
    notes?: string;
    location?: string;
    deviceId?: string;
    employeeId?: string;
    attendanceRecordId?: string;
  };
  uploadedBy: string;
}

export interface PhotoRecord {
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

export interface PhotoGalleryFilter {
  employeeId?: string;
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  purpose?: string;
  hasAttendanceRecord?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PhotoGalleryResponse {
  photos: PhotoRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class PhotoStorageService {
  private db: DatabaseManager;
  private storageDir: string;
  private thumbnailDir: string;

  constructor() {
    this.db = DatabaseManager.getInstance();
    this.storageDir = path.join(process.cwd(), 'data', 'photos');
    this.thumbnailDir = path.join(process.cwd(), 'data', 'thumbnails');
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      await fs.mkdir(this.thumbnailDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create storage directories:', error);
    }
  }

  async storePhoto(request: PhotoStorageRequest): Promise<PhotoRecord> {
    try {
      const photoId = uuidv4();
      const timestamp = new Date().toISOString();
      
      // Determine file extension from mime type
      const extension = this.getExtensionFromMimeType(request.mimeType);
      const filename = `${photoId}.${extension}`;
      const thumbnailFilename = `${photoId}_thumb.${extension}`;
      
      const filePath = path.join(this.storageDir, filename);
      const thumbnailPath = path.join(this.thumbnailDir, thumbnailFilename);

      // Process and save the main image
      const processedImage = await sharp(request.buffer)
        .jpeg({ quality: 90 })
        .toBuffer();
      
      await fs.writeFile(filePath, processedImage);

      // Create thumbnail
      const thumbnailBuffer = await sharp(request.buffer)
        .resize(200, 200, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toBuffer();
      
      await fs.writeFile(thumbnailPath, thumbnailBuffer);

      // Get image metadata
      const imageMetadata = await sharp(request.buffer).metadata();
      
      const photoRecord = {
        id: photoId,
        imageUrl: `/api/camera/photos/${photoId}/image`,
        thumbnailUrl: `/api/camera/photos/${photoId}/thumbnail`,
        employeeId: request.metadata.employeeId,
        deviceId: request.metadata.deviceId,
        attendanceRecordId: request.metadata.attendanceRecordId,
        timestamp,
        metadata: {
          resolution: `${imageMetadata.width}x${imageMetadata.height}`,
          fileSize: processedImage.length,
          format: extension,
          location: request.metadata.location,
          purpose: request.metadata.purpose,
          notes: request.metadata.notes
        }
      };

      // Save to database
      const insertQuery = `
        INSERT INTO photos (
          id, filename, thumbnail_filename, employee_id, device_id, 
          attendance_record_id, file_size, width, height, format,
          purpose, location, notes, uploaded_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db.run(insertQuery, [
        photoId,
        filename,
        thumbnailFilename,
        request.metadata.employeeId || null,
        request.metadata.deviceId || null,
        request.metadata.attendanceRecordId || null,
        processedImage.length,
        imageMetadata.width,
        imageMetadata.height,
        extension,
        request.metadata.purpose,
        request.metadata.location || null,
        request.metadata.notes || null,
        request.uploadedBy,
        timestamp,
        timestamp
      ]);

      return photoRecord;
    } catch (error) {
      console.error('Failed to store photo:', error);
      throw error;
    }
  }

  async getPhotos(filters: PhotoGalleryFilter): Promise<PhotoGalleryResponse> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 24;
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE 1=1';
      const params: any[] = [];

      if (filters.employeeId) {
        whereClause += ' AND employee_id = ?';
        params.push(filters.employeeId);
      }

      if (filters.deviceId) {
        whereClause += ' AND device_id = ?';
        params.push(filters.deviceId);
      }

      if (filters.startDate) {
        whereClause += ' AND created_at >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND created_at <= ?';
        params.push(filters.endDate);
      }

      if (filters.purpose) {
        whereClause += ' AND purpose = ?';
        params.push(filters.purpose);
      }

      if (filters.hasAttendanceRecord !== undefined) {
        if (filters.hasAttendanceRecord) {
          whereClause += ' AND attendance_record_id IS NOT NULL';
        } else {
          whereClause += ' AND attendance_record_id IS NULL';
        }
      }

      const sortBy = filters.sortBy || 'created_at';
      const sortOrder = filters.sortOrder || 'desc';
      
      // Map frontend sort fields to database columns
      const sortFieldMap: { [key: string]: string } = {
        'timestamp': 'created_at',
        'employeeName': 'e.first_name',
        'deviceName': 'cd.name',
        'created_at': 'created_at'
      };
      
      const dbSortField = sortFieldMap[sortBy] || 'created_at';
      const orderClause = `ORDER BY ${dbSortField} ${sortOrder.toUpperCase()}`;

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM photos ${whereClause}`;
      const countResult = await this.db.get(countQuery, params);
      const total = countResult.total;

      // Get photos
      const photosQuery = `
        SELECT p.*, e.first_name, e.last_name, cd.name as device_name
        FROM photos p
        LEFT JOIN employees e ON p.employee_id = e.id
        LEFT JOIN camera_devices cd ON p.device_id = cd.id
        ${whereClause}
        ${orderClause}
        LIMIT ? OFFSET ?
      `;

      const photos = await this.db.all(photosQuery, [...params, limit, offset]);

      const photoRecords: PhotoRecord[] = photos.map(photo => ({
        id: photo.id,
        imageUrl: `/api/camera/photos/${photo.id}/image`,
        thumbnailUrl: `/api/camera/photos/${photo.id}/thumbnail`,
        employeeId: photo.employee_id,
        deviceId: photo.device_id,
        attendanceRecordId: photo.attendance_record_id,
        timestamp: photo.created_at,
        metadata: {
          resolution: `${photo.width}x${photo.height}`,
          fileSize: photo.file_size,
          format: photo.format,
          location: photo.location,
          purpose: photo.purpose,
          notes: photo.notes
        }
      }));

      return {
        photos: photoRecords,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Failed to get photos:', error);
      throw error;
    }
  }

  async getPhoto(photoId: string): Promise<PhotoRecord | null> {
    try {
      const query = `
        SELECT p.*, e.first_name, e.last_name, cd.name as device_name
        FROM photos p
        LEFT JOIN employees e ON p.employee_id = e.id
        LEFT JOIN camera_devices cd ON p.device_id = cd.id
        WHERE p.id = ?
      `;

      const photo = await this.db.get(query, [photoId]);
      
      if (!photo) {
        return null;
      }

      return {
        id: photo.id,
        imageUrl: `/api/camera/photos/${photo.id}/image`,
        thumbnailUrl: `/api/camera/photos/${photo.id}/thumbnail`,
        employeeId: photo.employee_id,
        deviceId: photo.device_id,
        attendanceRecordId: photo.attendance_record_id,
        timestamp: photo.created_at,
        metadata: {
          resolution: `${photo.width}x${photo.height}`,
          fileSize: photo.file_size,
          format: photo.format,
          location: photo.location,
          purpose: photo.purpose,
          notes: photo.notes
        }
      };
    } catch (error) {
      console.error('Failed to get photo:', error);
      throw error;
    }
  }

  async getPhotoFile(photoId: string, thumbnail = false): Promise<Buffer | null> {
    try {
      const query = `SELECT ${thumbnail ? 'thumbnail_filename' : 'filename'} FROM photos WHERE id = ?`;
      const result = await this.db.get(query, [photoId]);
      
      if (!result) {
        return null;
      }

      const filename = thumbnail ? result.thumbnail_filename : result.filename;
      const filePath = path.join(thumbnail ? this.thumbnailDir : this.storageDir, filename);
      
      return await fs.readFile(filePath);
    } catch (error) {
      console.error('Failed to get photo file:', error);
      return null;
    }
  }

  async updatePhotoMetadata(
    photoId: string, 
    metadata: { employeeId?: string; notes?: string; purpose?: string },
    updatedBy: string
  ): Promise<PhotoRecord> {
    try {
      const updateQuery = `
        UPDATE photos 
        SET employee_id = COALESCE(?, employee_id),
            notes = COALESCE(?, notes),
            purpose = COALESCE(?, purpose),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await this.db.run(updateQuery, [
        metadata.employeeId,
        metadata.notes,
        metadata.purpose,
        photoId
      ]);

      const updatedPhoto = await this.getPhoto(photoId);
      if (!updatedPhoto) {
        throw new Error('Photo not found after update');
      }

      return updatedPhoto;
    } catch (error) {
      console.error('Failed to update photo metadata:', error);
      throw error;
    }
  }

  async deletePhoto(photoId: string, deletedBy: string): Promise<void> {
    try {
      // Get photo info first
      const photo = await this.db.get('SELECT filename, thumbnail_filename FROM photos WHERE id = ?', [photoId]);
      
      if (!photo) {
        throw new Error('Photo not found');
      }

      // Delete files
      const filePath = path.join(this.storageDir, photo.filename);
      const thumbnailPath = path.join(this.thumbnailDir, photo.thumbnail_filename);
      
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.warn('Failed to delete photo file:', error);
      }
      
      try {
        await fs.unlink(thumbnailPath);
      } catch (error) {
        console.warn('Failed to delete thumbnail file:', error);
      }

      // Delete from database
      await this.db.run('DELETE FROM photos WHERE id = ?', [photoId]);
    } catch (error) {
      console.error('Failed to delete photo:', error);
      throw error;
    }
  }

  async bulkDeletePhotos(photoIds: string[], deletedBy: string): Promise<{ deleted: number; failed: number }> {
    let deleted = 0;
    let failed = 0;

    for (const photoId of photoIds) {
      try {
        await this.deletePhoto(photoId, deletedBy);
        deleted++;
      } catch (error) {
        console.error(`Failed to delete photo ${photoId}:`, error);
        failed++;
      }
    }

    return { deleted, failed };
  }

  async getStatistics(): Promise<{
    totalPhotos: number;
    todayPhotos: number;
    weekPhotos: number;
    monthPhotos: number;
    photosByDevice: { deviceId: string; deviceName: string; count: number }[];
    photosByPurpose: { purpose: string; count: number }[];
    faceDetectionRate: number;
    faceRecognitionRate: number;
    averageProcessingTime: number;
  }> {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Total photos
      const totalResult = await this.db.get('SELECT COUNT(*) as count FROM photos');
      const totalPhotos = totalResult.count;

      // Today's photos
      const todayResult = await this.db.get('SELECT COUNT(*) as count FROM photos WHERE created_at >= ?', [today]);
      const todayPhotos = todayResult.count;

      // Week photos
      const weekResult = await this.db.get('SELECT COUNT(*) as count FROM photos WHERE created_at >= ?', [weekAgo]);
      const weekPhotos = weekResult.count;

      // Month photos
      const monthResult = await this.db.get('SELECT COUNT(*) as count FROM photos WHERE created_at >= ?', [monthAgo]);
      const monthPhotos = monthResult.count;

      // Photos by device
      const deviceQuery = `
        SELECT p.device_id, cd.name as device_name, COUNT(*) as count
        FROM photos p
        LEFT JOIN camera_devices cd ON p.device_id = cd.id
        WHERE p.device_id IS NOT NULL
        GROUP BY p.device_id, cd.name
        ORDER BY count DESC
      `;
      const photosByDevice = await this.db.all(deviceQuery);

      // Photos by purpose
      const purposeQuery = `
        SELECT purpose, COUNT(*) as count
        FROM photos
        GROUP BY purpose
        ORDER BY count DESC
      `;
      const photosByPurpose = await this.db.all(purposeQuery);

      return {
        totalPhotos,
        todayPhotos,
        weekPhotos,
        monthPhotos,
        photosByDevice: photosByDevice.map(row => ({
          deviceId: row.device_id,
          deviceName: row.device_name || 'Unknown Device',
          count: row.count
        })),
        photosByPurpose: photosByPurpose.map(row => ({
          purpose: row.purpose,
          count: row.count
        })),
        faceDetectionRate: 0.85, // Placeholder - would be calculated from actual processing results
        faceRecognitionRate: 0.72, // Placeholder - would be calculated from actual processing results
        averageProcessingTime: 1.2 // Placeholder - would be calculated from actual processing times
      };
    } catch (error) {
      console.error('Failed to get statistics:', error);
      throw error;
    }
  }

  async exportPhotos(
    filters: PhotoGalleryFilter,
    format: 'zip' | 'tar',
    includeMetadata: boolean
  ): Promise<{ downloadUrl: string; filename: string }> {
    try {
      const exportId = uuidv4();
      const filename = `photos_export_${exportId}.${format}`;
      const exportPath = path.join(process.cwd(), 'data', 'exports', filename);
      
      // Ensure export directory exists
      await fs.mkdir(path.dirname(exportPath), { recursive: true });

      // Get photos to export
      const photosResult = await this.getPhotos({ ...filters, limit: 10000 }); // Large limit for export
      
      // Create archive
      const archive = archiver(format === 'zip' ? 'zip' : 'tar');
      const output = require('fs').createWriteStream(exportPath);
      
      archive.pipe(output);

      // Add photos to archive
      for (const photo of photosResult.photos) {
        const photoBuffer = await this.getPhotoFile(photo.id);
        if (photoBuffer) {
          const photoFilename = `${photo.id}.${photo.metadata.format}`;
          archive.append(photoBuffer, { name: photoFilename });
        }
      }

      // Add metadata if requested
      if (includeMetadata) {
        const metadata = {
          exportDate: new Date().toISOString(),
          totalPhotos: photosResult.photos.length,
          filters,
          photos: photosResult.photos.map(photo => ({
            id: photo.id,
            timestamp: photo.timestamp,
            employeeId: photo.employeeId,
            deviceId: photo.deviceId,
            metadata: photo.metadata
          }))
        };
        
        archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
      }

      await archive.finalize();

      return {
        downloadUrl: `/api/camera/exports/${filename}`,
        filename
      };
    } catch (error) {
      console.error('Failed to export photos:', error);
      throw error;
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return 'jpg';
    }
  }
}