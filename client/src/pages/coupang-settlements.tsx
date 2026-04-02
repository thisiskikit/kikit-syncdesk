import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CoupangSettlementListResponse,
  CoupangSettlementRow,
  CoupangStoreSummary,
} from "@shared/coupang";
import { StatusBadge } from "@/components/status-badge";
import { getJson } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate, formatNumber } from "@/lib/utils";

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

type FilterState = {
  selectedStoreId: string;
  recognitionDateFrom: string;
  recognitionDateTo: string;
  query: string;
  maxPerPage: number;
};

function defaultDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
  recognitionDateFrom: defaultDate(-30),
  recognitionDateTo: defaultDate(0),
  query: "",
  maxPerPage: 50,
};

function buildSettlementsUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    recognitionDateFrom: filters.recognitionDateFrom,
    recognitionDateTo: filters.recognitionDateTo,
    maxPerPage: String(filters.maxPerPage),
  });

  return `/api/coupang/settlements?${params.toString()}`;
}

function matchesQuery(row: CoupangSettlementRow, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    row.orderId,
    row.productName,
    row.vendorItemName,
    row.vendorItemId,
    row.externalSellerSkuCode,
    row.saleType,
    row.taxType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function downloadCsv(filename: string, rows: string[][]) {
  const escapeCell = (value: string | number | null | undefined) => {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
      return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
  };

  const content = rows.map((row) => row.map(escapeCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function CoupangSettlementsPage() {
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "coupang.settlements",
    DEFAULT_FILTERS,
  );

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

  const settlementsQuery = useQuery({
    queryKey: [
      "/api/coupang/settlements",
      filters.selectedStoreId,
      filters.recognitionDateFrom,
      filters.recognitionDateTo,
      filters.maxPerPage,
    ],
    queryFn: () =>
      getJson<CoupangSettlementListResponse>(buildSettlementsUrl(filters)),
    enabled:
      Boolean(filters.selectedStoreId) &&
      Boolean(filters.recognitionDateFrom) &&
      Boolean(filters.recognitionDateTo),
  });

  const filteredItems = useMemo(
    () => (settlementsQuery.data?.items || []).filter((row) => matchesQuery(row, filters.query)),
    [filters.query, settlementsQuery.data?.items],
  );
  const isFallback = settlementsQuery.data?.source === "fallback";

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone={isFallback ? "draft" : "live"} label={isFallback ? "Fallback" : "실연동"} />
          <StatusBadge tone="shared" label="읽기 전용" />
        </div>
        <h1>COUPANG 정산</h1>
        <p>매출 인식 기준 정산 내역과 정산 히스토리를 함께 확인하고, 엑셀/CSV 내보내기에 적합한 표 형태로 검토합니다.</p>
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
            value={filters.recognitionDateFrom}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                recognitionDateFrom: event.target.value,
              }))
            }
          />
          <input
            type="date"
            value={filters.recognitionDateTo}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                recognitionDateTo: event.target.value,
              }))
            }
          />
          <select
            value={filters.maxPerPage}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                maxPerPage: Number(event.target.value),
              }))
            }
          >
            <option value={20}>20건</option>
            <option value={50}>50건</option>
            <option value={100}>100건</option>
          </select>
          <input
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                query: event.target.value,
              }))
            }
            placeholder="주문번호 / 상품명 / SKU 검색"
            style={{ minWidth: 260 }}
          />
          <button className="button secondary" onClick={() => void settlementsQuery.refetch()}>
            새로고침
          </button>
          <button
            className="button"
            disabled={!filteredItems.length}
            onClick={() =>
              downloadCsv("coupang-settlements.csv", [
                [
                  "orderId",
                  "productName",
                  "vendorItemId",
                  "saleType",
                  "saleDate",
                  "recognitionDate",
                  "settlementDate",
                  "salesAmount",
                  "saleAmount",
                  "settlementAmount",
                  "serviceFee",
                  "serviceFeeVat",
                  "deliveryFeeAmount",
                  "taxType",
                ],
                ...filteredItems.map((item) => [
                  item.orderId ?? "",
                  item.productName,
                  item.vendorItemId ?? "",
                  item.saleType ?? "",
                  item.saleDate ?? "",
                  item.recognitionDate ?? "",
                  item.settlementDate ?? "",
                  String(item.salesAmount ?? ""),
                  String(item.saleAmount ?? ""),
                  String(item.settlementAmount ?? ""),
                  String(item.serviceFee ?? ""),
                  String(item.serviceFeeVat ?? ""),
                  String(item.deliveryFeeAmount ?? ""),
                  item.taxType ?? "",
                ]),
              ])
            }
          >
            CSV 내보내기
          </button>
        </div>
      </div>

      {settlementsQuery.data?.message ? (
        <div className="card">
          <div className="muted">{settlementsQuery.data.message}</div>
        </div>
      ) : null}

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">집계 행 수</div>
          <div className="metric-value">{settlementsQuery.data?.summary.rowCount ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">총 매출</div>
          <div className="metric-value">{formatNumber(settlementsQuery.data?.summary.totalSalesAmount ?? 0)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">정산 금액</div>
          <div className="metric-value">{formatNumber(settlementsQuery.data?.summary.totalSettlementAmount ?? 0)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">수수료 + VAT</div>
          <div className="metric-value">
            {formatNumber(
              (settlementsQuery.data?.summary.totalServiceFee ?? 0) +
                (settlementsQuery.data?.summary.totalServiceFeeVat ?? 0),
            )}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">정산 히스토리 합계</div>
          <div className="metric-value">
            {formatNumber(settlementsQuery.data?.summary.historySettlementAmount ?? 0)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="detail-box-header">
          <div>
            <h2 style={{ margin: 0 }}>정산 히스토리</h2>
            <div className="muted">월별/예비 정산 흐름을 함께 확인합니다.</div>
          </div>
          {settlementsQuery.data?.nextToken ? (
            <div className="muted">nextToken: {settlementsQuery.data.nextToken}</div>
          ) : null}
        </div>

        {settlementsQuery.isLoading ? (
          <div className="empty">정산 데이터를 불러오는 중입니다.</div>
        ) : settlementsQuery.error ? (
          <div className="empty">{(settlementsQuery.error as Error).message}</div>
        ) : settlementsQuery.data?.histories.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>정산유형</th>
                  <th>정산일</th>
                  <th>인식기간</th>
                  <th>총매출</th>
                  <th>수수료</th>
                  <th>정산대상금액</th>
                  <th>정산금액</th>
                  <th>보류/차감</th>
                </tr>
              </thead>
              <tbody>
                {settlementsQuery.data.histories.map((row, index) => (
                  <tr key={`${row.settlementType}-${row.settlementDate ?? index}`}>
                    <td>{row.settlementType}</td>
                    <td>{formatDate(row.settlementDate)}</td>
                    <td>
                      {formatDate(row.revenueRecognitionDateFrom)} ~ {formatDate(row.revenueRecognitionDateTo)}
                    </td>
                    <td>{formatNumber(row.totalSale ?? 0)}</td>
                    <td>{formatNumber(row.serviceFee ?? 0)}</td>
                    <td>{formatNumber(row.settlementTargetAmount ?? 0)}</td>
                    <td>{formatNumber(row.settlementAmount ?? 0)}</td>
                    <td>
                      {formatNumber((row.pendingReleasedAmount ?? 0) + (row.deductionAmount ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">정산 히스토리가 없습니다.</div>
        )}
      </div>

      <div className="card">
        <div className="detail-box-header">
          <div>
            <h2 style={{ margin: 0 }}>정산 상세</h2>
            <div className="muted">상품/옵션/수수료/배송비까지 한 줄씩 확인할 수 있습니다.</div>
          </div>
          <div className="muted">표시 {filteredItems.length}건</div>
        </div>

        {settlementsQuery.isLoading ? (
          <div className="empty">정산 상세를 불러오는 중입니다.</div>
        ) : settlementsQuery.error ? (
          <div className="empty">{(settlementsQuery.error as Error).message}</div>
        ) : filteredItems.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>주문 / 상품</th>
                  <th>판매유형</th>
                  <th>인식일</th>
                  <th>매출</th>
                  <th>판매가</th>
                  <th>정산금액</th>
                  <th>수수료</th>
                  <th>VAT</th>
                  <th>배송비</th>
                  <th>과세유형</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((row) => (
                  <tr key={row.settlementId}>
                    <td>
                      <div>
                        <strong>{row.productName}</strong>
                      </div>
                      <div className="muted">
                        {row.orderId ?? "-"} / {row.vendorItemId ?? row.externalSellerSkuCode ?? "-"}
                      </div>
                    </td>
                    <td>{row.saleType ?? "-"}</td>
                    <td>
                      <div>{formatDate(row.recognitionDate)}</div>
                      <div className="muted">{formatDate(row.settlementDate)}</div>
                    </td>
                    <td>{formatNumber(row.salesAmount ?? 0)}</td>
                    <td>{formatNumber(row.saleAmount ?? 0)}</td>
                    <td>{formatNumber(row.settlementAmount ?? 0)}</td>
                    <td>{formatNumber(row.serviceFee ?? 0)}</td>
                    <td>{formatNumber(row.serviceFeeVat ?? 0)}</td>
                    <td>{formatNumber(row.deliveryFeeAmount ?? 0)}</td>
                    <td>{row.taxType ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">조회 조건에 맞는 정산 상세가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
