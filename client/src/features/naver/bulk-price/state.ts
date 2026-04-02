import type { ChannelStoreSummary } from "@shared/channel-settings";
import type {
  NaverBulkPriceMatchField,
  NaverBulkPricePreviewQueryInput,
  NaverBulkPricePreviewRow,
  NaverBulkPricePreviewSort,
  NaverBulkPricePreviewSortField,
  NaverBulkPriceRuleSet,
  NaverBulkPriceSourceConfig,
} from "@shared/naver-bulk-price";
import { getDefaultWorkDateRangeInput, type PreviewSortDirection } from "@/features/shared/bulk-price/page-helpers";

export interface SettingsStoresResponse {
  items: ChannelStoreSummary[];
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
  naverMatchField: NaverBulkPriceMatchField;
  fixedAdjustment: number;
  feeRate: number;
  marginRate: number;
  inboundShippingCost: number;
  discountRate: number;
  roundingUnit: 1 | 10 | 100;
  roundingMode: "ceil" | "round" | "floor";
};

export type UiState = {
  sourcePresetOpen: boolean;
  sourceSampleOpen: boolean;
  rulePresetOpen: boolean;
  formulaOpen: boolean;
  previewMatchedOnly: boolean;
};

export type DisplayRow = NaverBulkPricePreviewRow & {
  displayStatus: string;
  displayMessages: string[];
  displayEffectiveTargetPrice: number | null;
  displayLastAppliedAt: string | null;
  displayLastAppliedPrice: number | null;
};

export type NaverPreviewSortField = NaverBulkPricePreviewSortField;

export type NaverPreviewSortState = {
  field: NaverPreviewSortField | null;
  direction: PreviewSortDirection;
};

export type ActivePreviewSession = {
  previewId: string;
  sourceConfig: NaverBulkPriceSourceConfig;
  rules: NaverBulkPriceRuleSet;
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
  naverMatchField: "sellerManagementCode",
  fixedAdjustment: 0,
  feeRate: 0.1,
  marginRate: 0.05,
  inboundShippingCost: 0,
  discountRate: 0,
  roundingUnit: 10,
  roundingMode: "ceil",
};

export const DEFAULT_UI_STATE: UiState = {
  sourcePresetOpen: true,
  sourceSampleOpen: false,
  rulePresetOpen: true,
  formulaOpen: true,
  previewMatchedOnly: true,
};

export const DEFAULT_PREVIEW_SORT: NaverPreviewSortState = {
  field: null,
  direction: "asc",
};

export const PREVIEW_ROWS_PER_PAGE = 100;

export function buildPreviewQueryKey(
  previewId: string,
  page: number,
  matchedOnly: boolean,
  sort: NaverBulkPricePreviewSort,
) {
  return [
    "/api/naver/bulk-price/preview",
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
    NonNullable<NaverBulkPricePreviewQueryInput["sort"]>["field"],
    NonNullable<NaverBulkPricePreviewQueryInput["sort"]>["direction"],
  ];
}
