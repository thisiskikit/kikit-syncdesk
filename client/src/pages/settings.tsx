import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ChannelStoreSummary,
  ConnectionTestResult,
  SettingsEnabledChannel,
} from "@shared/channel-settings";
import { apiRequestJson, getJson, queryClient } from "@/lib/queryClient";

interface StoresResponse {
  items: ChannelStoreSummary[];
}

type FormState = {
  id?: string;
  channel: SettingsEnabledChannel;
  storeName: string;
  clientId: string;
  clientSecret: string;
  hasStoredSecret: boolean;
  clientSecretMasked: string | null;
};

const EMPTY_FORM: FormState = {
  channel: "naver",
  storeName: "",
  clientId: "",
  clientSecret: "",
  hasStoredSecret: false,
  clientSecretMasked: null,
};

function toFormState(store?: ChannelStoreSummary | null): FormState {
  if (!store) {
    return { ...EMPTY_FORM };
  }

  return {
    id: store.id,
    channel: store.channel as SettingsEnabledChannel,
    storeName: store.storeName,
    clientId: store.credentials.clientId,
    clientSecret: "",
    hasStoredSecret: store.credentials.hasClientSecret,
    clientSecretMasked: store.credentials.clientSecretMasked,
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

export default function SettingsPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>("new");
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);

  const storesQuery = useQuery({
    queryKey: ["/api/settings/stores"],
    queryFn: () => getJson<StoresResponse>("/api/settings/stores"),
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
      apiRequestJson<{ item: ChannelStoreSummary; message: string }>("POST", "/api/settings/stores", {
        id: form.id,
        channel: form.channel,
        storeName: form.storeName,
        credentials: {
          clientId: form.clientId,
          clientSecret: form.clientSecret || undefined,
        },
      }),
    onSuccess: async (result) => {
      setSaveMessage("저장됨");
      setSelectedStoreId(result.item.id);
      setForm(toFormState(result.item));
      await queryClient.invalidateQueries({ queryKey: ["/api/settings/stores"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<ConnectionTestResult>("POST", "/api/settings/stores/test-connection", {
        storeId: form.id,
        channel: form.channel,
        credentials: {
          clientId: form.clientId,
          clientSecret: form.clientSecret || undefined,
        },
      }),
    onSuccess: async (result) => {
      setConnectionResult(result);

      if (form.id && !form.clientSecret) {
        await queryClient.invalidateQueries({ queryKey: ["/api/settings/stores"] });
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
        <h1>NAVER 연결관리</h1>
        <p>NAVER Commerce API 자격증명을 저장하고 실제 토큰 발급으로 연결 상태를 확인합니다.</p>
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
                    {store.storeName} ({store.channel.toUpperCase()})
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
                <span>채널 선택</span>
                <select
                  value={form.channel}
                  onChange={(event) => {
                    setForm((prev) => ({
                      ...prev,
                      channel: event.target.value as SettingsEnabledChannel,
                    }));
                    setSaveMessage(null);
                  }}
                >
                  <option value="naver">NAVER</option>
                </select>
              </label>

              <label className="field">
                <span>스토어명</span>
                <input
                  value={form.storeName}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, storeName: event.target.value }));
                    setSaveMessage(null);
                  }}
                  placeholder="예: KIKIT Main Store"
                />
              </label>

              <label className="field">
                <span>client_id</span>
                <input
                  value={form.clientId}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, clientId: event.target.value }));
                    setSaveMessage(null);
                  }}
                  placeholder="Naver Commerce API client_id"
                />
              </label>

              <label className="field">
                <span>client_secret</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.clientSecret}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, clientSecret: event.target.value }));
                    setSaveMessage(null);
                  }}
                  placeholder={
                    form.hasStoredSecret
                      ? "비워두면 저장된 secret 유지"
                      : "Naver Commerce API client_secret"
                  }
                />
              </label>
            </div>

            {form.hasStoredSecret ? (
              <div className="muted">저장된 secret: {form.clientSecretMasked ?? "********"}</div>
            ) : null}

            <div className="toolbar">
              <button
                className="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
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
