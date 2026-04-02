import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CoupangStoreSummary } from "@shared/coupang";
import type {
  CoupangCashbackRuleResponse,
  CoupangCouponBudgetListResponse,
  CoupangCouponContractListResponse,
  CoupangCouponRequestStatusResponse,
  CoupangDownloadCouponDetailResponse,
  CoupangInstantCouponDetailResponse,
  CoupangInstantCouponItemsResponse,
  CoupangInstantCouponListResponse,
  CoupangPromotionMutationResponse,
} from "@shared/coupang-promo";
import { StatusBadge } from "@/components/status-badge";
import { useOperations } from "@/components/operation-provider";
import { apiRequestJson, getJson } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate, formatNumber } from "@/lib/utils";

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

type PromotionPanel = "contracts" | "instant" | "download" | "cashback";

type FilterState = {
  selectedStoreId: string;
  panel: PromotionPanel;
  contractId: string;
  budgetMonth: string;
  instantStatus: string;
  selectedInstantCouponId: string;
  downloadCouponId: string;
  requestKind: "instant" | "download";
  requestId: string;
  cashbackRuleId: string;
  cashbackVendorItemId: string;
  operatorUserId: string;
};

type FeedbackState =
  | {
      type: "success" | "warning" | "error";
      title: string;
      message: string;
    }
  | null;

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
  panel: "contracts",
  contractId: "",
  budgetMonth: "",
  instantStatus: "APPLIED",
  selectedInstantCouponId: "",
  downloadCouponId: "",
  requestKind: "instant",
  requestId: "",
  cashbackRuleId: "",
  cashbackVendorItemId: "",
  operatorUserId: "",
};

function defaultDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function defaultDateTime(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function splitIds(value: string) {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toIsoDateTime(value: string) {
  if (!value.trim()) {
    return "";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function toOptionalNumber(value: string) {
  const normalized = value.replaceAll(",", "").trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export default function CoupangCouponsPage() {
  const {
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
    publishOperation,
  } = useOperations();
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "coupang.coupons",
    DEFAULT_FILTERS,
  );
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [instantForm, setInstantForm] = useState({
    contractId: "",
    name: "",
    type: "FIXED_WITH_QUANTITY",
    discount: "",
    maxDiscountPrice: "",
    startAt: defaultDateTime(0),
    endAt: defaultDateTime(7),
    wowExclusive: "false",
    vendorItemIdsText: "",
  });
  const [downloadForm, setDownloadForm] = useState({
    contractId: "",
    title: "",
    startDate: defaultDate(new Date()),
    endDate: defaultDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    policyTitle: "",
    policyType: "RATE",
    policyDescription: "",
    minimumPrice: "",
    discount: "",
    maximumDiscountPrice: "",
    maximumPerDaily: "",
    vendorItemIdsText: "",
  });
  const [cashbackForm, setCashbackForm] = useState({
    ruleId: "",
    valueType: "FIXED_WITH_QUANTITY",
    value: "",
    maxAmount: "",
    vendorItemIdsText: "",
    startAt: defaultDateTime(0),
    endAt: defaultDateTime(7),
  });

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

  const contractsQuery = useQuery({
    queryKey: ["/api/coupang/promotions/contracts", filters.selectedStoreId],
    queryFn: () =>
      getJson<CoupangCouponContractListResponse>(
        `/api/coupang/promotions/contracts?storeId=${encodeURIComponent(filters.selectedStoreId)}`,
      ),
    enabled: Boolean(filters.selectedStoreId),
  });

  const budgetsQuery = useQuery({
    queryKey: ["/api/coupang/promotions/budgets", filters.selectedStoreId, filters.contractId, filters.budgetMonth],
    queryFn: () => {
      const params = new URLSearchParams({ storeId: filters.selectedStoreId });
      if (filters.contractId) {
        params.set("contractId", filters.contractId);
      }
      if (filters.budgetMonth) {
        params.set("targetMonth", filters.budgetMonth);
      }
      return getJson<CoupangCouponBudgetListResponse>(`/api/coupang/promotions/budgets?${params.toString()}`);
    },
    enabled: Boolean(filters.selectedStoreId),
  });

  const instantCouponsQuery = useQuery({
    queryKey: ["/api/coupang/promotions/instant-coupons", filters.selectedStoreId, filters.instantStatus],
    queryFn: () =>
      getJson<CoupangInstantCouponListResponse>(
        `/api/coupang/promotions/instant-coupons?storeId=${encodeURIComponent(filters.selectedStoreId)}&status=${encodeURIComponent(filters.instantStatus)}&page=1&size=20&sort=desc`,
      ),
    enabled: Boolean(filters.selectedStoreId),
  });

  const instantCouponDetailQuery = useQuery({
    queryKey: ["/api/coupang/promotions/instant-coupon", filters.selectedStoreId, filters.selectedInstantCouponId],
    queryFn: () =>
      getJson<CoupangInstantCouponDetailResponse>(
        `/api/coupang/promotions/instant-coupons/${encodeURIComponent(filters.selectedInstantCouponId)}?storeId=${encodeURIComponent(filters.selectedStoreId)}`,
      ),
    enabled: Boolean(filters.selectedStoreId) && Boolean(filters.selectedInstantCouponId),
  });

  const instantCouponItemsQuery = useQuery({
    queryKey: ["/api/coupang/promotions/instant-coupon-items", filters.selectedStoreId, filters.selectedInstantCouponId],
    queryFn: () =>
      getJson<CoupangInstantCouponItemsResponse>(
        `/api/coupang/promotions/instant-coupons/${encodeURIComponent(filters.selectedInstantCouponId)}/items?storeId=${encodeURIComponent(filters.selectedStoreId)}&status=APPLIED&page=0&size=30&sort=desc`,
      ),
    enabled: Boolean(filters.selectedStoreId) && Boolean(filters.selectedInstantCouponId),
  });

  const downloadCouponDetailQuery = useQuery({
    queryKey: ["/api/coupang/promotions/download-coupon", filters.selectedStoreId, filters.downloadCouponId],
    queryFn: () =>
      getJson<CoupangDownloadCouponDetailResponse>(
        `/api/coupang/promotions/download-coupons/${encodeURIComponent(filters.downloadCouponId)}?storeId=${encodeURIComponent(filters.selectedStoreId)}`,
      ),
    enabled: Boolean(filters.selectedStoreId) && Boolean(filters.downloadCouponId),
  });

  const requestStatusQuery = useQuery({
    queryKey: ["/api/coupang/promotions/request-status", filters.selectedStoreId, filters.requestKind, filters.requestId],
    queryFn: () =>
      getJson<CoupangCouponRequestStatusResponse>(
        `/api/coupang/promotions/request-status?storeId=${encodeURIComponent(filters.selectedStoreId)}&kind=${encodeURIComponent(filters.requestKind)}&requestedId=${encodeURIComponent(filters.requestId)}`,
      ),
    enabled: Boolean(filters.selectedStoreId) && Boolean(filters.requestId),
  });

  const cashbackRuleQuery = useQuery({
    queryKey: ["/api/coupang/promotions/cashback", filters.selectedStoreId, filters.cashbackRuleId, filters.cashbackVendorItemId],
    queryFn: () =>
      getJson<CoupangCashbackRuleResponse>(
        `/api/coupang/promotions/cashback?storeId=${encodeURIComponent(filters.selectedStoreId)}&ruleId=${encodeURIComponent(filters.cashbackRuleId)}&vendorItemId=${encodeURIComponent(filters.cashbackVendorItemId)}`,
      ),
    enabled: Boolean(filters.selectedStoreId) && Boolean(filters.cashbackRuleId) && Boolean(filters.cashbackVendorItemId),
  });

  const contracts = contractsQuery.data?.items ?? [];
  const instantCoupons = instantCouponsQuery.data?.items ?? [];
  const selectedInstantCoupon = instantCouponDetailQuery.data?.item ?? null;
  const liveMode =
    contractsQuery.data?.source === "live" ||
    instantCouponsQuery.data?.source === "live" ||
    downloadCouponDetailQuery.data?.source === "live" ||
    cashbackRuleQuery.data?.source === "live";

  useEffect(() => {
    if (filters.contractId || !contracts[0]) {
      return;
    }

    setFilters((current) => ({
      ...current,
      contractId: contracts[0].contractId,
    }));
    setInstantForm((current) => ({ ...current, contractId: contracts[0].contractId }));
    setDownloadForm((current) => ({ ...current, contractId: contracts[0].contractId }));
  }, [contracts, filters.contractId, setFilters]);

  async function runPromotionAction(input: {
    actionKey: string;
    title: string;
    request: () => Promise<CoupangPromotionMutationResponse>;
    onSuccess: (result: CoupangPromotionMutationResponse) => Promise<void>;
  }) {
    const toastId = startLocalOperation({
      channel: "coupang",
      actionName: input.title,
      targetCount: 1,
    });
    setIsSubmitting(input.actionKey);
    setFeedback(null);

    try {
      const result = await input.request();
      if (result.operation) {
        publishOperation(result.operation);
      }
      await input.onSuccess(result);
      setFeedback({
        type: result.requestStatus?.status === "FAIL" ? "warning" : "success",
        title: "작업 완료",
        message: result.message,
      });
      finishLocalOperation(toastId, {
        status: result.requestStatus?.status === "FAIL" ? "warning" : "success",
        summary: result.message,
      });
      window.setTimeout(() => removeLocalOperation(toastId), 1_000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "쿠팡 프로모션 작업 중 오류가 발생했습니다.";
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

  function requireOperatorUserId() {
    const userId = filters.operatorUserId.trim();
    if (!userId) {
      setFeedback({
        type: "warning",
        title: "작업자 ID 필요",
        message: "다운로드 쿠폰과 일부 프로모션 작업에는 작업자 ID가 필요합니다.",
      });
      return null;
    }
    return userId;
  }

  const summaryCount = useMemo(
    () => ({
      contracts: contracts.length,
      budgets: budgetsQuery.data?.items.length ?? 0,
      instant: instantCoupons.length,
      instantItems: instantCouponItemsQuery.data?.items.length ?? 0,
    }),
    [contracts.length, budgetsQuery.data?.items.length, instantCouponItemsQuery.data?.items.length, instantCoupons.length],
  );

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone={liveMode ? "live" : "draft"} />
          <StatusBadge tone="shared" label="프로모션 실연동" />
        </div>
        <h1>COUPANG 쿠폰 / 캐시백</h1>
        <p>계약과 예산 조회, 즉시할인 생성, 다운로드 쿠폰 운영, 캐시백 적용과 요청 상태 추적을 한 화면에서 처리합니다.</p>
      </div>

      <div className="card">
        <div className="toolbar">
          <select value={filters.selectedStoreId} onChange={(event) => setFilters((current) => ({ ...current, selectedStoreId: event.target.value }))}>
            <option value="">스토어 선택</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.storeName}</option>)}
          </select>
          <input value={filters.operatorUserId} onChange={(event) => setFilters((current) => ({ ...current, operatorUserId: event.target.value }))} placeholder="작업자 ID" style={{ minWidth: 150 }} />
          <button className="button secondary" disabled={!filters.selectedStoreId} onClick={() => { void contractsQuery.refetch(); void budgetsQuery.refetch(); void instantCouponsQuery.refetch(); void downloadCouponDetailQuery.refetch(); void cashbackRuleQuery.refetch(); }}>
            새로고침
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric"><div className="metric-label">계약</div><div className="metric-value">{summaryCount.contracts}</div></div>
        <div className="metric"><div className="metric-label">예산</div><div className="metric-value">{summaryCount.budgets}</div></div>
        <div className="metric"><div className="metric-label">즉시할인</div><div className="metric-value">{summaryCount.instant}</div></div>
        <div className="metric"><div className="metric-label">적용 상품</div><div className="metric-value">{summaryCount.instantItems}</div></div>
      </div>

      {feedback ? <div className={`feedback ${feedback.type}`}><strong>{feedback.title}</strong><div>{feedback.message}</div></div> : null}

      <div className="card">
        <div className="segmented-control">
          {(["contracts", "instant", "download", "cashback"] as const).map((panel) => (
            <button key={panel} type="button" className={`segmented-button ${filters.panel === panel ? "active" : ""}`} onClick={() => setFilters((current) => ({ ...current, panel }))}>
              {panel === "contracts" ? "계약 / 예산" : panel === "instant" ? "즉시할인" : panel === "download" ? "다운로드 쿠폰" : "캐시백"}
            </button>
          ))}
        </div>
      </div>

      {filters.panel === "contracts" ? (
        <div className="split">
          <div className="card">
            <div className="card-header">
              <div>
                <strong>계약 목록</strong>
                <div className="muted">프로모션 생성에 사용할 contractId를 선택합니다.</div>
              </div>
              <StatusBadge tone={contractsQuery.data?.source === "live" ? "live" : "draft"} label={contractsQuery.data?.source === "live" ? "실연동" : "fallback"} />
            </div>
            {contractsQuery.isLoading ? (
              <div className="empty">계약 정보를 불러오는 중입니다.</div>
            ) : contractsQuery.error ? (
              <div className="empty">{(contractsQuery.error as Error).message}</div>
            ) : contracts.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>contractId</th>
                      <th>유형</th>
                      <th>기간</th>
                      <th>분담률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((item) => (
                      <tr
                        key={item.contractId}
                        className={filters.contractId === item.contractId ? "table-row-selected" : undefined}
                        onClick={() => {
                          setFilters((current) => ({ ...current, contractId: item.contractId }));
                          setInstantForm((current) => ({ ...current, contractId: item.contractId }));
                          setDownloadForm((current) => ({ ...current, contractId: item.contractId }));
                        }}
                      >
                        <td>{item.contractId}</td>
                        <td>{item.type ?? "-"}</td>
                        <td>{formatDate(item.start)} ~ {formatDate(item.end)}</td>
                        <td>{formatNumber(item.sellerShareRatio)} / {formatNumber(item.coupangShareRatio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">조회된 계약이 없습니다.</div>
            )}
          </div>
          <div className="card">
            <div className="card-header">
              <div>
                <strong>예산 조회</strong>
                <div className="muted">선택한 계약 기준 예산 소진 현황입니다.</div>
              </div>
            </div>
            <div className="toolbar" style={{ marginBottom: "1rem" }}>
              <input value={filters.budgetMonth} onChange={(event) => setFilters((current) => ({ ...current, budgetMonth: event.target.value }))} placeholder="YYYY-MM" />
              <button className="button secondary" onClick={() => void budgetsQuery.refetch()} disabled={!filters.selectedStoreId}>
                조회
              </button>
            </div>
            {budgetsQuery.isLoading ? (
              <div className="empty">예산을 불러오는 중입니다.</div>
            ) : budgetsQuery.error ? (
              <div className="empty">{(budgetsQuery.error as Error).message}</div>
            ) : budgetsQuery.data?.items.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>대상월</th>
                      <th>총 예산</th>
                      <th>사용 예산</th>
                      <th>분담률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetsQuery.data.items.map((item) => (
                      <tr key={`${item.contractId}:${item.targetMonth ?? "all"}`}>
                        <td>{item.targetMonth ?? "-"}</td>
                        <td>{formatNumber(item.totalBudgetAmount)}</td>
                        <td>{formatNumber(item.usedBudgetAmount)}</td>
                        <td>{formatNumber(item.vendorShareRatio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">예산 데이터가 없습니다.</div>
            )}
          </div>
        </div>
      ) : null}

      {filters.panel === "instant" ? (
        <div className="editor-layout">
          <div className="stack">
            <div className="card">
              <div className="toolbar" style={{ marginBottom: "1rem" }}>
                <input value={filters.instantStatus} onChange={(event) => setFilters((current) => ({ ...current, instantStatus: event.target.value || "APPLIED" }))} placeholder="상태값 예: APPLIED" />
                <button className="button secondary" onClick={() => void instantCouponsQuery.refetch()} disabled={!filters.selectedStoreId}>
                  목록 조회
                </button>
              </div>
              {instantCouponsQuery.isLoading ? (
                <div className="empty">즉시할인 목록을 불러오는 중입니다.</div>
              ) : instantCouponsQuery.error ? (
                <div className="empty">{(instantCouponsQuery.error as Error).message}</div>
              ) : instantCoupons.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>couponId</th>
                        <th>프로모션명</th>
                        <th>상태</th>
                        <th>기간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instantCoupons.map((item) => (
                        <tr key={item.couponId} className={filters.selectedInstantCouponId === item.couponId ? "table-row-selected" : undefined} onClick={() => setFilters((current) => ({ ...current, selectedInstantCouponId: item.couponId }))}>
                          <td>{item.couponId}</td>
                          <td>{item.promotionName}</td>
                          <td><span className={`status-pill ${(item.status ?? "draft").toLowerCase()}`}>{item.status ?? "-"}</span></td>
                          <td>{formatDate(item.startAt)} ~ {formatDate(item.endAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">조회된 즉시할인이 없습니다.</div>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <strong>선택한 즉시할인</strong>
                  <div className="muted">상세와 연결된 vendorItem 목록을 확인합니다.</div>
                </div>
              </div>
              {selectedInstantCoupon ? (
                <div className="stack">
                  <div className="detail-card">
                    <strong>{selectedInstantCoupon.promotionName}</strong>
                    <p>discount {formatNumber(selectedInstantCoupon.discount)} / max {formatNumber(selectedInstantCoupon.maxDiscountPrice)}</p>
                    <div className="muted">{formatDate(selectedInstantCoupon.startAt)} ~ {formatDate(selectedInstantCoupon.endAt)}</div>
                  </div>
                  <div className="detail-box">
                    <strong>적용 상품</strong>
                    {instantCouponItemsQuery.data?.items.length ? (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>vendorItemId</th>
                              <th>상태</th>
                              <th>기간</th>
                            </tr>
                          </thead>
                          <tbody>
                            {instantCouponItemsQuery.data.items.map((item) => (
                              <tr key={item.id}>
                                <td>{item.vendorItemId ?? "-"}</td>
                                <td>{item.status ?? "-"}</td>
                                <td>{formatDate(item.startAt)} ~ {formatDate(item.endAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="muted">적용 상품이 없습니다.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="empty">왼쪽에서 즉시할인을 선택해 주세요.</div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <strong>즉시할인 생성 / 운영</strong>
                <div className="muted">생성 후 선택한 쿠폰에 상품을 연결하거나 종료할 수 있습니다.</div>
              </div>
            </div>
            <div className="form-grid">
              <label className="field"><span>contractId</span><select value={instantForm.contractId} onChange={(event) => setInstantForm((current) => ({ ...current, contractId: event.target.value }))}><option value="">선택</option>{contracts.map((item) => <option key={item.contractId} value={item.contractId}>{item.contractId}</option>)}</select></label>
              <label className="field"><span>프로모션명</span><input value={instantForm.name} onChange={(event) => setInstantForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field"><span>할인 타입</span><select value={instantForm.type} onChange={(event) => setInstantForm((current) => ({ ...current, type: event.target.value }))}><option value="FIXED_WITH_QUANTITY">FIXED_WITH_QUANTITY</option><option value="RATE">RATE</option><option value="PRICE">PRICE</option></select></label>
              <label className="field"><span>할인값</span><input inputMode="numeric" value={instantForm.discount} onChange={(event) => setInstantForm((current) => ({ ...current, discount: event.target.value }))} /></label>
              <label className="field"><span>최대 할인액</span><input inputMode="numeric" value={instantForm.maxDiscountPrice} onChange={(event) => setInstantForm((current) => ({ ...current, maxDiscountPrice: event.target.value }))} /></label>
              <label className="field"><span>WOW 전용</span><select value={instantForm.wowExclusive} onChange={(event) => setInstantForm((current) => ({ ...current, wowExclusive: event.target.value }))}><option value="false">false</option><option value="true">true</option></select></label>
              <label className="field"><span>시작일시</span><input type="datetime-local" value={instantForm.startAt} onChange={(event) => setInstantForm((current) => ({ ...current, startAt: event.target.value }))} /></label>
              <label className="field"><span>종료일시</span><input type="datetime-local" value={instantForm.endAt} onChange={(event) => setInstantForm((current) => ({ ...current, endAt: event.target.value }))} /></label>
            </div>
            <div className="detail-actions">
              <button className="button" disabled={isSubmitting !== null || !filters.selectedStoreId} onClick={() => void runPromotionAction({ actionKey: "createInstant", title: "COUPANG 즉시할인 생성", request: () => apiRequestJson("POST", "/api/coupang/promotions/instant-coupons", { storeId: filters.selectedStoreId, contractId: instantForm.contractId, name: instantForm.name, type: instantForm.type, discount: Number(instantForm.discount || 0), maxDiscountPrice: Number(instantForm.maxDiscountPrice || 0), startAt: toIsoDateTime(instantForm.startAt), endAt: toIsoDateTime(instantForm.endAt), wowExclusive: instantForm.wowExclusive === "true" }), onSuccess: async (result) => { if (result.couponId) { setFilters((current) => ({ ...current, selectedInstantCouponId: result.couponId ?? "" })); } if (result.requestedId) { setFilters((current) => ({ ...current, requestKind: "instant", requestId: result.requestedId ?? "" })); } await instantCouponsQuery.refetch(); } })}>
                {isSubmitting === "createInstant" ? "처리 중..." : "즉시할인 생성"}
              </button>
            </div>
            <label className="field"><span>연결할 vendorItemIds</span><textarea rows={4} value={instantForm.vendorItemIdsText} onChange={(event) => setInstantForm((current) => ({ ...current, vendorItemIdsText: event.target.value }))} placeholder="쉼표 또는 줄바꿈 구분" /></label>
            <div className="detail-actions">
              <button className="button secondary" disabled={isSubmitting !== null || !filters.selectedInstantCouponId} onClick={() => void runPromotionAction({ actionKey: "attachInstant", title: "COUPANG 즉시할인 상품 연결", request: () => apiRequestJson("POST", `/api/coupang/promotions/instant-coupons/${encodeURIComponent(filters.selectedInstantCouponId)}/items`, { storeId: filters.selectedStoreId, vendorItemIds: splitIds(instantForm.vendorItemIdsText) }), onSuccess: async (result) => { if (result.requestedId) { setFilters((current) => ({ ...current, requestKind: "instant", requestId: result.requestedId ?? "" })); } await instantCouponItemsQuery.refetch(); await instantCouponDetailQuery.refetch(); } })}>
                상품 연결
              </button>
              <button className="button ghost" disabled={isSubmitting !== null || !filters.selectedInstantCouponId} onClick={() => void runPromotionAction({ actionKey: "expireInstant", title: "COUPANG 즉시할인 종료", request: () => apiRequestJson("DELETE", `/api/coupang/promotions/instant-coupons/${encodeURIComponent(filters.selectedInstantCouponId)}?storeId=${encodeURIComponent(filters.selectedStoreId)}`), onSuccess: async () => { await instantCouponsQuery.refetch(); await instantCouponDetailQuery.refetch(); } })}>
                선택 쿠폰 종료
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {filters.panel === "download" ? (
        <div className="editor-layout">
          <div className="card">
            <div className="toolbar" style={{ marginBottom: "1rem" }}>
              <input value={filters.downloadCouponId} onChange={(event) => setFilters((current) => ({ ...current, downloadCouponId: event.target.value }))} placeholder="조회할 couponId" />
              <button className="button secondary" disabled={!filters.downloadCouponId} onClick={() => void downloadCouponDetailQuery.refetch()}>
                상세 조회
              </button>
            </div>
            {downloadCouponDetailQuery.isLoading ? (
              <div className="empty">다운로드 쿠폰을 불러오는 중입니다.</div>
            ) : downloadCouponDetailQuery.error ? (
              <div className="empty">{(downloadCouponDetailQuery.error as Error).message}</div>
            ) : downloadCouponDetailQuery.data?.item ? (
              <div className="stack">
                <div className="detail-card">
                  <strong>{downloadCouponDetailQuery.data.item.title}</strong>
                  <p>{downloadCouponDetailQuery.data.item.couponType ?? "-"}</p>
                  <div className="muted">{formatDate(downloadCouponDetailQuery.data.item.startDate)} ~ {formatDate(downloadCouponDetailQuery.data.item.endDate)}</div>
                </div>
                <div className="detail-box">
                  <strong>정책</strong>
                  {downloadCouponDetailQuery.data.item.couponPolicies.length ? (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>정책명</th>
                            <th>타입</th>
                            <th>할인</th>
                            <th>최대 발급</th>
                          </tr>
                        </thead>
                        <tbody>
                          {downloadCouponDetailQuery.data.item.couponPolicies.map((policy) => (
                            <tr key={policy.title}>
                              <td>{policy.title}</td>
                              <td>{policy.typeOfDiscount ?? "-"}</td>
                              <td>{formatNumber(policy.discount)}</td>
                              <td>{formatNumber(policy.maximumPerDaily)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="muted">정책 정보가 없습니다.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty">couponId를 입력해 상세를 조회해 주세요.</div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <strong>다운로드 쿠폰 생성 / 운영</strong>
                <div className="muted">현재 화면에서는 단일 정책 기준으로 빠르게 생성합니다.</div>
              </div>
            </div>
            <div className="form-grid">
              <label className="field"><span>contractId</span><select value={downloadForm.contractId} onChange={(event) => setDownloadForm((current) => ({ ...current, contractId: event.target.value }))}><option value="">선택</option>{contracts.map((item) => <option key={item.contractId} value={item.contractId}>{item.contractId}</option>)}</select></label>
              <label className="field"><span>쿠폰명</span><input value={downloadForm.title} onChange={(event) => setDownloadForm((current) => ({ ...current, title: event.target.value }))} /></label>
              <label className="field"><span>시작일</span><input type="date" value={downloadForm.startDate} onChange={(event) => setDownloadForm((current) => ({ ...current, startDate: event.target.value }))} /></label>
              <label className="field"><span>종료일</span><input type="date" value={downloadForm.endDate} onChange={(event) => setDownloadForm((current) => ({ ...current, endDate: event.target.value }))} /></label>
              <label className="field"><span>정책명</span><input value={downloadForm.policyTitle} onChange={(event) => setDownloadForm((current) => ({ ...current, policyTitle: event.target.value }))} /></label>
              <label className="field"><span>할인 타입</span><select value={downloadForm.policyType} onChange={(event) => setDownloadForm((current) => ({ ...current, policyType: event.target.value }))}><option value="RATE">RATE</option><option value="PRICE">PRICE</option></select></label>
              <label className="field"><span>최소 주문금액</span><input inputMode="numeric" value={downloadForm.minimumPrice} onChange={(event) => setDownloadForm((current) => ({ ...current, minimumPrice: event.target.value }))} /></label>
              <label className="field"><span>할인값</span><input inputMode="numeric" value={downloadForm.discount} onChange={(event) => setDownloadForm((current) => ({ ...current, discount: event.target.value }))} /></label>
              <label className="field"><span>최대 할인액</span><input inputMode="numeric" value={downloadForm.maximumDiscountPrice} onChange={(event) => setDownloadForm((current) => ({ ...current, maximumDiscountPrice: event.target.value }))} /></label>
              <label className="field"><span>일 최대 발급</span><input inputMode="numeric" value={downloadForm.maximumPerDaily} onChange={(event) => setDownloadForm((current) => ({ ...current, maximumPerDaily: event.target.value }))} /></label>
            </div>
            <label className="field"><span>설명</span><textarea rows={3} value={downloadForm.policyDescription} onChange={(event) => setDownloadForm((current) => ({ ...current, policyDescription: event.target.value }))} /></label>
            <div className="detail-actions">
              <button className="button" disabled={isSubmitting !== null || !filters.selectedStoreId} onClick={() => { const userId = requireOperatorUserId(); if (!userId) return; void runPromotionAction({ actionKey: "createDownload", title: "COUPANG 다운로드 쿠폰 생성", request: () => apiRequestJson("POST", "/api/coupang/promotions/download-coupons", { storeId: filters.selectedStoreId, contractId: downloadForm.contractId, title: downloadForm.title, userId, startDate: downloadForm.startDate, endDate: downloadForm.endDate, couponPolicies: [{ title: downloadForm.policyTitle, typeOfDiscount: downloadForm.policyType, description: downloadForm.policyDescription || null, minimumPrice: Number(downloadForm.minimumPrice || 0), discount: Number(downloadForm.discount || 0), maximumDiscountPrice: Number(downloadForm.maximumDiscountPrice || 0), maximumPerDaily: Number(downloadForm.maximumPerDaily || 0) }] }), onSuccess: async (result) => { if (result.couponId) { setFilters((current) => ({ ...current, downloadCouponId: result.couponId ?? "" })); } if (result.requestedId || result.requestTransactionId) { setFilters((current) => ({ ...current, requestKind: "download", requestId: result.requestedId ?? result.requestTransactionId ?? "" })); } await downloadCouponDetailQuery.refetch(); } }); }}>
                {isSubmitting === "createDownload" ? "처리 중..." : "다운로드 쿠폰 생성"}
              </button>
            </div>
            <label className="field"><span>연결할 vendorItemIds</span><textarea rows={4} value={downloadForm.vendorItemIdsText} onChange={(event) => setDownloadForm((current) => ({ ...current, vendorItemIdsText: event.target.value }))} placeholder="쉼표 또는 줄바꿈 구분" /></label>
            <div className="detail-actions">
              <button className="button secondary" disabled={isSubmitting !== null || !filters.downloadCouponId} onClick={() => { const userId = requireOperatorUserId(); if (!userId) return; void runPromotionAction({ actionKey: "attachDownload", title: "COUPANG 다운로드 쿠폰 상품 연결", request: () => apiRequestJson("PUT", `/api/coupang/promotions/download-coupons/${encodeURIComponent(filters.downloadCouponId)}/items`, { storeId: filters.selectedStoreId, couponId: filters.downloadCouponId, userId, vendorItemIds: splitIds(downloadForm.vendorItemIdsText) }), onSuccess: async () => { await downloadCouponDetailQuery.refetch(); } }); }}>
                상품 연결
              </button>
              <button className="button ghost" disabled={isSubmitting !== null || !filters.downloadCouponId} onClick={() => { const userId = requireOperatorUserId(); if (!userId) return; void runPromotionAction({ actionKey: "expireDownload", title: "COUPANG 다운로드 쿠폰 종료", request: () => apiRequestJson("POST", `/api/coupang/promotions/download-coupons/${encodeURIComponent(filters.downloadCouponId)}/expire`, { storeId: filters.selectedStoreId, userId }), onSuccess: async (result) => { if (result.requestedId || result.requestTransactionId) { setFilters((current) => ({ ...current, requestKind: "download", requestId: result.requestedId ?? result.requestTransactionId ?? "" })); } await downloadCouponDetailQuery.refetch(); } }); }}>
                선택 쿠폰 종료
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {filters.panel === "cashback" ? (
        <div className="split">
          <div className="card">
            <div className="toolbar" style={{ marginBottom: "1rem" }}>
              <input value={filters.cashbackRuleId} onChange={(event) => setFilters((current) => ({ ...current, cashbackRuleId: event.target.value }))} placeholder="ruleId" />
              <input value={filters.cashbackVendorItemId} onChange={(event) => setFilters((current) => ({ ...current, cashbackVendorItemId: event.target.value }))} placeholder="vendorItemId" />
              <button className="button secondary" onClick={() => void cashbackRuleQuery.refetch()} disabled={!filters.cashbackRuleId || !filters.cashbackVendorItemId}>
                조회
              </button>
            </div>
            {cashbackRuleQuery.isLoading ? (
              <div className="empty">캐시백 룰을 불러오는 중입니다.</div>
            ) : cashbackRuleQuery.error ? (
              <div className="empty">{(cashbackRuleQuery.error as Error).message}</div>
            ) : cashbackRuleQuery.data?.item ? (
              <div className="detail-card">
                <strong>ruleId {cashbackRuleQuery.data.item.ruleId}</strong>
                <p>vendorItemId {cashbackRuleQuery.data.item.vendorItemId}</p>
                <p>{cashbackRuleQuery.data.item.valueType ?? "-"} / {formatNumber(cashbackRuleQuery.data.item.value)} / max {formatNumber(cashbackRuleQuery.data.item.maxAmount)}</p>
                <div className="muted">{formatDate(cashbackRuleQuery.data.item.startAt)} ~ {formatDate(cashbackRuleQuery.data.item.endAt)}</div>
              </div>
            ) : (
              <div className="empty">ruleId와 vendorItemId로 현재 캐시백 적용 상태를 조회합니다.</div>
            )}
          </div>
          <div className="card">
            <div className="card-header">
              <div>
                <strong>캐시백 적용 / 제거</strong>
                <div className="muted">여러 vendorItemIds에 룰을 한번에 적용하고, 개별 vendorItem은 즉시 제거할 수 있습니다.</div>
              </div>
            </div>
            <div className="form-grid">
              <label className="field"><span>ruleId</span><input value={cashbackForm.ruleId} onChange={(event) => setCashbackForm((current) => ({ ...current, ruleId: event.target.value }))} /></label>
              <label className="field"><span>valueType</span><select value={cashbackForm.valueType} onChange={(event) => setCashbackForm((current) => ({ ...current, valueType: event.target.value }))}><option value="FIXED_WITH_QUANTITY">FIXED_WITH_QUANTITY</option><option value="FIXED">FIXED</option></select></label>
              <label className="field"><span>value</span><input inputMode="numeric" value={cashbackForm.value} onChange={(event) => setCashbackForm((current) => ({ ...current, value: event.target.value }))} /></label>
              <label className="field"><span>maxAmount</span><input inputMode="numeric" value={cashbackForm.maxAmount} onChange={(event) => setCashbackForm((current) => ({ ...current, maxAmount: event.target.value }))} /></label>
              <label className="field"><span>시작일시</span><input type="datetime-local" value={cashbackForm.startAt} onChange={(event) => setCashbackForm((current) => ({ ...current, startAt: event.target.value }))} /></label>
              <label className="field"><span>종료일시</span><input type="datetime-local" value={cashbackForm.endAt} onChange={(event) => setCashbackForm((current) => ({ ...current, endAt: event.target.value }))} /></label>
            </div>
            <label className="field"><span>적용 vendorItemIds</span><textarea rows={4} value={cashbackForm.vendorItemIdsText} onChange={(event) => setCashbackForm((current) => ({ ...current, vendorItemIdsText: event.target.value }))} placeholder="쉼표 또는 줄바꿈 구분" /></label>
            <div className="detail-actions">
              <button className="button" disabled={isSubmitting !== null || !filters.selectedStoreId} onClick={() => void runPromotionAction({ actionKey: "applyCashback", title: "COUPANG 캐시백 적용", request: () => apiRequestJson("POST", "/api/coupang/promotions/cashback", { storeId: filters.selectedStoreId, ruleId: cashbackForm.ruleId, valueType: cashbackForm.valueType, value: Number(cashbackForm.value || 0), maxAmount: toOptionalNumber(cashbackForm.maxAmount), vendorItemIds: splitIds(cashbackForm.vendorItemIdsText), startAt: toIsoDateTime(cashbackForm.startAt), endAt: toIsoDateTime(cashbackForm.endAt) }), onSuccess: async () => { const appliedIds = splitIds(cashbackForm.vendorItemIdsText); setFilters((current) => ({ ...current, cashbackRuleId: cashbackForm.ruleId, cashbackVendorItemId: appliedIds[0] ?? current.cashbackVendorItemId })); await cashbackRuleQuery.refetch(); } })}>
                캐시백 적용
              </button>
              <button className="button ghost" disabled={isSubmitting !== null || !filters.cashbackRuleId || !filters.cashbackVendorItemId} onClick={() => void runPromotionAction({ actionKey: "removeCashback", title: "COUPANG 캐시백 제거", request: () => apiRequestJson("DELETE", `/api/coupang/promotions/cashback?storeId=${encodeURIComponent(filters.selectedStoreId)}&ruleId=${encodeURIComponent(filters.cashbackRuleId)}&vendorItemId=${encodeURIComponent(filters.cashbackVendorItemId)}`), onSuccess: async () => { await cashbackRuleQuery.refetch(); } })}>
                선택 캐시백 제거
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-header">
          <div>
            <strong>요청 상태 추적</strong>
            <div className="muted">비동기 처리된 instant / download 요청의 결과를 재조회합니다.</div>
          </div>
        </div>
        <div className="toolbar" style={{ marginBottom: "1rem" }}>
          <select value={filters.requestKind} onChange={(event) => setFilters((current) => ({ ...current, requestKind: event.target.value as "instant" | "download" }))}>
            <option value="instant">instant</option>
            <option value="download">download</option>
          </select>
          <input value={filters.requestId} onChange={(event) => setFilters((current) => ({ ...current, requestId: event.target.value }))} placeholder="requestedId 또는 transactionId" style={{ minWidth: 260 }} />
          <button className="button secondary" disabled={!filters.requestId} onClick={() => void requestStatusQuery.refetch()}>
            상태 조회
          </button>
        </div>
        {requestStatusQuery.isLoading ? (
          <div className="empty">요청 상태를 조회하는 중입니다.</div>
        ) : requestStatusQuery.error ? (
          <div className="empty">{(requestStatusQuery.error as Error).message}</div>
        ) : requestStatusQuery.data?.item ? (
          <div className="detail-card">
            <strong>{requestStatusQuery.data.item.status ?? "-"}</strong>
            <p>couponId {requestStatusQuery.data.item.couponId ?? "-"}</p>
            <p>성공 {formatNumber(requestStatusQuery.data.item.succeeded)} / 실패 {formatNumber(requestStatusQuery.data.item.failed)} / 전체 {formatNumber(requestStatusQuery.data.item.total)}</p>
            {requestStatusQuery.data.item.failedVendorItems.length ? (
              <ul className="messages">
                {requestStatusQuery.data.item.failedVendorItems.map((item) => (
                  <li key={`${item.vendorItemId}:${item.reason}`}>{item.vendorItemId}: {item.reason}</li>
                ))}
              </ul>
            ) : (
              <div className="muted">실패한 상품이 없습니다.</div>
            )}
          </div>
        ) : (
          <div className="empty">확인할 요청 ID를 입력해 주세요.</div>
        )}
      </div>
    </div>
  );
}
