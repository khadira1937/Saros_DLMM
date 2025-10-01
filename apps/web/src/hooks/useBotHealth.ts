import { useEffect, useState } from "react";

export type BotHealthState = {
  loading: boolean;
  ok: boolean;
  dryRun: boolean;
};

export function useBotHealth(url?: string): BotHealthState {
  const [state, setState] = useState<BotHealthState>({
    loading: Boolean(url),
    ok: false,
    dryRun: false,
  });

  useEffect(() => {
    if (!url) {
      setState({ loading: false, ok: false, dryRun: false });
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    setState({ loading: true, ok: false, dryRun: false });

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as { dryRun?: unknown };
        const dryRun = typeof payload.dryRun === "boolean" ? payload.dryRun : false;
        if (isActive) {
          setState({ loading: false, ok: true, dryRun });
        }
      })
      .catch(() => {
        if (isActive) {
          setState({ loading: false, ok: false, dryRun: false });
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });

    return () => {
      isActive = false;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [url]);

  return state;
}
