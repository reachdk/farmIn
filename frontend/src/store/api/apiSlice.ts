import { createApi, fetchBaseQuery, BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../index';
import { OfflineStorage } from '../../utils/offlineStorage';
import { addPendingAction } from '../slices/offlineSlice';

const baseQuery = fetchBaseQuery({
  baseUrl: '/api',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token;
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

// Enhanced base query with offline support
const baseQueryWithOffline: BaseQueryFn = async (args, api, extraOptions) => {
  const state = api.getState() as RootState;
  const isOnline = state.offline.isOnline;

  // Try online request first
  if (isOnline) {
    const result = await baseQuery(args, api, extraOptions);
    
    // Cache successful responses
    if (result.data) {
      const url = typeof args === 'string' ? args : args.url;
      if (url.includes('/employees')) {
        OfflineStorage.saveEmployees(Array.isArray(result.data) ? result.data : [result.data]);
      } else if (url.includes('/attendance')) {
        OfflineStorage.saveAttendanceRecords(Array.isArray(result.data) ? result.data : [result.data]);
      } else if (url.includes('/time-categories')) {
        OfflineStorage.saveTimeCategories(Array.isArray(result.data) ? result.data : [result.data]);
      }
    }
    
    return result;
  }

  // Handle offline requests
  const method = typeof args === 'string' ? 'GET' : args.method || 'GET';
  const url = typeof args === 'string' ? args : args.url;

  if (method === 'GET') {
    // Return cached data for GET requests
    let cachedData = null;
    
    if (url.includes('/employees')) {
      cachedData = OfflineStorage.getEmployees();
    } else if (url.includes('/attendance')) {
      cachedData = OfflineStorage.getAttendanceRecords();
    } else if (url.includes('/time-categories')) {
      cachedData = OfflineStorage.getTimeCategories();
    }

    if (cachedData) {
      return { data: cachedData };
    }
  } else {
    // Queue mutation requests for later sync
    const actionId = `${Date.now()}-${Math.random()}`;
    api.dispatch(addPendingAction({
      id: actionId,
      type: `${method}_${url}`,
      data: typeof args === 'object' ? args.body : null,
    }));

    // Return optimistic response
    return { 
      data: { 
        id: actionId, 
        status: 'pending',
        message: 'Action queued for sync when online' 
      } 
    };
  }

  // Return error if no cached data available
  return {
    error: {
      status: 'OFFLINE_ERROR',
      error: 'No cached data available and device is offline',
    },
  };
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithOffline,
  tagTypes: ['Employee', 'Employees', 'Attendance', 'TimeCategory', 'TimeAdjustments'],
  endpoints: () => ({}),
});