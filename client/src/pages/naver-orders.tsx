import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import {
  NAVER_ORDER_MAX_ITEMS,
  NAVER_ORDER_PAGE_SIZE_OPTIONS,
  type NaverOrderDetailResponse,
  type NaverOrderListResponse,
  type NaverOrderRow,
} from "@shared/naver-orders";
import { ApiFreshnessCard } from "@/components/api-freshness-card";
import { OrderTicketDialog } from "@/components/order-ticket-dialog";
import { OrderTicketSection, TicketInfoTable } from "@/components/order-ticket-sections";
import { StatusBadge } from "@/components/status-badge";
import { getResponseCacheState, isStaleCachedResponse } from "@/lib/freshness";
import { formatNaverClaimLabel, formatTicketText } from "@/lib/order-ticket";
import { getJson, getJsonWithRefresh, queryPresets, refreshQueryData } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate, formatNumber } from "@/lib/utils";

interface StoresResponse {
  items: ChannelStoreSummary[];
}

type FilterState = {
  selectedStoreId: string;
  lastChangedFrom: string;
  lastChangedTo: string;
  status: string;
  query: string;
  maxItems: number;
};

const ORDER_STATUS_OPTIONS = [
  { value: "", label: "전체 상태" },
  { value: "PAYED", label: "결제 완료" },
  { value: "DELIVERING", label: "배송 중" },
  { value: "DELIVERED", label: "배송 완료" },
  { value: "PURCHASE_DECIDED", label: "구매 확정" },
  { value: "RETURNED", label: "반품" },
  { value: "EXCHANGED", label: "교환" },
  { value: "CANCELED", label: "취소" },
] as const;

function defaultDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
  lastChangedFrom: defaultDate(-6),
  lastChangedTo: defaultDate(0),
  status: "",
  query: "",
  maxItems: 60,
};

function buildOrdersUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    lastChangedFrom: filters.lastChangedFrom,
    lastChangedTo: filters.lastChangedTo,
    maxItems: String(filters.maxItems),
  });

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }

  return `/api/naver/orders?${params.toString()}`;
}

function buildOrderDetailUrl(storeId: string, productOrderId: string) {
  const params = new URLSearchParams({
    storeId,
  });

  return `/api/naver/orders/${productOrderId}?${params.toString()}`;
}

function formatPerson(primary: string | null, secondary: string | null) {
  if (primary && secondary) {
    return `${primary} / ${secondary}`;
  }

  return primary ?? secondary ?? "-";
}

function formatCurrency(value: number | null | undefined) {
  return value == null ? "-" : `${formatNumber(value)}원`;
}

function hasClaimData(item: NaverOrderRow | null | undefined) {
  return Boolean(
    item?.claimTypeLabel ||
      item?.claimStatusLabel ||
      item?.claimReason ||
      item?.claimDetailReason,
  );
}

export default function NaverOrdersPage() {
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "naver.orders",
    DEFAULT_FILTERS,
  );
  const [detailProductOrderId, setDetailProductOrderId] = useState<string | null>(null);
  const ordersQueryKey = [
    "/api/naver/orders",
    filters.selectedStoreId,
    filters.lastChangedFrom,
    filters.lastChangedTo,
    filters.status,
    filters.query,
    filters.maxItems,
  ] as const;
  const ordersQueryUrl = buildOrdersUrl(filters);

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

  const ordersQuery = useQuery({
    queryKey: ordersQueryKey,
    queryFn: () => getJson<NaverOrderListResponse>(ordersQueryUrl),
    enabled:
      Boolean(filters.selectedStoreId) &&
      Boolean(filters.lastChangedFrom) &&
      Boolean(filters.lastChangedTo),
    ...queryPresets.listSnapshot,
  });
  const refreshOrders = () =>
    refreshQueryData({
      queryKey: ordersQueryKey,
      queryFn: () => getJsonWithRefresh<NaverOrderListResponse>(ordersQueryUrl),
      gcTime: queryPresets.listSnapshot.gcTime,
    });
  const ordersCacheState = getResponseCacheState(ordersQuery.data);

  useEffect(() => {
    if (!ordersQuery.data || ordersQuery.isFetching) {
      return;
    }

    if (!isStaleCachedResponse(ordersQuery.data)) {
      return;
    }

    void refreshOrders();
  }, [ordersQuery.data, ordersQuery.isFetching]);

  const items = ordersQuery.data?.items || [];
  const executableCount = items.filter((item) => item.isExecutable).length;
  const claimCount = items.filter((item) => hasClaimData(item)).length;
  const detailSummary = items.find((item) => item.productOrderId === detailProductOrderId) ?? null;

  useEffect(() => {
    if (!detailProductOrderId) {
      return;
    }

    if (!items.some((item) => item.productOrderId === detailProductOrderId)) {
      setDetailProductOrderId(null);
    }
  }, [detailProductOrderId, items]);

  const detailQuery = useQuery({
    queryKey: ["/api/naver/orders/detail", filters.selectedStoreId, detailProductOrderId],
    queryFn: () =>
      getJson<NaverOrderDetailResponse>(
        buildOrderDetailUrl(filters.selectedStoreId, detailProductOrderId!),
      ),
    enabled: Boolean(filters.selectedStoreId && detailProductOrderId),
    ...queryPresets.detail,
  });

  const detailItem = detailQuery.data?.item ?? detailSummary;
  const detailClaimLabel = formatNaverClaimLabel({
    claimTypeLabel: detailItem?.claimTypeLabel,
    claimStatusLabel: detailItem?.claimStatusLabel,
  });
  const detailTabs = [
    {
      id: "order",
      label: "주문정보",
      content: detailQuery.isLoading && !detailQuery.data ? (
        <div className="feedback">
          <strong>상세 정보를 불러오는 중입니다.</strong>
        </div>
      ) : detailQuery.error ? (
        <div className="feedback error">
          <strong>상세 정보를 불러오지 못했습니다.</strong>
          <div>{(detailQuery.error as Error).message}</div>
        </div>
      ) : !detailItem ? (
        <div className="empty">주문 상세 정보가 없습니다.</div>
      ) : (
        <>
          <OrderTicketSection title="주문정보">
            <TicketInfoTable
              rows={[
                { label: "주문번호", value: detailItem.orderId },
                { label: "상품주문번호", value: detailItem.productOrderId },
                { label: "주문시", value: formatTicketText(formatDate(detailItem.orderedAt)) },
                { label: "결제시", value: formatTicketText(formatDate(detailItem.paidAt)) },
                { label: "주문상태", value: detailItem.productOrderStatusLabel },
                { label: "변경구분", value: formatTicketText(detailItem.lastChangedType) },
                { label: "변경일", value: formatTicketText(formatDate(detailItem.lastChangedAt)) },
                { label: "결제금액", value: formatCurrency(detailItem.paymentAmount) },
              ]}
            />
          </OrderTicketSection>

          <OrderTicketSection title="상품정보">
            <TicketInfoTable
              rows={[
                { label: "상품명", value: detailItem.productName },
                { label: "옵션", value: formatTicketText(detailItem.optionName) },
                { label: "수량", value: formatTicketText(detailItem.quantity == null ? null : formatNumber(detailItem.quantity)) },
                {
                  label: "잔여수량",
                  value: formatTicketText(
                    detailItem.remainQuantity == null ? null : formatNumber(detailItem.remainQuantity),
                  ),
                },
                { label: "상품번호", value: formatTicketText(detailItem.productId) },
                { label: "판매자코드", value: formatTicketText(detailItem.sellerProductCode) },
              ]}
            />
          </OrderTicketSection>

          <OrderTicketSection title="배송정보">
            <TicketInfoTable
              rows={[
                { label: "구매자", value: formatTicketText(detailItem.buyerName) },
                { label: "구매자 연락처", value: formatTicketText(detailItem.buyerPhone) },
                { label: "수취인", value: formatTicketText(detailItem.receiverName) },
                { label: "수취인 연락처", value: formatTicketText(detailItem.receiverPhone) },
                { label: "배송주소", value: formatTicketText(detailItem.receiverAddress) },
                { label: "우편번호", value: formatTicketText(detailItem.receiverPostCode) },
                { label: "배송메모", value: formatTicketText(detailItem.deliveryMemo) },
                { label: "배송방법", value: formatTicketText(detailItem.deliveryMethod) },
                {
                  label: "택배 / 송장",
                  value: formatTicketText(
                    [detailItem.courierName ?? detailItem.courierCode, detailItem.trackingNumber]
                      .filter(Boolean)
                      .join(" / "),
                  ),
                },
                { label: "발송기한", value: formatTicketText(formatDate(detailItem.dispatchDueDate)) },
              ]}
            />
          </OrderTicketSection>
        </>
      ),
    },
  ];

  if (hasClaimData(detailItem)) {
    detailTabs.push({
      id: "claim",
      label: "CS/클레임(1)",
      content: detailItem ? (
        <OrderTicketSection title="클레임 정보">
          <TicketInfoTable
            rows={[
              { label: "클레임 유형", value: formatTicketText(detailItem.claimTypeLabel) },
              { label: "클레임 상태", value: formatTicketText(detailItem.claimStatusLabel) },
              { label: "사유", value: formatTicketText(detailItem.claimReason) },
              { label: "상세사유", value: formatTicketText(detailItem.claimDetailReason) },
              { label: "최근 변경일", value: formatTicketText(formatDate(detailItem.lastChangedAt)) },
              { label: "변경구분", value: formatTicketText(detailItem.lastChangedType) },
            ]}
          />
        </OrderTicketSection>
      ) : (
        <div className="empty">클레임 정보가 없습니다.</div>
      ),
    });
  }

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="live" label="실연동" />
          <StatusBadge tone="live" label="클레임 표시" />
        </div>
        <h1>NAVER 주문 조회</h1>
        <p>
          변경 이력을 기준으로 주문을 조회하고, 상태 셀에서 CS 유형을 바로 확인한 뒤 티켓형 팝업으로 상세를
          확인합니다.
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
            value={filters.lastChangedFrom}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                lastChangedFrom: event.target.value,
              }))
            }
          />

          <input
            type="date"
            value={filters.lastChangedTo}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                lastChangedTo: event.target.value,
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
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
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
            placeholder="주문번호, 상품명, 상품주문번호 검색"
            style={{ minWidth: 280 }}
          />

          <select
            value={filters.maxItems}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                maxItems: Math.max(
                  1,
                  Math.min(Number(event.target.value), NAVER_ORDER_MAX_ITEMS),
                ),
              }))
            }
          >
            {NAVER_ORDER_PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                최대 {option}건
              </option>
            ))}
          </select>

          <button
            className="button secondary"
            onClick={() => void refreshOrders()}
            disabled={!filters.selectedStoreId || ordersQuery.isFetching}
          >
            {ordersQuery.isFetching ? "불러오는 중..." : "새로고침"}
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">조회 주문</div>
          <div className="metric-value">{ordersQuery.data?.totalCount ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">실행 가능 주문</div>
          <div className="metric-value">{executableCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">CS 포함 주문</div>
          <div className="metric-value">{claimCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">마지막 조회</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatDate(ordersQuery.data?.fetchedAt)}
          </div>
        </div>
      </div>

      {ordersQuery.data ? (
        <ApiFreshnessCard
          fetchedAt={ordersQuery.data.fetchedAt}
          cacheState={ordersCacheState}
          servedFromCache={ordersQuery.data.servedFromCache}
          isFetching={ordersQuery.isFetching && Boolean(ordersQuery.data)}
        />
      ) : null}

      <div className="card">
        {!stores.length ? (
          <div className="empty">먼저 NAVER 연결관리에서 스토어를 등록해 주세요.</div>
        ) : ordersQuery.isLoading ? (
          <div className="empty">NAVER 주문을 불러오는 중입니다.</div>
        ) : ordersQuery.error ? (
          <div className="empty">{(ordersQuery.error as Error).message}</div>
        ) : items.length ? (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>주문</th>
                  <th>상품</th>
                  <th>상태</th>
                  <th>수량 / 결제금액</th>
                  <th>구매자 / 수취인</th>
                  <th>배송정보</th>
                  <th>변경일</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const claimLabel = formatNaverClaimLabel({
                    claimTypeLabel: item.claimTypeLabel,
                    claimStatusLabel: item.claimStatusLabel,
                  });

                  return (
                    <tr key={item.id}>
                      <td>
                        <div>
                          <strong>{item.orderId}</strong>
                        </div>
                        <div className="muted">상품주문 {item.productOrderId}</div>
                      </td>
                      <td>
                        <div>
                          <strong>{item.productName}</strong>
                        </div>
                        <div className="muted">{item.optionName ?? "-"}</div>
                      </td>
                      <td>
                        <div className={`status-pill ${(item.productOrderStatus ?? "").toLowerCase()}`}>
                          {item.productOrderStatusLabel}
                        </div>
                        {claimLabel ? (
                          <div className="order-status-note cs">{claimLabel}</div>
                        ) : (
                          <div className="muted">
                            {item.lastChangedType ?? "-"}
                            {item.isExecutable ? " / 실행 가능" : ""}
                          </div>
                        )}
                      </td>
                      <td>
                        <div>수량 {formatNumber(item.quantity)}</div>
                        <div className="muted">결제 {formatCurrency(item.paymentAmount)}</div>
                      </td>
                      <td>{formatPerson(item.buyerName, item.receiverName)}</td>
                      <td>
                        <div>{item.deliveryMethod ?? "-"}</div>
                        <div className="muted">
                          {item.courierCode ?? item.courierName ?? "-"} / {item.trackingNumber ?? "-"}
                        </div>
                      </td>
                      <td>
                        <div>{formatDate(item.lastChangedAt)}</div>
                        <div className="muted">주문 {formatDate(item.orderedAt)}</div>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="button ghost"
                            onClick={() => setDetailProductOrderId(item.productOrderId)}
                          >
                            상세
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">조건에 맞는 주문이 없습니다.</div>
        )}
      </div>

      <OrderTicketDialog
        open={Boolean(detailProductOrderId)}
        title="주문상세조회"
        subtitle={
          detailItem
            ? `주문번호 ${detailItem.orderId} / 상품주문번호 ${detailItem.productOrderId}`
            : undefined
        }
        headerAside={
          detailItem ? (
            <div className="order-ticket-header-meta">
              <div className={`status-pill ${(detailItem.productOrderStatus ?? "").toLowerCase()}`}>
                {detailItem.productOrderStatusLabel}
              </div>
              {detailClaimLabel ? <div className="order-status-note cs">{detailClaimLabel}</div> : null}
            </div>
          ) : null
        }
        tabs={detailTabs}
        onClose={() => setDetailProductOrderId(null)}
      />
    </div>
  );
}
