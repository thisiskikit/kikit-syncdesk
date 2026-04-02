function normalizeStatusValue(status: string | null | undefined) {
  return (status ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

type StatusTone =
  | "live"
  | "stopped"
  | "draft"
  | "review"
  | "rejected"
  | "archived"
  | "stockout"
  | "locked"
  | "attention"
  | "success"
  | "pending"
  | "failed"
  | "";

const STATUS_TONE_RULES: Array<{ tone: StatusTone; patterns: string[] }> = [
  {
    tone: "archived",
    patterns: ["deleted", "delete", "archived", "closed", "종료", "삭제", "폐기"],
  },
  {
    tone: "rejected",
    patterns: [
      "reject",
      "rejection",
      "denied",
      "refusal",
      "prohibition",
      "unadmission",
      "반려",
      "거부",
      "미승인",
      "승인불가",
    ],
  },
  {
    tone: "stopped",
    patterns: [
      "suspended",
      "suspension",
      "stop",
      "stopped",
      "close",
      "offsale",
      "판매중지",
      "판매중단",
      "판매정지",
      "중지",
      "중단",
    ],
  },
  {
    tone: "draft",
    patterns: ["temp", "temporary", "draft", "saved", "임시저장", "작성중"],
  },
  {
    tone: "review",
    patterns: [
      "wait",
      "waiting",
      "request",
      "requested",
      "pending",
      "review",
      "approval",
      "승인대기",
      "심사중",
      "검토중",
      "요청중",
      "접수",
    ],
  },
  {
    tone: "stockout",
    patterns: ["outofstock", "soldout", "품절", "재고없음", "재고부족"],
  },
  {
    tone: "locked",
    patterns: ["locked", "readonly", "수정잠김", "잠김", "편집불가"],
  },
  {
    tone: "live",
    patterns: [
      "onsale",
      "approved",
      "selling",
      "active",
      "live",
      "판매중",
      "승인완료",
      "운영중",
      "노출중",
    ],
  },
  {
    tone: "attention",
    patterns: ["warning", "partial", "partiallysucceeded", "caution", "주의"],
  },
  {
    tone: "success",
    patterns: ["success", "succeeded", "valid"],
  },
  {
    tone: "failed",
    patterns: ["failed", "invalid", "error"],
  },
  {
    tone: "pending",
    patterns: ["running", "processing", "loading"],
  },
];

export function getCoupangStatusClassName(status: string | null | undefined) {
  const normalized = normalizeStatusValue(status);

  if (!normalized) {
    return "";
  }

  for (const rule of STATUS_TONE_RULES) {
    if (rule.patterns.some((pattern) => normalized.includes(pattern))) {
      return rule.tone;
    }
  }

  return "";
}
