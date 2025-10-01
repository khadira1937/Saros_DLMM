import { getStrategyEnvironment } from '@dlmm-copilot/core';

export const env = getStrategyEnvironment();

export type StrategyEnvironment = typeof env;