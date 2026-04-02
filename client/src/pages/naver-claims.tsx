import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import {
  NAVER_CLAIM_MAX_ITEMS,
  NAVER_CLAIM_PAGE_SIZE_OPTIONS,
  type NaverClaimActionKey,
  type NaverClaimActionResponse,
  type NaverClaimListResponse,
  type NaverClaimRow,
  type NaverClaimType,
  type NaverHoldExchangeTarget,
  type NaverHoldReturnTarget,
  type NaverRedeliverExchangeTarget,
  type NaverRejectExchangeTarget,
  type NaverRejectReturnTarget,
} from "@shared/naver-claims";
import { ApiFreshnessCard } from "@/components/api-freshness-card";
import { StatusBadge } from "@/components/status-badge";
import { useOperations } from "@/components/operation-provider";
import { getResponseCacheState, isStaleCachedResponse } from "@/lib/freshness";
import {
  apiRequestJson,
  getJson,
  getJsonWithRefresh,
  queryPresets,
  refreshQueryData,
} from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate, formatNumber } from "@/lib/utils";

interface StoresResponse {
  items: ChannelStoreSummary[];
}

type FilterState = {
  selectedStoreId: string;
  lastChangedFrom: string;
  lastChangedTo: string;
  status: string;
  query: string;
  maxItems: number;
  activeTab: NaverClaimType;
};

type ClaimDraft = {
  holdbackClassType: string;
  holdbackReason: string;
  holdbackReturnDetailReason: string;
  extraReturnFeeAmount: string;
  rejectReturnReason: string;
  holdbackExchangeDetailReason: string;
  extraExchangeFeeAmount: string;
  rejectExchangeReason: string;
  reDeliveryMethod: string;
  reDeliveryCompany: string;
  reDeliveryTrackingNumber: string;
};

type ClaimDraftMap = Record<string, ClaimDraft>;

type FeedbackState =
  | {
      type: "success" | "warning" | "error";
      title: string;
      message: string;
      details: string[];
    }
  | null;

function defaultDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
  lastChangedFrom: defaultDate(-6),
  lastChangedTo: defaultDate(0),
  status: "",
  query: "",
  maxItems: 60,
  activeTab: "cancel",
};

const TABS: Array<{ key: NaverClaimType; label: string }> = [
  { key: "cancel", label: "취소" },
  { key: "return", label: "반품" },
  { key: "exchange", label: "교환" },
];

const HOLDBACK_CLASS_OPTIONS = [
  { value: "SELLER_CONFIRM_NEED", label: "판매자 확인 필요" },
  { value: "SELLER_REMIT", label: "판매자 직접 송금" },
];

const RETURN_HOLDBACK_REASON_OPTIONS = [
  { value: "RETURN_DELIVERYFEE", label: "반품 배송비 청구" },
  { value: "RETURN_DELIVERYFEE_AND_EXTRAFEEE", label: "반품 배송비 + 추가 비용 청구" },
  { value: "RETURN_PRODUCT_NOT_DELIVERED", label: "반품 상품 미입고" },
];

const EXCHANGE_HOLDBACK_REASON_OPTIONS = [
  { value: "RETURN_DELIVERYFEE", label: "반품 배송비 청구" },
  { value: "RETURN_DELIVERYFEE_AND_EXTRAFEEE", label: "반품 배송비 + 추가 비용 청구" },
  { value: "RETURN_PRODUCT_NOT_DELIVERED", label: "반품 상품 미입고" },
  { value: "EXCHANGE_DELIVERYFEE", label: "교환 배송비 청구" },
  { value: "EXCHANGE_EXTRAFEE", label: "추가 교환 비용 청구" },
  { value: "EXCHANGE_PRODUCT_READY", label: "교환 상품 준비 중" },
  { value: "EXCHANGE_PRODUCT_NOT_DELIVERED", label: "교환 상품 미입고" },
  { value: "EXCHANGE_HOLDBACK", label: "교환 구매 확정 보류" },
];

const REDELIVERY_METHOD_OPTIONS = [
  { value: "DELIVERY", label: "택배" },
  { value: "DIRECT_DELIVERY", label: "직접 전달" },
  { value: "RETURN_DESIGNATED", label: "지정 반품 택배" },
  { value: "RETURN_DELIVERY", label: "일반 반품 택배" },
  { value: "RETURN_INDIVIDUAL", label: "직접 반송" },
  { value: "RETURN_MERCHANT", label: "판매자 직접 수거" },
];

function buildClaimsUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    lastChangedFrom: filters.lastChangedFrom,
    lastChangedTo: filters.lastChangedTo,
    claimType: filters.activeTab,
    maxItems: String(filters.maxItems),
  });

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }

  return `/api/naver/claims?${params.toString()}`;
}

function buildInitialDraft(row: NaverClaimRow): ClaimDraft {
  return {
    holdbackClassType: "SELLER_CONFIRM_NEED",
    holdbackReason:
      row.claimType === "exchange" ? "EXCHANGE_PRODUCT_READY" : "RETURN_PRODUCT_NOT_DELIVERED",
    holdbackReturnDetailReason: "",
    extraReturnFeeAmount: "0",
    rejectReturnReason: "",
    holdbackExchangeDetailReason: "",
    extraExchangeFeeAmount: "0",
    rejectExchangeReason: "",
    reDeliveryMethod: "DELIVERY",
    reDeliveryCompany: "",
    reDeliveryTrackingNumber: "",
  };
}

function formatPerson(row: NaverClaimRow) {
  if (row.buyerName && row.receiverName) {
    return `${row.buyerName} / ${row.receiverName}`;
  }

  return row.receiverName ?? row.buyerName ?? "-";
}

function buildActionSummary(result: NaverClaimActionResponse) {
  return `성공 ${result.summary.succeededCount}건 / 실패 ${result.summary.failedCount}건 / 건너뜀 ${result.summary.skippedCount}건`;
}

function buildFailureDetails(result: NaverClaimActionResponse) {
  return result.items
    .filter((item) => item.status !== "succeeded")
    .slice(0, 6)
    .map((item) => `${item.productOrderId}: ${item.message}`);
}

function normalizeSelectedRows(rows: NaverClaimRow[], ids: string[]) {
  const idSet = new Set(ids);
  return rows.filter((row) => idSet.has(row.id));
}

export default function NaverClaimsPage() {
  const {
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
    publishOperation,
  } = useOperations();
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "naver.claims",
    DEFAULT_FILTERS,
  );
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<ClaimDraftMap>({});
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const claimsQueryKey = [
    "/api/naver/claims",
    filters.selectedStoreId,
    filters.lastChangedFrom,
    filters.lastChangedTo,
    filters.activeTab,
    filters.status,
    filters.query,
    filters.maxItems,
  ] as const;
  const claimsQueryUrl = buildClaimsUrl(filters);

  const storesQuery = useQuery({
    queryKey: ["/api/settings/stores"],
    queryFn: () => getJson<StoresResponse>("/api/settings/stores"),
    ...queryPresets.reference,
  });

  const stores = (storesQuery.data?.items || []).filter((store) => store.channel === "naver");

  useEffect(() => {
    if (!isFiltersLoaded || filters.selectedStoreId || !stores[0]) {
      return;
    }

    setFilters((current) => ({
      ...current,
      selectedStoreId: stores[0].id,
    }));
  }, [filters.selectedStoreId, isFiltersLoaded, setFilters, stores]);

  const claimsQuery = useQuery({
    queryKey: claimsQueryKey,
    queryFn: () => getJson<NaverClaimListResponse>(claimsQueryUrl),
    enabled:
      Boolean(filters.selectedStoreId) &&
      Boolean(filters.lastChangedFrom) &&
      Boolean(filters.lastChangedTo),
    ...queryPresets.listSnapshot,
  });
  const refreshClaims = () =>
    refreshQueryData({
      queryKey: claimsQueryKey,
      queryFn: () => getJsonWithRefresh<NaverClaimListResponse>(claimsQueryUrl),
      gcTime: queryPresets.listSnapshot.gcTime,
    });
  const claimsCacheState = getResponseCacheState(claimsQuery.data);

  useEffect(() => {
    if (!claimsQuery.data || claimsQuery.isFetching) {
      return;
    }

    if (!isStaleCachedResponse(claimsQuery.data)) {
      return;
    }

    void refreshClaims();
  }, [claimsQuery.data, claimsQuery.isFetching]);

  const rows = claimsQuery.data?.items || [];
  const selectedRows = useMemo(
    () => normalizeSelectedRows(rows, selectedRowIds),
    [rows, selectedRowIds],
  );
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedRowIds.includes(row.id));
  const availableStatuses = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.claimStatus).filter(Boolean) as string[])).sort(),
    [rows],
  );

  useEffect(() => {
    setSelectedRowIds((current) => current.filter((id) => rows.some((row) => row.id === id)));
  }, [rows]);

  useEffect(() => {
    setDrafts((current) => {
      const next: ClaimDraftMap = {};
      let changed = false;

      for (const row of rows) {
        next[row.id] = current[row.id] ?? buildInitialDraft(row);
        if (!current[row.id]) {
          changed = true;
        }
      }

      if (!changed && Object.keys(current).length === Object.keys(next).length) {
        return current;
      }

      return next;
    });
  }, [rows]);

  const setDraftValue = (rowId: string, key: keyof ClaimDraft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [rowId]: {
        ...(current[rowId] ?? buildInitialDraft(rows.find((row) => row.id === rowId)!)),
        [key]: value,
      },
    }));
  };

  const toggleRowSelection = (rowId: string) => {
    setSelectedRowIds((current) =>
      current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId],
    );
  };

  const toggleVisibleRows = () => {
    setSelectedRowIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !rows.some((row) => row.id === id));
      }

      const next = new Set(current);
      for (const row of rows) {
        next.add(row.id);
      }
      return Array.from(next);
    });
  };

  async function executeAction<TItem extends { productOrderId: string }>(input: {
    actionName: string;
    url: string;
    items: TItem[];
    successTitle: string;
    failureTitle: string;
  }) {
    if (!input.items.length) {
      setFeedback({
        type: "error",
        title: input.failureTitle,
        message: "실행할 항목이 없습니다.",
        details: [],
      });
      return;
    }

    const localToastId = startLocalOperation({
      channel: "naver",
      actionName: input.actionName,
      targetCount: input.items.length,
    });

    setPendingAction(input.actionName);
    setFeedback(null);

    try {
      const result = await apiRequestJson<NaverClaimActionResponse>("POST", input.url, {
        storeId: filters.selectedStoreId,
        items: input.items,
      });

      const summary = buildActionSummary(result);
      const details = buildFailureDetails(result);

      setFeedback({
        type:
          result.summary.failedCount > 0 || result.summary.skippedCount > 0
            ? "warning"
            : "success",
        title: input.successTitle,
        message: summary,
        details,
      });

      if (result.operation) {
        publishOperation(result.operation);
      }

      finishLocalOperation(localToastId, {
        status:
          result.summary.failedCount > 0 || result.summary.skippedCount > 0
            ? "warning"
            : "success",
        summary,
      });
      window.setTimeout(() => removeLocalOperation(localToastId), 1_200);
      await refreshClaims();
    } catch (error) {
      const message = error instanceof Error ? error.message : "클레임 작업에 실패했습니다.";
      setFeedback({
        type: "error",
        title: input.failureTitle,
        message,
        details: [],
      });
      finishLocalOperation(localToastId, {
        status: "error",
        errorMessage: message,
      });
    } finally {
      setPendingAction(null);
    }
  }

  function buildHoldReturnItems(targetRows: NaverClaimRow[]) {
    const items: NaverHoldReturnTarget[] = [];
    const errors: string[] = [];

    for (const row of targetRows) {
      const draft = drafts[row.id] ?? buildInitialDraft(row);
      if (!draft.holdbackReturnDetailReason.trim()) {
        errors.push(`${row.productOrderId}: 반품 보류 상세 사유를 입력해 주세요.`);
        continue;
      }

      items.push({
        productOrderId: row.productOrderId,
        claimId: row.claimId,
        orderId: row.orderId,
        productName: row.productName,
        holdbackClassType: draft.holdbackClassType,
        holdbackReason: draft.holdbackReason,
        holdbackReturnDetailReason: draft.holdbackReturnDetailReason.trim(),
        extraReturnFeeAmount: Number(draft.extraReturnFeeAmount || 0),
      });
    }

    return { items, errors };
  }

  function buildRejectReturnItems(targetRows: NaverClaimRow[]) {
    const items: NaverRejectReturnTarget[] = [];
    const errors: string[] = [];

    for (const row of targetRows) {
      const draft = drafts[row.id] ?? buildInitialDraft(row);
      if (!draft.rejectReturnReason.trim()) {
        errors.push(`${row.productOrderId}: 반품 거부 사유를 입력해 주세요.`);
        continue;
      }

      items.push({
        productOrderId: row.productOrderId,
        claimId: row.claimId,
        orderId: row.orderId,
        productName: row.productName,
        rejectReturnReason: draft.rejectReturnReason.trim(),
      });
    }

    return { items, errors };
  }

  function buildHoldExchangeItems(targetRows: NaverClaimRow[]) {
    const items: NaverHoldExchangeTarget[] = [];
    const errors: string[] = [];

    for (const row of targetRows) {
      const draft = drafts[row.id] ?? buildInitialDraft(row);
      if (!draft.holdbackExchangeDetailReason.trim()) {
        errors.push(`${row.productOrderId}: 교환 보류 상세 사유를 입력해 주세요.`);
        continue;
      }

      items.push({
        productOrderId: row.productOrderId,
        claimId: row.claimId,
        orderId: row.orderId,
        productName: row.productName,
        holdbackClassType: draft.holdbackClassType,
        holdbackReason: draft.holdbackReason,
        holdbackExchangeDetailReason: draft.holdbackExchangeDetailReason.trim(),
        extraExchangeFeeAmount: Number(draft.extraExchangeFeeAmount || 0),
      });
    }

    return { items, errors };
  }

  function buildRejectExchangeItems(targetRows: NaverClaimRow[]) {
    const items: NaverRejectExchangeTarget[] = [];
    const errors: string[] = [];

    for (const row of targetRows) {
      const draft = drafts[row.id] ?? buildInitialDraft(row);
      if (!draft.rejectExchangeReason.trim()) {
        errors.push(`${row.productOrderId}: 교환 거부 사유를 입력해 주세요.`);
        continue;
      }

      items.push({
        productOrderId: row.productOrderId,
        claimId: row.claimId,
        orderId: row.orderId,
        productName: row.productName,
        rejectExchangeReason: draft.rejectExchangeReason.trim(),
      });
    }

    return { items, errors };
  }

  function buildRedeliverItems(targetRows: NaverClaimRow[]) {
    const items: NaverRedeliverExchangeTarget[] = [];
    const errors: string[] = [];

    for (const row of targetRows) {
      const draft = drafts[row.id] ?? buildInitialDraft(row);
      const requiresTracking = ["DELIVERY", "RETURN_DESIGNATED", "RETURN_DELIVERY"].includes(
        draft.reDeliveryMethod,
      );

      if (!draft.reDeliveryMethod.trim()) {
        errors.push(`${row.productOrderId}: 재배송 방식을 선택해 주세요.`);
        continue;
      }

      if (requiresTracking && !draft.reDeliveryCompany.trim()) {
        errors.push(`${row.productOrderId}: 재배송 택배사 코드를 입력해 주세요.`);
        continue;
      }

      if (requiresTracking && !draft.reDeliveryTrackingNumber.trim()) {
        errors.push(`${row.productOrderId}: 재배송 송장 번호를 입력해 주세요.`);
        continue;
      }

      items.push({
        productOrderId: row.productOrderId,
        claimId: row.claimId,
        orderId: row.orderId,
        productName: row.productName,
        reDeliveryMethod: draft.reDeliveryMethod,
        reDeliveryCompany: draft.reDeliveryCompany.trim(),
        reDeliveryTrackingNumber: draft.reDeliveryTrackingNumber.trim(),
      });
    }

    return { items, errors };
  }

  function applyValidationErrors(title: string, errors: string[]) {
    if (!errors.length) {
      return false;
    }

    setFeedback({
      type: "error",
      title,
      message: "실행 전에 필수 입력값을 확인해 주세요.",
      details: errors,
    });
    return true;
  }

  const safeSelectedRows = (actionKey: NaverClaimActionKey) =>
    selectedRows.filter((row) => row.availableActions.includes(actionKey));

  const safeRowsForTab = rows.filter((row) => row.isExecutable);

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="live" label="실연동" />
          <StatusBadge tone="shared" label="실행 가능" />
          <StatusBadge tone="coming" label="읽기 전용 포함" />
        </div>
        <h1>NAVER 취소/반품/교환</h1>
        <p>클레임 유형별로 조회하고, 현재 API 흐름에서 안전하게 연결할 수 있는 액션만 실행합니다.</p>
      </div>

      <div className="card">
        <div className="segmented-control">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`segmented-button ${filters.activeTab === tab.key ? "active" : ""}`}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  activeTab: tab.key,
                  status: "",
                }))
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <select
            value={filters.selectedStoreId}
            onChange={(event) =>
              setFilters((current) => ({
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
          <input
            type="date"
            value={filters.lastChangedFrom}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                lastChangedFrom: event.target.value,
              }))
            }
          />
          <input
            type="date"
            value={filters.lastChangedTo}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                lastChangedTo: event.target.value,
              }))
            }
          />
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value,
              }))
            }
          >
            <option value="">전체 상태</option>
            {availableStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <input
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                query: event.target.value,
              }))
            }
            placeholder="주문번호, 상품명, 상품주문번호, 사유 검색"
            style={{ minWidth: 280 }}
          />
          <select
            value={filters.maxItems}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                maxItems: Math.max(
                  1,
                  Math.min(Number(event.target.value), NAVER_CLAIM_MAX_ITEMS),
                ),
              }))
            }
          >
            {NAVER_CLAIM_PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                최근 {option}건
              </option>
            ))}
          </select>
          <button
            className="button secondary"
            onClick={() => void refreshClaims()}
            disabled={!filters.selectedStoreId || claimsQuery.isFetching}
          >
            {claimsQuery.isFetching ? "강제 새로고침 중.." : "강제 새로고침"}
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">조회 클레임</div>
          <div className="metric-value">{claimsQuery.data?.totalCount ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">실행 가능</div>
          <div className="metric-value">{safeRowsForTab.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">선택 항목</div>
          <div className="metric-value">{selectedRows.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">최종 조회</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatDate(claimsQuery.data?.fetchedAt)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <div className="selection-summary">선택 {selectedRows.length}건 / 조회 {rows.length}건</div>
          <div className="toolbar">
            <button className="button ghost" onClick={toggleVisibleRows} disabled={!rows.length}>
              {allVisibleSelected ? "현재 목록 선택 해제" : "현재 목록 전체 선택"}
            </button>
            {filters.activeTab === "cancel" ? (
              <button
                className="button"
                onClick={() =>
                  void executeAction({
                    actionName: "NAVER 취소 승인",
                    url: "/api/naver/claims/cancel/approve",
                    items: safeSelectedRows("approveCancel").map((row) => ({
                      productOrderId: row.productOrderId,
                      claimId: row.claimId,
                      orderId: row.orderId,
                      productName: row.productName,
                    })),
                    successTitle: "취소 승인 완료",
                    failureTitle: "취소 승인 실패",
                  })
                }
                disabled={Boolean(pendingAction)}
              >
                취소 승인
              </button>
            ) : null}
            {filters.activeTab === "return" ? (
              <>
                <button
                  className="button secondary"
                  onClick={() =>
                    void executeAction({
                      actionName: "NAVER 반품 승인",
                      url: "/api/naver/claims/return/approve",
                      items: safeSelectedRows("approveReturn").map((row) => ({
                        productOrderId: row.productOrderId,
                        claimId: row.claimId,
                        orderId: row.orderId,
                        productName: row.productName,
                      })),
                      successTitle: "반품 승인 완료",
                      failureTitle: "반품 승인 실패",
                    })
                  }
                  disabled={Boolean(pendingAction)}
                >
                  반품 승인
                </button>
                <button
                  className="button ghost"
                  onClick={() =>
                    void executeAction({
                      actionName: "NAVER 반품 보류 해제",
                      url: "/api/naver/claims/return/release-hold",
                      items: safeSelectedRows("releaseReturnHold").map((row) => ({
                        productOrderId: row.productOrderId,
                        claimId: row.claimId,
                        orderId: row.orderId,
                        productName: row.productName,
                      })),
                      successTitle: "반품 보류 해제 완료",
                      failureTitle: "반품 보류 해제 실패",
                    })
                  }
                  disabled={Boolean(pendingAction)}
                >
                  반품 보류 해제
                </button>
              </>
            ) : null}
            {filters.activeTab === "exchange" ? (
              <button
                className="button ghost"
                onClick={() =>
                  void executeAction({
                    actionName: "NAVER 교환 보류 해제",
                    url: "/api/naver/claims/exchange/release-hold",
                    items: safeSelectedRows("releaseExchangeHold").map((row) => ({
                      productOrderId: row.productOrderId,
                      claimId: row.claimId,
                      orderId: row.orderId,
                      productName: row.productName,
                    })),
                    successTitle: "교환 보류 해제 완료",
                    failureTitle: "교환 보류 해제 실패",
                  })
                }
                disabled={Boolean(pendingAction)}
              >
                교환 보류 해제
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {claimsQuery.data ? (
        <ApiFreshnessCard
          fetchedAt={claimsQuery.data.fetchedAt}
          cacheState={claimsCacheState}
          servedFromCache={claimsQuery.data.servedFromCache}
          isFetching={claimsQuery.isFetching && Boolean(claimsQuery.data)}
        />
      ) : null}

      {feedback ? (
        <div className={`feedback${feedback.type === "error" ? " error" : feedback.type === "warning" ? " warning" : ""}`}>
          <strong>{feedback.title}</strong>
          <div className="muted">{feedback.message}</div>
          {feedback.details.length ? (
            <ul className="messages">
              {feedback.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        {!stores.length ? (
          <div className="empty">먼저 NAVER 연결관리에서 스토어를 저장해 주세요.</div>
        ) : claimsQuery.isLoading ? (
          <div className="empty">NAVER 클레임을 불러오는 중입니다.</div>
        ) : claimsQuery.error ? (
          <div className="empty">{(claimsQuery.error as Error).message}</div>
        ) : rows.length ? (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleRows} /></th>
                  <th>주문</th>
                  <th>상품</th>
                  <th>상태</th>
                  <th>사유 / 메모</th>
                  <th>실행 설정</th>
                  <th>실행</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const draft = drafts[row.id] ?? buildInitialDraft(row);
                  return (
                    <tr key={row.id} className={selectedRowIds.includes(row.id) ? "table-row-selected" : ""}>
                      <td><input type="checkbox" checked={selectedRowIds.includes(row.id)} onChange={() => toggleRowSelection(row.id)} /></td>
                      <td><div><strong>{row.orderId}</strong></div><div className="muted">상품주문 {row.productOrderId}</div><div className="muted">{formatPerson(row)}</div></td>
                      <td><div><strong>{row.productName}</strong></div><div className="muted">{row.optionName ?? "-"} / 수량 {formatNumber(row.quantity)}</div><div className="muted">결제 {formatNumber(row.paymentAmount)}</div></td>
                      <td><div className={`status-pill ${row.claimStatus?.toLowerCase() ?? ""}`}>{row.claimStatusLabel}</div><div className="muted">{row.claimSource === "current" ? "실행 가능 후보" : "읽기 전용 이력"}</div><div className="muted">{formatDate(row.claimRequestDate ?? row.lastChangedAt)}</div></td>
                      <td><div>{row.claimReason ?? "-"}</div><div className="muted">{row.claimDetailReason ?? "-"}</div><div className="muted">수거 {row.collectStatus ?? "-"} / 재배송 {row.reDeliveryStatus ?? "-"}</div></td>
                      <td>
                        {row.claimType === "return" ? (
                          <div className="inline-form-stack">
                            <select value={draft.holdbackClassType} onChange={(event) => setDraftValue(row.id, "holdbackClassType", event.target.value)}>{HOLDBACK_CLASS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                            <select value={draft.holdbackReason} onChange={(event) => setDraftValue(row.id, "holdbackReason", event.target.value)}>{RETURN_HOLDBACK_REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                            <textarea value={draft.holdbackReturnDetailReason} onChange={(event) => setDraftValue(row.id, "holdbackReturnDetailReason", event.target.value)} placeholder="반품 보류 상세 사유" rows={2} />
                            <input value={draft.extraReturnFeeAmount} onChange={(event) => setDraftValue(row.id, "extraReturnFeeAmount", event.target.value)} placeholder="추가 반품 비용" />
                            <textarea value={draft.rejectReturnReason} onChange={(event) => setDraftValue(row.id, "rejectReturnReason", event.target.value)} placeholder="반품 거부 사유" rows={2} />
                          </div>
                        ) : row.claimType === "exchange" ? (
                          <div className="inline-form-stack">
                            <select value={draft.holdbackClassType} onChange={(event) => setDraftValue(row.id, "holdbackClassType", event.target.value)}>{HOLDBACK_CLASS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                            <select value={draft.holdbackReason} onChange={(event) => setDraftValue(row.id, "holdbackReason", event.target.value)}>{EXCHANGE_HOLDBACK_REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                            <textarea value={draft.holdbackExchangeDetailReason} onChange={(event) => setDraftValue(row.id, "holdbackExchangeDetailReason", event.target.value)} placeholder="교환 보류 상세 사유" rows={2} />
                            <input value={draft.extraExchangeFeeAmount} onChange={(event) => setDraftValue(row.id, "extraExchangeFeeAmount", event.target.value)} placeholder="추가 교환 비용" />
                            <textarea value={draft.rejectExchangeReason} onChange={(event) => setDraftValue(row.id, "rejectExchangeReason", event.target.value)} placeholder="교환 거부 사유" rows={2} />
                            <select value={draft.reDeliveryMethod} onChange={(event) => setDraftValue(row.id, "reDeliveryMethod", event.target.value)}>{REDELIVERY_METHOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                            <div className="inline-form-grid">
                              <input value={draft.reDeliveryCompany} onChange={(event) => setDraftValue(row.id, "reDeliveryCompany", event.target.value)} placeholder="재배송 택배사 코드" />
                              <input value={draft.reDeliveryTrackingNumber} onChange={(event) => setDraftValue(row.id, "reDeliveryTrackingNumber", event.target.value)} placeholder="재배송 송장 번호" />
                            </div>
                          </div>
                        ) : (
                          <div className="muted">취소 승인 외 별도 입력 없음</div>
                        )}
                      </td>
                      <td>
                        <div className="table-inline-actions">
                          {row.availableActions.includes("approveCancel") ? <button className="button" disabled={Boolean(pendingAction)} onClick={() => void executeAction({ actionName: "NAVER 취소 승인", url: "/api/naver/claims/cancel/approve", items: [{ productOrderId: row.productOrderId, claimId: row.claimId, orderId: row.orderId, productName: row.productName }], successTitle: "취소 승인 완료", failureTitle: "취소 승인 실패" })}>취소 승인</button> : null}
                          {row.availableActions.includes("approveReturn") ? <button className="button secondary" disabled={Boolean(pendingAction)} onClick={() => void executeAction({ actionName: "NAVER 반품 승인", url: "/api/naver/claims/return/approve", items: [{ productOrderId: row.productOrderId, claimId: row.claimId, orderId: row.orderId, productName: row.productName }], successTitle: "반품 승인 완료", failureTitle: "반품 승인 실패" })}>반품 승인</button> : null}
                          {row.availableActions.includes("holdReturn") ? <button className="button ghost" disabled={Boolean(pendingAction)} onClick={() => { const payload = buildHoldReturnItems([row]); if (!applyValidationErrors("반품 보류 검증 실패", payload.errors)) { void executeAction({ actionName: "NAVER 반품 보류", url: "/api/naver/claims/return/hold", items: payload.items, successTitle: "반품 보류 완료", failureTitle: "반품 보류 실패" }); } }}>반품 보류</button> : null}
                          {row.availableActions.includes("releaseReturnHold") ? <button className="button ghost" disabled={Boolean(pendingAction)} onClick={() => void executeAction({ actionName: "NAVER 반품 보류 해제", url: "/api/naver/claims/return/release-hold", items: [{ productOrderId: row.productOrderId, claimId: row.claimId, orderId: row.orderId, productName: row.productName }], successTitle: "반품 보류 해제 완료", failureTitle: "반품 보류 해제 실패" })}>보류 해제</button> : null}
                          {row.availableActions.includes("rejectReturn") ? <button className="button ghost" disabled={Boolean(pendingAction)} onClick={() => { const payload = buildRejectReturnItems([row]); if (!applyValidationErrors("반품 거부 검증 실패", payload.errors)) { void executeAction({ actionName: "NAVER 반품 거부", url: "/api/naver/claims/return/reject", items: payload.items, successTitle: "반품 거부 완료", failureTitle: "반품 거부 실패" }); } }}>반품 거부</button> : null}
                          {row.availableActions.includes("holdExchange") ? <button className="button ghost" disabled={Boolean(pendingAction)} onClick={() => { const payload = buildHoldExchangeItems([row]); if (!applyValidationErrors("교환 보류 검증 실패", payload.errors)) { void executeAction({ actionName: "NAVER 교환 보류", url: "/api/naver/claims/exchange/hold", items: payload.items, successTitle: "교환 보류 완료", failureTitle: "교환 보류 실패" }); } }}>교환 보류</button> : null}
                          {row.availableActions.includes("releaseExchangeHold") ? <button className="button ghost" disabled={Boolean(pendingAction)} onClick={() => void executeAction({ actionName: "NAVER 교환 보류 해제", url: "/api/naver/claims/exchange/release-hold", items: [{ productOrderId: row.productOrderId, claimId: row.claimId, orderId: row.orderId, productName: row.productName }], successTitle: "교환 보류 해제 완료", failureTitle: "교환 보류 해제 실패" })}>교환 보류 해제</button> : null}
                          {row.availableActions.includes("rejectExchange") ? <button className="button ghost" disabled={Boolean(pendingAction)} onClick={() => { const payload = buildRejectExchangeItems([row]); if (!applyValidationErrors("교환 거부 검증 실패", payload.errors)) { void executeAction({ actionName: "NAVER 교환 거부", url: "/api/naver/claims/exchange/reject", items: payload.items, successTitle: "교환 거부 완료", failureTitle: "교환 거부 실패" }); } }}>교환 거부</button> : null}
                          {row.availableActions.includes("redeliverExchange") ? <button className="button secondary" disabled={Boolean(pendingAction)} onClick={() => { const payload = buildRedeliverItems([row]); if (!applyValidationErrors("교환 재배송 검증 실패", payload.errors)) { void executeAction({ actionName: "NAVER 교환 재배송", url: "/api/naver/claims/exchange/redeliver", items: payload.items, successTitle: "교환 재배송 완료", failureTitle: "교환 재배송 실패" }); } }}>교환 재배송</button> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">조건에 맞는 클레임이 없습니다.</div>
        )}
      </div>
    </div>
  );
}
