import type {
  CoupangShipmentWorksheetRawFieldCatalogItem,
  CoupangShipmentWorksheetInvoiceStatusCard,
  CoupangShipmentWorksheetOrderStatusCard,
  CoupangShipmentWorksheetOutputStatusCard,
  CoupangShipmentWorksheetRow,
  CoupangShipmentWorksheetViewResponse,
  CoupangShipmentWorksheetViewScope,
} from "@shared/coupang";
import { matchesFulfillmentDecisionFilter } from "./fulfillment-decision";
import {
  resolveQuickCollectFocusRows,
  type QuickCollectFocusRowsResult,
  type QuickCollectFocusState,
} from "./quick-collect-focus";
import type { FulfillmentDecisionFilterValue } from "./types";

type FulfillmentActiveTab = "worksheet" | "confirmed" | "archive" | "settings";

type SelectedStoreRef = {
  id: string;
  storeName: string;
  vendorId: string;
} | null;

type ResolveQuickCollectFocusViewStateInput = {
  activeTab: FulfillmentActiveTab;
  quickCollectFocus: QuickCollectFocusState | null;
  filterSignature: string;
  rows: readonly CoupangShipmentWorksheetRow[];
  draftRows: readonly CoupangShipmentWorksheetRow[];
  decisionStatus: FulfillmentDecisionFilterValue;
  page: number;
  pageSize: number;
  baseActiveSheet: CoupangShipmentWorksheetViewResponse | null;
  selectedStore: SelectedStoreRef;
  scope: CoupangShipmentWorksheetViewScope;
};

export type QuickCollectFocusViewState = {
  isActive: boolean;
  result: QuickCollectFocusRowsResult | null;
  activeSheet: CoupangShipmentWorksheetViewResponse | null;
  effectiveDraftRows: CoupangShipmentWorksheetRow[];
  visibleRows: CoupangShipmentWorksheetRow[];
  decisionCounts: CoupangShipmentWorksheetViewResponse["decisionCounts"];
  decisionPreviewGroups: CoupangShipmentWorksheetViewResponse["decisionPreviewGroups"];
  scopeCounts: Record<CoupangShipmentWorksheetViewScope, number>;
};

const EMPTY_SCOPE_COUNTS: Record<CoupangShipmentWorksheetViewScope, number> = {
  dispatch_active: 0,
  post_dispatch: 0,
  confirmed: 0,
  claims: 0,
  all: 0,
};

const EMPTY_INVOICE_COUNTS: Record<CoupangShipmentWorksheetInvoiceStatusCard, number> = {
  all: 0,
  idle: 0,
  ready: 0,
  pending: 0,
  failed: 0,
  applied: 0,
};

const EMPTY_ORDER_COUNTS: Record<CoupangShipmentWorksheetOrderStatusCard, number> = {
  all: 0,
  ACCEPT: 0,
  INSTRUCT: 0,
  DEPARTURE: 0,
  DELIVERING: 0,
  FINAL_DELIVERY: 0,
  NONE_TRACKING: 0,
  SHIPMENT_STOP_REQUESTED: 0,
  SHIPMENT_STOP_HANDLED: 0,
  CANCEL: 0,
  RETURN: 0,
  EXCHANGE: 0,
};

const EMPTY_OUTPUT_COUNTS: Record<CoupangShipmentWorksheetOutputStatusCard, number> = {
  all: 0,
  notExported: 0,
  exported: 0,
};

const RAW_FIELD_GROUP_LABEL_BY_NAMESPACE: Record<string, string> = {
  worksheet: "워크시트",
  order: "주문",
  detail: "주문상세",
  detailItem: "주문상세 상품",
  product: "상품",
  productItem: "상품 옵션",
};

function buildQuickCollectRawFieldCatalog(
  rows: readonly CoupangShipmentWorksheetRow[],
): CoupangShipmentWorksheetRawFieldCatalogItem[] {
  const catalog = new Map<string, CoupangShipmentWorksheetRawFieldCatalogItem>();

  for (const row of rows) {
    for (const [key, value] of Object.entries(row.rawFields ?? {})) {
      if (catalog.has(key)) {
        continue;
      }

      catalog.set(key, {
        key,
        label: key,
        group: key.includes(".")
          ? RAW_FIELD_GROUP_LABEL_BY_NAMESPACE[key.split(".")[0] ?? ""] ?? "raw"
          : "raw",
        sampleValueType:
          typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string",
      });
    }
  }

  return Array.from(catalog.values());
}

function resolveFallbackActiveSheet(input: {
  result: QuickCollectFocusRowsResult;
  selectedStore: SelectedStoreRef;
  scope: CoupangShipmentWorksheetViewScope;
  pageSize: number;
}): CoupangShipmentWorksheetViewResponse {
  return {
    store: {
      id: input.selectedStore?.id ?? "",
      name: input.selectedStore?.storeName ?? "",
      vendorId: input.selectedStore?.vendorId ?? "",
    },
    items: input.result.focusedRows,
    fetchedAt: new Date().toISOString(),
    collectedAt: null,
    message: null,
    source: "live",
    syncSummary: null,
    coverageCreatedAtFrom: null,
    coverageCreatedAtTo: null,
    isAuthoritativeMirror: false,
    lastFullSyncedAt: null,
    scope: input.scope,
    page: input.result.page,
    pageSize: input.pageSize,
    totalPages: input.result.totalPages,
    totalRowCount: input.result.focusedRows.length,
    scopeRowCount: input.result.focusedRows.length,
    filteredRowCount: input.result.focusedRows.length,
    invoiceReadyCount: input.result.invoiceReadyCount,
    decisionCounts: input.result.decisionCounts,
    decisionPreviewGroups: input.result.decisionPreviewGroups,
    priorityCounts: input.result.priorityCounts,
    pipelineCounts: input.result.pipelineCounts,
    issueCounts: input.result.issueCounts,
    directDeliveryCount: input.result.directDeliveryCount,
    staleSyncCount: input.result.staleSyncCount,
    rawFieldCatalog: buildQuickCollectRawFieldCatalog(input.result.focusedRows),
    scopeCounts: { ...EMPTY_SCOPE_COUNTS },
    invoiceCounts: { ...EMPTY_INVOICE_COUNTS },
    orderCounts: { ...EMPTY_ORDER_COUNTS },
    outputCounts: { ...EMPTY_OUTPUT_COUNTS },
  };
}

export function resolveQuickCollectFocusViewState(
  input: ResolveQuickCollectFocusViewStateInput,
): QuickCollectFocusViewState {
  const isActive =
    input.activeTab === "worksheet" &&
    input.quickCollectFocus?.active === true &&
    input.quickCollectFocus.filterSignature === input.filterSignature;

  if (!isActive || !input.quickCollectFocus) {
    return {
      isActive: false,
      result: null,
      activeSheet: input.baseActiveSheet,
      effectiveDraftRows: [...input.draftRows],
      visibleRows: input.draftRows.filter((row) =>
        matchesFulfillmentDecisionFilter(row, input.decisionStatus),
      ),
      decisionCounts: input.baseActiveSheet?.decisionCounts ?? {
        all: 0,
        ready: 0,
        invoice_waiting: 0,
        hold: 0,
        blocked: 0,
        recheck: 0,
      },
      decisionPreviewGroups: input.baseActiveSheet?.decisionPreviewGroups ?? {
        ready: {
          status: "ready",
          statusLabel: "즉시 출고",
          count: 0,
          topReasonLabels: [],
          previewItems: [],
          nextHandoffLinks: [],
        },
        invoice_waiting: {
          status: "invoice_waiting",
          statusLabel: "송장 입력",
          count: 0,
          topReasonLabels: [],
          previewItems: [],
          nextHandoffLinks: [],
        },
        hold: {
          status: "hold",
          statusLabel: "보류",
          count: 0,
          topReasonLabels: [],
          previewItems: [],
          nextHandoffLinks: [],
        },
        blocked: {
          status: "blocked",
          statusLabel: "차단",
          count: 0,
          topReasonLabels: [],
          previewItems: [],
          nextHandoffLinks: [],
        },
        recheck: {
          status: "recheck",
          statusLabel: "재확인",
          count: 0,
          topReasonLabels: [],
          previewItems: [],
          nextHandoffLinks: [],
        },
      },
      scopeCounts: input.baseActiveSheet?.scopeCounts ?? { ...EMPTY_SCOPE_COUNTS },
    };
  }

  const result = resolveQuickCollectFocusRows({
    rows: input.rows,
    sourceKeys: input.quickCollectFocus.sourceKeys,
    decisionStatus: input.decisionStatus,
    page: input.page,
    pageSize: input.pageSize,
  });
  const activeSheet = input.baseActiveSheet
    ? {
        ...input.baseActiveSheet,
        items: result.focusedRows,
        page: result.page,
        pageSize: input.pageSize,
        totalPages: result.totalPages,
        totalRowCount: result.focusedRows.length,
        scopeRowCount: result.focusedRows.length,
        filteredRowCount: result.focusedRows.length,
        invoiceReadyCount: result.invoiceReadyCount,
        decisionCounts: result.decisionCounts,
        decisionPreviewGroups: result.decisionPreviewGroups,
        priorityCounts: result.priorityCounts,
        pipelineCounts: result.pipelineCounts,
        issueCounts: result.issueCounts,
        directDeliveryCount: result.directDeliveryCount,
        staleSyncCount: result.staleSyncCount,
        invoiceCounts: result.invoiceCounts,
        orderCounts: result.orderCounts,
        outputCounts: result.outputCounts,
      }
    : resolveFallbackActiveSheet({
        result,
        selectedStore: input.selectedStore,
        scope: input.scope,
        pageSize: input.pageSize,
      });

  return {
    isActive: true,
    result,
    activeSheet,
    effectiveDraftRows: result.pageRows,
    visibleRows: result.visibleRows,
    decisionCounts: result.decisionCounts,
    decisionPreviewGroups: result.decisionPreviewGroups,
    scopeCounts: input.baseActiveSheet?.scopeCounts ?? { ...EMPTY_SCOPE_COUNTS },
  };
}
