import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CoupangStoreSummary } from "@shared/coupang";
import type {
  CoupangRocketGrowthInventoryListResponse,
  CoupangRocketGrowthOrderListResponse,
  CoupangRocketGrowthProductListResponse,
} from "@shared/coupang-support";
import { StatusBadge } from "@/components/status-badge";
import { getJson } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate, formatNumber } from "@/lib/utils";

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

type FilterState = {
  selectedStoreId: string;
  sellerProductName: string;
  vendorItemId: string;
  paidDateFrom: string;
  paidDateTo: string;
  panel: "products" | "inventory" | "orders";
  productNextToken: string;
  inventoryNextToken: string;
  orderNextToken: string;
};

function defaultDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
  sellerProductName: "",
  vendorItemId: "",
  paidDateFrom: defaultDate(-6),
  paidDateTo: defaultDate(0),
  panel: "products",
  productNextToken: "",
  inventoryNextToken: "",
  orderNextToken: "",
};

function buildRocketProductsUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    maxPerPage: "30",
  });
  if (filters.sellerProductName.trim()) {
    params.set("sellerProductName", filters.sellerProductName.trim());
  }
  if (filters.productNextToken.trim()) {
    params.set("nextToken", filters.productNextToken.trim());
  }
  return `/api/coupang/rocket-growth/products?${params.toString()}`;
}

function buildRocketInventoryUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
  });
  if (filters.vendorItemId.trim()) {
    params.set("vendorItemId", filters.vendorItemId.trim());
  }
  if (filters.inventoryNextToken.trim() && !filters.vendorItemId.trim()) {
    params.set("nextToken", filters.inventoryNextToken.trim());
  }
  return `/api/coupang/rocket-growth/inventory?${params.toString()}`;
}

function buildRocketOrdersUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    paidDateFrom: filters.paidDateFrom,
    paidDateTo: filters.paidDateTo,
  });
  if (filters.orderNextToken.trim()) {
    params.set("nextToken", filters.orderNextToken.trim());
  }
  return `/api/coupang/rocket-growth/orders?${params.toString()}`;
}

function SourceBadge(props: { source?: "live" | "fallback" }) {
  return (
    <StatusBadge
      tone={props.source === "live" ? "live" : "draft"}
      label={props.source === "live" ? "실데이터" : "대체데이터"}
    />
  );
}

export default function CoupangRocketGrowthPage() {
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "coupang.rocket-growth",
    DEFAULT_FILTERS,
  );

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

  const productsQuery = useQuery({
    queryKey: [
      "/api/coupang/rocket-growth/products",
      filters.selectedStoreId,
      filters.sellerProductName,
      filters.productNextToken,
    ],
    queryFn: () => getJson<CoupangRocketGrowthProductListResponse>(buildRocketProductsUrl(filters)),
    enabled: Boolean(filters.selectedStoreId),
  });

  const inventoryQuery = useQuery({
    queryKey: [
      "/api/coupang/rocket-growth/inventory",
      filters.selectedStoreId,
      filters.vendorItemId,
      filters.inventoryNextToken,
    ],
    queryFn: () => getJson<CoupangRocketGrowthInventoryListResponse>(buildRocketInventoryUrl(filters)),
    enabled: Boolean(filters.selectedStoreId),
  });

  const ordersQuery = useQuery({
    queryKey: [
      "/api/coupang/rocket-growth/orders",
      filters.selectedStoreId,
      filters.paidDateFrom,
      filters.paidDateTo,
      filters.orderNextToken,
    ],
    queryFn: () => getJson<CoupangRocketGrowthOrderListResponse>(buildRocketOrdersUrl(filters)),
    enabled: Boolean(filters.selectedStoreId && filters.paidDateFrom && filters.paidDateTo),
  });

  const totalVendorItems = useMemo(
    () => (productsQuery.data?.items ?? []).reduce((sum, item) => sum + item.vendorItemIds.length, 0),
    [productsQuery.data?.items],
  );

  const totalOrderItems = useMemo(
    () => (ordersQuery.data?.items ?? []).reduce((sum, item) => sum + item.totalSalesQuantity, 0),
    [ordersQuery.data?.items],
  );

  const liveMode =
    productsQuery.data?.source === "live" ||
    inventoryQuery.data?.source === "live" ||
    ordersQuery.data?.source === "live";
  const messages = [
    productsQuery.data?.message,
    inventoryQuery.data?.message,
    ordersQuery.data?.message,
  ].filter(Boolean);

  function refetchActivePanel() {
    if (filters.panel === "products") {
      void productsQuery.refetch();
      return;
    }
    if (filters.panel === "inventory") {
      void inventoryQuery.refetch();
      return;
    }
    void ordersQuery.refetch();
  }

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone={liveMode ? "live" : "draft"} label={liveMode ? "실데이터" : "대체데이터"} />
          <StatusBadge tone="shared" label="공식 조회 API" />
        </div>
        <h1>쿠팡 로켓그로스</h1>
        <p>상품, 재고, 주문 조회를 공식 OpenAPI 기준으로 한 화면에서 확인합니다.</p>
      </div>

      <div className="card">
        <div className="segmented-control">
          {([
            { key: "products", label: "상품" },
            { key: "inventory", label: "재고" },
            { key: "orders", label: "주문" },
          ] as const).map((panel) => (
            <button
              key={panel.key}
              type="button"
              className={`segmented-button ${filters.panel === panel.key ? "active" : ""}`}
              onClick={() => setFilters((current) => ({ ...current, panel: panel.key }))}
            >
              {panel.label}
            </button>
          ))}
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
                productNextToken: "",
                inventoryNextToken: "",
                orderNextToken: "",
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

          {filters.panel === "products" ? (
            <input
              value={filters.sellerProductName}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  sellerProductName: event.target.value,
                  productNextToken: "",
                }))
              }
              placeholder="로켓그로스 상품명 검색"
              style={{ minWidth: 240 }}
            />
          ) : null}

          {filters.panel === "inventory" ? (
            <input
              value={filters.vendorItemId}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  vendorItemId: event.target.value,
                  inventoryNextToken: "",
                }))
              }
              placeholder="vendorItemId 재고 조회"
              style={{ minWidth: 220 }}
            />
          ) : null}

          {filters.panel === "orders" ? (
            <>
              <input
                type="date"
                value={filters.paidDateFrom}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    paidDateFrom: event.target.value,
                    orderNextToken: "",
                  }))
                }
              />
              <input
                type="date"
                value={filters.paidDateTo}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    paidDateTo: event.target.value,
                    orderNextToken: "",
                  }))
                }
              />
            </>
          ) : null}

          <button className="button secondary" disabled={!filters.selectedStoreId} onClick={refetchActivePanel}>
            새로고침
          </button>
          <button
            className="button ghost"
            disabled={
              (filters.panel === "products" && !filters.productNextToken) ||
              (filters.panel === "inventory" && !filters.inventoryNextToken) ||
              (filters.panel === "orders" && !filters.orderNextToken)
            }
            onClick={() =>
              setFilters((current) => ({
                ...current,
                productNextToken: filters.panel === "products" ? "" : current.productNextToken,
                inventoryNextToken: filters.panel === "inventory" ? "" : current.inventoryNextToken,
                orderNextToken: filters.panel === "orders" ? "" : current.orderNextToken,
              }))
            }
          >
            처음부터
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">상품 수</div>
          <div className="metric-value">{productsQuery.data?.items.length ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">옵션 수</div>
          <div className="metric-value">{totalVendorItems}</div>
        </div>
        <div className="metric">
          <div className="metric-label">재고 수</div>
          <div className="metric-value">{inventoryQuery.data?.items.length ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">주문 수량</div>
          <div className="metric-value">{totalOrderItems}</div>
        </div>
      </div>

      {messages.map((message) => (
        <div key={message} className="feedback warning">
          <strong>조회 메모</strong>
          <div className="muted">{message}</div>
        </div>
      ))}

      {filters.panel === "products" ? (
        <div className="card">
          <div className="card-header">
            <div>
              <strong>로켓그로스 상품</strong>
              <div className="muted">RFM/하이브리드 상품, 옵션 연결, 최근 수정 시각을 확인합니다.</div>
            </div>
            <SourceBadge source={productsQuery.data?.source} />
          </div>
          {productsQuery.isLoading ? (
            <div className="empty">로켓그로스 상품을 불러오는 중입니다.</div>
          ) : productsQuery.error ? (
            <div className="empty">{(productsQuery.error as Error).message}</div>
          ) : productsQuery.data?.items.length ? (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>상품</th>
                      <th>유형</th>
                      <th>카테고리</th>
                      <th>옵션</th>
                      <th>상태</th>
                      <th>수정일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productsQuery.data.items.map((item) => (
                      <tr key={item.sellerProductId}>
                        <td>
                          <div>
                            <strong>{item.sellerProductName}</strong>
                          </div>
                          <div className="muted">{item.sellerProductId}</div>
                        </td>
                        <td>
                          <span className={`status-pill ${item.productType.toLowerCase()}`}>{item.productType}</span>
                        </td>
                        <td>
                          <div>{item.displayCategoryName ?? "-"}</div>
                          <div className="muted">{item.displayCategoryCode ?? "-"}</div>
                        </td>
                        <td>{item.vendorItemIds.join(", ") || "-"}</td>
                        <td>{item.statusName ?? "-"}</td>
                        <td>{formatDate(item.lastModifiedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="detail-actions" style={{ marginTop: "1rem" }}>
                <div className="muted">다음 토큰: {productsQuery.data.nextToken ?? "없음"}</div>
                <button
                  className="button ghost"
                  disabled={!productsQuery.data.nextToken}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      productNextToken: productsQuery.data?.nextToken ?? "",
                    }))
                  }
                >
                  다음 페이지
                </button>
              </div>
            </>
          ) : (
            <div className="empty">조회된 로켓그로스 상품이 없습니다.</div>
          )}
        </div>
      ) : null}

      {filters.panel === "inventory" ? (
        <div className="card">
          <div className="card-header">
            <div>
              <strong>로켓그로스 재고</strong>
              <div className="muted">주문 가능 재고와 최근 30일 판매량을 확인합니다.</div>
            </div>
            <SourceBadge source={inventoryQuery.data?.source} />
          </div>
          {inventoryQuery.isLoading ? (
            <div className="empty">로켓그로스 재고를 불러오는 중입니다.</div>
          ) : inventoryQuery.error ? (
            <div className="empty">{(inventoryQuery.error as Error).message}</div>
          ) : inventoryQuery.data?.items.length ? (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>vendorItemId</th>
                      <th>externalSkuId</th>
                      <th>주문 가능 재고</th>
                      <th>최근 30일 판매</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryQuery.data.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.vendorItemId}</td>
                        <td>{item.externalSkuId ?? "-"}</td>
                        <td>{formatNumber(item.totalOrderableQuantity)}</td>
                        <td>{formatNumber(item.salesCountLastThirtyDays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="detail-actions" style={{ marginTop: "1rem" }}>
                <div className="muted">다음 토큰: {inventoryQuery.data.nextToken ?? "없음"}</div>
                <button
                  className="button ghost"
                  disabled={Boolean(filters.vendorItemId.trim()) || !inventoryQuery.data.nextToken}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      inventoryNextToken: inventoryQuery.data?.nextToken ?? "",
                    }))
                  }
                >
                  다음 페이지
                </button>
              </div>
            </>
          ) : (
            <div className="empty">조회된 로켓그로스 재고가 없습니다.</div>
          )}
        </div>
      ) : null}

      {filters.panel === "orders" ? (
        <div className="card">
          <div className="card-header">
            <div>
              <strong>로켓그로스 주문</strong>
              <div className="muted">결제 완료 주문과 주문 상품 구성을 조회합니다.</div>
            </div>
            <SourceBadge source={ordersQuery.data?.source} />
          </div>
          {ordersQuery.isLoading ? (
            <div className="empty">로켓그로스 주문을 불러오는 중입니다.</div>
          ) : ordersQuery.error ? (
            <div className="empty">{(ordersQuery.error as Error).message}</div>
          ) : ordersQuery.data?.items.length ? (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>주문</th>
                      <th>결제일시</th>
                      <th>상품</th>
                      <th>수량</th>
                      <th>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersQuery.data.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div>
                            <strong>{item.orderId}</strong>
                          </div>
                          <div className="muted">{item.vendorId ?? "-"}</div>
                        </td>
                        <td>{formatDate(item.paidAt)}</td>
                        <td>
                          <div>{item.orderItems[0]?.productName ?? "-"}</div>
                          <div className="muted">
                            {item.orderItems.length > 1
                              ? `외 ${item.orderItems.length - 1}건`
                              : item.orderItems[0]?.vendorItemId ?? "-"}
                          </div>
                        </td>
                        <td>{formatNumber(item.totalSalesQuantity)}</td>
                        <td>
                          {item.currency ?? "KRW"} {formatNumber(item.totalSalesAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="detail-actions" style={{ marginTop: "1rem" }}>
                <div className="muted">다음 토큰: {ordersQuery.data.nextToken ?? "없음"}</div>
                <button
                  className="button ghost"
                  disabled={!ordersQuery.data.nextToken}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      orderNextToken: ordersQuery.data?.nextToken ?? "",
                    }))
                  }
                >
                  다음 페이지
                </button>
              </div>
            </>
          ) : (
            <div className="empty">조회된 로켓그로스 주문이 없습니다.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
