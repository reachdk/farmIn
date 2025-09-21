export interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTime: number;
}

export class RetryService {
  private static readonly DEFAULT_OPTIONS: RetryOptions = {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  };

  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<RetryResult<T>> {
    const config = { ...this.DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        return {
          success: true,
          result,
          attempts: attempt,
          totalTime: Date.now() - startTime
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't wait after the last attempt
        if (attempt < config.maxAttempts) {
          const delay = this.calculateDelay(attempt - 1, config);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: config.maxAttempts,
      totalTime: Date.now() - startTime
    };
  }

  static async executeWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 5,
    initialDelay: number = 1000
  ): Promise<T> {
    const result = await this.executeWithRetry(operation, {
      maxAttempts,
      initialDelay,
      backoffMultiplier: 2,
      jitter: true
    });

    if (result.success && result.result !== undefined) {
      return result.result;
    }

    throw result.error || new Error('Operation failed after all retry attempts');
  }

  private static calculateDelay(attempt: number, options: RetryOptions): number {
    const { initialDelay, maxDelay = 30000, backoffMultiplier = 2, jitter = true } = options;
    
    // Calculate exponential backoff
    let delay = initialDelay * Math.pow(backoffMultiplier, attempt);
    
    // Apply maximum delay limit
    delay = Math.min(delay, maxDelay);
    
    // Add jitter to prevent thundering herd
    if (jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static isRetryableError(error: Error): boolean {
    // Define which errors should trigger retries
    const retryablePatterns = [
      /network/i,
      /timeout/i,
      /connection/i,
      /temporary/i,
      /unavailable/i,
      /rate limit/i,
      /too many requests/i,
      /502/,
      /503/,
      /504/
    ];

    const errorMessage = error.message.toLowerCase();
    return retryablePatterns.some(pattern => pattern.test(errorMessage));
  }

  static shouldRetryBasedOnStatusCode(statusCode: number): boolean {
    // Retry on server errors and rate limiting
    return statusCode >= 500 || statusCode === 429;
  }
}