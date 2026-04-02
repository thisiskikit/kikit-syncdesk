import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useLocation } from "wouter";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import {
  NAVER_PRODUCT_LIST_DEFAULT_MAX_ITEMS,
  NAVER_PRODUCT_LIST_DEFAULT_PAGE,
  NAVER_PRODUCT_LIST_DEFAULT_SIZE,
  NAVER_PRODUCT_LIST_MAX_ITEMS_LIMIT,
  NAVER_PRODUCT_LIST_PAGE_SIZE_OPTIONS,
  type NaverBulkPricePreviewItem,
  type NaverBulkPricePreviewResponse,
  type NaverBulkPriceTarget,
  type NaverBulkPriceUpdateItemResult,
  type NaverBulkPriceUpdateResponse,
  type NaverProductListItem,
  type NaverProductOptionRow,
  type NaverProductListResponse,
  type NaverProductMemoUpdateResponse,
  type NaverPriceUpdatePreview,
  type NaverProductStatusDraftResponse,
} from "@shared/naver-products";
import { ApiFreshnessCard } from "@/components/api-freshness-card";
import { ProductLibraryDrawer } from "@/components/product-library-drawer";
import { useOperations } from "@/components/operation-provider";
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

interface StoresResponse {
  items: ChannelStoreSummary[];
}

type SortField =
  | "productName"
  | "salePrice"
  | "deliveryFee"
  | "stockQuantity"
  | "status"
  | "modifiedAt";
type SortDirection = "asc" | "desc";
type PriceDraftMap = Record<string, string>;
type ProductAction = "price" | "status" | "memo";
type NaverRecentFilters = {
  selectedStoreId: string;
  searchQuery: string;
  sortField: SortField;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
  maxItems: number;
  optionIndividualView: boolean;
};
type NaverDisplayRow =
  | {
      kind: "product";
      row: NaverProductListItem;
      preview: NaverPriceUpdatePreview | null;
      isExpanded: boolean;
    }
  | {
      kind: "option";
      key: string;
      parent: NaverProductListItem;
      preview: NaverPriceUpdatePreview;
      option: NaverProductOptionRow;
      optionIndex: number;
    };
type FeedbackState =
  | {
      type: "success" | "error";
      title: string;
      message: string;
    }
  | null;
type MenuAnchor = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const ACTION_MENU_OFFSET = 8;
const ACTION_MENU_PADDING = 12;
const NAVER_OPTION_PREVIEW_PREFETCH_LIMIT = 20;

const DEFAULT_NAVER_RECENT_FILTERS: NaverRecentFilters = {
  selectedStoreId: "",
  searchQuery: "",
  sortField: "modifiedAt",
  sortDirection: "desc",
  page: NAVER_PRODUCT_LIST_DEFAULT_PAGE,
  pageSize: NAVER_PRODUCT_LIST_DEFAULT_SIZE,
  maxItems: NAVER_PRODUCT_LIST_DEFAULT_MAX_ITEMS,
  optionIndividualView: false,
};

function clampPositiveInteger(value: number | string, fallback: number, max?: number) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.max(1, Math.floor(parsed));
  return typeof max === "number" ? Math.min(normalized, max) : normalized;
}

function buildProductsUrl(input: {
  storeId: string;
  page: number;
  size: number;
  maxItems: number;
}) {
  const params = new URLSearchParams({
    storeId: input.storeId,
    page: String(input.page),
    size: String(input.size),
    maxItems: String(input.maxItems),
  });

  return `/api/naver/products?${params.toString()}`;
}

function buildProductsQueryKey(storeId: string, page: number, size: number, maxItems: number) {
  return ["/api/naver/products", storeId, page, size, maxItems] as const;
}

function buildPricePreviewUrl(input: {
  storeId: string;
  originProductNo: string;
  channelProductNo: string | null;
}) {
  const params = new URLSearchParams({
    storeId: input.storeId,
    originProductNo: input.originProductNo,
  });

  if (input.channelProductNo) {
    params.set("channelProductNo", input.channelProductNo);
  }

  return `/api/naver/products/price-preview?${params.toString()}`;
}

function buildPricePreviewQueryKey(input: {
  storeId: string;
  originProductNo: string;
  channelProductNo: string | null;
}) {
  return [
    "/api/naver/products/price-preview",
    input.storeId,
    input.originProductNo,
    input.channelProductNo ?? "",
  ] as const;
}

function compareNullableNumbers(
  left: number | null | undefined,
  right: number | null | undefined,
) {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  return left - right;
}

function compareNullableStrings(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, "ko-KR");
}

function compareNullableDates(left: string | null, right: string | null) {
  const leftTime = left ? new Date(left).getTime() : Number.NaN;
  const rightTime = right ? new Date(right).getTime() : Number.NaN;

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
  if (Number.isNaN(leftTime)) return 1;
  if (Number.isNaN(rightTime)) return -1;
  return leftTime - rightTime;
}

function sortRows(rows: NaverProductListItem[], sortField: SortField, sortDirection: SortDirection) {
  const nextRows = [...rows];
  const direction = sortDirection === "asc" ? 1 : -1;

  nextRows.sort((left, right) => {
    let result = 0;

    if (sortField === "productName") {
      result = left.productName.localeCompare(right.productName, "ko-KR");
    } else if (sortField === "salePrice") {
      result = compareNullableNumbers(left.salePrice, right.salePrice);
    } else if (sortField === "deliveryFee") {
      result = compareNullableNumbers(left.deliveryFee, right.deliveryFee);
    } else if (sortField === "stockQuantity") {
      result = compareNullableNumbers(left.stockQuantity, right.stockQuantity);
    } else if (sortField === "status") {
      result = compareNullableStrings(left.saleStatusLabel, right.saleStatusLabel);
    } else if (sortField === "modifiedAt") {
      result = compareNullableDates(left.modifiedAt, right.modifiedAt);
    }

    if (result !== 0) {
      return result * direction;
    }

    return left.originProductNo.localeCompare(right.originProductNo) * direction;
  });

  return nextRows;
}

function normalizePriceInput(value: string) {
  return value.replaceAll(",", "").trim();
}

function parsePriceInput(value: string) {
  const normalized = normalizePriceInput(value);

  if (!normalized || !/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateRawPriceInput(rawValue: string, currentPrice: number | null) {
  const normalized = normalizePriceInput(rawValue);

  if (!normalized) return "새 가격을 입력해 주세요.";
  if (!/^\d+$/.test(normalized)) return "새 가격은 숫자만 입력해 주세요.";

  const nextPrice = Number(normalized);

  if (!Number.isInteger(nextPrice)) return "새 가격은 정수여야 합니다.";
  if (nextPrice <= 0) return "새 가격은 0보다 커야 합니다.";
  if (currentPrice !== null && nextPrice === currentPrice) {
    return "현재 가격과 같은 값은 반영할 수 없습니다.";
  }

  return null;
}

function validateCommonPriceInput(rawValue: string) {
  const normalized = normalizePriceInput(rawValue);

  if (!normalized) return "일괄 적용할 가격을 입력해 주세요.";
  if (!/^\d+$/.test(normalized)) return "일괄 적용 가격은 숫자만 입력해 주세요.";

  const nextPrice = Number(normalized);

  if (!Number.isInteger(nextPrice)) return "일괄 적용 가격은 정수여야 합니다.";
  if (nextPrice <= 0) return "일괄 적용 가격은 0보다 커야 합니다.";

  return null;
}

function buildTargetSignature(targets: NaverBulkPriceTarget[]) {
  return JSON.stringify(
    targets.map((target) => [target.rowId, target.originProductNo, target.channelProductNo, target.newPrice]),
  );
}

function formatComparison(currentPrice: number | null, newPrice: number | null) {
  if (currentPrice === null || newPrice === null) {
    return "-";
  }

  return `${formatNumber(currentPrice)} -> ${formatNumber(newPrice)}`;
}

function formatDeliveryFee(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  if (value <= 0) {
    return "무료";
  }

  return `${formatNumber(value)}원`;
}

function getPreviewStatusView(item: NaverBulkPricePreviewItem | null) {
  if (!item) return { label: "-", className: "" };
  if (item.status === "ready") return { label: "준비 완료", className: "success" };
  if (item.status === "invalid") return { label: "검증 필요", className: "pending" };
  return { label: "오류", className: "failed" };
}

function getResultStatusView(item: NaverBulkPriceUpdateItemResult | null) {
  if (!item) return { label: "-", className: "" };
  if (item.status === "succeeded") return { label: "성공", className: "success" };
  if (item.status === "skipped") return { label: "건너뜀", className: "pending" };
  return { label: "실패", className: "failed" };
}

function getMemoPreview(memo: string | null) {
  if (!memo) return "-";
  return memo.length > 28 ? `${memo.slice(0, 28)}...` : memo;
}

function getOptionUsableView(usable: boolean | null) {
  if (usable === true) {
    return { label: "사용", className: "success" };
  }

  if (usable === false) {
    return { label: "중지", className: "stopped" };
  }

  return { label: "미확인", className: "pending" };
}

function MemoDialog(props: {
  row: NaverProductListItem | null;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  isPending: boolean;
}) {
  if (!props.row) {
    return null;
  }

  return (
    <div className="csv-overlay" onMouseDown={props.onClose}>
      <div className="csv-dialog memo-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="stack" style={{ gap: "0.4rem" }}>
          <h3 style={{ margin: 0 }}>상품 메모</h3>
          <div>
            <strong>{props.row.productName}</strong>
          </div>
          <div className="muted">
            origin: {props.row.originProductNo} / channel: {props.row.channelProductNo ?? "-"}
          </div>
        </div>

        <textarea
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder="이 상품에 남길 메모를 입력해 주세요."
          rows={6}
        />

        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <div className="muted">빈 값으로 저장하면 메모가 삭제됩니다.</div>
          <div className="toolbar">
            <button className="button ghost" onClick={props.onClose} disabled={props.isPending}>
              닫기
            </button>
            <button className="button" onClick={props.onSave} disabled={props.isPending}>
              {props.isPending ? "저장 중.." : "메모 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NaverProductsPage() {
  const [, navigate] = useLocation();
  const { startLocalOperation, finishLocalOperation, removeLocalOperation, publishOperation } =
    useOperations();
  const {
    state: recentFilters,
    setState: setRecentFilters,
    isLoaded: isRecentFiltersLoaded,
  } = useServerMenuState("naver.products", DEFAULT_NAVER_RECENT_FILTERS);
  const hasAppliedRecentFiltersRef = useRef(false);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("modifiedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [priceDrafts, setPriceDrafts] = useState<PriceDraftMap>({});
  const [bulkApplyInput, setBulkApplyInput] = useState("");
  const [previewSignature, setPreviewSignature] = useState("");
  const [page, setPage] = useState(NAVER_PRODUCT_LIST_DEFAULT_PAGE);
  const [pageInput, setPageInput] = useState(String(NAVER_PRODUCT_LIST_DEFAULT_PAGE));
  const [pageSize, setPageSize] = useState(NAVER_PRODUCT_LIST_DEFAULT_SIZE);
  const [maxItems, setMaxItems] = useState(NAVER_PRODUCT_LIST_DEFAULT_MAX_ITEMS);
  const [maxItemsInput, setMaxItemsInput] = useState(String(NAVER_PRODUCT_LIST_DEFAULT_MAX_ITEMS));
  const [optionIndividualView, setOptionIndividualView] = useState(false);
  const [expandedRowIds, setExpandedRowIds] = useState<string[]>([]);
  const [optionPreviewLoadingKeys, setOptionPreviewLoadingKeys] = useState<string[]>([]);
  const [optionPreviewErrors, setOptionPreviewErrors] = useState<Record<string, string>>({});
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ProductAction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [memoTargetRowId, setMemoTargetRowId] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [pendingPriceFocusRowId, setPendingPriceFocusRowId] = useState<string | null>(null);
  const [pageFeedback, setPageFeedback] = useState<FeedbackState>(null);
  const priceCardRef = useRef<HTMLDivElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const productsQueryKey = buildProductsQueryKey(selectedStoreId, page, pageSize, maxItems);

  const storesQuery = useQuery({
    queryKey: ["/api/settings/stores"],
    queryFn: () => getJson<StoresResponse>("/api/settings/stores"),
    ...queryPresets.reference,
  });

  const naverStores = (storesQuery.data?.items || []).filter((store) => store.channel === "naver");

  useEffect(() => {
    if (!isRecentFiltersLoaded || hasAppliedRecentFiltersRef.current) {
      return;
    }

    hasAppliedRecentFiltersRef.current = true;
    setSelectedStoreId(recentFilters.selectedStoreId);
    setSearchQuery(recentFilters.searchQuery);
    setSortField(recentFilters.sortField);
    setSortDirection(recentFilters.sortDirection);
    setPage(recentFilters.page);
    setPageInput(String(recentFilters.page));
    setPageSize(recentFilters.pageSize);
    setMaxItems(recentFilters.maxItems);
    setMaxItemsInput(String(recentFilters.maxItems));
    setOptionIndividualView(recentFilters.optionIndividualView === true);
  }, [isRecentFiltersLoaded, recentFilters]);

  useEffect(() => {
    if (!hasAppliedRecentFiltersRef.current) {
      return;
    }

    setRecentFilters({
      selectedStoreId,
      searchQuery,
      sortField,
      sortDirection,
      page,
      pageSize,
      maxItems,
      optionIndividualView,
    });
  }, [
    maxItems,
    optionIndividualView,
    page,
    pageSize,
    searchQuery,
    selectedStoreId,
    setRecentFilters,
    sortDirection,
    sortField,
  ]);

  useEffect(() => {
    if (!hasAppliedRecentFiltersRef.current) {
      return;
    }

    if (selectedStoreId && naverStores.some((store) => store.id === selectedStoreId)) {
      return;
    }

    setSelectedStoreId(naverStores[0]?.id ?? "");
  }, [naverStores, selectedStoreId]);

  const productsQueryUrl = selectedStoreId
    ? buildProductsUrl({
        storeId: selectedStoreId,
        page,
        size: pageSize,
        maxItems,
      })
    : "";

  const loadProducts = (refresh = false) =>
    refresh
      ? getJsonWithRefresh<NaverProductListResponse>(productsQueryUrl)
      : getJson<NaverProductListResponse>(productsQueryUrl);

  const productsQuery = useQuery({
    queryKey: productsQueryKey,
    queryFn: () => loadProducts(),
    enabled: Boolean(selectedStoreId),
    ...queryPresets.listSnapshot,
  });
  const productsCacheState = getResponseCacheState(productsQuery.data);

  const refreshProducts = () =>
    refreshQueryData({
      queryKey: productsQueryKey,
      queryFn: () => getJsonWithRefresh<NaverProductListResponse>(productsQueryUrl),
      gcTime: queryPresets.listSnapshot.gcTime,
    });

  useEffect(() => {
    if (!selectedStoreId || !productsQuery.data || productsQuery.isFetching) {
      return;
    }

    if (!isStaleCachedResponse(productsQuery.data)) {
      return;
    }

    void refreshProducts();
  }, [productsQuery.data, productsQuery.isFetching, selectedStoreId]);

  useEffect(() => {
    const totalPages = productsQuery.data?.totalPages ?? null;

    if (!totalPages || page <= totalPages) {
      return;
    }

    setPage(totalPages);
    setPageInput(String(totalPages));
  }, [page, productsQuery.data?.totalPages]);

  const rows = productsQuery.data?.items || [];
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const selectedIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const expandedRowIdSet = useMemo(() => new Set(expandedRowIds), [expandedRowIds]);
  const optionPreviewLoadingSet = useMemo(
    () => new Set(optionPreviewLoadingKeys),
    [optionPreviewLoadingKeys],
  );

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    if (!trimmedQuery) return true;

    return (
      row.productName.toLowerCase().includes(trimmedQuery) ||
      row.originProductNo.toLowerCase().includes(trimmedQuery) ||
      (row.channelProductNo || "").toLowerCase().includes(trimmedQuery) ||
      (row.sellerBarcode || "").toLowerCase().includes(trimmedQuery)
    );
  });

  const visibleRows = useMemo(
    () => sortRows(filteredRows, sortField, sortDirection),
    [filteredRows, sortDirection, sortField],
  );
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIdSet.has(row.id)),
    [rows, selectedIdSet],
  );
  const memoTargetRow = memoTargetRowId ? rowsById.get(memoTargetRowId) ?? null : null;
  const libraryReference = memoTargetRow
    ? {
        channel: "naver" as const,
        storeId: memoTargetRow.storeId,
        channelProductId: memoTargetRow.originProductNo,
        secondaryChannelProductId: memoTargetRow.channelProductNo,
        storeName: memoTargetRow.storeName,
        productName: memoTargetRow.productName,
        sellerProductCode: memoTargetRow.sellerManagementCode,
      }
    : null;
  const getCachedOptionPreview = (row: NaverProductListItem) =>
    queryClient.getQueryData<NaverPriceUpdatePreview>(
      buildPricePreviewQueryKey({
        storeId: row.storeId,
        originProductNo: row.originProductNo,
        channelProductNo: row.channelProductNo,
      }),
    ) ?? null;

  const prefetchOptionPreview = (row: NaverProductListItem) =>
    queryClient.prefetchQuery({
      queryKey: buildPricePreviewQueryKey({
        storeId: row.storeId,
        originProductNo: row.originProductNo,
        channelProductNo: row.channelProductNo,
      }),
      queryFn: () =>
        getJson<NaverPriceUpdatePreview>(
          buildPricePreviewUrl({
            storeId: row.storeId,
            originProductNo: row.originProductNo,
            channelProductNo: row.channelProductNo,
          }),
        ),
      ...queryCachePresets.detail,
    });

  const previewTargetRows = useMemo(() => {
    const baseRows = optionIndividualView
      ? visibleRows.filter((row) => row.hasOptions)
      : visibleRows.filter((row) => expandedRowIdSet.has(row.id) && row.hasOptions);

    const visiblePrefetchRows = optionIndividualView
      ? baseRows
      : visibleRows.filter((row) => row.hasOptions).slice(0, NAVER_OPTION_PREVIEW_PREFETCH_LIMIT);
    const mergedRows = [...baseRows, ...visiblePrefetchRows];
    const dedupedRows = mergedRows.filter(
      (row, index) => mergedRows.findIndex((candidate) => candidate.id === row.id) === index,
    );

    return dedupedRows.filter(
      (row) =>
        !getCachedOptionPreview(row) &&
        !optionPreviewLoadingSet.has(row.id) &&
        !optionPreviewErrors[row.id],
    );
  }, [
    expandedRowIdSet,
    optionIndividualView,
    optionPreviewErrors,
    optionPreviewLoadingSet,
    visibleRows,
  ]);

  const displayRows = useMemo(() => {
    const nextRows: NaverDisplayRow[] = [];

    for (const row of visibleRows) {
      const preview = getCachedOptionPreview(row);
      const isExpanded = optionIndividualView || expandedRowIdSet.has(row.id);
      nextRows.push({
        kind: "product",
        row,
        preview,
        isExpanded,
      });

      if (!isExpanded || !preview?.optionRows.length) {
        continue;
      }

      preview.optionRows.forEach((option, optionIndex) => {
        nextRows.push({
          kind: "option",
          key: `${row.id}::${option.key}`,
          parent: row,
          preview,
          option,
          optionIndex,
        });
      });
    }

    return nextRows;
  }, [expandedRowIdSet, optionIndividualView, optionPreviewErrors, optionPreviewLoadingKeys, visibleRows]);

  useEffect(() => {
    setOptionPreviewLoadingKeys([]);
    setOptionPreviewErrors({});
    setExpandedRowIds([]);
  }, [selectedStoreId]);

  useEffect(() => {
    if (!previewTargetRows.length) {
      return;
    }

    let cancelled = false;
    const queue = [...previewTargetRows];
    const concurrency = Math.min(optionIndividualView ? 4 : 3, queue.length);

    const markLoading = (rowId: string) => {
      setOptionPreviewLoadingKeys((current) =>
        current.includes(rowId) ? current : [...current, rowId],
      );
    };

    const clearLoading = (rowId: string) => {
      setOptionPreviewLoadingKeys((current) => current.filter((value) => value !== rowId));
    };

    const worker = async () => {
      while (!cancelled) {
        const row = queue.shift();
        if (!row) {
          return;
        }

        markLoading(row.id);

        try {
          const preview = await prefetchOptionPreview(row).then(
            () =>
              queryClient.getQueryData<NaverPriceUpdatePreview>(
                buildPricePreviewQueryKey({
                  storeId: row.storeId,
                  originProductNo: row.originProductNo,
                  channelProductNo: row.channelProductNo,
                }),
              ) ?? null,
          );

          if (cancelled || !preview) {
            return;
          }
          setOptionPreviewErrors((current) => {
            if (!(row.id in current)) {
              return current;
            }

            const next = { ...current };
            delete next[row.id];
            return next;
          });
        } catch (error) {
          if (!cancelled) {
            setOptionPreviewErrors((current) => ({
              ...current,
              [row.id]:
                error instanceof Error ? error.message : "옵션 미리보기를 불러오지 못했습니다.",
            }));
          }
        } finally {
          if (!cancelled) {
            clearLoading(row.id);
          }
        }
      }
    };

    const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
    void Promise.all(workers);

    return () => {
      cancelled = true;
    };
  }, [optionIndividualView, previewTargetRows]);

  useEffect(() => {
    const validIdSet = new Set(rows.map((row) => row.id));
    setSelectedRowIds((current) => {
      const next = current.filter((rowId) => validIdSet.has(rowId));
      return next.length === current.length ? current : next;
    });
    setExpandedRowIds((current) => {
      const next = current.filter((rowId) => validIdSet.has(rowId));
      return next.length === current.length ? current : next;
    });
  }, [rows]);

  useEffect(() => {
    if (menuOpen && activeRowId && !rowsById.has(activeRowId)) {
      setMenuOpen(false);
      setAnchor(null);
      setMenuPosition(null);
      setActiveRowId(null);
      setActiveAction(null);
    }

    if (memoTargetRowId && !rowsById.has(memoTargetRowId)) {
      setMemoTargetRowId(null);
      setMemoDraft("");
      setActiveAction(null);
    }
  }, [activeRowId, menuOpen, memoTargetRowId, rowsById]);

  useEffect(() => {
    setPriceDrafts((current) => {
      let changed = false;
      const next = { ...current };

      for (const row of selectedRows) {
        if (next[row.id] === undefined) {
          next[row.id] = row.salePrice !== null ? String(row.salePrice) : "";
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [selectedRows]);

  const currentTargets = useMemo(
    () =>
      selectedRows.map((row) => ({
        rowId: row.id,
        originProductNo: row.originProductNo,
        channelProductNo: row.channelProductNo,
        newPrice: parsePriceInput(priceDrafts[row.id] ?? ""),
      })),
    [priceDrafts, selectedRows],
  );
  const currentSignature = useMemo(() => buildTargetSignature(currentTargets), [currentTargets]);

  const previewMutation = useMutation({
    mutationFn: async (targets: NaverBulkPriceTarget[]) =>
      apiRequestJson<NaverBulkPricePreviewResponse>("POST", "/api/naver/products/price-preview/bulk", {
        storeId: selectedStoreId,
        items: targets,
      }),
    onSuccess: (_data, targets) => {
      setPreviewSignature(buildTargetSignature(targets));
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (targets: NaverBulkPriceTarget[]) =>
      apiRequestJson<NaverBulkPriceUpdateResponse>("POST", "/api/naver/products/prices/bulk", {
        storeId: selectedStoreId,
        items: targets,
      }),
    onMutate: (targets) =>
      startLocalOperation({
        channel: "naver",
        actionName: "NAVER 대량 가격 반영",
        targetCount: targets.length,
      }),
    onSuccess: async (result, _targets, localToastId) => {
      setPreviewSignature("");
      setPageFeedback({
        type: "success",
        title: "가격 변경 반영 완료",
        message: "선택한 상품의 가격 변경 결과를 최신 목록으로 다시 불러왔습니다.",
      });
      if (result.operation) {
        publishOperation(result.operation);
      }
      if (localToastId) {
        finishLocalOperation(localToastId, {
          status:
            result.summary.failedCount > 0 || result.summary.skippedCount > 0
              ? "warning"
              : "success",
          summary: `성공 ${result.summary.succeededCount}건 / 실패 ${result.summary.failedCount}건`,
        });
        window.setTimeout(() => removeLocalOperation(localToastId), 800);
      }
      await refreshProducts();
    },
    onError: (error, _targets, localToastId) => {
      if (localToastId) {
        finishLocalOperation(localToastId, {
          status: "error",
          errorMessage: error instanceof Error ? error.message : "대량 반영에 실패했습니다.",
        });
      }
    },
  });

  const statusDraftMutation = useMutation({
    mutationFn: async (row: NaverProductListItem) =>
      apiRequestJson<NaverProductStatusDraftResponse>("POST", "/api/naver/products/status-draft", {
        storeId: row.storeId,
        originProductNo: row.originProductNo,
        channelProductNo: row.channelProductNo,
        productName: row.productName,
      }),
    onSuccess: (result) => {
      navigate(`/engine/drafts/${result.draftId}`);
    },
    onError: (error) => {
      setActiveAction(null);
      setPageFeedback({
        type: "error",
        title: "판매상태 작업창을 열지 못했습니다.",
        message: error instanceof Error ? error.message : "상태 Draft 생성에 실패했습니다.",
      });
    },
  });

  const memoMutation = useMutation({
    mutationFn: async (input: { storeId: string; originProductNo: string; productName: string; memo: string }) =>
      apiRequestJson<NaverProductMemoUpdateResponse>("PUT", "/api/naver/products/memo", input),
    onSuccess: (result, variables) => {
      queryClient.setQueryData<NaverProductListResponse>(productsQueryKey, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          items: current.items.map((item) =>
            item.storeId === variables.storeId && item.originProductNo === variables.originProductNo
              ? { ...item, memo: result.memo }
              : item,
          ),
        };
      });

      setMemoTargetRowId(null);
      setMemoDraft("");
      setActiveAction(null);
      setPageFeedback({
        type: "success",
        title: "메모를 저장했습니다.",
        message: result.memo ? "상품 메모가 저장되었습니다." : "상품 메모를 삭제했습니다.",
      });
    },
    onError: (error) => {
      setPageFeedback({
        type: "error",
        title: "메모 저장에 실패했습니다.",
        message: error instanceof Error ? error.message : "상품 메모 저장에 실패했습니다.",
      });
    },
  });

  const previewItemsByRowId = useMemo(
    () => new Map((previewMutation.data?.items || []).map((item) => [item.rowId, item])),
    [previewMutation.data],
  );
  const resultItemsByRowId = useMemo(
    () => new Map((bulkUpdateMutation.data?.items || []).map((item) => [item.rowId, item])),
    [bulkUpdateMutation.data],
  );

  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedIdSet.has(row.id));
  const isPreviewFresh =
    Boolean(previewMutation.data) && Boolean(currentTargets.length) && previewSignature === currentSignature;

  const failedTargets = useMemo(() => {
    return (bulkUpdateMutation.data?.items || [])
      .filter((item) => item.status === "failed")
      .map((item) => {
        const row = rowsById.get(item.rowId);
        if (!row) {
          return null;
        }

        return {
          rowId: row.id,
          originProductNo: row.originProductNo,
          channelProductNo: row.channelProductNo,
          newPrice: parsePriceInput(priceDrafts[row.id] ?? String(item.requestedPrice ?? "")),
        } satisfies NaverBulkPriceTarget;
      })
      .filter((item): item is NaverBulkPriceTarget => item !== null);
  }, [bulkUpdateMutation.data, priceDrafts, rowsById]);

  const closeActionMenu = (clearAction = true) => {
    setMenuOpen(false);
    setAnchor(null);
    setMenuPosition(null);
    setActiveRowId(null);

    if (clearAction) {
      setActiveAction(null);
    }
  };

  const closeMemoDialog = () => {
    if (memoMutation.isPending) {
      return;
    }

    setMemoTargetRowId(null);
    setMemoDraft("");
    setActiveAction(null);
  };

  const markActionsStale = () => {
    setPreviewSignature("");
    bulkUpdateMutation.reset();
  };

  const resetSelection = () => {
    setSelectedRowIds([]);
    setBulkApplyInput("");
    setPreviewSignature("");
    previewMutation.reset();
    bulkUpdateMutation.reset();
  };

  const toggleRowSelection = (rowId: string) => {
    setSelectedRowIds((current) => {
      const exists = current.includes(rowId);
      return exists ? current.filter((id) => id !== rowId) : [...current, rowId];
    });
    markActionsStale();
  };

  const selectOnlyRow = (row: NaverProductListItem) => {
    setSelectedRowIds([row.id]);
    setPriceDrafts((current) => ({
      ...current,
      [row.id]: row.salePrice !== null ? String(row.salePrice) : "",
    }));
    markActionsStale();
  };

  const toggleExpandedRow = (row: NaverProductListItem) => {
    if (!row.hasOptions) {
      return;
    }

    setOptionPreviewErrors((current) => {
      if (!(row.id in current)) {
        return current;
      }

      const next = { ...current };
      delete next[row.id];
      return next;
    });
    setExpandedRowIds((current) =>
      current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
    );
  };

  const handleProductRowClick = (row: NaverProductListItem) => {
    if (!row.hasOptions) {
      return;
    }

    toggleExpandedRow(row);
  };

  const buildMenuAnchor = (element: HTMLElement): MenuAnchor => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    };
  };

  const toggleVisibleRows = () => {
    if (!visibleRows.length) {
      return;
    }

    setSelectedRowIds((current) => {
      const currentSet = new Set(current);

      if (visibleRows.every((row) => currentSet.has(row.id))) {
        return current.filter((rowId) => !visibleRows.some((row) => row.id === rowId));
      }

      for (const row of visibleRows) {
        currentSet.add(row.id);
      }

      return rows.filter((row) => currentSet.has(row.id)).map((row) => row.id);
    });
    markActionsStale();
  };

  const updateRowDraft = (rowId: string, value: string) => {
    setPriceDrafts((current) => ({
      ...current,
      [rowId]: value,
    }));
    markActionsStale();
  };

  const openActionMenu = (element: HTMLElement, row: NaverProductListItem) => {
    if (statusDraftMutation.isPending || memoMutation.isPending) {
      return;
    }

    setPageFeedback(null);
    setActiveAction(null);
    setActiveRowId(row.id);
    const nextAnchor = buildMenuAnchor(element);
    setAnchor(nextAnchor);
    setMenuPosition({
      left: nextAnchor.right + ACTION_MENU_OFFSET,
      top: nextAnchor.bottom + ACTION_MENU_OFFSET,
    });
    setMenuOpen(true);
  };

  const renderActionMenuTrigger = (row: NaverProductListItem, label: string) => (
    <button
      type="button"
      className={`table-action-trigger${menuOpen && activeRowId === row.id ? " active" : ""}`}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={menuOpen && activeRowId === row.id}
      onClick={(event) => {
        event.stopPropagation();
        openActionMenu(event.currentTarget, row);
      }}
    >
      <MoreHorizontal size={16} aria-hidden="true" />
    </button>
  );

  const openPriceAction = (row: NaverProductListItem) => {
    setActiveAction("price");
    closeActionMenu(false);
    selectOnlyRow(row);
    setPendingPriceFocusRowId(row.id);
  };

  const openStatusDraftAction = (row: NaverProductListItem) => {
    setActiveAction("status");
    closeActionMenu(false);
    setPageFeedback(null);
    statusDraftMutation.mutate(row);
  };

  const openMemoAction = (row: NaverProductListItem) => {
    setActiveAction("memo");
    closeActionMenu(false);
    setMemoTargetRowId(row.id);
    setMemoDraft(row.memo ?? "");
  };

  const saveMemo = () => {
    if (!memoTargetRow) {
      return;
    }

    memoMutation.mutate({
      storeId: memoTargetRow.storeId,
      originProductNo: memoTargetRow.originProductNo,
      productName: memoTargetRow.productName,
      memo: memoDraft,
    });
  };

  const commonPriceValidationMessage = validateCommonPriceInput(bulkApplyInput);

  const applyBulkPriceToSelection = () => {
    if (!selectedRows.length || commonPriceValidationMessage) {
      return;
    }

    const nextValue = normalizePriceInput(bulkApplyInput);
    setPriceDrafts((current) => {
      const next = { ...current };
      for (const row of selectedRows) {
        next[row.id] = nextValue;
      }
      return next;
    });
    markActionsStale();
  };

  const runPreview = () => {
    if (!currentTargets.length || previewMutation.isPending) {
      return;
    }

    setPageFeedback(null);
    bulkUpdateMutation.reset();
    previewMutation.mutate(currentTargets);
  };

  const runBulkUpdate = (targets: NaverBulkPriceTarget[]) => {
    if (!targets.length || bulkUpdateMutation.isPending) {
      return;
    }

    setPageFeedback(null);
    bulkUpdateMutation.mutate(targets);
  };

  const retryFailedRows = () => {
    if (!failedTargets.length) {
      return;
    }

    setSelectedRowIds(failedTargets.map((item) => item.rowId));
    setPreviewSignature("");
    runBulkUpdate(failedTargets);
  };

  const totalPages = productsQuery.data?.totalPages ?? Math.max(1, Math.ceil(maxItems / pageSize));
  const currentPage = productsQuery.data?.page ?? page;
  const currentPageSize = productsQuery.data?.size ?? pageSize;
  const pageStartNumber = rows.length > 0 ? (currentPage - 1) * currentPageSize + 1 : 0;
  const pageEndNumber = pageStartNumber > 0 ? pageStartNumber + rows.length - 1 : 0;

  useEffect(() => {
    if (
      !selectedStoreId ||
      !productsQuery.data ||
      productsQuery.data.last ||
      productsQuery.isFetching
    ) {
      return;
    }

    const nextPage = currentPage + 1;
    const nextQueryKey = buildProductsQueryKey(selectedStoreId, nextPage, pageSize, maxItems);
    const nextQueryUrl = buildProductsUrl({
      storeId: selectedStoreId,
      page: nextPage,
      size: pageSize,
      maxItems,
    });
    const timer = window.setTimeout(() => {
      void queryClient.prefetchQuery({
        queryKey: nextQueryKey,
        queryFn: () => getJson<NaverProductListResponse>(nextQueryUrl),
        ...queryCachePresets.listSnapshot,
      });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    currentPage,
    maxItems,
    pageSize,
    productsQuery.data,
    productsQuery.isFetching,
    selectedStoreId,
  ]);

  const moveToPage = (nextPageValue: number) => {
    const nextPage = Math.min(
      clampPositiveInteger(nextPageValue, currentPage),
      Math.max(1, totalPages),
    );

    if (nextPage === page) {
      setPageInput(String(nextPage));
      return;
    }

    closeActionMenu();
    resetSelection();
    setPage(nextPage);
    setPageInput(String(nextPage));
  };

  const applyListControls = () => {
    const nextMaxItems = clampPositiveInteger(
      maxItemsInput,
      maxItems,
      NAVER_PRODUCT_LIST_MAX_ITEMS_LIMIT,
    );
    const nextPageLimit = Math.max(1, Math.ceil(nextMaxItems / pageSize));
    const nextPage = Math.min(clampPositiveInteger(pageInput, page), nextPageLimit);
    const hasChanges = nextMaxItems !== maxItems || nextPage !== page;

    setMaxItems(nextMaxItems);
    setMaxItemsInput(String(nextMaxItems));
    setPage(nextPage);
    setPageInput(String(nextPage));

    if (hasChanges) {
      closeActionMenu();
      resetSelection();
    }
  };

  const updatePageSize = (nextSizeValue: string) => {
    const nextSize = clampPositiveInteger(
      nextSizeValue,
      pageSize,
      Math.max(...NAVER_PRODUCT_LIST_PAGE_SIZE_OPTIONS),
    );

    if (nextSize === pageSize) {
      return;
    }

    closeActionMenu();
    resetSelection();
    setPageSize(nextSize);
    setPage(NAVER_PRODUCT_LIST_DEFAULT_PAGE);
    setPageInput(String(NAVER_PRODUCT_LIST_DEFAULT_PAGE));
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
      let left = anchor.right + ACTION_MENU_OFFSET;
      let top = anchor.bottom + ACTION_MENU_OFFSET;

      if (left + rect.width > window.innerWidth - ACTION_MENU_PADDING) {
        left = anchor.left - rect.width - ACTION_MENU_OFFSET;
      }

      if (top + rect.height > window.innerHeight - ACTION_MENU_PADDING) {
        top = anchor.top - rect.height - ACTION_MENU_OFFSET;
      }

      left = Math.min(
        Math.max(ACTION_MENU_PADDING, left),
        Math.max(ACTION_MENU_PADDING, window.innerWidth - rect.width - ACTION_MENU_PADDING),
      );
      top = Math.min(
        Math.max(ACTION_MENU_PADDING, top),
        Math.max(ACTION_MENU_PADDING, window.innerHeight - rect.height - ACTION_MENU_PADDING),
      );

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

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (memoTargetRowId) {
        closeMemoDialog();
        return;
      }

      if (menuOpen) {
        closeActionMenu();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [memoTargetRowId, menuOpen, memoMutation.isPending]);

  useEffect(() => {
    if (!pendingPriceFocusRowId) {
      return;
    }

    const input = priceInputRefs.current[pendingPriceFocusRowId];
    if (!input) {
      return;
    }

    priceCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    setPendingPriceFocusRowId(null);
    setActiveAction(null);
  }, [pendingPriceFocusRowId, selectedRows]);

  useEffect(() => {
    closeActionMenu();
  }, [selectedStoreId, searchQuery, sortField, sortDirection, page, pageSize, maxItems, optionIndividualView]);

  return (
    <div className="page">
      <div className="hero">
        <h1>네이버 상품 목록</h1>
        <p>상품 목록을 조회하고, 클릭한 상품 기준으로 가격 변경, 판매상태 작업, 자료실 관리를 바로 열 수 있습니다.</p>
      </div>

      <div className="card">
        <div className="toolbar">
          <select
            value={selectedStoreId}
            onChange={(event) => {
              setSelectedStoreId(event.target.value);
              setPriceDrafts({});
              setPage(NAVER_PRODUCT_LIST_DEFAULT_PAGE);
              setPageInput(String(NAVER_PRODUCT_LIST_DEFAULT_PAGE));
              setPageFeedback(null);
              resetSelection();
            }}
            disabled={!naverStores.length}
          >
            {naverStores.length ? (
              naverStores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.storeName}
                </option>
              ))
            ) : (
              <option value="">NAVER 스토어를 먼저 설정해 주세요.</option>
            )}
          </select>

          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="상품명 또는 상품번호 검색"
            style={{ flex: 1, minWidth: 260 }}
          />

          <select value={sortField} onChange={(event) => setSortField(event.target.value as SortField)}>
            <option value="productName">상품명</option>
            <option value="salePrice">판매가</option>
            <option value="deliveryFee">배송비</option>
            <option value="stockQuantity">재고</option>
            <option value="status">판매상태</option>
            <option value="modifiedAt">수정일</option>
          </select>

          <select
            value={sortDirection}
            onChange={(event) => setSortDirection(event.target.value as SortDirection)}
          >
            <option value="desc">내림차순</option>
            <option value="asc">오름차순</option>
          </select>

          <button
            className="button secondary"
            onClick={() => void refreshProducts()}
            disabled={!selectedStoreId || productsQuery.isFetching}
          >
            {productsQuery.isFetching ? "강제 새로고침 중.." : "강제 새로고침"}
          </button>
          <label className="table-mode-toggle">
            <input
              type="checkbox"
              checked={optionIndividualView}
              onChange={(event) => {
                setOptionPreviewErrors({});
                setOptionIndividualView(event.target.checked);
              }}
            />
            <span>옵션 개별보기</span>
          </label>
        </div>

        <div className="toolbar" style={{ marginTop: "0.75rem" }}>
          <span className="muted">최대 조회 수</span>
          <input
            inputMode="numeric"
            value={maxItemsInput}
            onChange={(event) => setMaxItemsInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyListControls();
              }
            }}
            placeholder="최대 조회 수"
            style={{ width: 140 }}
          />

          <span className="muted">페이지당</span>
          <select value={pageSize} onChange={(event) => updatePageSize(event.target.value)}>
            {NAVER_PRODUCT_LIST_PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {`${option}개`}
              </option>
            ))}
          </select>

          <span className="muted">페이지</span>
          <input
            inputMode="numeric"
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyListControls();
              }
            }}
            placeholder="페이지"
            style={{ width: 110 }}
          />

          <button className="button secondary" onClick={applyListControls} disabled={!selectedStoreId}>
            적용
          </button>
          <button
            className="button ghost"
            onClick={() => moveToPage(currentPage - 1)}
            disabled={!selectedStoreId || currentPage <= 1 || productsQuery.isFetching}
          >
            이전
          </button>
          <button
            className="button ghost"
            onClick={() => moveToPage(currentPage + 1)}
            disabled={!selectedStoreId || currentPage >= totalPages || productsQuery.isFetching}
          >
            다음
          </button>
          <div className="muted">
            {formatNumber(currentPage)} / {formatNumber(totalPages)}
          </div>
        </div>
      </div>

      {pageFeedback ? (
        <div className={`feedback${pageFeedback.type === "error" ? " error" : ""}`}>
          <strong>{pageFeedback.title}</strong>
          <div className="muted">{pageFeedback.message}</div>
        </div>
      ) : null}

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">불러온 건수</div>
          <div className="metric-value">{productsQuery.data?.loadedCount ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">검색 결과</div>
          <div className="metric-value">{visibleRows.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">선택한 상품</div>
          <div className="metric-value">{selectedRows.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">최근 새로고침</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatDate(productsQuery.data?.fetchedAt)}
          </div>
        </div>
      </div>

      {productsQuery.data ? (
        <div className="card">
          <div className="muted">
            {productsQuery.data.limitedByMaxItems ? (
              <>
                전체 {formatNumber(productsQuery.data.availableTotalElements)}건 중 최대{" "}
                {formatNumber(productsQuery.data.totalElements)}건 범위만 조회하고 있습니다.{" "}
              </>
            ) : (
              <>
                전체 {formatNumber(productsQuery.data.availableTotalElements)}건 기준으로 조회 중입니다.{" "}
              </>
            )}
            {pageStartNumber > 0 ? (
              <>
                {formatNumber(pageStartNumber)}-{formatNumber(pageEndNumber)}번 상품을 표시합니다.{" "}
              </>
            ) : (
              <>현재 페이지에 표시할 상품이 없습니다. </>
            )}
            페이지 {formatNumber(currentPage)} / {formatNumber(totalPages)}
          </div>
        </div>
      ) : null}

      {productsQuery.data ? (
        <ApiFreshnessCard
          fetchedAt={productsQuery.data.fetchedAt}
          cacheState={productsCacheState}
          servedFromCache={productsQuery.data.servedFromCache}
          isFetching={productsQuery.isFetching && Boolean(productsQuery.data)}
        />
      ) : null}

      <div className="card" style={{ position: "relative" }}>
        {!naverStores.length ? (
          <div className="empty">먼저 설정 탭에서 NAVER 스토어를 연결해 주세요.</div>
        ) : productsQuery.isLoading ? (
          <div className="empty">네이버 상품 목록을 불러오는 중입니다.</div>
        ) : productsQuery.error ? (
          <div className="empty">{(productsQuery.error as Error).message}</div>
        ) : visibleRows.length === 0 ? (
          <div className="empty">
            {rows.length === 0 ? "네이버 상품이 없습니다." : "검색 조건에 맞는 상품이 없습니다."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleRows} />
                  </th>
                  <th>상품명</th>
                  <th>상품번호</th>
                  <th>판매상태</th>
                  <th>가격 / 배송비</th>
                  <th>재고</th>
                  <th>옵션 여부</th>
                  <th>메모</th>
                  <th>수정일</th>
                  <th>등록일</th>
                  <th className="table-action-column">액션</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((displayRow) => {
                  if (displayRow.kind === "option") {
                    const usableView = getOptionUsableView(displayRow.option.usable);

                    return (
                      <tr
                        key={displayRow.key}
                        className={[
                          selectedIdSet.has(displayRow.parent.id) ? "table-row-selected" : "",
                          "table-row-child",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <td />
                        <td>
                          <div className="table-subrow-label">
                            <div className="table-row-heading">
                              <strong>{displayRow.option.label}</strong>
                              <span className="status-pill draft">옵션 행</span>
                            </div>
                            <div className="muted">
                              {displayRow.option.attributeSummary ?? `${displayRow.optionIndex + 1}번째 옵션`}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div>origin: {displayRow.parent.originProductNo}</div>
                          <div className="muted">code: {displayRow.option.sellerManagementCode ?? "-"}</div>
                        </td>
                        <td>
                          <div className={`status-pill ${usableView.className}`}>{usableView.label}</div>
                          <div className="muted">{displayRow.preview.optionType}</div>
                        </td>
                        <td>
                          <div>{displayRow.option.price !== null ? formatNumber(displayRow.option.price) : "-"}</div>
                          <div className="muted">기본가 {formatNumber(displayRow.parent.salePrice)}</div>
                          <div className="muted">배송비: {formatDeliveryFee(displayRow.parent.deliveryFee)}</div>
                        </td>
                        <td>{formatNumber(displayRow.option.stockQuantity)}</td>
                        <td>
                          <span className="status-pill pending">옵션 행</span>
                        </td>
                        <td>
                          <div className="memo-preview">
                            {displayRow.option.attributeSummary ?? displayRow.option.sellerManagementCode ?? "-"}
                          </div>
                        </td>
                        <td>{formatDate(displayRow.parent.modifiedAt)}</td>
                        <td>{formatDate(displayRow.parent.createdAt)}</td>
                        <td className="table-action-cell" onClick={(event) => event.stopPropagation()}>
                          {renderActionMenuTrigger(
                            displayRow.parent,
                            `${displayRow.parent.productName} 옵션 액션 메뉴 열기`,
                          )}
                        </td>
                      </tr>
                    );
                  }

                  const previewError = optionPreviewErrors[displayRow.row.id] ?? null;
                  const optionCount = displayRow.preview?.optionRows.length ?? 0;

                  return (
                    <tr
                      key={displayRow.row.id}
                      className={[
                        selectedIdSet.has(displayRow.row.id) ? "table-row-selected" : "",
                        menuOpen && activeRowId === displayRow.row.id ? "table-row-action-active" : "",
                        displayRow.isExpanded ? "table-row-parent-expanded" : "",
                        displayRow.row.hasOptions ? "table-row-expandable" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onMouseEnter={() => {
                        if (displayRow.row.hasOptions) {
                          void prefetchOptionPreview(displayRow.row);
                        }
                      }}
                      onClick={() => handleProductRowClick(displayRow.row)}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIdSet.has(displayRow.row.id)}
                          onChange={() => toggleRowSelection(displayRow.row.id)}
                        />
                      </td>
                      <td>
                        <div className="table-row-heading">
                          <strong>{displayRow.row.productName}</strong>
                          {displayRow.row.hasOptions ? (
                            <span className="status-pill draft">옵션 상품</span>
                          ) : displayRow.row.hasOptions === false ? (
                            <span className="status-pill success">단일 상품</span>
                          ) : null}
                        </div>
                        <div className="muted">{displayRow.row.storeName}</div>
                        {displayRow.row.hasOptions ? (
                          <div className="table-row-hint">
                            {optionPreviewLoadingSet.has(displayRow.row.id)
                              ? "옵션 행을 불러오는 중입니다."
                              : previewError
                                ? "옵션 행을 불러오지 못했습니다."
                                : optionCount > 0
                                  ? `${optionCount}개 옵션 행 준비됨`
                                  : optionIndividualView || displayRow.isExpanded
                                    ? "옵션 정보가 아직 없습니다."
                                    : "클릭하면 옵션 행이 펼쳐집니다."}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div>origin: {displayRow.row.originProductNo}</div>
                        <div className="muted">channel: {displayRow.row.channelProductNo ?? "-"}</div>
                        <div className="muted">barcode: {displayRow.row.sellerBarcode ?? "-"}</div>
                      </td>
                      <td>
                        <div className={`status-pill ${displayRow.row.saleStatusCode?.toLowerCase() ?? ""}`}>
                          {displayRow.row.saleStatusLabel}
                        </div>
                        <div className="muted">{displayRow.row.displayStatusLabel ?? "-"}</div>
                      </td>
                      <td>
                        <div>{formatNumber(displayRow.row.salePrice)}</div>
                        <div className="muted">discount: {formatNumber(displayRow.row.discountedPrice)}</div>
                        <div className="muted">배송비: {formatDeliveryFee(displayRow.row.deliveryFee)}</div>
                      </td>
                      <td>{formatNumber(displayRow.row.stockQuantity)}</td>
                      <td>
                        {displayRow.row.hasOptions === null ? (
                          "-"
                        ) : displayRow.row.hasOptions ? (
                          <span className="status-pill draft">
                            {optionIndividualView
                              ? `옵션 ${optionCount || "..."}개`
                              : displayRow.isExpanded
                                ? "옵션 펼침"
                                : "옵션 상품"}
                          </span>
                        ) : (
                          <span className="status-pill success">단일 상품</span>
                        )}
                      </td>
                      <td>
                        <div className="memo-preview">{getMemoPreview(displayRow.row.memo)}</div>
                      </td>
                      <td>{formatDate(displayRow.row.modifiedAt)}</td>
                      <td>{formatDate(displayRow.row.createdAt)}</td>
                      <td className="table-action-cell" onClick={(event) => event.stopPropagation()}>
                        {renderActionMenuTrigger(displayRow.row, `${displayRow.row.productName} 액션 메뉴 열기`)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {menuOpen && activeRowId && menuPosition ? (
          <div
            ref={actionMenuRef}
            className="product-action-menu"
            style={{ left: menuPosition.left, top: menuPosition.top }}
            role="menu"
          >
            <button
              type="button"
              className="product-action-button"
              role="menuitem"
              onClick={() => {
                const row = rowsById.get(activeRowId);
                if (row) {
                  openPriceAction(row);
                }
              }}
            >
              가격 변경
            </button>
            <button
              type="button"
              className="product-action-button"
              role="menuitem"
              onClick={() => {
                const row = rowsById.get(activeRowId);
                if (row) {
                  openStatusDraftAction(row);
                }
              }}
              disabled={statusDraftMutation.isPending}
            >
              {statusDraftMutation.isPending && activeAction === "status" ? "생성 중.." : "판매상태"}
            </button>
            <button
              type="button"
              className="product-action-button"
              role="menuitem"
              onClick={() => {
                const row = rowsById.get(activeRowId);
                if (row) {
                  openMemoAction(row);
                }
              }}
            >
              자료실
            </button>
          </div>
        ) : null}
      </div>

      {selectedRows.length ? (
        <div ref={priceCardRef} className="card">
          <div className="stack">
            <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div className="stack" style={{ gap: "0.35rem" }}>
                <h3 style={{ margin: 0 }}>대량 가격 수정</h3>
                <div className="muted">
                  선택 상품 {selectedRows.length}건에 대해 개별 가격 입력 또는 동일 값 일괄 적용이 가능합니다.
                </div>
              </div>
              <div className="toolbar">
                <button className="button ghost" onClick={toggleVisibleRows}>
                  {allVisibleSelected ? "보이는 항목 해제" : "보이는 항목 전체 선택"}
                </button>
                <button className="button ghost" onClick={resetSelection}>
                  선택 해제
                </button>
              </div>
            </div>

            <div className="toolbar">
              <input
                inputMode="numeric"
                value={bulkApplyInput}
                onChange={(event) => setBulkApplyInput(event.target.value)}
                placeholder="선택 항목에 동일 가격 적용"
                style={{ minWidth: 220 }}
              />
              <button
                className="button secondary"
                onClick={applyBulkPriceToSelection}
                disabled={!selectedRows.length || Boolean(commonPriceValidationMessage)}
              >
                동일 값 일괄 적용
              </button>
              <button
                className="button secondary"
                onClick={runPreview}
                disabled={!selectedRows.length || previewMutation.isPending || bulkUpdateMutation.isPending}
              >
                {previewMutation.isPending ? "미리보기 확인 중.." : "변경 미리보기"}
              </button>
              <button
                className="button"
                onClick={() => runBulkUpdate(currentTargets)}
                disabled={
                  !selectedRows.length ||
                  !isPreviewFresh ||
                  previewMutation.isPending ||
                  bulkUpdateMutation.isPending
                }
              >
                {bulkUpdateMutation.isPending ? "반영 중.." : "대량 반영"}
              </button>
              <button
                className="button ghost"
                onClick={retryFailedRows}
                disabled={!failedTargets.length || bulkUpdateMutation.isPending}
              >
                실패 항목 다시 시도
              </button>
            </div>

            {commonPriceValidationMessage ? (
              <div className="feedback error">
                <strong>일괄 적용 검증</strong>
                <div className="muted">{commonPriceValidationMessage}</div>
              </div>
            ) : null}

            {!isPreviewFresh && previewMutation.data ? (
              <div className="feedback">
                <strong>미리보기 갱신 필요</strong>
                <div className="muted">
                  선택 항목 또는 입력 가격이 바뀌었습니다. 반영 전에 변경 미리보기를 다시 확인해 주세요.
                </div>
              </div>
            ) : null}

            {previewMutation.error ? (
              <div className="feedback error">
                <strong>미리보기 실패</strong>
                <div className="muted">{(previewMutation.error as Error).message}</div>
              </div>
            ) : null}

            {bulkUpdateMutation.error ? (
              <div className="feedback error">
                <strong>대량 반영 실패</strong>
                <div className="muted">{(bulkUpdateMutation.error as Error).message}</div>
              </div>
            ) : null}

            {previewMutation.data ? (
              <div className="metric-grid">
                <div className="metric">
                  <div className="metric-label">미리보기 준비</div>
                  <div className="metric-value">{previewMutation.data.summary.readyCount}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">검증 필요</div>
                  <div className="metric-value">{previewMutation.data.summary.invalidCount}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">미리보기 오류</div>
                  <div className="metric-value">{previewMutation.data.summary.errorCount}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">미리보기 시각</div>
                  <div className="metric-value" style={{ fontSize: "1rem" }}>
                    {formatDate(previewMutation.data.previewedAt)}
                  </div>
                </div>
              </div>
            ) : null}

            {bulkUpdateMutation.data ? (
              <div className="metric-grid">
                <div className="metric">
                  <div className="metric-label">반영 성공</div>
                  <div className="metric-value">{bulkUpdateMutation.data.summary.succeededCount}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">반영 실패</div>
                  <div className="metric-value">{bulkUpdateMutation.data.summary.failedCount}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">건너뜀</div>
                  <div className="metric-value">{bulkUpdateMutation.data.summary.skippedCount}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">반영 완료 시각</div>
                  <div className="metric-value" style={{ fontSize: "1rem" }}>
                    {formatDate(bulkUpdateMutation.data.completedAt)}
                  </div>
                </div>
              </div>
            ) : null}

            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>상품명</th>
                    <th>상품번호</th>
                    <th>현재 가격</th>
                    <th>새 가격</th>
                    <th>변경 비교</th>
                    <th>입력 검증</th>
                    <th>미리보기</th>
                    <th>실행 결과</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((row) => {
                    const rawDraft = priceDrafts[row.id] ?? "";
                    const parsedDraft = parsePriceInput(rawDraft);
                    const localValidationMessage = validateRawPriceInput(rawDraft, row.salePrice);
                    const previewItem = previewItemsByRowId.get(row.id) ?? null;
                    const previewStatusView = getPreviewStatusView(previewItem);
                    const resultItem = resultItemsByRowId.get(row.id) ?? null;
                    const resultStatusView = getResultStatusView(resultItem);

                    return (
                      <tr key={row.id} className={selectedIdSet.has(row.id) ? "table-row-selected" : ""}>
                        <td>
                          <div>
                            <strong>{row.productName}</strong>
                          </div>
                          <div className="muted">{row.hasOptions ? "옵션 상품" : "단일 상품"}</div>
                        </td>
                        <td>
                          <div>origin: {row.originProductNo}</div>
                          <div className="muted">channel: {row.channelProductNo ?? "-"}</div>
                          <div className="muted">barcode: {row.sellerBarcode ?? "-"}</div>
                        </td>
                        <td>{formatNumber(row.salePrice)}</td>
                        <td>
                          <input
                            ref={(element) => {
                              priceInputRefs.current[row.id] = element;
                            }}
                            inputMode="numeric"
                            value={rawDraft}
                            onChange={(event) => updateRowDraft(row.id, event.target.value)}
                            placeholder="새 가격 입력"
                            style={{ minWidth: 140 }}
                          />
                        </td>
                        <td>{formatComparison(row.salePrice, parsedDraft)}</td>
                        <td>
                          {localValidationMessage ? (
                            <div className="muted">{localValidationMessage}</div>
                          ) : (
                            <div className="muted">실행 가능</div>
                          )}
                        </td>
                        <td>
                          <div className={`status-pill ${previewStatusView.className}`}>
                            {previewStatusView.label}
                          </div>
                          <div className="muted">
                            {previewItem?.validationMessage ?? previewItem?.optionHandlingMessage ?? "-"}
                          </div>
                        </td>
                        <td>
                          <div className={`status-pill ${resultStatusView.className}`}>
                            {resultStatusView.label}
                          </div>
                          <div className="muted">{resultItem?.message ?? "-"}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <ProductLibraryDrawer
        open={Boolean(libraryReference)}
        reference={libraryReference}
        onClose={closeMemoDialog}
        onRecordChanged={(record) => {
          queryClient.setQueryData<NaverProductListResponse>(productsQueryKey, (current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              items: current.items.map((item) =>
                item.storeId === record.storeId && item.originProductNo === record.channelProductId
                  ? { ...item, memo: record.memo || null }
                  : item,
              ),
            };
          });
        }}
      />
    </div>
  );
}
