import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { apiRequestJson, getJson, queryClient, queryPresets, refreshQueryData } from "@/lib/queryClient";

interface RunRow {
  id: string;
  draftId: string;
  status: string;
  createdBy: string;
  summaryJson: Record<string, unknown>;
  createdAt: string;
}

interface RunDetailResponse {
  run: RunRow;
  items: Array<{
    id: string;
    channel: string;
    optionSku: string | null;
    channelOptionId: string;
    status: string;
    errorMessage: string | null;
    requestedPatchJson: Record<string, unknown>;
  }>;
}

export default function RunsPage() {
  const search = useSearch();
  const routeRunId = new URLSearchParams(search).get("runId");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(routeRunId);
  const runsQueryKey = ["/api/executions/runs"] as const;
  const detailQueryKey = ["/api/executions/runs", selectedRunId] as const;

  const runsQuery = useQuery({
    queryKey: runsQueryKey,
    queryFn: () => getJson<RunRow[]>("/api/executions/runs"),
    ...queryPresets.listSnapshot,
  });

  useEffect(() => {
    if (routeRunId && routeRunId !== selectedRunId) {
      setSelectedRunId(routeRunId);
      return;
    }

    if (!selectedRunId && runsQuery.data?.[0]?.id) {
      setSelectedRunId(runsQuery.data[0].id);
    }
  }, [routeRunId, runsQuery.data, selectedRunId]);

  const detailQuery = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => getJson<RunDetailResponse>(`/api/executions/runs/${selectedRunId}`),
    enabled: Boolean(selectedRunId),
    ...queryPresets.detail,
  });
  const refreshRuns = () =>
    refreshQueryData({
      queryKey: runsQueryKey,
      queryFn: () => getJson<RunRow[]>("/api/executions/runs"),
      gcTime: queryPresets.listSnapshot.gcTime,
    });

  const retryMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<RunDetailResponse>(
        "POST",
        `/api/executions/runs/${selectedRunId}/retry-failures`,
        {},
      ),
    onSuccess: async (result) => {
      setSelectedRunId(result.run.id);
      await queryClient.invalidateQueries({ queryKey: ["/api/executions/runs"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/executions/runs", result.run.id] });
    },
  });

  return (
    <div className="page">
      <div className="hero">
        <h1>실행 로그 / 실패 재실행</h1>
        <p>run 단위 결과와 item 단위 오류를 확인하고 실패건만 다시 실행합니다.</p>
      </div>

      <div className="split">
        <div className="card">
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Execution Runs</h3>
            <button className="button secondary" onClick={() => void refreshRuns()}>
              새로고침
            </button>
          </div>
          {runsQuery.data?.length ? (
            <div className="run-list" style={{ marginTop: "1rem" }}>
              {runsQuery.data.map((run) => (
                <div
                  key={run.id}
                  className={`run-row ${selectedRunId === run.id ? "active" : ""}`}
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <div>
                    <strong>{run.id.slice(0, 8)}</strong>
                    <div className="muted">draft {run.draftId.slice(0, 8)}</div>
                    <div className="muted">{JSON.stringify(run.summaryJson)}</div>
                  </div>
                  <div className={`status-pill ${run.status}`}>{run.status}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">실행 기록이 없습니다.</div>
          )}
        </div>

        <div className="card">
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Run Detail</h3>
            <button
              className="button"
              onClick={() => retryMutation.mutate()}
              disabled={!selectedRunId || retryMutation.isPending}
            >
              실패건 재실행
            </button>
          </div>
          {detailQuery.data ? (
            <table className="table" style={{ marginTop: "1rem" }}>
              <thead>
                <tr>
                  <th>대상</th>
                  <th>상태</th>
                  <th>요청 patch</th>
                  <th>오류</th>
                </tr>
              </thead>
              <tbody>
                {detailQuery.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div>
                        <strong>{item.optionSku ?? item.channelOptionId}</strong>
                      </div>
                      <div className="muted">{item.channel}</div>
                    </td>
                    <td>
                      <div className={`status-pill ${item.status}`}>{item.status}</div>
                    </td>
                    <td className="muted">{JSON.stringify(item.requestedPatchJson)}</td>
                    <td className="muted">{item.errorMessage ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">좌측에서 run을 선택하세요.</div>
          )}
        </div>
      </div>
    </div>
  );
}
