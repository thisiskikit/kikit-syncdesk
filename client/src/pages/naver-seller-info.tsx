import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import type {
  NaverSellerInfoResponse,
  NaverSellerSectionStatus,
} from "@shared/naver-seller";
import { StatusBadge } from "@/components/status-badge";
import { getJson } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate } from "@/lib/utils";

interface StoresResponse {
  items: ChannelStoreSummary[];
}

type FilterState = {
  selectedStoreId: string;
};

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
};

function buildSellerInfoUrl(storeId: string) {
  return `/api/naver/seller-info?storeId=${encodeURIComponent(storeId)}`;
}

function getSectionStatusBadge(status: NaverSellerSectionStatus) {
  if (status.status === "available") {
    return <span className="status-pill success">실연동</span>;
  }

  if (status.status === "restricted") {
    return <span className="status-pill pending">권한 제한</span>;
  }

  return <span className="status-pill failed">확인 필요</span>;
}

function getConnectionBadge(status: NaverSellerInfoResponse["lastSyncStatus"]) {
  if (status === "success") {
    return <span className="status-pill success">정상</span>;
  }

  if (status === "warning") {
    return <span className="status-pill pending">일부 제한</span>;
  }

  return <span className="status-pill failed">오류</span>;
}

export default function NaverSellerInfoPage() {
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "naver.seller-info",
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

  const sellerQuery = useQuery({
    queryKey: ["/api/naver/seller-info", filters.selectedStoreId],
    queryFn: () => getJson<NaverSellerInfoResponse>(buildSellerInfoUrl(filters.selectedStoreId)),
    enabled: Boolean(filters.selectedStoreId),
  });

  const seller = sellerQuery.data;

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="live" label="실연동" />
          <StatusBadge tone="coming" label="읽기 전용" />
        </div>
        <h1>NAVER 판매자정보</h1>
        <p>
          계정, 채널, 물류사, 출고지, 당일발송 기준을 읽기 전용으로 모아 보고 마지막 동기화
          상태를 빠르게 점검할 수 있습니다.
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

          <button
            className="button secondary"
            onClick={() => void sellerQuery.refetch()}
            disabled={!filters.selectedStoreId || sellerQuery.isFetching}
          >
            {sellerQuery.isFetching ? "동기화 중..." : "새로고침"}
          </button>

          <div className="muted">
            마지막 조회 {formatDate(seller?.fetchedAt)}
          </div>
        </div>
      </div>

      {!stores.length ? (
        <div className="card">
          <div className="empty">먼저 NAVER 연결관리에서 스토어를 등록해 주세요.</div>
        </div>
      ) : sellerQuery.isLoading ? (
        <div className="card">
          <div className="empty">NAVER 판매자 정보를 불러오는 중입니다.</div>
        </div>
      ) : sellerQuery.error ? (
        <div className="card">
          <div className="empty">{(sellerQuery.error as Error).message}</div>
        </div>
      ) : seller ? (
        <>
          <div className="metric-grid">
            <div className="metric">
              <div className="metric-label">연결 상태</div>
              <div className="metric-value" style={{ fontSize: "1rem" }}>
                {seller.connectionTest ? getConnectionBadge(seller.lastSyncStatus) : "-"}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">채널 수</div>
              <div className="metric-value">{seller.channels.length}</div>
            </div>
            <div className="metric">
              <div className="metric-label">물류사 수</div>
              <div className="metric-value">{seller.logisticsCompanies.length}</div>
            </div>
            <div className="metric">
              <div className="metric-label">출고지 수</div>
              <div className="metric-value">{seller.outboundLocations.length}</div>
            </div>
          </div>

          {seller.notes.length ? (
            <div className="feedback warning">
              <strong>조회 참고</strong>
              <ul className="messages">
                {seller.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="detail-grid">
            <div className="detail-card">
              <div className="card-header">
                <strong>연결 테스트</strong>
                {seller.connectionTest?.status === "success" ? (
                  <StatusBadge tone="live" label="최근 성공" />
                ) : (
                  <StatusBadge tone="coming" label="확인 필요" />
                )}
              </div>
              <div>스토어: {seller.store.name}</div>
              <div className="muted">테스트 시각 {formatDate(seller.connectionTest?.testedAt)}</div>
              <div className="muted">{seller.connectionTest?.message ?? "마지막 연결 테스트 메시지가 없습니다."}</div>
            </div>

            <div className="detail-card">
              <div className="card-header">
                <strong>계정 정보</strong>
                {getSectionStatusBadge(seller.sections.account)}
              </div>
              <div>Account ID: {seller.account?.accountId ?? "-"}</div>
              <div className="muted">Account UID: {seller.account?.accountUid ?? "-"}</div>
              <div className="muted">등급: {seller.account?.grade ?? "-"}</div>
            </div>

            <div className="detail-card">
              <div className="card-header">
                <strong>당일 발송 기준</strong>
                {getSectionStatusBadge(seller.sections.todayDispatch)}
              </div>
              <div>
                기준 시간{" "}
                {seller.todayDispatch?.basisHour !== null && seller.todayDispatch?.basisHour !== undefined
                  ? `${seller.todayDispatch.basisHour}시 ${seller.todayDispatch.basisMinute ?? 0}분`
                  : "-"}
              </div>
              <div className="muted">휴무 요일: {seller.todayDispatch?.holidayOfTheWeek ?? "-"}</div>
              <div className="muted">
                지정 휴무: {seller.todayDispatch?.sellerHolidays.join(", ") || "-"}
              </div>
            </div>

            <div className="detail-card">
              <div className="card-header">
                <strong>동기화 요약</strong>
                {getConnectionBadge(seller.lastSyncStatus)}
              </div>
              <div>최근 동기화: {formatDate(seller.fetchedAt)}</div>
              <div className="muted">제한 구간은 경고로 남기고 나머지 데이터는 계속 표시합니다.</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <strong>채널 정보</strong>
                <div className="table-note">계정에 연결된 판매 채널 목록입니다.</div>
              </div>
              {getSectionStatusBadge(seller.sections.channels)}
            </div>
            {seller.channels.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>채널번호</th>
                      <th>채널명</th>
                      <th>타입</th>
                      <th>URL</th>
                      <th>톡톡 계정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seller.channels.map((channel) => (
                      <tr key={channel.channelNo}>
                        <td>{channel.channelNo}</td>
                        <td>{channel.name ?? "-"}</td>
                        <td>{channel.channelType ?? "-"}</td>
                        <td className="muted">{channel.url ?? "-"}</td>
                        <td>{channel.talkTalkAccountId ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">표시할 채널 정보가 없습니다.</div>
            )}
          </div>

          <div className="split">
            <div className="card">
              <div className="card-header">
                <div>
                  <strong>물류사 정보</strong>
                  <div className="table-note">발송 처리에서 사용할 수 있는 택배사 코드 참고용입니다.</div>
                </div>
                {getSectionStatusBadge(seller.sections.logisticsCompanies)}
              </div>
              {seller.logisticsCompanies.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>물류사 ID</th>
                        <th>물류사명</th>
                        <th>배송 타입</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seller.logisticsCompanies.map((company) => (
                        <tr key={company.logisticsCompanyId}>
                          <td>{company.logisticsCompanyId}</td>
                          <td>{company.logisticsCompanyName ?? "-"}</td>
                          <td>{company.deliveryTypes.join(", ") || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">표시할 물류사 정보가 없습니다.</div>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <strong>출고지 정보</strong>
                  <div className="table-note">제휴 배송 매핑을 함께 보여줍니다.</div>
                </div>
                {getSectionStatusBadge(seller.sections.outboundLocations)}
              </div>
              {seller.outboundLocations.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>출고지 ID</th>
                        <th>출고지명</th>
                        <th>매핑</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seller.outboundLocations.map((location) => (
                        <tr key={location.outboundLocationId}>
                          <td>{location.outboundLocationId}</td>
                          <td>{location.outboundLocationName ?? "-"}</td>
                          <td className="muted">
                            {location.mappings.length
                              ? location.mappings
                                  .map(
                                    (mapping) =>
                                      `${mapping.allianceName ?? mapping.allianceId ?? "제휴"} / ${mapping.deliveryType ?? "-"}`,
                                  )
                                  .join(", ")
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">표시할 출고지 정보가 없습니다.</div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
