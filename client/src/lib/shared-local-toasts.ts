import type { OperationChannel, OperationStatus } from "@shared/operations";

export const SHARED_LOCAL_TOAST_STORAGE_KEY = "kikit:task-status-panel:shared-local-toasts:v1";
export const SHARED_LOCAL_TOAST_SYNC_CHANNEL = "kikit:task-status-panel:sync:v1";

const SUCCESS_VISIBILITY_MS = 4_000;
const WARNING_VISIBILITY_MS = 15_000;
const OWNER_STALE_MS = 20_000;

export type SharedLocalToast = {
  id: string;
  source: "local";
  channel: OperationChannel;
  title: string;
  targetCount: number;
  status: OperationStatus;
  summary: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  ownerId: string;
  updatedAt: string;
};

export type SharedLocalToastBucket = {
  ownerId: string;
  lastSeenAt: string;
  toasts: Record<string, SharedLocalToast>;
};

export type SharedLocalToastStore = Record<string, SharedLocalToastBucket>;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseTime(value: string | null | undefined) {
  if (!value) {
    return Number.NaN;
  }

  return new Date(value).getTime();
}

function getLocalToastVisibilityMs(status: OperationStatus) {
  if (status === "success") {
    return SUCCESS_VISIBILITY_MS;
  }

  if (status === "warning" || status === "error") {
    return WARNING_VISIBILITY_MS;
  }

  return 0;
}

function normalizeSharedLocalToast(
  value: unknown,
  fallbackId: string,
  ownerId: string,
): SharedLocalToast | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (value.source !== "local") {
    return null;
  }

  if (
    typeof value.channel !== "string" ||
    typeof value.title !== "string" ||
    typeof value.targetCount !== "number" ||
    typeof value.status !== "string" ||
    typeof value.startedAt !== "string"
  ) {
    return null;
  }

  return {
    id: typeof value.id === "string" ? value.id : fallbackId,
    source: "local",
    channel: value.channel as OperationChannel,
    title: value.title,
    targetCount: value.targetCount,
    status: value.status as OperationStatus,
    summary: typeof value.summary === "string" ? value.summary : null,
    errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : null,
    startedAt: value.startedAt,
    finishedAt: typeof value.finishedAt === "string" ? value.finishedAt : null,
    ownerId,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : value.startedAt,
  };
}

function normalizeSharedLocalToastBucket(
  value: unknown,
  fallbackOwnerId: string,
): SharedLocalToastBucket | null {
  if (!isObjectRecord(value) || !isObjectRecord(value.toasts)) {
    return null;
  }

  const ownerId = typeof value.ownerId === "string" ? value.ownerId : fallbackOwnerId;
  const normalizedToasts = Object.fromEntries(
    Object.entries(value.toasts)
      .map(([toastId, toast]) => [toastId, normalizeSharedLocalToast(toast, toastId, ownerId)])
      .filter((entry): entry is [string, SharedLocalToast] => Boolean(entry[1])),
  );

  return {
    ownerId,
    lastSeenAt:
      typeof value.lastSeenAt === "string" ? value.lastSeenAt : new Date(0).toISOString(),
    toasts: normalizedToasts,
  };
}

export function parseSharedLocalToastStore(
  value: string | null | undefined,
  now = Date.now(),
): SharedLocalToastStore {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isObjectRecord(parsed)) {
      return {};
    }

    const store = Object.fromEntries(
      Object.entries(parsed)
        .map(([ownerId, bucket]) => [ownerId, normalizeSharedLocalToastBucket(bucket, ownerId)])
        .filter((entry): entry is [string, SharedLocalToastBucket] => Boolean(entry[1])),
    );

    return pruneSharedLocalToastStore(store, now);
  } catch {
    return {};
  }
}

export function pruneSharedLocalToastStore(
  store: SharedLocalToastStore,
  now = Date.now(),
): SharedLocalToastStore {
  const nextStore: SharedLocalToastStore = {};

  for (const [ownerId, bucket] of Object.entries(store)) {
    const lastSeenAt = parseTime(bucket.lastSeenAt);
    const ownerIsStale = Number.isFinite(lastSeenAt) ? now - lastSeenAt > OWNER_STALE_MS : true;
    const keptToasts = Object.fromEntries(
      Object.entries(bucket.toasts).filter(([, toast]) => {
        if (toast.status === "queued" || toast.status === "running") {
          return !ownerIsStale;
        }

        const visibilityMs = getLocalToastVisibilityMs(toast.status);
        if (!visibilityMs) {
          return false;
        }

        const finishedAt = parseTime(toast.finishedAt ?? toast.updatedAt ?? toast.startedAt);
        if (!Number.isFinite(finishedAt)) {
          return false;
        }

        return now - finishedAt <= visibilityMs;
      }),
    );

    if (!Object.keys(keptToasts).length) {
      continue;
    }

    nextStore[ownerId] = {
      ownerId,
      lastSeenAt: bucket.lastSeenAt,
      toasts: keptToasts,
    };
  }

  return nextStore;
}

export function flattenSharedLocalToasts(store: SharedLocalToastStore) {
  return Object.values(store).reduce<Record<string, SharedLocalToast>>((accumulator, bucket) => {
    for (const [toastId, toast] of Object.entries(bucket.toasts)) {
      accumulator[toastId] = toast;
    }
    return accumulator;
  }, {});
}

export function updateSharedLocalToastOwner(
  store: SharedLocalToastStore,
  ownerId: string,
  toasts: Record<string, SharedLocalToast>,
  now = Date.now(),
): SharedLocalToastStore {
  const nextStore: SharedLocalToastStore = {
    ...store,
  };

  if (!Object.keys(toasts).length) {
    delete nextStore[ownerId];
    return pruneSharedLocalToastStore(nextStore, now);
  }

  nextStore[ownerId] = {
    ownerId,
    lastSeenAt: new Date(now).toISOString(),
    toasts,
  };

  return pruneSharedLocalToastStore(nextStore, now);
}

export function touchSharedLocalToastOwner(
  store: SharedLocalToastStore,
  ownerId: string,
  now = Date.now(),
): SharedLocalToastStore {
  const bucket = store[ownerId];
  if (!bucket || !Object.keys(bucket.toasts).length) {
    return pruneSharedLocalToastStore(store, now);
  }

  return pruneSharedLocalToastStore(
    {
      ...store,
      [ownerId]: {
        ...bucket,
        lastSeenAt: new Date(now).toISOString(),
      },
    },
    now,
  );
}

export function removeSharedLocalToast(
  store: SharedLocalToastStore,
  toastId: string,
  now = Date.now(),
): SharedLocalToastStore {
  let changed = false;
  const nextStore: SharedLocalToastStore = {};

  for (const [ownerId, bucket] of Object.entries(store)) {
    if (!bucket.toasts[toastId]) {
      nextStore[ownerId] = bucket;
      continue;
    }

    changed = true;
    const nextToasts = { ...bucket.toasts };
    delete nextToasts[toastId];

    if (!Object.keys(nextToasts).length) {
      continue;
    }

    nextStore[ownerId] = {
      ...bucket,
      toasts: nextToasts,
    };
  }

  return pruneSharedLocalToastStore(changed ? nextStore : store, now);
}
