import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ApiResponse } from "@shared/api";
import {
  getOperationErrorSummary,
  getOperationResultSummaryText,
  getOperationTitle,
  type OperationChannel,
  type OperationExecutionResponse,
  type OperationListResponse,
  type OperationLogEntry,
  type OperationMode,
  type OperationStatus,
} from "@shared/operations";
import { apiRequestJson, getJson, unwrapApiResponse } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/api-url";
import {
  flattenSharedLocalToasts,
  parseSharedLocalToastStore,
  removeSharedLocalToast,
  SHARED_LOCAL_TOAST_STORAGE_KEY,
  SHARED_LOCAL_TOAST_SYNC_CHANNEL,
  touchSharedLocalToastOwner,
  updateSharedLocalToastOwner,
  type SharedLocalToast,
  type SharedLocalToastStore,
} from "@/lib/shared-local-toasts";

export type OperationToast = {
  toastId: string;
  source: "server" | "local";
  operationId: string | null;
  channel: OperationChannel;
  title: string;
  menuKey: string | null;
  actionKey: string | null;
  mode: OperationMode | null;
  targetCount: number;
  status: OperationStatus;
  summary: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type OperationContextValue = {
  operations: OperationLogEntry[];
  toasts: OperationToast[];
  refreshOperations: () => Promise<void>;
  publishOperation: (operation: OperationLogEntry) => void;
  dismissToast: (toastId: string) => void;
  startLocalOperation: (input: {
    channel: OperationChannel;
    actionName: string;
    targetCount: number;
    summary?: string | null;
    status?: OperationStatus;
  }) => string;
  finishLocalOperation: (
    toastId: string,
    input: {
      status: OperationStatus;
      summary?: string | null;
      errorMessage?: string | null;
    },
  ) => void;
  removeLocalOperation: (toastId: string) => void;
  retryOperation: (operationId: string) => Promise<void>;
  cancelOperation: (operationId: string) => Promise<void>;
};

const OperationContext = createContext<OperationContextValue | null>(null);

function sortOperations(items: OperationLogEntry[]) {
  return items
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function upsertOperationList(items: OperationLogEntry[], next: OperationLogEntry) {
  const filtered = items.filter((item) => item.id !== next.id);
  return sortOperations([next, ...filtered]);
}

function compactOperationResultSummary(
  summary: OperationLogEntry["resultSummary"],
): OperationLogEntry["resultSummary"] {
  if (!summary) {
    return null;
  }

  return {
    headline: compactOperationText(summary.headline),
    detail: compactOperationText(summary.detail),
    preview: compactOperationText(summary.preview),
    stats: null,
  };
}

function compactOperationText(value: string | null | undefined, maxLength = 320) {
  if (!value) {
    return null;
  }

  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function compactOperationEntry(operation: OperationLogEntry): OperationLogEntry {
  return {
    ...operation,
    targetIds: operation.targetIds.slice(0, 10),
    requestPayload: null,
    normalizedPayload: null,
    resultSummary: compactOperationResultSummary(operation.resultSummary),
    errorMessage: compactOperationText(operation.errorMessage),
  };
}

function mapOperationToToast(operation: OperationLogEntry): OperationToast {
  return {
    toastId: `server:${operation.id}`,
    source: "server",
    operationId: operation.id,
    channel: operation.channel,
    title: getOperationTitle(operation),
    menuKey: operation.menuKey,
    actionKey: operation.actionKey,
    mode: operation.mode,
    targetCount: operation.targetCount,
    status: operation.status,
    summary: getOperationResultSummaryText(operation.resultSummary),
    errorMessage: getOperationErrorSummary(operation),
    startedAt: operation.startedAt,
    finishedAt: operation.finishedAt,
  };
}

function getToastVisibilityKey(toast: Pick<OperationToast, "status" | "summary" | "errorMessage" | "startedAt" | "finishedAt">) {
  return [
    toast.status,
    toast.summary ?? "",
    toast.errorMessage ?? "",
    toast.startedAt,
    toast.finishedAt ?? "",
  ].join("|");
}

function shouldHydrateToast(operation: OperationLogEntry) {
  if (operation.status === "queued" || operation.status === "running") {
    return true;
  }

  if (operation.status === "error" || operation.status === "warning") {
    if (!operation.finishedAt) {
      return true;
    }

    const age = Date.now() - new Date(operation.finishedAt).getTime();
    return age <= 15_000;
  }

  if (operation.status === "success" && operation.finishedAt) {
    const age = Date.now() - new Date(operation.finishedAt).getTime();
    return age <= 4_000;
  }

  return false;
}

function parseEventData<T>(raw: string): T {
  return unwrapApiResponse(JSON.parse(raw) as ApiResponse<T> | T);
}

function isOperationLogEntryLike(value: unknown): value is OperationLogEntry {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { status?: unknown }).status === "string",
  );
}

function getOperationItems(value: unknown) {
  if (!value || typeof value !== "object") {
    return [];
  }

  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter(isOperationLogEntryLike);
}

function createLocalToastOwnerId() {
  return `window:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function readSharedLocalToastStoreFromStorage() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return parseSharedLocalToastStore(window.localStorage.getItem(SHARED_LOCAL_TOAST_STORAGE_KEY));
  } catch {
    return {};
  }
}

function areSharedLocalToastStoresEqual(
  left: SharedLocalToastStore,
  right: SharedLocalToastStore,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function OperationProvider(props: { children: ReactNode }) {
  const [operations, setOperations] = useState<OperationLogEntry[]>([]);
  const [serverToasts, setServerToasts] = useState<Record<string, OperationToast>>({});
  const [sharedLocalToastStore, setSharedLocalToastStore] = useState<SharedLocalToastStore>(
    readSharedLocalToastStoreFromStorage,
  );
  const timerRef = useRef<Map<string, number>>(new Map());
  const dismissedServerToastKeysRef = useRef<Map<string, string>>(new Map());
  const localToastOwnerIdRef = useRef(createLocalToastOwnerId());
  const localToastSyncChannelRef = useRef<BroadcastChannel | null>(null);
  const localToastOwnerId = localToastOwnerIdRef.current;

  const clearToastTimer = useEffectEvent((toastId: string) => {
    const timer = timerRef.current.get(toastId);
    if (timer) {
      window.clearTimeout(timer);
      timerRef.current.delete(toastId);
    }
  });

  const broadcastSharedLocalToastStoreChange = useEffectEvent(() => {
    localToastSyncChannelRef.current?.postMessage({ type: "sync" });
  });

  const syncSharedLocalToastStore = useEffectEvent(() => {
    const nextStore = readSharedLocalToastStoreFromStorage();
    setSharedLocalToastStore((current) =>
      areSharedLocalToastStoresEqual(current, nextStore) ? current : nextStore,
    );
  });

  const persistSharedLocalToastStore = useEffectEvent((nextStore: SharedLocalToastStore) => {
    if (typeof window === "undefined") {
      setSharedLocalToastStore((current) =>
        areSharedLocalToastStoresEqual(current, nextStore) ? current : nextStore,
      );
      return;
    }

    try {
      window.localStorage.setItem(
        SHARED_LOCAL_TOAST_STORAGE_KEY,
        JSON.stringify(nextStore),
      );
    } catch {
      return;
    }

    setSharedLocalToastStore((current) =>
      areSharedLocalToastStoresEqual(current, nextStore) ? current : nextStore,
    );
    broadcastSharedLocalToastStoreChange();
  });

  const updateOwnSharedLocalToasts = useEffectEvent((
    updater: (current: Record<string, SharedLocalToast>) => Record<string, SharedLocalToast>,
  ) => {
    const ownerId = localToastOwnerIdRef.current;
    const currentStore = readSharedLocalToastStoreFromStorage();
    const currentOwnerToasts = currentStore[ownerId]?.toasts ?? {};
    const nextOwnerToasts = updater(currentOwnerToasts);
    const nextStore = updateSharedLocalToastOwner(currentStore, ownerId, nextOwnerToasts);
    persistSharedLocalToastStore(nextStore);
    return nextStore;
  });

  const touchOwnSharedLocalToasts = useEffectEvent(() => {
    const ownerId = localToastOwnerIdRef.current;
    const currentStore = readSharedLocalToastStoreFromStorage();
    const nextStore = touchSharedLocalToastOwner(currentStore, ownerId);
    persistSharedLocalToastStore(nextStore);
  });

  const clearOwnSharedLocalToasts = useEffectEvent((syncState = true) => {
    const ownerId = localToastOwnerIdRef.current;
    const currentStore = readSharedLocalToastStoreFromStorage();
    const nextStore = updateSharedLocalToastOwner(currentStore, ownerId, {});

    if (!syncState && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          SHARED_LOCAL_TOAST_STORAGE_KEY,
          JSON.stringify(nextStore),
        );
      } catch {
        return;
      }
      broadcastSharedLocalToastStoreChange();
      return;
    }

    persistSharedLocalToastStore(nextStore);
  });

  const dismissSharedLocalToast = useEffectEvent((toastId: string) => {
    const currentStore = readSharedLocalToastStoreFromStorage();
    const nextStore = removeSharedLocalToast(currentStore, toastId);
    persistSharedLocalToastStore(nextStore);
  });

  const dismissToast = useEffectEvent((toastId: string) => {
    clearToastTimer(toastId);
    if (toastId.startsWith("server:")) {
      setServerToasts((current) => {
        const next = { ...current };
        const toast = next[toastId];
        if (toast) {
          dismissedServerToastKeysRef.current.set(
            toastId,
            getToastVisibilityKey(toast),
          );
        }
        delete next[toastId];
        return next;
      });
      return;
    }

    dismissSharedLocalToast(toastId);
  });

  const shouldSkipDismissedServerToast = useEffectEvent((toast: OperationToast) => {
    const dismissedKey = dismissedServerToastKeysRef.current.get(toast.toastId);
    if (!dismissedKey) {
      return false;
    }

    const currentKey = getToastVisibilityKey(toast);
    if (dismissedKey === currentKey) {
      return true;
    }

    dismissedServerToastKeysRef.current.delete(toast.toastId);
    return false;
  });

  const scheduleAutoDismiss = useEffectEvent((toastId: string, status: OperationStatus) => {
    clearToastTimer(toastId);
    let delay = 0;

    if (status === "success") {
      delay = 4_000;
    } else if (status === "warning" || status === "error") {
      delay = 15_000;
    }

    if (!delay) {
      return;
    }

    const timer = window.setTimeout(() => {
      dismissToast(toastId);
    }, delay);
    timerRef.current.set(toastId, timer);
  });

  const publishOperation = useEffectEvent((operation: OperationLogEntry) => {
    const compacted = compactOperationEntry(operation);
    setOperations((current) => upsertOperationList(current, compacted));

    const toast = mapOperationToToast(compacted);
    if (shouldSkipDismissedServerToast(toast)) {
      return;
    }

    setServerToasts((current) => ({
      ...current,
      [toast.toastId]: toast,
    }));
    scheduleAutoDismiss(toast.toastId, toast.status);
  });

  const hydrateSnapshot = useEffectEvent((items: OperationLogEntry[]) => {
    const compactedItems = items.map(compactOperationEntry);
    setOperations(sortOperations(compactedItems));
    const hydratedToasts = compactedItems
      .filter(shouldHydrateToast)
      .map(mapOperationToToast)
      .filter((toast) => !shouldSkipDismissedServerToast(toast));
    setServerToasts(
      Object.fromEntries(hydratedToasts.map((toast) => [toast.toastId, toast])),
    );
    for (const toast of hydratedToasts) {
      scheduleAutoDismiss(toast.toastId, toast.status);
    }
  });

  const refreshOperations = useEffectEvent(async () => {
    const result = await getJson<OperationListResponse>("/api/operations?limit=50");
    hydrateSnapshot(getOperationItems(result));
  });

  useEffect(() => {
    syncSharedLocalToastStore();

    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SHARED_LOCAL_TOAST_STORAGE_KEY) {
        return;
      }

      syncSharedLocalToastStore();
    };

    const handlePageHide = () => {
      clearOwnSharedLocalToasts(false);
    };

    let syncChannel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      syncChannel = new BroadcastChannel(SHARED_LOCAL_TOAST_SYNC_CHANNEL);
      localToastSyncChannelRef.current = syncChannel;
      syncChannel.onmessage = () => {
        syncSharedLocalToastStore();
      };
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pagehide", handlePageHide);
      clearOwnSharedLocalToasts(false);
      syncChannel?.close();
      localToastSyncChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let eventSource: EventSource | null = null;
    let pollTimer: number | null = null;
    let reconnectTimer: number | null = null;

    const runRefreshSafely = async () => {
      try {
        await refreshOperations();
      } catch (error) {
        console.error("Failed to refresh operations.", error);
      }
    };

    void runRefreshSafely();

    const stopPolling = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const stopReconnect = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const startPolling = () => {
      if (pollTimer !== null || disposed) {
        return;
      }

      void runRefreshSafely();
      pollTimer = window.setInterval(() => {
        if (!disposed) {
          void runRefreshSafely();
        }
      }, 3_000);
    };

    const scheduleReconnect = () => {
      if (reconnectTimer !== null || disposed) {
        return;
      }

      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectStream();
      }, 3_000);
    };

    const activateStream = () => {
      stopPolling();
      stopReconnect();
    };

    const handleStreamFailure = (source: EventSource | null) => {
      source?.close();
      if (eventSource === source) {
        eventSource = null;
      }
      startPolling();
      scheduleReconnect();
    };

    const connectStream = () => {
      if (disposed || eventSource) {
        return;
      }

      try {
        const source = new EventSource(resolveApiUrl("/api/operations/stream"));
        eventSource = source;

        source.onopen = () => {
          activateStream();
        };

        source.addEventListener("snapshot", (event) => {
          try {
            const payload = parseEventData<OperationListResponse>((event as MessageEvent).data);
            hydrateSnapshot(getOperationItems(payload));
            activateStream();
          } catch (error) {
            console.error("Failed to parse operation snapshot event.", error);
            handleStreamFailure(source);
          }
        });

        source.addEventListener("operation", (event) => {
          try {
            const payload = parseEventData<OperationLogEntry>((event as MessageEvent).data);
            if (isOperationLogEntryLike(payload)) {
              publishOperation(payload);
              activateStream();
              return;
            }

            throw new Error("Malformed operation payload.");
          } catch (error) {
            console.error("Failed to parse operation event.", error);
            handleStreamFailure(source);
          }
        });

        source.addEventListener("heartbeat", () => {
          activateStream();
        });

        source.onerror = () => {
          handleStreamFailure(source);
        };
      } catch {
        handleStreamFailure(eventSource);
      }
    };

    connectStream();

    return () => {
      disposed = true;
      stopPolling();
      stopReconnect();
      eventSource?.close();
      for (const timer of Array.from(timerRef.current.values())) {
        window.clearTimeout(timer);
      }
      timerRef.current.clear();
    };
  }, []);

  const startLocalOperation = useEffectEvent((input: {
    channel: OperationChannel;
    actionName: string;
    targetCount: number;
    summary?: string | null;
    status?: OperationStatus;
  }) => {
    const toastId = `local:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const now = new Date().toISOString();
    updateOwnSharedLocalToasts((current) => ({
      ...current,
      [toastId]: {
        id: toastId,
        source: "local",
        ownerId: localToastOwnerId,
        channel: input.channel,
        title: input.actionName,
        targetCount: input.targetCount,
        status: input.status ?? "running",
        summary: input.summary ?? null,
        errorMessage: null,
        startedAt: now,
        finishedAt: null,
        updatedAt: now,
      },
    }));

    if (input.status && input.status !== "queued" && input.status !== "running") {
      scheduleAutoDismiss(toastId, input.status);
    }

    return toastId;
  });

  const finishLocalOperation = useEffectEvent((
    toastId: string,
    input: {
      status: OperationStatus;
      summary?: string | null;
      errorMessage?: string | null;
    },
  ) => {
    updateOwnSharedLocalToasts((current) => {
      const target = current[toastId];
      if (!target) {
        return current;
      }

      const finishedAt = new Date().toISOString();
      return {
        ...current,
        [toastId]: {
          ...target,
          status: input.status,
          summary: input.summary ?? target.summary,
          errorMessage: input.errorMessage ?? null,
          finishedAt,
          updatedAt: finishedAt,
        },
      };
    });

    scheduleAutoDismiss(toastId, input.status);
  });

  const removeLocalOperation = useEffectEvent((toastId: string) => {
    dismissToast(toastId);
  });

  const localToasts = useMemo(
    () => flattenSharedLocalToasts(sharedLocalToastStore),
    [sharedLocalToastStore],
  );

  useEffect(() => {
    const ownBucket = sharedLocalToastStore[localToastOwnerId];
    const hasActiveOwnLocalToasts = Object.values(ownBucket?.toasts ?? {}).some(
      (toast) => toast.status === "queued" || toast.status === "running",
    );

    if (!hasActiveOwnLocalToasts) {
      return;
    }

    const timer = window.setInterval(() => {
      touchOwnSharedLocalToasts();
    }, 5_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [localToastOwnerId, sharedLocalToastStore]);

  const retryOperation = useEffectEvent(async (operationId: string) => {
    const response = await apiRequestJson<OperationExecutionResponse<unknown>>(
      "POST",
      `/api/operations/${operationId}/retry`,
      {},
    );

    if (!response || typeof response !== "object" || !isOperationLogEntryLike(response.operation)) {
      throw new Error("Retry response is missing a valid operation payload.");
    }

    publishOperation(response.operation);
  });

  const cancelOperation = useEffectEvent(async (operationId: string) => {
    const response = await apiRequestJson<OperationExecutionResponse<unknown>>(
      "POST",
      `/api/operations/${operationId}/cancel`,
      {},
    );

    if (!response || typeof response !== "object" || !isOperationLogEntryLike(response.operation)) {
      throw new Error("Cancel response is missing a valid operation payload.");
    }

    publishOperation(response.operation);
  });

  const toasts = useMemo(() => {
    const mappedLocal = Object.values(localToasts).map<OperationToast>((toast) => ({
      toastId: toast.id,
      source: "local",
      operationId: null,
      channel: toast.channel,
      title: toast.title,
      menuKey: null,
      actionKey: null,
      mode: null,
      targetCount: toast.targetCount,
      status: toast.status,
      summary: toast.summary,
      errorMessage: toast.errorMessage,
      startedAt: toast.startedAt,
      finishedAt: toast.finishedAt,
    }));

    return [...Object.values(serverToasts), ...mappedLocal].sort((left, right) => {
      const leftPriority = left.status === "running" || left.status === "queued" ? 0 : 1;
      const rightPriority = right.status === "running" || right.status === "queued" ? 0 : 1;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return right.startedAt.localeCompare(left.startedAt);
    });
  }, [localToasts, serverToasts]);

  const value = useMemo<OperationContextValue>(
    () => ({
      operations,
      toasts,
      refreshOperations: async () => refreshOperations(),
      publishOperation,
      dismissToast,
      startLocalOperation,
      finishLocalOperation,
      removeLocalOperation,
      retryOperation,
      cancelOperation,
    }),
    [
      cancelOperation,
      dismissToast,
      finishLocalOperation,
      operations,
      publishOperation,
      refreshOperations,
      removeLocalOperation,
      retryOperation,
      startLocalOperation,
      toasts,
    ],
  );

  return <OperationContext.Provider value={value}>{props.children}</OperationContext.Provider>;
}

export function useOperations() {
  const context = useContext(OperationContext);
  if (!context) {
    throw new Error("useOperations must be used inside OperationProvider.");
  }

  return context;
}
