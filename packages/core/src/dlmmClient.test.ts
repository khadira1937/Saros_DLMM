import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPoolAddressesMock = vi.fn<[], Promise<string[]>>();
const fetchPoolMetadataMock = vi.fn<[string], Promise<Record<string, unknown>>>();
const getUserPositionsMock = vi.fn<[unknown], Promise<Array<Record<string, unknown>>>>();
const getBinsReserveInformationMock = vi.fn<[unknown], Promise<Array<{ reserveX?: number; reserveY?: number }>>>();
const getPairAccountMock = vi.fn<[unknown], Promise<{ binStep: number; activeId: number }>>();

const registerSdkMock = () => {
  vi.doMock('@saros-finance/dlmm-sdk', () => {
    class LiquidityBookServicesMock {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(config: unknown) {}

      fetchPoolAddresses = fetchPoolAddressesMock;
      fetchPoolMetadata = fetchPoolMetadataMock;
      getUserPositions = getUserPositionsMock;
      getBinsReserveInformation = getBinsReserveInformationMock;
      getPairAccount = getPairAccountMock;
    }

    return {
      LiquidityBookServices: LiquidityBookServicesMock,
      MODE: {
        DEVNET: 'devnet',
        TESTNET: 'testnet',
        MAINNET: 'mainnet',
      },
    };
  });
};

const loadClientModule = async () => {
  registerSdkMock();
  return import('./dlmmClient');
};

const setBaseEnv = (mockMode: boolean) => {
  process.env.MOCK_MODE = mockMode ? 'true' : 'false';
  process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
};

const resetMocks = () => {
  fetchPoolAddressesMock.mockReset();
  fetchPoolMetadataMock.mockReset();
  getUserPositionsMock.mockReset();
  getBinsReserveInformationMock.mockReset();
  getPairAccountMock.mockReset();
};

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  resetMocks();
});

describe('dlmmClient in mock mode', () => {
  beforeEach(() => {
    setBaseEnv(true);
  });

  it('validates inputs and reports InvalidInput', async () => {
    const module = await loadClientModule();
    const result = await module.removeLiquidity({
      pool: '',
      binLower: 10,
      binUpper: 5,
      percent: -1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('InvalidInput');
      expect(result.detail).toContain('binLower');
    }
  });

  it('returns deterministic mock pools and positions', async () => {
    const module = await loadClientModule();
    const pools = await module.listPools();
    expect(pools.ok).toBe(true);
    if (pools.ok) {
      expect(pools.value).toHaveLength(3);
      expect(pools.value[0]?.address).toBe('MOCK_POOL_SOL_USDC');
    }

    const wallet = '11111111111111111111111111111111';
    const positions = await module.getUserPositions(wallet);
    expect(positions.ok).toBe(true);
    if (positions.ok) {
      expect(positions.value).not.toHaveLength(0);
      const [first] = positions.value;
      expect(first.pool).toBe('MOCK_POOL_SOL_USDC');
      expect(Number(first.amountBase)).toBeGreaterThan(0);
    }
    expect(fetchPoolAddressesMock).not.toHaveBeenCalled();
  });

  it('returns mock transaction ids for liquidity actions without touching SDK', async () => {
    const module = await loadClientModule();
    const addResult = await module.addLiquidity({
      pool: 'dummy',
      binLower: 0,
      binUpper: 1,
      singleSided: 'both',
      amountBase: '10',
      amountQuote: '20',
    });
    expect(addResult.ok).toBe(true);
    if (addResult.ok) {
      expect(addResult.value.txid.startsWith('MOCK-')).toBe(true);
    }

    const removeResult = await module.removeLiquidity({
      pool: 'dummy',
      binLower: 0,
      binUpper: 1,
      percent: 50,
    });
    expect(removeResult.ok).toBe(true);
    if (removeResult.ok) {
      expect(removeResult.value.txid.startsWith('MOCK-')).toBe(true);
    }

    expect(fetchPoolAddressesMock).not.toHaveBeenCalled();
  });

  it('computes mock prices deterministically', async () => {
    const module = await loadClientModule();
    const binIndex = await module.priceToBinIndex('dummy', 1.23);
    expect(binIndex.ok).toBe(true);
    if (binIndex.ok) {
      expect(binIndex.value).toBe(123);
    }

    const midPrice = await module.currentMidPrice('dummy');
    expect(midPrice.ok).toBe(true);
    if (midPrice.ok) {
      expect(midPrice.value).toBeCloseTo(1.2345);
    }
  });
});

describe('dlmmClient in real mode (SDK mocked)', () => {
  const poolAddress = '8vQhU3vCdrVW7o1F4UZt6Zjmxv1WzRduCMsZbxXXdZ6d';
  const positionAddress = '5G9rbNcXJ6X4iY85fVnJ4s5o7p6Tq6hsUYk7sj8V5gqQ';

  beforeEach(() => {
    setBaseEnv(false);

    fetchPoolAddressesMock.mockResolvedValue([poolAddress]);
    fetchPoolMetadataMock.mockResolvedValue({
      poolAddress,
      baseMint: 'So11111111111111111111111111111111111111112',
      quoteMint: 'USDC11111111111111111111111111111111111111',
      baseReserve: '1000',
      quoteReserve: '500',
      tradeFee: 0.01,
      extra: {
        tokenBaseDecimal: 9,
        tokenQuoteDecimal: 6,
      },
    });
    getUserPositionsMock.mockResolvedValue([
      {
        lowerBinId: 5,
        upperBinId: 10,
        position: positionAddress,
      },
    ]);
    getBinsReserveInformationMock.mockResolvedValue([
      { reserveX: 100, reserveY: 200 },
    ]);
    getPairAccountMock.mockResolvedValue({ binStep: 15, activeId: 1200 });
  });

  it('lists pools via SDK', async () => {
    const module = await loadClientModule();
    const result = await module.listPools();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.address).toBe(poolAddress);
      expect(fetchPoolAddressesMock).toHaveBeenCalledTimes(1);
    }
  });

  it('maps user positions using SDK data', async () => {
    const module = await loadClientModule();
    const wallet = '3CM5oG3PH2zQyB7Zk9gCtwEwS5cX3X1yAyHK6VD5UJ8A';
    const result = await module.getUserPositions(wallet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      const [position] = result.value;
      expect(position.pool).toBe(poolAddress);
      expect(position.amountBase).toBe('100');
      expect(position.amountQuote).toBe('200');
    }
  });

  it('computes price metrics via SDK helpers', async () => {
    const module = await loadClientModule();
    const binIndex = await module.priceToBinIndex(poolAddress, 1.23);
    expect(binIndex.ok).toBe(true);
    if (binIndex.ok) {
      expect(binIndex.value).toBe(123);
    }

    const midPrice = await module.currentMidPrice(poolAddress);
    expect(midPrice.ok).toBe(true);
    if (midPrice.ok) {
      expect(midPrice.value).toBeGreaterThan(0);
    }
  });

  it('maps SDK errors to RateLimited', async () => {
    fetchPoolAddressesMock.mockRejectedValueOnce(new Error('429 too many requests'));
    const module = await loadClientModule();
    const result = await module.listPools();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('RateLimited');
    }
  });
});
