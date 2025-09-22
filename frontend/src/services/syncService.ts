import { store } from '../store';
import { 
  setSyncInProgress, 
  setLastSyncTime, 
  removePendingAction 
} from '../store/slices/offlineSlice';
import { OfflineStorage } from '../utils/offlineStorage';

export class SyncService {
  private static syncInProgress = false;

  static async syncPendingActions(): Promise<void> {
    if (this.syncInProgress) {
      console.log('Sync already in progress');
      return;
    }

    const state = store.getState();
    const { isOnline, pendingActions } = state.offline;

    if (!isOnline || pendingActions.length === 0) {
      return;
    }

    this.syncInProgress = true;
    store.dispatch(setSyncInProgress(true));

    console.log(`Starting sync of ${pendingActions.length} pending actions`);

    try {
      for (const action of pendingActions) {
        await this.syncSingleAction(action);
        store.dispatch(removePendingAction(action.id));
      }

      // Update last sync time
      const now = Date.now();
      store.dispatch(setLastSyncTime(now));
      OfflineStorage.setLastSyncTime(now);

      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      this.syncInProgress = false;
      store.dispatch(setSyncInProgress(false));
    }
  }

  private static async syncSingleAction(action: any): Promise<void> {
    try {
      const [method, url] = action.type.split('_', 2);
      
      const response = await fetch(`/api${url}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${store.getState().auth.token}`,
        },
        body: action.data ? JSON.stringify(action.data) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`Synced action ${action.id}:`, result);
    } catch (error) {
      console.error(`Failed to sync action ${action.id}:`, error);
      throw error;
    }
  }

  static async downloadLatestData(): Promise<void> {
    const state = store.getState();
    if (!state.offline.isOnline) {
      console.log('Cannot download data while offline');
      return;
    }

    try {
      console.log('Downloading latest data...');

      // Download employees
      const employeesResponse = await fetch('/api/employees', {
        headers: {
          'Authorization': `Bearer ${state.auth.token}`,
        },
      });
      if (employeesResponse.ok) {
        const employees = await employeesResponse.json();
        OfflineStorage.saveEmployees(employees);
      }

      // Download attendance records (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const attendanceResponse = await fetch(
        `/api/attendance?from=${thirtyDaysAgo.toISOString()}`, 
        {
          headers: {
            'Authorization': `Bearer ${state.auth.token}`,
          },
        }
      );
      if (attendanceResponse.ok) {
        const attendance = await attendanceResponse.json();
        OfflineStorage.saveAttendanceRecords(attendance);
      }

      // Download time categories
      const categoriesResponse = await fetch('/api/time-categories', {
        headers: {
          'Authorization': `Bearer ${state.auth.token}`,
        },
      });
      if (categoriesResponse.ok) {
        const categories = await categoriesResponse.json();
        OfflineStorage.saveTimeCategories(categories);
      }

      console.log('Data download completed');
    } catch (error) {
      console.error('Failed to download data:', error);
    }
  }

  static startAutoSync(): void {
    // Sync when coming online
    window.addEventListener('online', () => {
      console.log('Device came online, starting sync...');
      setTimeout(() => this.syncPendingActions(), 1000);
    });

    // Periodic sync every 5 minutes when online
    setInterval(() => {
      const state = store.getState();
      if (state.offline.isOnline && state.offline.pendingActions.length > 0) {
        this.syncPendingActions();
      }
    }, 5 * 60 * 1000);
  }

  static getStorageStats(): {
    totalSize: number;
    itemCount: number;
    lastSync: number | null;
    pendingActions: number;
  } {
    const storageInfo = OfflineStorage.getStorageInfo();
    const state = store.getState();
    
    return {
      ...storageInfo,
      pendingActions: state.offline.pendingActions.length,
    };
  }
}