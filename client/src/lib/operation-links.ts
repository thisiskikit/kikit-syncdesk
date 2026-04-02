import type { OperationChannel } from "@shared/operations";

export function getOperationLogsHref(channel: OperationChannel, operationId?: string | null) {
  const params = new URLSearchParams({
    tab: "operations",
    channel,
  });

  if (operationId) {
    params.set("logId", operationId);
  }

  return `/operations?${params.toString()}`;
}

export function getBulkPriceRunHref(channel: "naver" | "coupang", runId?: string | null) {
  const pathname = channel === "naver" ? "/naver/bulk-price" : "/coupang/bulk-price";
  const params = new URLSearchParams();

  if (runId) {
    params.set("runId", runId);
  }

  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}
