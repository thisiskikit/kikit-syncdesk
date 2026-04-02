import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CoupangBatchActionResponse,
  CoupangReturnActionTarget,
  CoupangReturnCollectionInvoiceTarget,
  CoupangReturnDetailResponse,
  CoupangReturnRow,
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

type ReturnDraft = {
  deliveryCompanyCode: string;
  invoiceNumber: string;
  regNumber: string;
};

type ReturnDraftMap = Record<string, ReturnDraft>;

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
  createdAtFrom: defaultDate(-7),
  createdAtTo: defaultDate(0),
  query: "",
};

function buildReturnsUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    cancelType: "RETURN",
    createdAtFrom: filters.createdAtFrom,
    createdAtTo: filters.createdAtTo,
  });

  if (filters.status) {
    params.set("status", filters.status);
  }

  return `/api/coupang/returns?${params.toString()}`;
}

function buildDetailUrl(storeId: string, receiptId: string) {
  const params = new URLSearchParams({ storeId, receiptId });
  return `/api/coupang/returns/detail?${params.toString()}`;
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

function matchesQuery(row: CoupangReturnRow, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    row.receiptId,
    row.orderId,
    row.productName,
    row.vendorItemName,
    row.reason,
    row.deliveryInvoiceNo,
    row.requesterName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function buildInitialDraft(row: CoupangReturnRow): ReturnDraft {
  return {
    deliveryCompanyCode: row.deliveryCompanyCode ?? "CJGLS",
    invoiceNumber: row.deliveryInvoiceNo ?? "",
    regNumber: "",
  };
}

function buildReturnTarget(row: CoupangReturnRow): CoupangReturnActionTarget {
  return {
    receiptId: row.receiptId,
    cancelCount: row.cancelCount,
    deliveryCompanyCode: row.deliveryCompanyCode,
    invoiceNumber: row.deliveryInvoiceNo,
    orderId: row.orderId,
    shipmentBoxId: row.shipmentBoxId,
    vendorItemId: row.vendorItemId,
    productName: row.productName,
  };
}

function buildCollectionTarget(
  row: CoupangReturnRow,
  draft: ReturnDraft,
): CoupangReturnCollectionInvoiceTarget {
  return {
    receiptId: row.receiptId,
    returnExchangeDeliveryType: "RETURN",
    deliveryCompanyCode: draft.deliveryCompanyCode.trim(),
    invoiceNumber: draft.invoiceNumber.trim(),
    regNumber: draft.regNumber.trim() || null,
    orderId: row.orderId,
    shipmentBoxId: row.shipmentBoxId,
    vendorItemId: row.vendorItemId,
    productName: row.productName,
  };
}

function validateCollectionDraft(row: CoupangReturnRow, draft: ReturnDraft) {
  if (!row.receiptId) {
    return "receiptId가 없습니다.";
  }
  if (!draft.deliveryCompanyCode.trim()) {
    return "택배사 코드를 입력해 주세요.";
  }
  if (!draft.invoiceNumber.trim()) {
    return "회수 송장번호를 입력해 주세요.";
  }
  return null;
}

function statusClassName(value: string | null | undefined) {
  const normalized = (value || "pending").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return normalized || "pending";
}

export default function CoupangReturnsPage() {
  const {
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
    publishOperation,
  } = useOperations();
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "coupang.returns",
    DEFAULT_FILTERS,
  );
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState("");
  const [drafts, setDrafts] = useState<ReturnDraftMap>({});
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

  const returnsQuery = useQuery({
    queryKey: [
      "/api/coupang/returns",
      "returns-page",
      filters.selectedStoreId,
      filters.status,
      filters.createdAtFrom,
      filters.createdAtTo,
    ],
    queryFn: () =>
      getJson<CoupangSimpleListResponse<CoupangReturnRow>>(buildReturnsUrl(filters)),
    enabled:
      Boolean(filters.selectedStoreId) &&
      Boolean(filters.createdAtFrom) &&
      Boolean(filters.createdAtTo),
  });

  const rows = useMemo(
    () => (returnsQuery.data?.items || []).filter((row) => matchesQuery(row, filters.query)),
    [filters.query, returnsQuery.data?.items],
  );
  const selectedIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIdSet.has(row.id)),
    [rows, selectedIdSet],
  );
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIdSet.has(row.id));
  const availableStatuses = useMemo(
    () => Array.from(new Set((returnsQuery.data?.items || []).map((row) => row.status))).sort(),
    [returnsQuery.data?.items],
  );
  const isFallback = returnsQuery.data?.source === "fallback";

  useEffect(() => {
    setSelectedRowIds((current) => current.filter((rowId) => rows.some((row) => row.id === rowId)));
  }, [rows]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedReceiptId("");
      return;
    }

    if (!selectedReceiptId || !rows.some((row) => row.receiptId === selectedReceiptId)) {
      setSelectedReceiptId(rows[0].receiptId);
    }
  }, [rows, selectedReceiptId]);

  useEffect(() => {
    setDrafts((current) => {
      const next: ReturnDraftMap = {};
      let changed = false;

      for (const row of rows) {
        next[row.id] = current[row.id] ?? buildInitialDraft(row);
        if (!current[row.id]) {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [rows]);

  const detailQuery = useQuery({
    queryKey: ["/api/coupang/returns/detail", filters.selectedStoreId, selectedReceiptId],
    queryFn: () =>
      getJson<CoupangReturnDetailResponse>(
        buildDetailUrl(filters.selectedStoreId, selectedReceiptId),
      ),
    enabled: Boolean(filters.selectedStoreId && selectedReceiptId),
  });

  function setDraftValue(rowId: string, key: keyof ReturnDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [rowId]: {
        ...(current[rowId] ?? buildInitialDraft(rows.find((row) => row.id === rowId)!)),
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
        return current.filter((id) => !rows.some((row) => row.id === id));
      }

      const next = new Set(current);
      for (const row of rows) {
        next.add(row.id);
      }
      return Array.from(next);
    });
  }

  async function handleAction(options: {
    actionKey: "approve" | "confirm" | "collection";
    title: string;
    endpoint: string;
    rows: CoupangReturnRow[];
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
      if (options.actionKey === "approve") return row.canApproveReturn;
      if (options.actionKey === "confirm") return row.canConfirmInbound;
      return row.canUploadCollectionInvoice;
    });

    if (!eligible.length) {
      setFeedback({
        type: "error",
        title: options.title,
        message: "선택한 항목 중 실행 가능한 요청이 없습니다.",
        details: [],
      });
      return;
    }

    let items:
      | CoupangReturnActionTarget[]
      | CoupangReturnCollectionInvoiceTarget[] = [];
    const errors: string[] = [];

    if (options.actionKey === "collection") {
      items = eligible.flatMap((row) => {
        const draft = drafts[row.id] ?? buildInitialDraft(row);
        const message = validateCollectionDraft(row, draft);
        if (message) {
          errors.push(`${row.receiptId}: ${message}`);
          return [];
        }
        return [buildCollectionTarget(row, draft)];
      });
    } else {
      items = eligible.map((row) => buildReturnTarget(row));
    }

    if (errors.length) {
      setFeedback({
        type: "error",
        title: `${options.title} 검증 실패`,
        message: "필수 입력값을 확인해 주세요.",
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
      void returnsQuery.refetch();
      void detailQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "반품 작업에 실패했습니다.";
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
        <h1>COUPANG 반품</h1>
        <p>반품 요청 목록, 회수 정보, 상세 입고 현황을 확인하고 안전하게 승인/입고확인/회수 송장 등록을 수행합니다.</p>
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
            placeholder="주문번호 / 상품명 / 사유 검색"
            style={{ minWidth: 260 }}
          />
          <button className="button secondary" onClick={() => void returnsQuery.refetch()}>
            새로고침
          </button>
        </div>
      </div>

      {returnsQuery.data?.message ? (
        <div className="card">
          <div className="muted">{returnsQuery.data.message}</div>
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
          <div className="metric-label">실행 가능</div>
          <div className="metric-value">
            {rows.filter((row) => row.canApproveReturn || row.canConfirmInbound || row.canUploadCollectionInvoice).length}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">데이터 소스</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {returnsQuery.data?.source ?? "-"}
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
                actionKey: "approve",
                title: "COUPANG 반품 승인",
                endpoint: "/api/coupang/returns/approve",
                rows: selectedRows,
              })
            }
          >
            반품 승인
          </button>
          <button
            className="button secondary"
            disabled={!selectedRows.length || isFallback || busyAction !== null}
            onClick={() =>
              void handleAction({
                actionKey: "confirm",
                title: "COUPANG 반품 입고 확인",
                endpoint: "/api/coupang/returns/receive-confirmation",
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
                actionKey: "collection",
                title: "COUPANG 회수 송장 등록",
                endpoint: "/api/coupang/returns/collection-invoice",
                rows: selectedRows,
              })
            }
          >
            회수 송장 등록
          </button>
          <div className="muted">선택 {selectedRows.length}건</div>
        </div>
      </div>

      <div className="split">
        <div className="card">
          {returnsQuery.isLoading ? (
            <div className="empty">반품 요청을 불러오는 중입니다.</div>
          ) : returnsQuery.error ? (
            <div className="empty">{(returnsQuery.error as Error).message}</div>
          ) : rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleRows} />
                    </th>
                    <th>접수번호</th>
                    <th>주문 / 상품</th>
                    <th>상태</th>
                    <th>회수정보</th>
                    <th>요청자</th>
                    <th>등록일</th>
                    <th>실행</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const draft = drafts[row.id] ?? buildInitialDraft(row);
                    return (
                      <tr
                        key={row.id}
                        className={selectedReceiptId === row.receiptId ? "active-row" : ""}
                        onClick={() => setSelectedReceiptId(row.receiptId)}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIdSet.has(row.id)}
                            onChange={() => toggleRowSelection(row.id)}
                          />
                        </td>
                        <td>
                          <div>
                            <strong>{row.receiptId}</strong>
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
                          <div>{row.deliveryCompanyCode ?? "-"}</div>
                          <div className="muted">{row.deliveryInvoiceNo ?? "미등록"}</div>
                        </td>
                        <td>
                          <div>{row.requesterName ?? "-"}</div>
                          <div className="muted">{row.requesterMobile ?? row.requesterPhone ?? "-"}</div>
                        </td>
                        <td>{formatDate(row.createdAt)}</td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="table-inline-actions">
                            <button
                              className="button ghost"
                              disabled={!row.canApproveReturn || isFallback || busyAction !== null}
                              onClick={() =>
                                void handleAction({
                                  actionKey: "approve",
                                  title: "COUPANG 반품 승인",
                                  endpoint: "/api/coupang/returns/approve",
                                  rows: [row],
                                })
                              }
                            >
                              승인
                            </button>
                            <button
                              className="button ghost"
                              disabled={!row.canConfirmInbound || isFallback || busyAction !== null}
                              onClick={() =>
                                void handleAction({
                                  actionKey: "confirm",
                                  title: "COUPANG 반품 입고 확인",
                                  endpoint: "/api/coupang/returns/receive-confirmation",
                                  rows: [row],
                                })
                              }
                            >
                              입고확인
                            </button>
                          </div>
                          {row.canUploadCollectionInvoice ? (
                            <div className="inline-form-stack" style={{ marginTop: "0.5rem" }}>
                              <input
                                value={draft.deliveryCompanyCode}
                                onChange={(event) =>
                                  setDraftValue(row.id, "deliveryCompanyCode", event.target.value)
                                }
                                placeholder="택배사 코드"
                              />
                              <input
                                value={draft.invoiceNumber}
                                onChange={(event) =>
                                  setDraftValue(row.id, "invoiceNumber", event.target.value)
                                }
                                placeholder="회수 송장번호"
                              />
                              <input
                                value={draft.regNumber}
                                onChange={(event) =>
                                  setDraftValue(row.id, "regNumber", event.target.value)
                                }
                                placeholder="regNumber (선택)"
                              />
                              <button
                                className="button ghost"
                                disabled={isFallback || busyAction !== null}
                                onClick={() =>
                                  void handleAction({
                                    actionKey: "collection",
                                    title: "COUPANG 회수 송장 등록",
                                    endpoint: "/api/coupang/returns/collection-invoice",
                                    rows: [row],
                                  })
                                }
                              >
                                회수송장 등록
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
            <div className="empty">조회 조건에 맞는 반품 요청이 없습니다.</div>
          )}
        </div>

        <div className="card">
          <div className="detail-box-header">
            <div>
              <h2 style={{ margin: 0 }}>반품 상세</h2>
              <div className="muted">접수번호 기준 상세 / 회수 / 상품 정보를 확인합니다.</div>
            </div>
            {selectedReceiptId ? <div className="muted">{selectedReceiptId}</div> : null}
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
                  <p>유형: {detailQuery.data.item.cancelType}</p>
                  <p>사유: {detailQuery.data.item.reason ?? detailQuery.data.item.reasonCode ?? "-"}</p>
                  <p>등록일: {formatDate(detailQuery.data.item.createdAt)}</p>
                  <p>완료일: {formatDate(detailQuery.data.item.completeConfirmDate)}</p>
                </div>
                <div className="detail-card">
                  <strong>요청자</strong>
                  <p>{detailQuery.data.item.requester.name ?? "-"}</p>
                  <p>{detailQuery.data.item.requester.mobile ?? detailQuery.data.item.requester.phone ?? "-"}</p>
                  <p>{detailQuery.data.item.requester.postCode ?? "-"}</p>
                  <p>{detailQuery.data.item.requester.address ?? "-"}</p>
                </div>
                <div className="detail-card">
                  <strong>회수비</strong>
                  <p>{formatNumber(detailQuery.data.item.returnCharge.amount ?? 0)} 원</p>
                  <p>{detailQuery.data.item.returnCharge.rawText ?? "정형 수치 없음"}</p>
                  <p>선환불 여부: {detailQuery.data.item.preRefund ? "예" : "아니오"}</p>
                </div>
              </div>

              <div className="detail-box">
                <strong>회수 송장</strong>
                {detailQuery.data.item.deliveries.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>구분</th>
                        <th>택배사</th>
                        <th>송장번호</th>
                        <th>regNumber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailQuery.data.item.deliveries.map((delivery, index) => (
                        <tr key={`${delivery.returnDeliveryId ?? "delivery"}-${index}`}>
                          <td>{delivery.returnExchangeDeliveryType ?? "-"}</td>
                          <td>{delivery.deliveryCompanyCode ?? "-"}</td>
                          <td>{delivery.deliveryInvoiceNo ?? "-"}</td>
                          <td>{delivery.regNumber ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty">등록된 회수 송장이 없습니다.</div>
                )}
              </div>

              <div className="detail-box">
                <strong>반품 상품</strong>
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
                          <td>{item.vendorItemName ?? item.vendorItemId ?? "-"}</td>
                          <td>{item.shipmentBoxId ?? "-"}</td>
                          <td>{formatNumber(item.cancelCount ?? item.purchaseCount ?? 0)}</td>
                          <td>{item.releaseStatusName ?? item.releaseStatus ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty">반품 상세 품목이 없습니다.</div>
                )}
              </div>
            </>
          ) : (
            <div className="empty">선택한 반품 요청의 상세가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}
