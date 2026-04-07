import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import type {
  BulkPricePreviewQueryInput,
  BulkPricePreviewResponse,
  BulkPricePreviewSort,
  BulkPriceRulePreset,
  BulkPriceRulePresetListResponse,
  BulkPriceRuleSet,
  BulkPriceRunCommandResponse,
  BulkPriceRunLiveQueryInput,
  BulkPriceRunLiveResponse,
  BulkPriceSourcePreset,
  BulkPriceSourcePresetListResponse,
  BulkPriceSourceMetadataResponse,
} from "@shared/coupang-bulk-price";
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
import { hasMatchingBulkPriceRunContext } from "@/lib/bulk-price-run-overlay";
import { shouldSkipCoupangSamePriceRow } from "@/lib/coupang-bulk-price-preview";
import { apiRequestJson, getJson, queryClient } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate, formatNumber } from "@/lib/utils";
import { resolveWorkspacePollingInterval } from "@/lib/workspace-tabs";
import {
  buildPriceDirection,
  buildRunLogPriority,
  buildRuleSetFromState,
  buildSourceConfigFromState,
  buildStatusLabel,
  buildStatusTone,
  formatDurationMs,
  formatPreviewExplorerState,
  formatSoldOutState,
} from "./helpers";
import {
  DEFAULT_WORK_DATE_RANGE,
  DEFAULT_PREVIEW_SORT,
  DEFAULT_STATE,
  DEFAULT_UI_STATE,
  PREVIEW_ROWS_PER_PAGE,
  buildPreviewQueryKey,
  type ActivePreviewSession,
  type BulkPriceUiState,
  type BulkPriceUiSectionKey,
  type CoupangPreviewSortField,
  type CoupangPreviewSortState,
  type CoupangStoresResponse,
  type DisplayRow,
  type MenuState,
} from "./state";

const SAME_PRICE_SKIP_MESSAGE = "Current price already matches target price.";

export default function CoupangBulkPricePage() {
  const isActiveTab = useWorkspaceTabActivity();
  const search = useSearch();
  const { state, setState } = useServerMenuState<MenuState>(
    "coupang.bulk-price",
    DEFAULT_STATE,
  );
  const { state: uiState, setState: setUiState } = useServerMenuState<BulkPriceUiState>(
    "coupang.bulk-price.ui",
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
  const [previewSelections, setPreviewSelections] = useState<
    Record<string, PreviewSelectionState>
  >({});
  const [activePreviewSession, setActivePreviewSession] = useState<ActivePreviewSession | null>(
    null,
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [fixedAdjustmentMode, setFixedAdjustmentMode] = useState<FixedAdjustmentMode>(
    resolveFixedAdjustmentMode(DEFAULT_STATE.fixedAdjustment),
  );
  const [fixedAdjustmentInput, setFixedAdjustmentInput] = useState(
    String(resolveFixedAdjustmentAmount(DEFAULT_STATE.fixedAdjustment)),
  );
  const [previewSort, setPreviewSort] = useState<CoupangPreviewSortState>(DEFAULT_PREVIEW_SORT);
  const [sampleRowsDialogOpen, setSampleRowsDialogOpen] = useState(false);
  const routeRunId = useMemo(() => new URLSearchParams(search).get("runId"), [search]);

  const sourcePresetsQuery = useQuery({
    queryKey: ["/api/coupang/bulk-price/source-presets"],
    queryFn: () =>
      getJson<BulkPriceSourcePresetListResponse>("/api/coupang/bulk-price/source-presets"),
  });

  const rulePresetsQuery = useQuery({
    queryKey: ["/api/coupang/bulk-price/rule-presets"],
    queryFn: () =>
      getJson<BulkPriceRulePresetListResponse>("/api/coupang/bulk-price/rule-presets"),
  });

  const sourcePresets = sourcePresetsQuery.data?.items ?? [];
  const rulePresets = rulePresetsQuery.data?.items ?? [];
  const selectedSourcePresetId = uiState.selectedSourcePresetId;
  const sourcePresetName = uiState.sourcePresetName;
  const sourcePresetMemo = uiState.sourcePresetMemo;
  const selectedRulePresetId = uiState.selectedRulePresetId;
  const rulePresetName = uiState.rulePresetName;
  const rulePresetMemo = uiState.rulePresetMemo;
  const selectedSourcePreset =
    sourcePresets.find((item) => item.id === selectedSourcePresetId) ?? null;
  const selectedRulePreset =
    rulePresets.find((item) => item.id === selectedRulePresetId) ?? null;

  function updatePresetUiState(
    patch: Partial<
      Pick<
        BulkPriceUiState,
        | "selectedSourcePresetId"
        | "sourcePresetName"
        | "sourcePresetMemo"
        | "selectedRulePresetId"
        | "rulePresetName"
        | "rulePresetMemo"
      >
    >,
  ) {
    setUiState((current) => ({
      ...current,
      ...patch,
    }));
  }

  const storesQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
  });

  const stores = storesQuery.data?.items ?? [];

  useEffect(() => {
    if (!state.storeId && stores[0]) {
      setState((current) => ({
        ...current,
        storeId: stores[0]?.id ?? "",
      }));
    }
  }, [setState, state.storeId, stores]);

  useEffect(() => {
    if (!selectedSourcePresetId || !sourcePresetsQuery.isSuccess) {
      return;
    }

    if (selectedSourcePreset) {
      return;
    }

    updatePresetUiState({
      selectedSourcePresetId: "",
      sourcePresetName: "",
      sourcePresetMemo: "",
    });
  }, [selectedSourcePreset, selectedSourcePresetId, sourcePresetsQuery.isSuccess]);

  useEffect(() => {
    if (!selectedRulePresetId || !rulePresetsQuery.isSuccess) {
      return;
    }

    if (selectedRulePreset) {
      return;
    }

    updatePresetUiState({
      selectedRulePresetId: "",
      rulePresetName: "",
      rulePresetMemo: "",
    });
  }, [rulePresetsQuery.isSuccess, selectedRulePreset, selectedRulePresetId]);

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

  function togglePreviewSort(field: CoupangPreviewSortField) {
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

  function applySourcePreset(preset: BulkPriceSourcePreset) {
    updatePresetUiState({
      selectedSourcePresetId: preset.id,
      sourcePresetName: preset.name,
      sourcePresetMemo: preset.memo,
    });
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
      coupangMatchField: preset.sourceConfig.coupangMatchField,
    }));
  }

  function applyRulePreset(preset: BulkPriceRulePreset) {
    updatePresetUiState({
      selectedRulePresetId: preset.id,
      rulePresetName: preset.name,
      rulePresetMemo: preset.memo,
    });
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
    queryKey: ["/api/coupang/bulk-price/source/metadata", "tables"],
    queryFn: () =>
      getJson<BulkPriceSourceMetadataResponse>("/api/coupang/bulk-price/source/metadata"),
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
    queryKey: ["/api/coupang/bulk-price/source/metadata", state.schema, state.table],
    queryFn: () => {
      const params = new URLSearchParams();
      if (state.schema) params.set("schema", state.schema);
      if (state.table) params.set("table", state.table);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return getJson<BulkPriceSourceMetadataResponse>(
        `/api/coupang/bulk-price/source/metadata${suffix}`,
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
    if (!metadataQuery.data?.columns.length) {
      return;
    }

    setState((current) => {
      const next = { ...current };
      const columnNames = metadataQuery.data?.columns.map((column) => column.name) ?? [];
      const basePriceColumnValid = columnNames.includes(next.basePriceColumn);
      const sourceMatchColumnValid = columnNames.includes(next.sourceMatchColumn);
      const soldOutColumnValid =
        !next.soldOutColumn || columnNames.includes(next.soldOutColumn);
      const suggestedSoldOutColumn =
        metadataQuery.data?.columns.find((column) => isSoldOutLikeColumnName(column.name))
          ?.name ?? "";
      const workDateColumnValid =
        Boolean(next.workDateColumn) && columnNames.includes(next.workDateColumn);
      const suggestedWorkDateColumn =
        metadataQuery.data?.columns.find((column) => isWorkDateLikeColumnName(column.name))
          ?.name ?? "";

      if (!basePriceColumnValid) {
        next.basePriceColumn =
          metadataQuery.data?.columns.find((column) => isNumericLike(column.dataType))?.name ??
          metadataQuery.data?.columns[0]?.name ??
          "";
      }
      if (
        !sourceMatchColumnValid ||
        next.sourceMatchColumn === next.basePriceColumn
      ) {
        next.sourceMatchColumn =
          metadataQuery.data?.columns.find((column) => column.name !== next.basePriceColumn)?.name ??
          metadataQuery.data?.columns[0]?.name ??
          "";
      }
      if (!soldOutColumnValid) {
        next.soldOutColumn = suggestedSoldOutColumn;
      } else if (
        !next.soldOutColumn &&
        suggestedSoldOutColumn &&
        (!basePriceColumnValid || !sourceMatchColumnValid)
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

  const previewSortRequest = useMemo<BulkPricePreviewSort>(
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
      rules: BulkPriceRuleSet;
    }) =>
      apiRequestJson<BulkPricePreviewResponse>("POST", "/api/coupang/bulk-price/preview", {
        sourceConfig: input.sourceConfig,
        rules: input.rules,
        page: 1,
        pageSize: PREVIEW_ROWS_PER_PAGE,
        matchedOnly: uiState.previewMatchedOnly,
        sort: previewSortRequest,
      } satisfies BulkPricePreviewQueryInput),
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
    queryKey: activePreviewQueryKey ?? ["/api/coupang/bulk-price/preview", "idle"],
    queryFn: () =>
      apiRequestJson<BulkPricePreviewResponse>("POST", "/api/coupang/bulk-price/preview", {
        previewId: activePreviewSession?.previewId ?? null,
        page: previewPage,
        pageSize: PREVIEW_ROWS_PER_PAGE,
        matchedOnly: uiState.previewMatchedOnly,
        sort: previewSortRequest,
      } satisfies BulkPricePreviewQueryInput),
    enabled: Boolean(activePreviewSession),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });

  const previewData = activePreviewSession ? previewQuery.data ?? null : null;
  const runLiveVendorItemIds = useMemo(
    () => (previewData?.rows ?? []).map((row) => row.vendorItemId),
    [previewData?.rows],
  );
  const runLiveQuery = useQuery({
    queryKey: ["/api/coupang/bulk-price/runs-live", activeRunId, runLiveVendorItemIds],
    queryFn: () =>
      apiRequestJson<BulkPriceRunLiveResponse>(
        "POST",
        `/api/coupang/bulk-price/runs/${activeRunId}/live`,
        {
          vendorItemIds: runLiveVendorItemIds,
          logLimit: 20,
        } satisfies BulkPriceRunLiveQueryInput,
      ),
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const data = query.state.data as BulkPriceRunLiveResponse | undefined;
      const status = data?.run.status;
      return resolveWorkspacePollingInterval(
        isActiveTab,
        status === "running" || status === "queued",
        1000,
      );
    },
  });
  const activeRun = runLiveQuery.data?.run ?? null;
  const currentPreviewId = activePreviewSession?.previewId ?? null;
  const previewSelection = currentPreviewId
    ? previewSelections[currentPreviewId] ?? createDefaultPreviewSelectionState()
    : createDefaultPreviewSelectionState();
  const manualOverrides = previewSelection.manualOverrides;
  const shouldOverlayRun = hasMatchingBulkPriceRunContext(previewData, activeRun);

  const createRunMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<BulkPriceRunCommandResponse>("POST", "/api/coupang/bulk-price/runs", {
        previewId: currentPreviewId,
        selectionMode: previewSelection.mode,
        excludedRowKeys:
          previewSelection.mode === "all_selectable" || previewSelection.mode === "all_ready"
            ? Object.keys(previewSelection.deselectedRowKeys)
            : [],
        selectedRowKeys:
          previewSelection.mode === "explicit"
            ? Object.keys(previewSelection.selectedRowKeys)
            : [],
        manualOverrides: buildManualOverridePayload(manualOverrides),
      }),
    onSuccess: (detail) => {
      setActiveRunId(detail.run.id);
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<BulkPriceRunCommandResponse>("POST", `/api/coupang/bulk-price/runs/${activeRunId}/pause`),
    onSuccess: (detail) => setActiveRunId(detail.run.id),
  });

  const resumeMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<BulkPriceRunCommandResponse>("POST", `/api/coupang/bulk-price/runs/${activeRunId}/resume`),
    onSuccess: (detail) => setActiveRunId(detail.run.id),
  });

  const stopMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<BulkPriceRunCommandResponse>("POST", `/api/coupang/bulk-price/runs/${activeRunId}/stop`),
    onSuccess: (detail) => setActiveRunId(detail.run.id),
  });

  const createSourcePresetMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<BulkPriceSourcePreset>("POST", "/api/coupang/bulk-price/source-presets", {
        name: sourcePresetName,
        memo: sourcePresetMemo,
        sourceConfig: currentSourceConfig,
      }),
    onSuccess: async (preset) => {
      updatePresetUiState({
        selectedSourcePresetId: preset.id,
        sourcePresetName: preset.name,
        sourcePresetMemo: preset.memo,
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/coupang/bulk-price/source-presets"],
      });
    },
  });

  const updateSourcePresetMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<BulkPriceSourcePreset>(
        "PUT",
        `/api/coupang/bulk-price/source-presets/${selectedSourcePresetId}`,
        {
          name: sourcePresetName,
          memo: sourcePresetMemo,
          sourceConfig: currentSourceConfig,
        },
      ),
    onSuccess: async (preset) => {
      updatePresetUiState({
        sourcePresetName: preset.name,
        sourcePresetMemo: preset.memo,
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/coupang/bulk-price/source-presets"],
      });
    },
  });

  const deleteSourcePresetMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<{ id: string }>(
        "DELETE",
        `/api/coupang/bulk-price/source-presets/${selectedSourcePresetId}`,
      ),
    onSuccess: async () => {
      updatePresetUiState({
        selectedSourcePresetId: "",
        sourcePresetName: "",
        sourcePresetMemo: "",
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/coupang/bulk-price/source-presets"],
      });
    },
  });

  const createRulePresetMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<BulkPriceRulePreset>("POST", "/api/coupang/bulk-price/rule-presets", {
        name: rulePresetName,
        memo: rulePresetMemo,
        rules: currentRuleSet,
      }),
    onSuccess: async (preset) => {
      updatePresetUiState({
        selectedRulePresetId: preset.id,
        rulePresetName: preset.name,
        rulePresetMemo: preset.memo,
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/coupang/bulk-price/rule-presets"],
      });
    },
  });

  const updateRulePresetMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<BulkPriceRulePreset>(
        "PUT",
        `/api/coupang/bulk-price/rule-presets/${selectedRulePresetId}`,
        {
          name: rulePresetName,
          memo: rulePresetMemo,
          rules: currentRuleSet,
        },
      ),
    onSuccess: async (preset) => {
      updatePresetUiState({
        rulePresetName: preset.name,
        rulePresetMemo: preset.memo,
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/coupang/bulk-price/rule-presets"],
      });
    },
  });

  const deleteRulePresetMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<{ id: string }>(
        "DELETE",
        `/api/coupang/bulk-price/rule-presets/${selectedRulePresetId}`,
      ),
    onSuccess: async () => {
      updatePresetUiState({
        selectedRulePresetId: "",
        rulePresetName: "",
        rulePresetMemo: "",
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/coupang/bulk-price/rule-presets"],
      });
    },
  });

  const runItemMap = useMemo(
    () =>
      shouldOverlayRun
        ? new Map(
            (runLiveQuery.data?.overlayItems ?? []).map((item) => [item.vendorItemId, item] as const),
          )
        : new Map(),
    [runLiveQuery.data?.overlayItems, shouldOverlayRun],
  );

  const rows = useMemo<DisplayRow[]>(
    () =>
      (previewData?.rows ?? []).map((row) => {
        const runItem = runItemMap.get(row.vendorItemId);
        const manualOverrideText = manualOverrides[row.vendorItemId] ?? "";
        const manualOverridePrice = manualOverrideText.trim()
          ? Number(manualOverrideText)
          : null;
        const displayEffectiveTargetPrice =
          runItem?.effectiveTargetPrice ??
          (manualOverridePrice ?? row.effectiveTargetPrice);
        const shouldSkipSamePrice = shouldSkipCoupangSamePriceRow({
          currentPrice: row.currentPrice,
          nextPrice: displayEffectiveTargetPrice,
          needsInventoryUpdate: row.needsInventoryUpdate,
          needsSaleStatusUpdate: row.needsSaleStatusUpdate,
        });
        const baseMessages = runItem?.messages ?? row.messages;
        return {
          ...row,
          displayStatus: runItem?.status ?? row.status,
          displayMessages:
            shouldSkipSamePrice && !baseMessages.includes(SAME_PRICE_SKIP_MESSAGE)
              ? [...baseMessages, SAME_PRICE_SKIP_MESSAGE]
              : baseMessages,
          displayManualOverridePrice:
            runItem?.manualOverridePrice ?? manualOverridePrice,
          displayEffectiveTargetPrice,
          displayLastAppliedAt: runItem?.lastAppliedAt ?? row.lastAppliedAt,
          displayIsSelectable: row.isSelectable && !shouldSkipSamePrice,
        };
      }),
    [manualOverrides, previewData?.rows, runItemMap],
  );
  const sortedRows = rows;
  const previewTotalPages = previewData?.totalPages ?? 1;

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

  function isRowSelected(row: DisplayRow) {
    if (previewSelection.mode === "all_selectable") {
      if (!row.displayIsSelectable) {
        return false;
      }
      return !previewSelection.deselectedRowKeys[row.vendorItemId];
    }

    if (previewSelection.mode === "all_ready") {
      if (row.status !== "ready") {
        return false;
      }
      return !previewSelection.deselectedRowKeys[row.vendorItemId];
    }

    return Boolean(previewSelection.selectedRowKeys[row.vendorItemId]);
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
  const problemCount =
    (previewData?.stats.conflictCount ?? 0) +
    (previewData?.stats.unmatchedCount ?? 0) +
    (previewData?.stats.invalidSourceCount ?? 0);

  const activeRunStatus = activeRun?.status ?? null;
  const hasBlockingRun =
    activeRunStatus === "running" ||
    activeRunStatus === "queued" ||
    activeRunStatus === "paused";
  const liveLogRows = runLiveQuery.data?.liveLogItems ?? [];
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
  const previewBuildMetrics = previewData?.buildMetrics ?? null;
  const sourceMetadataError = (tablesQuery.error ?? metadataQuery.error) as Error | null;
  const previewError = (buildPreviewMutation.error ?? previewQuery.error) as Error | null;
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

  const toggleUiSection = (key: BulkPriceUiSectionKey) => {
    setUiState((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone="live" label="COUPANG" />
          <StatusBadge tone="shared" label="Bulk Price" />
        </div>
        <h1>COUPANG Bulk Price</h1>
        <p>
          Match Postgres source rows with Coupang items, review the computed target price,
          and run bulk updates from one screen.
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
          <div className="metric-label">Problem rows</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {problemCount}
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
                      updatePresetUiState({
                        selectedSourcePresetId: "",
                        sourcePresetName: "",
                        sourcePresetMemo: "",
                      });
                      return;
                    }

                    const preset =
                      sourcePresets.find((item) => item.id === nextId) ?? null;
                    if (!preset) {
                      return;
                    }

                    applySourcePreset(preset);
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
                  onChange={(event) =>
                    updatePresetUiState({
                      sourcePresetName: event.target.value,
                    })
                  }
                  placeholder="Default source preset"
                />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Memo</span>
                <textarea
                  value={sourcePresetMemo}
                  onChange={(event) =>
                    updatePresetUiState({
                      sourcePresetMemo: event.target.value,
                    })
                  }
                  placeholder="Describe the source table and match logic."
                  rows={3}
                />
              </label>
            </div>
            <div className="toolbar">
              <button
                className="button secondary"
                type="button"
                onClick={() => createSourcePresetMutation.mutate()}
                disabled={
                  !sourcePresetReady ||
                  !sourcePresetName.trim() ||
                  sourcePresetBusy
                }
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
                ?꾩옱 ?꾨━???섏젙
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
            {selectedSourcePreset ? (
              <div className="muted">
                Updated {formatDate(selectedSourcePreset.updatedAt)}
              </div>
            ) : (
              <div className="muted">
                You can save the current source settings as a reusable preset.
              </div>
            )}
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
                  setState((current) => ({ ...current, storeId: event.target.value }))
                }
              >
                <option value="">Select store</option>
                {stores.map((store) => (
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
              <span>Postgres table</span>
              <select
                value={selectedSourceTableValue}
                onChange={(event) =>
                  setState((current) => {
                    const nextSource = parseSourceTableValue(event.target.value);
                    return {
                      ...current,
                      schema: nextSource.schema,
                      table: nextSource.table,
                      basePriceColumn: "",
                      sourceMatchColumn: "",
                      soldOutColumn: "",
                      workDateColumn: "",
                    };
                  })
                }
              >
                <option value="">Select a table</option>
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
              <span>Coupang match field</span>
              <select
                value={state.coupangMatchField}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    coupangMatchField: event.target.value as MenuState["coupangMatchField"],
                  }))
                }
              >
                <option value="externalVendorSku">externalVendorSku</option>
                <option value="barcode">barcode</option>
                <option value="vendorItemId">vendorItemId</option>
                <option value="sellerProductId">sellerProductId</option>
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
              <strong>Work-date filter required</strong>
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
            <div className="muted">Loaded tables: {sourceTables.length}</div>
            <div className="muted">
              Work-date column: {state.workDateColumn || "-"} / range {state.workDateFrom || "-"} ~ {state.workDateTo || "-"}
            </div>
          </div>

          <CollapsibleSection
            title="Sample rows"
            description="Inspect sample values from the selected Postgres table."
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
                      updatePresetUiState({
                        selectedRulePresetId: "",
                        rulePresetName: "",
                        rulePresetMemo: "",
                      });
                      return;
                    }

                    const preset =
                      rulePresets.find((item) => item.id === nextId) ?? null;
                    if (!preset) {
                      return;
                    }

                    applyRulePreset(preset);
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
                  onChange={(event) =>
                    updatePresetUiState({
                      rulePresetName: event.target.value,
                    })
                  }
                  placeholder="Default rule preset"
                />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Memo</span>
                <textarea
                  value={rulePresetMemo}
                  onChange={(event) =>
                    updatePresetUiState({
                      rulePresetMemo: event.target.value,
                    })
                  }
                  placeholder="Describe fees, margin, and discount rules."
                  rows={3}
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
                ?꾩옱 ?꾨━???섏젙
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
            {selectedRulePreset ? (
              <div className="muted">
                Updated {formatDate(selectedRulePreset.updatedAt)}
              </div>
            ) : (
              <div className="muted">
                Save pricing rules separately and reuse them with different sources.
              </div>
            )}
            {rulePresetError ? (
              <div className="feedback error">
                <strong>Rule preset error</strong>
                <div className="muted">{rulePresetError.message}</div>
              </div>
            ) : null}
          </CollapsibleSection>
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
                step="0.1"
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
                step="0.1"
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
                    inboundShippingCost: Number(event.target.value || 0),
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Discount rate (%)</span>
              <input
                type="number"
                step="0.1"
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
                    roundingUnit: Number(event.target.value) as MenuState["roundingUnit"],
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
                <option value="ceil">Ceil</option>
                <option value="round">Round</option>
                <option value="floor">Floor</option>
              </select>
            </label>
          </div>

          <CollapsibleSection
            className={`feedback ${formulaInvalid ? "error" : ""}`}
            title="Formula"
            description="Summarize how the current rule set translates into the target price."
            isOpen={uiState.formulaOpen}
            onToggle={() => toggleUiSection("formulaOpen")}
          >
            <div className="muted">
              Discounted cost = base price x (1 - discount rate)
            </div>
            <div className="muted">
              Effective cost = discounted cost + inbound shipping cost
            </div>
            <div className="muted">
              Target price = ((effective cost / (1 - fee rate - margin rate)) ± fixed adjustment) then rounded
            </div>
            {formulaInvalid ? (
              <div className="muted">Fee rate plus margin rate must stay below 100%.</div>
            ) : null}
          </CollapsibleSection>

          <div className="toolbar">
            <button
              className="button secondary"
              onClick={handleRefreshPreview}
              disabled={!configReady || buildPreviewMutation.isPending}
            >
              {buildPreviewMutation.isPending ? "Refreshing preview..." : "Refresh preview"}
            </button>
            <button
              className="button"
              onClick={() => createRunMutation.mutate()}
              disabled={
                !currentPreviewId ||
                hasBlockingRun ||
                selectedCount === 0 ||
                runBusy
              }
            >
              {createRunMutation.isPending ? "Preparing run..." : "Start bulk update"}
            </button>
            <button
              className="button ghost"
              onClick={() => pauseMutation.mutate()}
              disabled={!activeRunId || activeRunStatus !== "running" || pauseMutation.isPending}
            >
              Pause
            </button>
            <button
              className="button ghost"
              onClick={() => resumeMutation.mutate()}
              disabled={!activeRunId || activeRunStatus !== "paused" || resumeMutation.isPending}
            >
              Resume
            </button>
            <button
              className="button ghost"
              onClick={() => stopMutation.mutate()}
              disabled={
                !activeRunId ||
                !activeRunStatus ||
                !["running", "queued", "paused"].includes(activeRunStatus) ||
                stopMutation.isPending
              }
            >
              Stop
            </button>
          </div>

          {previewNeedsRefresh ? (
            <div className="muted">
              Settings changed after the last preview. Runs still follow the last generated preview snapshot.
            </div>
          ) : null}

          {(createRunMutation.error ||
            pauseMutation.error ||
            resumeMutation.error ||
            stopMutation.error ||
            previewError) && (
            <div className="feedback error">
              <strong>Error message</strong>
              <div className="muted">
                {(createRunMutation.error as Error | null)?.message ||
                  (pauseMutation.error as Error | null)?.message ||
                  (resumeMutation.error as Error | null)?.message ||
                  (stopMutation.error as Error | null)?.message ||
                  previewError?.message}
              </div>
            </div>
          )}

          {runLiveQuery.data ? (
            <div className="metric-grid">
              <div className="metric">
                <div className="metric-label">Queued</div>
                <div className="metric-value">{runLiveQuery.data.run.summary.queued}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Succeeded</div>
                <div className="metric-value">{runLiveQuery.data.run.summary.succeeded}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Failed</div>
                <div className="metric-value">{runLiveQuery.data.run.summary.failed}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Stopped</div>
                <div className="metric-value">{runLiveQuery.data.run.summary.stopped}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="bulk-price-panel">
          <h3 style={{ marginTop: 0 }}>Coupang match results</h3>

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
                disabled={selectableCount === 0 || hasBlockingRun}
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
            <div className="muted">
              Showing {previewData?.filteredTotal ?? 0} / executable {selectableCount} / ready{" "}
              {previewData?.stats.readyCount ?? 0} / selected {selectedCount} / conflicts{" "}
              {previewData?.stats.conflictCount ?? 0} / unmatched{" "}
              {previewData?.stats.unmatchedCount ?? 0}
            </div>
          </div>

          {workDateFilterSummary?.enabled ? (
            <div className="muted">
              Work-date column: {workDateFilterSummary.column || "-"} / range {workDateFilterSummary.startDate} ~ {workDateFilterSummary.endDate} / source excluded{" "}
              {workDateFilterSummary.excludedSourceRowCount} / preview excluded{" "}
              {workDateFilterSummary.excludedPreviewRowCount}
            </div>
          ) : null}
          {previewBuildMetrics ? (
            <div className="muted">
              Preview build {formatDurationMs(previewBuildMetrics.totalMs)} / metadata{" "}
              {formatDurationMs(previewBuildMetrics.metadataMs)} / Coupang candidates{" "}
              {formatDurationMs(previewBuildMetrics.coupangCandidateMs)} / source query{" "}
              {formatDurationMs(previewBuildMetrics.sourceQueryMs)} / latest records{" "}
              {formatDurationMs(previewBuildMetrics.latestRecordLoadMs)} / row build{" "}
              {formatDurationMs(previewBuildMetrics.rowBuildMs)}
            </div>
          ) : null}
          {previewBuildMetrics ? (
            <div className="muted">
              Coupang explorer: {formatPreviewExplorerState(previewBuildMetrics)} / fetched{" "}
              {formatDate(previewBuildMetrics.coupangExplorerFetchedAt)}
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

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>
                    <SortableHeaderButton
                      label="Product / option"
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
                      label="Price change"
                      active={previewSort.field === "price"}
                      direction={previewSort.field === "price" ? previewSort.direction : "asc"}
                      onClick={() => togglePreviewSort("price")}
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
                      label="Status"
                      active={previewSort.field === "status"}
                      direction={previewSort.field === "status" ? previewSort.direction : "asc"}
                      onClick={() => togglePreviewSort("status")}
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
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const direction = buildPriceDirection(
                    row.currentPrice,
                    row.displayEffectiveTargetPrice ?? null,
                  );
                  return (
                    <tr key={row.vendorItemId}>
                      <td>
                        <input
                          type="checkbox"
                          checked={
                            isRowSelected(row)
                          }
                          disabled={row.status !== "ready" || hasBlockingRun}
                          onChange={(event) =>
                            updatePreviewSelection((current) => {
                              if (current.mode === "all_selectable") {
                                const nextDeselectedRowKeys = { ...current.deselectedRowKeys };

                                if (event.target.checked) {
                                  delete nextDeselectedRowKeys[row.vendorItemId];
                                } else {
                                  nextDeselectedRowKeys[row.vendorItemId] = true;
                                }

                                return {
                                  ...current,
                                  deselectedRowKeys: nextDeselectedRowKeys,
                                };
                              }

                              if (current.mode === "all_ready") {
                                const nextDeselectedRowKeys = { ...current.deselectedRowKeys };

                                if (event.target.checked) {
                                  delete nextDeselectedRowKeys[row.vendorItemId];
                                } else {
                                  nextDeselectedRowKeys[row.vendorItemId] = true;
                                }

                                return {
                                  ...current,
                                  deselectedRowKeys: nextDeselectedRowKeys,
                                };
                              }

                              const nextSelectedRowKeys = { ...current.selectedRowKeys };
                              if (event.target.checked) {
                                nextSelectedRowKeys[row.vendorItemId] = true;
                              } else {
                                delete nextSelectedRowKeys[row.vendorItemId];
                              }

                              return {
                                ...current,
                                selectedRowKeys: nextSelectedRowKeys,
                              };
                            })
                          }
                        />
                      </td>
                      <td>
                        <div>
                          <strong>{row.sellerProductName}</strong>
                        </div>
                        <div className="muted">{row.itemName}</div>
                        <div className="muted">
                          sellerProductId {row.sellerProductId} / vendorItemId {row.vendorItemId}
                        </div>
                        {row.displayMessages.length ? (
                          <div className="table-note">{row.displayMessages.join(" / ")}</div>
                        ) : null}
                      </td>
                      <td>
                        <div>{row.matchedCode ?? "-"}</div>
                        <div className="muted">SKU {row.externalVendorSku ?? "-"}</div>
                        <div className="muted">Barcode {row.barcode ?? "-"}</div>
                      </td>
                      <td>
                        <div className={`bulk-price-price-cell ${direction}`}>
                          <span className={`bulk-price-value ${direction}`}>
                            {formatNumber(row.currentPrice)}
                          </span>
                          <span className="bulk-price-arrow">-&gt;</span>
                          <span className={`bulk-price-value ${direction}`}>
                            {formatNumber(row.displayEffectiveTargetPrice)}
                          </span>
                        </div>
                        <div className="muted">
                          Base price {formatNumber(row.basePrice)} / computed {formatNumber(row.computedPrice)}
                        </div>
                        <div className="muted">
                          Discounted cost {formatNumber(row.discountedBaseCost)} / effective cost {formatNumber(row.effectiveCost)}
                        </div>
                      </td>
                      <td>
                        <input
                          inputMode="numeric"
                          value={manualOverrides[row.vendorItemId] ?? ""}
                          onChange={(event) =>
                            updatePreviewSelection((current) => ({
                              ...current,
                              manualOverrides: {
                                ...current.manualOverrides,
                                [row.vendorItemId]: event.target.value,
                              },
                            }))
                          }
                          disabled={hasBlockingRun}
                          placeholder={row.computedPrice !== null ? String(row.computedPrice) : ""}
                          style={{ width: 120 }}
                        />
                      </td>
                      <td>
                        <span className={`status-pill ${buildStatusTone(row.displayStatus)}`}>
                          {buildStatusLabel(row.displayStatus)}
                        </span>
                        <div className="muted">
                          Sale {row.currentSaleStatus ?? "-"} {"->"} {row.targetSaleStatus ?? "-"}
                        </div>
                        <div className="muted">
                          Source sold-out {formatSoldOutState(row.sourceSoldOut)}
                        </div>
                      </td>
                      <td>
                        <div>{formatDate(row.displayLastAppliedAt)}</div>
                        <div className="muted">Modified {formatDate(row.lastModifiedAt)}</div>
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

          {runLiveQuery.data ? (
            <div className="feedback">
              <div className="card-header">
                <div>
                  <strong>Live log</strong>
                  <div className="muted">
                    {hasBlockingRun
                      ? "Auto-refreshes every second while a run is active and prioritizes rows that are still moving."
                      : "Shows the latest rows from the selected run."}
                  </div>
                </div>
                <div className="muted">Latest {liveLogRows.length} rows</div>
              </div>

              {liveLogRows.length ? (
                <div className="bulk-price-live-log">
                  {liveLogRows.map((item) => (
                    <div className="bulk-price-live-log-row" key={item.id}>
                      <div className="bulk-price-live-log-body">
                        <div className="bulk-price-live-log-header">
                          <div className="bulk-price-live-log-title">{item.sellerProductName}</div>
                          <span className={`status-pill ${buildStatusTone(item.status)}`}>
                            {item.status}
                          </span>
                        </div>
                        <div className="muted">
                          vendorItemId {item.vendorItemId} / sellerProductId {item.sellerProductId} /
                          matched code {item.matchedCode ?? "-"}
                        </div>
                        <div className="muted">
                          Current {formatNumber(item.currentPrice)} {"->"} target{" "}
                          {formatNumber(item.effectiveTargetPrice)}
                        </div>
                        <div className="bulk-price-live-log-message">
                          {item.messages.length
                            ? item.messages.join(" / ")
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
