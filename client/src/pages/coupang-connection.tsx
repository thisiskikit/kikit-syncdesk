import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ConnectionTestResult } from "@shared/channel-settings";
import type { CoupangStoreSummary, UpsertCoupangStoreInput } from "@shared/coupang";
import type { OperationLogEntry } from "@shared/operations";
import { useOperations } from "@/components/operation-provider";
import { StatusBadge } from "@/components/status-badge";
import { apiRequestJson, getJson, queryClient } from "@/lib/queryClient";

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

interface TestConnectionResponse extends ConnectionTestResult {
  operation?: OperationLogEntry;
}

type FormState = {
  id?: string;
  storeName: string;
  vendorId: string;
  shipmentPlatformKey: string;
  accessKey: string;
  secretKey: string;
  hasStoredSecret: boolean;
  secretKeyMasked: string | null;
  baseUrl: string;
};

const EMPTY_FORM: FormState = {
  storeName: "",
  vendorId: "",
  shipmentPlatformKey: "",
  accessKey: "",
  secretKey: "",
  hasStoredSecret: false,
  secretKeyMasked: null,
  baseUrl: "https://api-gateway.coupang.com",
};

function toFormState(store?: CoupangStoreSummary | null): FormState {
  if (!store) {
    return { ...EMPTY_FORM };
  }

  return {
    id: store.id,
    storeName: store.storeName,
    vendorId: store.vendorId,
    shipmentPlatformKey: store.shipmentPlatformKey ?? "",
    accessKey: store.credentials.accessKey,
    secretKey: "",
    hasStoredSecret: store.credentials.hasSecretKey,
    secretKeyMasked: store.credentials.secretKeyMasked,
    baseUrl: store.baseUrl,
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

export default function CoupangConnectionPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>("new");
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);
  const { startLocalOperation, finishLocalOperation, removeLocalOperation, publishOperation } =
    useOperations();

  const storesQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
  });

  const stores = storesQuery.data?.items || [];
  const selectedStore =
    selectedStoreId === "new"
      ? null
      : stores.find((store) => store.id === selectedStoreId) ?? null;

  useEffect(() => {
    if (selectedStoreId !== "new" && selectedStore) {
      return;
    }

    if (selectedStoreId === "new") {
      return;
    }

    if (stores[0]) {
      setSelectedStoreId(stores[0].id);
      return;
    }

    setSelectedStoreId("new");
  }, [selectedStore, selectedStoreId, stores]);

  useEffect(() => {
    if (selectedStoreId === "new") {
      setForm({ ...EMPTY_FORM });
      setConnectionResult(null);
      return;
    }

    if (!selectedStore) {
      return;
    }

    setForm(toFormState(selectedStore));
    if (selectedStore.connectionTest.status === "idle") {
      setConnectionResult(null);
      return;
    }

    setConnectionResult({
      status: selectedStore.connectionTest.status,
      testedAt: selectedStore.connectionTest.testedAt ?? new Date().toISOString(),
      message: selectedStore.connectionTest.message ?? "",
    });
  }, [selectedStore, selectedStoreId]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<{ item: CoupangStoreSummary; message: string }>("POST", "/api/coupang/stores", {
        id: form.id,
        storeName: form.storeName,
        vendorId: form.vendorId,
        shipmentPlatformKey: form.shipmentPlatformKey || undefined,
        baseUrl: form.baseUrl,
        credentials: {
          accessKey: form.accessKey,
          secretKey: form.secretKey || undefined,
        },
      } satisfies UpsertCoupangStoreInput),
    onSuccess: async (result) => {
      setSaveMessage("저장됨");
      setSelectedStoreId(result.item.id);
      setForm(toFormState(result.item));
      await queryClient.invalidateQueries({ queryKey: ["/api/coupang/stores"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<TestConnectionResponse>("POST", "/api/coupang/stores/test-connection", {
        storeId: form.id,
        vendorId: form.vendorId,
        baseUrl: form.baseUrl,
        credentials: {
          accessKey: form.accessKey,
          secretKey: form.secretKey || undefined,
        },
      }),
    onMutate: () =>
      startLocalOperation({
        channel: "coupang",
        actionName: "COUPANG 연결 테스트",
        targetCount: 1,
      }),
    onSuccess: async (result, _variables, localToastId) => {
      if (localToastId) {
        finishLocalOperation(localToastId, {
          status: result.status === "success" ? "success" : "warning",
          summary: result.message,
        });
        window.setTimeout(() => removeLocalOperation(localToastId), 800);
      }

      if (result.operation) {
        publishOperation(result.operation);
      }

      setConnectionResult(result);
      if (form.id && !form.secretKey) {
        await queryClient.invalidateQueries({ queryKey: ["/api/coupang/stores"] });
      }
    },
    onError: (error, _variables, localToastId) => {
      if (localToastId) {
        finishLocalOperation(localToastId, {
          status: "error",
          errorMessage: error instanceof Error ? error.message : "연결 테스트에 실패했습니다.",
        });
      }
    },
  });

  const connectionStatus =
    connectionResult?.status ?? (selectedStore?.connectionTest.status || "idle");
  const connectionMessage =
    connectionResult?.message ?? selectedStore?.connectionTest.message ?? "연결 테스트 전";
  const connectionTestedAt =
    connectionResult?.testedAt ?? selectedStore?.connectionTest.testedAt ?? null;

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="draft" />
        </div>
        <h1>COUPANG 연결관리</h1>
        <p>vendorId, accessKey, secretKey, base URL을 저장하고 쿠팡 API 응답 여부를 즉시 확인합니다.</p>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">저장 상태</div>
          <div className="metric-value">{saveMessage ?? "저장 전"}</div>
        </div>
        <div className="metric">
          <div className="metric-label">연결 상태</div>
          <div className="metric-value">
            {connectionStatus === "success"
              ? "성공"
              : connectionStatus === "failed"
                ? "실패"
                : "미테스트"}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">최근 테스트</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatDateTime(connectionTestedAt)}
          </div>
        </div>
      </div>

      <div className="card settings-card">
        <div className="settings-grid">
          <div className="stack">
            <label className="field">
              <span>스토어 선택</span>
              <select
                value={selectedStoreId}
                onChange={(event) => {
                  setSelectedStoreId(event.target.value);
                  setSaveMessage(null);
                }}
              >
                <option value="new">새 스토어</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.storeName} ({store.vendorId})
                  </option>
                ))}
              </select>
            </label>

            <div className="feedback">
              <strong>연결 메시지</strong>
              <div className={`status-pill ${connectionStatus}`}>{connectionMessage}</div>
            </div>
          </div>

          <div className="stack">
            <div className="form-grid">
              <label className="field">
                <span>스토어명</span>
                <input
                  value={form.storeName}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, storeName: event.target.value }));
                    setSaveMessage(null);
                  }}
                  placeholder="예: KIKIT Coupang Main"
                />
              </label>

              <label className="field">
                <span>vendorId</span>
                <input
                  value={form.vendorId}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, vendorId: event.target.value }));
                    setSaveMessage(null);
                  }}
                  placeholder="예: A00012345"
                />
              </label>

              <label className="field">
                <span>배송 KEY</span>
                <input
                  value={form.shipmentPlatformKey}
                  onChange={(event) => {
                    setForm((prev) => ({
                      ...prev,
                      shipmentPlatformKey: event.target.value.toUpperCase().slice(0, 1),
                    }));
                    setSaveMessage(null);
                  }}
                  placeholder="예: A"
                  maxLength={1}
                />
              </label>

              <label className="field">
                <span>accessKey</span>
                <input
                  value={form.accessKey}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, accessKey: event.target.value }));
                    setSaveMessage(null);
                  }}
                  placeholder="Coupang access key"
                />
              </label>

              <label className="field">
                <span>secretKey</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.secretKey}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, secretKey: event.target.value }));
                    setSaveMessage(null);
                  }}
                  placeholder={
                    form.hasStoredSecret
                      ? "비워두면 저장된 secret 유지"
                      : "Coupang secret key"
                  }
                />
              </label>

              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Base URL</span>
                <input
                  value={form.baseUrl}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, baseUrl: event.target.value }));
                    setSaveMessage(null);
                  }}
                  placeholder="https://api-gateway.coupang.com"
                />
              </label>
            </div>

            {form.hasStoredSecret ? (
              <div className="muted">저장된 secret: {form.secretKeyMasked ?? "********"}</div>
            ) : null}

            <div className="toolbar">
              <button className="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "저장 중..." : "저장"}
              </button>
              <button
                className="button secondary"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending ? "연결 테스트 중..." : "연결 테스트"}
              </button>
              <button
                className="button ghost"
                onClick={() => {
                  setSelectedStoreId("new");
                  setForm({ ...EMPTY_FORM });
                  setSaveMessage(null);
                  setConnectionResult(null);
                }}
              >
                새 스토어 초기화
              </button>
            </div>

            {(saveMutation.error || testMutation.error) && (
              <div className="feedback error">
                <strong>오류 메시지</strong>
                <div className="muted">
                  {(saveMutation.error as Error | null)?.message ||
                    (testMutation.error as Error | null)?.message}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
