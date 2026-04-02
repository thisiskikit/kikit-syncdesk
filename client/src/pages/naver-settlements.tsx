import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import type {
  NaverSettlementCommissionRow,
  NaverSettlementDailyRow,
  NaverSettlementDetailType,
  NaverSettlementResponse,
  NaverSettlementVatRow,
} from "@shared/naver-settlements";
import { ApiFreshnessCard } from "@/components/api-freshness-card";
import { StatusBadge } from "@/components/status-badge";
import { getResponseCacheState, isStaleCachedResponse } from "@/lib/freshness";
import { getJson, getJsonWithRefresh, queryPresets, refreshQueryData } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate, formatNumber } from "@/lib/utils";

interface StoresResponse {
  items: ChannelStoreSummary[];
}

type FilterState = {
  selectedStoreId: string;
  startDate: string;
  endDate: string;
  detailType: NaverSettlementDetailType;
};

function defaultDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
  startDate: defaultDate(-6),
  endDate: defaultDate(0),
  detailType: "daily",
};

function buildSettlementsUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  return `/api/naver/settlements?${params.toString()}`;
}

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value).replace(/"/g, "\"\"");
  return /[",\r\n]/.test(normalized) ? `"${normalized}"` : normalized;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const content = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\r\n");
  const blob = new Blob([`\uFEFF${content}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildDailyCsvRows(items: NaverSettlementDailyRow[]) {
  return {
    headers: [
      "정산기준 시작일",
      "정산기준 종료일",
      "정산예정일",
      "정산완료일",
      "총 정산금",
      "결제 정산금",
      "수수료 정산금",
      "혜택 정산금",
      "보류 금액",
      "차감 금액",
      "정산 방식",
      "은행",
      "예금주",
      "계좌번호",
    ],
    rows: items.map((item) => [
      item.settleBasisStartDate,
      item.settleBasisEndDate,
      item.settleExpectDate,
      item.settleCompleteDate,
      item.settleAmount,
      item.paySettleAmount,
      item.commissionSettleAmount,
      item.benefitSettleAmount,
      item.payHoldbackAmount,
      item.minusChargeAmount,
      item.settleMethodType,
      item.bankType,
      item.depositorName,
      item.accountNo,
    ]),
  };
}

function buildCommissionCsvRows(items: NaverSettlementCommissionRow[]) {
  return {
    headers: [
      "정산기준일",
      "주문번호",
      "상품주문번호",
      "상품명",
      "정산유형",
      "수수료 기준금액",
      "수수료 금액",
      "수수료 유형",
      "결제수단",
      "정산예정일",
      "정산완료일",
      "과세반영일",
    ],
    rows: items.map((item) => [
      item.settleBasisDate,
      item.orderNo,
      item.productOrderId,
      item.productName,
      item.settleType,
      item.commissionBasisAmount,
      item.commissionAmount,
      item.commissionType,
      item.payMeansType,
      item.settleExpectDate,
      item.settleCompleteDate,
      item.taxReturnDate,
    ]),
  };
}

function buildVatCsvRows(items: NaverSettlementVatRow[]) {
  return {
    headers: [
      "기준일",
      "총 매출",
      "과세 매출",
      "면세 매출",
      "신용카드 매출",
      "현금영수증 소득공제",
      "지출증빙",
      "발행제외",
      "기타",
    ],
    rows: items.map((item) => [
      item.settleBasisDate,
      item.totalSalesAmount,
      item.taxationSalesAmount,
      item.taxExemptionSalesAmount,
      item.creditCardAmount,
      item.cashIncomeDeductionAmount,
      item.cashOutgoingEvidenceAmount,
      item.cashExclusionIssuanceAmount,
      item.otherAmount,
    ]),
  };
}

export default function NaverSettlementsPage() {
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "naver.settlements",
    DEFAULT_FILTERS,
  );
  const settlementsQueryKey = [
    "/api/naver/settlements",
    filters.selectedStoreId,
    filters.startDate,
    filters.endDate,
  ] as const;
  const settlementsQueryUrl = buildSettlementsUrl(filters);

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

  const settlementsQuery = useQuery({
    queryKey: settlementsQueryKey,
    queryFn: () => getJson<NaverSettlementResponse>(settlementsQueryUrl),
    enabled:
      Boolean(filters.selectedStoreId) &&
      Boolean(filters.startDate) &&
      Boolean(filters.endDate),
    ...queryPresets.listSnapshot,
  });
  const refreshSettlements = () =>
    refreshQueryData({
      queryKey: settlementsQueryKey,
      queryFn: () => getJsonWithRefresh<NaverSettlementResponse>(settlementsQueryUrl),
      gcTime: queryPresets.listSnapshot.gcTime,
    });
  const settlementsCacheState = getResponseCacheState(settlementsQuery.data);

  useEffect(() => {
    if (!settlementsQuery.data || settlementsQuery.isFetching) {
      return;
    }

    if (!isStaleCachedResponse(settlementsQuery.data)) {
      return;
    }

    void refreshSettlements();
  }, [settlementsQuery.data, settlementsQuery.isFetching]);

  const data = settlementsQuery.data;
  const currentCount =
    filters.detailType === "daily"
      ? data?.dailyItems.length ?? 0
      : filters.detailType === "commission"
        ? data?.commissionItems.length ?? 0
        : data?.vatItems.length ?? 0;

  const exportCurrentTable = () => {
    if (!data) {
      return;
    }

    const rangeLabel = `${filters.startDate}_${filters.endDate}`;
    if (filters.detailType === "daily") {
      const csv = buildDailyCsvRows(data.dailyItems);
      downloadCsv(`naver-settlement-daily-${rangeLabel}.csv`, csv.headers, csv.rows);
      return;
    }

    if (filters.detailType === "commission") {
      const csv = buildCommissionCsvRows(data.commissionItems);
      downloadCsv(`naver-settlement-commission-${rangeLabel}.csv`, csv.headers, csv.rows);
      return;
    }

    const csv = buildVatCsvRows(data.vatItems);
    downloadCsv(`naver-settlement-vat-${rangeLabel}.csv`, csv.headers, csv.rows);
  };

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="live" label="실연동" />
          <StatusBadge tone="coming" label="내보내기 대응" />
        </div>
        <h1>NAVER 정산</h1>
        <p>
          일별 정산, 수수료 상세, 부가세 집계를 한 번에 확인하고 현재 선택 중인 표를 CSV로
          내보낼 수 있습니다.
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
            onClick={() => void refreshSettlements()}
            disabled={!filters.selectedStoreId || settlementsQuery.isFetching}
          >
            {settlementsQuery.isFetching ? "강제 새로고침 중.." : "강제 새로고침"}
          </button>

          <button className="button ghost" onClick={exportCurrentTable} disabled={!data}>
            현재 표 CSV 다운로드
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">총 정산금</div>
          <div className="metric-value">{formatNumber(data?.summary.settleAmount ?? 0)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">결제 정산금</div>
          <div className="metric-value">{formatNumber(data?.summary.paySettleAmount ?? 0)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">수수료 정산금</div>
          <div className="metric-value">
            {formatNumber(data?.summary.commissionSettleAmount ?? 0)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">총 매출</div>
          <div className="metric-value">{formatNumber(data?.summary.totalSalesAmount ?? 0)}</div>
        </div>
      </div>

      {data ? (
        <ApiFreshnessCard
          fetchedAt={data.fetchedAt}
          cacheState={settlementsCacheState}
          servedFromCache={data.servedFromCache}
          isFetching={settlementsQuery.isFetching && Boolean(data)}
        />
      ) : null}

      {data?.warnings.length ? (
        <div className="feedback warning">
          <strong>정산 조회 참고</strong>
          <ul className="messages">
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="card">
        <div className="segmented-control">
          <button
            className={`segmented-button ${filters.detailType === "daily" ? "active" : ""}`}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                detailType: "daily",
              }))
            }
          >
            일별 정산
          </button>
          <button
            className={`segmented-button ${filters.detailType === "commission" ? "active" : ""}`}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                detailType: "commission",
              }))
            }
          >
            수수료 상세
          </button>
          <button
            className={`segmented-button ${filters.detailType === "vat" ? "active" : ""}`}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                detailType: "vat",
              }))
            }
          >
            부가세
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <strong>
              {filters.detailType === "daily"
                ? "일별 정산 테이블"
                : filters.detailType === "commission"
                  ? "수수료 상세 테이블"
                  : "부가세 집계 테이블"}
            </strong>
            <div className="table-note">
              {filters.detailType === "commission"
                ? `수수료 상세 기준일: ${data?.commissionSearchDate ?? "-"}`
                : `조회 기간: ${filters.startDate} ~ ${filters.endDate}`}
            </div>
          </div>
          <div className="muted">최근 동기화 {formatDate(data?.fetchedAt)}</div>
        </div>

        {!stores.length ? (
          <div className="empty">먼저 NAVER 연결관리에서 스토어를 등록해 주세요.</div>
        ) : settlementsQuery.isLoading ? (
          <div className="empty">NAVER 정산 데이터를 불러오는 중입니다.</div>
        ) : settlementsQuery.error ? (
          <div className="empty">{(settlementsQuery.error as Error).message}</div>
        ) : data ? (
          <div className="table-wrap">
            {filters.detailType === "daily" && currentCount > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>정산 기준</th>
                    <th>정산 예정 / 완료</th>
                    <th>정산금</th>
                    <th>수수료 / 혜택</th>
                    <th>보류 / 차감</th>
                    <th>지급 계좌</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dailyItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div>
                          {item.settleBasisStartDate ?? "-"} ~ {item.settleBasisEndDate ?? "-"}
                        </div>
                        <div className="muted">{item.merchantName ?? item.merchantId ?? "-"}</div>
                      </td>
                      <td>
                        <div>예정 {item.settleExpectDate ?? "-"}</div>
                        <div className="muted">완료 {item.settleCompleteDate ?? "-"}</div>
                      </td>
                      <td>
                        <div>{formatNumber(item.settleAmount)}</div>
                        <div className="muted">결제 {formatNumber(item.paySettleAmount)}</div>
                      </td>
                      <td>
                        <div>수수료 {formatNumber(item.commissionSettleAmount)}</div>
                        <div className="muted">혜택 {formatNumber(item.benefitSettleAmount)}</div>
                        <div className="muted">우대 {formatNumber(item.preferentialCommissionAmount)}</div>
                      </td>
                      <td>
                        <div>보류 {formatNumber(item.payHoldbackAmount)}</div>
                        <div className="muted">차감 {formatNumber(item.minusChargeAmount)}</div>
                        <div className="muted">정산 제한 {formatNumber(item.settlementLimitAmount)}</div>
                      </td>
                      <td>
                        <div>{item.bankType ?? "-"}</div>
                        <div className="muted">{item.depositorName ?? "-"}</div>
                        <div className="muted">{item.accountNo ?? "-"}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {filters.detailType === "commission" && currentCount > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>기준일</th>
                    <th>주문 / 상품주문</th>
                    <th>상품</th>
                    <th>정산유형</th>
                    <th>수수료</th>
                    <th>결제수단 / 반영일</th>
                  </tr>
                </thead>
                <tbody>
                  {data.commissionItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div>{item.settleBasisDate ?? "-"}</div>
                        <div className="muted">예정 {item.settleExpectDate ?? "-"}</div>
                      </td>
                      <td>
                        <div>{item.orderNo ?? "-"}</div>
                        <div className="muted">{item.productOrderId ?? "-"}</div>
                      </td>
                      <td>
                        <div>{item.productName ?? "-"}</div>
                        <div className="muted">{item.purchaserName ?? "-"}</div>
                      </td>
                      <td>
                        <div>{item.settleType ?? "-"}</div>
                        <div className="muted">{item.productOrderType ?? "-"}</div>
                      </td>
                      <td>
                        <div>기준 {formatNumber(item.commissionBasisAmount)}</div>
                        <div className="muted">수수료 {formatNumber(item.commissionAmount)}</div>
                        <div className="muted">{item.commissionType ?? "-"}</div>
                      </td>
                      <td>
                        <div>{item.payMeansType ?? "-"}</div>
                        <div className="muted">완료 {item.settleCompleteDate ?? "-"}</div>
                        <div className="muted">과세반영 {item.taxReturnDate ?? "-"}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {filters.detailType === "vat" && currentCount > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>기준일</th>
                    <th>총 매출</th>
                    <th>과세 / 면세</th>
                    <th>카드 / 현금영수증</th>
                    <th>기타 증빙</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vatItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div>{item.settleBasisDate ?? "-"}</div>
                        <div className="muted">{item.merchantName ?? item.merchantId ?? "-"}</div>
                      </td>
                      <td>{formatNumber(item.totalSalesAmount)}</td>
                      <td>
                        <div>과세 {formatNumber(item.taxationSalesAmount)}</div>
                        <div className="muted">면세 {formatNumber(item.taxExemptionSalesAmount)}</div>
                      </td>
                      <td>
                        <div>카드 {formatNumber(item.creditCardAmount)}</div>
                        <div className="muted">
                          현금영수증 {formatNumber(item.cashIncomeDeductionAmount)}
                        </div>
                      </td>
                      <td>
                        <div>지출증빙 {formatNumber(item.cashOutgoingEvidenceAmount)}</div>
                        <div className="muted">
                          발행제외 {formatNumber(item.cashExclusionIssuanceAmount)}
                        </div>
                        <div className="muted">기타 {formatNumber(item.otherAmount)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {currentCount === 0 ? (
              <div className="empty">선택한 탭에 표시할 정산 데이터가 없습니다.</div>
            ) : null}
          </div>
        ) : (
          <div className="empty">조건에 맞는 정산 데이터가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
