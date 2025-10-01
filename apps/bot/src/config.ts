import { getBotEnvironment } from '@dlmm-copilot/core';

export const env = getBotEnvironment();

export type BotEnvironment = typeof env;