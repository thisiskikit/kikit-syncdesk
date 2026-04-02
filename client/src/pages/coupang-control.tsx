import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import type {
  CoupangProductListResponse,
  CoupangStoreSummary,
  CoupangVendorItemActionResponse,
} from "@shared/coupang";
import { StatusBadge } from "@/components/status-badge";
import { useOperations } from "@/components/operation-provider";
import { apiRequestJson, getJson } from "@/lib/queryClient";
import { formatDate, formatNumber } from "@/lib/utils";
import { usePersistentState } from "@/lib/use-persistent-state";

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

type FilterState = {
  selectedStoreId: string;
  sellerProductName: string;
  maxPerPage: number;
};

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
  sellerProductName: "",
  maxPerPage: 10,
};

export default function CoupangControlPage() {
  const search = useSearch();
  const [filters, setFilters] = usePersistentState<FilterState>(
    "kikit:coupang-control",
    DEFAULT_FILTERS,
  );
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const { startLocalOperation, finishLocalOperation, removeLocalOperation, publishOperation } =
    useOperations();

  const selectedSellerProductId = useMemo(
    () => new URLSearchParams(search).get("sellerProductId") ?? "",
    [search],
  );

  const storesQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
  });

  const stores = storesQuery.data?.items || [];

  useEffect(() => {
    if (filters.selectedStoreId || !stores[0]) {
      return;
    }

    setFilters((current) => ({
      ...current,
      selectedStoreId: stores[0].id,
    }));
  }, [filters.selectedStoreId, setFilters, stores]);

  const productsQuery = useQuery({
    queryKey: [
      "/api/coupang/products",
      filters.selectedStoreId,
      filters.sellerProductName,
      filters.maxPerPage,
      "full",
    ],
    queryFn: () =>
      getJson<CoupangProductListResponse>(
        `/api/coupang/products?storeId=${encodeURIComponent(filters.selectedStoreId)}&maxPerPage=${filters.maxPerPage}&sellerProductName=${encodeURIComponent(filters.sellerProductName)}&detailLevel=full`,
      ),
    enabled: Boolean(filters.selectedStoreId),
  });

  const vendorRows = useMemo(() => {
    const products = productsQuery.data?.items || [];
    const filteredProducts = selectedSellerProductId
      ? products.filter((product) => product.sellerProductId === selectedSellerProductId)
      : products;

    return filteredProducts.flatMap((product) =>
      product.vendorItems.map((item) => ({
        sellerProductId: product.sellerProductId,
        sellerProductName: product.sellerProductName,
        createdAt: product.createdAt,
        vendorItemId: item.vendorItemId,
        itemName: item.itemName,
        externalVendorSku: item.externalVendorSku,
        salePrice: item.salePrice,
        inventoryCount: item.inventoryCount,
        saleStatus: item.saleStatus,
        lastModifiedAt: item.lastModifiedAt,
      })),
    );
  }, [productsQuery.data?.items, selectedSellerProductId]);

  useEffect(() => {
    setPriceDrafts((current) => {
      const next = { ...current };
      let changed = false;

      for (const row of vendorRows) {
        if (next[row.vendorItemId] === undefined) {
          next[row.vendorItemId] = row.salePrice !== null ? String(row.salePrice) : "";
          changed = true;
        }
      }

      return changed ? next : current;
    });

    setQuantityDrafts((current) => {
      const next = { ...current };
      let changed = false;

      for (const row of vendorRows) {
        if (next[row.vendorItemId] === undefined) {
          next[row.vendorItemId] = row.inventoryCount !== null ? String(row.inventoryCount) : "";
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [vendorRows]);

  async function runItemAction(input: {
    toastTitle: string;
    busyKey: string;
    request: () => Promise<CoupangVendorItemActionResponse>;
  }) {
    const localToastId = startLocalOperation({
      channel: "coupang",
      actionName: input.toastTitle,
      targetCount: 1,
    });
    setBusyAction(input.busyKey);

    try {
      const result = await input.request();
      if (result.operation) {
        publishOperation(result.operation);
      }
      finishLocalOperation(localToastId, {
        status: "success",
        summary: result.item.message,
      });
      window.setTimeout(() => removeLocalOperation(localToastId), 800);
      await productsQuery.refetch();
    } catch (error) {
      finishLocalOperation(localToastId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "작업에 실패했습니다.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone={productsQuery.data?.source === "live" ? "live" : "draft"} />
        </div>
        <h1>COUPANG 가격/재고/판매상태</h1>
        <p>상품별 옵션 단위로 가격, 재고, 판매상태를 즉시 변경하고 작업센터에 결과를 남깁니다.</p>
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
            value={filters.sellerProductName}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                sellerProductName: event.target.value,
              }))
            }
            placeholder="상품명 검색"
            style={{ minWidth: 260 }}
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
            <option value={10}>10개</option>
            <option value={20}>20개</option>
            <option value={50}>50개</option>
          </select>
        </div>
      </div>

      {productsQuery.data?.message ? (
        <div className="card">
          <div className="muted">{productsQuery.data.message}</div>
        </div>
      ) : null}

      <div className="card">
        {productsQuery.isLoading ? (
          <div className="empty">쿠팡 제어 대상 상품을 불러오는 중입니다.</div>
        ) : productsQuery.error ? (
          <div className="empty">{(productsQuery.error as Error).message}</div>
        ) : vendorRows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>상품 / 옵션</th>
                <th>등록일</th>
                <th>SKU</th>
                <th>현재 가격</th>
                <th>현재 재고</th>
                <th>판매상태</th>
                <th>가격 변경</th>
                <th>재고 변경</th>
                <th>상태 변경</th>
              </tr>
            </thead>
            <tbody>
              {vendorRows.map((row) => (
                <tr key={row.vendorItemId}>
                  <td>
                    <div>
                      <strong>{row.sellerProductName}</strong>
                    </div>
                    <div className="muted">
                      {row.itemName} · {row.vendorItemId}
                    </div>
                    <div className="muted">{formatDate(row.lastModifiedAt)}</div>
                  </td>
                  <td>{formatDate(row.createdAt)}</td>
                  <td>{row.externalVendorSku ?? "-"}</td>
                  <td>{formatNumber(row.salePrice)}</td>
                  <td>{formatNumber(row.inventoryCount)}</td>
                  <td>
                    <span className={`status-pill ${row.saleStatus === "ONSALE" ? "success" : "pending"}`}>
                      {row.saleStatus}
                    </span>
                  </td>
                  <td>
                    <div className="table-inline-actions">
                      <input
                        inputMode="numeric"
                        value={priceDrafts[row.vendorItemId] ?? ""}
                        onChange={(event) =>
                          setPriceDrafts((current) => ({
                            ...current,
                            [row.vendorItemId]: event.target.value,
                          }))
                        }
                        style={{ width: 120 }}
                      />
                      <button
                        className="button secondary"
                        disabled={busyAction !== null}
                        onClick={() =>
                          void runItemAction({
                            toastTitle: "COUPANG 가격 변경",
                            busyKey: `price:${row.vendorItemId}`,
                            request: () =>
                              apiRequestJson<CoupangVendorItemActionResponse>(
                                "POST",
                                "/api/coupang/products/price",
                                {
                                  storeId: filters.selectedStoreId,
                                  sellerProductId: row.sellerProductId,
                                  vendorItemId: row.vendorItemId,
                                  price: Number(priceDrafts[row.vendorItemId] ?? row.salePrice ?? 0),
                                },
                              ),
                          })
                        }
                      >
                        {busyAction === `price:${row.vendorItemId}` ? "처리 중..." : "가격 반영"}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="table-inline-actions">
                      <input
                        inputMode="numeric"
                        value={quantityDrafts[row.vendorItemId] ?? ""}
                        onChange={(event) =>
                          setQuantityDrafts((current) => ({
                            ...current,
                            [row.vendorItemId]: event.target.value,
                          }))
                        }
                        style={{ width: 120 }}
                      />
                      <button
                        className="button secondary"
                        disabled={busyAction !== null}
                        onClick={() =>
                          void runItemAction({
                            toastTitle: "COUPANG 재고 변경",
                            busyKey: `quantity:${row.vendorItemId}`,
                            request: () =>
                              apiRequestJson<CoupangVendorItemActionResponse>(
                                "POST",
                                "/api/coupang/products/quantity",
                                {
                                  storeId: filters.selectedStoreId,
                                  sellerProductId: row.sellerProductId,
                                  vendorItemId: row.vendorItemId,
                                  quantity: Number(quantityDrafts[row.vendorItemId] ?? row.inventoryCount ?? 0),
                                },
                              ),
                          })
                        }
                      >
                        {busyAction === `quantity:${row.vendorItemId}` ? "처리 중..." : "재고 반영"}
                      </button>
                    </div>
                  </td>
                  <td>
                    <button
                      className="button ghost"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void runItemAction({
                          toastTitle: "COUPANG 판매상태 변경",
                          busyKey: `status:${row.vendorItemId}`,
                          request: () =>
                            apiRequestJson<CoupangVendorItemActionResponse>(
                              "POST",
                              "/api/coupang/products/sale-status",
                              {
                                storeId: filters.selectedStoreId,
                                sellerProductId: row.sellerProductId,
                                vendorItemId: row.vendorItemId,
                                saleStatus: row.saleStatus === "ONSALE" ? "SUSPENDED" : "ONSALE",
                              },
                            ),
                        })
                      }
                    >
                      {busyAction === `status:${row.vendorItemId}`
                        ? "처리 중..."
                        : row.saleStatus === "ONSALE"
                          ? "판매중지"
                          : "판매재개"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">제어할 쿠팡 옵션이 없습니다.</div>
        )}
      </div>
    </div>
  );
}
