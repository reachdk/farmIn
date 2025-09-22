import { DatabaseManager } from '../database/DatabaseManager';
import { PhotoStorageService } from './PhotoStorageService';

export interface FaceRecognitionResult {
  detected: boolean;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  matchedEmployees: {
    employeeId: string;
    employeeName: string;
    confidence: number;
  }[];
  landmarks?: {
    leftEye: { x: number; y: number };
    rightEye: { x: number; y: number };
    nose: { x: number; y: number };
    mouth: { x: number; y: number };
  };
}

export interface FaceRecognitionStatus {
  enabled: boolean;
  trainedEmployees: number;
  lastTraining?: string;
  accuracy: number;
}

export class FaceRecognitionService {
  private db: DatabaseManager;
  private photoStorage: PhotoStorageService;
  private isEnabled: boolean;

  constructor() {
    this.db = DatabaseManager.getInstance();
    this.photoStorage = new PhotoStorageService();
    this.isEnabled = process.env.FACE_RECOGNITION_ENABLED === 'true';
  }

  async detectFaces(photoId: string): Promise<FaceRecognitionResult> {
    try {
      if (!this.isEnabled) {
        return {
          detected: false,
          confidence: 0,
          matchedEmployees: []
        };
      }

      // Get photo from storage
      const photo = await this.photoStorage.getPhoto(photoId);
      if (!photo) {
        throw new Error('Photo not found');
      }

      const photoBuffer = await this.photoStorage.getPhotoFile(photoId);
      if (!photoBuffer) {
        throw new Error('Photo file not found');
      }

      // Simulate face detection - in real implementation, this would use a face detection library
      const detectionResult = await this.simulateFaceDetection(photoBuffer);

      // Store detection results
      await this.storeFaceDetectionResult(photoId, detectionResult);

      return detectionResult;
    } catch (error) {
      console.error('Face detection failed:', error);
      throw error;
    }
  }

  async recognizeFaces(photoId: string): Promise<FaceRecognitionResult> {
    try {
      if (!this.isEnabled) {
        return {
          detected: false,
          confidence: 0,
          matchedEmployees: []
        };
      }

      // First detect faces
      const detectionResult = await this.detectFaces(photoId);
      
      if (!detectionResult.detected) {
        return detectionResult;
      }

      // Get photo buffer for recognition
      const photoBuffer = await this.photoStorage.getPhotoFile(photoId);
      if (!photoBuffer) {
        throw new Error('Photo file not found');
      }

      // Simulate face recognition - in real implementation, this would use a face recognition library
      const recognitionResult = await this.simulateFaceRecognition(photoBuffer, detectionResult);

      // Store recognition results
      await this.storeFaceRecognitionResult(photoId, recognitionResult);

      return recognitionResult;
    } catch (error) {
      console.error('Face recognition failed:', error);
      throw error;
    }
  }

  async trainModel(employeeId?: string, forceRetrain = false): Promise<{
    message: string;
    employeesProcessed: number;
  }> {
    try {
      if (!this.isEnabled) {
        return {
          message: 'Face recognition is disabled',
          employeesProcessed: 0
        };
      }

      let employeesToTrain: string[] = [];

      if (employeeId) {
        // Train specific employee
        employeesToTrain = [employeeId];
      } else {
        // Train all employees with photos
        const query = `
          SELECT DISTINCT employee_id 
          FROM photos 
          WHERE employee_id IS NOT NULL 
          AND purpose IN ('profile', 'verification')
        `;
        const results = await this.db.all(query);
        employeesToTrain = results.map(row => row.employee_id);
      }

      let processedCount = 0;

      for (const empId of employeesToTrain) {
        try {
          await this.trainEmployeeModel(empId, forceRetrain);
          processedCount++;
        } catch (error) {
          console.error(`Failed to train model for employee ${empId}:`, error);
        }
      }

      // Update training timestamp
      await this.db.run(
        'UPDATE system_settings SET value = ? WHERE key = ?',
        [new Date().toISOString(), 'face_recognition_last_training']
      );

      return {
        message: `Training completed for ${processedCount} employees`,
        employeesProcessed: processedCount
      };
    } catch (error) {
      console.error('Face recognition training failed:', error);
      throw error;
    }
  }

  async getStatus(): Promise<FaceRecognitionStatus> {
    try {
      // Get trained employees count
      const trainedQuery = `
        SELECT COUNT(DISTINCT employee_id) as count 
        FROM face_recognition_models 
        WHERE is_active = 1
      `;
      const trainedResult = await this.db.get(trainedQuery);
      const trainedEmployees = trainedResult?.count || 0;

      // Get last training date
      const lastTrainingQuery = `
        SELECT value 
        FROM system_settings 
        WHERE key = 'face_recognition_last_training'
      `;
      const lastTrainingResult = await this.db.get(lastTrainingQuery);
      const lastTraining = lastTrainingResult?.value;

      // Calculate accuracy from recent recognition results
      const accuracyQuery = `
        SELECT AVG(confidence) as avg_confidence
        FROM face_recognition_results
        WHERE created_at >= datetime('now', '-30 days')
        AND matched_employee_id IS NOT NULL
      `;
      const accuracyResult = await this.db.get(accuracyQuery);
      const accuracy = accuracyResult?.avg_confidence || 0;

      return {
        enabled: this.isEnabled,
        trainedEmployees,
        lastTraining,
        accuracy: Math.round(accuracy * 100) / 100
      };
    } catch (error) {
      console.error('Failed to get face recognition status:', error);
      throw error;
    }
  }

  private async simulateFaceDetection(photoBuffer: Buffer): Promise<FaceRecognitionResult> {
    // Simulate face detection with random results
    // In real implementation, this would use libraries like face-api.js, OpenCV, or cloud services
    
    const hasface = Math.random() > 0.3; // 70% chance of detecting a face
    
    if (!hasface) {
      return {
        detected: false,
        confidence: 0,
        matchedEmployees: []
      };
    }

    const confidence = 0.7 + Math.random() * 0.3; // Random confidence between 0.7-1.0
    
    return {
      detected: true,
      confidence,
      boundingBox: {
        x: Math.floor(Math.random() * 100),
        y: Math.floor(Math.random() * 100),
        width: 150 + Math.floor(Math.random() * 100),
        height: 180 + Math.floor(Math.random() * 120)
      },
      landmarks: {
        leftEye: { x: 120, y: 80 },
        rightEye: { x: 180, y: 80 },
        nose: { x: 150, y: 120 },
        mouth: { x: 150, y: 160 }
      },
      matchedEmployees: []
    };
  }

  private async simulateFaceRecognition(
    photoBuffer: Buffer, 
    detectionResult: FaceRecognitionResult
  ): Promise<FaceRecognitionResult> {
    // Simulate face recognition by randomly matching to employees
    // In real implementation, this would compare face encodings
    
    const employees = await this.db.all(`
      SELECT id, first_name, last_name 
      FROM employees 
      WHERE is_active = 1
      LIMIT 5
    `);

    const matchedEmployees = [];
    
    // 60% chance of finding a match
    if (Math.random() > 0.4 && employees.length > 0) {
      const randomEmployee = employees[Math.floor(Math.random() * employees.length)];
      const matchConfidence = 0.6 + Math.random() * 0.4; // Random confidence between 0.6-1.0
      
      matchedEmployees.push({
        employeeId: randomEmployee.id,
        employeeName: `${randomEmployee.first_name} ${randomEmployee.last_name}`,
        confidence: matchConfidence
      });
    }

    return {
      ...detectionResult,
      matchedEmployees
    };
  }

  private async trainEmployeeModel(employeeId: string, forceRetrain: boolean): Promise<void> {
    // Get training photos for employee
    const photosQuery = `
      SELECT id, filename 
      FROM photos 
      WHERE employee_id = ? 
      AND purpose IN ('profile', 'verification')
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    const photos = await this.db.all(photosQuery, [employeeId]);
    
    if (photos.length < 2) {
      throw new Error(`Insufficient training photos for employee ${employeeId}`);
    }

    // Check if model already exists
    const existingModel = await this.db.get(
      'SELECT id FROM face_recognition_models WHERE employee_id = ? AND is_active = 1',
      [employeeId]
    );

    if (existingModel && !forceRetrain) {
      return; // Model already exists and not forcing retrain
    }

    // Simulate model training
    // In real implementation, this would:
    // 1. Load all training photos
    // 2. Extract face encodings
    // 3. Create/update the recognition model
    // 4. Store model data
    
    const modelData = {
      employeeId,
      encodings: 'simulated_face_encodings_data',
      trainingPhotos: photos.length,
      accuracy: 0.85 + Math.random() * 0.15 // Random accuracy between 0.85-1.0
    };

    // Store or update model
    if (existingModel) {
      await this.db.run(`
        UPDATE face_recognition_models 
        SET model_data = ?, training_photos = ?, accuracy = ?, updated_at = CURRENT_TIMESTAMP
        WHERE employee_id = ?
      `, [
        JSON.stringify(modelData),
        photos.length,
        modelData.accuracy,
        employeeId
      ]);
    } else {
      await this.db.run(`
        INSERT INTO face_recognition_models (
          id, employee_id, model_data, training_photos, accuracy, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        require('uuid').v4(),
        employeeId,
        JSON.stringify(modelData),
        photos.length,
        modelData.accuracy
      ]);
    }
  }

  private async storeFaceDetectionResult(
    photoId: string, 
    result: FaceRecognitionResult
  ): Promise<void> {
    const insertQuery = `
      INSERT INTO face_detection_results (
        id, photo_id, detected, confidence, bounding_box, landmarks, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    await this.db.run(insertQuery, [
      require('uuid').v4(),
      photoId,
      result.detected ? 1 : 0,
      result.confidence,
      result.boundingBox ? JSON.stringify(result.boundingBox) : null,
      result.landmarks ? JSON.stringify(result.landmarks) : null
    ]);
  }

  private async storeFaceRecognitionResult(
    photoId: string, 
    result: FaceRecognitionResult
  ): Promise<void> {
    // Store the main recognition result
    const insertQuery = `
      INSERT INTO face_recognition_results (
        id, photo_id, detected, confidence, matched_employee_id, match_confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const topMatch = result.matchedEmployees.length > 0 ? result.matchedEmployees[0] : null;

    await this.db.run(insertQuery, [
      require('uuid').v4(),
      photoId,
      result.detected ? 1 : 0,
      result.confidence,
      topMatch?.employeeId || null,
      topMatch?.confidence || null
    ]);
  }
}