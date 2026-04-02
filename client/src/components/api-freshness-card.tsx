import { isApiCacheState, type ApiCacheState } from "@shared/api";
import { formatDate } from "@/lib/utils";

type ApiFreshnessCardProps = {
  fetchedAt?: string | null;
  cacheState?: ApiCacheState | null;
  servedFromCache?: boolean;
  isFetching?: boolean;
  refreshLabel?: string;
};

function resolveCacheState(input: {
  cacheState?: ApiCacheState | null;
  servedFromCache?: boolean;
}) {
  if (isApiCacheState(input.cacheState)) {
    return input.cacheState;
  }

  return input.servedFromCache ? "fresh-cache" : "live";
}

export function ApiFreshnessCard({
  fetchedAt,
  cacheState,
  servedFromCache,
  isFetching = false,
  refreshLabel = "강제 새로고침",
}: ApiFreshnessCardProps) {
  const resolvedCacheState = resolveCacheState({
    cacheState,
    servedFromCache,
  });

  const stateText =
    resolvedCacheState === "live"
      ? "실시간 데이터"
      : resolvedCacheState === "stale-cache"
        ? "캐시 표시 중"
        : "캐시 표시 중";

  return (
    <div className="card">
      <div className="muted" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        <span>최근 동기화: {formatDate(fetchedAt)}</span>
        <span>{stateText}</span>
        {isFetching ? <span>백그라운드 업데이트 중</span> : null}
        <span>{refreshLabel}</span>
      </div>
    </div>
  );
}
