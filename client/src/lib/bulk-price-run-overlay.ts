type BulkPriceConfigEnvelope<TSourceConfig, TRules> = {
  sourceConfig: TSourceConfig;
  rules: TRules;
};

export function hasMatchingBulkPriceRunContext<TSourceConfig, TRules>(
  preview:
    | BulkPriceConfigEnvelope<TSourceConfig, TRules>
    | null
    | undefined,
  run:
    | BulkPriceConfigEnvelope<TSourceConfig, TRules>
    | null
    | undefined,
) {
  if (!preview || !run) {
    return false;
  }

  return (
    JSON.stringify(preview.sourceConfig) === JSON.stringify(run.sourceConfig) &&
    JSON.stringify(preview.rules) === JSON.stringify(run.rules)
  );
}
