import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  type PlatformFieldSyncChannel,
  type PlatformFieldSyncPreview,
  type PlatformFieldSyncRule,
  type PlatformFieldSyncRuleInput,
  type PlatformFieldSyncRun,
  type PlatformFieldSyncTargetMetadata,
  coupangPlatformFieldSyncSourceFields,
  naverPlatformFieldSyncSourceFields,
} from "@shared/platform-field-sync";
import { SampleRowsDialog } from "@/components/sample-rows-dialog";
import { apiRequestJson, getJson, queryClient, queryPresets } from "@/lib/queryClient";

type StoreSummary = {
  id: string;
  storeName: string;
  channel?: string;
};

type RulesResponse = {
  items: PlatformFieldSyncRule[];
};

type RunsResponse = {
  items: PlatformFieldSyncRun[];
};

type StoresResponse = {
  items: StoreSummary[];
};

const NAVER_SOURCE_FIELD_LABELS: Record<(typeof naverPlatformFieldSyncSourceFields)[number], string> = {
  originProductNo: "originProductNo",
  channelProductNo: "channelProductNo",
  sellerManagementCode: "sellerManagementCode",
  sellerBarcode: "sellerBarcode",
  productName: "productName",
  saleStatusCode: "saleStatusCode",
  saleStatusLabel: "saleStatusLabel",
  displayStatusCode: "displayStatusCode",
  displayStatusLabel: "displayStatusLabel",
};

const COUPANG_SOURCE_FIELD_LABELS: Record<
  (typeof coupangPlatformFieldSyncSourceFields)[number],
  string
> = {
  sellerProductId: "sellerProductId",
  sellerProductName: "sellerProductName",
  vendorItemId: "vendorItemId",
  itemName: "itemName",
  externalVendorSku: "externalVendorSku",
  barcode: "barcode",
  saleStatus: "saleStatus",
  brand: "brand",
  displayCategoryName: "displayCategoryName",
};

const SYNC_MODE_OPTIONS: Array<{
  value: PlatformFieldSyncRuleInput["syncMode"];
  label: string;
  description: string;
}> = [
  {
    value: "append_distinct",
    label: "Append Distinct",
    description: "Insert only new unique values into the selected target column.",
  },
  {
    value: "update_matched",
    label: "Matched Update",
    description: "Find existing rows by a match key and update the target column.",
  },
  {
    value: "upsert_matched",
    label: "Matched Upsert",
    description: "Update matched rows and insert missing match keys as new rows.",
  },
];

const UPDATE_BEHAVIOR_OPTIONS: Array<{
  value: PlatformFieldSyncRuleInput["updateBehavior"];
  label: string;
  description: string;
}> = [
  {
    value: "overwrite",
    label: "Overwrite",
    description: "Replace existing target values when the source value is different.",
  },
  {
    value: "fill_blank_only",
    label: "Fill Blank Only",
    description: "Only fill rows where the target column is null or blank.",
  },
];

const EMPTY_FORM: PlatformFieldSyncRuleInput = {
  name: "",
  channel: "naver",
  storeId: "",
  syncMode: "append_distinct",
  sourceField: "sellerBarcode",
  sourceMatchField: null,
  targetSchema: "",
  targetTable: "",
  targetColumn: "",
  targetMatchColumn: null,
  updateBehavior: "overwrite",
  enabled: true,
  autoRunOnRefresh: false,
};

function buildTableValue(schema: string, table: string) {
  return `${schema}.${table}`;
}

function parseTableValue(value: string) {
  const [schema = "", table = ""] = value.split(".", 2);
  return { schema, table };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ko-KR");
}

function requiresMatchConfig(syncMode: PlatformFieldSyncRuleInput["syncMode"]) {
  return syncMode !== "append_distinct";
}

function buildSourceFieldOptions(channel: PlatformFieldSyncChannel) {
  if (channel === "naver") {
    return naverPlatformFieldSyncSourceFields.map((value) => ({
      value,
      label: NAVER_SOURCE_FIELD_LABELS[value],
    }));
  }

  return coupangPlatformFieldSyncSourceFields.map((value) => ({
    value,
    label: COUPANG_SOURCE_FIELD_LABELS[value],
  }));
}

function toFormState(rule?: PlatformFieldSyncRule | null) {
  if (!rule) {
    return { ...EMPTY_FORM };
  }

  return {
    name: rule.name,
    channel: rule.channel,
    storeId: rule.storeId,
    syncMode: rule.syncMode,
    sourceField: rule.sourceField,
    sourceMatchField: rule.sourceMatchField,
    targetSchema: rule.targetSchema,
    targetTable: rule.targetTable,
    targetColumn: rule.targetColumn,
    targetMatchColumn: rule.targetMatchColumn,
    updateBehavior: rule.updateBehavior,
    enabled: rule.enabled,
    autoRunOnRefresh: rule.autoRunOnRefresh,
  } satisfies PlatformFieldSyncRuleInput;
}

function formatRunSummary(run: PlatformFieldSyncRun) {
  if (run.syncMode === "append_distinct") {
    return `inserted ${run.summary.insertedCount} / existing ${run.summary.existingValueCount} / blanks ${run.summary.blankValueCount} / duplicates ${run.summary.duplicateValueCount}`;
  }

  return `updated ${run.summary.updatedCount} / inserted ${run.summary.insertedCount} / missing matches ${run.summary.missingMatchCount} / unchanged ${run.summary.unchangedCount} / conflicts ${run.summary.conflictingMatchCount}`;
}

export default function FieldSyncPage() {
  const [selectedRuleId, setSelectedRuleId] = useState<string>("new");
  const [form, setForm] = useState<PlatformFieldSyncRuleInput>({ ...EMPTY_FORM });
  const [sampleDialogOpen, setSampleDialogOpen] = useState(false);

  const rulesQuery = useQuery({
    queryKey: ["/api/field-sync/rules"],
    queryFn: () => getJson<RulesResponse>("/api/field-sync/rules"),
    ...queryPresets.reference,
  });

  const runsQuery = useQuery({
    queryKey: ["/api/field-sync/runs", selectedRuleId],
    queryFn: () =>
      getJson<RunsResponse>(
        selectedRuleId === "new"
          ? "/api/field-sync/runs?limit=20"
          : `/api/field-sync/runs?ruleId=${encodeURIComponent(selectedRuleId)}&limit=20`,
      ),
    ...queryPresets.listSnapshot,
  });

  const naverStoresQuery = useQuery({
    queryKey: ["/api/settings/stores"],
    queryFn: () => getJson<StoresResponse>("/api/settings/stores"),
    ...queryPresets.reference,
  });

  const coupangStoresQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<StoresResponse>("/api/coupang/stores"),
    ...queryPresets.reference,
  });

  const tablesQuery = useQuery({
    queryKey: ["/api/field-sync/target-metadata", "tables"],
    queryFn: () => getJson<PlatformFieldSyncTargetMetadata>("/api/field-sync/target-metadata"),
    ...queryPresets.reference,
  });

  const metadataQuery = useQuery({
    queryKey: [
      "/api/field-sync/target-metadata",
      form.syncMode,
      form.targetSchema,
      form.targetTable,
      form.targetColumn,
      form.targetMatchColumn,
    ],
    queryFn: () =>
      getJson<PlatformFieldSyncTargetMetadata>(
        `/api/field-sync/target-metadata?schema=${encodeURIComponent(form.targetSchema)}&table=${encodeURIComponent(form.targetTable)}&syncMode=${encodeURIComponent(form.syncMode)}&targetColumn=${encodeURIComponent(form.targetColumn)}&targetMatchColumn=${encodeURIComponent(form.targetMatchColumn ?? "")}`,
      ),
    enabled: Boolean(form.targetSchema && form.targetTable),
    ...queryPresets.reference,
  });

  const previewQuery = useQuery({
    queryKey: ["/api/field-sync/preview", form],
    queryFn: () =>
      apiRequestJson<PlatformFieldSyncPreview>("POST", "/api/field-sync/preview", form),
    enabled:
      Boolean(form.name.trim()) &&
      Boolean(form.storeId) &&
      Boolean(form.sourceField) &&
      Boolean(form.targetSchema) &&
      Boolean(form.targetTable) &&
      Boolean(form.targetColumn) &&
      (!requiresMatchConfig(form.syncMode) ||
        (Boolean(form.sourceMatchField) && Boolean(form.targetMatchColumn))),
    ...queryPresets.reference,
  });

  const rules = rulesQuery.data?.items ?? [];
  const selectedRule = selectedRuleId === "new"
    ? null
    : rules.find((rule) => rule.id === selectedRuleId) ?? null;

  const naverStores = useMemo(
    () => (naverStoresQuery.data?.items ?? []).filter((store) => store.channel === "naver"),
    [naverStoresQuery.data?.items],
  );
  const coupangStores = coupangStoresQuery.data?.items ?? [];
  const stores = form.channel === "naver" ? naverStores : coupangStores;
  const sourceFieldOptions = useMemo(() => buildSourceFieldOptions(form.channel), [form.channel]);

  useEffect(() => {
    if (selectedRuleId === "new") {
      return;
    }

    if (selectedRule) {
      setForm(toFormState(selectedRule));
      return;
    }

    if (rules[0]) {
      setSelectedRuleId(rules[0].id);
      return;
    }

    setSelectedRuleId("new");
    setForm({ ...EMPTY_FORM });
  }, [rules, selectedRule, selectedRuleId]);

  useEffect(() => {
    if (sourceFieldOptions.some((option) => option.value === form.sourceField)) {
      return;
    }

    setForm((current) => ({
      ...current,
      sourceField: sourceFieldOptions[0]?.value ?? current.sourceField,
    }));
  }, [form.sourceField, sourceFieldOptions]);

  useEffect(() => {
    if (!requiresMatchConfig(form.syncMode)) {
      return;
    }

    if (form.sourceMatchField && sourceFieldOptions.some((option) => option.value === form.sourceMatchField)) {
      return;
    }

    setForm((current) => ({
      ...current,
      sourceMatchField: current.sourceField,
    }));
  }, [form.sourceField, form.sourceMatchField, form.syncMode, sourceFieldOptions]);

  useEffect(() => {
    if (!stores.length) {
      if (form.storeId) {
        setForm((current) => ({ ...current, storeId: "" }));
      }
      return;
    }

    if (stores.some((store) => store.id === form.storeId)) {
      return;
    }

    setForm((current) => ({
      ...current,
      storeId: stores[0]?.id ?? "",
    }));
  }, [form.storeId, stores]);

  const saveMutation = useMutation({
    mutationFn: () =>
      selectedRuleId === "new"
        ? apiRequestJson<PlatformFieldSyncRule>("POST", "/api/field-sync/rules", form)
        : apiRequestJson<PlatformFieldSyncRule>(
            "PUT",
            `/api/field-sync/rules/${encodeURIComponent(selectedRuleId)}`,
            form,
          ),
    onSuccess: async (rule) => {
      setSelectedRuleId(rule.id);
      setForm(toFormState(rule));
      await queryClient.invalidateQueries({ queryKey: ["/api/field-sync/rules"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/field-sync/runs"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<{ id: string; deleted: boolean }>(
        "DELETE",
        `/api/field-sync/rules/${encodeURIComponent(selectedRuleId)}`,
      ),
    onSuccess: async () => {
      setSelectedRuleId("new");
      setForm({ ...EMPTY_FORM });
      await queryClient.invalidateQueries({ queryKey: ["/api/field-sync/rules"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/field-sync/runs"] });
    },
  });

  const runMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<PlatformFieldSyncRun | null>(
        "POST",
        `/api/field-sync/rules/${encodeURIComponent(selectedRuleId)}/run`,
        { refreshSource: true },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/field-sync/runs"] });
    },
  });

  const runEnabledMutation = useMutation({
    mutationFn: () =>
      apiRequestJson<RunsResponse>("POST", "/api/field-sync/run-enabled", {
        refreshSource: true,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/field-sync/runs"] });
    },
  });

  const targetTables = tablesQuery.data?.tables ?? [];
  const targetColumns = metadataQuery.data?.columns ?? [];
  const matchedMode = requiresMatchConfig(form.syncMode);
  const canSave =
    Boolean(form.name.trim()) &&
    Boolean(form.storeId) &&
    Boolean(form.sourceField) &&
    Boolean(form.targetSchema) &&
    Boolean(form.targetTable) &&
    Boolean(form.targetColumn) &&
    (!matchedMode || (Boolean(form.sourceMatchField) && Boolean(form.targetMatchColumn)));
  const recentRuns = runsQuery.data?.items ?? [];
  const enabledRuleCount = rules.filter((rule) => rule.enabled).length;

  return (
    <div className="page">
      <div className="hero">
        <h1>Platform Field Sync</h1>
        <p>
          Collect platform product fields into a target Postgres table with append-only, matched
          update, or matched upsert modes.
        </p>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Rules</div>
          <div className="metric-value">{rules.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Enabled</div>
          <div className="metric-value">{enabledRuleCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Recent Runs</div>
          <div className="metric-value">{recentRuns.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="stack" style={{ gap: "0.35rem", minWidth: 260 }}>
            <strong>Rule</strong>
            <select value={selectedRuleId} onChange={(event) => {
              const nextValue = event.target.value;
              setSelectedRuleId(nextValue);
              setForm(nextValue === "new" ? { ...EMPTY_FORM } : toFormState(rules.find((rule) => rule.id === nextValue) ?? null));
            }}>
              <option value="new">New rule</option>
              {rules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.name} ({rule.channel})
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar">
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setSelectedRuleId("new");
                setForm({ ...EMPTY_FORM });
              }}
            >
              New
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => runEnabledMutation.mutate()}
              disabled={runEnabledMutation.isPending || enabledRuleCount === 0}
            >
              {runEnabledMutation.isPending ? "Running..." : "Run Enabled Rules"}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : selectedRuleId === "new" ? "Create Rule" : "Save Rule"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => runMutation.mutate()}
              disabled={selectedRuleId === "new" || runMutation.isPending}
            >
              {runMutation.isPending ? "Running..." : "Run Now"}
            </button>
            <button
              className="button ghost"
              type="button"
              onClick={() => {
                if (selectedRuleId === "new") {
                  return;
                }

                if (!window.confirm("Delete this field sync rule?")) {
                  return;
                }

                deleteMutation.mutate();
              }}
              disabled={selectedRuleId === "new" || deleteMutation.isPending}
            >
              Delete
            </button>
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Rule name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Example: Naver barcode to master table"
            />
          </label>

          <label className="field">
            <span>Sync mode</span>
            <select
              value={form.syncMode}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  syncMode: event.target.value as PlatformFieldSyncRuleInput["syncMode"],
                }))
              }
            >
              {SYNC_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="muted">
              {SYNC_MODE_OPTIONS.find((option) => option.value === form.syncMode)?.description}
            </div>
          </label>

          <label className="field">
            <span>Channel</span>
            <select
              value={form.channel}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  channel: event.target.value as PlatformFieldSyncChannel,
                }))
              }
            >
              <option value="naver">NAVER</option>
              <option value="coupang">COUPANG</option>
            </select>
          </label>

          <label className="field">
            <span>Store</span>
            <select
              value={form.storeId}
              onChange={(event) => setForm((current) => ({ ...current, storeId: event.target.value }))}
            >
              <option value="">Select a store</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.storeName}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Source field</span>
            <select
              value={form.sourceField}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sourceField: event.target.value as PlatformFieldSyncRuleInput["sourceField"],
                }))
              }
            >
              {sourceFieldOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {matchedMode ? (
            <label className="field">
              <span>Source match field</span>
              <select
                value={form.sourceMatchField ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sourceMatchField: event.target.value
                      ? (event.target.value as PlatformFieldSyncRuleInput["sourceField"])
                      : null,
                  }))
                }
              >
                <option value="">Select a match field</option>
                {sourceFieldOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="field">
            <span>Target table</span>
            <select
              value={form.targetSchema && form.targetTable ? buildTableValue(form.targetSchema, form.targetTable) : ""}
              onChange={(event) => {
                const nextTable = parseTableValue(event.target.value);
                setForm((current) => ({
                  ...current,
                  targetSchema: nextTable.schema,
                  targetTable: nextTable.table,
                  targetColumn: "",
                  targetMatchColumn: null,
                }));
              }}
            >
              <option value="">Select a table</option>
              {targetTables.map((table) => (
                <option
                  key={buildTableValue(table.schema, table.table)}
                  value={buildTableValue(table.schema, table.table)}
                >
                  {table.schema}.{table.table}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Schema</span>
            <input value={form.targetSchema} readOnly />
          </label>

          <label className="field">
            <span>Target column</span>
            <select
              value={form.targetColumn}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  targetColumn: event.target.value,
                }))
              }
            >
              <option value="">Select a column</option>
              {targetColumns.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name} ({column.dataType})
                </option>
              ))}
            </select>
          </label>

          {matchedMode ? (
            <label className="field">
              <span>Target match column</span>
              <select
                value={form.targetMatchColumn ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetMatchColumn: event.target.value || null,
                  }))
                }
              >
                <option value="">Select a match column</option>
                {targetColumns.map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name} ({column.dataType})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {matchedMode ? (
            <label className="field">
              <span>Update behavior</span>
              <select
                value={form.updateBehavior}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    updateBehavior: event.target.value as PlatformFieldSyncRuleInput["updateBehavior"],
                  }))
                }
              >
                {UPDATE_BEHAVIOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="muted">
                {UPDATE_BEHAVIOR_OPTIONS.find((option) => option.value === form.updateBehavior)?.description}
              </div>
            </label>
          ) : null}

          <label className="field">
            <span>Status</span>
            <label className="toolbar" style={{ justifyContent: "flex-start" }}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
              />
              <span>Enabled</span>
            </label>
          </label>

          <label className="field">
            <span>Automation</span>
            <label className="toolbar" style={{ justifyContent: "flex-start" }}>
              <input
                type="checkbox"
                checked={form.autoRunOnRefresh}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    autoRunOnRefresh: event.target.checked,
                  }))
                }
              />
              <span>Auto-run after product refresh</span>
            </label>
          </label>
        </div>

        {saveMutation.error || deleteMutation.error || runMutation.error || runEnabledMutation.error ? (
          <div className="feedback error">
            <strong>Error</strong>
            <div className="muted">
              {(saveMutation.error as Error | null)?.message ||
                (deleteMutation.error as Error | null)?.message ||
                (runMutation.error as Error | null)?.message ||
                (runEnabledMutation.error as Error | null)?.message}
            </div>
          </div>
        ) : null}

        <div className="feedback">
          <strong>Current target</strong>
          <div className="muted">
            {form.targetSchema && form.targetTable
              ? `${form.targetSchema}.${form.targetTable}.${form.targetColumn || "-"}`
              : "Select a target table and column."}
          </div>
          {matchedMode ? (
            <div className="muted">
              Match key: {form.sourceMatchField || "-"} -&gt; {form.targetMatchColumn || "-"}
            </div>
          ) : null}
          <div className="muted">Loaded tables: {targetTables.length}</div>
          {metadataQuery.data && form.targetColumn ? (
            <div className="muted">
              {matchedMode
                ? metadataQuery.data.supportsConfiguredWrite
                  ? form.syncMode === "upsert_matched"
                    ? `This table can update matches and insert missing rows using ${metadataQuery.data.requiredInsertColumns.join(", ")}.`
                    : "This table can run matched updates with the selected columns."
                  : metadataQuery.data.blockingColumns.length > 0
                    ? `This table still requires additional columns for inserts: ${metadataQuery.data.blockingColumns.join(", ")}`
                    : "Select a valid target match column to validate the matched write."
                : metadataQuery.data.supportsConfiguredWrite
                  ? "This table can accept append inserts for the selected target column."
                  : `This table still requires additional columns: ${metadataQuery.data.blockingColumns.join(", ")}`}
            </div>
          ) : (
            <div className="muted">
              {matchedMode
                ? "Select target and match columns to validate the write mode."
                : "Select a target column to validate append safety."}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="stack" style={{ gap: "0.35rem" }}>
            <h3 style={{ margin: 0 }}>Source Preview</h3>
            <div className="muted">
              Preview source values, match keys, and conflicts before saving or running the rule.
            </div>
          </div>
          <div className="muted">{previewQuery.data ? formatDateTime(previewQuery.data.generatedAt) : "-"}</div>
        </div>

        {!previewQuery.isFetched ? (
          <div className="empty">Complete the rule form to generate a source preview.</div>
        ) : previewQuery.isLoading ? (
          <div className="empty">Loading source preview...</div>
        ) : previewQuery.data ? (
          <>
            <div className="metric-grid">
              <div className="metric">
                <div className="metric-label">Source rows</div>
                <div className="metric-value">{previewQuery.data.totalSourceRows}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Unique values</div>
                <div className="metric-value">{previewQuery.data.uniqueValueCount}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Blank values</div>
                <div className="metric-value">{previewQuery.data.blankValueCount}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Duplicates</div>
                <div className="metric-value">{previewQuery.data.duplicateValueCount}</div>
              </div>
              {matchedMode ? (
                <>
                  <div className="metric">
                    <div className="metric-label">Match keys</div>
                    <div className="metric-value">{previewQuery.data.uniqueMatchCount}</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Blank matches</div>
                    <div className="metric-value">{previewQuery.data.blankMatchCount}</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Match duplicates</div>
                    <div className="metric-value">{previewQuery.data.duplicateMatchCount}</div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Conflicts</div>
                    <div className="metric-value">{previewQuery.data.conflictingMatchCount}</div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="guide-grid two">
              {previewQuery.data.sampleValues.length ? (
                <div className="guide-note">
                  <strong>Sample values</strong>
                  <div className="toolbar" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                    {previewQuery.data.sampleValues.map((value) => (
                      <code key={value}>{value}</code>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="guide-note">
                  <strong>No candidate values</strong>
                  <p>The selected source field is currently empty for all discovered rows.</p>
                </div>
              )}

              {matchedMode ? (
                previewQuery.data.sampleMappings.length ? (
                  <div className="guide-note">
                    <strong>Sample mappings</strong>
                    <div className="stack" style={{ gap: "0.35rem" }}>
                      {previewQuery.data.sampleMappings.map((item, index) => (
                        <code key={`${item.matchValue}-${item.targetValue}-${index}`}>
                          {item.matchValue} -&gt; {item.targetValue}
                        </code>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="guide-note">
                    <strong>No match mappings</strong>
                    <p>The current match field does not produce usable key-value pairs yet.</p>
                  </div>
                )
              ) : null}
            </div>
          </>
        ) : (
          <div className="empty">No preview data available.</div>
        )}
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="stack" style={{ gap: "0.35rem" }}>
            <h3 style={{ margin: 0 }}>Target Sample</h3>
            <div className="muted">Inspect the destination table shape before saving the rule.</div>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={() => setSampleDialogOpen(true)}
            disabled={!metadataQuery.data?.sampleRows.length}
          >
            Open Sample Rows
          </button>
        </div>

        {metadataQuery.data?.sampleRows.length ? (
          <div className="table-wrap">
            <table className="table bulk-price-sample-table">
              <thead>
                <tr>
                  <th>#</th>
                  {metadataQuery.data.columns.map((column) => (
                    <th key={column.name}>{column.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metadataQuery.data.sampleRows.map((row) => (
                  <tr key={row.index}>
                    <td>{row.index + 1}</td>
                    {metadataQuery.data?.columns.map((column) => (
                      <td key={column.name}>{String(row.values[column.name] ?? "-")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Select a target table to inspect sample rows.</div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent Runs</h3>
        {recentRuns.length ? (
          <div className="run-list">
            {recentRuns.map((run) => (
              <div key={run.id} className="run-row">
                <div>
                  <strong>{run.ruleName}</strong>
                  <div className="muted">
                    {run.channel} / {run.syncMode} / {run.sourceField} / {run.targetSchema}.{run.targetTable}.{run.targetColumn}
                  </div>
                  {run.sourceMatchField && run.targetMatchColumn ? (
                    <div className="muted">
                      match {run.sourceMatchField} -&gt; {run.targetMatchColumn} / {run.updateBehavior}
                    </div>
                  ) : null}
                  <div className="muted">{formatRunSummary(run)}</div>
                  {run.errorMessage ? <div className="muted">{run.errorMessage}</div> : null}
                </div>
                <div className="stack" style={{ alignItems: "flex-end", gap: "0.35rem" }}>
                  <div className={`status-pill ${run.status}`}>{run.status}</div>
                  <div className="muted">{formatDateTime(run.startedAt)}</div>
                  <div className="muted">{run.triggerMode}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">No field sync runs yet.</div>
        )}
      </div>

      <SampleRowsDialog
        open={sampleDialogOpen}
        title="Target Sample Rows"
        subtitle={
          form.targetSchema && form.targetTable
            ? `${form.targetSchema}.${form.targetTable}`
            : null
        }
        columns={(metadataQuery.data?.columns ?? []).map((column) => ({ name: column.name }))}
        sampleRows={metadataQuery.data?.sampleRows ?? []}
        emptyMessage="No sample rows available."
        onClose={() => setSampleDialogOpen(false)}
      />
    </div>
  );
}
