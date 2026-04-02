import type {
  BulkPricePreviewQueryInput,
  BulkPricePreviewResponse,
  BulkPricePreviewSort,
  BulkPriceRuleSet,
  BulkPriceSourceConfig,
} from "@shared/coupang-bulk-price";
import type { CoupangStoreSummary } from "@shared/coupang";
import { getDefaultWorkDateRangeInput, type PreviewSortDirection } from "@/features/shared/bulk-price/page-helpers";

export interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

export type MenuState = {
  storeId: string;
  schema: string;
  table: string;
  basePriceColumn: string;
  sourceMatchColumn: string;
  soldOutColumn: string;
  workDateColumn: string;
  workDateFrom: string;
  workDateTo: string;
  coupangMatchField: "externalVendorSku" | "barcode" | "vendorItemId" | "sellerProductId";
  fixedAdjustment: number;
  feeRate: number;
  marginRate: number;
  inboundShippingCost: number;
  discountRate: number;
  roundingUnit: 1 | 10 | 100;
  roundingMode: "ceil" | "round" | "floor";
};

export type BulkPriceUiState = {
  sourcePresetOpen: boolean;
  sourceSampleOpen: boolean;
  rulePresetOpen: boolean;
  formulaOpen: boolean;
  previewMatchedOnly: boolean;
};

export type DisplayRow = BulkPricePreviewResponse["rows"][number] & {
  displayStatus: string;
  displayMessages: string[];
  displayManualOverridePrice: number | null;
  displayEffectiveTargetPrice: number | null;
  displayLastAppliedAt: string | null;
  displayIsSelectable: boolean;
};

export type CoupangPreviewSortField =
  | "product"
  | "matchedCode"
  | "price"
  | "manualOverride"
  | "status"
  | "lastApplied";

export type CoupangPreviewSortState = {
  field: CoupangPreviewSortField | null;
  direction: PreviewSortDirection;
};

export type ActivePreviewSession = {
  previewId: string;
  sourceConfig: BulkPriceSourceConfig;
  rules: BulkPriceRuleSet;
};

export const DEFAULT_WORK_DATE_RANGE = getDefaultWorkDateRangeInput();

export const DEFAULT_STATE: MenuState = {
  storeId: "",
  schema: "",
  table: "",
  basePriceColumn: "",
  sourceMatchColumn: "",
  soldOutColumn: "",
  workDateColumn: "",
  workDateFrom: DEFAULT_WORK_DATE_RANGE.workDateFrom,
  workDateTo: DEFAULT_WORK_DATE_RANGE.workDateTo,
  coupangMatchField: "externalVendorSku",
  fixedAdjustment: 0,
  feeRate: 0.1,
  marginRate: 0.05,
  inboundShippingCost: 0,
  discountRate: 0,
  roundingUnit: 10,
  roundingMode: "ceil",
};

export const DEFAULT_UI_STATE: BulkPriceUiState = {
  sourcePresetOpen: true,
  sourceSampleOpen: false,
  rulePresetOpen: true,
  formulaOpen: false,
  previewMatchedOnly: true,
};

export const DEFAULT_PREVIEW_SORT: CoupangPreviewSortState = {
  field: null,
  direction: "asc",
};

export const PREVIEW_ROWS_PER_PAGE = 100;

export function buildPreviewQueryKey(
  previewId: string,
  page: number,
  matchedOnly: boolean,
  sort: BulkPricePreviewSort,
) {
  return [
    "/api/coupang/bulk-price/preview",
    previewId,
    page,
    matchedOnly,
    sort.field,
    sort.direction,
  ] as const satisfies readonly [
    string,
    string,
    number,
    boolean,
    NonNullable<BulkPricePreviewQueryInput["sort"]>["field"],
    NonNullable<BulkPricePreviewQueryInput["sort"]>["direction"],
  ];
}
