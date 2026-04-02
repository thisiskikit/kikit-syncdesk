import { describe, expect, it } from "vitest";

import {
  toNaverClaimStatusLabel,
  toNaverClaimTypeLabel,
  toNaverProductOrderStatusLabel,
} from "./naver-order-labels";

describe("naver order labels", () => {
  it("maps product order statuses to display labels", () => {
    expect(toNaverProductOrderStatusLabel("PAYED")).toBe("결제 완료");
    expect(toNaverProductOrderStatusLabel("delivering")).toBe("배송 중");
    expect(toNaverProductOrderStatusLabel(null)).toBe("-");
  });

  it("maps claim types to display labels", () => {
    expect(toNaverClaimTypeLabel("cancel")).toBe("취소");
    expect(toNaverClaimTypeLabel("RETURN")).toBe("반품");
    expect(toNaverClaimTypeLabel("EXCHANGE")).toBe("교환");
    expect(toNaverClaimTypeLabel("")).toBeNull();
  });

  it("maps claim statuses to display labels", () => {
    expect(toNaverClaimStatusLabel("CANCEL_REQUEST")).toBe("취소 요청");
    expect(toNaverClaimStatusLabel("return_holdback")).toBe("반품 보류");
    expect(toNaverClaimStatusLabel("EXCHANGE_REDELIVERING")).toBe("교환 재배송 중");
    expect(toNaverClaimStatusLabel(undefined)).toBeNull();
  });
});
