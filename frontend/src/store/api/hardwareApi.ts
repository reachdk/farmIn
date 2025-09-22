import { apiSlice } from './apiSlice';

export interface HardwareDevice {
  id: string;
  name: string;
  type: 'kiosk' | 'rfid_reader' | 'camera';
  location: string;
  ipAddress: string;
  status: 'online' | 'offline' | 'error';
  lastSeen: string;
  capabilities: string[];
  configuration: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface RFIDCard {
  cardId: string;
  employeeId?: string;
  isActive: boolean;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoCapture {
  id: string;
  employeeId: string;
  deviceId: string;
  imageUrl: string;
  timestamp: string;
  attendanceRecordId?: string;
  metadata: {
    resolution: string;
    fileSize: number;
    format: string;
  };
}

export interface DeviceStatus {
  deviceId: string;
  status: 'online' | 'offline' | 'error';
  lastHeartbeat: string;
  systemHealth: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    temperature: number;
  };
  capabilities: {
    rfidReader: boolean;
    camera: boolean;
    display: boolean;
    network: boolean;
  };
  errors: string[];
}

export interface AttendanceCapture {
  employeeId?: string;
  cardId?: string;
  deviceId: string;
  action: 'clock_in' | 'clock_out';
  timestamp: string;
  photoId?: string;
  location: string;
}

export interface DeviceRegistration {
  name: string;
  type: 'kiosk' | 'rfid_reader' | 'camera';
  location: string;
  ipAddress: string;
  capabilities: string[];
  configuration?: Record<string, any>;
}

export interface DeviceCommand {
  command: 'restart' | 'update_config' | 'capture_photo' | 'read_rfid' | 'show_message' | 'play_sound';
  parameters?: Record<string, any>;
}

export interface CommandResult {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: string;
}

export const hardwareApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Device Management
    getDevices: builder.query<HardwareDevice[], void>({
      query: () => '/hardware/devices',
      providesTags: ['HardwareDevice'],
    }),

    getDevice: builder.query<HardwareDevice, string>({
      query: (deviceId) => `/hardware/devices/${deviceId}`,
      providesTags: (result, error, deviceId) => [{ type: 'HardwareDevice', id: deviceId }],
    }),

    registerDevice: builder.mutation<HardwareDevice, DeviceRegistration>({
      query: (device) => ({
        url: '/hardware/devices/register',
        method: 'POST',
        body: device,
      }),
      invalidatesTags: ['HardwareDevice'],
    }),

    updateDevice: builder.mutation<HardwareDevice, { deviceId: string; updates: Partial<HardwareDevice> }>({
      query: ({ deviceId, updates }) => ({
        url: `/hardware/devices/${deviceId}`,
        method: 'PUT',
        body: updates,
      }),
      invalidatesTags: (result, error, { deviceId }) => [
        'HardwareDevice',
        { type: 'HardwareDevice', id: deviceId },
      ],
    }),

    deleteDevice: builder.mutation<void, string>({
      query: (deviceId) => ({
        url: `/hardware/devices/${deviceId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, deviceId) => [
        'HardwareDevice',
        { type: 'HardwareDevice', id: deviceId },
      ],
    }),

    // Device Status and Health
    getDeviceStatus: builder.query<DeviceStatus, string>({
      query: (deviceId) => `/hardware/devices/${deviceId}/status`,
      // Poll every 30 seconds for real-time status
      pollingInterval: 30000,
    }),

    updateDeviceStatus: builder.mutation<void, { deviceId: string; status: Partial<DeviceStatus> }>({
      query: ({ deviceId, status }) => ({
        url: `/hardware/devices/${deviceId}/status`,
        method: 'POST',
        body: status,
      }),
    }),

    // RFID Card Management
    getRFIDCards: builder.query<RFIDCard[], void>({
      query: () => '/hardware/rfid-cards',
      providesTags: ['RFIDCard'],
    }),

    getRFIDCard: builder.query<RFIDCard, string>({
      query: (cardId) => `/hardware/rfid-cards/${cardId}`,
      providesTags: (result, error, cardId) => [{ type: 'RFIDCard', id: cardId }],
    }),

    assignRFIDCard: builder.mutation<RFIDCard, { cardId: string; employeeId: string }>({
      query: ({ cardId, employeeId }) => ({
        url: `/hardware/rfid-cards/${cardId}/assign`,
        method: 'POST',
        body: { employeeId },
      }),
      invalidatesTags: ['RFIDCard'],
    }),

    deactivateRFIDCard: builder.mutation<void, string>({
      query: (cardId) => ({
        url: `/hardware/rfid-cards/${cardId}/deactivate`,
        method: 'POST',
      }),
      invalidatesTags: ['RFIDCard'],
    }),

    // Photo Capture
    capturePhoto: builder.mutation<PhotoCapture, { deviceId: string; employeeId?: string }>({
      query: ({ deviceId, employeeId }) => ({
        url: `/hardware/devices/${deviceId}/capture-photo`,
        method: 'POST',
        body: { employeeId },
      }),
    }),

    getPhotos: builder.query<PhotoCapture[], { 
      employeeId?: string; 
      deviceId?: string; 
      startDate?: string; 
      endDate?: string;
      limit?: number;
    }>({
      query: ({ employeeId, deviceId, startDate, endDate, limit = 50 }) => {
        const params = new URLSearchParams();
        if (employeeId) params.append('employeeId', employeeId);
        if (deviceId) params.append('deviceId', deviceId);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        params.append('limit', limit.toString());
        return `/hardware/photos?${params.toString()}`;
      },
    }),

    deletePhoto: builder.mutation<void, string>({
      query: (photoId) => ({
        url: `/hardware/photos/${photoId}`,
        method: 'DELETE',
      }),
    }),

    // Attendance Capture (from hardware devices)
    captureAttendance: builder.mutation<{ attendanceRecord: any; photo?: PhotoCapture }, AttendanceCapture>({
      query: (capture) => ({
        url: '/hardware/attendance/capture',
        method: 'POST',
        body: capture,
      }),
      invalidatesTags: ['Attendance'],
    }),

    // Device Commands
    sendDeviceCommand: builder.mutation<CommandResult, { deviceId: string; command: DeviceCommand }>({
      query: ({ deviceId, command }) => ({
        url: `/hardware/devices/${deviceId}/command`,
        method: 'POST',
        body: command,
      }),
    }),

    // Bulk Operations
    bulkDeviceCommand: builder.mutation<{ results: CommandResult[]; deviceIds: string[] }, {
      deviceIds: string[];
      command: DeviceCommand;
    }>({
      query: ({ deviceIds, command }) => ({
        url: '/hardware/devices/bulk-command',
        method: 'POST',
        body: { deviceIds, command },
      }),
    }),

    // Device Discovery
    discoverDevices: builder.mutation<{ discovered: HardwareDevice[]; count: number }, {
      networkRange?: string;
      timeout?: number;
    }>({
      query: (options) => ({
        url: '/hardware/devices/discover',
        method: 'POST',
        body: options,
      }),
    }),

    // Hardware Statistics
    getHardwareStats: builder.query<{
      totalDevices: number;
      onlineDevices: number;
      offlineDevices: number;
      errorDevices: number;
      totalRFIDCards: number;
      activeRFIDCards: number;
      todayPhotos: number;
      todayAttendanceCaptures: number;
    }, void>({
      query: () => '/hardware/stats',
      // Poll every 60 seconds
      pollingInterval: 60000,
    }),
  }),
});

export const {
  useGetDevicesQuery,
  useGetDeviceQuery,
  useRegisterDeviceMutation,
  useUpdateDeviceMutation,
  useDeleteDeviceMutation,
  useGetDeviceStatusQuery,
  useUpdateDeviceStatusMutation,
  useGetRFIDCardsQuery,
  useGetRFIDCardQuery,
  useAssignRFIDCardMutation,
  useDeactivateRFIDCardMutation,
  useCapturePhotoMutation,
  useGetPhotosQuery,
  useDeletePhotoMutation,
  useCaptureAttendanceMutation,
  useSendDeviceCommandMutation,
  useBulkDeviceCommandMutation,
  useDiscoverDevicesMutation,
  useGetHardwareStatsQuery,
} = hardwareApi;