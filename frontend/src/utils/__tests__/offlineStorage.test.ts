import { OfflineStorage } from '../offlineStorage';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('OfflineStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setItem and getItem', () => {
    test('stores and retrieves data correctly', () => {
      const testData = { id: 1, name: 'Test Employee' };
      const key = 'test_key';

      // Mock localStorage.setItem
      localStorageMock.setItem.mockImplementation((k, v) => {
        localStorageMock.getItem.mockReturnValue(v);
      });

      OfflineStorage.setItem(key, testData);
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        key,
        expect.stringContaining(JSON.stringify(testData))
      );

      const retrieved = OfflineStorage.getItem(key);
      expect(retrieved).toEqual(testData);
    });

    test('returns null for non-existent key', () => {
      localStorageMock.getItem.mockReturnValue(null);
      
      const result = OfflineStorage.getItem('non_existent');
      expect(result).toBeNull();
    });

    test('handles corrupted data gracefully', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');
      
      const result = OfflineStorage.getItem('corrupted');
      expect(result).toBeNull();
    });

    test('handles version mismatch', () => {
      const oldVersionData = JSON.stringify({
        data: { test: 'data' },
        timestamp: Date.now(),
        version: 0, // Old version
      });
      
      localStorageMock.getItem.mockReturnValue(oldVersionData);
      
      const result = OfflineStorage.getItem('old_version');
      expect(result).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('old_version');
    });
  });

  describe('specific data type methods', () => {
    test('saveEmployees and getEmployees', () => {
      const employees = [
        { id: 1, name: 'John Doe', employeeId: 'EMP001' },
        { id: 2, name: 'Jane Smith', employeeId: 'EMP002' },
      ];

      localStorageMock.setItem.mockImplementation((k, v) => {
        if (k === 'offline_employees') {
          localStorageMock.getItem.mockReturnValue(v);
        }
      });

      OfflineStorage.saveEmployees(employees);
      const retrieved = OfflineStorage.getEmployees();
      
      expect(retrieved).toEqual(employees);
    });

    test('returns empty array when no data exists', () => {
      localStorageMock.getItem.mockReturnValue(null);
      
      expect(OfflineStorage.getEmployees()).toEqual([]);
      expect(OfflineStorage.getAttendanceRecords()).toEqual([]);
      expect(OfflineStorage.getTimeCategories()).toEqual([]);
      expect(OfflineStorage.getPendingActions()).toEqual([]);
    });
  });

  describe('storage info', () => {
    test('calculates storage info correctly', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'offline_employees') return '{"data":[],"timestamp":123,"version":1}';
        if (key === 'offline_last_sync') return '{"data":456,"timestamp":123,"version":1}';
        return null;
      });

      const info = OfflineStorage.getStorageInfo();
      
      expect(info.itemCount).toBe(2);
      expect(info.totalSize).toBeGreaterThan(0);
      expect(info.lastSync).toBe(456);
    });
  });

  describe('clear', () => {
    test('removes all offline storage keys', () => {
      OfflineStorage.clear();
      
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('offline_employees');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('offline_attendance_records');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('offline_time_categories');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('offline_pending_actions');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('offline_last_sync');
    });
  });
});