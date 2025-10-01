import fetch, { RequestInit } from 'node-fetch';
import { createLogger, StrategyConfig } from '@dlmm-copilot/core';

const logger = createLogger('info');

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  success: false;
  error: string;
}

type StrategyListApiResponse = ApiSuccess<Array<{ id: string; strategy: StrategyConfig }>> | ApiError;
type StrategyMutationApiResponse = ApiSuccess<{ id: string }> | ApiError;
type GenericSuccessApiResponse = ApiSuccess<{ message?: string }> | ApiError;

type ExecResult = { success: true; strategyId: string } | { success: false; error: string };
type BasicResult = { success: true } | { success: false; error: string };

export interface CreateStrategyRequest {
  userId: string;
  pairAddress: string;
  enabled?: boolean;
  rebalanceThreshold?: number;
  maxSlippage?: number;
  minLiquidity: string;
  maxLiquidity: string;
  targetRangeWidth?: number;
  rebalanceInterval?: number;
}

/**
 * Strategy service client for communicating with the strategy API
 */
export class StrategyService {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API error: ${response.status} ${errorBody}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Get strategies for a specific user
   */
  async getUserStrategies(userId: string): Promise<StrategyConfig[]> {
    try {
      const result = await this.request<StrategyListApiResponse>('/strategies');

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data
        .map((item) => item.strategy)
        .filter((strategy) => strategy.name.includes(userId));
    } catch (error) {
      logger.error('Error fetching user strategies:', error);
      return [];
    }
  }

  /**
   * Create a new strategy
   */
  async createStrategy(request: CreateStrategyRequest): Promise<ExecResult> {
    try {
      const body = {
        pairAddress: request.pairAddress,
        enabled: request.enabled ?? true,
        rebalanceThreshold: request.rebalanceThreshold ?? 0.1,
        maxSlippage: request.maxSlippage ?? 0.01,
        minLiquidity: request.minLiquidity,
        maxLiquidity: request.maxLiquidity,
        targetRangeWidth: request.targetRangeWidth ?? 20,
        rebalanceInterval: request.rebalanceInterval ?? 300,
      };

      const result = await this.request<StrategyMutationApiResponse>('/strategies', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!result.success) {
        return { success: false as const, error: result.error };
      }

      return { success: true as const, strategyId: result.data.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create strategy';
      logger.error('Error creating strategy:', message);
      return { success: false as const, error: message };
    }
  }

  /**
   * Update an existing strategy
   */
  async updateStrategy(strategyId: string, updates: Partial<CreateStrategyRequest>): Promise<BasicResult> {
    try {
      const result = await this.request<GenericSuccessApiResponse>(`/strategies/${strategyId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });

      if (!result.success) {
        return { success: false as const, error: result.error };
      }

      return { success: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update strategy';
      logger.error('Error updating strategy:', message);
      return { success: false as const, error: message };
    }
  }

  /**
   * Delete a strategy
   */
  async deleteStrategy(strategyId: string): Promise<BasicResult> {
    try {
      const result = await this.request<GenericSuccessApiResponse>(`/strategies/${strategyId}`, {
        method: 'DELETE',
      });

      if (!result.success) {
        return { success: false as const, error: result.error };
      }

      return { success: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete strategy';
      logger.error('Error deleting strategy:', message);
      return { success: false as const, error: message };
    }
  }
}
