import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import {
  NAVER_ORDER_MAX_ITEMS,
  NAVER_ORDER_PAGE_SIZE_OPTIONS,
  type NaverOrderActionResponse,
  type NaverOrderConfirmTarget,
  type NaverOrderDelayTarget,
  type NaverOrderDispatchTarget,
  type NaverOrderListResponse,
  type NaverOrderRow,
} from "@shared/naver-orders";
import { StatusBadge } from "@/components/status-badge";
import { useOperations } from "@/components/operation-provider";
import { apiRequestJson, getJson } from "@/lib/queryClient";
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
};

type ShipmentDraft = {
  deliveryMethod: string;
  courierCode: string;
  trackingNumber: string;
  dispatchDate: string;
  dispatchDueDate: string;
  delayedDispatchReason: string;
  dispatchDelayedDetailedReason: string;
};

type ShipmentDraftMap = Record<string, ShipmentDraft>;

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

function defaultDateTimeLocal(offsetMinutes = 0) {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
  lastChangedFrom: defaultDate(-3),
  lastChangedTo: defaultDate(0),
  status: "PAYED",
  query: "",
  maxItems: 60,
};

const ORDER_STATUS_OPTIONS = [
  { value: "", label: "전체 상태" },
  { value: "PAYED", label: "결제 완료" },
  { value: "DELIVERING", label: "배송 중" },
  { value: "DELIVERED", label: "배송 완료" },
  { value: "PURCHASE_DECIDED", label: "구매 확정" },
  { value: "RETURNED", label: "반품" },
  { value: "EXCHANGED", label: "교환" },
  { value: "CANCELED", label: "취소" },
] as const;

const DELAY_REASON_OPTIONS = [
  { value: "PRODUCT_PREPARE", label: "상품 준비 지연" },
  { value: "CUSTOMER_REQUEST", label: "고객 요청" },
  { value: "DELIVERY_DELAY", label: "물류/배송 지연" },
  { value: "ETC", label: "기타" },
] as const;

function buildOrdersUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    lastChangedFrom: filters.lastChangedFrom,
    lastChangedTo: filters.lastChangedTo,
    maxItems: String(filters.maxItems),
  });

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }

  return `/api/naver/orders?${params.toString()}`;
}

function buildInitialDraft(row: NaverOrderRow): ShipmentDraft {
  return {
    deliveryMethod: row.deliveryMethod ?? "DELIVERY",
    courierCode: row.courierCode ?? "",
    trackingNumber: row.trackingNumber ?? "",
    dispatchDate: defaultDateTimeLocal(0),
    dispatchDueDate: row.dispatchDueDate ? row.dispatchDueDate.slice(0, 10) : defaultDate(2),
    delayedDispatchReason: "PRODUCT_PREPARE",
    dispatchDelayedDetailedReason: "",
  };
}

function buildActionMessage(result: NaverOrderActionResponse) {
  return `성공 ${result.summary.succeededCount}건 / 실패 ${result.summary.failedCount}건 / 건너뜀 ${result.summary.skippedCount}건`;
}

function buildFailureDetails(result: NaverOrderActionResponse) {
  return result.items
    .filter((item) => item.status !== "succeeded")
    .slice(0, 6)
    .map((item) => `${item.productOrderId}: ${item.message}`);
}

function validateDispatchDraft(row: NaverOrderRow, draft: ShipmentDraft) {
  if (!row.productOrderId) {
    return "상품 주문 번호가 없습니다.";
  }

  if (!draft.deliveryMethod.trim()) {
    return "배송 방식을 선택해 주세요.";
  }

  if (!draft.dispatchDate.trim()) {
    return "발송 일시를 입력해 주세요.";
  }

  if (draft.deliveryMethod !== "NOTHING" && draft.deliveryMethod !== "DIRECT_DELIVERY") {
    if (!draft.courierCode.trim()) {
      return "택배사 코드를 입력해 주세요.";
    }

    if (!draft.trackingNumber.trim()) {
      return "송장 번호를 입력해 주세요.";
    }
  }

  return null;
}

function validateDelayDraft(row: NaverOrderRow, draft: ShipmentDraft) {
  if (!row.productOrderId) {
    return "상품 주문 번호가 없습니다.";
  }

  if (!draft.dispatchDueDate.trim()) {
    return "지연 예정 발송일을 입력해 주세요.";
  }

  if (!draft.delayedDispatchReason.trim()) {
    return "발송 지연 사유를 선택해 주세요.";
  }

  if (!draft.dispatchDelayedDetailedReason.trim()) {
    return "발송 지연 상세 사유를 입력해 주세요.";
  }

  return null;
}

function buildConfirmTargets(rows: NaverOrderRow[]): NaverOrderConfirmTarget[] {
  return rows.map((row) => ({
    productOrderId: row.productOrderId,
    orderId: row.orderId,
    productName: row.productName,
  }));
}

function buildDispatchTargets(rows: NaverOrderRow[], drafts: ShipmentDraftMap) {
  const items: NaverOrderDispatchTarget[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const draft = drafts[row.id] ?? buildInitialDraft(row);
    const validationMessage = validateDispatchDraft(row, draft);

    if (validationMessage) {
      errors.push(`${row.productOrderId}: ${validationMessage}`);
      continue;
    }

    items.push({
      productOrderId: row.productOrderId,
      orderId: row.orderId,
      productName: row.productName,
      deliveryMethod: draft.deliveryMethod,
      courierCode: draft.courierCode.trim(),
      trackingNumber: draft.trackingNumber.trim(),
      dispatchDate: draft.dispatchDate,
    });
  }

  return {
    items,
    errors,
  };
}

function buildDelayTargets(rows: NaverOrderRow[], drafts: ShipmentDraftMap) {
  const items: NaverOrderDelayTarget[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const draft = drafts[row.id] ?? buildInitialDraft(row);
    const validationMessage = validateDelayDraft(row, draft);

    if (validationMessage) {
      errors.push(`${row.productOrderId}: ${validationMessage}`);
      continue;
    }

    items.push({
      productOrderId: row.productOrderId,
      orderId: row.orderId,
      productName: row.productName,
      dispatchDueDate: draft.dispatchDueDate,
      delayedDispatchReason: draft.delayedDispatchReason,
      dispatchDelayedDetailedReason: draft.dispatchDelayedDetailedReason.trim(),
    });
  }

  return {
    items,
    errors,
  };
}

function formatPeople(row: NaverOrderRow) {
  if (row.buyerName && row.receiverName) {
    return `${row.buyerName} / ${row.receiverName}`;
  }

  return row.receiverName ?? row.buyerName ?? "-";
}

export default function NaverShipmentPage() {
  const {
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
    publishOperation,
  } = useOperations();
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "naver.shipment",
    DEFAULT_FILTERS,
  );
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<ShipmentDraftMap>({});
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const storesQuery = useQuery({
    queryKey: ["/api/settings/stores"],
    queryFn: () => getJson<StoresResponse>("/api/settings/stores"),
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

  const ordersQuery = useQuery({
    queryKey: [
      "/api/naver/orders",
      "shipment",
      filters.selectedStoreId,
      filters.lastChangedFrom,
      filters.lastChangedTo,
      filters.status,
      filters.query,
      filters.maxItems,
    ],
    queryFn: () => getJson<NaverOrderListResponse>(buildOrdersUrl(filters)),
    enabled:
      Boolean(filters.selectedStoreId) &&
      Boolean(filters.lastChangedFrom) &&
      Boolean(filters.lastChangedTo),
  });

  const rows = ordersQuery.data?.items || [];
  const selectedIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIdSet.has(row.id)),
    [rows, selectedIdSet],
  );
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIdSet.has(row.id));

  useEffect(() => {
    setSelectedRowIds((current) => current.filter((rowId) => rows.some((row) => row.id === rowId)));
  }, [rows]);

  useEffect(() => {
    setDrafts((current) => {
      const next: ShipmentDraftMap = {};
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

  const setDraftValue = (rowId: string, key: keyof ShipmentDraft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [rowId]: {
        ...(current[rowId] ?? {
          deliveryMethod: "DELIVERY",
          courierCode: "",
          trackingNumber: "",
          dispatchDate: defaultDateTimeLocal(0),
          dispatchDueDate: defaultDate(2),
          delayedDispatchReason: "PRODUCT_PREPARE",
          dispatchDelayedDetailedReason: "",
        }),
        [key]: value,
      },
    }));
  };

  const applyActionResult = async (
    result: NaverOrderActionResponse,
    localToastId: string | undefined,
    title: string,
  ) => {
    const summary = buildActionMessage(result);
    const details = buildFailureDetails(result);

    setFeedback({
      type:
        result.summary.failedCount > 0 || result.summary.skippedCount > 0 ? "warning" : "success",
      title,
      message: summary,
      details,
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
        summary,
      });
      window.setTimeout(() => removeLocalOperation(localToastId), 1_200);
    }

    await ordersQuery.refetch();
  };

  const handleActionError = (
    error: unknown,
    localToastId: string | undefined,
    title: string,
    fallbackMessage: string,
  ) => {
    const message = error instanceof Error ? error.message : fallbackMessage;

    setFeedback({
      type: "error",
      title,
      message,
      details: [],
    });

    if (localToastId) {
      finishLocalOperation(localToastId, {
        status: "error",
        errorMessage: message,
      });
    }
  };

  const confirmMutation = useMutation({
    mutationFn: async (items: NaverOrderConfirmTarget[]) =>
      apiRequestJson<NaverOrderActionResponse>("POST", "/api/naver/orders/confirm", {
        storeId: filters.selectedStoreId,
        items,
      }),
    onMutate: (items) =>
      startLocalOperation({
        channel: "naver",
        actionName: "NAVER 발주 확인",
        targetCount: items.length,
      }),
    onSuccess: async (result, _items, localToastId) => {
      await applyActionResult(result, localToastId, "발주 확인 완료");
    },
    onError: (error, _items, localToastId) => {
      handleActionError(error, localToastId, "발주 확인 실패", "발주 확인 처리에 실패했습니다.");
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: async (items: NaverOrderDispatchTarget[]) =>
      apiRequestJson<NaverOrderActionResponse>("POST", "/api/naver/orders/dispatch", {
        storeId: filters.selectedStoreId,
        items,
      }),
    onMutate: (items) =>
      startLocalOperation({
        channel: "naver",
        actionName: "NAVER 발송 처리",
        targetCount: items.length,
      }),
    onSuccess: async (result, _items, localToastId) => {
      await applyActionResult(result, localToastId, "발송 처리 완료");
    },
    onError: (error, _items, localToastId) => {
      handleActionError(error, localToastId, "발송 처리 실패", "발송 처리에 실패했습니다.");
    },
  });

  const delayMutation = useMutation({
    mutationFn: async (items: NaverOrderDelayTarget[]) =>
      apiRequestJson<NaverOrderActionResponse>("POST", "/api/naver/orders/delay-dispatch", {
        storeId: filters.selectedStoreId,
        items,
      }),
    onMutate: (items) =>
      startLocalOperation({
        channel: "naver",
        actionName: "NAVER 발송 지연 처리",
        targetCount: items.length,
      }),
    onSuccess: async (result, _items, localToastId) => {
      await applyActionResult(result, localToastId, "발송 지연 처리 완료");
    },
    onError: (error, _items, localToastId) => {
      handleActionError(
        error,
        localToastId,
        "발송 지연 처리 실패",
        "발송 지연 처리에 실패했습니다.",
      );
    },
  });

  const anyMutationPending =
    confirmMutation.isPending || dispatchMutation.isPending || delayMutation.isPending;

  const toggleRowSelection = (rowId: string) => {
    setSelectedRowIds((current) =>
      current.includes(rowId) ? current.filter((value) => value !== rowId) : [...current, rowId],
    );
  };

  const toggleVisibleRows = () => {
    setSelectedRowIds((current) => {
      if (allVisibleSelected) {
        return current.filter((rowId) => !rows.some((row) => row.id === rowId));
      }

      const next = new Set(current);
      for (const row of rows) {
        next.add(row.id);
      }
      return Array.from(next);
    });
  };

  const runConfirm = async (targetRows: NaverOrderRow[]) => {
    if (!targetRows.length) {
      setFeedback({
        type: "error",
        title: "발주 확인 불가",
        message: "선택된 주문이 없습니다.",
        details: [],
      });
      return;
    }

    setFeedback(null);
    try {
      await confirmMutation.mutateAsync(buildConfirmTargets(targetRows));
    } catch {
      // Mutation-level feedback is already handled in onError.
    }
  };

  const runDispatch = async (targetRows: NaverOrderRow[]) => {
    if (!targetRows.length) {
      setFeedback({
        type: "error",
        title: "발송 처리 불가",
        message: "선택된 주문이 없습니다.",
        details: [],
      });
      return;
    }

    const payload = buildDispatchTargets(targetRows, drafts);
    if (payload.errors.length) {
      setFeedback({
        type: "error",
        title: "발송 처리 검증 실패",
        message: "발송 처리 전에 필수 입력값을 확인해 주세요.",
        details: payload.errors,
      });
      return;
    }

    setFeedback(null);
    try {
      await dispatchMutation.mutateAsync(payload.items);
    } catch {
      // Mutation-level feedback is already handled in onError.
    }
  };

  const runDelay = async (targetRows: NaverOrderRow[]) => {
    if (!targetRows.length) {
      setFeedback({
        type: "error",
        title: "발송 지연 처리 불가",
        message: "선택된 주문이 없습니다.",
        details: [],
      });
      return;
    }

    const payload = buildDelayTargets(targetRows, drafts);
    if (payload.errors.length) {
      setFeedback({
        type: "error",
        title: "발송 지연 검증 실패",
        message: "지연 처리 전에 필수 입력값을 확인해 주세요.",
        details: payload.errors,
      });
      return;
    }

    setFeedback(null);
    try {
      await delayMutation.mutateAsync(payload.items);
    } catch {
      // Mutation-level feedback is already handled in onError.
    }
  };

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="live" label="실연동" />
          <StatusBadge tone="shared" label="실행 가능" />
        </div>
        <h1>NAVER 발주/발송</h1>
        <p>
          주문행을 선택해 발주 확인, 발송 처리, 발송 지연 처리를 실행합니다. 단건 버튼과
          선택건 일괄 실행 모두 작업센터와 토스트에 기록됩니다.
        </p>
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
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
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
            placeholder="주문번호, 상품명, 상품주문번호 검색"
            style={{ minWidth: 280 }}
          />

          <select
            value={filters.maxItems}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                maxItems: Math.max(
                  1,
                  Math.min(Number(event.target.value), NAVER_ORDER_MAX_ITEMS),
                ),
              }))
            }
          >
            {NAVER_ORDER_PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                최근 {option}건
              </option>
            ))}
          </select>

          <button
            className="button secondary"
            onClick={() => void ordersQuery.refetch()}
            disabled={!filters.selectedStoreId || ordersQuery.isFetching}
          >
            {ordersQuery.isFetching ? "새로고침 중..." : "새로고침"}
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">조회 주문</div>
          <div className="metric-value">{ordersQuery.data?.totalCount ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">선택 주문</div>
          <div className="metric-value">{selectedRows.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">실행 가능 주문</div>
          <div className="metric-value">{rows.filter((row) => row.isExecutable).length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">최종 조회</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatDate(ordersQuery.data?.fetchedAt)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <div className="selection-summary">
            선택 {selectedRows.length}건 / 조회 {rows.length}건
          </div>
          <div className="toolbar">
            <button className="button ghost" onClick={toggleVisibleRows} disabled={!rows.length}>
              {allVisibleSelected ? "현재 목록 선택 해제" : "현재 목록 전체 선택"}
            </button>
            <button
              className="button secondary"
              onClick={() => void runConfirm(selectedRows)}
              disabled={!selectedRows.length || anyMutationPending}
            >
              발주 확인
            </button>
            <button
              className="button"
              onClick={() => void runDispatch(selectedRows)}
              disabled={!selectedRows.length || anyMutationPending}
            >
              발송 처리
            </button>
            <button
              className="button ghost"
              onClick={() => void runDelay(selectedRows)}
              disabled={!selectedRows.length || anyMutationPending}
            >
              발송 지연 처리
            </button>
          </div>
        </div>
      </div>

      {feedback ? (
        <div
          className={`feedback${feedback.type === "error" ? " error" : feedback.type === "warning" ? " warning" : ""}`}
        >
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
        ) : ordersQuery.isLoading ? (
          <div className="empty">발주/발송 대상 주문을 불러오는 중입니다.</div>
        ) : ordersQuery.error ? (
          <div className="empty">{(ordersQuery.error as Error).message}</div>
        ) : rows.length ? (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisibleRows}
                    />
                  </th>
                  <th>주문</th>
                  <th>상품</th>
                  <th>상태</th>
                  <th>배송 설정</th>
                  <th>지연 설정</th>
                  <th>실행</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const draft = drafts[row.id] ?? buildInitialDraft(row);

                  return (
                    <tr
                      key={row.id}
                      className={selectedIdSet.has(row.id) ? "table-row-selected" : ""}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIdSet.has(row.id)}
                          onChange={() => toggleRowSelection(row.id)}
                        />
                      </td>
                      <td>
                        <div>
                          <strong>{row.orderId}</strong>
                        </div>
                        <div className="muted">상품주문 {row.productOrderId}</div>
                        <div className="muted">{formatPeople(row)}</div>
                      </td>
                      <td>
                        <div>
                          <strong>{row.productName}</strong>
                        </div>
                        <div className="muted">
                          {row.optionName ?? "-"} / 수량 {formatNumber(row.quantity)}
                        </div>
                        <div className="muted">결제 {formatNumber(row.paymentAmount)}</div>
                      </td>
                      <td>
                        <div className={`status-pill ${row.productOrderStatus?.toLowerCase() ?? ""}`}>
                          {row.productOrderStatusLabel}
                        </div>
                        <div className="muted">변경 {formatDate(row.lastChangedAt)}</div>
                        <div className="muted">{row.isExecutable ? "실행 가능" : "읽기 전용 상태"}</div>
                      </td>
                      <td>
                        <div className="inline-form-stack">
                          <select
                            value={draft.deliveryMethod}
                            onChange={(event) =>
                              setDraftValue(row.id, "deliveryMethod", event.target.value)
                            }
                          >
                            <option value="DELIVERY">택배</option>
                            <option value="DIRECT_DELIVERY">직접배송</option>
                            <option value="NOTHING">배송없음</option>
                          </select>
                          <div className="inline-form-grid">
                            <input
                              value={draft.courierCode}
                              onChange={(event) =>
                                setDraftValue(row.id, "courierCode", event.target.value)
                              }
                              placeholder="택배사 코드"
                            />
                            <input
                              value={draft.trackingNumber}
                              onChange={(event) =>
                                setDraftValue(row.id, "trackingNumber", event.target.value)
                              }
                              placeholder="송장 번호"
                            />
                          </div>
                          <input
                            type="datetime-local"
                            value={draft.dispatchDate}
                            onChange={(event) =>
                              setDraftValue(row.id, "dispatchDate", event.target.value)
                            }
                          />
                        </div>
                      </td>
                      <td>
                        <div className="inline-form-stack">
                          <input
                            type="date"
                            value={draft.dispatchDueDate}
                            onChange={(event) =>
                              setDraftValue(row.id, "dispatchDueDate", event.target.value)
                            }
                          />
                          <select
                            value={draft.delayedDispatchReason}
                            onChange={(event) =>
                              setDraftValue(row.id, "delayedDispatchReason", event.target.value)
                            }
                          >
                            {DELAY_REASON_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <textarea
                            value={draft.dispatchDelayedDetailedReason}
                            onChange={(event) =>
                              setDraftValue(
                                row.id,
                                "dispatchDelayedDetailedReason",
                                event.target.value,
                              )
                            }
                            placeholder="발송 지연 상세 사유"
                            rows={3}
                          />
                        </div>
                      </td>
                      <td>
                        <div className="table-inline-actions">
                          <button
                            className="button ghost"
                            onClick={() => void runConfirm([row])}
                            disabled={anyMutationPending}
                          >
                            발주 확인
                          </button>
                          <button
                            className="button secondary"
                            onClick={() => void runDispatch([row])}
                            disabled={anyMutationPending}
                          >
                            발송 처리
                          </button>
                          <button
                            className="button ghost"
                            onClick={() => void runDelay([row])}
                            disabled={anyMutationPending}
                          >
                            지연 처리
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">조건에 맞는 발주/발송 대상 주문이 없습니다.</div>
        )}
      </div>
    </div>
  );
}
