import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CoupangBatchActionResponse,
  CoupangExchangeConfirmTarget,
  CoupangExchangeDetailResponse,
  CoupangExchangeInvoiceTarget,
  CoupangExchangeRejectCode,
  CoupangExchangeRejectTarget,
  CoupangExchangeRow,
  CoupangSimpleListResponse,
  CoupangStoreSummary,
} from "@shared/coupang";
import { StatusBadge } from "@/components/status-badge";
import { useOperations } from "@/components/operation-provider";
import { apiRequestJson, getJson } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate, formatNumber } from "@/lib/utils";

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

type FilterState = {
  selectedStoreId: string;
  status: string;
  createdAtFrom: string;
  createdAtTo: string;
  query: string;
};

type ExchangeDraft = {
  exchangeRejectCode: CoupangExchangeRejectCode;
  goodsDeliveryCode: string;
  invoiceNumber: string;
};

type ExchangeDraftMap = Record<string, ExchangeDraft>;

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
  status: "",
  createdAtFrom: defaultDate(-10),
  createdAtTo: defaultDate(0),
  query: "",
};

function buildExchangesUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    createdAtFrom: filters.createdAtFrom,
    createdAtTo: filters.createdAtTo,
    maxPerPage: "50",
  });

  if (filters.status) {
    params.set("status", filters.status);
  }

  return `/api/coupang/exchanges?${params.toString()}`;
}

function buildDetailUrl(filters: FilterState, exchangeId: string, orderId?: string | null) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    exchangeId,
    createdAtFrom: filters.createdAtFrom,
    createdAtTo: filters.createdAtTo,
  });

  if (orderId) {
    params.set("orderId", orderId);
  }

  return `/api/coupang/exchanges/detail?${params.toString()}`;
}

function buildSummary(result: CoupangBatchActionResponse) {
  return `성공 ${result.summary.succeededCount}건 / 실패 ${result.summary.failedCount}건 / 경고 ${result.summary.warningCount}건 / 건너뜀 ${result.summary.skippedCount}건`;
}

function buildFailureDetails(result: CoupangBatchActionResponse) {
  return result.items
    .filter((item) => item.status !== "succeeded")
    .slice(0, 8)
    .map((item) => `${item.targetId}: ${item.message}`);
}

function matchesQuery(row: CoupangExchangeRow, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    row.exchangeId,
    row.orderId,
    row.productName,
    row.vendorItemName,
    row.reason,
    row.invoiceNumber,
    row.returnCustomerName,
    row.deliveryCustomerName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function buildInitialDraft(row: CoupangExchangeRow): ExchangeDraft {
  return {
    exchangeRejectCode: "SOLDOUT",
    goodsDeliveryCode: row.deliverCode ?? "CJGLS",
    invoiceNumber: row.invoiceNumber ?? "",
  };
}

function buildConfirmTarget(row: CoupangExchangeRow): CoupangExchangeConfirmTarget {
  return {
    exchangeId: row.exchangeId,
    orderId: row.orderId,
    shipmentBoxId: row.shipmentBoxId,
    vendorItemId: row.vendorItemId,
    productName: row.productName,
  };
}

function buildRejectTarget(
  row: CoupangExchangeRow,
  draft: ExchangeDraft,
): CoupangExchangeRejectTarget {
  return {
    exchangeId: row.exchangeId,
    exchangeRejectCode: draft.exchangeRejectCode,
    orderId: row.orderId,
    shipmentBoxId: row.shipmentBoxId,
    vendorItemId: row.vendorItemId,
    productName: row.productName,
  };
}

function buildInvoiceTarget(
  row: CoupangExchangeRow,
  draft: ExchangeDraft,
): CoupangExchangeInvoiceTarget {
  return {
    exchangeId: row.exchangeId,
    shipmentBoxId: row.shipmentBoxId ?? "",
    goodsDeliveryCode: draft.goodsDeliveryCode.trim(),
    invoiceNumber: draft.invoiceNumber.trim(),
    orderId: row.orderId,
    vendorItemId: row.vendorItemId,
    productName: row.productName,
  };
}

function validateRejectDraft(row: CoupangExchangeRow, draft: ExchangeDraft) {
  if (!row.exchangeId) {
    return "exchangeId가 없습니다.";
  }
  if (!draft.exchangeRejectCode) {
    return "거부 코드를 선택해 주세요.";
  }
  return null;
}

function validateInvoiceDraft(row: CoupangExchangeRow, draft: ExchangeDraft) {
  if (!row.exchangeId) {
    return "exchangeId가 없습니다.";
  }
  if (!row.shipmentBoxId) {
    return "shipmentBoxId가 없습니다.";
  }
  if (!draft.goodsDeliveryCode.trim()) {
    return "택배사 코드를 입력해 주세요.";
  }
  if (!draft.invoiceNumber.trim()) {
    return "송장번호를 입력해 주세요.";
  }
  return null;
}

function statusClassName(value: string | null | undefined) {
  const normalized = (value || "pending").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return normalized || "pending";
}

export default function CoupangExchangesPage() {
  const {
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
    publishOperation,
  } = useOperations();
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "coupang.exchanges",
    DEFAULT_FILTERS,
  );
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [selectedExchangeId, setSelectedExchangeId] = useState("");
  const [drafts, setDrafts] = useState<ExchangeDraftMap>({});
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const storesQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
  });

  const stores = storesQuery.data?.items || [];

  useEffect(() => {
    if (!isFiltersLoaded || filters.selectedStoreId || !stores[0]) {
      return;
    }

    setFilters((current) => ({
      ...current,
      selectedStoreId: stores[0].id,
    }));
  }, [filters.selectedStoreId, isFiltersLoaded, setFilters, stores]);

  const exchangesQuery = useQuery({
    queryKey: [
      "/api/coupang/exchanges",
      filters.selectedStoreId,
      filters.status,
      filters.createdAtFrom,
      filters.createdAtTo,
    ],
    queryFn: () =>
      getJson<CoupangSimpleListResponse<CoupangExchangeRow>>(buildExchangesUrl(filters)),
    enabled:
      Boolean(filters.selectedStoreId) &&
      Boolean(filters.createdAtFrom) &&
      Boolean(filters.createdAtTo),
  });

  const rows = useMemo(
    () => (exchangesQuery.data?.items || []).filter((row) => matchesQuery(row, filters.query)),
    [exchangesQuery.data?.items, filters.query],
  );
  const selectedIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIdSet.has(row.exchangeId)),
    [rows, selectedIdSet],
  );
  const allVisibleSelected =
    rows.length > 0 && rows.every((row) => selectedIdSet.has(row.exchangeId));
  const availableStatuses = useMemo(
    () => Array.from(new Set((exchangesQuery.data?.items || []).map((row) => row.status))).sort(),
    [exchangesQuery.data?.items],
  );
  const selectedExchangeRow = rows.find((row) => row.exchangeId === selectedExchangeId) ?? null;
  const isFallback = exchangesQuery.data?.source === "fallback";

  useEffect(() => {
    setSelectedRowIds((current) =>
      current.filter((rowId) => rows.some((row) => row.exchangeId === rowId)),
    );
  }, [rows]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedExchangeId("");
      return;
    }

    if (!selectedExchangeId || !rows.some((row) => row.exchangeId === selectedExchangeId)) {
      setSelectedExchangeId(rows[0].exchangeId);
    }
  }, [rows, selectedExchangeId]);

  useEffect(() => {
    setDrafts((current) => {
      const next: ExchangeDraftMap = {};
      let changed = false;

      for (const row of rows) {
        next[row.exchangeId] = current[row.exchangeId] ?? buildInitialDraft(row);
        if (!current[row.exchangeId]) {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [rows]);

  const detailQuery = useQuery({
    queryKey: [
      "/api/coupang/exchanges/detail",
      filters.selectedStoreId,
      selectedExchangeId,
      selectedExchangeRow?.orderId ?? null,
      filters.createdAtFrom,
      filters.createdAtTo,
    ],
    queryFn: () =>
      getJson<CoupangExchangeDetailResponse>(
        buildDetailUrl(filters, selectedExchangeId, selectedExchangeRow?.orderId),
      ),
    enabled: Boolean(filters.selectedStoreId && selectedExchangeId),
  });

  function setDraftValue(rowId: string, key: keyof ExchangeDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [rowId]: {
        ...(current[rowId] ??
          buildInitialDraft(rows.find((row) => row.exchangeId === rowId)!)),
        [key]: value,
      },
    }));
  }

  function toggleRowSelection(rowId: string) {
    setSelectedRowIds((current) =>
      current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId],
    );
  }

  function toggleVisibleRows() {
    setSelectedRowIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !rows.some((row) => row.exchangeId === id));
      }

      const next = new Set(current);
      for (const row of rows) {
        next.add(row.exchangeId);
      }
      return Array.from(next);
    });
  }

  async function handleAction(options: {
    actionKey: "confirm" | "reject" | "invoice";
    title: string;
    endpoint: string;
    rows: CoupangExchangeRow[];
  }) {
    if (isFallback) {
      setFeedback({
        type: "warning",
        title: "Fallback 데이터",
        message: "Fallback 결과에서는 실행 액션이 잠겨 있습니다.",
        details: [],
      });
      return;
    }

    const eligible = options.rows.filter((row) => {
      if (options.actionKey === "confirm") return row.canConfirmInbound;
      if (options.actionKey === "reject") return row.canReject;
      return row.canUploadExchangeInvoice;
    });

    if (!eligible.length) {
      setFeedback({
        type: "error",
        title: options.title,
        message: "선택한 항목 중 실행 가능한 교환 요청이 없습니다.",
        details: [],
      });
      return;
    }

    let items:
      | CoupangExchangeConfirmTarget[]
      | CoupangExchangeRejectTarget[]
      | CoupangExchangeInvoiceTarget[] = [];
    const errors: string[] = [];

    if (options.actionKey === "confirm") {
      items = eligible.map((row) => buildConfirmTarget(row));
    } else if (options.actionKey === "reject") {
      items = eligible.flatMap((row) => {
        const draft = drafts[row.exchangeId] ?? buildInitialDraft(row);
        const message = validateRejectDraft(row, draft);
        if (message) {
          errors.push(`${row.exchangeId}: ${message}`);
          return [];
        }
        return [buildRejectTarget(row, draft)];
      });
    } else {
      items = eligible.flatMap((row) => {
        const draft = drafts[row.exchangeId] ?? buildInitialDraft(row);
        const message = validateInvoiceDraft(row, draft);
        if (message) {
          errors.push(`${row.exchangeId}: ${message}`);
          return [];
        }
        return [buildInvoiceTarget(row, draft)];
      });
    }

    if (errors.length) {
      setFeedback({
        type: "error",
        title: `${options.title} 검증 실패`,
        message: "실행 전 필수 입력값을 확인해 주세요.",
        details: errors,
      });
      return;
    }

    const localToastId = startLocalOperation({
      channel: "coupang",
      actionName: options.title,
      targetCount: items.length,
    });

    setBusyAction(options.actionKey);
    setFeedback(null);

    try {
      const result = await apiRequestJson<CoupangBatchActionResponse>("POST", options.endpoint, {
        storeId: filters.selectedStoreId,
        items,
      });
      const summary = buildSummary(result);

      setFeedback({
        type:
          result.summary.failedCount > 0 ||
          result.summary.warningCount > 0 ||
          result.summary.skippedCount > 0
            ? "warning"
            : "success",
        title: `${options.title} 결과`,
        message: summary,
        details: buildFailureDetails(result),
      });

      if (result.operation) {
        publishOperation(result.operation);
      }

      finishLocalOperation(localToastId, {
        status:
          result.summary.failedCount > 0 ||
          result.summary.warningCount > 0 ||
          result.summary.skippedCount > 0
            ? "warning"
            : "success",
        summary,
      });
      window.setTimeout(() => removeLocalOperation(localToastId), 1400);
      void exchangesQuery.refetch();
      void detailQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "교환 작업에 실패했습니다.";
      setFeedback({
        type: "error",
        title: `${options.title} 실패`,
        message,
        details: [],
      });
      finishLocalOperation(localToastId, {
        status: "error",
        errorMessage: message,
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone={isFallback ? "draft" : "live"} label={isFallback ? "Fallback" : "실연동"} />
          <StatusBadge tone={isFallback ? "shared" : "live"} label={isFallback ? "읽기 전용" : "실행 가능"} />
        </div>
        <h1>COUPANG 교환</h1>
        <p>교환 요청의 회수 상태와 재배송 정보를 점검하고 입고 확인, 거부 처리, 교환상품 송장 업로드를 수행합니다.</p>
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
            value={filters.createdAtFrom}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                createdAtFrom: event.target.value,
              }))
            }
          />
          <input
            type="date"
            value={filters.createdAtTo}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                createdAtTo: event.target.value,
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
            placeholder="exchangeId / 주문번호 / 상품명 검색"
            style={{ minWidth: 260 }}
          />
          <button className="button secondary" onClick={() => void exchangesQuery.refetch()}>
            새로고침
          </button>
        </div>
      </div>

      {exchangesQuery.data?.message ? (
        <div className="card">
          <div className="muted">{exchangesQuery.data.message}</div>
        </div>
      ) : null}

      {feedback ? (
        <div className={`feedback ${feedback.type}`}>
          <strong>{feedback.title}</strong>
          <div>{feedback.message}</div>
          {feedback.details.length ? (
            <ul className="messages">
              {feedback.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">조회 건수</div>
          <div className="metric-value">{rows.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">입고확인 가능</div>
          <div className="metric-value">{rows.filter((row) => row.canConfirmInbound).length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">데이터 소스</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {exchangesQuery.data?.source ?? "-"}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <button
            className="button"
            disabled={!selectedRows.length || isFallback || busyAction !== null}
            onClick={() =>
              void handleAction({
                actionKey: "confirm",
                title: "COUPANG 교환 입고 확인",
                endpoint: "/api/coupang/exchanges/receive-confirmation",
                rows: selectedRows,
              })
            }
          >
            입고 확인
          </button>
          <button
            className="button secondary"
            disabled={!selectedRows.length || isFallback || busyAction !== null}
            onClick={() =>
              void handleAction({
                actionKey: "reject",
                title: "COUPANG 교환 거부",
                endpoint: "/api/coupang/exchanges/reject",
                rows: selectedRows,
              })
            }
          >
            거부 처리
          </button>
          <button
            className="button secondary"
            disabled={!selectedRows.length || isFallback || busyAction !== null}
            onClick={() =>
              void handleAction({
                actionKey: "invoice",
                title: "COUPANG 교환상품 송장 업로드",
                endpoint: "/api/coupang/exchanges/invoices",
                rows: selectedRows,
              })
            }
          >
            교환상품 송장 업로드
          </button>
          <div className="muted">선택 {selectedRows.length}건</div>
        </div>
      </div>

      <div className="split">
        <div className="card">
          {exchangesQuery.isLoading ? (
            <div className="empty">교환 요청을 불러오는 중입니다.</div>
          ) : exchangesQuery.error ? (
            <div className="empty">{(exchangesQuery.error as Error).message}</div>
          ) : rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleRows} />
                    </th>
                    <th>교환ID</th>
                    <th>주문 / 상품</th>
                    <th>상태</th>
                    <th>회수 / 재배송</th>
                    <th>고객</th>
                    <th>등록일</th>
                    <th>실행</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const draft = drafts[row.exchangeId] ?? buildInitialDraft(row);
                    return (
                      <tr
                        key={row.exchangeId}
                        className={selectedExchangeId === row.exchangeId ? "active-row" : ""}
                        onClick={() => setSelectedExchangeId(row.exchangeId)}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIdSet.has(row.exchangeId)}
                            onChange={() => toggleRowSelection(row.exchangeId)}
                          />
                        </td>
                        <td>
                          <div>
                            <strong>{row.exchangeId}</strong>
                          </div>
                          <div className="muted">{row.orderId ?? "-"}</div>
                        </td>
                        <td>
                          <div>
                            <strong>{row.productName}</strong>
                          </div>
                          <div className="muted">{row.vendorItemName ?? row.vendorItemId ?? "-"}</div>
                        </td>
                        <td>
                          <span className={`status-pill ${statusClassName(row.status)}`}>{row.status}</span>
                          <div className="table-note">{row.reason ?? row.reasonCode ?? "-"}</div>
                        </td>
                        <td>
                          <div>{row.deliverCode ?? "-"}</div>
                          <div className="muted">{row.invoiceNumber ?? "미등록"}</div>
                        </td>
                        <td>
                          <div>{row.returnCustomerName ?? row.deliveryCustomerName ?? "-"}</div>
                          <div className="muted">{row.returnMobile ?? row.deliveryMobile ?? "-"}</div>
                        </td>
                        <td>{formatDate(row.createdAt)}</td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="table-inline-actions">
                            <button
                              className="button ghost"
                              disabled={!row.canConfirmInbound || isFallback || busyAction !== null}
                              onClick={() =>
                                void handleAction({
                                  actionKey: "confirm",
                                  title: "COUPANG 교환 입고 확인",
                                  endpoint: "/api/coupang/exchanges/receive-confirmation",
                                  rows: [row],
                                })
                              }
                            >
                              입고확인
                            </button>
                            <button
                              className="button ghost"
                              disabled={!row.canReject || isFallback || busyAction !== null}
                              onClick={() =>
                                void handleAction({
                                  actionKey: "reject",
                                  title: "COUPANG 교환 거부",
                                  endpoint: "/api/coupang/exchanges/reject",
                                  rows: [row],
                                })
                              }
                            >
                              거부
                            </button>
                          </div>
                          {(row.canReject || row.canUploadExchangeInvoice) ? (
                            <div className="inline-form-stack" style={{ marginTop: "0.5rem" }}>
                              <select
                                value={draft.exchangeRejectCode}
                                onChange={(event) =>
                                  setDraftValue(
                                    row.exchangeId,
                                    "exchangeRejectCode",
                                    event.target.value,
                                  )
                                }
                              >
                                <option value="SOLDOUT">SOLDOUT</option>
                                <option value="WITHDRAW">WITHDRAW</option>
                              </select>
                              <input
                                value={draft.goodsDeliveryCode}
                                onChange={(event) =>
                                  setDraftValue(
                                    row.exchangeId,
                                    "goodsDeliveryCode",
                                    event.target.value,
                                  )
                                }
                                placeholder="택배사 코드"
                              />
                              <input
                                value={draft.invoiceNumber}
                                onChange={(event) =>
                                  setDraftValue(
                                    row.exchangeId,
                                    "invoiceNumber",
                                    event.target.value,
                                  )
                                }
                                placeholder="교환 송장번호"
                              />
                              <button
                                className="button ghost"
                                disabled={!row.canUploadExchangeInvoice || isFallback || busyAction !== null}
                                onClick={() =>
                                  void handleAction({
                                    actionKey: "invoice",
                                    title: "COUPANG 교환상품 송장 업로드",
                                    endpoint: "/api/coupang/exchanges/invoices",
                                    rows: [row],
                                  })
                                }
                              >
                                송장 업로드
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">조회 조건에 맞는 교환 요청이 없습니다.</div>
          )}
        </div>

        <div className="card">
          <div className="detail-box-header">
            <div>
              <h2 style={{ margin: 0 }}>교환 상세</h2>
              <div className="muted">교환 사유, 회수 현황, 재배송 송장을 상세하게 확인합니다.</div>
            </div>
            {selectedExchangeId ? <div className="muted">{selectedExchangeId}</div> : null}
          </div>

          {detailQuery.isLoading ? (
            <div className="empty">상세를 불러오는 중입니다.</div>
          ) : detailQuery.error ? (
            <div className="empty">{(detailQuery.error as Error).message}</div>
          ) : detailQuery.data?.item ? (
            <>
              {detailQuery.data.message ? <div className="muted">{detailQuery.data.message}</div> : null}
              <div className="detail-grid">
                <div className="detail-card">
                  <strong>요청 정보</strong>
                  <p>상태: {detailQuery.data.item.status}</p>
                  <p>수거상태: {detailQuery.data.item.collectStatus ?? "-"}</p>
                  <p>사유: {detailQuery.data.item.reason ?? detailQuery.data.item.reasonCode ?? "-"}</p>
                  <p>등록일: {formatDate(detailQuery.data.item.createdAt)}</p>
                  <p>회수완료일: {formatDate(detailQuery.data.item.collectCompleteDate)}</p>
                </div>
                <div className="detail-card">
                  <strong>회수지</strong>
                  <p>{detailQuery.data.item.requester.name ?? "-"}</p>
                  <p>{detailQuery.data.item.requester.mobile ?? detailQuery.data.item.requester.phone ?? "-"}</p>
                  <p>{detailQuery.data.item.requester.postCode ?? "-"}</p>
                  <p>{detailQuery.data.item.requester.address ?? "-"}</p>
                </div>
                <div className="detail-card">
                  <strong>재배송지</strong>
                  <p>{detailQuery.data.item.recipient.name ?? "-"}</p>
                  <p>{detailQuery.data.item.recipient.mobile ?? detailQuery.data.item.recipient.phone ?? "-"}</p>
                  <p>{detailQuery.data.item.recipient.postCode ?? "-"}</p>
                  <p>{detailQuery.data.item.recipient.address ?? "-"}</p>
                </div>
              </div>

              <div className="detail-box">
                <strong>교환 품목</strong>
                {detailQuery.data.item.items.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>상품</th>
                        <th>shipmentBoxId</th>
                        <th>수량</th>
                        <th>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailQuery.data.item.items.map((item, index) => (
                        <tr key={`${item.shipmentBoxId ?? "item"}-${index}`}>
                          <td>{item.targetItemName ?? item.orderItemName ?? item.vendorItemName ?? "-"}</td>
                          <td>{item.shipmentBoxId ?? "-"}</td>
                          <td>{formatNumber(item.quantity ?? 0)}</td>
                          <td>{item.collectStatus ?? item.releaseStatus ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty">교환 품목 상세가 없습니다.</div>
                )}
              </div>

              <div className="detail-box">
                <strong>교환 송장</strong>
                {detailQuery.data.item.invoices.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>shipmentBoxId</th>
                        <th>택배사</th>
                        <th>송장번호</th>
                        <th>예상배송일</th>
                        <th>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailQuery.data.item.invoices.map((invoice, index) => (
                        <tr key={`${invoice.shipmentBoxId ?? "invoice"}-${index}`}>
                          <td>{invoice.shipmentBoxId ?? "-"}</td>
                          <td>{invoice.deliverCode ?? "-"}</td>
                          <td>{invoice.invoiceNumber ?? "-"}</td>
                          <td>{formatDate(invoice.estimatedDeliveryDate)}</td>
                          <td>{invoice.statusCode ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty">등록된 교환 송장이 없습니다.</div>
                )}
              </div>
            </>
          ) : (
            <div className="empty">선택한 교환 요청의 상세가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}
