import type {
  CoupangShipmentIssueFilter,
  CoupangShipmentWorksheetDatasetMode,
  CoupangShipmentWorksheetPipelineCardFilter,
  CoupangShipmentWorksheetPriorityCardFilter,
  CoupangStoreSummary,
  CoupangShipmentWorksheetColumnSource,
  CoupangShipmentWorksheetColumnSourceKey,
  CoupangShipmentWorksheetRawFieldCatalogItem,
  CoupangShipmentWorksheetRow,
  CoupangShipmentWorksheetViewScope,
} from "@shared/coupang";
import type {
  CoupangFulfillmentDecisionAllowedAction,
  CoupangFulfillmentDecisionFilterValue,
  CoupangFulfillmentDecisionPresentation,
  CoupangFulfillmentDecisionReason,
  CoupangFulfillmentDecisionStatus,
} from "@shared/coupang-fulfillment";
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
  datasetMode: CoupangShipmentWorksheetDatasetMode;
  scope: CoupangShipmentWorksheetViewScope;
  decisionStatus: FulfillmentDecisionFilterValue;
  priorityCard: CoupangShipmentWorksheetPriorityCardFilter;
  pipelineCard: CoupangShipmentWorksheetPipelineCardFilter;
  issueFilter: CoupangShipmentIssueFilter;
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

export type FulfillmentDecisionStatus = CoupangFulfillmentDecisionStatus;
export type FulfillmentDecisionReason = CoupangFulfillmentDecisionReason;
export type FulfillmentDecisionAllowedAction = CoupangFulfillmentDecisionAllowedAction;
export type FulfillmentDecisionPresentation = CoupangFulfillmentDecisionPresentation;
export type FulfillmentDecisionFilterValue = CoupangFulfillmentDecisionFilterValue;
