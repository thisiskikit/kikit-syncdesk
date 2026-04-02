import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CoupangBatchActionResponse,
  CoupangCancelType,
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
  cancelType: CoupangCancelType;
  status: string;
  createdAtFrom: string;
  createdAtTo: string;
  query: string;
};

type ClaimDraft = {
  deliveryCompanyCode: string;
  invoiceNumber: string;
  regNumber: string;
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
  cancelType: "ALL",
  status: "",
  createdAtFrom: defaultDate(-7),
  createdAtTo: defaultDate(0),
  query: "",
};

function buildReturnsUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    createdAtFrom: filters.createdAtFrom,
    createdAtTo: filters.createdAtTo,
    cancelType: filters.cancelType,
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
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function buildInitialDraft(row: CoupangReturnRow): ClaimDraft {
  return {
    deliveryCompanyCode: row.deliveryCompanyCode ?? "CJGLS",
    invoiceNumber: row.deliveryInvoiceNo ?? "",
    regNumber: "",
  };
}

function buildActionTarget(row: CoupangReturnRow, draft: ClaimDraft): CoupangReturnActionTarget {
  return {
    receiptId: row.receiptId,
    cancelCount: row.cancelCount,
    deliveryCompanyCode: draft.deliveryCompanyCode.trim(),
    invoiceNumber: draft.invoiceNumber.trim(),
    orderId: row.orderId,
    shipmentBoxId: row.shipmentBoxId,
    vendorItemId: row.vendorItemId,
    productName: row.productName,
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
  draft: ClaimDraft,
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

function validateCollectionDraft(row: CoupangReturnRow, draft: ClaimDraft) {
  if (!draft.deliveryCompanyCode.trim()) {
    return `${row.receiptId}: 회수 택배사 코드를 입력해 주세요.`;
  }
  if (!draft.invoiceNumber.trim()) {
    return `${row.receiptId}: 회수 송장번호를 입력해 주세요.`;
  }
  return null;
}

function statusClassName(value: string | null | undefined) {
  const normalized = (value || "pending").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return normalized || "pending";
}

export default function CoupangCancelRefundsPage() {
  const {
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
    publishOperation,
  } = useOperations();
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "coupang.cancel-refunds",
    DEFAULT_FILTERS,
  );
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string>("");
  const [drafts, setDrafts] = useState<ClaimDraftMap>({});
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

  const claimsQuery = useQuery({
    queryKey: [
      "/api/coupang/returns",
      filters.selectedStoreId,
      filters.cancelType,
      filters.status,
      filters.createdAtFrom,
      filters.createdAtTo,
    ],
    queryFn: () => getJson<CoupangSimpleListResponse<CoupangReturnRow>>(buildReturnsUrl(filters)),
    enabled:
      Boolean(filters.selectedStoreId) &&
      Boolean(filters.createdAtFrom) &&
      Boolean(filters.createdAtTo),
  });

  const rows = useMemo(
    () => (claimsQuery.data?.items || []).filter((row) => matchesQuery(row, filters.query)),
    [claimsQuery.data?.items, filters.query],
  );
  const isFallback = claimsQuery.data?.source === "fallback";
  const selectedIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIdSet.has(row.id)),
    [rows, selectedIdSet],
  );
  const selectedDetail = rows.find((row) => row.receiptId === selectedReceiptId) ?? null;
  const actionableCount = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.canMarkShipmentStopped ||
          row.canMarkAlreadyShipped ||
          row.canApproveReturn ||
          row.canConfirmInbound ||
          row.canUploadCollectionInvoice,
      ).length,
    [rows],
  );
  const availableStatuses = useMemo(
    () => Array.from(new Set((claimsQuery.data?.items || []).map((row) => row.status))).sort(),
    [claimsQuery.data?.items],
  );

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
      const next: ClaimDraftMap = {};
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

  function setDraftValue(rowId: string, key: keyof ClaimDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [rowId]: {
        ...(current[rowId] ?? buildInitialDraft(rows.find((row) => row.id === rowId)!)),
        [key]: value,
      },
    }));
  }

  async function executeAction(
    action: "stop" | "already",
    targetRows: CoupangReturnRow[],
  ) {
    if (isFallback) {
      setFeedback({
        type: "warning",
        title: "대체 데이터",
        message: "대체 취소/환불 데이터에서는 실행 액션이 잠겨 있습니다.",
        details: [],
      });
      return;
    }

    const eligible = targetRows.filter((row) =>
      action === "stop" ? row.canMarkShipmentStopped : row.canMarkAlreadyShipped,
    );

    if (!eligible.length) {
      setFeedback({
        type: "error",
        title: action === "stop" ? "출고중지완료 불가" : "이미출고 불가",
        message: "선택한 요청 중 실행 가능한 항목이 없습니다.",
        details: [],
      });
      return;
    }

    const items: CoupangReturnActionTarget[] = [];
    const errors: string[] = [];

    for (const row of eligible) {
      const draft = drafts[row.id] ?? buildInitialDraft(row);
      if (action === "already") {
        if (!draft.deliveryCompanyCode.trim()) {
          errors.push(`${row.receiptId}: 택배사 코드가 필요합니다.`);
          continue;
        }
        if (!draft.invoiceNumber.trim()) {
          errors.push(`${row.receiptId}: 송장 번호가 필요합니다.`);
          continue;
        }
      }

      items.push(buildActionTarget(row, draft));
    }

    if (errors.length) {
      setFeedback({
        type: "error",
        title: action === "stop" ? "출고중지완료 검증 실패" : "이미출고 검증 실패",
        message: "실행 전 필수 입력값을 확인해 주세요.",
        details: errors,
      });
      return;
    }

    const endpoint =
      action === "stop"
        ? "/api/coupang/returns/stop-shipment"
        : "/api/coupang/returns/already-shipped";
    const actionName =
      action === "stop" ? "쿠팡 출고중지완료 처리" : "쿠팡 이미출고 처리";
    const localToastId = startLocalOperation({
      channel: "coupang",
      actionName,
      targetCount: items.length,
    });
    setBusyAction(action);
    setFeedback(null);

    try {
      const result = await apiRequestJson<CoupangBatchActionResponse>("POST", endpoint, {
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
        title: action === "stop" ? "출고중지완료 결과" : "이미출고 결과",
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
      window.setTimeout(() => removeLocalOperation(localToastId), 1_200);
      await claimsQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "처리에 실패했습니다.";
      setFeedback({
        type: "error",
        title: action === "stop" ? "출고중지완료 실패" : "이미출고 실패",
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

  async function executeReturnAction(
    action: "approve" | "confirm" | "collection",
    targetRows: CoupangReturnRow[],
  ) {
    if (isFallback) {
      setFeedback({
        type: "warning",
        title: "대체 데이터",
        message: "대체 취소/환불 데이터에서는 실행 액션을 막아 두었습니다.",
        details: [],
      });
      return;
    }

    const eligible = targetRows.filter((row) => {
      if (action === "approve") return row.canApproveReturn;
      if (action === "confirm") return row.canConfirmInbound;
      return row.canUploadCollectionInvoice;
    });

    if (!eligible.length) {
      setFeedback({
        type: "error",
        title:
          action === "approve"
            ? "반품 승인 불가"
            : action === "confirm"
              ? "입고 확인 불가"
              : "회수 송장 등록 불가",
        message: "선택한 요청 중 실행 가능한 건이 없습니다.",
        details: [],
      });
      return;
    }

    let items:
      | CoupangReturnActionTarget[]
      | CoupangReturnCollectionInvoiceTarget[] = [];
    const validationErrors: string[] = [];

    if (action === "collection") {
      items = eligible.flatMap((row) => {
        const draft = drafts[row.id] ?? buildInitialDraft(row);
        const errorMessage = validateCollectionDraft(row, draft);
        if (errorMessage) {
          validationErrors.push(errorMessage);
          return [];
        }
        return [buildCollectionTarget(row, draft)];
      });
    } else {
      items = eligible.map((row) => buildReturnTarget(row));
    }

    if (validationErrors.length) {
      setFeedback({
        type: "error",
        title:
          action === "approve"
            ? "반품 승인 검증 실패"
            : action === "confirm"
              ? "입고 확인 검증 실패"
              : "회수 송장 검증 실패",
        message: "필수 입력값을 확인해 주세요.",
        details: validationErrors,
      });
      return;
    }

    const endpoint =
      action === "approve"
        ? "/api/coupang/returns/approve"
        : action === "confirm"
          ? "/api/coupang/returns/receive-confirmation"
          : "/api/coupang/returns/collection-invoice";
    const actionName =
      action === "approve"
        ? "쿠팡 반품 승인"
        : action === "confirm"
          ? "쿠팡 입고 확인"
          : "쿠팡 회수 송장 등록";
    const localToastId = startLocalOperation({
      channel: "coupang",
      actionName,
      targetCount: items.length,
    });

    setBusyAction(action);
    setFeedback(null);

    try {
      const result = await apiRequestJson<CoupangBatchActionResponse>("POST", endpoint, {
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
        title:
          action === "approve"
            ? "반품 승인 결과"
            : action === "confirm"
              ? "입고 확인 결과"
              : "회수 송장 등록 결과",
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
      window.setTimeout(() => removeLocalOperation(localToastId), 1_200);
      await claimsQuery.refetch();
      await detailQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";
      setFeedback({
        type: "error",
        title:
          action === "approve"
            ? "반품 승인 실패"
            : action === "confirm"
              ? "입고 확인 실패"
              : "회수 송장 등록 실패",
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

  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIdSet.has(row.id));

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge
            tone={claimsQuery.data?.source === "live" ? "live" : "draft"}
            label={claimsQuery.data?.source === "live" ? "실데이터" : "대체데이터"}
          />
          <StatusBadge tone={isFallback ? "shared" : "live"} label={isFallback ? "읽기 전용" : "실행 연동"} />
        </div>
        <h1>쿠팡 취소/환불</h1>
        <p>취소 요청과 반품 요청을 함께 조회하고, 후속 처리까지 같은 화면에서 이어서 실행합니다.</p>
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
          <div className="segmented-control">
            {[
              { value: "ALL", label: "전체" },
              { value: "CANCEL", label: "취소" },
              { value: "RETURN", label: "반품" },
            ].map((option) => (
              <button
                key={option.value}
                className={`segmented-button ${filters.cancelType === option.value ? "active" : ""}`}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    cancelType: option.value as CoupangCancelType,
                  }))
                }
              >
                {option.label}
              </button>
            ))}
          </div>
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
            placeholder="receiptId, 주문번호, 상품명, 요청자 검색"
            style={{ minWidth: 260 }}
          />
          <button
            className="button secondary"
            onClick={() => void claimsQuery.refetch()}
            disabled={!filters.selectedStoreId || claimsQuery.isFetching}
          >
            {claimsQuery.isFetching ? "새로고침 중..." : "새로고침"}
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">조회 요청</div>
          <div className="metric-value">{rows.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">선택 요청</div>
          <div className="metric-value">{selectedRows.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">실행 가능</div>
          <div className="metric-value">{actionableCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">대기 회수송장</div>
          <div className="metric-value">{rows.filter((row) => row.canUploadCollectionInvoice).length}</div>
        </div>
      </div>

      {claimsQuery.data?.message ? (
        <div className="feedback warning">
          <strong>{claimsQuery.data.source === "fallback" ? "대체 데이터 안내" : "조회 메시지"}</strong>
          <div className="muted">{claimsQuery.data.message}</div>
        </div>
      ) : null}

      {isFallback ? (
        <div className="feedback warning">
          <strong>실행 잠금</strong>
          <div className="muted">
            현재 취소/환불 결과는 대체 데이터입니다. 읽기 전용으로만 확인할 수 있습니다.
          </div>
        </div>
      ) : null}

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

      <div className="split">
        <div className="stack">
          <div className="card">
            <div className="toolbar" style={{ justifyContent: "space-between" }}>
              <div className="selection-summary">
                선택 {selectedRows.length}건 / 조회 {rows.length}건
              </div>
              <div className="toolbar">
                {isFallback ? (
                  <div className="muted action-disabled-reason">
                    대체 데이터에서는 실행할 수 없습니다.
                  </div>
                ) : null}
                <button
                  className="button ghost"
                  onClick={() =>
                    setSelectedRowIds((current) => {
                      if (allVisibleSelected) {
                        return current.filter((rowId) => !rows.some((row) => row.id === rowId));
                      }

                      const next = new Set(current);
                      for (const row of rows) {
                        next.add(row.id);
                      }
                      return Array.from(next);
                    })
                  }
                  disabled={!rows.length}
                >
                  {allVisibleSelected ? "현재 목록 선택 해제" : "현재 목록 전체 선택"}
                </button>
                <button
                  className="button secondary"
                  onClick={() => void executeAction("stop", selectedRows)}
                  disabled={!selectedRows.length || isFallback || busyAction !== null}
                  title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                >
                  출고중지완료
                </button>
                <button
                  className="button"
                  onClick={() => void executeAction("already", selectedRows)}
                  disabled={!selectedRows.length || isFallback || busyAction !== null}
                  title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                >
                  이미출고
                </button>
                <button
                  className="button secondary"
                  onClick={() => void executeReturnAction("approve", selectedRows)}
                  disabled={!selectedRows.length || isFallback || busyAction !== null}
                  title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                >
                  반품 승인
                </button>
                <button
                  className="button secondary"
                  onClick={() => void executeReturnAction("confirm", selectedRows)}
                  disabled={!selectedRows.length || isFallback || busyAction !== null}
                  title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                >
                  입고 확인
                </button>
                <button
                  className="button secondary"
                  onClick={() => void executeReturnAction("collection", selectedRows)}
                  disabled={!selectedRows.length || isFallback || busyAction !== null}
                  title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                >
                  회수 송장 등록
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            {!stores.length ? (
              <div className="empty">먼저 쿠팡 연결관리에서 스토어를 저장해 주세요.</div>
            ) : claimsQuery.isLoading ? (
              <div className="empty">취소/환불 요청을 불러오는 중입니다.</div>
            ) : claimsQuery.error ? (
              <div className="empty">{(claimsQuery.error as Error).message}</div>
            ) : rows.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={() =>
                            setSelectedRowIds((current) => {
                              if (allVisibleSelected) {
                                return current.filter((rowId) => !rows.some((row) => row.id === rowId));
                              }

                              const next = new Set(current);
                              for (const row of rows) {
                                next.add(row.id);
                              }
                              return Array.from(next);
                            })
                          }
                        />
                      </th>
                      <th>요청</th>
                      <th>상품</th>
                      <th>상태</th>
                      <th>수량</th>
                      <th>실행</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className={`${selectedIdSet.has(row.id) ? "table-row-selected " : ""}${selectedReceiptId === row.receiptId ? "table-row-action-active" : ""}`}
                        onClick={() => setSelectedReceiptId(row.receiptId)}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIdSet.has(row.id)}
                            onChange={() =>
                              setSelectedRowIds((current) =>
                                current.includes(row.id)
                                  ? current.filter((value) => value !== row.id)
                                  : [...current, row.id],
                              )
                            }
                          />
                        </td>
                        <td>
                          <div>
                            <strong>{row.cancelType === "RETURN" ? "반품" : "취소"}</strong>
                          </div>
                          <div className="muted">receiptId {row.receiptId}</div>
                          <div className="muted">orderId {row.orderId ?? "-"}</div>
                          <div className="muted">{row.requesterName ?? "-"}</div>
                        </td>
                        <td>
                          <div>
                            <strong>{row.productName}</strong>
                          </div>
                          <div className="muted">{row.vendorItemName ?? row.vendorItemId ?? "-"}</div>
                        </td>
                        <td>
                          <div className={`status-pill ${statusClassName(row.status)}`}>{row.status}</div>
                          <div className="table-note">release {row.releaseStatus ?? "-"}</div>
                          <div className="table-note">사유 {row.reasonCode ?? row.reason ?? "-"}</div>
                        </td>
                        <td>
                          <div>구매 {formatNumber(row.purchaseCount)}</div>
                          <div className="muted">취소/반품 {formatNumber(row.cancelCount)}</div>
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="table-inline-actions">
                            <button
                              className="button ghost"
                              disabled={busyAction !== null || isFallback || !row.canMarkShipmentStopped}
                              title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                              onClick={() => void executeAction("stop", [row])}
                            >
                              출고중지완료
                            </button>
                            <button
                              className="button secondary"
                              disabled={busyAction !== null || isFallback || !row.canMarkAlreadyShipped}
                              title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                              onClick={() => void executeAction("already", [row])}
                            >
                              이미출고
                            </button>
                            <button
                              className="button ghost"
                              disabled={busyAction !== null || isFallback || !row.canApproveReturn}
                              title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                              onClick={() => void executeReturnAction("approve", [row])}
                            >
                              반품승인
                            </button>
                            <button
                              className="button ghost"
                              disabled={busyAction !== null || isFallback || !row.canConfirmInbound}
                              title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                              onClick={() => void executeReturnAction("confirm", [row])}
                            >
                              입고확인
                            </button>
                          </div>
                          {row.canMarkAlreadyShipped || row.canUploadCollectionInvoice ? (
                            <div className="inline-form-stack" style={{ marginTop: "0.5rem" }}>
                              <input
                                value={(drafts[row.id] ?? buildInitialDraft(row)).deliveryCompanyCode}
                                onChange={(event) =>
                                  setDraftValue(row.id, "deliveryCompanyCode", event.target.value)
                                }
                                placeholder="택배사 코드"
                              />
                              <input
                                value={(drafts[row.id] ?? buildInitialDraft(row)).invoiceNumber}
                                onChange={(event) =>
                                  setDraftValue(row.id, "invoiceNumber", event.target.value)
                                }
                                placeholder={row.canUploadCollectionInvoice ? "회수 송장번호" : "송장번호"}
                              />
                              {row.canUploadCollectionInvoice ? (
                                <>
                                  <input
                                    value={(drafts[row.id] ?? buildInitialDraft(row)).regNumber}
                                    onChange={(event) =>
                                      setDraftValue(row.id, "regNumber", event.target.value)
                                    }
                                    placeholder="regNumber (선택)"
                                  />
                                  <button
                                    className="button ghost"
                                    disabled={busyAction !== null || isFallback}
                                    onClick={() => void executeReturnAction("collection", [row])}
                                  >
                                    회수송장 등록
                                  </button>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">조건에 맞는 취소/환불 요청이 없습니다.</div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-header">
              <div>
                <strong>요청 상세</strong>
                <div className="muted">상태, 요청자, 회수 정보까지 같은 화면에서 확인합니다.</div>
              </div>
              <StatusBadge
                tone={detailQuery.data?.source === "live" ? "live" : "draft"}
                label={detailQuery.data?.source === "live" ? "실데이터" : "대체데이터"}
              />
            </div>
          </div>

          <div className="card">
            {!selectedDetail ? (
              <div className="empty">왼쪽 목록에서 요청을 선택해 주세요.</div>
            ) : detailQuery.isLoading ? (
              <div className="empty">상세를 불러오는 중입니다.</div>
            ) : detailQuery.error ? (
              <div className="empty">{(detailQuery.error as Error).message}</div>
            ) : detailQuery.data?.item ? (
              <div className="stack">
                {detailQuery.data.message ? <div className="muted">{detailQuery.data.message}</div> : null}
                <div className="detail-grid">
                  <div className="detail-card">
                    <strong>요청 정보</strong>
                    <p>구분: {detailQuery.data.item.cancelType === "RETURN" ? "반품" : "취소"}</p>
                    <p>상태: {detailQuery.data.item.status}</p>
                    <p>receiptId: {detailQuery.data.item.receiptId}</p>
                    <p>orderId: {detailQuery.data.item.orderId ?? "-"}</p>
                    <p>등록일: {formatDate(detailQuery.data.item.createdAt)}</p>
                  </div>
                  <div className="detail-card">
                    <strong>요청자</strong>
                    <p>{detailQuery.data.item.requester.name ?? "-"}</p>
                    <p>{detailQuery.data.item.requester.mobile ?? detailQuery.data.item.requester.phone ?? "-"}</p>
                    <p>{detailQuery.data.item.requester.postCode ?? "-"}</p>
                    <p>{detailQuery.data.item.requester.address ?? "-"}</p>
                  </div>
                  <div className="detail-card">
                    <strong>환불/회수</strong>
                    <p>사유: {detailQuery.data.item.reason ?? detailQuery.data.item.reasonCode ?? "-"}</p>
                    <p>선환불 여부: {detailQuery.data.item.preRefund ? "예" : "아니오"}</p>
                    <p>회수비: {formatNumber(detailQuery.data.item.returnCharge.amount ?? 0)} 원</p>
                    <p>{detailQuery.data.item.returnCharge.rawText ?? "회수비 정보 없음"}</p>
                  </div>
                </div>

                <div className="detail-box">
                  <div className="detail-box-header">
                    <strong>즉시 실행</strong>
                    <span className="muted">선택한 요청 한 건만 바로 처리합니다.</span>
                  </div>
                  <div className="inline-form-stack">
                    <input
                      value={(drafts[selectedDetail.id] ?? buildInitialDraft(selectedDetail)).deliveryCompanyCode}
                      onChange={(event) =>
                        setDraftValue(selectedDetail.id, "deliveryCompanyCode", event.target.value)
                      }
                      placeholder="택배사 코드"
                    />
                    <input
                      value={(drafts[selectedDetail.id] ?? buildInitialDraft(selectedDetail)).invoiceNumber}
                      onChange={(event) =>
                        setDraftValue(selectedDetail.id, "invoiceNumber", event.target.value)
                      }
                      placeholder="송장번호"
                    />
                    <input
                      value={(drafts[selectedDetail.id] ?? buildInitialDraft(selectedDetail)).regNumber}
                      onChange={(event) =>
                        setDraftValue(selectedDetail.id, "regNumber", event.target.value)
                      }
                      placeholder="regNumber (선택)"
                    />
                  </div>
                  <div className="detail-actions">
                    <button
                      className="button ghost"
                      disabled={busyAction !== null || isFallback || !selectedDetail.canMarkShipmentStopped}
                      title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                      onClick={() => void executeAction("stop", [selectedDetail])}
                    >
                      출고중지완료
                    </button>
                    <button
                      className="button secondary"
                      disabled={busyAction !== null || isFallback || !selectedDetail.canMarkAlreadyShipped}
                      title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                      onClick={() => void executeAction("already", [selectedDetail])}
                    >
                      이미출고
                    </button>
                    <button
                      className="button secondary"
                      disabled={busyAction !== null || isFallback || !selectedDetail.canApproveReturn}
                      title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                      onClick={() => void executeReturnAction("approve", [selectedDetail])}
                    >
                      반품 승인
                    </button>
                    <button
                      className="button secondary"
                      disabled={busyAction !== null || isFallback || !selectedDetail.canConfirmInbound}
                      title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                      onClick={() => void executeReturnAction("confirm", [selectedDetail])}
                    >
                      입고 확인
                    </button>
                    <button
                      className="button secondary"
                      disabled={busyAction !== null || isFallback || !selectedDetail.canUploadCollectionInvoice}
                      title={isFallback ? "Fallback 데이터에서는 실행할 수 없습니다." : undefined}
                      onClick={() => void executeReturnAction("collection", [selectedDetail])}
                    >
                      회수 송장 등록
                    </button>
                  </div>
                </div>

                <div className="detail-box">
                  <strong>회수/반송 송장</strong>
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
                  <strong>요청 상품</strong>
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
                    <div className="empty">요청 상품 정보가 없습니다.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="stack">
                <div className="detail-grid">
                  <div className="detail-card">
                    <strong>기본 정보</strong>
                    <p>구분: {selectedDetail.cancelType}</p>
                    <p>receiptId: {selectedDetail.receiptId}</p>
                    <p>orderId: {selectedDetail.orderId ?? "-"}</p>
                    <p>생성일: {formatDate(selectedDetail.createdAt)}</p>
                  </div>
                  <div className="detail-card">
                    <strong>상태</strong>
                    <p>상태: {selectedDetail.status}</p>
                    <p>releaseStatus: {selectedDetail.releaseStatus ?? "-"}</p>
                    <p>receiptType: {selectedDetail.receiptType ?? "-"}</p>
                    <p>사유코드: {selectedDetail.reasonCode ?? "-"}</p>
                  </div>
                  <div className="detail-card">
                    <strong>상품</strong>
                    <p>{selectedDetail.productName}</p>
                    <p>vendorItemId: {selectedDetail.vendorItemId ?? "-"}</p>
                    <p>shipmentBoxId: {selectedDetail.shipmentBoxId ?? "-"}</p>
                    <p>사유: {selectedDetail.reason ?? "-"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
