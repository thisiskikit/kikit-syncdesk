import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CoupangStoreSummary } from "@shared/coupang";
import type {
  CoupangCallCenterInquiryRow,
  CoupangInquiryAnswerResponse,
  CoupangInquiryConfirmResponse,
  CoupangInquiryReply,
  CoupangInquiryListResponse,
  CoupangProductInquiryRow,
} from "@shared/coupang-support";
import { StatusBadge } from "@/components/status-badge";
import { useOperations } from "@/components/operation-provider";
import { apiRequestJson, getJson } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate } from "@/lib/utils";

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

type InquiryPanel = "product" | "callCenter";
type ProductAnsweredType = "ALL" | "ANSWERED" | "NOANSWER";
type CallCenterStatusType = "NONE" | "ANSWER" | "NO_ANSWER" | "TRANSFER";

type FilterState = {
  selectedStoreId: string;
  panel: InquiryPanel;
  inquiryStartAt: string;
  inquiryEndAt: string;
  productAnsweredType: ProductAnsweredType;
  callCenterStatus: CallCenterStatusType;
  query: string;
  pageSize: number;
  pageNum: number;
  selectedInquiryId: string;
  operatorName: string;
};

type FeedbackState =
  | {
      type: "success" | "warning" | "error";
      title: string;
      message: string;
      details?: string[];
    }
  | null;

function defaultDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
  panel: "product",
  inquiryStartAt: defaultDate(-6),
  inquiryEndAt: defaultDate(0),
  productAnsweredType: "ALL",
  callCenterStatus: "NONE",
  query: "",
  pageSize: 20,
  pageNum: 1,
  selectedInquiryId: "",
  operatorName: "",
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50] as const;

function buildProductInquiryUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    inquiryStartAt: filters.inquiryStartAt,
    inquiryEndAt: filters.inquiryEndAt,
    answeredType: filters.productAnsweredType,
    pageSize: String(filters.pageSize),
    pageNum: String(filters.pageNum),
  });

  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }

  return `/api/coupang/inquiries/product?${params.toString()}`;
}

function buildCallCenterInquiryUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    inquiryStartAt: filters.inquiryStartAt,
    inquiryEndAt: filters.inquiryEndAt,
    partnerCounselingStatus: filters.callCenterStatus,
    pageSize: String(filters.pageSize),
    pageNum: String(filters.pageNum),
  });

  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }

  return `/api/coupang/inquiries/call-center?${params.toString()}`;
}

function summarizeReply(reply: CoupangInquiryReply) {
  const authorLabel =
    reply.authorType === "vendor"
      ? "판매자"
      : reply.authorType === "csAgent"
        ? "쿠팡 CS"
        : reply.authorType === "system"
          ? "시스템"
          : "알 수 없음";

  return `${authorLabel}${reply.receptionistName ? ` · ${reply.receptionistName}` : ""}`;
}

function normalizeNeedAnswerReply(replies: CoupangInquiryReply[]) {
  return replies
    .filter((reply) => reply.answerId || reply.replyId)
    .findLast((reply) => {
      if (reply.needAnswer) {
        return true;
      }

      const transferStatus = reply.partnerTransferStatus?.toLowerCase() ?? "";
      return transferStatus.includes("request");
    });
}

function getStatusTone(needsAnswer: boolean, answered: boolean) {
  if (needsAnswer) {
    return "pending";
  }

  if (answered) {
    return "success";
  }

  return "draft";
}

function isCallCenterInquiry(
  item: CoupangProductInquiryRow | CoupangCallCenterInquiryRow | null,
): item is CoupangCallCenterInquiryRow {
  return Boolean(item && item.inquiryType === "callCenter");
}

function isProductInquiry(
  item: CoupangProductInquiryRow | CoupangCallCenterInquiryRow | null,
): item is CoupangProductInquiryRow {
  return Boolean(item && item.inquiryType === "product");
}

export default function CoupangInquiriesPage() {
  const {
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
    publishOperation,
  } = useOperations();
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "coupang.inquiries",
    DEFAULT_FILTERS,
  );
  const [draftReply, setDraftReply] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSubmitting, setIsSubmitting] = useState<null | "answer" | "confirm">(null);

  const storesQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
  });

  const stores = storesQuery.data?.items ?? [];

  useEffect(() => {
    if (!isFiltersLoaded || filters.selectedStoreId || !stores[0]) {
      return;
    }

    setFilters((current) => ({
      ...current,
      selectedStoreId: stores[0].id,
    }));
  }, [filters.selectedStoreId, isFiltersLoaded, setFilters, stores]);

  const productInquiriesQuery = useQuery({
    queryKey: [
      "/api/coupang/inquiries/product",
      filters.selectedStoreId,
      filters.inquiryStartAt,
      filters.inquiryEndAt,
      filters.productAnsweredType,
      filters.query,
      filters.pageSize,
      filters.pageNum,
    ],
    queryFn: () =>
      getJson<CoupangInquiryListResponse<CoupangProductInquiryRow>>(buildProductInquiryUrl(filters)),
    enabled: Boolean(filters.selectedStoreId) && filters.panel === "product",
  });

  const callCenterInquiriesQuery = useQuery({
    queryKey: [
      "/api/coupang/inquiries/call-center",
      filters.selectedStoreId,
      filters.inquiryStartAt,
      filters.inquiryEndAt,
      filters.callCenterStatus,
      filters.query,
      filters.pageSize,
      filters.pageNum,
    ],
    queryFn: () =>
      getJson<CoupangInquiryListResponse<CoupangCallCenterInquiryRow>>(buildCallCenterInquiryUrl(filters)),
    enabled: Boolean(filters.selectedStoreId) && filters.panel === "callCenter",
  });

  const activeQuery = filters.panel === "product" ? productInquiriesQuery : callCenterInquiriesQuery;
  const items = activeQuery.data?.items ?? [];
  const selectedInquiry = useMemo(
    () => items.find((item) => item.id === filters.selectedInquiryId) ?? items[0] ?? null,
    [filters.selectedInquiryId, items],
  );
  const replyTarget = useMemo(
    () => (isCallCenterInquiry(selectedInquiry) ? normalizeNeedAnswerReply(selectedInquiry.replies) : null),
    [selectedInquiry],
  );
  const liveMode = activeQuery.data?.source === "live";
  const answeredCount = items.filter((item) =>
    item.inquiryType === "product" ? item.answered : !item.needsAnswer,
  ).length;
  const pendingCount = items.filter((item) => item.needsAnswer).length;

  useEffect(() => {
    if (!selectedInquiry) {
      if (filters.selectedInquiryId) {
        setFilters((current) => ({
          ...current,
          selectedInquiryId: "",
        }));
      }
      return;
    }

    if (selectedInquiry.id !== filters.selectedInquiryId) {
      setFilters((current) => ({
        ...current,
        selectedInquiryId: selectedInquiry.id,
      }));
    }
  }, [filters.selectedInquiryId, selectedInquiry, setFilters]);

  useEffect(() => {
    setDraftReply("");
    setFeedback(null);
  }, [selectedInquiry?.id]);

  async function runAction<T extends CoupangInquiryAnswerResponse | CoupangInquiryConfirmResponse>(input: {
    type: "answer" | "confirm";
    title: string;
    request: () => Promise<T>;
    onSuccess: (result: T) => Promise<void>;
  }) {
    const toastId = startLocalOperation({
      channel: "coupang",
      actionName: input.title,
      targetCount: 1,
    });

    setIsSubmitting(input.type);
    setFeedback(null);

    try {
      const result = await input.request();
      if (result.operation) {
        publishOperation(result.operation);
      }

      await input.onSuccess(result);

      finishLocalOperation(toastId, {
        status: "success",
        summary: result.message,
      });
      window.setTimeout(() => removeLocalOperation(toastId), 1_000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "쿠팡 문의 작업 중 오류가 발생했습니다.";
      setFeedback({
        type: "error",
        title: "작업 실패",
        message,
      });
      finishLocalOperation(toastId, {
        status: "error",
        errorMessage: message,
      });
    } finally {
      setIsSubmitting(null);
    }
  }

  async function submitAnswer() {
    if (!selectedInquiry || !filters.selectedStoreId) {
      return;
    }

    const content = draftReply.trim();
    const replyBy = filters.operatorName.trim();
    if (!replyBy) {
      setFeedback({
        type: "warning",
        title: "작업자 정보 필요",
        message: "답변자 이름 또는 ID를 먼저 입력해 주세요.",
      });
      return;
    }
    if (!content) {
      setFeedback({
        type: "warning",
        title: "답변 내용 필요",
        message: "등록할 답변 내용을 입력해 주세요.",
      });
      return;
    }

    if (isProductInquiry(selectedInquiry)) {
      await runAction({
        type: "answer",
        title: "COUPANG 상품문의 답변",
        request: () =>
          apiRequestJson<CoupangInquiryAnswerResponse>("POST", "/api/coupang/inquiries/product/answer", {
            storeId: filters.selectedStoreId,
            inquiryId: selectedInquiry.inquiryId,
            content,
            replyBy,
          }),
        onSuccess: async (result) => {
          setFeedback({
            type: "success",
            title: "상품문의 답변 완료",
            message: result.message,
          });
          setDraftReply("");
          await productInquiriesQuery.refetch();
        },
      });
      return;
    }

    if (!replyTarget?.answerId) {
      setFeedback({
        type: "warning",
        title: "답변 대상 없음",
        message: "현재 문의에서 답변할 parentAnswerId를 찾지 못했습니다.",
      });
      return;
    }

    await runAction({
      type: "answer",
      title: "COUPANG CS 문의 답변",
      request: () =>
        apiRequestJson<CoupangInquiryAnswerResponse>("POST", "/api/coupang/inquiries/call-center/answer", {
          storeId: filters.selectedStoreId,
          inquiryId: selectedInquiry.inquiryId,
          content,
          replyBy,
          parentAnswerId: replyTarget.answerId,
        }),
      onSuccess: async (result) => {
        setFeedback({
          type: "success",
          title: "CS 문의 답변 완료",
          message: result.message,
        });
        setDraftReply("");
        await callCenterInquiriesQuery.refetch();
      },
    });
  }

  async function confirmInquiry() {
    if (!isCallCenterInquiry(selectedInquiry) || !filters.selectedStoreId) {
      return;
    }

    const confirmBy = filters.operatorName.trim();
    if (!confirmBy) {
      setFeedback({
        type: "warning",
        title: "작업자 정보 필요",
        message: "확인 처리할 작업자 이름 또는 ID를 먼저 입력해 주세요.",
      });
      return;
    }

    await runAction({
      type: "confirm",
      title: "COUPANG CS 문의 확인",
      request: () =>
        apiRequestJson<CoupangInquiryConfirmResponse>("POST", "/api/coupang/inquiries/call-center/confirm", {
          storeId: filters.selectedStoreId,
          inquiryId: selectedInquiry.inquiryId,
          confirmBy,
        }),
      onSuccess: async (result) => {
        setFeedback({
          type: "success",
          title: "CS 문의 확인 완료",
          message: result.message,
        });
        await callCenterInquiriesQuery.refetch();
      },
    });
  }

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone={liveMode ? "live" : "draft"} />
          <StatusBadge tone="shared" label="작업 로그 연동" />
        </div>
        <h1>COUPANG 문의 / CS</h1>
        <p>
          상품문의 답변과 쿠팡 고객센터 이관 문의의 확인, 답변 작업을 한 화면에서 처리합니다.
          라이브 응답일 때는 바로 작업하고, fallback 응답일 때는 상세 확인만 할 수 있습니다.
        </p>
      </div>

      <div className="card">
        <div className="segmented-control">
          <button
            type="button"
            className={`segmented-button ${filters.panel === "product" ? "active" : ""}`}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                panel: "product",
                pageNum: 1,
                selectedInquiryId: "",
              }))
            }
          >
            상품문의
          </button>
          <button
            type="button"
            className={`segmented-button ${filters.panel === "callCenter" ? "active" : ""}`}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                panel: "callCenter",
                pageNum: 1,
                selectedInquiryId: "",
              }))
            }
          >
            고객센터 이관 문의
          </button>
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
                pageNum: 1,
                selectedInquiryId: "",
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
            value={filters.inquiryStartAt}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                inquiryStartAt: event.target.value,
                pageNum: 1,
              }))
            }
          />

          <input
            type="date"
            value={filters.inquiryEndAt}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                inquiryEndAt: event.target.value,
                pageNum: 1,
              }))
            }
          />

          {filters.panel === "product" ? (
            <select
              value={filters.productAnsweredType}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  productAnsweredType: event.target.value as ProductAnsweredType,
                  pageNum: 1,
                }))
              }
            >
              <option value="ALL">전체 상태</option>
              <option value="NOANSWER">미답변</option>
              <option value="ANSWERED">답변완료</option>
            </select>
          ) : (
            <select
              value={filters.callCenterStatus}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  callCenterStatus: event.target.value as CallCenterStatusType,
                  pageNum: 1,
                }))
              }
            >
              <option value="NONE">전체 상담상태</option>
              <option value="NO_ANSWER">답변 필요</option>
              <option value="ANSWER">답변 완료</option>
              <option value="TRANSFER">이관</option>
            </select>
          )}

          <input
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                query: event.target.value,
                pageNum: 1,
              }))
            }
            placeholder="문의 내용, 상품명, 주문번호 검색"
            style={{ minWidth: 260 }}
          />

          <select
            value={filters.pageSize}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                pageSize: Number(event.target.value),
                pageNum: 1,
              }))
            }
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}개씩
              </option>
            ))}
          </select>

          <input
            value={filters.operatorName}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                operatorName: event.target.value,
              }))
            }
            placeholder="답변자 / 작업자 ID"
            style={{ minWidth: 180 }}
          />

          <button
            className="button secondary"
            disabled={!filters.selectedStoreId}
            onClick={() => void activeQuery.refetch()}
          >
            새로고침
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">조회 건수</div>
          <div className="metric-value">{items.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">답변 완료</div>
          <div className="metric-value">{answeredCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">답변 필요</div>
          <div className="metric-value">{pendingCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">데이터 소스</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {activeQuery.data?.source ?? "-"}
          </div>
        </div>
      </div>

      {activeQuery.data?.message ? (
        <div className="feedback warning">
          <strong>조회 메모</strong>
          <div className="muted">{activeQuery.data.message}</div>
        </div>
      ) : null}

      {feedback ? (
        <div className={`feedback ${feedback.type}`}>
          <strong>{feedback.title}</strong>
          <div>{feedback.message}</div>
          {feedback.details?.length ? (
            <ul className="messages">
              {feedback.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="split">
        <div className="card">
          <div className="card-header">
            <div>
              <strong>{filters.panel === "product" ? "상품문의 목록" : "고객센터 이관 문의 목록"}</strong>
              <div className="muted">
                행을 클릭하면 우측에서 문의 원문과 히스토리를 확인하고 바로 작업할 수 있습니다.
              </div>
            </div>
            <StatusBadge tone={liveMode ? "live" : "draft"} label={liveMode ? "실연동" : "fallback"} />
          </div>

          {activeQuery.isLoading ? (
            <div className="empty">문의 목록을 불러오는 중입니다.</div>
          ) : activeQuery.error ? (
            <div className="empty">{(activeQuery.error as Error).message}</div>
          ) : items.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>문의</th>
                    <th>상품 / 주문</th>
                    <th>상태</th>
                    <th>접수일</th>
                    <th>최근 처리</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isSelected = selectedInquiry?.id === item.id;
                    const statusText =
                      item.inquiryType === "product"
                        ? item.needsAnswer
                          ? "미답변"
                          : "답변완료"
                        : item.needsAnswer
                          ? "답변 필요"
                          : item.counselingStatus || item.inquiryStatus;

                    const recentAt =
                      item.inquiryType === "product" ? item.lastAnsweredAt : item.answeredAt;

                    return (
                      <tr
                        key={item.id}
                        className={isSelected ? "table-row-selected" : undefined}
                        onClick={() =>
                          setFilters((current) => ({
                            ...current,
                            selectedInquiryId: item.id,
                          }))
                        }
                      >
                        <td>
                          <div>
                            <strong>{item.content}</strong>
                          </div>
                          <div className="muted">
                            {item.inquiryType === "product" ? "상품문의" : "고객센터 이관"}
                          </div>
                        </td>
                        <td>
                          <div>{item.productName || "-"}</div>
                          <div className="muted">
                            {item.inquiryType === "product"
                              ? item.orderIds.join(", ") || item.vendorItemId || "-"
                              : item.orderId || item.vendorItemIds.join(", ") || "-"}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`status-pill ${getStatusTone(
                              item.needsAnswer,
                              item.inquiryType === "product" ? item.answered : !item.needsAnswer,
                            )}`}
                          >
                            {statusText}
                          </span>
                          {item.inquiryType === "callCenter" && item.counselingStatus ? (
                            <div className="muted">{item.counselingStatus}</div>
                          ) : null}
                        </td>
                        <td>{formatDate(item.inquiryAt)}</td>
                        <td>{formatDate(recentAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">조건에 맞는 문의가 없습니다.</div>
          )}

          {activeQuery.data?.pagination ? (
            <div className="detail-actions" style={{ marginTop: "1rem" }}>
              <button
                className="button ghost"
                disabled={filters.pageNum <= 1}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    pageNum: Math.max(1, current.pageNum - 1),
                  }))
                }
              >
                이전 페이지
              </button>
              <div className="muted" style={{ alignSelf: "center" }}>
                {activeQuery.data.pagination.currentPage ?? filters.pageNum} /{" "}
                {activeQuery.data.pagination.totalPages ?? "-"} 페이지
              </div>
              <button
                className="button ghost"
                disabled={
                  activeQuery.data.pagination.totalPages !== null &&
                  filters.pageNum >= activeQuery.data.pagination.totalPages
                }
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    pageNum: current.pageNum + 1,
                  }))
                }
              >
                다음 페이지
              </button>
            </div>
          ) : null}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-header">
              <div>
                <strong>문의 상세</strong>
                <div className="muted">원문, 주문 연계 정보, 회신 히스토리를 확인합니다.</div>
              </div>
              {selectedInquiry ? (
                <span
                  className={`status-pill ${getStatusTone(
                    selectedInquiry.needsAnswer,
                    selectedInquiry.inquiryType === "product"
                      ? selectedInquiry.answered
                      : !selectedInquiry.needsAnswer,
                  )}`}
                >
                  {selectedInquiry.needsAnswer ? "답변 필요" : "처리됨"}
                </span>
              ) : null}
            </div>

            {!selectedInquiry ? (
              <div className="empty">왼쪽 목록에서 문의를 선택해 주세요.</div>
            ) : (
              <div className="stack">
                <div className="detail-card">
                  <strong>{selectedInquiry.productName || "상품명 없음"}</strong>
                  <p>{selectedInquiry.content}</p>
                  <div className="muted">접수일 {formatDate(selectedInquiry.inquiryAt)}</div>
                </div>

                <div className="detail-columns">
                  <div className="detail-box">
                    <strong>연계 정보</strong>
                    {isProductInquiry(selectedInquiry) ? (
                      <>
                        <p>상품번호: {selectedInquiry.sellerProductId ?? "-"}</p>
                        <p>vendorItemId: {selectedInquiry.vendorItemId ?? "-"}</p>
                        <p>주문번호: {selectedInquiry.orderIds.join(", ") || "-"}</p>
                      </>
                    ) : (
                      <>
                        <p>주문번호: {selectedInquiry.orderId ?? "-"}</p>
                        <p>vendorItemIds: {selectedInquiry.vendorItemIds.join(", ") || "-"}</p>
                        <p>구매자 연락처: {selectedInquiry.buyerPhone ?? "-"}</p>
                        <p>접수 카테고리: {selectedInquiry.receiptCategory ?? "-"}</p>
                      </>
                    )}
                  </div>

                  <div className="detail-box">
                    <strong>상태 정보</strong>
                    {isProductInquiry(selectedInquiry) ? (
                      <>
                        <p>답변 여부: {selectedInquiry.answered ? "답변 완료" : "미답변"}</p>
                        <p>최근 답변일: {formatDate(selectedInquiry.lastAnsweredAt)}</p>
                      </>
                    ) : (
                      <>
                        <p>문의 상태: {selectedInquiry.inquiryStatus || "-"}</p>
                        <p>상담 상태: {selectedInquiry.counselingStatus || "-"}</p>
                        <p>답변 완료일: {formatDate(selectedInquiry.answeredAt)}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="detail-box">
                  <div className="detail-box-header">
                    <strong>회신 히스토리</strong>
                    {replyTarget?.answerId ? (
                      <span className="muted">답변 대상 answerId {replyTarget.answerId}</span>
                    ) : null}
                  </div>
                  {selectedInquiry.replies.length ? (
                    <div className="stack" style={{ gap: "0.75rem" }}>
                      {selectedInquiry.replies.map((reply) => (
                        <div key={reply.replyId} className="detail-card">
                          <div className="detail-box-header">
                            <strong>{summarizeReply(reply)}</strong>
                            <div className="muted">{formatDate(reply.repliedAt)}</div>
                          </div>
                          <p>{reply.content}</p>
                          <div className="muted">
                            {reply.partnerTransferStatus ? `이관 상태 ${reply.partnerTransferStatus}` : "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="muted">회신 이력이 없습니다.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <strong>답변 / 확인 작업</strong>
                <div className="muted">
                  fallback 응답에서는 쓰기 액션을 잠그고, 라이브 응답에서만 전송합니다.
                </div>
              </div>
              <StatusBadge tone={liveMode ? "live" : "draft"} label={liveMode ? "쓰기 가능" : "읽기 전용"} />
            </div>

            {!selectedInquiry ? (
              <div className="empty">작업할 문의를 먼저 선택해 주세요.</div>
            ) : (
              <div className="stack">
                {isCallCenterInquiry(selectedInquiry) ? (
                  <div className="detail-box">
                    <strong>CS 확인 처리</strong>
                    <p>
                      고객센터 이관 문의는 먼저 확인 처리 후 답변하는 경우가 많습니다. 현재 상담 상태는{" "}
                      <strong>{selectedInquiry.counselingStatus || "-"}</strong> 입니다.
                    </p>
                    <div className="detail-actions">
                      <button
                        className="button secondary"
                        disabled={!liveMode || isSubmitting !== null}
                        onClick={() => void confirmInquiry()}
                      >
                        {isSubmitting === "confirm" ? "처리 중..." : "확인 완료 처리"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <label className="field">
                  <span>답변 내용</span>
                  <textarea
                    rows={6}
                    value={draftReply}
                    onChange={(event) => setDraftReply(event.target.value)}
                    placeholder={
                      isProductInquiry(selectedInquiry)
                        ? "상품문의에 등록할 답변을 입력해 주세요."
                        : "고객센터 이관 문의에 전달할 답변을 입력해 주세요."
                    }
                  />
                </label>

                <div className="detail-actions">
                  <button
                    className="button"
                    disabled={
                      !liveMode ||
                      isSubmitting !== null ||
                      (isCallCenterInquiry(selectedInquiry) && !replyTarget?.answerId)
                    }
                    onClick={() => void submitAnswer()}
                  >
                    {isSubmitting === "answer"
                      ? "전송 중..."
                      : isProductInquiry(selectedInquiry)
                        ? "상품문의 답변 등록"
                        : "CS 문의 답변 등록"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
