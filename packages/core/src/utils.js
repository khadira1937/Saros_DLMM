/**
 * Creates a successful result
 */
export function ok(data) {
    return { success: true, data };
}
/**
 * Creates an error result
 */
export function err(error) {
    return { success: false, error };
}
/**
 * Wraps an async function to return a Result instead of throwing
 */
export async function safeAsync(fn) {
    try {
        const data = await fn();
        return ok(data);
    }
    catch (error) {
        return err(error instanceof Error ? error : new Error(String(error)));
    }
}
/**
 * Wraps a sync function to return a Result instead of throwing
 */
export function safe(fn) {
    try {
        const data = fn();
        return ok(data);
    }
    catch (error) {
        return err(error instanceof Error ? error : new Error(String(error)));
    }
}
export function createLogger(level = 'info') {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[level] ?? 1;
    return {
        debug: (message, ...args) => {
            if (currentLevel <= 0) {
                console.debug(`[DEBUG] ${message}`, ...args);
            }
        },
        info: (message, ...args) => {
            if (currentLevel <= 1) {
                console.info(`[INFO] ${message}`, ...args);
            }
        },
        warn: (message, ...args) => {
            if (currentLevel <= 2) {
                console.warn(`[WARN] ${message}`, ...args);
            }
        },
        error: (message, ...args) => {
            if (currentLevel <= 3) {
                console.error(`[ERROR] ${message}`, ...args);
            }
        },
    };
}
/**
 * Retry function with exponential backoff
 */
export async function retry(fn, maxAttempts = 3, baseDelay = 1000) {
    let lastError = new Error('Retry failed with no attempts');
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
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
