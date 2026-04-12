import type { OperationChannel } from "@shared/operations";

export function getOperationLogsHref(channel: OperationChannel, operationId?: string | null) {
  const params = new URLSearchParams({
    tab: "operations",
    channel,
  });

  if (operationId) {
    params.set("logId", operationId);
  }

  return `/work-center?${params.toString()}`;
}
