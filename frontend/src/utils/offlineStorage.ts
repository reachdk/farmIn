interface StorageItem<T> {
  data: T;
  timestamp: number;
  version: number;
}

export class OfflineStorage {
  private static readonly VERSION = 1;
  private static readonly KEYS = {
    EMPLOYEES: 'offline_employees',
    ATTENDANCE_RECORDS: 'offline_attendance_records',
    TIME_CATEGORIES: 'offline_time_categories',
    PENDING_ACTIONS: 'offline_pending_actions',
    LAST_SYNC: 'offline_last_sync',
  };

  static setItem<T>(key: string, data: T): void {
    try {
      const item: StorageItem<T> = {
        data,
        timestamp: Date.now(),
        version: this.VERSION,
      };
      localStorage.setItem(key, JSON.stringify(item));
    } catch (error) {
      console.error('Failed to save to offline storage:', error);
    }
  }

  static getItem<T>(key: string): T | null {
    try {
      const itemStr = localStorage.getItem(key);
      if (!itemStr) return null;

      const item: StorageItem<T> = JSON.parse(itemStr);
      
      // Check version compatibility
      if (item.version !== this.VERSION) {
        this.removeItem(key);
        return null;
      }

      return item.data;
    } catch (error) {
      console.error('Failed to read from offline storage:', error);
      return null;
    }
  }

  static removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to remove from offline storage:', error);
    }
  }

  static clear(): void {
    try {
      Object.values(this.KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.error('Failed to clear offline storage:', error);
    }
  }

  // Specific methods for different data types
  static saveEmployees(employees: any[]): void {
    this.setItem(this.KEYS.EMPLOYEES, employees);
  }

  static getEmployees(): any[] {
    return this.getItem(this.KEYS.EMPLOYEES) || [];
  }

  static saveAttendanceRecords(records: any[]): void {
    this.setItem(this.KEYS.ATTENDANCE_RECORDS, records);
  }

  static getAttendanceRecords(): any[] {
    return this.getItem(this.KEYS.ATTENDANCE_RECORDS) || [];
  }

  static saveTimeCategories(categories: any[]): void {
    this.setItem(this.KEYS.TIME_CATEGORIES, categories);
  }

  static getTimeCategories(): any[] {
    return this.getItem(this.KEYS.TIME_CATEGORIES) || [];
  }

  static savePendingActions(actions: any[]): void {
    this.setItem(this.KEYS.PENDING_ACTIONS, actions);
  }

  static getPendingActions(): any[] {
    return this.getItem(this.KEYS.PENDING_ACTIONS) || [];
  }

  static setLastSyncTime(timestamp: number): void {
    this.setItem(this.KEYS.LAST_SYNC, timestamp);
  }

  static getLastSyncTime(): number | null {
    return this.getItem(this.KEYS.LAST_SYNC);
  }

  static getStorageInfo(): {
    totalSize: number;
    itemCount: number;
    lastSync: number | null;
  } {
    let totalSize = 0;
    let itemCount = 0;

    Object.values(this.KEYS).forEach(key => {
      const item = localStorage.getItem(key);
      if (item) {
        totalSize += item.length;
        itemCount++;
      }
    });

    return {
      totalSize,
      itemCount,
      lastSync: this.getLastSyncTime(),
    };
  }
}