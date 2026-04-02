import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import type { ControlPatch, DraftPreviewRow } from "@shared/channel-control";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { DraftPreview } from "@/components/draft-preview";
import { apiRequest, apiRequestJson, getJson, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/utils";

interface DraftDetailResponse {
  draft: {
    id: string;
    status: string;
    note: string | null;
    csvFileName: string | null;
    summaryJson: Record<string, unknown>;
  };
  items: Array<{
    id: string;
    channel: "naver" | "coupang";
    masterSku: string | null;
    optionSku: string | null;
    channelProductId: string | null;
    channelOptionId: string | null;
    requestedPatchJson: ControlPatch;
  }>;
  previewRows: DraftPreviewRow[];
}

export default function DraftPage() {
  const [match, params] = useRoute<{ id: string }>("/engine/drafts/:id");
  const [, navigate] = useLocation();
  const [csvOpen, setCsvOpen] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<string, ControlPatch>>({});
  const draftId = match ? params.id : null;

  const draftQuery = useQuery({
    queryKey: ["/api/drafts", draftId],
    queryFn: () => getJson<DraftDetailResponse>(`/api/drafts/${draftId}`),
    enabled: Boolean(draftId),
  });

  useEffect(() => {
    if (!draftQuery.data) return;
    const nextState: Record<string, ControlPatch> = {};
    for (const item of draftQuery.data.items) {
      nextState[item.id] = { ...item.requestedPatchJson };
    }
    setDraftEdits(nextState);
  }, [draftQuery.data]);

  const saveItemMutation = useMutation({
    mutationFn: async (input: { itemId: string; patch: ControlPatch }) => {
      await apiRequest("PATCH", `/api/drafts/${draftId}/items/${input.itemId}`, {
        requestedPatch: input.patch,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/drafts", draftId] });
    },
  });

  const validateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/drafts/${draftId}/validate`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/drafts", draftId] });
    },
  });

  const executeMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<{ run: { id: string } }>("POST", "/api/executions", { draftId }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/executions/runs"] });
      navigate(`/engine/runs?runId=${result.run.id}`);
    },
  });

  const previewData = useMemo(() => {
    const previewRows = draftQuery.data?.previewRows || [];
    const previewById = new Map<string, DraftPreviewRow>();
    const summary = {
      total: previewRows.length,
      valid: 0,
      invalid: 0,
    };

    for (const row of previewRows) {
      previewById.set(row.draftItemId, row);
      if (row.validationStatus === "valid") {
        summary.valid += 1;
      } else if (row.validationStatus === "invalid") {
        summary.invalid += 1;
      }
    }

    return {
      previewRows,
      previewById,
      summary,
    };
  }, [draftQuery.data?.previewRows]);

  if (!draftId) {
    return (
      <div className="page">
        <div className="empty">Draft ID가 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="hero">
        <h1>Draft 편집 / 검증</h1>
        <p>선택한 옵션 또는 CSV 업로드 항목에 patch를 입력하고 실행 전 검증을 수행합니다.</p>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Draft 상태</div>
          <div className="metric-value">{draftQuery.data?.draft.status ?? "-"}</div>
        </div>
        <div className="metric">
          <div className="metric-label">전체 항목</div>
          <div className="metric-value">{previewData.summary.total}</div>
        </div>
        <div className="metric">
          <div className="metric-label">검증 통과</div>
          <div className="metric-value">{previewData.summary.valid}</div>
        </div>
        <div className="metric">
          <div className="metric-label">검증 실패</div>
          <div className="metric-value">{previewData.summary.invalid}</div>
        </div>
      </div>

      <div className="toolbar">
        <button className="button secondary" onClick={() => setCsvOpen(true)}>
          CSV 업로드
        </button>
        <button className="button ghost" onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending}>
          {validateMutation.isPending ? "검증 중..." : "검증 실행"}
        </button>
        <button className="button" onClick={() => executeMutation.mutate()} disabled={executeMutation.isPending}>
          {executeMutation.isPending ? "실행 중..." : "실행"}
        </button>
      </div>

      <div className="split">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Draft 항목</h3>
          {draftQuery.isLoading ? (
            <div className="empty">Draft를 불러오는 중입니다.</div>
          ) : draftQuery.data?.items.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>대상</th>
                  <th>현재값</th>
                  <th>변경안</th>
                  <th>저장</th>
                </tr>
              </thead>
              <tbody>
                {draftQuery.data.items.map((item) => {
                  const preview = previewData.previewById.get(item.id);
                  const current = preview?.current;
                  const patch = draftEdits[item.id] || {};

                  return (
                    <tr key={item.id}>
                      <td>
                        <div>
                          <strong>{current?.productName ?? item.optionSku ?? item.channelOptionId}</strong>
                        </div>
                        <div className="muted">
                          {item.channel} / {current?.optionName ?? "-"}
                        </div>
                        <div className="muted">
                          {item.masterSku ?? "-"} / {item.optionSku ?? "-"}
                        </div>
                      </td>
                      <td>
                        <div>가격 {formatNumber(current?.price)}</div>
                        <div>재고 {formatNumber(current?.stockQuantity)}</div>
                        <div>판매 {current?.saleStatus ?? "-"}</div>
                        <div>품절 {current?.soldOutStatus ?? "-"}</div>
                      </td>
                      <td style={{ minWidth: 260 }}>
                        <div className="toolbar" style={{ flexDirection: "column", alignItems: "stretch" }}>
                          <input
                            type="number"
                            placeholder="price"
                            value={patch.price ?? ""}
                            onChange={(event) =>
                              setDraftEdits((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  price: event.target.value ? Number(event.target.value) : undefined,
                                },
                              }))
                            }
                          />
                          <input
                            type="number"
                            placeholder="stockQuantity"
                            value={patch.stockQuantity ?? ""}
                            onChange={(event) =>
                              setDraftEdits((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  stockQuantity: event.target.value ? Number(event.target.value) : undefined,
                                },
                              }))
                            }
                          />
                          <select
                            value={patch.saleStatus ?? ""}
                            onChange={(event) =>
                              setDraftEdits((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  saleStatus: event.target.value
                                    ? (event.target.value as ControlPatch["saleStatus"])
                                    : undefined,
                                },
                              }))
                            }
                          >
                            <option value="">saleStatus</option>
                            <option value="on_sale">on_sale</option>
                            <option value="sale_stopped">sale_stopped</option>
                          </select>
                          <select
                            value={patch.soldOutStatus ?? ""}
                            onChange={(event) =>
                              setDraftEdits((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  soldOutStatus: event.target.value
                                    ? (event.target.value as ControlPatch["soldOutStatus"])
                                    : undefined,
                                },
                              }))
                            }
                          >
                            <option value="">soldOutStatus</option>
                            <option value="in_stock">in_stock</option>
                            <option value="sold_out">sold_out</option>
                          </select>
                        </div>
                      </td>
                      <td>
                        <button
                          className="button secondary"
                          onClick={() => saveItemMutation.mutate({ itemId: item.id, patch })}
                          disabled={saveItemMutation.isPending}
                        >
                          저장
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">아직 draft item이 없습니다.</div>
          )}
        </div>

        <DraftPreview rows={previewData.previewRows} />
      </div>

      <CsvImportDialog
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImport={async (rows, fileName) => {
          await apiRequest("POST", `/api/drafts/${draftId}/items`, {
            items: rows,
            csvFileName: fileName,
          });
          await queryClient.invalidateQueries({ queryKey: ["/api/drafts", draftId] });
        }}
      />
    </div>
  );
}
