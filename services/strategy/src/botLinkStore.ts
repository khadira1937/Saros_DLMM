import { randomBytes } from 'node:crypto';

export type PendingCode = {
  wallet: string;
  createdAt: number;
  ttlMs: number;
};

export type ConsumeResult =
  | { ok: true; wallet: string }
  | { ok: false; reason: 'invalid' | 'expired' };

const pendingByCode = new Map<string, PendingCode>();
const walletByTelegram = new Map<number, { wallet: string; linkedAt: number }>();

const CODE_LENGTH = 8;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const generateCode = (): string => {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    const byte = bytes.at(index) ?? 0;
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
};

export const createCode = (wallet: string, ttlMs = 10 * 60 * 1000): string => {
  let attempt = 0;
  let code = generateCode();
  while (pendingByCode.has(code) && attempt < 5) {
    code = generateCode();
    attempt += 1;
  }
  pendingByCode.set(code, { wallet, createdAt: Date.now(), ttlMs });
  return code;
};

export const consumeCode = (code: string, telegramId: number): ConsumeResult => {
  const pending = pendingByCode.get(code);
  if (!pending) {
    return { ok: false, reason: 'invalid' };
  }
  const age = Date.now() - pending.createdAt;
  if (age > pending.ttlMs) {
    pendingByCode.delete(code);
    return { ok: false, reason: 'expired' };
  }
  pendingByCode.delete(code);
  walletByTelegram.set(telegramId, { wallet: pending.wallet, linkedAt: Date.now() });
  return { ok: true, wallet: pending.wallet };
};

export const getWallet = (telegramId: number): string | undefined =>
  walletByTelegram.get(telegramId)?.wallet;

export const clearPending = (): void => {
  pendingByCode.clear();
};

export const clearBindings = (): void => {
  walletByTelegram.clear();
};
