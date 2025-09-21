import { EventEmitter } from 'events';
import { RetryService } from './RetryService';

export interface ConnectivityStatus {
  isOnline: boolean;
  lastChecked: Date;
  lastOnline?: Date;
  lastOffline?: Date;
  consecutiveFailures: number;
}

export interface ConnectivityOptions {
  checkInterval: number; // milliseconds
  timeout: number; // milliseconds
  endpoints: string[];
  maxConsecutiveFailures: number;
}

export class ConnectivityService extends EventEmitter {
  private static instance: ConnectivityService;
  private status: ConnectivityStatus;
  private options: ConnectivityOptions;
  private checkTimer?: NodeJS.Timeout;
  private isChecking = false;

  private static readonly DEFAULT_OPTIONS: ConnectivityOptions = {
    checkInterval: 30000, // 30 seconds
    timeout: 5000, // 5 seconds
    endpoints: [
      'https://www.google.com',
      'https://www.cloudflare.com',
      'https://1.1.1.1'
    ],
    maxConsecutiveFailures: 3
  };

  private constructor(options: Partial<ConnectivityOptions> = {}) {
    super();
    this.options = { ...ConnectivityService.DEFAULT_OPTIONS, ...options };
    this.status = {
      isOnline: false,
      lastChecked: new Date(),
      consecutiveFailures: 0
    };
  }

  public static getInstance(options?: Partial<ConnectivityOptions>): ConnectivityService {
    if (!ConnectivityService.instance) {
      ConnectivityService.instance = new ConnectivityService(options);
    }
    return ConnectivityService.instance;
  }

  public async start(): Promise<void> {
    if (this.checkTimer) {
      return; // Already started
    }

    // Initial check
    await this.checkConnectivity();

    // Start periodic checks
    this.checkTimer = setInterval(async () => {
      if (!this.isChecking) {
        await this.checkConnectivity();
      }
    }, this.options.checkInterval);

    this.emit('started');
  }

  public stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
    this.emit('stopped');
  }

  public async checkConnectivity(): Promise<boolean> {
    if (this.isChecking) {
      return this.status.isOnline;
    }

    this.isChecking = true;
    const previousStatus = this.status.isOnline;

    try {
      const isOnline = await this.performConnectivityCheck();
      this.updateStatus(isOnline);

      // Emit events on status change
      if (previousStatus !== isOnline) {
        if (isOnline) {
          this.emit('online', this.status);
        } else {
          this.emit('offline', this.status);
        }
        this.emit('statusChanged', this.status);
      }

      return isOnline;
    } catch (error) {
      console.error('Connectivity check failed:', error);
      this.updateStatus(false);
      
      if (previousStatus !== false) {
        this.emit('offline', this.status);
        this.emit('statusChanged', this.status);
      }
      
      return false;
    } finally {
      this.isChecking = false;
    }
  }

  private async performConnectivityCheck(): Promise<boolean> {
    // Try multiple endpoints to ensure reliability
    for (const endpoint of this.options.endpoints) {
      try {
        const isReachable = await this.checkEndpoint(endpoint);
        if (isReachable) {
          return true;
        }
      } catch (error) {
        // Continue to next endpoint
        continue;
      }
    }
    return false;
  }

  private async checkEndpoint(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        resolve(false);
      }, this.options.timeout);

      fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
        .then((response) => {
          clearTimeout(timeoutId);
          resolve(response.ok || response.status < 500);
        })
        .catch(() => {
          clearTimeout(timeoutId);
          resolve(false);
        });
    });
  }

  private updateStatus(isOnline: boolean): void {
    const now = new Date();
    const wasOnline = this.status.isOnline;

    this.status.lastChecked = now;

    if (isOnline) {
      if (!wasOnline) {
        this.status.lastOnline = now;
      }
      this.status.consecutiveFailures = 0;
    } else {
      if (wasOnline) {
        this.status.lastOffline = now;
      }
      this.status.consecutiveFailures++;
    }

    this.status.isOnline = isOnline;
  }

  public getStatus(): ConnectivityStatus {
    return { ...this.status };
  }

  public isOnline(): boolean {
    return this.status.isOnline;
  }

  public getLastOnlineTime(): Date | undefined {
    return this.status.lastOnline;
  }

  public getOfflineDuration(): number | null {
    if (this.status.isOnline || !this.status.lastOffline) {
      return null;
    }
    return Date.now() - this.status.lastOffline.getTime();
  }

  public async waitForConnection(timeout?: number): Promise<boolean> {
    if (this.status.isOnline) {
      return true;
    }

    return new Promise((resolve) => {
      let timeoutId: NodeJS.Timeout | undefined;

      const onOnline = () => {
        if (timeoutId) clearTimeout(timeoutId);
        this.off('online', onOnline);
        resolve(true);
      };

      this.on('online', onOnline);

      if (timeout) {
        timeoutId = setTimeout(() => {
          this.off('online', onOnline);
          resolve(false);
        }, timeout);
      }
    });
  }

  public updateOptions(newOptions: Partial<ConnectivityOptions>): void {
    this.options = { ...this.options, ...newOptions };
    
    // Restart with new options if currently running
    if (this.checkTimer) {
      this.stop();
      this.start();
    }
  }

  // For testing purposes
  public setStatus(isOnline: boolean): void {
    this.updateStatus(isOnline);
  }
}