import { z } from 'zod';

export type PlanBody = {
  wallet: string;
  pool: string;
  bandBps: number;
};

export type ExecuteBody = PlanBody;

const ProblemSchema = z.object({
  type: z.string().optional(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  code: z.string().optional(),
});

export type Problem = z.infer<typeof ProblemSchema>;

const PlanResponseSchema = z.object({
  inBand: z.boolean(),
  target: z.object({
    binLower: z.number(),
    binUpper: z.number(),
  }),
  current: z.object({
    midPrice: z.number(),
    binIndex: z.number(),
  }),
});

const ExecuteResponseSchema = z.object({
  txids: z.array(z.string()),
});

export type PlanResp = z.infer<typeof PlanResponseSchema>;
export type ExecuteResp = z.infer<typeof ExecuteResponseSchema>;

export type Result<T> = { ok: true; value: T } | { ok: false; problem: Problem };

export const AdvKind = z.enum(['limitBuy', 'limitSell', 'stopLoss']);
export type AdvKind = z.infer<typeof AdvKind>;

const AdvPlanReqSchema = z.object({
  wallet: z.string().min(32),
  pool: z.string().min(1),
  spec: z.object({
    kind: AdvKind,
    targetPrice: z.number().positive(),
    sizeQuote: z.string().optional(),
    sizeBase: z.string().optional(),
  }),
});
export type AdvPlanReq = z.infer<typeof AdvPlanReqSchema>;

const AdvPlanRespSchema = z.object({
  bins: z.array(z.number().int()),
  singleSided: z.enum(['base', 'quote']),
  note: z.string(),
});
export type AdvPlanResp = z.infer<typeof AdvPlanRespSchema>;

const AdvArmRespSchema = z.object({ txid: z.string() });
export type AdvArmResp = z.infer<typeof AdvArmRespSchema>;

export type AdvArmReq = AdvPlanReq;

const AdvDisarmReqSchema = z.object({
  wallet: z.string().min(32),
  pool: z.string().min(1),
});
export type AdvDisarmReq = z.infer<typeof AdvDisarmReqSchema>;

const AdvDisarmRespSchema = z.object({ txid: z.string() });
export type AdvDisarmResp = z.infer<typeof AdvDisarmRespSchema>;

export const LinkCodeReq = z.object({
  wallet: z.string().min(1),
});
export type LinkCodeReq = z.infer<typeof LinkCodeReq>;

export const LinkCodeResp = z.object({
  code: z.string().min(6),
  deeplink: z.string().url().optional(),
  note: z.string().optional(),
});
export type LinkCodeResp = z.infer<typeof LinkCodeResp>;

export const ConsumeLinkReq = z.object({
  code: z.string().min(6),
  telegramId: z.number().int().positive(),
});
export type ConsumeLinkReq = z.infer<typeof ConsumeLinkReq>;

export const ConsumeLinkResp = z.object({
  wallet: z.string().min(32),
});
export type ConsumeLinkResp = z.infer<typeof ConsumeLinkResp>;

export const WalletByTelegramResp = z.object({
  wallet: z.string().min(32),
});
export type WalletByTelegramResp = z.infer<typeof WalletByTelegramResp>;

const getBaseUrl = (): string => {
  if (typeof process !== 'undefined') {
    const publicUrl = process.env.NEXT_PUBLIC_STRATEGY_URL;
    if (publicUrl && publicUrl.length > 0) {
      return publicUrl.replace(/\/$/, '');
    }
    const serverUrl = process.env.STRATEGY_URL;
    if (serverUrl && serverUrl.length > 0) {
      return serverUrl.replace(/\/$/, '');
    }
  }
  return 'http://localhost:4000';
};

const baseUrl = getBaseUrl();

const toProblem = (raw: unknown, fallback: Problem): Problem => {
  const parseResult = ProblemSchema.safeParse(raw);
  if (parseResult.success) {
    return {
      type: parseResult.data.type ?? fallback.type,
      title: parseResult.data.title,
      status: parseResult.data.status,
      detail: parseResult.data.detail,
      code: parseResult.data.code,
    };
  }
  return fallback;
};

async function request<TResp>(
  path: string,
  schema: z.ZodType<TResp>,
  options: RequestInit,
): Promise<Result<TResp>> {
  try {
    const response = await fetch(`${baseUrl}${path}`, options);

    const fallbackProblem: Problem = {
      type: 'about:blank',
      title: response.statusText || 'Request failed',
      status: response.status || 500,
    };

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.ok) {
      const parseResult = schema.safeParse(payload);
      if (parseResult.success) {
        return { ok: true, value: parseResult.data };
      }
      return {
        ok: false,
        problem: {
          type: fallbackProblem.type,
          title: 'Invalid response from strategy service',
          status: 502,
          detail: parseResult.error.message,
        },
      };
    }

    return { ok: false, problem: toProblem(payload, fallbackProblem) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown network error';
    return {
      ok: false,
      problem: {
        type: 'about:blank',
        title: 'Network error',
        status: 502,
        detail,
      },
    };
  }
}

const post = <TBody extends object, TResp>(
  path: string,
  body: TBody,
  schema: z.ZodType<TResp>,
): Promise<Result<TResp>> =>
  request(path, schema, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

const get = <TResp>(path: string, schema: z.ZodType<TResp>): Promise<Result<TResp>> =>
  request(path, schema, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

export async function planRebalance(body: PlanBody): Promise<Result<PlanResp>> {
  return post('/rebalance/plan', body, PlanResponseSchema);
}

export async function executeRebalance(body: ExecuteBody): Promise<Result<ExecuteResp>> {
  return post('/rebalance/execute', body, ExecuteResponseSchema);
}

export function planAdvanced(body: AdvPlanReq): Promise<Result<AdvPlanResp>> {
  const parsed = AdvPlanReqSchema.safeParse(body);
  if (!parsed.success) {
    return Promise.resolve({
      ok: false,
      problem: {
        type: 'about:blank',
        title: 'Invalid request',
        status: 400,
        detail: parsed.error.message,
        code: 'InvalidInput',
      },
    });
  }
  return post('/orders/advanced/plan', parsed.data, AdvPlanRespSchema);
}

export function armAdvanced(body: AdvArmReq): Promise<Result<AdvArmResp>> {
  const parsed = AdvPlanReqSchema.safeParse(body);
  if (!parsed.success) {
    return Promise.resolve({
      ok: false,
      problem: {
        type: 'about:blank',
        title: 'Invalid request',
        status: 400,
        detail: parsed.error.message,
        code: 'InvalidInput',
      },
    });
  }
  return post('/orders/advanced/arm', parsed.data, AdvArmRespSchema);
}

export function disarmAdvanced(body: AdvDisarmReq): Promise<Result<AdvDisarmResp>> {
  const parsed = AdvDisarmReqSchema.safeParse(body);
  if (!parsed.success) {
    return Promise.resolve({
      ok: false,
      problem: {
        type: 'about:blank',
        title: 'Invalid request',
        status: 400,
        detail: parsed.error.message,
        code: 'InvalidInput',
      },
    });
  }
  return post('/orders/advanced/disarm', parsed.data, AdvDisarmRespSchema);
}

export function createLinkCode(body: LinkCodeReq): Promise<Result<LinkCodeResp>> {
  const parsed = LinkCodeReq.safeParse(body);
  if (!parsed.success) {
    return Promise.resolve({
      ok: false,
      problem: {
        type: 'about:blank',
        title: 'Invalid request',
        status: 400,
        detail: parsed.error.message,
        code: 'InvalidInput',
      },
    });
  }
  return post('/bot/link-code', parsed.data, LinkCodeResp);
}

export function consumeLink(body: ConsumeLinkReq): Promise<Result<ConsumeLinkResp>> {
  const parsed = ConsumeLinkReq.safeParse(body);
  if (!parsed.success) {
    return Promise.resolve({
      ok: false,
      problem: {
        type: 'about:blank',
        title: 'Invalid request',
        status: 400,
        detail: parsed.error.message,
        code: 'InvalidInput',
      },
    });
  }
  return post('/bot/consume-link', parsed.data, ConsumeLinkResp);
}

export function getWalletByTelegram(telegramId: number): Promise<Result<WalletByTelegramResp>> {
  if (!Number.isFinite(telegramId) || telegramId <= 0) {
    return Promise.resolve({
      ok: false,
      problem: {
        type: 'about:blank',
        title: 'Invalid request',
        status: 400,
        detail: 'telegramId must be a positive number',
        code: 'InvalidInput',
      },
    });
  }
  return get(`/bot/wallet/${telegramId}`, WalletByTelegramResp);
}
