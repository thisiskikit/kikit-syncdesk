import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import type { ChannelStoreSummary } from "@shared/channel-settings";
import type {
  NaverBulkPriceMatchField,
  NaverBulkPricePreviewQueryInput,
  NaverBulkPricePreviewResponse,
  NaverBulkPricePreviewRow,
  NaverBulkPricePreviewSort,
  NaverBulkPriceRulePreset,
  NaverBulkPriceRulePresetListResponse,
  NaverBulkPriceRuleSet,
  NaverBulkPriceRun,
  NaverBulkPriceRunDetail,
  NaverBulkPriceRunListResponse,
  NaverBulkPriceRunSummaryResponse,
  NaverBulkPriceSourceMetadataResponse,
  NaverBulkPriceSourcePreset,
  NaverBulkPriceSourcePresetListResponse,
} from "@shared/naver-bulk-price";
import { CollapsibleSection } from "@/components/collapsible-section";
import { SampleRowsDialog } from "@/components/sample-rows-dialog";
import { SortableHeaderButton } from "@/components/sortable-header-button";
import { StatusBadge } from "@/components/status-badge";
import { useWorkspaceTabActivity } from "@/components/workspace-tabs";
import {
  applyFixedAdjustment,
  buildManualOverridePayload,
  buildSourceTableValue,
  compareNullableDates,
  compareNullableNumbers,
  compareNullableStrings,
  createDefaultPreviewSelectionState,
  formatInlineSampleRowValue,
  formatPercentInput,
  hasPreviewSelectionChanges,
  isNumericLike,
  isSoldOutLikeColumnName,
  isUnsignedIntegerInput,
  isWorkDateLikeColumnName,
  parsePercentInput,
  parseSourceTableValue,
  parseUnsignedIntegerInput,
  resolveFixedAdjustmentAmount,
  resolveFixedAdjustmentMode,
  type FixedAdjustmentMode,
  type PreviewSelectionState,
} from "@/features/shared/bulk-price/page-helpers";
import {
  ApiHttpError,
  apiRequestJson,
  getJson,
  getJsonNoStore,
  queryClient,
} from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate, formatNumber } from "@/lib/utils";
import { resolveWorkspacePollingInterval } from "@/lib/workspace-tabs";
import {
  buildMatchFieldLabel,
  buildOptionTypeLabel,
  buildPriceDirection,
  buildRoundingModeLabel,
  buildRuleSetFromState,
  buildRunLogPriority,
  buildRunSummaryText,
  buildSaleStatusLabel,
  buildSourceConfigFromState,
  buildStatusLabel,
  buildStatusTone,
  formatSoldOutState,
  formatWon,
  isFinalRunStatus,
  translateBulkPriceMessage,
} from "./helpers";
import {
  DEFAULT_WORK_DATE_RANGE,
  DEFAULT_PREVIEW_SORT,
  DEFAULT_STATE,
  DEFAULT_UI_STATE,
  PREVIEW_ROWS_PER_PAGE,
  buildPreviewQueryKey,
  type ActivePreviewSession,
  type DisplayRow,
  type MenuState,
  type NaverPreviewSortField,
  type NaverPreviewSortState,
  type SettingsStoresResponse,
  type UiState,
} from "./state";

function sortNaverRuns(items: NaverBulkPriceRun[]) {
  return items
    .slice()
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.createdAt.localeCompare(left.createdAt) ||
        right.id.localeCompare(left.id),
    );
}

function upsertNaverRunListResponse(
  current: NaverBulkPriceRunListResponse | undefined,
  run: NaverBulkPriceRun,
): NaverBulkPriceRunListResponse {
  return {
    items: sortNaverRuns([run, ...(current?.items ?? []).filter((item) => item.id !== run.id)]),
  };
}

export default function NaverBulkPricePage() {
  function resolveLiveRunRefetchInterval(
    isPollingEnabled: boolean,
    baseIntervalMs: number,
    error: unknown,
  ) {
    const defaultInterval = resolveWorkspacePollingInterval(
      isActiveTab,
      isPollingEnabled,
      baseIntervalMs,
    );

    if (!defaultInterval) {
      return false;
    }

    if (error instanceof ApiHttpError) {
      if (error.status === 429) {
        return Math.max(baseIntervalMs * 5, 10_000);
      }

      if (error.status >= 500) {
        return Math.max(baseIntervalMs * 3, 5_000);
      }
    }

    if (error instanceof Error) {
      return Math.max(baseIntervalMs * 3, 5_000);
    }

    return defaultInterval;
  }

  const isActiveTab = useWorkspaceTabActivity();
  const search = useSearch();
  const { state, setState } = useServerMenuState<MenuState>(
    "naver.bulk-price",
    DEFAULT_STATE,
  );
  const { state: uiState, setState: setUiState } = useServerMenuState<UiState>(
    "naver.bulk-price.ui",
    DEFAULT_UI_STATE,
  );
  useEffect(() => {
    if (state.workDateFrom && state.workDateTo) {
      return;
    }
    setState((current) => ({
      ...current,
      workDateFrom: current.workDateFrom || DEFAULT_WORK_DATE_RANGE.workDateFrom,
      workDateTo: current.workDateTo || DEFAULT_WORK_DATE_RANGE.workDateTo,
    }));
  }, [setState, state.workDateFrom, state.workDateTo]);
  const settledRunRef = useRef("");
  const [previewSelections, setPreviewSelections] = useState<
    Record<string, PreviewSelectionState>
  >({});
  const [activePreviewSession, setActivePreviewSession] = useState<ActivePreviewSession | null>(
    null,
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [selectedSourcePresetId, setSelectedSourcePresetId] = useState("");
  const [sourcePresetName, setSourcePresetName] = useState("");
  const [sourcePresetMemo, setSourcePresetMemo] = useState("");
  const [selectedRulePresetId, setSelectedRulePresetId] = useState("");
  const [rulePresetName, setRulePresetName] = useState("");
  const [rulePresetMemo, setRulePresetMemo] = useState("");
  const [fixedAdjustmentMode, setFixedAdjustmentMode] = useState<FixedAdjustmentMode>(
    resolveFixedAdjustmentMode(DEFAULT_STATE.fixedAdjustment),
  );
  const [fixedAdjustmentInput, setFixedAdjustmentInput] = useState(
    String(resolveFixedAdjustmentAmount(DEFAULT_STATE.fixedAdjustment)),
  );
  const [previewSort, setPreviewSort] = useState<NaverPreviewSortState>(DEFAULT_PREVIEW_SORT);
  const [sampleRowsDialogOpen, setSampleRowsDialogOpen] = useState(false);
  const routeRunId = useMemo(() => new URLSearchParams(search).get("runId"), [search]);

  const sourcePresetsQuery = useQuery({
    queryKey: ["/api/naver/bulk-price/source-presets"],
    queryFn: () =>
      getJson<NaverBulkPriceSourcePresetListResponse>("/api/naver/bulk-price/source-presets"),
  });

  const rulePresetsQuery = useQuery({
    queryKey: ["/api/naver/bulk-price/rule-presets"],
    queryFn: () =>
      getJson<NaverBulkPriceRulePresetListResponse>("/api/naver/bulk-price/rule-presets"),
  });

  const runHistoryQuery = useQuery({
    queryKey: ["/api/naver/bulk-price/runs", "list"],
    queryFn: () => getJson<NaverBulkPriceRunListResponse>("/api/naver/bulk-price/runs"),
  });

  const storesQuery = useQuery({
    queryKey: ["/api/settings/stores"],
    queryFn: () => getJson<SettingsStoresResponse>("/api/settings/stores"),
  });

  const sourcePresets = sourcePresetsQuery.data?.items ?? [];
  const rulePresets = rulePresetsQuery.data?.items ?? [];
  const runHistory = runHistoryQuery.data?.items ?? [];
  const naverStores = (storesQuery.data?.items ?? []).filter(
    (item): item is ChannelStoreSummary & { channel: "naver" } => item.channel === "naver",
  );
  const selectedSourcePreset =
    sourcePresets.find((item) => item.id === selectedSourcePresetId) ?? null;
  const selectedRulePreset =
    rulePresets.find((item) => item.id === selectedRulePresetId) ?? null;

  useEffect(() => {
    if (!state.storeId && naverStores[0]) {
      setState((current) => ({
        ...current,
        storeId: naverStores[0]?.id ?? "",
      }));
    }
  }, [naverStores, setState, state.storeId]);

  useEffect(() => {
    if (!selectedSourcePresetId || selectedSourcePreset) {
      return;
    }

    setSelectedSourcePresetId("");
    setSourcePresetName("");
    setSourcePresetMemo("");
  }, [selectedSourcePreset, selectedSourcePresetId]);

  useEffect(() => {
    if (!selectedRulePresetId || selectedRulePreset) {
      return;
    }

    setSelectedRulePresetId("");
    setRulePresetName("");
    setRulePresetMemo("");
  }, [selectedRulePreset, selectedRulePresetId]);

  useEffect(() => {
    if (!routeRunId || routeRunId === activeRunId) {
      return;
    }

    setActiveRunId(routeRunId);
  }, [activeRunId, routeRunId]);

  useEffect(() => {
    setFixedAdjustmentMode(resolveFixedAdjustmentMode(state.fixedAdjustment));
    setFixedAdjustmentInput(String(resolveFixedAdjustmentAmount(state.fixedAdjustment)));
  }, [state.fixedAdjustment]);

  function handleFixedAdjustmentChange(value: string) {
    if (!isUnsignedIntegerInput(value)) {
      return;
    }

    setFixedAdjustmentInput(value);
    const parsed = parseUnsignedIntegerInput(value);
    if (parsed === null) {
      return;
    }

    setState((current) => ({
      ...current,
      fixedAdjustment: applyFixedAdjustment(fixedAdjustmentMode, parsed),
    }));
  }

  function commitFixedAdjustmentInput() {
    const normalized = parseUnsignedIntegerInput(fixedAdjustmentInput) ?? 0;
    setFixedAdjustmentInput(String(normalized));
    setState((current) => ({
      ...current,
      fixedAdjustment: applyFixedAdjustment(fixedAdjustmentMode, normalized),
    }));
  }

  function handleFixedAdjustmentModeChange(mode: FixedAdjustmentMode) {
    setFixedAdjustmentMode(mode);
    const normalized = parseUnsignedIntegerInput(fixedAdjustmentInput) ?? 0;
    setState((current) => ({
      ...current,
      fixedAdjustment: applyFixedAdjustment(mode, normalized),
    }));
  }

  function togglePreviewSort(field: NaverPreviewSortField) {
    setPreviewSort((current) =>
      current.field === field
        ? {
            field,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : {
            field,
            direction: "asc",
          },
    );
  }

  function applySourcePreset(preset: NaverBulkPriceSourcePreset) {
    setSelectedSourcePresetId(preset.id);
    setSourcePresetName(preset.name);
    setSourcePresetMemo(preset.memo);
    setState((current) => ({
      ...current,
      storeId: preset.sourceConfig.storeId,
      schema: preset.sourceConfig.schema,
      table: preset.sourceConfig.table,
      basePriceColumn: preset.sourceConfig.basePriceColumn,
      sourceMatchColumn: preset.sourceConfig.sourceMatchColumn,
      soldOutColumn: preset.sourceConfig.soldOutColumn ?? "",
      workDateColumn: preset.sourceConfig.workDateColumn ?? "",
      workDateFrom: preset.sourceConfig.workDateFrom || DEFAULT_WORK_DATE_RANGE.workDateFrom,
      workDateTo: preset.sourceConfig.workDateTo || DEFAULT_WORK_DATE_RANGE.workDateTo,
      naverMatchField: preset.sourceConfig.naverMatchField,
    }));
  }

  function applyRulePreset(preset: NaverBulkPriceRulePreset) {
    setSelectedRulePresetId(preset.id);
    setRulePresetName(preset.name);
    setRulePresetMemo(preset.memo);
    setState((current) => ({
      ...current,
      fixedAdjustment: preset.rules.fixedAdjustment,
      feeRate: preset.rules.feeRate,
      marginRate: preset.rules.marginRate,
      inboundShippingCost: preset.rules.inboundShippingCost,
      discountRate: preset.rules.discountRate,
      roundingUnit: preset.rules.roundingUnit,
      roundingMode: preset.rules.roundingMode,
    }));
  }

  const tablesQuery = useQuery({
    queryKey: ["/api/naver/bulk-price/source/metadata", "tables"],
    queryFn: () =>
      getJson<NaverBulkPriceSourceMetadataResponse>("/api/naver/bulk-price/source/metadata"),
  });

  const sourceTables = tablesQuery.data?.tables ?? [];
  const selectedSourceTableValue =
    state.schema && state.table
      ? buildSourceTableValue(state.schema, state.table)
      : "";
  const selectedTableExists = sourceTables.some(
    (item) => item.schema === state.schema && item.table === state.table,
  );

  const metadataQuery = useQuery({
    queryKey: ["/api/naver/bulk-price/source/metadata", state.schema, state.table],
    queryFn: () => {
      const params = new URLSearchParams();
      if (state.schema) params.set("schema", state.schema);
      if (state.table) params.set("table", state.table);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return getJson<NaverBulkPriceSourceMetadataResponse>(
        `/api/naver/bulk-price/source/metadata${suffix}`,
      );
    },
    enabled: selectedTableExists,
  });

  useEffect(() => {
    if (!sourceTables.length) {
      return;
    }

    const hasSelectedTable = sourceTables.some(
      (item) => item.schema === state.schema && item.table === state.table,
    );
    if (hasSelectedTable) {
      return;
    }

    const firstTable = sourceTables[0];
    setState((current) => ({
      ...current,
      schema: firstTable?.schema ?? "",
      table: firstTable?.table ?? "",
      basePriceColumn: "",
      sourceMatchColumn: "",
      soldOutColumn: "",
      workDateColumn: "",
    }));
  }, [setState, sourceTables, state.schema, state.table]);

  useEffect(() => {
    const columns = metadataQuery.data?.columns ?? [];
    if (!columns.length) {
      return;
    }

    setState((current) => {
      const next = { ...current };
      const columnNames = columns.map((column) => column.name);
      const soldOutColumnValid =
        !next.soldOutColumn || columnNames.includes(next.soldOutColumn);
      const suggestedSoldOutColumn =
        columns.find((column) => isSoldOutLikeColumnName(column.name))?.name ?? "";
      const workDateColumnValid =
        Boolean(next.workDateColumn) && columnNames.includes(next.workDateColumn);
      const suggestedWorkDateColumn =
        columns.find((column) => isWorkDateLikeColumnName(column.name))?.name ?? "";

      if (!columnNames.includes(next.basePriceColumn)) {
        next.basePriceColumn =
          columns.find((column) => isNumericLike(column.dataType))?.name ??
          columns[0]?.name ??
          "";
      }
      if (!columnNames.includes(next.sourceMatchColumn) || next.sourceMatchColumn === next.basePriceColumn) {
        next.sourceMatchColumn =
          columns.find((column) => column.name !== next.basePriceColumn)?.name ??
          columns[0]?.name ??
          "";
      }
      if (!soldOutColumnValid) {
        next.soldOutColumn = suggestedSoldOutColumn;
      } else if (
        !next.soldOutColumn &&
        suggestedSoldOutColumn &&
        (!columnNames.includes(current.basePriceColumn) ||
          !columnNames.includes(current.sourceMatchColumn))
      ) {
        next.soldOutColumn = suggestedSoldOutColumn;
      }
      if (!workDateColumnValid) {
        next.workDateColumn = suggestedWorkDateColumn;
      }
      return next;
    });
  }, [metadataQuery.data?.columns, setState]);

  const formulaInvalid = state.feeRate + state.marginRate >= 1;
  const currentSourceConfig = buildSourceConfigFromState(state);
  const currentRuleSet = buildRuleSetFromState(state);
  const sourcePresetReady =
    Boolean(state.storeId) &&
    Boolean(state.schema) &&
    Boolean(state.table) &&
    Boolean(state.basePriceColumn) &&
    Boolean(state.sourceMatchColumn) &&
    Boolean(state.workDateColumn) &&
    Boolean(state.workDateFrom) &&
    Boolean(state.workDateTo);
  const rulePresetReady = !formulaInvalid;
  const workDateRangeInvalid =
    Boolean(state.workDateFrom) &&
    Boolean(state.workDateTo) &&
    state.workDateFrom > state.workDateTo;
  const configReady =
    Boolean(state.storeId) &&
    selectedTableExists &&
    Boolean(state.schema) &&
    Boolean(state.table) &&
    Boolean(state.basePriceColumn) &&
    Boolean(state.sourceMatchColumn) &&
    Boolean(state.workDateColumn) &&
    Boolean(state.workDateFrom) &&
    Boolean(state.workDateTo) &&
    !workDateRangeInvalid &&
    !formulaInvalid;

  const previewSortRequest = useMemo<NaverBulkPricePreviewSort>(
    () => ({
      field: previewSort.field,
      direction: previewSort.direction,
    }),
    [previewSort.direction, previewSort.field],
  );

  const activePreviewQueryKey = activePreviewSession
    ? buildPreviewQueryKey(
        activePreviewSession.previewId,
        previewPage,
        uiState.previewMatchedOnly,
        previewSortRequest,
      )
    : null;

  const buildPreviewMutation = useMutation({
    mutationFn: async (input: {
      sourceConfig: ReturnType<typeof buildSourceConfigFromState>;
      rules: NaverBulkPriceRuleSet;
    }) =>
      apiRequestJson<NaverBulkPricePreviewResponse>("POST", "/api/naver/bulk-price/preview", {
        sourceConfig: input.sourceConfig,
        rules: input.rules,
        page: 1,
        pageSize: PREVIEW_ROWS_PER_PAGE,
        matchedOnly: uiState.previewMatchedOnly,
        sort: previewSortRequest,
      } satisfies NaverBulkPricePreviewQueryInput),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(
        buildPreviewQueryKey(
          data.previewId,
          data.page,
          uiState.previewMatchedOnly,
          previewSortRequest,
        ),
        data,
      );
      setActivePreviewSession({
        previewId: data.previewId,
        sourceConfig: variables.sourceConfig,
        rules: variables.rules,
      });
    },
  });

  const previewQuery = useQuery({
    queryKey: activePreviewQueryKey ?? ["/api/naver/bulk-price/preview", "idle"],
    queryFn: () =>
      apiRequestJson<NaverBulkPricePreviewResponse>("POST", "/api/naver/bulk-price/preview", {
        previewId: activePreviewSession?.previewId ?? null,
        page: previewPage,
        pageSize: PREVIEW_ROWS_PER_PAGE,
        matchedOnly: uiState.previewMatchedOnly,
        sort: previewSortRequest,
      } satisfies NaverBulkPricePreviewQueryInput),
    enabled: Boolean(activePreviewSession),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });

  const previewData = activePreviewSession ? previewQuery.data ?? null : null;
  const currentPreviewId = activePreviewSession?.previewId ?? null;
  const previewSelection = currentPreviewId
    ? previewSelections[currentPreviewId] ?? createDefaultPreviewSelectionState()
    : createDefaultPreviewSelectionState();
  const manualOverrides = previewSelection.manualOverrides;
  const previewRows = previewData?.rows ?? [];
  const previewRowKeys = useMemo(
    () => previewRows.map((row) => row.rowKey),
    [previewRows],
  );
  const previewRowKeySet = useMemo(() => new Set(previewRowKeys), [previewRowKeys]);
  const previewRowKeySignature = previewRowKeys.join("|");
  const runSummaryQueryKey = [
    "/api/naver/bulk-price/runs",
    activeRunId ?? "",
    "summary",
  ] as const;

  const runSummaryQuery = useQuery({
    queryKey: runSummaryQueryKey,
    queryFn: () =>
      getJsonNoStore<NaverBulkPriceRunSummaryResponse>(
        `/api/naver/bulk-price/runs/${activeRunId}/summary`,
      ),
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const data = query.state.data as NaverBulkPriceRunSummaryResponse | undefined;
      const status = data?.run.status;
      return resolveLiveRunRefetchInterval(
        status === "queued" || status === "running",
        1000,
        query.state.error,
      );
    },
  });
  const activeRun = runSummaryQuery.data?.run ?? null;
  const activeRunStatus = activeRun?.status ?? null;
  const hasBlockingRun =
    activeRunStatus === "queued" ||
    activeRunStatus === "running" ||
    activeRunStatus === "paused";
  const shouldOverlayRun =
    Boolean(activeRun) &&
    Boolean(previewData) &&
    JSON.stringify(activeRun?.sourceConfig) === JSON.stringify(previewData?.sourceConfig) &&
    JSON.stringify(activeRun?.rules) === JSON.stringify(previewData?.rules);
  const runDetailQueryKey = [
    "/api/naver/bulk-price/runs",
    activeRunId ?? "",
    "detail",
    previewRowKeySignature,
  ] as const;

  const runDetailQuery = useQuery({
    queryKey: runDetailQueryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("includeLatestRecords", "0");
      for (const rowKey of previewRowKeys) {
        params.append("rowKey", rowKey);
      }
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return getJsonNoStore<NaverBulkPriceRunDetail>(
        `/api/naver/bulk-price/runs/${activeRunId}${suffix}`,
      );
    },
    enabled: Boolean(activeRunId) && shouldOverlayRun && previewRowKeys.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data as NaverBulkPriceRunDetail | undefined;
      const status = data?.run.status ?? activeRunStatus;
      return resolveLiveRunRefetchInterval(
        status === "queued" || status === "running",
        2000,
        query.state.error,
      );
    },
  });

  function updatePreviewSelection(
    updater: (current: PreviewSelectionState) => PreviewSelectionState,
  ) {
    if (!currentPreviewId) {
      return;
    }

    setPreviewSelections((current) => ({
      ...current,
      [currentPreviewId]: updater(
        current[currentPreviewId] ?? createDefaultPreviewSelectionState(),
      ),
    }));
  }

  function isRowSelected(row: NaverBulkPricePreviewRow) {
    if (previewSelection.mode === "all_selectable") {
      if (!row.isSelectable) {
        return false;
      }
      return !previewSelection.deselectedRowKeys[row.rowKey];
    }

    if (previewSelection.mode === "all_ready") {
      if (row.status !== "ready") {
        return false;
      }
      return !previewSelection.deselectedRowKeys[row.rowKey];
    }

    return Boolean(previewSelection.selectedRowKeys[row.rowKey]);
  }

  const previewNeedsRefresh =
    Boolean(activePreviewSession) &&
    (JSON.stringify(activePreviewSession?.sourceConfig) !== JSON.stringify(currentSourceConfig) ||
      JSON.stringify(activePreviewSession?.rules) !== JSON.stringify(currentRuleSet));

  function handleRefreshPreview() {
    if (!configReady || buildPreviewMutation.isPending) {
      return;
    }

    if (currentPreviewId && hasPreviewSelectionChanges(previewSelection)) {
      const confirmed = window.confirm(
        "?꾩옱 誘몃━蹂닿린?먯꽌 ?좏깮?섍굅???섎룞 ?낅젰??媛믪씠 珥덇린?붾맗?덈떎. ??誘몃━蹂닿린瑜?留뚮뱾源뚯슂?",
      );
      if (!confirmed) {
        return;
      }
    }

    setPreviewPage(1);
    buildPreviewMutation.mutate({
      sourceConfig: currentSourceConfig,
      rules: currentRuleSet,
    });
  }

  useEffect(() => {
    if (!activeRun || !isFinalRunStatus(activeRun.status)) {
      return;
    }

    const signature = `${activeRun.id}:${activeRun.status}:${activeRun.updatedAt}`;
    if (settledRunRef.current === signature) {
      return;
    }

    settledRunRef.current = signature;
    void queryClient.invalidateQueries({
      queryKey: ["/api/naver/bulk-price/runs"],
    });
  }, [activeRun]);

  function buildRecentRunItems(items: NaverBulkPriceRunDetail["items"]) {
    return items
      .filter(
        (item) =>
          item.status !== "queued" ||
          item.messages.length > 0 ||
          item.lastAppliedAt !== null ||
          item.updatedAt !== item.createdAt,
      )
      .slice()
      .sort((left, right) => {
        const priority = buildRunLogPriority(left.status) - buildRunLogPriority(right.status);
        if (priority !== 0) {
          return priority;
        }

        return (
          compareNullableDates(right.updatedAt, left.updatedAt) ||
          compareNullableStrings(left.productName, right.productName)
        );
      })
      .slice(0, 20);
  }

  function syncNaverRunListCaches(run: NaverBulkPriceRun) {
    queryClient.setQueryData(
      ["/api/naver/bulk-price/runs", "list"] as const,
      (current: NaverBulkPriceRunListResponse | undefined) =>
        upsertNaverRunListResponse(current, run),
    );
    queryClient.setQueryData(
      ["/api/naver/bulk-price/runs", "status-panel"] as const,
      (current: NaverBulkPriceRunListResponse | undefined) =>
        upsertNaverRunListResponse(current, run),
    );
  }

  function syncRunCaches(detail: NaverBulkPriceRunDetail) {
    setActiveRunId(detail.run.id);
    syncNaverRunListCaches(detail.run);
    queryClient.setQueryData(
      ["/api/naver/bulk-price/runs", detail.run.id, "summary"] as const,
      {
        run: detail.run,
        recentItems: buildRecentRunItems(detail.items),
      } satisfies NaverBulkPriceRunSummaryResponse,
    );

    if (previewRowKeys.length > 0) {
      queryClient.setQueryData(
        [
          "/api/naver/bulk-price/runs",
          detail.run.id,
          "detail",
          previewRowKeySignature,
        ] as const,
        {
          ...detail,
          items: detail.items.filter((item) => previewRowKeySet.has(item.rowKey)),
          latestRecords: [],
        } satisfies NaverBulkPriceRunDetail,
      );
    }
  }

  useEffect(() => {
    if (!activeRun) {
      return;
    }

    syncNaverRunListCaches(activeRun);
  }, [activeRun]);

  const createRunMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<NaverBulkPriceRunDetail>("POST", "/api/naver/bulk-price/runs", {
        previewId: currentPreviewId,
        selectionMode: previewSelection.mode,
        excludedRowKeys:
          previewSelection.mode === "all_selectable"
            ? Object.keys(previewSelection.deselectedRowKeys)
            : [],
        selectedRowKeys:
          previewSelection.mode === "explicit"
            ? Object.keys(previewSelection.selectedRowKeys)
            : [],
        manualOverrides: buildManualOverridePayload(manualOverrides),
      }),
    onSuccess: async (detail) => {
      syncRunCaches(detail);
      await queryClient.invalidateQueries({
        queryKey: ["/api/naver/bulk-price/runs"],
      });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<NaverBulkPriceRunDetail>("POST", `/api/naver/bulk-price/runs/${activeRunId}/pause`),
    onSuccess: async (detail) => {
      syncRunCaches(detail);
      await queryClient.invalidateQueries({
        queryKey: ["/api/naver/bulk-price/runs"],
      });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<NaverBulkPriceRunDetail>("POST", `/api/naver/bulk-price/runs/${activeRunId}/resume`),
    onSuccess: async (detail) => {
      syncRunCaches(detail);
      await queryClient.invalidateQueries({
        queryKey: ["/api/naver/bulk-price/runs"],
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<NaverBulkPriceRunDetail>("POST", `/api/naver/bulk-price/runs/${activeRunId}/stop`),
    onSuccess: async (detail) => {
      syncRunCaches(detail);
      await queryClient.invalidateQueries({
        queryKey: ["/api/naver/bulk-price/runs"],
      });
    },
  });

  const createSourcePresetMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<NaverBulkPriceSourcePreset>("POST", "/api/naver/bulk-price/source-presets", {
        name: sourcePresetName,
        memo: sourcePresetMemo,
        sourceConfig: currentSourceConfig,
      }),
    onSuccess: async (preset) => {
      setSelectedSourcePresetId(preset.id);
      setSourcePresetName(preset.name);
      setSourcePresetMemo(preset.memo);
      await queryClient.invalidateQueries({
        queryKey: ["/api/naver/bulk-price/source-presets"],
      });
    },
  });

  const updateSourcePresetMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<NaverBulkPriceSourcePreset>(
        "PUT",
        `/api/naver/bulk-price/source-presets/${selectedSourcePresetId}`,
        {
          name: sourcePresetName,
          memo: sourcePresetMemo,
          sourceConfig: currentSourceConfig,
        },
      ),
    onSuccess: async (preset) => {
      setSourcePresetName(preset.name);
      setSourcePresetMemo(preset.memo);
      await queryClient.invalidateQueries({
        queryKey: ["/api/naver/bulk-price/source-presets"],
      });
    },
  });

  const deleteSourcePresetMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<{ id: string }>(
        "DELETE",
        `/api/naver/bulk-price/source-presets/${selectedSourcePresetId}`,
      ),
    onSuccess: async () => {
      setSelectedSourcePresetId("");
      setSourcePresetName("");
      setSourcePresetMemo("");
      await queryClient.invalidateQueries({
        queryKey: ["/api/naver/bulk-price/source-presets"],
      });
    },
  });

  const createRulePresetMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<NaverBulkPriceRulePreset>("POST", "/api/naver/bulk-price/rule-presets", {
        name: rulePresetName,
        memo: rulePresetMemo,
        rules: currentRuleSet,
      }),
    onSuccess: async (preset) => {
      setSelectedRulePresetId(preset.id);
      setRulePresetName(preset.name);
      setRulePresetMemo(preset.memo);
      await queryClient.invalidateQueries({
        queryKey: ["/api/naver/bulk-price/rule-presets"],
      });
    },
  });

  const updateRulePresetMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<NaverBulkPriceRulePreset>(
        "PUT",
        `/api/naver/bulk-price/rule-presets/${selectedRulePresetId}`,
        {
          name: rulePresetName,
          memo: rulePresetMemo,
          rules: currentRuleSet,
        },
      ),
    onSuccess: async (preset) => {
      setRulePresetName(preset.name);
      setRulePresetMemo(preset.memo);
      await queryClient.invalidateQueries({
        queryKey: ["/api/naver/bulk-price/rule-presets"],
      });
    },
  });

  const deleteRulePresetMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<{ id: string }>(
        "DELETE",
        `/api/naver/bulk-price/rule-presets/${selectedRulePresetId}`,
      ),
    onSuccess: async () => {
      setSelectedRulePresetId("");
      setRulePresetName("");
      setRulePresetMemo("");
      await queryClient.invalidateQueries({
        queryKey: ["/api/naver/bulk-price/rule-presets"],
      });
    },
  });

  const runItemMap = useMemo(
    () =>
      shouldOverlayRun
        ? new Map(
            (runDetailQuery.data?.items ?? []).map((item) => [item.rowKey, item] as const),
          )
        : new Map(),
    [runDetailQuery.data?.items, shouldOverlayRun],
  );

  const rows = useMemo<DisplayRow[]>(
    () =>
      (previewData?.rows ?? []).map((row) => {
        const runItem = runItemMap.get(row.rowKey);
        const manualOverrideText = manualOverrides[row.rowKey] ?? "";
        const manualOverridePrice = manualOverrideText.trim()
          ? Number(manualOverrideText)
          : null;
        return {
          ...row,
          displayStatus: runItem?.status ?? row.status,
          displayMessages: runItem?.messages?.length ? runItem.messages : row.messages,
          displayEffectiveTargetPrice:
            runItem?.effectiveTargetPrice ?? (manualOverridePrice ?? row.effectiveTargetPrice),
          displayLastAppliedAt: runItem?.lastAppliedAt ?? row.lastAppliedAt,
          displayLastAppliedPrice: runItem?.lastAppliedPrice ?? row.lastAppliedPrice,
        };
      }),
    [manualOverrides, previewData?.rows, runItemMap],
  );
  const sortedRows = rows;
  const visibleRows = rows;
  const matchedCount =
    (previewData?.stats.totalNaverItems ?? 0) - (previewData?.stats.unmatchedCount ?? 0);
  const previewTotalPages = previewData?.totalPages ?? 1;

  useEffect(() => {
    if (previewPage <= previewTotalPages) {
      return;
    }

    setPreviewPage(previewTotalPages);
  }, [previewPage, previewTotalPages]);

  useEffect(() => {
    setPreviewPage(1);
  }, [previewSort.direction, previewSort.field]);

  useEffect(() => {
    setPreviewPage(1);
  }, [uiState.previewMatchedOnly]);

  const selectableCount = previewData?.stats.selectableCount ?? 0;
  const readyCount = previewData?.stats.readyCount ?? 0;
  const selectedCount = previewData
    ? previewSelection.mode === "all_selectable"
      ? Math.max(
          0,
          selectableCount -
            Object.keys(previewSelection.deselectedRowKeys).length,
        )
      : previewSelection.mode === "all_ready"
        ? Math.max(
            0,
            readyCount -
              Object.keys(previewSelection.deselectedRowKeys).length,
          )
        : Object.keys(previewSelection.selectedRowKeys).length
    : 0;
  const allSelectableChecked =
    previewSelection.mode === "all_selectable" &&
    selectableCount > 0 &&
    selectedCount === selectableCount;
  const allReadyChecked =
    previewSelection.mode === "all_ready" &&
    readyCount > 0 &&
    selectedCount === readyCount;
  const liveLogRows = runSummaryQuery.data?.recentItems ?? [];
  const problemCount =
    (previewData?.stats.conflictCount ?? 0) +
    (previewData?.stats.unmatchedCount ?? 0) +
    (previewData?.stats.invalidSourceCount ?? 0);
  const workDateRangeMessage =
    selectedTableExists && metadataQuery.data
      ? !state.workDateColumn
        ? "Select a work-date column to limit preview and runs to the selected date range."
        : !state.workDateFrom || !state.workDateTo
          ? "Set both start and end dates for the work-date filter."
          : workDateRangeInvalid
            ? "Start date must be on or before end date."
            : null
      : null;
  const workDateFilterSummary = previewData?.workDateFilterSummary ?? null;

  const sourceMetadataError = (tablesQuery.error ?? metadataQuery.error) as Error | null;
  const previewError = (buildPreviewMutation.error ?? previewQuery.error) as Error | null;
  const runError = (runSummaryQuery.error ??
    runDetailQuery.error ??
    createRunMutation.error ??
    pauseMutation.error ??
    resumeMutation.error ??
    stopMutation.error) as Error | null;
  const sourcePresetError = (sourcePresetsQuery.error ??
    createSourcePresetMutation.error ??
    updateSourcePresetMutation.error ??
    deleteSourcePresetMutation.error) as Error | null;
  const rulePresetError = (rulePresetsQuery.error ??
    createRulePresetMutation.error ??
    updateRulePresetMutation.error ??
    deleteRulePresetMutation.error) as Error | null;

  const sourcePresetBusy =
    createSourcePresetMutation.isPending ||
    updateSourcePresetMutation.isPending ||
    deleteSourcePresetMutation.isPending;
  const rulePresetBusy =
    createRulePresetMutation.isPending ||
    updateRulePresetMutation.isPending ||
    deleteRulePresetMutation.isPending;
  const runBusy =
    buildPreviewMutation.isPending ||
    createRunMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    stopMutation.isPending;

  const toggleUiSection = (key: keyof UiState) => {
    setUiState((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="live" label="NAVER" />
          <StatusBadge tone="shared" label="Bulk Price" />
        </div>
        <h1>NAVER Bulk Price</h1>
        <p>
          Match external price-source rows with NAVER products, review the calculated target price,
          and manage runs from one screen.
        </p>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Ready</div>
          <div className="metric-value">{previewData?.stats.readyCount ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Selected rows</div>
          <div className="metric-value">{selectedCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Run status</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {buildStatusLabel(activeRunStatus)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Preview time</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatDate(previewData?.generatedAt)}
          </div>
        </div>
      </div>

      <div className="card bulk-price-layout">
        <div className="bulk-price-panel">
          <h3 style={{ marginTop: 0 }}>Source settings</h3>

          <CollapsibleSection
            className="feedback"
            title="Source presets"
            summary={<span className="muted">{sourcePresets.length} saved</span>}
            isOpen={uiState.sourcePresetOpen}
            onToggle={() => toggleUiSection("sourcePresetOpen")}
          >
            <div className="form-grid">
              <label className="field">
                <span>Preset</span>
                <select
                  value={selectedSourcePresetId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    if (!nextId) {
                      setSelectedSourcePresetId("");
                      setSourcePresetName("");
                      setSourcePresetMemo("");
                      return;
                    }

                    const preset =
                      sourcePresets.find((item) => item.id === nextId) ?? null;
                    if (preset) {
                      applySourcePreset(preset);
                    }
                  }}
                >
                  <option value="">Select preset</option>
                  {sourcePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Name</span>
                <input
                  value={sourcePresetName}
                  onChange={(event) => setSourcePresetName(event.target.value)}
                  placeholder="Default source preset"
                />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Memo</span>
                <textarea
                  value={sourcePresetMemo}
                  onChange={(event) => setSourcePresetMemo(event.target.value)}
                  rows={3}
                  placeholder="Describe the source table and matching rule."
                />
              </label>
            </div>
            <div className="toolbar">
              <button
                className="button secondary"
                type="button"
                onClick={() => createSourcePresetMutation.mutate()}
                disabled={!sourcePresetReady || !sourcePresetName.trim() || sourcePresetBusy}
              >
                Save new
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => updateSourcePresetMutation.mutate()}
                disabled={
                  !selectedSourcePresetId ||
                  !sourcePresetReady ||
                  !sourcePresetName.trim() ||
                  sourcePresetBusy
                }
              >
                ?섏젙
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => {
                  if (!selectedSourcePresetId) {
                    return;
                  }
                  if (!window.confirm("Delete the selected source preset?")) {
                    return;
                  }
                  deleteSourcePresetMutation.mutate();
                }}
                disabled={!selectedSourcePresetId || sourcePresetBusy}
              >
                Delete
              </button>
            </div>
            <div className="muted">
              {selectedSourcePreset
                ? `Updated ${formatDate(selectedSourcePreset.updatedAt)}`
                : "You can save the current source settings as a reusable preset."}
            </div>
            {sourcePresetError ? (
              <div className="feedback error">
                <strong>Source preset error</strong>
                <div className="muted">{sourcePresetError.message}</div>
              </div>
            ) : null}
          </CollapsibleSection>

          <div className="form-grid">
            <label className="field">
              <span>Store</span>
              <select
                value={state.storeId}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    storeId: event.target.value,
                  }))
                }
              >
                <option value="">Select store</option>
                {naverStores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.storeName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Work-date column</span>
              <select
                value={state.workDateColumn}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    workDateColumn: event.target.value,
                  }))
                }
              >
                <option value="">Select column</option>
                {(metadataQuery.data?.columns ?? []).map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name} ({column.dataType})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Start date</span>
              <input
                type="date"
                value={state.workDateFrom}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    workDateFrom: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>End date</span>
              <input
                type="date"
                value={state.workDateTo}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    workDateTo: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Source table</span>
              <select
                value={selectedSourceTableValue}
                onChange={(event) =>
                  setState((current) => {
                    const nextTable = parseSourceTableValue(event.target.value);
                    return {
                      ...current,
                      schema: nextTable.schema,
                      table: nextTable.table,
                      basePriceColumn: "",
                      sourceMatchColumn: "",
                      soldOutColumn: "",
                      workDateColumn: "",
                    };
                  })
                }
              >
                <option value="">Select table</option>
                {sourceTables.map((item) => (
                  <option
                    key={`${item.schema}.${item.table}`}
                    value={buildSourceTableValue(item.schema, item.table)}
                  >
                    {item.schema}.{item.table}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Schema</span>
              <input value={state.schema} readOnly />
            </label>
            <label className="field">
              <span>Base price column</span>
              <select
                value={state.basePriceColumn}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    basePriceColumn: event.target.value,
                  }))
                }
              >
                <option value="">Select column</option>
                {(metadataQuery.data?.columns ?? []).map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name} ({column.dataType})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Source match column</span>
              <select
                value={state.sourceMatchColumn}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    sourceMatchColumn: event.target.value,
                  }))
                }
              >
                <option value="">Select column</option>
                {(metadataQuery.data?.columns ?? []).map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Sold-out column</span>
              <select
                value={state.soldOutColumn}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    soldOutColumn: event.target.value,
                  }))
                }
              >
                <option value="">Not used</option>
                {(metadataQuery.data?.columns ?? []).map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>NAVER match field</span>
              <select
                value={state.naverMatchField}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    naverMatchField: event.target.value as NaverBulkPriceMatchField,
                  }))
                }
              >
                <option value="sellerManagementCode">sellerManagementCode</option>
                <option value="sellerBarcode">sellerBarcode</option>
                <option value="originProductNo">originProductNo</option>
                <option value="channelProductNo">channelProductNo</option>
              </select>
            </label>
          </div>

          {sourceMetadataError ? (
            <div className="feedback error">
              <strong>Source metadata error</strong>
              <div className="muted">{sourceMetadataError.message}</div>
            </div>
          ) : null}

          {workDateRangeMessage ? (
            <div className="feedback error">
              <strong>Work-date range required</strong>
              <div className="muted">{workDateRangeMessage}</div>
            </div>
          ) : null}

          <div className="feedback">
            <strong>Current source</strong>
            <div className="muted">
              {state.schema && state.table
                ? `${state.schema}.${state.table} / ${state.sourceMatchColumn || "-"} / ${state.basePriceColumn || "-"} / ${state.soldOutColumn || "-"} / ${state.workDateColumn || "-"}`
                : "Select a source table first."}
            </div>
            <div className="muted">
              NAVER field: {buildMatchFieldLabel(state.naverMatchField)}
            </div>
            <div className="muted">
              Work-date column: {state.workDateColumn || "-"} / range {state.workDateFrom || "-"} ~ {state.workDateTo || "-"}
            </div>
          </div>

          <CollapsibleSection
            title="Sample rows"
            summary={
              <span className="muted">
                {(metadataQuery.data?.sampleRows ?? []).length} rows
              </span>
            }
            actions={
              <button
                className="button secondary"
                type="button"
                onClick={() => setSampleRowsDialogOpen(true)}
                disabled={!metadataQuery.data?.sampleRows.length}
              >
                Open dialog
              </button>
            }
            isOpen={uiState.sourceSampleOpen}
            onToggle={() => toggleUiSection("sourceSampleOpen")}
          >
            <div className="muted" style={{ marginBottom: 8 }}>
              Work-date column: {state.workDateColumn || "-"} / range {state.workDateFrom || "-"} ~ {state.workDateTo || "-"} rows are used for preview and runs.
            </div>
            <div className="table-wrap">
              <table className="table bulk-price-sample-table">
                <thead>
                  <tr>
                    <th>#</th>
                    {(metadataQuery.data?.columns ?? []).map((column) => (
                      <th key={column.name}>{column.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(metadataQuery.data?.sampleRows ?? []).map((row) => (
                    <tr key={row.index}>
                      <td>{row.index + 1}</td>
                      {(metadataQuery.data?.columns ?? []).map((column) => {
                        const fullValue = String(row.values[column.name] ?? "-");
                        return (
                          <td key={column.name} title={fullValue}>
                            <span className="bulk-price-sample-cell">
                              {formatInlineSampleRowValue(fullValue)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!metadataQuery.data?.sampleRows.length ? (
                <div className="empty">No sample rows available.</div>
              ) : null}
            </div>
          </CollapsibleSection>
        </div>

        <div className="bulk-price-panel">
          <h3 style={{ marginTop: 0 }}>Pricing rules</h3>

          <CollapsibleSection
            className="feedback"
            title="Rule presets"
            summary={<span className="muted">{rulePresets.length} saved</span>}
            isOpen={uiState.rulePresetOpen}
            onToggle={() => toggleUiSection("rulePresetOpen")}
          >
            <div className="form-grid">
              <label className="field">
                <span>Preset</span>
                <select
                  value={selectedRulePresetId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    if (!nextId) {
                      setSelectedRulePresetId("");
                      setRulePresetName("");
                      setRulePresetMemo("");
                      return;
                    }

                    const preset =
                      rulePresets.find((item) => item.id === nextId) ?? null;
                    if (preset) {
                      applyRulePreset(preset);
                    }
                  }}
                >
                  <option value="">Select preset</option>
                  {rulePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Name</span>
                <input
                  value={rulePresetName}
                  onChange={(event) => setRulePresetName(event.target.value)}
                  placeholder="Default rule preset"
                />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Memo</span>
                <textarea
                  value={rulePresetMemo}
                  onChange={(event) => setRulePresetMemo(event.target.value)}
                  rows={3}
                  placeholder="Describe the pricing rule."
                />
              </label>
            </div>
            <div className="toolbar">
              <button
                className="button secondary"
                type="button"
                onClick={() => createRulePresetMutation.mutate()}
                disabled={!rulePresetReady || !rulePresetName.trim() || rulePresetBusy}
              >
                Save new
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => updateRulePresetMutation.mutate()}
                disabled={
                  !selectedRulePresetId ||
                  !rulePresetReady ||
                  !rulePresetName.trim() ||
                  rulePresetBusy
                }
              >
                ?섏젙
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => {
                  if (!selectedRulePresetId) {
                    return;
                  }
                  if (!window.confirm("Delete the selected rule preset?")) {
                    return;
                  }
                  deleteRulePresetMutation.mutate();
                }}
                disabled={!selectedRulePresetId || rulePresetBusy}
              >
                Delete
              </button>
            </div>
            <div className="muted">
              {selectedRulePreset
                ? `Updated ${formatDate(selectedRulePreset.updatedAt)}`
                : "You can save the current pricing rules as a preset."}
            </div>
            {rulePresetError ? (
              <div className="feedback error">
                <strong>Rule preset error</strong>
                <div className="muted">{rulePresetError.message}</div>
              </div>
            ) : null}
          </CollapsibleSection>

          <CollapsibleSection
            title="Formula"
            description="Use the same calculation inputs that drive NAVER target prices."
            isOpen={uiState.formulaOpen}
            onToggle={() => toggleUiSection("formulaOpen")}
          >
            <div className="form-grid">
              <label className="field">
                <span>Fixed adjustment mode</span>
                <select
                  value={fixedAdjustmentMode}
                  onChange={(event) =>
                    handleFixedAdjustmentModeChange(event.target.value as FixedAdjustmentMode)
                  }
                >
                  <option value="add">Add</option>
                  <option value="subtract">Subtract</option>
                </select>
              </label>
              <label className="field">
                <span>Fixed adjustment</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={fixedAdjustmentInput}
                  onChange={(event) => handleFixedAdjustmentChange(event.target.value)}
                  onBlur={commitFixedAdjustmentInput}
                />
              </label>
              <label className="field">
                <span>Fee rate (%)</span>
                <input
                  type="number"
                  step="0.01"
                  value={formatPercentInput(state.feeRate)}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      feeRate: parsePercentInput(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Margin rate (%)</span>
                <input
                  type="number"
                  step="0.01"
                  value={formatPercentInput(state.marginRate)}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      marginRate: parsePercentInput(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Inbound shipping cost</span>
                <input
                  type="number"
                  value={state.inboundShippingCost}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      inboundShippingCost: Number(event.target.value) || 0,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Discount rate (%)</span>
                <input
                  type="number"
                  step="0.01"
                  value={formatPercentInput(state.discountRate)}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      discountRate: parsePercentInput(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Rounding unit</span>
                <select
                  value={state.roundingUnit}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      roundingUnit: Number(event.target.value) as 1 | 10 | 100,
                    }))
                  }
                >
                  <option value={1}>1</option>
                  <option value={10}>10</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <label className="field">
                <span>Rounding mode</span>
                <select
                  value={state.roundingMode}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      roundingMode: event.target.value as MenuState["roundingMode"],
                    }))
                  }
                >
                  <option value="ceil">{buildRoundingModeLabel("ceil")}</option>
                  <option value="round">{buildRoundingModeLabel("round")}</option>
                  <option value="floor">{buildRoundingModeLabel("floor")}</option>
                </select>
              </label>
            </div>
          </CollapsibleSection>

          {formulaInvalid ? (
            <div className="feedback error">
              <strong>Check the formula</strong>
              <div className="muted">Fee rate plus margin rate must stay below 100%.</div>
            </div>
          ) : null}

          <div className="feedback">
            <strong>Run controls</strong>
            <div className="muted">{buildRunSummaryText(activeRun)}</div>
            {previewNeedsRefresh ? (
              <div className="muted">
                Settings changed after the last preview. Runs still follow the last generated preview snapshot.
              </div>
            ) : null}
            <div className="toolbar">
              <button
                className="button ghost"
                type="button"
                onClick={handleRefreshPreview}
                disabled={!configReady || buildPreviewMutation.isPending}
              >
                Refresh preview
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => createRunMutation.mutate()}
                disabled={!currentPreviewId || selectedCount === 0 || hasBlockingRun || runBusy}
              >
                Run selected rows
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => pauseMutation.mutate()}
                disabled={activeRunStatus !== "running" || runBusy}
              >
                Pause
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => resumeMutation.mutate()}
                disabled={activeRunStatus !== "paused" || runBusy}
              >
                Resume
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => stopMutation.mutate()}
                disabled={
                  (activeRunStatus !== "queued" &&
                    activeRunStatus !== "running" &&
                    activeRunStatus !== "paused") ||
                  runBusy
                }
              >
                Stop
              </button>
            </div>
            <div className="muted">Current run ID: {activeRunId ?? "-"}</div>
            <div className="muted">
              Option products appear in preview and selection, but the actual price update only changes the base product price.
            </div>
          </div>

          {runError ? (
            <div className="feedback error">
              <strong>Run error</strong>
              <div className="muted">{runError.message}</div>
            </div>
          ) : null}

          <div className="feedback">
            <strong>Recent runs</strong>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Created at</th>
                    <th>Status</th>
                    <th>Summary</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {runHistory.slice(0, 8).map((run) => (
                    <tr
                      key={run.id}
                      style={
                        activeRunId === run.id
                          ? { background: "rgba(15, 118, 110, 0.08)" }
                          : undefined
                      }
                    >
                      <td>{formatDate(run.createdAt)}</td>
                      <td>{buildStatusLabel(run.status)}</td>
                      <td>
                        {run.summary.succeeded}/{run.summary.total} succeeded
                        {run.summary.failed ? `, failed ${run.summary.failed}` : ""}
                        {run.summary.paused ? `, paused ${run.summary.paused}` : ""}
                      </td>
                      <td>
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => setActiveRunId(run.id)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!runHistory.length ? <div className="empty">No run history yet.</div> : null}
            </div>
          </div>
        </div>

        <div className="bulk-price-panel">
          <h3 style={{ marginTop: 0 }}>Preview</h3>

          <div className="feedback">
            <strong>Selection</strong>
            <div className="toolbar">
              <label className="table-mode-toggle">
                <input
                  type="checkbox"
                  checked={uiState.previewMatchedOnly}
                  onChange={(event) =>
                    setUiState((current) => ({
                      ...current,
                      previewMatchedOnly: event.target.checked,
                    }))
                  }
                />
                <span>Matched rows only</span>
              </label>
              <button
                className="button ghost"
                type="button"
                onClick={handleRefreshPreview}
                disabled={!configReady || buildPreviewMutation.isPending}
              >
                {buildPreviewMutation.isPending ? "Refreshing preview..." : "Load matching rows"}
              </button>
              <button
                className={`button ${allReadyChecked ? "secondary" : "ghost"}`}
                type="button"
                onClick={() =>
                  updatePreviewSelection((current) => ({
                    ...current,
                    mode: "all_ready",
                    selectedRowKeys: {},
                    deselectedRowKeys: {},
                  }))
                }
                disabled={readyCount === 0 || hasBlockingRun}
              >
                Select all ready rows
              </button>
              <label className="table-mode-toggle">
                <input
                  type="checkbox"
                  checked={allSelectableChecked}
                  disabled={selectableCount === 0 || hasBlockingRun}
                  onChange={(event) =>
                    updatePreviewSelection((current) =>
                      event.target.checked
                        ? {
                            ...current,
                            mode: "all_selectable",
                            selectedRowKeys: {},
                            deselectedRowKeys: {},
                          }
                        : {
                            ...current,
                            mode: "explicit",
                            selectedRowKeys: {},
                            deselectedRowKeys: {},
                          },
                    )
                  }
                />
                <span>Select all executable rows</span>
              </label>
              <button
                className="button ghost"
                type="button"
                onClick={() =>
                  updatePreviewSelection((current) => ({
                    ...current,
                    mode: "explicit",
                    selectedRowKeys: {},
                    deselectedRowKeys: {},
                  }))
                }
                disabled={selectedCount === 0 || hasBlockingRun}
              >
                Clear selection
              </button>
            </div>
            <div className="muted">
              Showing {sortedRows.length} / matched {matchedCount} / total{" "}
              {previewData?.stats.totalNaverItems ?? 0} / executable {selectableCount} / ready {previewData?.stats.readyCount ?? 0} / conflicts{" "}
              {previewData?.stats.conflictCount ?? 0} / unmatched{" "}
              {previewData?.stats.unmatchedCount ?? 0}
            </div>
            {workDateFilterSummary?.enabled ? (
              <div className="muted">
                Work-date column: {workDateFilterSummary.column || "-"} / range {workDateFilterSummary.startDate} ~ {workDateFilterSummary.endDate} / source excluded {workDateFilterSummary.excludedSourceRowCount} / preview excluded {workDateFilterSummary.excludedPreviewRowCount}
              </div>
            ) : null}
            <div className="toolbar" style={{ justifyContent: "space-between" }}>
              <div className="muted">
                Page {previewPage} / {previewTotalPages} · {PREVIEW_ROWS_PER_PAGE} rows per page
              </div>
              <div className="toolbar">
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => setPreviewPage((current) => Math.max(1, current - 1))}
                  disabled={previewPage <= 1}
                >
                  Prev
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() =>
                    setPreviewPage((current) => Math.min(previewTotalPages, current + 1))
                  }
                  disabled={previewPage >= previewTotalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {previewError ? (
            <div className="feedback error">
              <strong>Preview error</strong>
              <div className="muted">{previewError.message}</div>
            </div>
          ) : null}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>Select</th>
                  <th>
                    <SortableHeaderButton
                      label="Product"
                      active={previewSort.field === "product"}
                      direction={previewSort.field === "product" ? previewSort.direction : "asc"}
                      onClick={() => togglePreviewSort("product")}
                    />
                  </th>
                  <th>
                    <SortableHeaderButton
                      label="Matched code"
                      active={previewSort.field === "matchedCode"}
                      direction={previewSort.field === "matchedCode" ? previewSort.direction : "asc"}
                      onClick={() => togglePreviewSort("matchedCode")}
                    />
                  </th>
                  <th>
                    <SortableHeaderButton
                      label="Status"
                      active={previewSort.field === "status"}
                      direction={previewSort.field === "status" ? previewSort.direction : "asc"}
                      onClick={() => togglePreviewSort("status")}
                    />
                  </th>
                  <th>
                    <SortableHeaderButton
                      label="Price change"
                      active={previewSort.field === "targetPrice"}
                      direction={previewSort.field === "targetPrice" ? previewSort.direction : "asc"}
                      onClick={() => togglePreviewSort("targetPrice")}
                    />
                  </th>
                  <th>
                    <SortableHeaderButton
                      label="Cost detail"
                      active={previewSort.field === "basePrice"}
                      direction={previewSort.field === "basePrice" ? previewSort.direction : "asc"}
                      onClick={() => togglePreviewSort("basePrice")}
                    />
                  </th>
                  <th>
                    <SortableHeaderButton
                      label="Manual override"
                      active={previewSort.field === "manualOverride"}
                      direction={previewSort.field === "manualOverride" ? previewSort.direction : "asc"}
                      onClick={() => togglePreviewSort("manualOverride")}
                    />
                  </th>
                  <th>
                    <SortableHeaderButton
                      label="Option handling"
                      active={previewSort.field === "option"}
                      direction={previewSort.field === "option" ? previewSort.direction : "asc"}
                      onClick={() => togglePreviewSort("option")}
                    />
                  </th>
                  <th>
                    <SortableHeaderButton
                      label="Last applied"
                      active={previewSort.field === "lastApplied"}
                      direction={previewSort.field === "lastApplied" ? previewSort.direction : "asc"}
                      onClick={() => togglePreviewSort("lastApplied")}
                    />
                  </th>
                  <th>
                    <SortableHeaderButton
                      label="Messages"
                      active={previewSort.field === "messages"}
                      direction={previewSort.field === "messages" ? previewSort.direction : "asc"}
                      onClick={() => togglePreviewSort("messages")}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const priceDirection = buildPriceDirection(
                    row.currentPrice,
                    row.displayEffectiveTargetPrice,
                  );

                  return (
                    <tr key={row.rowKey}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isRowSelected(row)}
                          disabled={row.status !== "ready" || hasBlockingRun}
                          onChange={(event) =>
                            updatePreviewSelection((current) => {
                              if (current.mode === "all_selectable") {
                                const nextDeselectedRowKeys = { ...current.deselectedRowKeys };

                                if (event.target.checked) {
                                  delete nextDeselectedRowKeys[row.rowKey];
                                } else {
                                  nextDeselectedRowKeys[row.rowKey] = true;
                                }

                                return {
                                  ...current,
                                  deselectedRowKeys: nextDeselectedRowKeys,
                                };
                              }

                              if (current.mode === "all_ready") {
                                const nextDeselectedRowKeys = { ...current.deselectedRowKeys };

                                if (event.target.checked) {
                                  delete nextDeselectedRowKeys[row.rowKey];
                                } else {
                                  nextDeselectedRowKeys[row.rowKey] = true;
                                }

                                return {
                                  ...current,
                                  deselectedRowKeys: nextDeselectedRowKeys,
                                };
                              }

                              const nextSelectedRowKeys = { ...current.selectedRowKeys };
                              if (event.target.checked) {
                                nextSelectedRowKeys[row.rowKey] = true;
                              } else {
                                delete nextSelectedRowKeys[row.rowKey];
                              }

                              return {
                                ...current,
                                selectedRowKeys: nextSelectedRowKeys,
                              };
                            })
                          }
                        />
                      </td>
                      <td style={{ minWidth: 240 }}>
                        <div>{row.productName}</div>
                        <div className="muted">Origin product no: {row.originProductNo}</div>
                        <div className="muted">Channel product no: {row.channelProductNo ?? "-"}</div>
                        <div className="muted">
                          Seller management code: {row.sellerManagementCode ?? "-"}
                        </div>
                        <div className="muted">Seller barcode: {row.sellerBarcode ?? "-"}</div>
                      </td>
                      <td>
                        <div>{row.matchedCode ?? "-"}</div>
                        <div className="muted">
                          Match field:{" "}
                          {buildMatchFieldLabel(
                            previewData?.sourceConfig.naverMatchField ?? state.naverMatchField,
                          )}
                        </div>
                      </td>
                      <td>
                        <div>{buildStatusLabel(row.displayStatus)}</div>
                        <div className="muted">
                          Sale status: {buildSaleStatusLabel(row.saleStatusLabel, row.currentSaleStatus ?? row.saleStatusCode)} {"->"} {buildSaleStatusLabel(row.targetSaleStatus, row.targetSaleStatus)}
                        </div>
                        <div className="muted">Source sold-out: {formatSoldOutState(row.sourceSoldOut)}</div>
                        <div className="muted">Last modified: {formatDate(row.modifiedAt)}</div>
                      </td>
                      <td>
                        <div className="bulk-price-price-cell">
                          <span className="bulk-price-value same">
                            {formatWon(row.currentPrice)}
                          </span>
                          <span className="bulk-price-arrow">-&gt;</span>
                          <span className={`bulk-price-value ${priceDirection}`}>
                            {formatWon(row.displayEffectiveTargetPrice)}
                          </span>
                        </div>
                        <div className="muted">Computed price: {formatWon(row.computedPrice)}</div>
                      </td>
                      <td>
                        <div className="muted">Base price: {formatWon(row.basePrice)}</div>
                        <div className="muted">
                          Discounted cost: {formatWon(row.discountedBaseCost)}
                        </div>
                        <div className="muted">Effective cost: {formatWon(row.effectiveCost)}</div>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={manualOverrides[row.rowKey] ?? ""}
                          disabled={hasBlockingRun}
                          placeholder={row.computedPrice ? String(row.computedPrice) : ""}
                          onChange={(event) =>
                            updatePreviewSelection((current) => ({
                              ...current,
                              manualOverrides: {
                                ...current.manualOverrides,
                                [row.rowKey]: event.target.value,
                              },
                            }))
                          }
                          style={{ width: 120 }}
                        />
                        <div className="muted">
                          Applied price: {formatWon(row.displayEffectiveTargetPrice)}
                        </div>
                      </td>
                      <td style={{ minWidth: 220 }}>
                        <div>
                          {row.hasOptions
                            ? `Option product (${buildOptionTypeLabel(row.optionType)}, ${row.optionCount})`
                            : "Single product"}
                        </div>
                        <div className="muted" style={{ whiteSpace: "normal" }}>
                          {row.optionHandlingMessage}
                        </div>
                      </td>
                      <td>
                        <div>{formatDate(row.displayLastAppliedAt)}</div>
                        <div className="muted">
                          {formatWon(row.displayLastAppliedPrice)}
                        </div>
                      </td>
                      <td style={{ minWidth: 220 }}>
                        <div className="muted" style={{ whiteSpace: "normal" }}>
                          {row.displayMessages.length
                            ? row.displayMessages.map(translateBulkPriceMessage).join(" / ")
                            : "-"}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!sortedRows.length && !previewQuery.isLoading ? (
              <div className="empty">
                {uiState.previewMatchedOnly
                  ? "No matched preview rows."
                  : "No preview rows."}
              </div>
            ) : null}
          </div>

          {activeRun ? (
            <div className="feedback">
              <div className="card-header">
                <div>
                  <strong>Live log</strong>
                  <div className="muted">
                    {hasBlockingRun
                      ? "Auto-refreshes every second while a run is active and prioritizes items that are still moving."
                      : "Shows the latest rows from the selected run."}
                  </div>
                </div>
                <div className="muted">Latest {liveLogRows.length} rows</div>
                <div className="muted">This panel shows a recent slice, not the full queue. Use the run summary for overall totals.</div>
              </div>

              {liveLogRows.length ? (
                <div className="bulk-price-live-log">
                  {liveLogRows.map((item) => (
                    <div className="bulk-price-live-log-row" key={item.id}>
                      <div className="bulk-price-live-log-body">
                        <div className="bulk-price-live-log-header">
                          <div className="bulk-price-live-log-title">{item.productName}</div>
                          <span className={`status-pill ${buildStatusTone(item.status)}`}>
                            {buildStatusLabel(item.status)}
                          </span>
                        </div>
                        <div className="muted">
                          Origin product no {item.originProductNo} / channel product no {item.channelProductNo ?? "-"} /
                          matched code {item.matchedCode ?? "-"}
                        </div>
                        <div className="muted">
                          Current {formatWon(item.currentPrice)} {"->"} target {formatWon(item.effectiveTargetPrice)}
                        </div>
                        <div className="bulk-price-live-log-message">
                          {item.messages.length
                            ? item.messages.map(translateBulkPriceMessage).join(" / ")
                            : "No detailed message yet."}
                        </div>
                      </div>
                      <div className="bulk-price-live-log-meta">
                        <div>Updated {formatDate(item.updatedAt)}</div>
                        <div className="muted">Applied {formatDate(item.lastAppliedAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty bulk-price-live-log-empty">
                  {hasBlockingRun
                    ? "Rows will appear here as the active run progresses."
                    : "No live log available."}
                </div>
              )}
            </div>
          ) : null}

          {activeRun ? (
            <div className="feedback">
              <strong>Selected run</strong>
              <div className="muted">Run ID: {activeRun.id}</div>
              <div className="muted">
                Created {formatDate(activeRun.createdAt)} / started {formatDate(activeRun.startedAt)} /
                finished {formatDate(activeRun.finishedAt)}
              </div>
              <div className="muted">{buildRunSummaryText(activeRun)}</div>
            </div>
          ) : null}
        </div>
      </div>

      <SampleRowsDialog
        open={sampleRowsDialogOpen}
        title="Sample rows detail"
        subtitle={
          state.schema && state.table
            ? `${state.schema}.${state.table}`
            : "Select a source table to inspect sample rows."
        }
        columns={metadataQuery.data?.columns ?? []}
        sampleRows={metadataQuery.data?.sampleRows ?? []}
        emptyMessage="No sample rows available."
        onClose={() => setSampleRowsDialogOpen(false)}
      />
    </div>
  );
}
