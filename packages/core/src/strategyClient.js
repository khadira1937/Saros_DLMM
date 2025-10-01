import { z } from 'zod';
const ProblemSchema = z.object({
    type: z.string().optional(),
    title: z.string(),
    status: z.number(),
    detail: z.string().optional(),
    code: z.string().optional(),
});
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
export const AdvKind = z.enum(['limitBuy', 'limitSell', 'stopLoss']);
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
const AdvPlanRespSchema = z.object({
    bins: z.array(z.number().int()),
    singleSided: z.enum(['base', 'quote']),
    note: z.string(),
});
const AdvArmRespSchema = z.object({ txid: z.string() });
const AdvDisarmReqSchema = z.object({
    wallet: z.string().min(32),
    pool: z.string().min(1),
});
const AdvDisarmRespSchema = z.object({ txid: z.string() });
const getBaseUrl = () => {
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
const toProblem = (raw, fallback) => {
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
async function request(path, body, schema) {
    try {
        const response = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(body),
        });
        const fallbackProblem = {
            type: 'about:blank',
            title: response.statusText || 'Request failed',
            status: response.status || 500,
        };
        let payload = null;
        try {
            payload = await response.json();
        }
        catch {
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
    }
    catch (error) {
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
export async function planRebalance(body) {
    return request('/rebalance/plan', body, PlanResponseSchema);
}
export async function executeRebalance(body) {
    return request('/rebalance/execute', body, ExecuteResponseSchema);
}
export function planAdvanced(body) {
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
    return request('/orders/advanced/plan', parsed.data, AdvPlanRespSchema);
}
export function armAdvanced(body) {
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
    return request('/orders/advanced/arm', parsed.data, AdvArmRespSchema);
}
export function disarmAdvanced(body) {
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
    return request('/orders/advanced/disarm', parsed.data, AdvDisarmRespSchema);
}
