import { ConnectivityService } from '../../services/ConnectivityService';

// Mock fetch for testing
global.fetch = jest.fn();

describe('ConnectivityService', () => {
  let service: ConnectivityService;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    // Reset the singleton instance
    (ConnectivityService as any).instance = undefined;
    service = ConnectivityService.getInstance({
      checkInterval: 100, // Fast interval for testing
      timeout: 50,
      endpoints: ['https://test.com']
    });
    mockFetch.mockClear();
  });

  afterEach(async () => {
    service.stop();
    await new Promise(resolve => setTimeout(resolve, 10)); // Allow cleanup
  });

  describe('connectivity checking', () => {
    it('should detect online status when endpoint is reachable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);

      const isOnline = await service.checkConnectivity();
      
      expect(isOnline).toBe(true);
      expect(service.isOnline()).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('https://test.com', {
        method: 'HEAD',
        signal: expect.any(AbortSignal),
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
    });

    it('should detect offline status when endpoint is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const isOnline = await service.checkConnectivity();
      
      expect(isOnline).toBe(false);
      expect(service.isOnline()).toBe(false);
    });

    it('should consider 4xx responses as online but 5xx as offline', async () => {
      // 404 should be considered online (server is reachable)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      } as Response);

      let isOnline = await service.checkConnectivity();
      expect(isOnline).toBe(true);

      // 500 should be considered offline (server error)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      } as Response);

      isOnline = await service.checkConnectivity();
      expect(isOnline).toBe(false);
    });

    it('should handle timeout correctly', async () => {
      // Mock a slow response that will timeout
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          status: 200
        } as Response), 100)) // Longer than timeout
      );

      const isOnline = await service.checkConnectivity();
      expect(isOnline).toBe(false);
    });
  });

  describe('status tracking', () => {
    it('should track consecutive failures', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await service.checkConnectivity();
      await service.checkConnectivity();
      await service.checkConnectivity();

      const status = service.getStatus();
      expect(status.consecutiveFailures).toBe(3);
      expect(status.isOnline).toBe(false);
    });

    it('should reset consecutive failures on successful connection', async () => {
      // First fail a few times
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await service.checkConnectivity();
      
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await service.checkConnectivity();

      expect(service.getStatus().consecutiveFailures).toBe(2);

      // Then succeed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);
      await service.checkConnectivity();

      const status = service.getStatus();
      expect(status.consecutiveFailures).toBe(0);
      expect(status.isOnline).toBe(true);
    });

    it('should track last online and offline times', async () => {
      const startTime = Date.now();

      // Go online
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);
      await service.checkConnectivity();

      let status = service.getStatus();
      expect(status.lastOnline).toBeDefined();
      expect(status.lastOnline!.getTime()).toBeGreaterThanOrEqual(startTime);

      // Go offline
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await service.checkConnectivity();

      status = service.getStatus();
      expect(status.lastOffline).toBeDefined();
      expect(status.lastOffline!.getTime()).toBeGreaterThanOrEqual(startTime);
    });
  });

  describe('events', () => {
    it('should emit online event when going from offline to online', async () => {
      const onlineHandler = jest.fn();
      service.on('online', onlineHandler);

      // Start offline
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await service.checkConnectivity();

      // Go online
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);
      await service.checkConnectivity();

      expect(onlineHandler).toHaveBeenCalledWith(expect.objectContaining({
        isOnline: true
      }));
    });

    it('should emit offline event when going from online to offline', async () => {
      const offlineHandler = jest.fn();
      service.on('offline', offlineHandler);

      // Start online
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);
      await service.checkConnectivity();

      // Go offline
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await service.checkConnectivity();

      expect(offlineHandler).toHaveBeenCalledWith(expect.objectContaining({
        isOnline: false
      }));
    });

    it('should emit statusChanged event on any status change', async () => {
      const statusChangedHandler = jest.fn();
      service.on('statusChanged', statusChangedHandler);

      // Go online
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);
      await service.checkConnectivity();

      // Go offline
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await service.checkConnectivity();

      expect(statusChangedHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('waitForConnection', () => {
    it('should resolve immediately if already online', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);
      await service.checkConnectivity();

      const result = await service.waitForConnection(100);
      expect(result).toBe(true);
    });

    it('should wait for connection and resolve when online', async () => {
      // Start offline
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await service.checkConnectivity();

      const waitPromise = service.waitForConnection(200);

      // Simulate going online after a delay
      setTimeout(async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200
        } as Response);
        await service.checkConnectivity();
      }, 50);

      const result = await waitPromise;
      expect(result).toBe(true);
    });

    it('should timeout if connection is not restored', async () => {
      // Start offline
      mockFetch.mockRejectedValue(new Error('Network error'));
      await service.checkConnectivity();

      const result = await service.waitForConnection(50);
      expect(result).toBe(false);
    });
  });

  describe('offline duration', () => {
    it('should return null when online', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);
      await service.checkConnectivity();

      expect(service.getOfflineDuration()).toBeNull();
    });

    it('should return duration when offline', async () => {
      // First go online to set lastOnline
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);
      await service.checkConnectivity();
      
      // Then go offline
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await service.checkConnectivity();

      await new Promise(resolve => setTimeout(resolve, 50));

      const duration = service.getOfflineDuration();
      expect(duration).toBeGreaterThanOrEqual(40);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('automatic monitoring', () => {
    it('should start and stop monitoring', async () => {
      const startedHandler = jest.fn();
      const stoppedHandler = jest.fn();
      
      service.on('started', startedHandler);
      service.on('stopped', stoppedHandler);

      await service.start();
      expect(startedHandler).toHaveBeenCalled();

      service.stop();
      expect(stoppedHandler).toHaveBeenCalled();
    });
  });
});