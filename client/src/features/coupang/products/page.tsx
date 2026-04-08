import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import type {
  CoupangBatchActionResponse,
  CoupangProductDetail,
  CoupangProductDetailResponse,
  CoupangProductExplorerExposureCard,
  CoupangProductExplorerFilters,
  CoupangProductExplorerOperationCard,
  CoupangProductExplorerResponse,
  CoupangProductExplorerRow,
  CoupangProductPriceUpdateTarget,
  CoupangProductQuantityUpdateTarget,
  CoupangProductSaleStatusUpdateTarget,
  CoupangProductSearchField,
  CoupangProductExplorerSortField,
  CoupangSortDirection,
  CoupangStoreSummary,
} from "@shared/coupang";
import { COUPANG_PRODUCT_EXPLORER_PAGE_SIZE_OPTIONS } from "@shared/coupang";
import { ApiFreshnessCard } from "@/components/api-freshness-card";
import { CoupangProductPreview } from "@/components/coupang-product-preview";
import { OperationPageSettings } from "@/components/operation-page-settings";
import { ProductLibraryDrawer } from "@/components/product-library-drawer";
import { StatusBadge } from "@/components/status-badge";
import {
  buildCoupangExposureBadges,
  buildCoupangOperationSummary,
  PRODUCT_EXPOSURE_FILTER_CARDS,
  PRODUCT_OPERATION_FILTER_CARDS,
} from "@/lib/coupang-product-operations";
import { useOperations } from "@/components/operation-provider";
import { getCoupangStatusClassName } from "@/lib/coupang-status";
import { getResponseCacheState, isStaleCachedResponse } from "@/lib/freshness";
import {
  apiRequestJson,
  getJson,
  getJsonWithRefresh,
  queryCachePresets,
  queryClient,
  queryPresets,
  refreshQueryData,
} from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate, formatNumber } from "@/lib/utils";
import {
  buildExplorerOptionCountLabel,
  buildOptionIdText,
  buildPageTokens,
  buildParentProductLabel,
  buildProductIdText,
  buildProductKindLabel,
  buildProductOptionCountText,
  buildProductOptionHint,
  buildQuickActionState,
  buildQuickOptions,
  buildVendorItemValueSummary,
  ExpandableTableText,
  formatDeliveryCharge,
  formatSalePriceRange,
  QuickActionDialog,
  SalePeriodCell,
} from "./product-presenters";

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

type StoredFilters = CoupangProductExplorerFilters & {
  optionIndividualView?: boolean;
  visibleColumnKeys?: ExplorerColumnKey[];
} & Record<string, unknown>;
type ExplorerControls = {
  selectedStoreId: string;
  searchField: CoupangProductSearchField;
  searchQuery: string;
  status: string;
  createdAtFrom: string;
  salePeriodFrom: string;
  salePeriodTo: string;
  sortField: CoupangProductExplorerSortField;
  sortDirection: CoupangSortDirection;
  pageSize: number;
};
type QuickActionKind = "price" | "quantity" | "saleStatus";
type ExplorerColumnKey =
  | "thumbnail"
  | "kind"
  | "sellerProductName"
  | "displayCategoryName"
  | "externalVendorSku"
  | "ids"
  | "barcode"
  | "minSalePrice"
  | "deliveryCharge"
  | "totalInventory"
  | "statusName"
  | "salePeriod"
  | "createdAt"
  | "lastModifiedAt";
type QuickOptionRow = {
  key: string;
  vendorItemId: string | null;
  sellerProductItemId: string | null;
  itemId: string | null;
  itemName: string;
  externalVendorSku: string | null;
  barcode: string | null;
  salePrice: number | null;
  inventoryCount: number | null;
  saleStatus: string;
};
type FeedbackState =
  | {
      type: "success" | "error" | "warning";
      title: string;
      message: string;
    }
  | null;
type QuickActionState = {
  kind: QuickActionKind;
  selectedIds: string[];
  priceDrafts: Record<string, string>;
  quantityDrafts: Record<string, string>;
  nextSaleStatus: "ONSALE" | "SUSPENDED";
  deliveryChargeDraft: string;
  bulkDraft: string;
  error: string | null;
};
type CoupangDisplayRow =
  | {
      kind: "product";
      row: CoupangProductExplorerRow;
      isExpanded: boolean;
    }
  | {
      kind: "option";
      key: string;
      parent: CoupangProductExplorerRow;
      option: CoupangProductExplorerRow["vendorItems"][number];
      optionIndex: number;
    };

const DEFAULT_FILTERS: StoredFilters = {
  selectedStoreId: "",
  searchField: "all",
  searchQuery: "",
  status: "",
  exposureCard: "all",
  operationCard: "all",
  createdAtFrom: "",
  salePeriodFrom: "",
  salePeriodTo: "",
  sortField: "lastModifiedAt",
  sortDirection: "desc",
  page: 1,
  pageSize: COUPANG_PRODUCT_EXPLORER_PAGE_SIZE_OPTIONS[0],
  selectedSellerProductId: "",
  optionIndividualView: false,
  visibleColumnKeys: [
    "thumbnail",
    "kind",
    "sellerProductName",
    "displayCategoryName",
    "externalVendorSku",
    "ids",
    "barcode",
    "minSalePrice",
    "deliveryCharge",
    "totalInventory",
    "statusName",
    "salePeriod",
    "createdAt",
    "lastModifiedAt",
  ],
};

const DEFAULT_CONTROLS: ExplorerControls = {
  selectedStoreId: DEFAULT_FILTERS.selectedStoreId,
  searchField: DEFAULT_FILTERS.searchField,
  searchQuery: DEFAULT_FILTERS.searchQuery,
  status: DEFAULT_FILTERS.status,
  createdAtFrom: DEFAULT_FILTERS.createdAtFrom,
  salePeriodFrom: DEFAULT_FILTERS.salePeriodFrom,
  salePeriodTo: DEFAULT_FILTERS.salePeriodTo,
  sortField: DEFAULT_FILTERS.sortField,
  sortDirection: DEFAULT_FILTERS.sortDirection,
  pageSize: DEFAULT_FILTERS.pageSize,
};
const BACKGROUND_DETAIL_PREFETCH_LIMIT = 24;
const BACKGROUND_DETAIL_PREFETCH_CONCURRENCY = 3;
const BACKGROUND_DETAIL_PREFETCH_STALE_MS = 5 * 60_000;

const SEARCH_FIELD_OPTIONS: Array<{ value: CoupangProductSearchField; label: string }> = [
  { value: "all", label: "전체 컬럼" },
  { value: "sellerProductName", label: "상품명" },
  { value: "sellerProductId", label: "상품번호" },
  { value: "displayCategoryName", label: "카테고리" },
  { value: "brand", label: "브랜드" },
  { value: "statusName", label: "상태" },
  { value: "vendorItemName", label: "옵션명" },
  { value: "externalVendorSku", label: "판매자 SKU" },
];

const EXPLORER_COLUMN_DEFINITIONS: Array<{
  key: ExplorerColumnKey;
  label: string;
  description: string;
}> = [
  { key: "thumbnail", label: "이미지", description: "상품/옵션 썸네일" },
  { key: "kind", label: "구분", description: "상품/옵션 구분과 옵션 수" },
  { key: "sellerProductName", label: "상품명", description: "상품명과 옵션명" },
  { key: "displayCategoryName", label: "카테고리", description: "전시 카테고리와 코드" },
  { key: "externalVendorSku", label: "판매자식별코드", description: "SKU 요약값" },
  { key: "ids", label: "ID 묶음", description: "Seller Product ID / Vendor Item ID" },
  { key: "barcode", label: "바코드", description: "옵션 바코드 요약" },
  { key: "minSalePrice", label: "판매가", description: "판매가 또는 가격 범위" },
  { key: "deliveryCharge", label: "배송비", description: "무료/유료 배송비" },
  { key: "totalInventory", label: "재고", description: "옵션 합계 재고" },
  { key: "statusName", label: "상태", description: "판매 상태" },
  { key: "salePeriod", label: "판매기간", description: "시작일 / 종료일" },
  { key: "createdAt", label: "등록일", description: "상품 등록일" },
  { key: "lastModifiedAt", label: "수정일", description: "최근 수정일" },
];

function sanitizeExplorerColumnKeys(value: unknown) {
  if (!Array.isArray(value)) {
    return [...(DEFAULT_FILTERS.visibleColumnKeys ?? [])];
  }

  const allowedKeys = new Set(EXPLORER_COLUMN_DEFINITIONS.map((column) => column.key));
  const nextKeys: ExplorerColumnKey[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const key = entry as ExplorerColumnKey;
    if (!allowedKeys.has(key) || nextKeys.includes(key)) {
      continue;
    }

    nextKeys.push(key);
  }

  return nextKeys.length ? nextKeys : [...(DEFAULT_FILTERS.visibleColumnKeys ?? [])];
}

function rebuildExplorerRowAggregates(row: CoupangProductExplorerRow) {
  const salePrices = row.vendorItems
    .map((item) => item.salePrice)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const inventoryCounts = row.vendorItems
    .map((item) => item.inventoryCount)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    ...row,
    optionCount: row.vendorItems.length,
    minSalePrice: salePrices.length ? Math.min(...salePrices) : null,
    maxSalePrice: salePrices.length ? Math.max(...salePrices) : null,
    totalInventory: inventoryCounts.length
      ? inventoryCounts.reduce((sum, value) => sum + value, 0)
      : null,
  } satisfies CoupangProductExplorerRow;
}

function patchExplorerResponse(
  current: CoupangProductExplorerResponse | undefined,
  sellerProductId: string,
  updateVendorItem: (
    item: CoupangProductExplorerRow["vendorItems"][number],
  ) => CoupangProductExplorerRow["vendorItems"][number],
  input?: {
    deliveryCharge?: number | null;
  },
) {
  if (!current) {
    return current;
  }

  let changed = false;
  const items = current.items.map((row) => {
    if (row.sellerProductId !== sellerProductId) {
      return row;
    }

    const vendorItems = row.vendorItems.map((item) => {
      const nextItem = updateVendorItem(item);
      if (nextItem !== item) {
        changed = true;
      }
      return nextItem;
    });
    const nextRow = rebuildExplorerRowAggregates({
      ...row,
      vendorItems,
      deliveryCharge:
        input && "deliveryCharge" in input ? input.deliveryCharge ?? null : row.deliveryCharge,
    });

    if (nextRow.deliveryCharge !== row.deliveryCharge) {
      changed = true;
    }

    return nextRow;
  });

  if (!changed) {
    return current;
  }

  return {
    ...current,
    items,
  };
}

function patchDetailResponse(
  current: CoupangProductDetailResponse | undefined,
  updateVendorItem: (
    item: CoupangProductDetail["items"][number],
  ) => CoupangProductDetail["items"][number],
  input?: {
    deliveryCharge?: number | null;
  },
) {
  if (!current?.item) {
    return current;
  }

  let changed = false;
  const items = current.item.items.map((item) => {
    const nextItem = updateVendorItem(item);
    if (nextItem !== item) {
      changed = true;
    }
    return nextItem;
  });
  const nextDeliveryCharge =
    input && "deliveryCharge" in input
      ? input.deliveryCharge ?? null
      : current.item.deliveryInfo.deliveryCharge;

  if (nextDeliveryCharge !== current.item.deliveryInfo.deliveryCharge) {
    changed = true;
  }

  if (!changed) {
    return current;
  }

  return {
    ...current,
    item: {
      ...current.item,
      items,
      deliveryInfo: {
        ...current.item.deliveryInfo,
        deliveryCharge: nextDeliveryCharge,
      },
    },
  };
}

function hasSucceededVendorItemId(
  item: CoupangBatchActionResponse["items"][number],
): item is CoupangBatchActionResponse["items"][number] & { vendorItemId: string } {
  return item.status === "succeeded" && typeof item.vendorItemId === "string" && item.vendorItemId.length > 0;
}

function buildExplorerUrl(filters: CoupangProductExplorerFilters, refresh = false) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    searchField: filters.searchField,
    searchQuery: filters.searchQuery,
    status: filters.status,
    exposureCard: filters.exposureCard ?? "all",
    operationCard: filters.operationCard ?? "all",
    createdAtFrom: filters.createdAtFrom,
    salePeriodFrom: filters.salePeriodFrom,
    salePeriodTo: filters.salePeriodTo,
    sortField: filters.sortField,
    sortDirection: filters.sortDirection,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });

  if (refresh) {
    params.set("refresh", "1");
  }

  return `/api/coupang/products/explorer?${params.toString()}`;
}

function buildDetailUrl(storeId: string, sellerProductId: string, refresh = false) {
  const params = new URLSearchParams({ storeId, sellerProductId });

  if (refresh) {
    params.set("refresh", "1");
  }

  return `/api/coupang/products/detail?${params.toString()}`;
}

function buildDetailQueryKey(storeId: string, sellerProductId: string) {
  return ["/api/coupang/products/detail", storeId, sellerProductId] as const;
}

function parseNullableInteger(value: string) {
  const normalized = value.replaceAll(",", "").trim();

  if (!normalized) {
    return null;
  }

  if (!/^-?\d+$/.test(normalized)) {
    return Number.NaN;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export default function CoupangProductsPage() {
  const { startLocalOperation, finishLocalOperation, removeLocalOperation, publishOperation } =
    useOperations();
  const {
    state: filters,
    setState: setFilters,
    isLoaded: isFiltersLoaded,
  } = useServerMenuState<StoredFilters>("coupang.products", DEFAULT_FILTERS);
  const [controls, setControls] = useState<ExplorerControls>(DEFAULT_CONTROLS);
  const [pageFeedback, setPageFeedback] = useState<FeedbackState>(null);
  const [pageJumpDraft, setPageJumpDraft] = useState(String(DEFAULT_FILTERS.page));
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickActionState, setQuickActionState] = useState<QuickActionState | null>(null);
  const [quickActionBusy, setQuickActionBusy] = useState(false);
  const [expandedSellerProductIds, setExpandedSellerProductIds] = useState<string[]>([]);
  const [libraryTargetSellerProductId, setLibraryTargetSellerProductId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  const explorerQueryKey = [
    "/api/coupang/products/explorer",
    filters.selectedStoreId,
    filters.searchField,
    filters.searchQuery,
    filters.status,
    filters.exposureCard ?? "all",
    filters.operationCard ?? "all",
    filters.createdAtFrom,
    filters.salePeriodFrom,
    filters.salePeriodTo,
    filters.sortField,
    filters.sortDirection,
    filters.page,
    filters.pageSize,
  ] as const;

  const detailQueryKey = [
    ...buildDetailQueryKey(filters.selectedStoreId, filters.selectedSellerProductId),
  ] as const;
  const explorerQueryUrl = buildExplorerUrl(filters);
  const detailQueryUrl = buildDetailUrl(filters.selectedStoreId, filters.selectedSellerProductId);

  const storesQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
    ...queryPresets.reference,
  });

  const stores = storesQuery.data?.items ?? [];
  const selectedStore = useMemo(
    () => stores.find((store) => store.id === filters.selectedStoreId) ?? null,
    [filters.selectedStoreId, stores],
  );

  useEffect(() => {
    if (!isFiltersLoaded) {
      return;
    }

    setControls({
      selectedStoreId: filters.selectedStoreId,
      searchField: filters.searchField,
      searchQuery: filters.searchQuery,
      status: filters.status,
      createdAtFrom: filters.createdAtFrom,
      salePeriodFrom: filters.salePeriodFrom,
      salePeriodTo: filters.salePeriodTo,
      sortField: filters.sortField,
      sortDirection: filters.sortDirection,
      pageSize: filters.pageSize,
    });
  }, [
    filters.pageSize,
    filters.searchField,
    filters.searchQuery,
    filters.createdAtFrom,
    filters.selectedStoreId,
    filters.salePeriodFrom,
    filters.salePeriodTo,
    filters.sortDirection,
    filters.sortField,
    filters.status,
    isFiltersLoaded,
  ]);

  useEffect(() => {
    if (!isFiltersLoaded || filters.selectedStoreId || !stores[0]) {
      return;
    }

    const nextStoreId = stores[0].id;
    setControls((current) => ({
      ...current,
      selectedStoreId: nextStoreId,
    }));
    setFilters((current) => ({
      ...current,
      selectedStoreId: nextStoreId,
      selectedSellerProductId: "",
    }));
  }, [filters.selectedStoreId, isFiltersLoaded, setFilters, stores]);

  const explorerQuery = useQuery({
    queryKey: explorerQueryKey,
    queryFn: () => getJson<CoupangProductExplorerResponse>(explorerQueryUrl),
    enabled: Boolean(filters.selectedStoreId),
    ...queryPresets.listSnapshot,
  });
  const explorerCacheState = getResponseCacheState(explorerQuery.data);

  const refreshExplorer = () =>
    refreshQueryData({
      queryKey: explorerQueryKey,
      queryFn: () => getJsonWithRefresh<CoupangProductExplorerResponse>(explorerQueryUrl),
      gcTime: queryPresets.listSnapshot.gcTime,
    });

  const rows = explorerQuery.data?.items ?? [];
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.sellerProductId, row])), [rows]);
  const expandedSellerProductIdSet = useMemo(
    () => new Set(expandedSellerProductIds),
    [expandedSellerProductIds],
  );
  const selectedRow = filters.selectedSellerProductId
    ? rowsById.get(filters.selectedSellerProductId) ?? null
    : null;
  const libraryTargetRow = libraryTargetSellerProductId
    ? rowsById.get(libraryTargetSellerProductId) ?? null
    : null;
  const libraryReference = libraryTargetRow
    ? {
        channel: "coupang" as const,
        storeId: filters.selectedStoreId,
        channelProductId: libraryTargetRow.sellerProductId,
        secondaryChannelProductId: null,
        storeName: selectedStore?.storeName ?? filters.selectedStoreId,
        productName: libraryTargetRow.sellerProductName,
        sellerProductCode: libraryTargetRow.vendorItems[0]?.externalVendorSku ?? null,
      }
    : null;
  const optionIndividualView = filters.optionIndividualView === true;
  const visibleColumnKeys = useMemo(
    () => sanitizeExplorerColumnKeys(filters.visibleColumnKeys),
    [filters.visibleColumnKeys],
  );
  const visibleColumnKeySet = useMemo(() => new Set(visibleColumnKeys), [visibleColumnKeys]);
  const displayRows = useMemo(() => {
    const nextRows: CoupangDisplayRow[] = [];

    for (const row of rows) {
      const isExpanded = optionIndividualView || expandedSellerProductIdSet.has(row.sellerProductId);
      nextRows.push({
        kind: "product",
        row,
        isExpanded,
      });

      if (!isExpanded || !row.vendorItems.length) {
        continue;
      }

      row.vendorItems.forEach((option, optionIndex) => {
        nextRows.push({
          kind: "option",
          key: `${row.sellerProductId}::${option.vendorItemId ?? option.sellerProductItemId ?? option.itemId ?? optionIndex}`,
          parent: row,
          option,
          optionIndex,
        });
      });
    }

    return nextRows;
  }, [expandedSellerProductIdSet, optionIndividualView, rows]);

  useEffect(() => {
    if (!rows.length) {
      if (filters.selectedSellerProductId) {
        setFilters((current) => ({
          ...current,
          selectedSellerProductId: "",
        }));
      }
      return;
    }

    if (filters.selectedSellerProductId && rowsById.has(filters.selectedSellerProductId)) {
      return;
    }

    setFilters((current) => ({
      ...current,
      selectedSellerProductId: rows[0].sellerProductId,
    }));
  }, [filters.selectedSellerProductId, rows, rowsById, setFilters]);

  useEffect(() => {
    const validIdSet = new Set(rows.map((row) => row.sellerProductId));
    setExpandedSellerProductIds((current) => {
      const next = current.filter((sellerProductId) => validIdSet.has(sellerProductId));
      return next.length === current.length ? current : next;
    });
    setLibraryTargetSellerProductId((current) =>
      current && !validIdSet.has(current) ? null : current,
    );
  }, [rows]);

  useEffect(() => {
    if (!filters.selectedStoreId || !rows.length) {
      return;
    }

    const sellerProductIds = rows
      .map((row) => row.sellerProductId)
      .filter(Boolean)
      .slice(0, BACKGROUND_DETAIL_PREFETCH_LIMIT);

    if (!sellerProductIds.length) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const prefetchDetails = async () => {
        let nextIndex = 0;
        const workerCount = Math.max(
          1,
          Math.min(BACKGROUND_DETAIL_PREFETCH_CONCURRENCY, sellerProductIds.length),
        );

        const workers = Array.from({ length: workerCount }, async () => {
          while (!cancelled && nextIndex < sellerProductIds.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            const sellerProductId = sellerProductIds[currentIndex]!;
            const queryKey = buildDetailQueryKey(filters.selectedStoreId, sellerProductId);
            const queryState = queryClient.getQueryState<CoupangProductDetailResponse>(queryKey);

            if (queryState?.fetchStatus === "fetching") {
              continue;
            }

            if (
              queryState?.dataUpdatedAt &&
              Date.now() - queryState.dataUpdatedAt <= BACKGROUND_DETAIL_PREFETCH_STALE_MS
            ) {
              continue;
            }

            try {
              await queryClient.prefetchQuery({
                queryKey,
                queryFn: () =>
                  getJson<CoupangProductDetailResponse>(
                    buildDetailUrl(filters.selectedStoreId, sellerProductId),
                  ),
                gcTime: queryPresets.detail.gcTime,
                staleTime: BACKGROUND_DETAIL_PREFETCH_STALE_MS,
              });
            } catch {
              // Ignore background prefetch errors and let on-demand detail loading recover.
            }
          }
        });

        await Promise.all(workers);
      };

      void prefetchDetails();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filters.selectedStoreId, rows]);

  const detailQuery = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => getJson<CoupangProductDetailResponse>(detailQueryUrl),
    enabled: Boolean(filters.selectedStoreId && filters.selectedSellerProductId),
    ...queryPresets.detail,
  });
  const detailCacheState = getResponseCacheState(detailQuery.data);

  const refreshDetail = () =>
    refreshQueryData({
      queryKey: detailQueryKey,
      queryFn: () => getJsonWithRefresh<CoupangProductDetailResponse>(detailQueryUrl),
      gcTime: queryPresets.detail.gcTime,
    });

  useEffect(() => {
    if (!filters.selectedStoreId || !explorerQuery.data || explorerQuery.isFetching) {
      return;
    }

    if (!isStaleCachedResponse(explorerQuery.data)) {
      return;
    }

    void refreshExplorer();
  }, [explorerQuery.data, explorerQuery.isFetching, filters.selectedStoreId]);

  useEffect(() => {
    if (
      !filters.selectedStoreId ||
      !filters.selectedSellerProductId ||
      !detailQuery.data ||
      detailQuery.isFetching
    ) {
      return;
    }

    if (!isStaleCachedResponse(detailQuery.data)) {
      return;
    }

    void refreshDetail();
  }, [
    detailQuery.data,
    detailQuery.isFetching,
    filters.selectedSellerProductId,
    filters.selectedStoreId,
  ]);

  const selectedDetail = detailQuery.data?.item ?? null;
  const quickOptions = useMemo(() => buildQuickOptions(selectedDetail), [selectedDetail]);
  const canEditSelected = Boolean(selectedDetail?.canEdit);
  const currentPage = explorerQuery.data?.page ?? filters.page;
  const totalPages = explorerQuery.data?.totalPages ?? 1;
  const pageTokens = useMemo(() => buildPageTokens(currentPage, totalPages), [currentPage, totalPages]);
  const statusOptions = useMemo(() => {
    const options = new Set<string>();
    for (const row of rows) {
      if (row.status) {
        options.add(row.status);
      }
      if (row.statusName) {
        options.add(row.statusName);
      }
    }
    if (filters.status) {
      options.add(filters.status);
    }
    return Array.from(options).sort((left, right) => left.localeCompare(right, "ko-KR"));
  }, [filters.status, rows]);
  const activeExposureCard = filters.exposureCard ?? "all";
  const activeOperationCard = filters.operationCard ?? "all";
  const explorerFacets = explorerQuery.data?.facets;

  useEffect(() => {
    setPageJumpDraft(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    if (
      !filters.selectedStoreId ||
      !explorerQuery.data ||
      currentPage >= totalPages ||
      explorerQuery.isFetching
    ) {
      return;
    }

    const nextFilters = {
      ...filters,
      page: currentPage + 1,
    };
    const nextQueryKey = [
      "/api/coupang/products/explorer",
        nextFilters.selectedStoreId,
        nextFilters.searchField,
        nextFilters.searchQuery,
        nextFilters.status,
        nextFilters.exposureCard,
        nextFilters.operationCard,
        nextFilters.createdAtFrom,
      nextFilters.salePeriodFrom,
      nextFilters.salePeriodTo,
      nextFilters.sortField,
      nextFilters.sortDirection,
      nextFilters.page,
      nextFilters.pageSize,
    ] as const;
    const timer = window.setTimeout(() => {
      void queryClient.prefetchQuery({
        queryKey: nextQueryKey,
        queryFn: () =>
          getJson<CoupangProductExplorerResponse>(buildExplorerUrl(nextFilters)),
        ...queryCachePresets.listSnapshot,
      });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentPage, explorerQuery.data, explorerQuery.isFetching, filters, totalPages]);

  const prefetchDetail = (sellerProductId: string) =>
    queryClient.prefetchQuery({
      queryKey: buildDetailQueryKey(filters.selectedStoreId, sellerProductId),
      queryFn: () =>
        getJson<CoupangProductDetailResponse>(buildDetailUrl(filters.selectedStoreId, sellerProductId)),
      ...queryCachePresets.detail,
    });

  const closeActionMenu = () => {
    setMenuOpen(false);
    setAnchor(null);
    setMenuPosition(null);
    setActiveRowId(null);
  };

  const closeQuickAction = () => {
    if (quickActionBusy) {
      return;
    }
    setQuickActionState(null);
  };

  const toggleVisibleColumn = (columnKey: ExplorerColumnKey) => {
    setFilters((current) => {
      const currentKeys = sanitizeExplorerColumnKeys(current.visibleColumnKeys);

      return currentKeys.includes(columnKey)
        ? {
            ...current,
            visibleColumnKeys: currentKeys.filter((key) => key !== columnKey),
          }
        : {
            ...current,
            visibleColumnKeys: [...currentKeys, columnKey],
          };
    });
  };

  const resetVisibleColumns = () => {
    setFilters((current) => ({
      ...current,
      visibleColumnKeys: [...(DEFAULT_FILTERS.visibleColumnKeys ?? [])],
    }));
  };

  const selectProduct = (sellerProductId: string) => {
    setFilters((current) =>
      current.selectedSellerProductId === sellerProductId
        ? current
        : { ...current, selectedSellerProductId: sellerProductId },
    );
  };

  const toggleExpandedProductRow = (row: CoupangProductExplorerRow) => {
    if (!row.vendorItems.length) {
      return;
    }

    setExpandedSellerProductIds((current) =>
      current.includes(row.sellerProductId)
        ? current.filter((sellerProductId) => sellerProductId !== row.sellerProductId)
        : [...current, row.sellerProductId],
    );
  };

  const handleProductRowClick = (row: CoupangProductExplorerRow) => {
    closeActionMenu();
    selectProduct(row.sellerProductId);
    toggleExpandedProductRow(row);
  };

  const applyControls = () => {
    if (
      controls.salePeriodFrom &&
      controls.salePeriodTo &&
      controls.salePeriodFrom > controls.salePeriodTo
    ) {
      setPageFeedback({
        type: "warning",
        title: "?먮ℓ湲곌컙???ㅼ떆 ?뺤씤??二쇱꽭??",
        message: "?먮ℓ湲곌컙 ?쒖옉?쇱? 醫낅즺?쇰낫????쓣 ???놁뒿?덈떎.",
      });
      return;
    }

    setPageFeedback(null);
    setFilters((current) => ({
      ...current,
      selectedStoreId: controls.selectedStoreId,
      searchField: controls.searchField,
      searchQuery: controls.searchQuery,
      status: controls.status,
      createdAtFrom: controls.createdAtFrom,
      salePeriodFrom: controls.salePeriodFrom,
      salePeriodTo: controls.salePeriodTo,
      sortField: controls.sortField,
      sortDirection: controls.sortDirection,
      pageSize: controls.pageSize,
      page: 1,
      selectedSellerProductId:
        current.selectedStoreId === controls.selectedStoreId ? current.selectedSellerProductId : "",
    }));
    closeActionMenu();
  };

  const applyExposureCard = (exposureCard: CoupangProductExplorerExposureCard) => {
    setFilters((current) => ({
      ...current,
      exposureCard,
      page: 1,
    }));
    closeActionMenu();
  };

  const applyOperationCard = (operationCard: CoupangProductExplorerOperationCard) => {
    setFilters((current) => ({
      ...current,
      operationCard,
      page: 1,
    }));
    closeActionMenu();
  };

  const moveToPage = (nextPageValue: number) => {
    const nextPage = Math.max(1, Math.min(nextPageValue, totalPages));
    if (nextPage === currentPage) {
      return;
    }

    setFilters((current) => ({
      ...current,
      page: nextPage,
    }));
    closeActionMenu();
  };

  const submitPageJump = () => {
    const parsedPage = Number.parseInt(pageJumpDraft.trim(), 10);
    if (!Number.isFinite(parsedPage)) {
      setPageFeedback({
        type: "warning",
        title: "?섏씠吏 踰덊샇瑜??뺤씤??二쇱꽭??",
        message: `1 ~ ${formatNumber(totalPages)} ?ъ씠 ?レ옄瑜??낅젰??二쇱꽭??`,
      });
      return;
    }

    setPageFeedback(null);
    moveToPage(parsedPage);
  };

  const toggleSort = (field: CoupangProductExplorerSortField) => {
    const nextDirection: CoupangSortDirection =
      controls.sortField === field && controls.sortDirection === "desc" ? "asc" : "desc";

    setControls((current) => ({
      ...current,
      sortField: field,
      sortDirection: nextDirection,
    }));
    setFilters((current) => ({
      ...current,
      sortField: field,
      sortDirection: nextDirection,
      page: 1,
    }));
    closeActionMenu();
  };

  const handleRefresh = async () => {
    if (!filters.selectedStoreId) {
      return;
    }

    try {
      setPageFeedback(null);
      await refreshExplorer();

      if (filters.selectedSellerProductId) {
        await refreshDetail();
      }

      setPageFeedback({
        type: "success",
        title: "媛뺤젣 ?덈줈怨좎묠???꾨즺?덉뒿?덈떎.",
        message: "?ㅽ넗???꾩껜 ?곹뭹 ?ㅻ깄?룰낵 ?곗륫 誘몃━蹂닿린瑜?理쒖떊 ?곹깭濡??ㅼ떆 遺덈윭?붿뒿?덈떎.",
      });
    } catch (error) {
      setPageFeedback({
        type: "error",
        title: "媛뺤젣 ?덈줈怨좎묠???ㅽ뙣?덉뒿?덈떎.",
        message: error instanceof Error ? error.message : "荑좏뙜 ?곹뭹???ㅼ떆 遺덈윭?ㅼ? 紐삵뻽?듬땲??",
      });
    }
  };

  const openActionMenu = (
    event: ReactMouseEvent<HTMLElement>,
    row: CoupangProductExplorerRow,
  ) => {
    event.stopPropagation();
    setPageFeedback(null);
    selectProduct(row.sellerProductId);
    setActiveRowId(row.sellerProductId);
    setAnchor({ x: event.clientX, y: event.clientY });
    setMenuPosition({ left: event.clientX + 12, top: event.clientY + 12 });
    setMenuOpen(true);
  };

  const renderActionMenuTrigger = (row: CoupangProductExplorerRow, label: string) => (
    <button
      type="button"
      className={`table-action-trigger${menuOpen && activeRowId === row.sellerProductId ? " active" : ""}`}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={menuOpen && activeRowId === row.sellerProductId}
      onClick={(event) => openActionMenu(event, row)}
    >
      <MoreHorizontal size={16} aria-hidden="true" />
    </button>
  );

  const openQuickAction = (kind: QuickActionKind) => {
    if (!selectedDetail) {
      return;
    }

    setQuickActionState(buildQuickActionState(kind, selectedDetail));
    closeActionMenu();
  };

  const openProductLibrary = () => {
    const targetRow = activeRowId ? rowsById.get(activeRowId) ?? null : selectedRow;

    if (!targetRow) {
      return;
    }

    setLibraryTargetSellerProductId(targetRow.sellerProductId);
    closeActionMenu();
  };

  useEffect(() => {
    if (!menuOpen || !anchor || !actionMenuRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (!actionMenuRef.current) {
        return;
      }

      const rect = actionMenuRef.current.getBoundingClientRect();
      const padding = 12;
      let left = anchor.x + 12;
      let top = anchor.y + 12;

      if (left + rect.width + padding > window.innerWidth) {
        left = Math.max(padding, anchor.x - rect.width - 12);
      }

      if (top + rect.height + padding > window.innerHeight) {
        top = Math.max(padding, window.innerHeight - rect.height - padding);
      }

      setMenuPosition((current) =>
        current && current.left === left && current.top === top ? current : { left, top },
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [anchor, menuOpen, activeRowId]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && actionMenuRef.current?.contains(target)) {
        return;
      }
      closeActionMenu();
    };

    const handleScroll = () => closeActionMenu();

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (quickActionState) {
        closeQuickAction();
        return;
      }

      if (menuOpen) {
        closeActionMenu();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen, quickActionState, quickActionBusy]);

  const toggleQuickOption = (optionKey: string) => {
    setQuickActionState((current) => {
      if (!current) {
        return current;
      }

      const nextSelected = new Set(current.selectedIds);
      if (nextSelected.has(optionKey)) {
        nextSelected.delete(optionKey);
      } else {
        nextSelected.add(optionKey);
      }

      return {
        ...current,
        selectedIds: Array.from(nextSelected),
        error: null,
      };
    });
  };

  const toggleAllQuickOptions = () => {
    setQuickActionState((current) => {
      if (!current) {
        return current;
      }

      const selectableIds = quickOptions.filter((option) => option.vendorItemId).map((option) => option.key);
      const allSelected =
        selectableIds.length > 0 && selectableIds.every((optionKey) => current.selectedIds.includes(optionKey));

      return {
        ...current,
        selectedIds: allSelected ? [] : selectableIds,
        error: null,
      };
    });
  };

  const updateQuickAction = (updater: (current: QuickActionState) => QuickActionState) => {
    setQuickActionState((current) => (current ? updater(current) : current));
  };

  const applyQuickBulkDraft = () => {
    setQuickActionState((current) => {
      if (!current) {
        return current;
      }

      if (!current.bulkDraft.trim()) {
        return {
          ...current,
          error: "?쇨큵 ?곸슜??媛믪쓣 ?낅젰??二쇱꽭??",
        };
      }

      if (current.kind === "price") {
        return {
          ...current,
          priceDrafts: {
            ...current.priceDrafts,
            ...Object.fromEntries(current.selectedIds.map((optionKey) => [optionKey, current.bulkDraft])),
          },
          error: null,
        };
      }

      if (current.kind === "quantity") {
        return {
          ...current,
          quantityDrafts: {
            ...current.quantityDrafts,
            ...Object.fromEntries(current.selectedIds.map((optionKey) => [optionKey, current.bulkDraft])),
          },
          error: null,
        };
      }

      return current;
    });
  };

  const runQuickAction = async () => {
    if (!quickActionState || !selectedDetail || !filters.selectedStoreId || !filters.selectedSellerProductId) {
      return;
    }

    const selectedMap = new Set(quickActionState.selectedIds);
    const selectedOptions = quickOptions.filter((option) => selectedMap.has(option.key));

    if (!selectedOptions.length && quickActionState.kind !== "price") {
      updateQuickAction((current) => ({
        ...current,
        error: "?듭뀡???섎굹 ?댁긽 ?좏깮??二쇱꽭??",
      }));
      return;
    }

    const localToastId = startLocalOperation({
      channel: "coupang",
      actionName:
        quickActionState.kind === "price"
          ? "荑좏뙜 媛寃?/ 諛곗넚鍮?鍮좊Ⅸ ?섏젙"
          : quickActionState.kind === "quantity"
            ? "荑좏뙜 ?ш퀬 鍮좊Ⅸ ?섏젙"
            : "荑좏뙜 ?먮ℓ?곹깭 鍮좊Ⅸ ?섏젙",
      targetCount: Math.max(1, selectedOptions.length),
    });

    setQuickActionBusy(true);

    try {
      if (quickActionState.kind === "price") {
        const targets: CoupangProductPriceUpdateTarget[] = [];

        for (const option of selectedOptions) {
          if (!option.vendorItemId) {
            continue;
          }

          const parsedPrice = parseNullableInteger(quickActionState.priceDrafts[option.key] ?? "");
          if (!Number.isFinite(parsedPrice) || parsedPrice === null || parsedPrice <= 0) {
            throw new Error(`${option.itemName} ?먮ℓ媛??0蹂대떎 ???レ옄?ъ빞 ?⑸땲??`);
          }

          targets.push({
            sellerProductId: filters.selectedSellerProductId,
            vendorItemId: option.vendorItemId,
            price: parsedPrice,
            itemName: option.itemName,
          });
        }

        if (!targets.length) {
          throw new Error("蹂寃쏀븷 媛寃⑹쓣 ?낅젰??二쇱꽭??");
        }

        let priceResult: CoupangBatchActionResponse | null = null;

        if (targets.length) {
          priceResult = await apiRequestJson<CoupangBatchActionResponse>(
            "POST",
            "/api/coupang/products/prices/bulk",
            {
              storeId: filters.selectedStoreId,
              items: targets,
            },
          );
          if (priceResult.operation) {
            publishOperation(priceResult.operation);
          }
        }

        const patchedAt = new Date().toISOString();
        const successfulPriceIds = new Set(
          (priceResult?.items ?? [])
            .filter(hasSucceededVendorItemId)
            .map((item) => item.vendorItemId),
        );
        const priceByVendorItemId = new Map(targets.map((item) => [item.vendorItemId, item.price]));

        queryClient.setQueryData<CoupangProductExplorerResponse>(explorerQueryKey, (current) =>
          patchExplorerResponse(
            current,
            filters.selectedSellerProductId,
            (item) => {
              if (!item.vendorItemId || !successfulPriceIds.has(item.vendorItemId)) {
                return item;
              }

              return {
                ...item,
                salePrice: priceByVendorItemId.get(item.vendorItemId) ?? item.salePrice,
                lastModifiedAt: patchedAt,
              };
            },
          ),
        );
        queryClient.setQueryData<CoupangProductDetailResponse>(detailQueryKey, (current) =>
          patchDetailResponse(
            current,
            (item) => {
              if (!item.vendorItemId || !successfulPriceIds.has(item.vendorItemId)) {
                return item;
              }

              return {
                ...item,
                salePrice: priceByVendorItemId.get(item.vendorItemId) ?? item.salePrice,
              };
            },
          ),
        );

        await Promise.all([
          refreshExplorer(),
          filters.selectedSellerProductId ? refreshDetail() : Promise.resolve(undefined),
        ]);

        finishLocalOperation(localToastId, {
          status:
            priceResult?.summary.failedCount ||
            priceResult?.summary.warningCount
              ? "warning"
              : "success",
          summary: priceResult ? `媛寃?${priceResult.summary.succeededCount}嫄?諛섏쁺` : null,
        });
        window.setTimeout(() => removeLocalOperation(localToastId), 800);
        setPageFeedback({
          type: "success",
          title: "媛寃⑹쓣 ??ν뻽?듬땲??",
          message: "?좏깮 ?듭뀡 媛寃⑹쓣 ?ㅼ떆 議고쉶??理쒖떊 ?곹깭濡?諛섏쁺?덉뒿?덈떎.",
        });
      } else if (quickActionState.kind === "quantity") {
        const targets: CoupangProductQuantityUpdateTarget[] = selectedOptions.map((option) => {
          const parsedQuantity = parseNullableInteger(quickActionState.quantityDrafts[option.key] ?? "");
          if (!Number.isFinite(parsedQuantity) || parsedQuantity === null || parsedQuantity < 0) {
            throw new Error(`${option.itemName} ?ш퀬??0 ?댁긽???レ옄?ъ빞 ?⑸땲??`);
          }

          if (!option.vendorItemId) {
            throw new Error(`${option.itemName} ?듭뀡??vendorItemId媛 ?놁뼱 ?ш퀬瑜??섏젙?????놁뒿?덈떎.`);
          }

          return {
            sellerProductId: filters.selectedSellerProductId,
            vendorItemId: option.vendorItemId,
            quantity: parsedQuantity,
            itemName: option.itemName,
          };
        });

        const result = await apiRequestJson<CoupangBatchActionResponse>(
          "POST",
          "/api/coupang/products/quantities/bulk",
          {
            storeId: filters.selectedStoreId,
            items: targets,
          },
        );
        if (result.operation) {
          publishOperation(result.operation);
        }

        const patchedAt = new Date().toISOString();
        const successfulQuantityIds = new Set(
          result.items
            .filter(hasSucceededVendorItemId)
            .map((item) => item.vendorItemId),
        );
        const quantityByVendorItemId = new Map(targets.map((item) => [item.vendorItemId, item.quantity]));

        queryClient.setQueryData<CoupangProductExplorerResponse>(explorerQueryKey, (current) =>
          patchExplorerResponse(current, filters.selectedSellerProductId, (item) => {
            if (!item.vendorItemId || !successfulQuantityIds.has(item.vendorItemId)) {
              return item;
            }

            return {
              ...item,
              inventoryCount: quantityByVendorItemId.get(item.vendorItemId) ?? item.inventoryCount,
              lastModifiedAt: patchedAt,
            };
          }),
        );
        queryClient.setQueryData<CoupangProductDetailResponse>(detailQueryKey, (current) =>
          patchDetailResponse(current, (item) => {
            if (!item.vendorItemId || !successfulQuantityIds.has(item.vendorItemId)) {
              return item;
            }

            return {
              ...item,
              inventoryCount: quantityByVendorItemId.get(item.vendorItemId) ?? item.inventoryCount,
            };
          }),
        );

        await Promise.all([
          refreshExplorer(),
          filters.selectedSellerProductId ? refreshDetail() : Promise.resolve(undefined),
        ]);

        finishLocalOperation(localToastId, {
          status: result.summary.failedCount || result.summary.warningCount ? "warning" : "success",
          summary: `?ш퀬 ${result.summary.succeededCount}嫄?諛섏쁺`,
        });
        window.setTimeout(() => removeLocalOperation(localToastId), 800);
        setPageFeedback({
          type: "success",
          title: "?ш퀬瑜???ν뻽?듬땲??",
          message: "?좏깮 ?듭뀡 ?ш퀬瑜??ㅼ떆 議고쉶??理쒖떊 ?곹깭濡?諛섏쁺?덉뒿?덈떎.",
        });
      } else {
        const targets: CoupangProductSaleStatusUpdateTarget[] = selectedOptions.map((option) => {
          if (!option.vendorItemId) {
            throw new Error(`${option.itemName} ?듭뀡??vendorItemId媛 ?놁뼱 ?먮ℓ?곹깭瑜??섏젙?????놁뒿?덈떎.`);
          }

          return {
            sellerProductId: filters.selectedSellerProductId,
            vendorItemId: option.vendorItemId,
            saleStatus: quickActionState.nextSaleStatus,
            itemName: option.itemName,
          };
        });

        const result = await apiRequestJson<CoupangBatchActionResponse>(
          "POST",
          "/api/coupang/products/sale-status/bulk",
          {
            storeId: filters.selectedStoreId,
            items: targets,
          },
        );
        if (result.operation) {
          publishOperation(result.operation);
        }

        const patchedAt = new Date().toISOString();
        const successfulStatusIds = new Set(
          result.items
            .filter(hasSucceededVendorItemId)
            .map((item) => item.vendorItemId),
        );

        queryClient.setQueryData<CoupangProductExplorerResponse>(explorerQueryKey, (current) =>
          patchExplorerResponse(current, filters.selectedSellerProductId, (item) => {
            if (!item.vendorItemId || !successfulStatusIds.has(item.vendorItemId)) {
              return item;
            }

            return {
              ...item,
              saleStatus: quickActionState.nextSaleStatus,
              lastModifiedAt: patchedAt,
            };
          }),
        );
        queryClient.setQueryData<CoupangProductDetailResponse>(detailQueryKey, (current) =>
          patchDetailResponse(current, (item) => {
            if (!item.vendorItemId || !successfulStatusIds.has(item.vendorItemId)) {
              return item;
            }

            return {
              ...item,
              saleStatus: quickActionState.nextSaleStatus,
            };
          }),
        );

        await Promise.all([
          refreshExplorer(),
          filters.selectedSellerProductId ? refreshDetail() : Promise.resolve(undefined),
        ]);

        finishLocalOperation(localToastId, {
          status: result.summary.failedCount || result.summary.warningCount ? "warning" : "success",
          summary: `?먮ℓ?곹깭 ${result.summary.succeededCount}嫄?諛섏쁺`,
        });
        window.setTimeout(() => removeLocalOperation(localToastId), 800);
        setPageFeedback({
          type: "success",
          title: "?먮ℓ?곹깭瑜???ν뻽?듬땲??",
          message: "?좏깮 ?듭뀡 ?먮ℓ?곹깭瑜??ㅼ떆 議고쉶??理쒖떊 ?곹깭濡?諛섏쁺?덉뒿?덈떎.",
        });
      }

      setQuickActionState(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "荑좏뙜 ?곹뭹 鍮좊Ⅸ ?섏젙???ㅽ뙣?덉뒿?덈떎.";
      updateQuickAction((current) => ({
        ...current,
        error: message,
      }));
      finishLocalOperation(localToastId, {
        status: "error",
        errorMessage: message,
      });
    } finally {
      setQuickActionBusy(false);
    }
  };

  const sortIndicator = (field: CoupangProductExplorerSortField) => {
    if (filters.sortField !== field) {
      return "";
    }

    return filters.sortDirection === "desc" ? "▼" : "▲";
  };

  const renderSortableHeader = (field: CoupangProductExplorerSortField, label: string) => (
    <button className="table-sort-button" type="button" onClick={() => toggleSort(field)}>
      {label} {sortIndicator(field)}
    </button>
  );

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone={explorerQuery.data?.source === "live" ? "live" : "draft"} />
          {explorerCacheState && explorerCacheState !== "live" ? (
            <span className="status-pill pending">캐시 표시 중</span>
          ) : null}
        </div>
        <h1>쿠팡 상품 Explorer</h1>
        <p>
          스토어 전체 상품을 기준으로 검색하고 카드 정렬, 상세 미리보기, 빠른 수정,
          전체 상품 수정 화면까지 한 번에 연결합니다.
        </p>
      </div>

      <OperationPageSettings
        menuKey="coupang.products"
        description="Explorer에서 자주 바꾸는 보기 설정과 표시 구성을 관리합니다."
        summary={
          <>
            <span className="chip">표시 열 {formatNumber(visibleColumnKeys.length)}개</span>
            <span className="chip">
              {optionIndividualView ? "옵션 개별보기 켜짐" : "옵션 개별보기 꺼짐"}
            </span>
          </>
        }
      >
        <div className="featured-settings">
          <div className="card-header">
            <div>
              <strong>보기 설정</strong>
              <div className="muted">
                열 표시와 옵션 표시 방식을 바꾸면 다음에도 그대로 유지됩니다.
              </div>
            </div>
            <button className="button ghost" onClick={resetVisibleColumns} type="button">
              기본값 복원
            </button>
          </div>

          <label className="table-mode-toggle" style={{ justifySelf: "start" }}>
            <input
              type="checkbox"
              checked={optionIndividualView}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  optionIndividualView: event.target.checked,
                }))
              }
            />
            <span>옵션 개별보기</span>
          </label>

          <div className="featured-settings-grid">
            {EXPLORER_COLUMN_DEFINITIONS.map((column) => {
              const isSelected = visibleColumnKeySet.has(column.key);

              return (
                <label
                  key={column.key}
                  className={`featured-settings-item${isSelected ? " selected" : ""}`}
                >
                  <div className="featured-settings-main">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleVisibleColumn(column.key)}
                    />
                    <div className="stack" style={{ gap: "0.25rem" }}>
                      <strong>{column.label}</strong>
                      <div className="muted">{column.description}</div>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </OperationPageSettings>

      <div className="card">
        <div className="toolbar">
          <select
            value={controls.selectedStoreId}
            onChange={(event) =>
              setControls((current) => ({
                ...current,
                selectedStoreId: event.target.value,
              }))
            }
          >
            <option value="">스토어 선택</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.storeName}
              </option>
            ))}
          </select>

          <select
            value={controls.searchField}
            onChange={(event) =>
              setControls((current) => ({
                ...current,
                searchField: event.target.value as CoupangProductSearchField,
              }))
            }
          >
            {SEARCH_FIELD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <input
            value={controls.searchQuery}
            onChange={(event) =>
              setControls((current) => ({
                ...current,
                searchQuery: event.target.value,
              }))
            }
            placeholder="선택한 컬럼 기준으로 검색"
            style={{ minWidth: 240, flex: 1 }}
          />

          <select
            value={controls.status}
            onChange={(event) =>
              setControls((current) => ({
                ...current,
                status: event.target.value,
              }))
            }
          >
            <option value="">전체 상태</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <label className="field" style={{ minWidth: 170 }}>
            <span>등록일 이후</span>
            <input
              type="date"
              value={controls.createdAtFrom}
              onChange={(event) =>
                setControls((current) => ({
                  ...current,
                  createdAtFrom: event.target.value,
                }))
              }
            />
          </label>

          <label className="field" style={{ minWidth: 170 }}>
            <span>판매기간 시작</span>
            <input
              type="date"
              value={controls.salePeriodFrom}
              max={controls.salePeriodTo || undefined}
              onChange={(event) =>
                setControls((current) => ({
                  ...current,
                  salePeriodFrom: event.target.value,
                }))
              }
            />
          </label>

          <label className="field" style={{ minWidth: 170 }}>
            <span>?먮ℓ湲곌컙 醫낅즺</span>
            <input
              type="date"
              value={controls.salePeriodTo}
              min={controls.salePeriodFrom || undefined}
              onChange={(event) =>
                setControls((current) => ({
                  ...current,
                  salePeriodTo: event.target.value,
                }))
              }
            />
          </label>

          <select
            value={controls.pageSize}
            onChange={(event) =>
              setControls((current) => ({
                ...current,
                pageSize: Number(event.target.value),
              }))
            }
          >
            {COUPANG_PRODUCT_EXPLORER_PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                ?섏씠吏??{option}媛?              </option>
            ))}
          </select>

          <button className="button secondary" onClick={applyControls} disabled={!controls.selectedStoreId}>
            ?곸슜
          </button>
          <button
            className="button ghost"
            onClick={handleRefresh}
            disabled={!filters.selectedStoreId || explorerQuery.isFetching}
          >
            {explorerQuery.isFetching ? "媛뺤젣 ?덈줈怨좎묠 以?." : "媛뺤젣 ?덈줈怨좎묠"}
          </button>
        </div>
      </div>

      {pageFeedback ? (
        <div className={`feedback${pageFeedback.type === "error" ? " error" : pageFeedback.type === "warning" ? " warning" : ""}`}>
          <strong>{pageFeedback.title}</strong>
          <div className="muted">{pageFeedback.message}</div>
        </div>
      ) : null}

      {explorerQuery.data?.message ? (
        <div className="card">
          <div className="muted">{explorerQuery.data.message}</div>
        </div>
      ) : null}

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">?꾩껜 寃??寃곌낵</div>
          <div className="metric-value">{formatNumber(explorerQuery.data?.total ?? 0)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">?꾩옱 ?섏씠吏</div>
          <div className="metric-value">
            {formatNumber(currentPage)} / {formatNumber(totalPages)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">?좏깮 ?곹뭹</div>
          <div className="metric-value">{filters.selectedSellerProductId ? "1" : "0"}</div>
        </div>
        <div className="metric">
          <div className="metric-label">理쒖쥌 媛깆떊</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatDate(explorerQuery.data?.fetchedAt)}
          </div>
        </div>
      </div>

      <div className="shipment-quick-filter-sections product-quick-filter-sections">
        <section className="shipment-quick-filter-section">
          <div className="shipment-quick-filter-header">
            <div>
              <strong>?몄텧 ?곹깭</strong>
              <div className="muted shipment-quick-filter-note">
                ?꾩옱 寃?? ?곹깭, 湲곌컙 議곌굔 湲곗??쇰줈 ?몄텧 ?댁뒋 ?곹뭹留?鍮좊Ⅴ寃?醫곹? 遊낅땲??
              </div>
            </div>
            <div className="muted shipment-quick-filter-summary">
              ?좏깮: {PRODUCT_EXPOSURE_FILTER_CARDS.find((card) => card.key === activeExposureCard)?.label ?? "?꾩껜"}
            </div>
          </div>
          <div className="shipment-quick-filter-grid">
            {PRODUCT_EXPOSURE_FILTER_CARDS.map((card) => (
              <button
                key={card.key}
                type="button"
                className={[
                  "shipment-filter-card",
                  card.tone,
                  activeExposureCard === card.key ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={activeExposureCard === card.key}
                onClick={() => applyExposureCard(card.key)}
              >
                <span className="shipment-filter-card-label">{card.label}</span>
                <span className="shipment-filter-card-count">
                  {formatNumber(explorerFacets?.exposure[card.key] ?? 0)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="shipment-quick-filter-section">
          <div className="shipment-quick-filter-header">
            <div>
              <strong>?댁쁺 ?곹깭</strong>
              <div className="muted shipment-quick-filter-note">
                ?먮ℓ以묒?, ?ш퀬 0, 理쒖?媛蹂댁옣 ?듭뀡???덈뒗 ?곹뭹留??곕줈 ?뺤씤?⑸땲??
              </div>
            </div>
            <div className="muted shipment-quick-filter-summary">
              ?좏깮: {PRODUCT_OPERATION_FILTER_CARDS.find((card) => card.key === activeOperationCard)?.label ?? "?꾩껜"}
            </div>
          </div>
          <div className="shipment-quick-filter-grid">
            {PRODUCT_OPERATION_FILTER_CARDS.map((card) => (
              <button
                key={card.key}
                type="button"
                className={[
                  "shipment-filter-card",
                  card.tone,
                  activeOperationCard === card.key ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={activeOperationCard === card.key}
                onClick={() => applyOperationCard(card.key)}
              >
                <span className="shipment-filter-card-label">{card.label}</span>
                <span className="shipment-filter-card-count">
                  {formatNumber(explorerFacets?.operation[card.key] ?? 0)}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {explorerQuery.data ? (
        <ApiFreshnessCard
          fetchedAt={explorerQuery.data.fetchedAt}
          cacheState={explorerCacheState}
          servedFromCache={explorerQuery.data.servedFromCache}
          isFetching={explorerQuery.isFetching && Boolean(explorerQuery.data)}
        />
      ) : null}

      <div className="explorer-layout">
        <div className="card" style={{ position: "relative" }}>
          {!stores.length ? (
            <div className="empty">癒쇱? ?ㅼ젙?먯꽌 荑좏뙜 ?ㅽ넗?대? ?곌껐??二쇱꽭??</div>
          ) : explorerQuery.isLoading ? (
            <div className="empty">荑좏뙜 ?ㅽ넗???꾩껜 ?곹뭹 ?ㅻ깄?룹쓣 遺덈윭?ㅻ뒗 以묒엯?덈떎.</div>
          ) : explorerQuery.error ? (
            <div className="empty">{(explorerQuery.error as Error).message}</div>
          ) : !rows.length ? (
            <div className="empty">寃??議곌굔??留욌뒗 荑좏뙜 ?곹뭹???놁뒿?덈떎.</div>
          ) : (
            <>
              <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div className="muted">
                  ?먮ℓ以묒?, ?꾩떆??? 諛섎젮 ?곹뭹??`DELETED`瑜??쒖쇅?섍퀬 紐⑤몢 ?먯깋?⑸땲??
                </div>
                <div className="toolbar explorer-pagination">
                  <button
                    className="button ghost"
                    onClick={() => moveToPage(1)}
                    disabled={currentPage <= 1 || explorerQuery.isFetching}
                    type="button"
                  >
                    泥섏쓬
                  </button>
                  <button
                    className="button ghost"
                    onClick={() => moveToPage(currentPage - 1)}
                    disabled={currentPage <= 1 || explorerQuery.isFetching}
                    type="button"
                  >
                    ?댁쟾
                  </button>
                  <div className="page-number-strip">
                    {pageTokens.map((token, index) =>
                      token === "ellipsis" ? (
                        <span key={`ellipsis:${index}`} className="page-number-ellipsis">
                          ...
                        </span>
                      ) : (
                        <button
                          key={token}
                          className={`button ghost page-number-button${token === currentPage ? " active" : ""}`}
                          onClick={() => moveToPage(token)}
                          disabled={explorerQuery.isFetching}
                          type="button"
                        >
                          {formatNumber(token)}
                        </button>
                      ),
                    )}
                  </div>
                  <form
                    className="page-jump-control"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitPageJump();
                    }}
                  >
                    <span className="muted">?섏씠吏 ?대룞</span>
                    <input
                      className="page-jump-input"
                      inputMode="numeric"
                      value={pageJumpDraft}
                      onChange={(event) => setPageJumpDraft(event.target.value)}
                      placeholder={`${currentPage}`}
                    />
                    <button className="button ghost" disabled={explorerQuery.isFetching} type="submit">
                      ?대룞
                    </button>
                  </form>
                  <button
                    className="button ghost"
                    onClick={() => moveToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages || explorerQuery.isFetching}
                    type="button"
                  >
                    ?ㅼ쓬
                  </button>
                </div>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {visibleColumnKeySet.has("thumbnail") ? <th>이미지</th> : null}
                      {visibleColumnKeySet.has("kind") ? <th>구분</th> : null}
                      {visibleColumnKeySet.has("sellerProductName") ? (
                        <th>{renderSortableHeader("sellerProductName", "상품명")}</th>
                      ) : null}
                      {visibleColumnKeySet.has("displayCategoryName") ? (
                        <th>{renderSortableHeader("displayCategoryName", "카테고리")}</th>
                      ) : null}
                      {visibleColumnKeySet.has("externalVendorSku") ? <th>판매자식별코드</th> : null}
                      {visibleColumnKeySet.has("ids") ? <th>Seller Product ID / Vendor Item ID</th> : null}
                      {visibleColumnKeySet.has("barcode") ? <th>바코드</th> : null}
                      {visibleColumnKeySet.has("minSalePrice") ? (
                        <th>{renderSortableHeader("minSalePrice", "판매가")}</th>
                      ) : null}
                      {visibleColumnKeySet.has("deliveryCharge") ? (
                        <th>{renderSortableHeader("deliveryCharge", "배송비")}</th>
                      ) : null}
                      {visibleColumnKeySet.has("totalInventory") ? (
                        <th>{renderSortableHeader("totalInventory", "재고")}</th>
                      ) : null}
                      {visibleColumnKeySet.has("statusName") ? (
                        <th>{renderSortableHeader("statusName", "상태")}</th>
                      ) : null}
                      {visibleColumnKeySet.has("salePeriod") ? (
                        <th>{renderSortableHeader("saleStartedAt", "판매기간")}</th>
                      ) : null}
                      {visibleColumnKeySet.has("createdAt") ? (
                        <th>{renderSortableHeader("createdAt", "등록일")}</th>
                      ) : null}
                      {visibleColumnKeySet.has("lastModifiedAt") ? (
                        <th>{renderSortableHeader("lastModifiedAt", "수정일")}</th>
                      ) : null}
                      <th className="table-action-column">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((displayRow) => {
                      if (displayRow.kind === "option") {
                        return (
                          <tr
                            key={displayRow.key}
                            className={[
                              filters.selectedSellerProductId === displayRow.parent.sellerProductId
                                ? "table-row-selected"
                                : "",
                              "table-row-child",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onMouseEnter={() => void prefetchDetail(displayRow.parent.sellerProductId)}
                            onClick={() => {
                              closeActionMenu();
                              selectProduct(displayRow.parent.sellerProductId);
                            }}
                          >
                            {visibleColumnKeySet.has("thumbnail") ? (
                              <td>
                                <div className="table-thumb table-thumb-empty">OPT</div>
                              </td>
                            ) : null}
                            {visibleColumnKeySet.has("kind") ? (
                              <td>
                                <div className="table-kind-cell">
                                  <span className="table-kind-badge option">?듭뀡 ?곹뭹</span>
                                  <div className="muted">
                                    {buildExplorerOptionCountLabel(displayRow.parent, displayRow.optionIndex)}
                                  </div>
                                </div>
                              </td>
                            ) : null}
                            {visibleColumnKeySet.has("sellerProductName") ? (
                              <td>
                                <div className="table-subrow-label table-option-label">
                                  <div className="table-row-heading">
                                    <ExpandableTableText
                                      value={displayRow.option.itemName}
                                      maxLength={42}
                                      strong
                                    />
                                  </div>
                                  <div className="table-row-hint">
                                    <ExpandableTableText
                                      value={buildParentProductLabel(displayRow.parent.sellerProductName)}
                                      maxLength={52}
                                      muted
                                    />
                                  </div>
                                </div>
                              </td>
                            ) : null}
                            {visibleColumnKeySet.has("displayCategoryName") ? (
                              <td>
                                <div className="table-cell-stack">
                                  <ExpandableTableText
                                    value={displayRow.parent.displayCategoryName}
                                    maxLength={34}
                                  />
                                  {!displayRow.parent.displayCategoryName &&
                                  displayRow.parent.displayCategoryCode ? (
                                    <div className="muted">
                                      肄붾뱶 {displayRow.parent.displayCategoryCode}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            ) : null}
                            {visibleColumnKeySet.has("externalVendorSku") ? (
                              <td>
                                <ExpandableTableText
                                  value={displayRow.option.externalVendorSku}
                                  maxLength={28}
                                />
                              </td>
                            ) : null}
                            {visibleColumnKeySet.has("ids") ? (
                              <td>
                                <ExpandableTableText
                                  value={buildOptionIdText(displayRow.option)}
                                  maxLength={52}
                                  monospace
                                  preserveWhitespace
                                />
                              </td>
                            ) : null}
                            {visibleColumnKeySet.has("barcode") ? (
                              <td>
                                <ExpandableTableText
                                  value={displayRow.option.barcode}
                                  maxLength={28}
                                />
                              </td>
                            ) : null}
                            {visibleColumnKeySet.has("minSalePrice") ? (
                              <td>{formatNumber(displayRow.option.salePrice)}</td>
                            ) : null}
                            {visibleColumnKeySet.has("deliveryCharge") ? (
                              <td>{formatDeliveryCharge(displayRow.parent.deliveryCharge)}</td>
                            ) : null}
                            {visibleColumnKeySet.has("totalInventory") ? (
                              <td>{formatNumber(displayRow.option.inventoryCount)}</td>
                            ) : null}
                            {visibleColumnKeySet.has("statusName") ? (
                              <td>
                                <span className={`status-pill ${getCoupangStatusClassName(displayRow.option.saleStatus)}`}>
                                  {displayRow.option.saleStatus}
                                </span>
                              </td>
                            ) : null}
                            {visibleColumnKeySet.has("salePeriod") ? (
                              <td>
                                <SalePeriodCell
                                  saleStartedAt={displayRow.parent.saleStartedAt}
                                  saleEndedAt={displayRow.parent.saleEndedAt}
                                />
                              </td>
                            ) : null}
                            {visibleColumnKeySet.has("createdAt") ? (
                              <td>{formatDate(displayRow.parent.createdAt)}</td>
                            ) : null}
                            {visibleColumnKeySet.has("lastModifiedAt") ? (
                              <td>{formatDate(displayRow.option.lastModifiedAt ?? displayRow.parent.lastModifiedAt)}</td>
                            ) : null}
                            <td className="table-action-cell" onClick={(event) => event.stopPropagation()}>
                              {renderActionMenuTrigger(
                                displayRow.parent,
                                `${displayRow.parent.sellerProductName} ?≪뀡 硫붾돱 ?닿린`,
                              )}
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr
                          key={displayRow.row.sellerProductId}
                          className={[
                            filters.selectedSellerProductId === displayRow.row.sellerProductId ? "table-row-selected" : "",
                            menuOpen && activeRowId === displayRow.row.sellerProductId ? "table-row-action-active" : "",
                            displayRow.isExpanded ? "table-row-parent-expanded" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onMouseEnter={() => void prefetchDetail(displayRow.row.sellerProductId)}
                          onClick={() => handleProductRowClick(displayRow.row)}
                        >
                          {visibleColumnKeySet.has("thumbnail") ? (
                            <td>
                              {displayRow.row.thumbnailUrl ? (
                                <img
                                  className="table-thumb"
                                  src={displayRow.row.thumbnailUrl}
                                  alt={displayRow.row.sellerProductName}
                                />
                              ) : (
                                <div className="table-thumb table-thumb-empty">NO IMAGE</div>
                              )}
                            </td>
                          ) : null}
                          {visibleColumnKeySet.has("kind") ? (
                            <td>
                              <div className="table-kind-cell">
                                <span className="table-kind-badge product">{buildProductKindLabel(displayRow.row)}</span>
                                <div className="muted">{buildProductOptionCountText(displayRow.row)}</div>
                              </div>
                            </td>
                          ) : null}
                          {visibleColumnKeySet.has("sellerProductName") ? (
                            <td>
                              <div className="table-row-heading">
                                <ExpandableTableText
                                  value={displayRow.row.sellerProductName}
                                  maxLength={44}
                                  strong
                                />
                              </div>
                              {buildProductOptionHint(
                                displayRow.row,
                                displayRow.isExpanded,
                                optionIndividualView,
                              ) ? (
                                <div className="table-row-hint">
                                  {buildProductOptionHint(
                                    displayRow.row,
                                    displayRow.isExpanded,
                                    optionIndividualView,
                                  )}
                                </div>
                              ) : null}
                            </td>
                          ) : null}
                          {visibleColumnKeySet.has("displayCategoryName") ? (
                            <td>
                              <div className="table-cell-stack">
                                <ExpandableTableText
                                  value={displayRow.row.displayCategoryName}
                                  maxLength={34}
                                />
                                {!displayRow.row.displayCategoryName &&
                                displayRow.row.displayCategoryCode ? (
                                  <div className="muted">肄붾뱶 {displayRow.row.displayCategoryCode}</div>
                                ) : null}
                              </div>
                            </td>
                          ) : null}
                          {visibleColumnKeySet.has("externalVendorSku") ? (
                            <td>
                              <ExpandableTableText
                                value={buildVendorItemValueSummary(displayRow.row.vendorItems, "externalVendorSku")}
                                maxLength={28}
                              />
                            </td>
                          ) : null}
                          {visibleColumnKeySet.has("ids") ? (
                            <td>
                              <ExpandableTableText
                                value={buildProductIdText(displayRow.row)}
                                maxLength={52}
                                monospace
                                preserveWhitespace
                              />
                            </td>
                          ) : null}
                          {visibleColumnKeySet.has("barcode") ? (
                            <td>
                              <ExpandableTableText
                                value={buildVendorItemValueSummary(displayRow.row.vendorItems, "barcode")}
                                maxLength={28}
                              />
                            </td>
                          ) : null}
                          {visibleColumnKeySet.has("minSalePrice") ? (
                            <td>{formatSalePriceRange(displayRow.row.minSalePrice, displayRow.row.maxSalePrice)}</td>
                          ) : null}
                          {visibleColumnKeySet.has("deliveryCharge") ? (
                            <td>{formatDeliveryCharge(displayRow.row.deliveryCharge)}</td>
                          ) : null}
                          {visibleColumnKeySet.has("totalInventory") ? (
                            <td>{formatNumber(displayRow.row.totalInventory)}</td>
                          ) : null}
                          {visibleColumnKeySet.has("statusName") ? (
                            <td>
                              <div className="product-status-cell">
                                <div className="product-status-badges">
                                  <span
                                    className={`status-pill ${getCoupangStatusClassName(
                                      displayRow.row.statusName ?? displayRow.row.status,
                                    )}`}
                                  >
                                    {displayRow.row.statusName ?? displayRow.row.status ?? "-"}
                                  </span>
                                  {buildCoupangExposureBadges({
                                    violationTypes: displayRow.row.violationTypes,
                                    exposureState: displayRow.row.exposureState,
                                  }).map((badge) => (
                                    <span
                                      key={`${displayRow.row.sellerProductId}:${badge.key}`}
                                      className={`status-pill ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  ))}
                                </div>
                                {buildCoupangOperationSummary(displayRow.row) ? (
                                  <div className="table-row-hint">
                                    {buildCoupangOperationSummary(displayRow.row)}
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          ) : null}
                          {visibleColumnKeySet.has("salePeriod") ? (
                            <td>
                              <SalePeriodCell
                                saleStartedAt={displayRow.row.saleStartedAt}
                                saleEndedAt={displayRow.row.saleEndedAt}
                              />
                            </td>
                          ) : null}
                          {visibleColumnKeySet.has("createdAt") ? (
                            <td>{formatDate(displayRow.row.createdAt)}</td>
                          ) : null}
                          {visibleColumnKeySet.has("lastModifiedAt") ? (
                            <td>{formatDate(displayRow.row.lastModifiedAt)}</td>
                          ) : null}
                          <td className="table-action-cell" onClick={(event) => event.stopPropagation()}>
                            {renderActionMenuTrigger(
                              displayRow.row,
                              `${displayRow.row.sellerProductName} ?≪뀡 硫붾돱 ?닿린`,
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {menuOpen && activeRowId && menuPosition ? (
            <div
              ref={actionMenuRef}
              className="product-action-menu"
              style={{ left: menuPosition.left, top: menuPosition.top }}
            >
              <button
                className="product-action-button"
                onClick={() => openQuickAction("price")}
                disabled={!selectedDetail || !canEditSelected}
              >
                가격 / 배송비
              </button>
              <button
                className="product-action-button"
                onClick={() => openQuickAction("quantity")}
                disabled={!selectedDetail || !canEditSelected}
              >
                재고 수량
              </button>
              <button
                className="product-action-button"
                onClick={() => openQuickAction("saleStatus")}
                disabled={!selectedDetail || !canEditSelected}
              >
                판매중 / 판매중지
              </button>
              <button className="product-action-button" onClick={openProductLibrary}>
                메모 / 라이브러리
              </button>
            </div>
          ) : null}
        </div>

        <div className="preview-panel">
          <CoupangProductPreview
            summary={selectedRow}
            detail={selectedDetail}
            isLoading={detailQuery.isLoading}
            emptyMessage="상품 목록에서 상품을 클릭하면 상세 미리보기와 빠른 작업 메뉴를 사용할 수 있습니다."
            headerActions={
              filters.selectedSellerProductId ? (
                <div className="toolbar">
                  <button
                    className="button ghost"
                    onClick={() => void refreshDetail()}
                    disabled={!filters.selectedSellerProductId || detailQuery.isFetching}
                  >
                    {detailQuery.isFetching ? "강제 새로고침 중..." : "강제 새로고침"}
                  </button>
                </div>
              ) : null
            }
          />
          {detailQuery.data ? (
            <ApiFreshnessCard
              fetchedAt={detailQuery.data.fetchedAt}
              cacheState={detailCacheState}
              servedFromCache={detailQuery.data.servedFromCache}
              isFetching={detailQuery.isFetching && Boolean(detailQuery.data)}
            />
          ) : null}
        </div>
      </div>

      <QuickActionDialog
        productName={selectedDetail?.sellerProductName ?? selectedRow?.sellerProductName ?? "상품"}
        options={quickOptions}
        state={quickActionState}
        isBusy={quickActionBusy}
        canEdit={canEditSelected}
        onClose={closeQuickAction}
        onToggleOption={toggleQuickOption}
        onToggleAll={toggleAllQuickOptions}
        onBulkDraftChange={(value) =>
          updateQuickAction((current) => ({
            ...current,
            bulkDraft: value,
            error: null,
          }))
        }
        onApplyBulk={applyQuickBulkDraft}
        onPriceChange={(optionKey, value) =>
          updateQuickAction((current) => ({
            ...current,
            priceDrafts: {
              ...current.priceDrafts,
              [optionKey]: value,
            },
            error: null,
          }))
        }
        onQuantityChange={(optionKey, value) =>
          updateQuickAction((current) => ({
            ...current,
            quantityDrafts: {
              ...current.quantityDrafts,
              [optionKey]: value,
            },
            error: null,
          }))
        }
        onSaleStatusChange={(value) =>
          updateQuickAction((current) => ({
            ...current,
            nextSaleStatus: value,
            error: null,
          }))
        }
        onSubmit={runQuickAction}
      />

      <ProductLibraryDrawer
        open={Boolean(libraryReference)}
        reference={libraryReference}
        onClose={() => setLibraryTargetSellerProductId(null)}
      />
    </div>
  );
}
