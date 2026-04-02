import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import type { CoupangStoreSummary } from "@shared/coupang";
import { productLibraryStatuses, type ProductLibraryRef } from "@shared/product-library";
import type { ProductLibraryListResponse } from "@shared/product-library";
import { ProductLibraryDrawer } from "@/components/product-library-drawer";
import {
  buildProductLibraryRecordsQueryKey,
  buildProductLibraryRecordsUrl,
  formatProductLibraryBytes,
  formatProductLibraryStatusLabel,
} from "@/lib/product-library";
import { getJson } from "@/lib/queryClient";
import { formatDate, formatNumber } from "@/lib/utils";

interface StoresResponse {
  items: ChannelStoreSummary[];
}

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

type StoreOption = {
  id: string;
  channel: string;
  storeName: string;
};

type ProductLibraryChannel = "naver" | "coupang";

interface ProductLibraryPageProps {
  fixedChannel?: ProductLibraryChannel;
}

const PAGE_SIZE = 50;

function getChannelLabel(channel: string) {
  if (channel === "naver") {
    return "네이버";
  }

  if (channel === "coupang") {
    return "쿠팡";
  }

  return channel;
}

function getLibraryTitle(fixedChannel?: ProductLibraryChannel) {
  return fixedChannel ? `${getChannelLabel(fixedChannel)} 자료실` : "자료실";
}

function getLibraryDescription(fixedChannel?: ProductLibraryChannel) {
  if (fixedChannel === "naver") {
    return "네이버 상품의 메모, 상태, 태그, 첨부 파일을 한곳에서 관리합니다.";
  }

  if (fixedChannel === "coupang") {
    return "쿠팡 상품의 메모, 상태, 태그, 첨부 파일을 한곳에서 관리합니다.";
  }

  return "네이버와 쿠팡 상품의 메모, 상태, 태그, 첨부 파일을 한곳에서 관리합니다.";
}

function getStatusTone(status: string) {
  if (status === "done") {
    return "success";
  }

  if (status === "approval_delay" || status === "on_hold") {
    return "attention";
  }

  return "pending";
}

export default function ProductLibraryPage({ fixedChannel }: ProductLibraryPageProps) {
  const [channel, setChannel] = useState(fixedChannel ?? "");
  const [storeId, setStoreId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [selectedReference, setSelectedReference] = useState<ProductLibraryRef | null>(null);

  const activeChannel = fixedChannel ?? channel;
  const isChannelLocked = Boolean(fixedChannel);

  const storesQuery = useQuery({
    queryKey: ["/api/settings/stores"],
    queryFn: () => getJson<StoresResponse>("/api/settings/stores"),
  });

  const coupangStoresQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
  });

  const availableStores = useMemo(() => {
    const items: StoreOption[] = [
      ...(storesQuery.data?.items ?? []).map((item) => ({
        id: item.id,
        channel: item.channel,
        storeName: item.storeName,
      })),
      ...(coupangStoresQuery.data?.items ?? []).map((item) => ({
        id: item.id,
        channel: item.channel,
        storeName: item.storeName,
      })),
    ];

    if (!activeChannel) {
      return items.filter((item) => item.channel === "naver" || item.channel === "coupang");
    }

    return items.filter((item) => item.channel === activeChannel);
  }, [activeChannel, coupangStoresQuery.data?.items, storesQuery.data?.items]);

  useEffect(() => {
    if (!storeId) {
      return;
    }

    if (availableStores.some((item) => item.id === storeId)) {
      return;
    }

    setStoreId("");
  }, [availableStores, storeId]);

  useEffect(() => {
    if (!fixedChannel || channel === fixedChannel) {
      return;
    }

    setChannel(fixedChannel);
  }, [channel, fixedChannel]);

  const recordsQuery = useQuery({
    queryKey: buildProductLibraryRecordsQueryKey({
      channel: activeChannel,
      storeId,
      status,
      search,
      tag,
      page,
      pageSize: PAGE_SIZE,
    }),
    queryFn: () =>
      getJson<ProductLibraryListResponse>(
        buildProductLibraryRecordsUrl({
          channel: activeChannel,
          storeId,
          status,
          search,
          tag,
          page,
          pageSize: PAGE_SIZE,
        }),
      ),
    staleTime: 5_000,
  });

  useEffect(() => {
    setPage(1);
  }, [activeChannel, search, status, storeId, tag]);

  const total = recordsQuery.data?.total ?? 0;
  const totalPages = recordsQuery.data?.totalPages ?? 1;
  const items = recordsQuery.data?.items ?? [];

  return (
    <div className="page">
      <div className="hero">
        <h1>{getLibraryTitle(fixedChannel)}</h1>
        <p>{getLibraryDescription(fixedChannel)}</p>
      </div>

      <div className="card">
        <div className="toolbar">
          {!isChannelLocked ? (
            <select
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
            >
              <option value="">전체 채널</option>
              <option value="naver">네이버</option>
              <option value="coupang">쿠팡</option>
            </select>
          ) : null}

          <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
            <option value="">전체 스토어</option>
            {availableStores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.storeName}
              </option>
            ))}
          </select>

          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">전체 상태</option>
            {productLibraryStatuses.map((item) => (
              <option key={item} value={item}>
                {formatProductLibraryStatusLabel(item)}
              </option>
            ))}
          </select>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="상품명 / 상품 ID / 판매자코드 / 메모 검색"
          />

          <input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="태그 검색"
          />
        </div>

        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <div className="muted">총 {formatNumber(total)}건</div>
          <div className="toolbar explorer-pagination">
            <button
              type="button"
              className="button secondary"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              이전
            </button>
            <span className="muted">
              {page} / {Math.max(1, totalPages)}
            </span>
            <button
              type="button"
              className="button secondary"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
            >
              다음
            </button>
          </div>
        </div>

        {recordsQuery.isError ? (
          <div className="feedback error">
            {recordsQuery.error instanceof Error
              ? recordsQuery.error.message
              : "자료실 목록을 불러오지 못했습니다."}
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>채널</th>
                <th>스토어</th>
                <th>상품명</th>
                <th>상태</th>
                <th>태그</th>
                <th>첨부 개수</th>
                <th>사용 용량</th>
                <th>최종 수정일</th>
              </tr>
            </thead>
            <tbody>
              {recordsQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="empty">
                    자료실 목록을 불러오는 중입니다.
                  </td>
                </tr>
              ) : items.length ? (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="table-row-expandable"
                    onClick={() =>
                      setSelectedReference({
                        channel: item.channel,
                        storeId: item.storeId,
                        channelProductId: item.channelProductId,
                        secondaryChannelProductId: item.secondaryChannelProductId,
                        storeName: item.storeName,
                        productName: item.productName,
                        sellerProductCode: item.sellerProductCode,
                      })
                    }
                  >
                    <td>{getChannelLabel(item.channel)}</td>
                    <td>{item.storeName}</td>
                    <td>
                      <div className="table-cell-stack">
                        <strong>{item.productName}</strong>
                        <div className="muted">{item.channelProductId}</div>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${getStatusTone(item.status)}`}>
                        {formatProductLibraryStatusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      <div className="chip-row">
                        {item.tags.length ? (
                          item.tags.map((entry) => (
                            <span key={entry} className="chip">
                              #{entry}
                            </span>
                          ))
                        ) : (
                          "-"
                        )}
                      </div>
                    </td>
                    <td>{formatNumber(item.attachmentCount)}</td>
                    <td>{formatProductLibraryBytes(item.attachmentBytes)}</td>
                    <td>{formatDate(item.updatedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="empty">
                    조건에 맞는 자료실 항목이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProductLibraryDrawer
        open={Boolean(selectedReference)}
        reference={selectedReference}
        onClose={() => setSelectedReference(null)}
        onRecordChanged={(record) => {
          setSelectedReference({
            channel: record.channel,
            storeId: record.storeId,
            channelProductId: record.channelProductId,
            secondaryChannelProductId: record.secondaryChannelProductId,
            storeName: record.storeName,
            productName: record.productName,
            sellerProductCode: record.sellerProductCode,
          });
        }}
      />
    </div>
  );
}
