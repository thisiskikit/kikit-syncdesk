import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { CatalogOptionRow } from "@shared/channel-control";
import { ControlGrid } from "@/components/control-grid";
import { apiRequest, apiRequestJson, getJson, queryClient } from "@/lib/queryClient";
import { useDebouncedValue } from "@/lib/use-debounced-value";

interface CatalogResponse {
  items: CatalogOptionRow[];
  total: number;
  limit: number;
  offset: number;
}

export default function CatalogPage() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState<"all" | "naver" | "coupang">("all");
  const [mapped, setMapped] = useState<"all" | "mapped" | "unmapped">("all");
  const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(new Set());
  const debouncedQ = useDebouncedValue(q, 250);

  const catalogQuery = useQuery({
    queryKey: ["/api/catalog/options", debouncedQ, channel, mapped],
    queryFn: () =>
      getJson<CatalogResponse>(
        `/api/catalog/options?q=${encodeURIComponent(debouncedQ)}&channel=${channel}&mapped=${mapped}&limit=200`,
      ),
  });

  const syncRunsQuery = useQuery({
    queryKey: ["/api/catalog/sync-runs"],
    queryFn: () =>
      getJson<Array<{ id: string; channel: string; status: string; summaryJson: Record<string, unknown> }>>(
        "/api/catalog/sync-runs",
      ),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/catalog/sync", { channels: ["naver", "coupang"] }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/catalog/options"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/catalog/sync-runs"] });
    },
  });

  const rows = catalogQuery.data?.items || [];
  const rowsById = useMemo(
    () => new Map(rows.map((row) => [row.id, row] as const)),
    [rows],
  );

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      const rows = Array.from(selectedRows)
        .map((rowId) => rowsById.get(rowId))
        .filter((row): row is CatalogOptionRow => row !== undefined);
      const draft = await apiRequestJson<{ id: string }>("POST", "/api/drafts", {
        source: "manual",
        note: `Selected ${rows.length} catalog rows`,
      });
      await apiRequest("POST", `/api/drafts/${draft.id}/items`, {
        items: rows.map((row) => ({
          channel: row.channel,
          masterSku: row.masterSku,
          optionSku: row.optionSku,
          channelProductId: row.channelProductId,
          channelOptionId: row.channelOptionId,
          requestedPatch: {},
        })),
      });
      return draft;
    },
    onSuccess: (draft) => navigate(`/engine/drafts/${draft.id}`),
  });

  return (
    <div className="page">
      <div className="hero">
        <h1>채널 옵션 통합 조회</h1>
        <p>네이버와 쿠팡 옵션을 로컬 카탈로그 기준으로 검색하고 draft의 시작점으로 선택합니다.</p>
      </div>

      <div className="card">
        <div className="toolbar">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="상품명, SKU, 판매자상품코드, 채널상품번호 검색"
            style={{ flex: 1, minWidth: 260 }}
          />
          <select value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}>
            <option value="all">전체 채널</option>
            <option value="naver">네이버</option>
            <option value="coupang">쿠팡</option>
          </select>
          <select value={mapped} onChange={(event) => setMapped(event.target.value as typeof mapped)}>
            <option value="all">전체 매핑</option>
            <option value="mapped">매핑 완료</option>
            <option value="unmapped">매핑 필요</option>
          </select>
          <button className="button secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? "동기화 중..." : "채널 동기화"}
          </button>
          <button className="button" onClick={() => createDraftMutation.mutate()} disabled={selectedRows.size === 0 || createDraftMutation.isPending}>
            선택 항목으로 Draft 만들기
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">검색 결과</div>
          <div className="metric-value">{catalogQuery.data?.total ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">선택된 옵션</div>
          <div className="metric-value">{selectedRows.size}</div>
        </div>
        <div className="metric">
          <div className="metric-label">최근 Sync Runs</div>
          <div className="metric-value">{syncRunsQuery.data?.length ?? 0}</div>
        </div>
      </div>

      <div className="card">
        {catalogQuery.isLoading ? (
          <div className="empty">카탈로그를 불러오는 중입니다.</div>
        ) : rows.length === 0 ? (
          <div className="empty">아직 동기화된 옵션이 없습니다. 먼저 채널 동기화를 실행하세요.</div>
        ) : (
          <ControlGrid rows={rows} selectedRows={selectedRows} onSelectedRowsChange={setSelectedRows} />
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>최근 동기화 기록</h3>
        {syncRunsQuery.data?.length ? (
          <div className="run-list">
            {syncRunsQuery.data.map((run) => (
              <div key={run.id} className="run-row">
                <div>
                  <strong>{run.channel}</strong>
                  <div className="muted">{JSON.stringify(run.summaryJson)}</div>
                </div>
                <div className={`status-pill ${run.status}`}>{run.status}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">동기화 기록이 없습니다.</div>
        )}
      </div>
    </div>
  );
}
