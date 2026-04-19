import {
  isLogChannel,
  isOperationStatus,
  type LogChannel,
  type LogLevel,
} from "@shared/logs";
import type { OperationLogRecord } from "@shared/logs";
import type { CoupangShipmentWorksheetViewScope } from "@shared/coupang";
import type { OperationStatus } from "@shared/operations";
import type { FulfillmentDecisionFilterValue } from "@/features/coupang/shipments/types";

export type FulfillmentWorkspaceTab = "worksheet" | "confirmed" | "archive" | "settings";
export type WorkCenterTab = "operations" | "events";
export type CsHubFocus = "fulfillment-impact" | "claims" | "inquiries" | "recovery";
export type CsHubSource = "dashboard" | "fulfillment" | "work-center";

const fulfillmentTabs: readonly FulfillmentWorkspaceTab[] = [
  "worksheet",
  "confirmed",
  "archive",
  "settings",
];
const fulfillmentScopes: readonly CoupangShipmentWorksheetViewScope[] = [
  "dispatch_active",
  "post_dispatch",
  "confirmed",
  "claims",
  "all",
];
const fulfillmentDecisionValues: readonly FulfillmentDecisionFilterValue[] = [
  "all",
  "ready",
  "invoice_waiting",
  "hold",
  "blocked",
  "recheck",
];
const workCenterTabs: readonly WorkCenterTab[] = ["operations", "events"];
const logLevels: readonly ("all" | LogLevel)[] = ["all", "info", "warning", "error"];
const csHubFocusValues: readonly CsHubFocus[] = [
  "fulfillment-impact",
  "claims",
  "inquiries",
  "recovery",
];
const csHubSourceValues: readonly CsHubSource[] = [
  "dashboard",
  "fulfillment",
  "work-center",
];
const operationReferenceKeys = [
  "sourceKey",
  "selpickOrderNumber",
  "productOrderNumber",
  "shipmentBoxId",
  "orderId",
  "receiptId",
  "invoiceNumber",
] as const;

function normalizeSearch(search: string) {
  return search.startsWith("?") ? search.slice(1) : search;
}

function finalizePath(pathname: string, params: URLSearchParams) {
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

function isFulfillmentWorkspaceTab(value: string | null): value is FulfillmentWorkspaceTab {
  return Boolean(value) && fulfillmentTabs.includes(value as FulfillmentWorkspaceTab);
}

function isFulfillmentScope(value: string | null): value is CoupangShipmentWorksheetViewScope {
  return Boolean(value) && fulfillmentScopes.includes(value as CoupangShipmentWorksheetViewScope);
}

function isFulfillmentDecisionValue(value: string | null): value is FulfillmentDecisionFilterValue {
  return Boolean(value) && fulfillmentDecisionValues.includes(value as FulfillmentDecisionFilterValue);
}

function isWorkCenterTab(value: string | null): value is WorkCenterTab {
  return Boolean(value) && workCenterTabs.includes(value as WorkCenterTab);
}

function isLogLevelValue(value: string | null): value is "all" | LogLevel {
  return Boolean(value) && logLevels.includes(value as "all" | LogLevel);
}

function isCsHubFocus(value: string | null): value is CsHubFocus {
  return Boolean(value) && csHubFocusValues.includes(value as CsHubFocus);
}

function isCsHubSource(value: string | null): value is CsHubSource {
  return Boolean(value) && csHubSourceValues.includes(value as CsHubSource);
}

type FulfillmentWorkspaceHrefInput = {
  tab?: FulfillmentWorkspaceTab;
  storeId?: string | null;
  scope?: CoupangShipmentWorksheetViewScope;
  decisionStatus?: FulfillmentDecisionFilterValue;
  query?: string | null;
};

export function buildFulfillmentWorkspaceHref(input: FulfillmentWorkspaceHrefInput = {}) {
  const params = new URLSearchParams();

  if (input.tab && input.tab !== "worksheet") {
    params.set("tab", input.tab);
  }
  if (input.storeId) {
    params.set("storeId", input.storeId);
  }
  if (input.scope && input.tab !== "confirmed" && input.scope !== "dispatch_active") {
    params.set("scope", input.scope);
  }
  if (input.decisionStatus && input.decisionStatus !== "all") {
    params.set("decisionStatus", input.decisionStatus);
  }
  if (input.query?.trim()) {
    params.set("query", input.query.trim());
  }

  return finalizePath("/fulfillment", params);
}

export function parseFulfillmentWorkspaceSearch(search: string): {
  activeTab: FulfillmentWorkspaceTab | null;
  filterPatch: {
    selectedStoreId?: string;
    scope?: CoupangShipmentWorksheetViewScope;
    decisionStatus?: FulfillmentDecisionFilterValue;
    query?: string;
  };
} {
  const params = new URLSearchParams(normalizeSearch(search));
  const tab = params.get("tab");
  const scope = params.get("scope");
  const decisionStatus = params.get("decisionStatus");
  const filterPatch: {
    selectedStoreId?: string;
    scope?: CoupangShipmentWorksheetViewScope;
    decisionStatus?: FulfillmentDecisionFilterValue;
    query?: string;
  } = {};

  const storeId = params.get("storeId");
  if (storeId) {
    filterPatch.selectedStoreId = storeId;
  }
  if (isFulfillmentScope(scope)) {
    filterPatch.scope = scope;
  }
  if (isFulfillmentDecisionValue(decisionStatus)) {
    filterPatch.decisionStatus = decisionStatus;
  }
  if (params.has("query")) {
    filterPatch.query = params.get("query") ?? "";
  }

  return {
    activeTab: isFulfillmentWorkspaceTab(tab) ? tab : null,
    filterPatch,
  };
}

type WorkCenterWorkspaceHrefInput = {
  tab?: WorkCenterTab;
  channel?: "all" | LogChannel;
  status?: "all" | OperationStatus;
  level?: "all" | LogLevel;
  query?: string | null;
  slowOnly?: boolean;
  logId?: string | null;
};

export function buildWorkCenterWorkspaceHref(input: WorkCenterWorkspaceHrefInput = {}) {
  const params = new URLSearchParams();

  if (input.tab && input.tab !== "operations") {
    params.set("tab", input.tab);
  }
  if (input.channel && input.channel !== "all") {
    params.set("channel", input.channel);
  }
  if (input.status && input.status !== "all" && isOperationStatus(input.status)) {
    params.set("status", input.status);
  }
  if (input.level && input.level !== "all") {
    params.set("level", input.level);
  }
  if (input.query?.trim()) {
    params.set("q", input.query.trim());
  }
  if (input.slowOnly) {
    params.set("slowOnly", "true");
  }
  if (input.logId) {
    params.set("logId", input.logId);
  }

  return finalizePath("/work-center", params);
}

export function parseWorkCenterWorkspaceSearch(search: string): {
  tab: WorkCenterTab | null;
  channel: "all" | LogChannel | null;
  status: "all" | OperationStatus | null;
  level: "all" | LogLevel | null;
  query: string | null;
  slowOnly: boolean | null;
  logId: string | null;
} {
  const params = new URLSearchParams(normalizeSearch(search));
  const tab = params.get("tab");
  const channel = params.get("channel");
  const status = params.get("status");
  const level = params.get("level");
  const parsedChannel: "all" | LogChannel | null =
    channel === "all" ? "all" : channel && isLogChannel(channel) ? channel : null;
  const parsedStatus: "all" | OperationStatus | null =
    status === "all" ? "all" : status && isOperationStatus(status) ? status : null;
  const parsedLevel: "all" | LogLevel | null =
    level === "all" ? "all" : isLogLevelValue(level) ? level : null;
  const parsed = {
    tab: isWorkCenterTab(tab) ? tab : null,
    channel: parsedChannel,
    status: parsedStatus,
    level: parsedLevel,
    query: params.has("q") ? params.get("q") ?? "" : params.has("query") ? params.get("query") ?? "" : null,
    slowOnly: params.get("slowOnly") === "true" ? true : null,
    logId: params.get("logId") ?? params.get("operationId"),
  };

  return parsed;
}

type CsHubWorkspaceHrefInput = {
  focus?: CsHubFocus;
  source?: CsHubSource;
};

export function buildCsHubWorkspaceHref(input: CsHubWorkspaceHrefInput = {}) {
  const params = new URLSearchParams();

  if (input.focus) {
    params.set("focus", input.focus);
  }
  if (input.source) {
    params.set("source", input.source);
  }

  return finalizePath("/cs", params);
}

export function parseCsHubWorkspaceSearch(search: string): {
  focus: CsHubFocus | null;
  source: CsHubSource | null;
} {
  const params = new URLSearchParams(normalizeSearch(search));
  const focus = params.get("focus");
  const source = params.get("source");

  return {
    focus: isCsHubFocus(focus) ? focus : null,
    source: isCsHubSource(source) ? source : null,
  };
}

function readFirstMatchingString(
  value: unknown,
  candidateKeys: readonly string[],
  depth = 0,
): string | null {
  if (depth > 2 || value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = readFirstMatchingString(item, candidateKeys, depth + 1);
      if (result) {
        return result;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of candidateKeys) {
      const field = record[key];
      if (typeof field === "string" && field.trim()) {
        return field.trim();
      }
    }
    for (const nested of Object.values(record)) {
      const result = readFirstMatchingString(nested, candidateKeys, depth + 1);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

export function extractOperationHandoffContext(entry: OperationLogRecord) {
  const source = entry.operation.normalizedPayload ?? entry.operation.requestPayload;
  const fallback = entry.operation.requestPayload ?? entry.operation.normalizedPayload;

  return {
    storeId: readFirstMatchingString(source, ["storeId"]) ?? readFirstMatchingString(fallback, ["storeId"]),
    query:
      readFirstMatchingString(source, operationReferenceKeys) ??
      readFirstMatchingString(fallback, operationReferenceKeys),
  };
}
