import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import {
  NAVER_INQUIRY_PAGE_SIZE_OPTIONS,
  type NaverCustomerInquiryRow,
  type NaverInquiryActionResponse,
  type NaverInquiryKind,
  type NaverInquiryListResponse,
  type NaverInquiryRow,
  type NaverProductInquiryRow,
  type NaverProductInquiryTemplateListResponse,
} from "@shared/naver-inquiries";
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
import { formatDate } from "@/lib/utils";

interface StoresResponse {
  items: ChannelStoreSummary[];
}

type FilterState = {
  selectedStoreId: string;
  kind: NaverInquiryKind;
  startDate: string;
  endDate: string;
  answered: "all" | "answered" | "unanswered";
  query: string;
  size: number;
};

type FeedbackState =
  | {
      type: "success" | "warning" | "error";
      title: string;
      message: string;
      details: string[];
    }
  | null;

type DrawerState = {
  id: string;
  answerText: string;
  templateId: string;
};

function defaultDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
  kind: "customer",
  startDate: defaultDate(-6),
  endDate: defaultDate(0),
  answered: "all",
  query: "",
  size: 50,
};

const ANSWER_FILTER_OPTIONS = [
  { value: "all", label: "전체 상태" },
  { value: "unanswered", label: "미답변" },
  { value: "answered", label: "답변 완료" },
] as const;

function buildInquiryUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    kind: filters.kind,
    startDate: filters.startDate,
    endDate: filters.endDate,
    page: "1",
    size: String(filters.size),
  });

  if (filters.answered !== "all") {
    params.set("answered", String(filters.answered === "answered"));
  }

  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }

  return `/api/naver/inquiries?${params.toString()}`;
}

function getInitialAnswerText(item: NaverInquiryRow) {
  return item.kind === "customer" ? item.answerContent ?? "" : item.answer ?? "";
}

function buildActionSummary(result: NaverInquiryActionResponse) {
  return `성공 ${result.summary.succeededCount}건 / 실패 ${result.summary.failedCount}건 / 건너뜀 ${result.summary.skippedCount}건`;
}

function buildActionDetails(result: NaverInquiryActionResponse) {
  return result.items
    .filter((item) => item.status !== "succeeded")
    .slice(0, 6)
    .map((item) => `${item.inquiryId}: ${item.message}`);
}

function isCustomerInquiryRow(item: NaverInquiryRow | null): item is NaverCustomerInquiryRow {
  return Boolean(item && item.kind === "customer");
}

function isProductInquiryRow(item: NaverInquiryRow | null): item is NaverProductInquiryRow {
  return Boolean(item && item.kind === "product");
}

export default function NaverInquiriesPage() {
  const {
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
    publishOperation,
  } = useOperations();
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "naver.inquiries",
    DEFAULT_FILTERS,
  );
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inquiriesQueryKey = [
    "/api/naver/inquiries",
    filters.selectedStoreId,
    filters.kind,
    filters.startDate,
    filters.endDate,
    filters.answered,
    filters.query,
    filters.size,
  ] as const;
  const inquiriesQueryUrl = buildInquiryUrl(filters);
  const templatesQueryKey = ["/api/naver/inquiries/product-templates", filters.selectedStoreId] as const;
  const templatesQueryUrl = `/api/naver/inquiries/product-templates?storeId=${encodeURIComponent(filters.selectedStoreId)}`;

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

  const inquiriesQuery = useQuery({
    queryKey: inquiriesQueryKey,
    queryFn: () => getJson<NaverInquiryListResponse>(inquiriesQueryUrl),
    enabled:
      Boolean(filters.selectedStoreId) &&
      Boolean(filters.startDate) &&
      Boolean(filters.endDate),
    ...queryPresets.listSnapshot,
  });

  const templatesQuery = useQuery({
    queryKey: templatesQueryKey,
    queryFn: () => getJson<NaverProductInquiryTemplateListResponse>(templatesQueryUrl),
    enabled: Boolean(filters.selectedStoreId) && filters.kind === "product",
    ...queryPresets.reference,
  });
  const refreshInquiries = () =>
    refreshQueryData({
      queryKey: inquiriesQueryKey,
      queryFn: () => getJsonWithRefresh<NaverInquiryListResponse>(inquiriesQueryUrl),
      gcTime: queryPresets.listSnapshot.gcTime,
    });
  const refreshTemplates = () =>
    refreshQueryData({
      queryKey: templatesQueryKey,
      queryFn: () => getJsonWithRefresh<NaverProductInquiryTemplateListResponse>(templatesQueryUrl),
      gcTime: queryPresets.reference.gcTime,
    });
  const inquiriesCacheState = getResponseCacheState(inquiriesQuery.data);

  useEffect(() => {
    if (!inquiriesQuery.data || inquiriesQuery.isFetching) {
      return;
    }

    if (!isStaleCachedResponse(inquiriesQuery.data)) {
      return;
    }

    void refreshInquiries();
  }, [inquiriesQuery.data, inquiriesQuery.isFetching]);

  const items = inquiriesQuery.data?.items || [];
  const activeInquiry = useMemo(
    () => (drawerState ? items.find((item) => item.id === drawerState.id) ?? null : null),
    [drawerState, items],
  );
  const answeredCount = items.filter((item) => item.answered).length;
  const unansweredCount = items.length - answeredCount;

  useEffect(() => {
    if (drawerState && !activeInquiry) {
      setDrawerState(null);
    }
  }, [activeInquiry, drawerState]);

  const openDrawer = (item: NaverInquiryRow) => {
    setDrawerState({
      id: item.id,
      answerText: getInitialAnswerText(item),
      templateId: "",
    });
  };

  const closeDrawer = () => {
    if (isSaving) {
      return;
    }

    setDrawerState(null);
  };

  const applyTemplate = () => {
    if (!drawerState?.templateId) {
      return;
    }

    const template = templatesQuery.data?.items.find((item) => item.id === drawerState.templateId);
    if (!template) {
      return;
    }

    setDrawerState((current) =>
      current
        ? {
            ...current,
            answerText: template.content,
          }
        : current,
    );
  };

  async function saveAnswer() {
    if (!drawerState || !activeInquiry || !filters.selectedStoreId) {
      return;
    }

    const answerText = drawerState.answerText.trim();
    if (!answerText) {
      setFeedback({
        type: "error",
        title: "답변 저장 실패",
        message: "답변 내용을 입력해 주세요.",
        details: [],
      });
      return;
    }

    const actionLabel =
      activeInquiry.kind === "customer"
        ? activeInquiry.answered && activeInquiry.answerContentId
          ? "NAVER 고객문의 답변 수정"
          : "NAVER 고객문의 답변 등록"
        : "NAVER 상품문의 답변 저장";

    const toastId = startLocalOperation({
      channel: "naver",
      actionName: actionLabel,
      targetCount: 1,
    });

    setIsSaving(true);
    setFeedback(null);

    try {
      const method =
        isCustomerInquiryRow(activeInquiry) && activeInquiry.answered && activeInquiry.answerContentId
          ? "PUT"
          : activeInquiry.kind === "customer"
            ? "POST"
            : "PUT";
      const url =
        activeInquiry.kind === "customer"
          ? "/api/naver/inquiries/customer/answer"
          : "/api/naver/inquiries/product/answer";
      const result =
        activeInquiry.kind === "customer"
          ? await apiRequestJson<NaverInquiryActionResponse>(method, url, {
              storeId: filters.selectedStoreId,
              items: [
                {
                  inquiryNo: activeInquiry.inquiryNo,
                  answerComment: answerText,
                  answerContentId: activeInquiry.answerContentId,
                  answerTemplateId: drawerState.templateId || null,
                  title: activeInquiry.title,
                  customerName: activeInquiry.customerName,
                },
              ],
            })
          : await apiRequestJson<NaverInquiryActionResponse>(method, url, {
              storeId: filters.selectedStoreId,
              items: [
                {
                  questionId: activeInquiry.questionId,
                  commentContent: answerText,
                  productName: activeInquiry.productName,
                },
              ],
            });

      const summary = buildActionSummary(result);
      const details = buildActionDetails(result);
      const hasWarning = result.summary.failedCount > 0 || result.summary.skippedCount > 0;

      setFeedback({
        type: hasWarning ? "warning" : "success",
        title: hasWarning ? "답변 저장 완료(일부 확인 필요)" : "답변 저장 완료",
        message: summary,
        details,
      });

      if (result.operation) {
        publishOperation(result.operation);
      }

      finishLocalOperation(toastId, {
        status: hasWarning ? "warning" : "success",
        summary,
      });
      window.setTimeout(() => removeLocalOperation(toastId), 1_200);

      await refreshInquiries();
      if (!hasWarning) {
        setDrawerState(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "답변 저장에 실패했습니다.";
      setFeedback({
        type: "error",
        title: "답변 저장 실패",
        message,
        details: [],
      });
      finishLocalOperation(toastId, {
        status: "error",
        errorMessage: message,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="live" label="실연동" />
          <StatusBadge tone="shared" label="실행 가능" />
          <StatusBadge tone="coming" label="읽기 전용 포함" />
        </div>
        <h1>NAVER 문의</h1>
        <p>
          고객문의와 상품문의를 한 화면에서 관리하고, 안전하게 지원되는 답변 등록/수정 작업은
          작업센터와 함께 기록합니다.
        </p>
      </div>

      <div className="card">
        <div className="segmented-control">
          <button
            className={`segmented-button ${filters.kind === "customer" ? "active" : ""}`}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                kind: "customer",
              }))
            }
          >
            고객문의
          </button>
          <button
            className={`segmented-button ${filters.kind === "product" ? "active" : ""}`}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                kind: "product",
              }))
            }
          >
            상품문의
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
            value={filters.startDate}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                startDate: event.target.value,
              }))
            }
          />

          <input
            type="date"
            value={filters.endDate}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                endDate: event.target.value,
              }))
            }
          />

          <select
            value={filters.answered}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                answered: event.target.value as FilterState["answered"],
              }))
            }
          >
            {ANSWER_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
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
            placeholder="문의번호, 상품명, 제목, 작성자 검색"
            style={{ minWidth: 280 }}
          />

          <select
            value={filters.size}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                size: Number(event.target.value),
              }))
            }
          >
            {NAVER_INQUIRY_PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                최대 {option}건
              </option>
            ))}
          </select>

          <button
            className="button secondary"
            onClick={() => {
              void refreshInquiries();
              if (filters.kind === "product") {
                void refreshTemplates();
              }
            }}
            disabled={!filters.selectedStoreId || inquiriesQuery.isFetching}
          >
            {inquiriesQuery.isFetching ? "강제 새로고침 중.." : "강제 새로고침"}
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">조회 문의</div>
          <div className="metric-value">{inquiriesQuery.data?.totalCount ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">답변 완료</div>
          <div className="metric-value">{answeredCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">미답변</div>
          <div className="metric-value">{unansweredCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">최근 동기화</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatDate(inquiriesQuery.data?.fetchedAt)}
          </div>
        </div>
      </div>

      {inquiriesQuery.data ? (
        <ApiFreshnessCard
          fetchedAt={inquiriesQuery.data.fetchedAt}
          cacheState={inquiriesCacheState}
          servedFromCache={inquiriesQuery.data.servedFromCache}
          isFetching={inquiriesQuery.isFetching && Boolean(inquiriesQuery.data)}
        />
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
          ) : (
            <div className="muted">실행 작업은 작업센터에서 상세 이력과 재시도 가능 여부를 함께 확인할 수 있습니다.</div>
          )}
        </div>
      ) : null}

      <div className="card">
        {!stores.length ? (
          <div className="empty">먼저 NAVER 연결관리에서 스토어를 등록해 주세요.</div>
        ) : inquiriesQuery.isLoading ? (
          <div className="empty">NAVER 문의를 불러오는 중입니다.</div>
        ) : inquiriesQuery.error ? (
          <div className="empty">{(inquiriesQuery.error as Error).message}</div>
        ) : items.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>문의</th>
                  <th>상품 / 주문</th>
                  <th>작성자</th>
                  <th>상태</th>
                  <th>등록 / 답변</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div>
                        <strong>
                          {item.kind === "customer" ? item.title : item.productName ?? "상품문의"}
                        </strong>
                      </div>
                      <div className="muted">
                        {item.kind === "customer"
                          ? `문의번호 ${item.inquiryNo}`
                          : `문의번호 ${item.questionId}`}
                      </div>
                      <div className="memo-preview">
                        {item.kind === "customer" ? item.inquiryContent : item.question}
                      </div>
                    </td>
                    <td>
                      {item.kind === "customer" ? (
                        <>
                          <div>{item.productName ?? "-"}</div>
                          <div className="muted">주문 {item.orderId ?? "-"}</div>
                          <div className="muted">
                            상품주문 {item.productOrderIdList.join(", ") || "-"}
                          </div>
                        </>
                      ) : (
                        <>
                          <div>{item.productName ?? "-"}</div>
                          <div className="muted">상품번호 {item.productId ?? "-"}</div>
                        </>
                      )}
                    </td>
                    <td>
                      {item.kind === "customer" ? (
                        <>
                          <div>{item.customerName ?? "-"}</div>
                          <div className="muted">{item.customerId ?? "-"}</div>
                        </>
                      ) : (
                        <>
                          <div>{item.maskedWriterId ?? "-"}</div>
                          <div className="muted">상품문의 작성자</div>
                        </>
                      )}
                    </td>
                    <td>
                      <div className={`status-pill ${item.answered ? "success" : "pending"}`}>
                        {item.answered ? "답변 완료" : "미답변"}
                      </div>
                      <div className="muted">
                        {item.kind === "customer"
                          ? item.category ?? "고객문의"
                          : "상품문의"}
                      </div>
                    </td>
                    <td>
                      <div>{formatDate(item.kind === "customer" ? item.inquiryRegistrationDateTime : item.createDate)}</div>
                      <div className="muted">
                        답변{" "}
                        {formatDate(
                          item.kind === "customer"
                            ? item.answerRegistrationDateTime
                            : item.answer ? item.createDate : null,
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="table-inline-actions">
                        <button className="button ghost" onClick={() => openDrawer(item)}>
                          상세 / {item.answered ? "답변 수정" : "답변 등록"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">조건에 맞는 문의가 없습니다.</div>
        )}
      </div>

      {drawerState && activeInquiry ? (
        <div className="csv-overlay" onClick={closeDrawer}>
          <div
            className="csv-dialog detail-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="card-header">
              <div className="stack" style={{ gap: "0.45rem" }}>
                <div className="hero-badges">
                  <StatusBadge tone="coming" label="읽기 전용" />
                  <StatusBadge tone="shared" label="실행 가능" />
                </div>
                <strong>
                  {activeInquiry.kind === "customer"
                    ? activeInquiry.title
                    : activeInquiry.productName ?? "상품문의"}
                </strong>
                <div className="muted">
                  {activeInquiry.kind === "customer"
                    ? `문의번호 ${activeInquiry.inquiryNo}`
                    : `문의번호 ${activeInquiry.questionId}`}
                </div>
              </div>
              <button className="button ghost" onClick={closeDrawer} disabled={isSaving}>
                닫기
              </button>
            </div>

            <div className="detail-grid">
              <div className="detail-card">
                <strong>스토어</strong>
                <div>{inquiriesQuery.data?.store.name ?? "-"}</div>
              </div>
              <div className="detail-card">
                <strong>답변 상태</strong>
                <div>{activeInquiry.answered ? "답변 완료" : "미답변"}</div>
              </div>
              <div className="detail-card">
                <strong>등록 시각</strong>
                <div>
                  {formatDate(
                    activeInquiry.kind === "customer"
                      ? activeInquiry.inquiryRegistrationDateTime
                      : activeInquiry.createDate,
                  )}
                </div>
              </div>
              <div className="detail-card">
                <strong>답변 수정 여부</strong>
                <div>
                  {activeInquiry.kind === "customer" && activeInquiry.answerContentId
                    ? "기존 답변 수정"
                    : "신규 답변 등록"}
                </div>
              </div>
            </div>

            <div className="detail-columns">
              <div className="detail-box">
                <div className="detail-box-header">
                  <strong>문의 원문</strong>
                  <StatusBadge tone="coming" label="읽기 전용" />
                </div>
                <p>
                  {activeInquiry.kind === "customer"
                    ? activeInquiry.inquiryContent
                    : activeInquiry.question}
                </p>
                <div className="detail-grid">
                  {isCustomerInquiryRow(activeInquiry) ? (
                    <>
                      <div className="detail-card">
                        <strong>고객</strong>
                        <div>{activeInquiry.customerName ?? "-"}</div>
                        <div className="muted">{activeInquiry.customerId ?? "-"}</div>
                      </div>
                      <div className="detail-card">
                        <strong>주문 / 상품</strong>
                        <div>{activeInquiry.orderId ?? "-"}</div>
                        <div className="muted">{activeInquiry.productName ?? "-"}</div>
                      </div>
                    </>
                  ) : isProductInquiryRow(activeInquiry) ? (
                    <>
                      <div className="detail-card">
                        <strong>상품</strong>
                        <div>{activeInquiry.productName ?? "-"}</div>
                        <div className="muted">상품번호 {activeInquiry.productId ?? "-"}</div>
                      </div>
                      <div className="detail-card">
                        <strong>작성자</strong>
                        <div>{activeInquiry.maskedWriterId ?? "-"}</div>
                        <div className="muted">상품문의 작성자</div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="detail-box">
                <div className="detail-box-header">
                  <strong>답변 작성</strong>
                  <StatusBadge tone="shared" label="실행 가능" />
                </div>

                {activeInquiry.kind === "product" ? (
                  <div className="toolbar" style={{ alignItems: "stretch" }}>
                    <select
                      value={drawerState.templateId}
                      onChange={(event) =>
                        setDrawerState((current) =>
                          current
                            ? {
                                ...current,
                                templateId: event.target.value,
                              }
                            : current,
                        )
                      }
                      disabled={templatesQuery.isLoading || !templatesQuery.data?.items.length}
                    >
                      <option value="">답변 템플릿 선택</option>
                      {(templatesQuery.data?.items || []).map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.subject}
                        </option>
                      ))}
                    </select>
                    <button
                      className="button secondary"
                      onClick={applyTemplate}
                      disabled={!drawerState.templateId}
                    >
                      템플릿 적용
                    </button>
                  </div>
                ) : null}

                <textarea
                  value={drawerState.answerText}
                  onChange={(event) =>
                    setDrawerState((current) =>
                      current
                        ? {
                            ...current,
                            answerText: event.target.value,
                          }
                        : current,
                    )
                  }
                  placeholder="답변 내용을 입력하세요."
                  rows={10}
                />

                <div className="muted">
                  저장 즉시 NAVER 문의 답변 API가 호출되며, 실행 결과는 작업센터와 우하단 토스트에
                  함께 기록됩니다.
                </div>

                <div className="detail-actions">
                  <button className="button ghost" onClick={closeDrawer} disabled={isSaving}>
                    취소
                  </button>
                  <button className="button" onClick={() => void saveAnswer()} disabled={isSaving}>
                    {isSaving ? "저장 중..." : activeInquiry.answered ? "답변 수정 저장" : "답변 등록"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
