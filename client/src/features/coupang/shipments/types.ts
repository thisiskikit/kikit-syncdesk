import type { CoupangStoreSummary, CoupangShipmentWorksheetRow } from "@shared/coupang";
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
  status: string;
  createdAtFrom: string;
  createdAtTo: string;
  query: string;
  maxPerPage: number;
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

export type ShipmentColumnSourceKey =
  | "blank"
  | "orderDateText"
  | "quantity"
  | "productName"
  | "optionName"
  | "productOrderNumber"
  | "collectedPlatform"
  | "ordererName"
  | "contact"
  | "receiverName"
  | "collectedAccountName"
  | "deliveryCompanyCode"
  | "selpickOrderNumber"
  | "invoiceNumber"
  | "salePrice"
  | "shippingFee"
  | "receiverAddress"
  | "deliveryRequest"
  | "buyerPhoneNumber"
  | "productNumber"
  | "exposedProductName"
  | "productOptionNumber"
  | "sellerProductCode";

export type ShipmentColumnConfig = {
  id: string;
  sourceKey: ShipmentColumnSourceKey;
  label: string;
};

export type SelectedCellState = {
  rowIdx: number;
  columnId: string;
} | null;

export type WorksheetMode = "default" | "invoice";
export type ShipmentExcelSortKey = "productName" | "date";
export type ShipmentExcelExportScope = "selected" | "notExported";
