import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { type LogDetailResponse } from "@shared/logs";
import {
  getOperationActionLabel,
  getOperationErrorSummary,
  getOperationMenuLabel,
  getOperationPayloadPreview,
  getOperationResultSummaryText,
  type OperationLogEntry,
  type OperationStatus,
} from "@shared/operations";
import { StatusBadge } from "@/components/status-badge";
import { useOperations } from "@/components/operation-provider";
import { getOperationLogsHref } from "@/lib/operation-links";
import { getJson, queryPresets } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";

type FilterState = {
  status: "all" | OperationStatus;
  menuKey: "all" | string;
  query: string;
  retryableOnly: boolean;
};

const DEFAULT_FILTERS: FilterState = {
  status: "all",
  menuKey: "all",
  query: "",
  retryableOnly: false,
};

function formatJson(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatTimeRange(operation: OperationLogEntry) {
  const started = new Date(operation.startedAt).toLocaleString("ko-KR");
  if (!operation.finishedAt) {
    return `${started} ~ 진행 중`;
  }

  return `${started} ~ ${new Date(operation.finishedAt).toLocaleString("ko-KR")}`;
}

export default function CoupangLogsPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const {
    operations,
    refreshOperations,
    retryOperation,
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
  } = useOperations();
  const { state: filters, setState: setFilters } = useServerMenuState(
    "coupang.logs",
    DEFAULT_FILTERS,
  );

  const selectedOperationId = useMemo(
    () => new URLSearchParams(search).get("operationId"),
    [search],
  );

  const coupangOperations = useMemo(
    () => operations.filter((operation) => operation.channel === "coupang"),
    [operations],
  );

  const menuOptions = useMemo(
    () => Array.from(new Set(coupangOperations.map((operation) => operation.menuKey))).sort(),
    [coupangOperations],
  );

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return coupangOperations.filter((operation) => {
      if (filters.status !== "all" && operation.status !== filters.status) {
        return false;
      }
      if (filters.menuKey !== "all" && operation.menuKey !== filters.menuKey) {
        return false;
      }
      if (filters.retryableOnly && !operation.retryable) {
        return false;
      }
      if (!query) {
        return true;
      }

      const haystack = [
        operation.menuKey,
        operation.actionKey,
        getOperationMenuLabel(operation.menuKey),
        getOperationActionLabel(operation.actionKey),
        getOperationPayloadPreview(operation),
        getOperationResultSummaryText(operation.resultSummary),
        getOperationErrorSummary(operation),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [coupangOperations, filters]);

  const selectedOperationPreview = useMemo(
    () =>
      coupangOperations.find((operation) => operation.id === selectedOperationId) ??
      null,
    [coupangOperations, selectedOperationId],
  );

  const selectedOperationDetailQuery = useQuery({
    enabled: Boolean(selectedOperationId),
    queryKey: ["/api/logs/detail", selectedOperationId],
    queryFn: () =>
      getJson<LogDetailResponse>(`/api/logs/${encodeURIComponent(selectedOperationId ?? "")}`),
    ...queryPresets.detail,
  });

  const selectedOperationDetail =
    selectedOperationDetailQuery.data?.item?.kind === "operation"
      ? selectedOperationDetailQuery.data.item.operation
      : null;
  const selectedOperation = selectedOperationDetail ?? selectedOperationPreview;

  useEffect(() => {
    if (
      !selectedOperationId ||
      selectedOperationDetailQuery.isLoading ||
      selectedOperation ||
      !coupangOperations.length
    ) {
      return;
    }

    navigate("/coupang/logs", { replace: true });
  }, [
    coupangOperations.length,
    navigate,
    selectedOperationDetailQuery.isLoading,
    selectedOperationId,
    selectedOperation,
  ]);

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="shared" label="채널 로그" />
          <StatusBadge tone="live" label="COUPANG 전용" />
        </div>
        <h1>COUPANG 작업 로그</h1>
        <p>토스트와 작업센터에서 넘어온 COUPANG 작업을 메뉴별로 추적하고, 요청/결과 payload를 상세 패널에서 확인합니다.</p>
      </div>

      <div className="card">
        <div className="toolbar">
          <select
            value={filters.menuKey}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                menuKey: event.target.value,
              }))
            }
          >
            <option value="all">전체 메뉴</option>
            {menuOptions.map((menuKey) => (
              <option key={menuKey} value={menuKey}>
                {getOperationMenuLabel(menuKey)}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as FilterState["status"],
              }))
            }
          >
            <option value="all">전체 상태</option>
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="success">success</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
          </select>
          <input
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                query: event.target.value,
              }))
            }
            placeholder="액션, payload, 오류 검색"
            style={{ minWidth: 260 }}
          />
          <label className="toolbar" style={{ gap: "0.45rem" }}>
            <input
              type="checkbox"
              checked={filters.retryableOnly}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  retryableOnly: event.target.checked,
                }))
              }
            />
            <span className="muted">재시도 가능만 보기</span>
          </label>
          <button className="button secondary" onClick={() => void refreshOperations()}>
            새로고침
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">전체 로그</div>
          <div className="metric-value">{coupangOperations.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">필터 결과</div>
          <div className="metric-value">{filtered.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">실패/경고</div>
          <div className="metric-value">
            {coupangOperations.filter((operation) => operation.status === "error" || operation.status === "warning").length}
          </div>
        </div>
      </div>

      <div className="card">
        {filtered.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>메뉴</th>
                  <th>액션</th>
                  <th>상태</th>
                  <th>모드</th>
                  <th>대상</th>
                  <th>시간</th>
                  <th>요약</th>
                  <th>실행</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((operation) => (
                  <tr
                    key={operation.id}
                    className={selectedOperationId === operation.id ? "table-row-selected" : ""}
                    onClick={() => navigate(getOperationLogsHref("coupang", operation.id))}
                  >
                    <td>
                      <div>
                        <strong>{getOperationMenuLabel(operation.menuKey)}</strong>
                      </div>
                      <div className="muted">{operation.menuKey}</div>
                    </td>
                    <td>
                      <div>
                        <strong>{getOperationActionLabel(operation.actionKey)}</strong>
                      </div>
                      <div className="muted">{operation.actionKey}</div>
                    </td>
                    <td>
                      <span className={`status-pill ${operation.status}`}>{operation.status}</span>
                    </td>
                    <td>{operation.mode}</td>
                    <td>
                      <div>{operation.targetCount}건</div>
                      <div className="muted">{operation.targetIds.slice(0, 3).join(", ") || "-"}</div>
                    </td>
                    <td className="muted">{formatTimeRange(operation)}</td>
                    <td className="muted">
                      {getOperationResultSummaryText(operation.resultSummary) ??
                        getOperationErrorSummary(operation) ??
                        "-"}
                    </td>
                    <td>
                      <div className="table-inline-actions">
                        <button
                          className="button ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(getOperationLogsHref("coupang", operation.id));
                          }}
                        >
                          상세
                        </button>
                        <button
                          className="button secondary"
                          disabled={!operation.retryable}
                          onClick={async (event) => {
                            event.stopPropagation();
                            const localId = startLocalOperation({
                              channel: "coupang",
                              actionName: `${getOperationActionLabel(operation.actionKey)} 재시도`,
                              targetCount: operation.targetCount,
                            });

                            try {
                              await retryOperation(operation.id);
                              finishLocalOperation(localId, {
                                status: "success",
                                summary: "재시도 요청을 다시 등록했습니다.",
                              });
                              window.setTimeout(() => removeLocalOperation(localId), 1_200);
                            } catch (error) {
                              finishLocalOperation(localId, {
                                status: "error",
                                errorMessage:
                                  error instanceof Error ? error.message : "재시도에 실패했습니다.",
                              });
                            }
                          }}
                        >
                          재시도
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">조건에 맞는 COUPANG 로그가 없습니다.</div>
        )}
      </div>

      {selectedOperation ? (
        <div
          className="csv-overlay"
          onClick={() => navigate("/coupang/logs")}
        >
          <div
            className="csv-dialog detail-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="detail-box-header">
              <div>
                <strong>{getOperationMenuLabel(selectedOperation.menuKey)}</strong>
                <div className="muted">
                  {getOperationActionLabel(selectedOperation.actionKey)} · {selectedOperation.id}
                </div>
              </div>
              <div className="table-inline-actions">
                <span className={`status-pill ${selectedOperation.status}`}>{selectedOperation.status}</span>
                <button className="button ghost" onClick={() => navigate("/coupang/logs")}>
                  닫기
                </button>
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-card">
                <strong>기본 정보</strong>
                <p>메뉴: {getOperationMenuLabel(selectedOperation.menuKey)}</p>
                <p>액션: {getOperationActionLabel(selectedOperation.actionKey)}</p>
                <p>모드: {selectedOperation.mode}</p>
                <p>대상: {selectedOperation.targetCount}건 / {selectedOperation.targetType}</p>
                <p>시간: {formatTimeRange(selectedOperation)}</p>
                <p>재시도 가능: {selectedOperation.retryable ? "예" : "아니오"}</p>
              </div>
              <div className="detail-card">
                <strong>결과 요약</strong>
                <p>{getOperationResultSummaryText(selectedOperation.resultSummary) ?? "-"}</p>
                <p>오류: {getOperationErrorSummary(selectedOperation) ?? "-"}</p>
                <p>타겟 ID: {selectedOperation.targetIds.join(", ") || "-"}</p>
              </div>
            </div>

            <div className="detail-columns">
              <div className="detail-box">
                <strong>Request Payload</strong>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {formatJson(selectedOperation.requestPayload)}
                </pre>
              </div>
              <div className="detail-box">
                <strong>Normalized Payload</strong>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {formatJson(selectedOperation.normalizedPayload)}
                </pre>
              </div>
            </div>

            <div className="detail-columns">
              <div className="detail-box">
                <strong>Result Summary</strong>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {formatJson(selectedOperation.resultSummary)}
                </pre>
              </div>
              <div className="detail-box">
                <strong>Error</strong>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {formatJson({
                    errorCode: selectedOperation.errorCode,
                    errorMessage: selectedOperation.errorMessage,
                  })}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
