import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import type { NaverStatsResponse } from "@shared/naver-stats";
import { StatusBadge } from "@/components/status-badge";
import { getJson } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate, formatNumber } from "@/lib/utils";

interface StoresResponse {
  items: ChannelStoreSummary[];
}

type FilterState = {
  selectedStoreId: string;
  startDate: string;
  endDate: string;
};

function defaultDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
  startDate: defaultDate(-7),
  endDate: defaultDate(-1),
};

function buildStatsUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  return `/api/naver/stats?${params.toString()}`;
}

export default function NaverStatsPage() {
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "naver.stats",
    DEFAULT_FILTERS,
  );

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

  const statsQuery = useQuery({
    queryKey: [
      "/api/naver/stats",
      filters.selectedStoreId,
      filters.startDate,
      filters.endDate,
    ],
    queryFn: () => getJson<NaverStatsResponse>(buildStatsUrl(filters)),
    enabled:
      Boolean(filters.selectedStoreId) &&
      Boolean(filters.startDate) &&
      Boolean(filters.endDate),
  });

  const data = statsQuery.data;

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="live" label="실연동" />
          <StatusBadge tone="shared" label="운영지표" />
          {data?.customerInsight.state === "permission-required" ? (
            <StatusBadge tone="coming" label="권한/구독 필요" />
          ) : null}
        </div>
        <h1>NAVER 통계</h1>
        <p>
          운영 KPI, 주문/클레임 상태 분포, 정산 기반 매출 흐름을 먼저 제공하고 추가 권한이 필요한
          데이터는 명확하게 구분해서 표시합니다.
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

          <button
            className="button secondary"
            onClick={() => void statsQuery.refetch()}
            disabled={!filters.selectedStoreId || statsQuery.isFetching}
          >
            {statsQuery.isFetching ? "불러오는 중..." : "새로고침"}
          </button>

          <div className="muted">
            집계 기간 {filters.startDate} ~ {filters.endDate}
          </div>
        </div>
      </div>

      {!stores.length ? (
        <div className="card">
          <div className="empty">먼저 NAVER 연결관리에서 스토어를 등록해 주세요.</div>
        </div>
      ) : statsQuery.isLoading ? (
        <div className="card">
          <div className="empty">NAVER 통계를 불러오는 중입니다.</div>
        </div>
      ) : statsQuery.error ? (
        <div className="card">
          <div className="empty">{(statsQuery.error as Error).message}</div>
        </div>
      ) : data ? (
        <>
          <div className="metric-grid">
            <div className="metric">
              <div className="metric-label">상품 수</div>
              <div className="metric-value">{formatNumber(data.summary.totalProducts)}</div>
            </div>
            <div className="metric">
              <div className="metric-label">최근 주문</div>
              <div className="metric-value">{formatNumber(data.summary.recentOrders)}</div>
            </div>
            <div className="metric">
              <div className="metric-label">실행 가능 주문</div>
              <div className="metric-value">{formatNumber(data.summary.executableOrders)}</div>
            </div>
            <div className="metric">
              <div className="metric-label">최근 클레임</div>
              <div className="metric-value">{formatNumber(data.summary.recentClaims)}</div>
            </div>
            <div className="metric">
              <div className="metric-label">미답변 고객문의</div>
              <div className="metric-value">
                {formatNumber(data.summary.unansweredCustomerInquiries)}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">미답변 상품문의</div>
              <div className="metric-value">
                {formatNumber(data.summary.unansweredProductInquiries)}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">정산금</div>
              <div className="metric-value">{formatNumber(data.summary.settleAmount)}</div>
            </div>
            <div className="metric">
              <div className="metric-label">수수료 정산금</div>
              <div className="metric-value">
                {formatNumber(data.summary.commissionSettleAmount)}
              </div>
            </div>
          </div>

          {data.notes.length ? (
            <div className="feedback warning">
              <strong>통계 조회 참고</strong>
              <ul className="messages">
                {data.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="split">
            <div className="card">
              <div className="card-header">
                <div>
                  <strong>주문 상태 분포</strong>
                  <div className="table-note">동일 기간 안에서 최근 변경 주문을 상태별로 집계했습니다.</div>
                </div>
                <StatusBadge tone="live" label="실연동" />
              </div>
              {data.orderStatusBreakdown.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>상태</th>
                        <th>건수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orderStatusBreakdown.map((item) => (
                        <tr key={item.label}>
                          <td>{item.label}</td>
                          <td>{formatNumber(item.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">표시할 주문 상태 집계가 없습니다.</div>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <strong>클레임 상태 분포</strong>
                  <div className="table-note">취소/반품/교환을 합쳐 현재 운영 볼륨을 빠르게 확인합니다.</div>
                </div>
                <StatusBadge tone="live" label="실연동" />
              </div>
              {data.claimStatusBreakdown.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>상태</th>
                        <th>건수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.claimStatusBreakdown.map((item) => (
                        <tr key={item.label}>
                          <td>{item.label}</td>
                          <td>{formatNumber(item.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">표시할 클레임 상태 집계가 없습니다.</div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <strong>정산 기반 매출 흐름</strong>
                <div className="table-note">일별 정산 응답을 기준으로 매출 흐름을 표 형태로 정리했습니다.</div>
              </div>
              <div className="muted">업데이트 {formatDate(data.fetchedAt)}</div>
            </div>
            {data.salesTrend.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>기준일</th>
                      <th>정산금</th>
                      <th>결제 정산금</th>
                      <th>수수료 정산금</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.salesTrend.map((item) => (
                      <tr key={item.date}>
                        <td>{item.date}</td>
                        <td>{formatNumber(item.settleAmount)}</td>
                        <td>{formatNumber(item.paySettleAmount)}</td>
                        <td>{formatNumber(item.commissionSettleAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">표시할 정산 기반 매출 흐름이 없습니다.</div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <strong>고객 인사이트</strong>
                <div className="table-note">
                  브랜드스토어 전용 권한이 필요한 API는 상태를 구분해서 안내합니다.
                </div>
              </div>
              {data.customerInsight.state === "available" ? (
                <StatusBadge tone="live" label="실연동" />
              ) : data.customerInsight.state === "permission-required" ? (
                <StatusBadge tone="coming" label="권한/구독 필요" />
              ) : (
                <StatusBadge tone="coming" label="집계 제한" />
              )}
            </div>

            {data.customerInsight.state === "available" && data.customerInsight.latest ? (
              <>
                <div className="metric-grid">
                  <div className="metric">
                    <div className="metric-label">고객 수</div>
                    <div className="metric-value">
                      {formatNumber(data.customerInsight.latest.customerCount)}
                    </div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">신규 고객</div>
                    <div className="metric-value">
                      {formatNumber(data.customerInsight.latest.newCustomerCount)}
                    </div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">기존 고객</div>
                    <div className="metric-value">
                      {formatNumber(data.customerInsight.latest.existCustomerCount)}
                    </div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">구매 건수</div>
                    <div className="metric-value">
                      {formatNumber(data.customerInsight.latest.purchaseCount)}
                    </div>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>집계일</th>
                        <th>고객 수</th>
                        <th>신규 / 기존</th>
                        <th>구매 / 환불</th>
                        <th>관심 / 알림</th>
                        <th>남녀 비율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.customerInsight.series.map((item) => (
                        <tr key={item.aggregateDate}>
                          <td>{item.aggregateDate}</td>
                          <td>{formatNumber(item.customerCount)}</td>
                          <td>
                            {formatNumber(item.newCustomerCount)} /{" "}
                            {formatNumber(item.existCustomerCount)}
                          </td>
                          <td>
                            {formatNumber(item.purchaseCount)} / {formatNumber(item.refundCount)}
                          </td>
                          <td>
                            {formatNumber(item.interestCustomer)} /{" "}
                            {formatNumber(item.notificationCustomer)}
                          </td>
                          <td>
                            남 {formatNumber(item.maleRatio)} / 여 {formatNumber(item.femaleRatio)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div
                className={`feedback${data.customerInsight.state === "permission-required" || data.customerInsight.state === "not-provided" ? " warning" : ""}`}
              >
                <strong>
                  {data.customerInsight.state === "permission-required"
                    ? "권한/구독 필요"
                    : data.customerInsight.state === "not-provided"
                      ? "집계 기준 부족"
                      : "데이터 없음"}
                </strong>
                <div className="muted">
                  {data.customerInsight.message ?? "현재 제공 가능한 고객 인사이트 데이터가 없습니다."}
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
