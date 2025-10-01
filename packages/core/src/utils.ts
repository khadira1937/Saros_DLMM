// Common result type for error handling (legacy shape)
export type LegacyResult<T, E = Error> = {
  success: true;
  data: T;
} | {
  success: false;
  error: E;
};

/**
 * Creates a successful result
 */
export function ok<T>(data: T): LegacyResult<T, never> {
  return { success: true, data };
}

/**
 * Creates an error result
 */
export function err<E>(error: E): LegacyResult<never, E> {
  return { success: false, error };
}

/**
 * Wraps an async function to return a Result instead of throwing
 */
export async function safeAsync<T>(fn: () => Promise<T>): Promise<LegacyResult<T, Error>> {
  try {
    const data = await fn();
    return ok(data);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Wraps a sync function to return a Result instead of throwing
 */
export function safe<T>(fn: () => T): LegacyResult<T, Error> {
  try {
    const data = fn();
    return ok(data);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// Logging utilities
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

export function createLogger(level: LogLevel = 'info'): Logger {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levels[level] ?? 1;

  return {
    debug: (message: string, ...args: unknown[]) => {
      if (currentLevel <= 0) {
        console.debug(`[DEBUG] ${message}`, ...args);
      }
    },
    info: (message: string, ...args: unknown[]) => {
      if (currentLevel <= 1) {
        console.info(`[INFO] ${message}`, ...args);
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      if (currentLevel <= 2) {
        console.warn(`[WARN] ${message}`, ...args);
      }
    },
    error: (message: string, ...args: unknown[]) => {
      if (currentLevel <= 3) {
        console.error(`[ERROR] ${message}`, ...args);
      }
    },
  };
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error = new Error('Retry failed with no attempts');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts) {
        break;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
