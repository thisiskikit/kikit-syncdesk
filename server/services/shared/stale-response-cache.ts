type FreshnessResponse = {
  fetchedAt: string;
  servedFromCache?: boolean;
};

type CacheEntry<T extends FreshnessResponse> = {
  value: T;
  refreshedAtMs: number;
  inFlight: Promise<void> | null;
};

function getFetchedAtMs(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function cloneResponse<T>(value: T): T {
  return structuredClone(value);
}

function isBackgroundRefreshDisabled() {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

export function createStaleResponseCache<T extends FreshnessResponse>(freshTtlMs: number) {
  const entries = new Map<string, CacheEntry<T>>();

  async function loadAndStore(key: string, load: () => Promise<T>) {
    const value = cloneResponse(await load());
    const refreshedAtMs = getFetchedAtMs(value.fetchedAt);
    entries.set(key, {
      value,
      refreshedAtMs,
      inFlight: null,
    });

    return cloneResponse({
      ...value,
      servedFromCache: false,
    });
  }

  function scheduleRefresh(key: string, load: () => Promise<T>) {
    if (isBackgroundRefreshDisabled()) {
      return;
    }

    const current = entries.get(key);
    if (current?.inFlight) {
      return;
    }

    const refreshPromise = loadAndStore(key, load)
      .catch(() => undefined)
      .finally(() => {
        const latest = entries.get(key);
        if (latest) {
          entries.set(key, {
            ...latest,
            inFlight: null,
          });
        }
      });

    entries.set(key, {
      value: current?.value ?? ({} as T),
      refreshedAtMs: current?.refreshedAtMs ?? 0,
      inFlight: refreshPromise.then(() => undefined),
    });
  }

  return {
    async getOrLoad(key: string, input: { refresh?: boolean; load: () => Promise<T> }) {
      const current = entries.get(key);

      if (input.refresh || !current) {
        return loadAndStore(key, input.load);
      }

      const ageMs = Date.now() - current.refreshedAtMs;
      if (ageMs > freshTtlMs) {
        scheduleRefresh(key, input.load);
      }

      return cloneResponse({
        ...current.value,
        servedFromCache: true,
      });
    },
  };
}
