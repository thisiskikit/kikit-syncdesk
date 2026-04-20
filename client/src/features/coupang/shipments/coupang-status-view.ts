import type {
  CoupangShipmentIssueFilter,
  CoupangShipmentIssueStage,
  CoupangShipmentPipelineBucket,
  CoupangShipmentPriorityBucket,
  CoupangShipmentShippingStage,
  CoupangShipmentStatusSyncSource,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";
import { buildCoupangShipmentStatusSnapshot } from "@shared/coupang-status";
import { formatCoupangOrderStatusLabel } from "@/lib/coupang-order-status";

const SHIPPING_STAGE_LABELS: Record<CoupangShipmentShippingStage, string> = {
  payment_completed: "결제완료",
  preparing_product: "상품준비중",
  shipping_instruction: "배송지시",
  in_delivery: "배송중",
  delivered: "배송완료",
};

const SHIPPING_STAGE_TONES: Record<CoupangShipmentShippingStage, string> = {
  payment_completed: "pending",
  preparing_product: "pending",
  shipping_instruction: "running",
  in_delivery: "running",
  delivered: "success",
};

const ISSUE_STAGE_LABELS: Record<Exclude<CoupangShipmentIssueStage, "none">, string> = {
  shipment_stop_requested: "출고중지요청",
  shipment_stop_resolved: "출고중지처리완료",
  cancel: "취소",
  return: "반품",
  exchange: "교환",
  cs_open: "CS 진행중",
};

const ISSUE_STAGE_TONES: Record<Exclude<CoupangShipmentIssueStage, "none">, string> = {
  shipment_stop_requested: "failed",
  shipment_stop_resolved: "attention",
  cancel: "failed",
  return: "failed",
  exchange: "attention",
  cs_open: "draft",
};

const PRIORITY_BUCKET_LABELS: Record<CoupangShipmentPriorityBucket, string> = {
  shipment_stop_requested: "출고중지요청",
  same_day_dispatch: "당일출고필요",
  dispatch_delayed: "출고지연",
  long_in_transit: "장기미배송",
};

const PRIORITY_BUCKET_TONES: Record<CoupangShipmentPriorityBucket, string> = {
  shipment_stop_requested: "failed",
  same_day_dispatch: "pending",
  dispatch_delayed: "attention",
  long_in_transit: "attention",
};

const PIPELINE_BUCKET_LABELS: Record<CoupangShipmentPipelineBucket, string> = {
  payment_completed: "결제완료",
  preparing_product: "상품준비중",
  shipping_instruction: "배송지시",
  in_delivery: "배송중",
  delivered: "배송완료",
};

const ISSUE_FILTER_LABELS: Record<CoupangShipmentIssueFilter, string> = {
  all: "전체",
  shipment_stop_requested: "출고중지요청",
  shipment_stop_resolved: "출고중지처리완료",
  cancel: "취소",
  return: "반품",
  exchange: "교환",
  cs_open: "CS 진행중",
  direct_delivery: "업체 직접 배송",
};

const SYNC_SOURCE_LABELS: Record<CoupangShipmentStatusSyncSource, string> = {
  live: "라이브",
  worksheet_cache: "워크시트",
};

function formatDateTimeText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveStatusSnapshot(row: CoupangShipmentWorksheetRow) {
  const snapshot = buildCoupangShipmentStatusSnapshot(row);

  return {
    ...row,
    rawOrderStatus: snapshot.rawOrderStatus ?? row.rawOrderStatus ?? null,
    shippingStage: snapshot.shippingStage,
    issueStage: snapshot.issueStage,
    priorityBucket: snapshot.priorityBucket,
    pipelineBucket: snapshot.pipelineBucket,
    priorityCard: snapshot.priorityBucket,
    pipelineCard: snapshot.pipelineBucket,
    isDirectDelivery: snapshot.isDirectDelivery,
    syncSource: snapshot.syncSource ?? row.syncSource ?? null,
    statusDerivedAt: snapshot.statusDerivedAt ?? row.statusDerivedAt ?? null,
    statusMismatchReason: snapshot.statusMismatchReason ?? row.statusMismatchReason ?? null,
  };
}

export function getShipmentRawOrderLabel(row: CoupangShipmentWorksheetRow) {
  const snapshot = resolveStatusSnapshot(row);
  return formatCoupangOrderStatusLabel(snapshot.rawOrderStatus ?? snapshot.orderStatus);
}

export function getShipmentShippingStageLabel(row: CoupangShipmentWorksheetRow) {
  const snapshot = resolveStatusSnapshot(row);
  return snapshot.shippingStage ? SHIPPING_STAGE_LABELS[snapshot.shippingStage] : "-";
}

export function getShipmentShippingStageTone(row: CoupangShipmentWorksheetRow) {
  const snapshot = resolveStatusSnapshot(row);
  return snapshot.shippingStage ? SHIPPING_STAGE_TONES[snapshot.shippingStage] : "draft";
}

export function getShipmentIssueStageLabel(row: CoupangShipmentWorksheetRow) {
  const snapshot = resolveStatusSnapshot(row);
  if (snapshot.isDirectDelivery && snapshot.issueStage === "none") {
    return "업체 직접 배송";
  }

  return snapshot.issueStage !== "none" ? ISSUE_STAGE_LABELS[snapshot.issueStage] : "이슈 없음";
}

export function getShipmentIssueStageTone(row: CoupangShipmentWorksheetRow) {
  const snapshot = resolveStatusSnapshot(row);
  if (snapshot.isDirectDelivery && snapshot.issueStage === "none") {
    return "attention";
  }

  return snapshot.issueStage !== "none" ? ISSUE_STAGE_TONES[snapshot.issueStage] : "draft";
}

export function getShipmentPriorityCardLabel(
  value: CoupangShipmentPriorityBucket | null | undefined,
) {
  return value ? PRIORITY_BUCKET_LABELS[value] : null;
}

export function getShipmentPriorityCardTone(
  value: CoupangShipmentPriorityBucket | null | undefined,
) {
  return value ? PRIORITY_BUCKET_TONES[value] : "draft";
}

export function getShipmentPipelineCardLabel(
  value: CoupangShipmentPipelineBucket | null | undefined,
) {
  return value ? PIPELINE_BUCKET_LABELS[value] : null;
}

export function getShipmentIssueFilterLabel(value: CoupangShipmentIssueFilter) {
  return ISSUE_FILTER_LABELS[value];
}

export function getShipmentSyncSourceLabel(
  value: CoupangShipmentStatusSyncSource | null | undefined,
) {
  return value ? SYNC_SOURCE_LABELS[value] : "미확인";
}

export function getShipmentLastSyncText(row: CoupangShipmentWorksheetRow) {
  const snapshot = resolveStatusSnapshot(row);
  const formattedDate = formatDateTimeText(snapshot.statusDerivedAt);
  const sourceLabel = getShipmentSyncSourceLabel(snapshot.syncSource);

  if (!formattedDate) {
    return `${sourceLabel} 기준`;
  }

  return `${formattedDate} · ${sourceLabel}`;
}

export function getShipmentNormalizedStatusPresentation(row: CoupangShipmentWorksheetRow) {
  const snapshot = resolveStatusSnapshot(row);
  const issueLabel = getShipmentIssueStageLabel(row);
  const mismatchReason =
    snapshot.statusMismatchReason ??
    (snapshot.isDirectDelivery
      ? "업체 직접 배송은 배송중으로 계산하고 직접 배송 배지로 구분합니다."
      : null);

  return {
    snapshot,
    rawOrderLabel: getShipmentRawOrderLabel(row),
    shippingLabel: getShipmentShippingStageLabel(row),
    shippingTone: getShipmentShippingStageTone(row),
    issueLabel,
    issueTone: getShipmentIssueStageTone(row),
    priorityLabel: getShipmentPriorityCardLabel(snapshot.priorityBucket),
    priorityTone: getShipmentPriorityCardTone(snapshot.priorityBucket),
    lastSyncText: getShipmentLastSyncText(row),
    mismatchReason,
    syncSourceLabel: getShipmentSyncSourceLabel(snapshot.syncSource),
  };
}
