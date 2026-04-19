import type {
  CoupangStoreSummary,
  CoupangShipmentWorksheetColumnSource,
  CoupangShipmentWorksheetColumnSourceKey,
  CoupangShipmentWorksheetRawFieldCatalogItem,
  CoupangShipmentWorksheetRow,
  CoupangShipmentWorksheetViewScope,
} from "@shared/coupang";
import type {
  InvoiceStatusCardKey,
  OrderStatusCardKey,
  OutputStatusCardKey,
} from "@/lib/coupang-shipment-quick-filters";

export interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

export type FilterState = {
  selectedStoreId: string;
  createdAtFrom: string;
  createdAtTo: string;
  query: string;
  maxPerPage: number;
  scope: CoupangShipmentWorksheetViewScope;
  decisionStatus: FulfillmentDecisionFilterValue;
  invoiceStatusCard: InvoiceStatusCardKey;
  orderStatusCard: OrderStatusCardKey;
  outputStatusCard: OutputStatusCardKey;
};

export type FeedbackState =
  | {
      type: "success" | "warning" | "error";
      title: string;
      message: string;
      details: string[];
    }
  | null;

export type ShipmentActivityItem = {
  id: string;
  tone: "success" | "warning" | "error" | null;
  title: string;
  message: string;
  details: string[];
};

export type EditableColumnKey =
  | "receiverName"
  | "deliveryCompanyCode"
  | "invoiceNumber"
  | "deliveryRequest";

export type ShipmentColumnSourceKey = CoupangShipmentWorksheetColumnSourceKey;
export type ShipmentColumnSource = CoupangShipmentWorksheetColumnSource;

export type ShipmentColumnSourceOption = {
  key: string;
  source: ShipmentColumnSource;
  label: string;
  group: string;
  defaultWidth: number;
  catalogItem?: CoupangShipmentWorksheetRawFieldCatalogItem;
};

export type ShipmentColumnConfig = {
  id: string;
  source: ShipmentColumnSource;
  label: string;
};

export type ShipmentPreviewRowOption = {
  id: string;
  label: string;
  description: string;
};

export type SelectedCellState = {
  rowIdx: number;
  columnId: string;
} | null;

export type WorksheetMode = "default" | "invoice";
export type ShipmentExcelSortKey = "productName" | "date";
export type ShipmentExcelExportScope = "selected" | "notExported";

export type FulfillmentDecisionStatus =
  | "ready"
  | "invoice_waiting"
  | "hold"
  | "blocked"
  | "recheck";

export type FulfillmentDecisionReason =
  | "cancel_request"
  | "return_exchange"
  | "shipment_stop"
  | "customer_service_effect"
  | "invoice_failure"
  | "sync_failure"
  | "status_conflict"
  | "missing_data"
  | "inquiry_check"
  | "order_info_check"
  | "exception_order"
  | "invoice_required"
  | "invoice_transmitting"
  | "ready_now";

export type FulfillmentDecisionAllowedAction =
  | "prepare"
  | "invoice"
  | "invoice_input"
  | "details"
  | "cs";

export type FulfillmentDecisionPresentation = {
  status: FulfillmentDecisionStatus;
  statusLabel: string;
  reason: FulfillmentDecisionReason;
  reasonLabel: string;
  description: string;
  toneClassName: string;
  allowedActions: FulfillmentDecisionAllowedAction[];
  shouldBlockBatchActions: boolean;
};

export type FulfillmentDecisionFilterValue = "all" | FulfillmentDecisionStatus;
