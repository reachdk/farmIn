import { apiSlice } from './apiSlice';

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
}

export interface PhotoCaptureResponse {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  employeeId?: string;
  deviceId: string;
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

export interface PhotoGalleryFilter {
  employeeId?: string;
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  purpose?: 'attendance' | 'verification' | 'profile' | 'manual';
  hasAttendanceRecord?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'timestamp' | 'employeeName' | 'deviceName';
  sortOrder?: 'asc' | 'desc';
}

export interface PhotoGalleryResponse {
  photos: PhotoCaptureResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CameraSettings {
  deviceId: string;
  brightness: number;
  contrast: number;
  saturation: number;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  format: 'jpeg' | 'png' | 'webp';
  autoFocus: boolean;
  flash: boolean;
  motionDetection: boolean;
}

export interface PhotoProcessingJob {
  id: string;
  photoId: string;
  type: 'face_detection' | 'face_recognition' | 'quality_enhancement';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export const cameraApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Camera Device Management
    getCameraDevices: builder.query<CameraDevice[], void>({
      query: () => '/camera/devices',
      providesTags: ['CameraDevice'],
    }),

    getCameraDevice: builder.query<CameraDevice, string>({
      query: (deviceId) => `/camera/devices/${deviceId}`,
      providesTags: (result, error, deviceId) => [{ type: 'CameraDevice', id: deviceId }],
    }),

    updateCameraSettings: builder.mutation<CameraDevice, CameraSettings>({
      query: ({ deviceId, ...settings }) => ({
        url: `/camera/devices/${deviceId}/settings`,
        method: 'PUT',
        body: settings,
      }),
      invalidatesTags: (result, error, { deviceId }) => [
        'CameraDevice',
        { type: 'CameraDevice', id: deviceId },
      ],
    }),

    testCameraDevice: builder.mutation<{ success: boolean; message: string }, string>({
      query: (deviceId) => ({
        url: `/camera/devices/${deviceId}/test`,
        method: 'POST',
      }),
    }),

    // Photo Capture
    capturePhoto: builder.mutation<PhotoCaptureResponse, PhotoCaptureRequest>({
      query: (request) => ({
        url: '/camera/capture',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: ['Photo'],
    }),

    captureMultiplePhotos: builder.mutation<PhotoCaptureResponse[], {
      deviceId: string;
      count: number;
      interval?: number;
      employeeId?: string;
      attendanceRecordId?: string;
    }>({
      query: (request) => ({
        url: '/camera/capture/batch',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: ['Photo'],
    }),

    // Photo Gallery and Management
    getPhotos: builder.query<PhotoGalleryResponse, PhotoGalleryFilter>({
      query: (filters) => {
        const params = new URLSearchParams();
        
        if (filters.employeeId) params.append('employeeId', filters.employeeId);
        if (filters.deviceId) params.append('deviceId', filters.deviceId);
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.purpose) params.append('purpose', filters.purpose);
        if (filters.hasAttendanceRecord !== undefined) {
          params.append('hasAttendanceRecord', filters.hasAttendanceRecord.toString());
        }
        if (filters.page) params.append('page', filters.page.toString());
        if (filters.limit) params.append('limit', filters.limit.toString());
        if (filters.sortBy) params.append('sortBy', filters.sortBy);
        if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
        
        return `/camera/photos?${params.toString()}`;
      },
      providesTags: ['Photo'],
    }),

    getPhoto: builder.query<PhotoCaptureResponse, string>({
      query: (photoId) => `/camera/photos/${photoId}`,
      providesTags: (result, error, photoId) => [{ type: 'Photo', id: photoId }],
    }),

    updatePhotoMetadata: builder.mutation<PhotoCaptureResponse, {
      photoId: string;
      metadata: {
        employeeId?: string;
        notes?: string;
        purpose?: string;
      };
    }>({
      query: ({ photoId, metadata }) => ({
        url: `/camera/photos/${photoId}/metadata`,
        method: 'PUT',
        body: metadata,
      }),
      invalidatesTags: (result, error, { photoId }) => [
        'Photo',
        { type: 'Photo', id: photoId },
      ],
    }),

    deletePhoto: builder.mutation<void, string>({
      query: (photoId) => ({
        url: `/camera/photos/${photoId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, photoId) => [
        'Photo',
        { type: 'Photo', id: photoId },
      ],
    }),

    bulkDeletePhotos: builder.mutation<{ deleted: number; failed: number }, string[]>({
      query: (photoIds) => ({
        url: '/camera/photos/bulk-delete',
        method: 'POST',
        body: { photoIds },
      }),
      invalidatesTags: ['Photo'],
    }),

    // Face Recognition
    detectFaces: builder.mutation<FaceRecognitionResult, string>({
      query: (photoId) => ({
        url: `/camera/photos/${photoId}/detect-faces`,
        method: 'POST',
      }),
    }),

    recognizeFaces: builder.mutation<FaceRecognitionResult, string>({
      query: (photoId) => ({
        url: `/camera/photos/${photoId}/recognize-faces`,
        method: 'POST',
      }),
    }),

    trainFaceRecognition: builder.mutation<{ message: string; employeesProcessed: number }, {
      employeeId?: string;
      forceRetrain?: boolean;
    }>({
      query: (options) => ({
        url: '/camera/face-recognition/train',
        method: 'POST',
        body: options,
      }),
    }),

    getFaceRecognitionStatus: builder.query<{
      enabled: boolean;
      trainedEmployees: number;
      lastTraining?: string;
      accuracy: number;
    }, void>({
      query: () => '/camera/face-recognition/status',
    }),

    // Photo Processing
    getProcessingJobs: builder.query<PhotoProcessingJob[], {
      photoId?: string;
      status?: 'queued' | 'processing' | 'completed' | 'failed';
    }>({
      query: (filters) => {
        const params = new URLSearchParams();
        if (filters.photoId) params.append('photoId', filters.photoId);
        if (filters.status) params.append('status', filters.status);
        return `/camera/processing/jobs?${params.toString()}`;
      },
    }),

    retryProcessingJob: builder.mutation<PhotoProcessingJob, string>({
      query: (jobId) => ({
        url: `/camera/processing/jobs/${jobId}/retry`,
        method: 'POST',
      }),
    }),

    // Statistics and Analytics
    getCameraStats: builder.query<{
      totalPhotos: number;
      todayPhotos: number;
      weekPhotos: number;
      monthPhotos: number;
      photosByDevice: { deviceId: string; deviceName: string; count: number }[];
      photosByPurpose: { purpose: string; count: number }[];
      faceDetectionRate: number;
      faceRecognitionRate: number;
      averageProcessingTime: number;
    }, void>({
      query: () => '/camera/stats',
      // Poll every 5 minutes
      pollingInterval: 300000,
    }),

    // Export and Backup
    exportPhotos: builder.mutation<{ downloadUrl: string; filename: string }, {
      filters: PhotoGalleryFilter;
      format: 'zip' | 'tar';
      includeMetadata: boolean;
    }>({
      query: (request) => ({
        url: '/camera/photos/export',
        method: 'POST',
        body: request,
      }),
    }),
  }),
});

export const {
  useGetCameraDevicesQuery,
  useGetCameraDeviceQuery,
  useUpdateCameraSettingsMutation,
  useTestCameraDeviceMutation,
  useCapturePhotoMutation,
  useCaptureMultiplePhotosMutation,
  useGetPhotosQuery,
  useGetPhotoQuery,
  useUpdatePhotoMetadataMutation,
  useDeletePhotoMutation,
  useBulkDeletePhotosMutation,
  useDetectFacesMutation,
  useRecognizeFacesMutation,
  useTrainFaceRecognitionMutation,
  useGetFaceRecognitionStatusQuery,
  useGetProcessingJobsQuery,
  useRetryProcessingJobMutation,
  useGetCameraStatsQuery,
  useExportPhotosMutation,
} = cameraApi;