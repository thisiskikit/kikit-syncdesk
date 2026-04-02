import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./channel-settings-store", () => ({
  channelSettingsStore: {
    getStore: vi.fn(async () => ({
      id: "store-1",
      channel: "naver",
      storeName: "Test Store",
      credentials: {
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    })),
  },
}));

vi.mock("./naver-auth", () => ({
  issueNaverAccessToken: vi.fn(async () => ({
    accessToken: "test-token",
    expiresIn: 3600,
    tokenType: "Bearer",
  })),
}));

vi.mock("./logs/service", () => ({
  recordExternalRequestEvent: vi.fn(async () => undefined),
}));

import { getOrderDetail } from "./naver-order-service";

describe("getOrderDetail", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("extracts claim labels, contact fields, address, and delivery memo from detail responses", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              order: {
                orderId: "2001",
                orderDate: "2026-03-28T10:00:00+09:00",
                paymentDate: "2026-03-28T10:05:00+09:00",
                ordererName: "홍길동",
                ordererTel: "010-1111-2222",
              },
              productOrder: {
                productOrderId: "3001",
                productName: "테스트 상품",
                optionName: "옵션 A",
                sellerProductCode: "SKU-3001",
                productId: "P-3001",
                quantity: 2,
                remainQuantity: 1,
                paymentAmount: 11900,
                productOrderStatus: "DELIVERING",
                deliveryMethod: "DELIVERY",
                deliveryCompanyCode: "CJGLS",
                deliveryCompanyName: "CJ대한통운",
                trackingNumber: "1234567890",
                dispatchDueDate: "2026-03-30T00:00:00+09:00",
                claimType: "RETURN",
                claimStatus: "RETURN_HOLDBACK",
                claimReason: "단순변심",
                claimDetailReason: "색상이 예상과 다름",
                deliveryMemo: "문 앞에 놓아주세요",
              },
              shippingAddress: {
                name: "김영희",
                tel1: "010-3333-4444",
                baseAddress: "서울특별시 강남구 테헤란로 1",
                detailedAddress: "101동 202호",
                zipCode: "06236",
              },
              delivery: {
                deliveryCompanyCode: "CJGLS",
                deliveryCompanyName: "CJ대한통운",
                trackingNumber: "1234567890",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const result = await getOrderDetail({
      storeId: "store-1",
      productOrderId: "3001",
    });

    expect(result.item).toMatchObject({
      orderId: "2001",
      productOrderId: "3001",
      productName: "테스트 상품",
      optionName: "옵션 A",
      buyerName: "홍길동",
      buyerPhone: "010-1111-2222",
      receiverName: "김영희",
      receiverPhone: "010-3333-4444",
      receiverAddress: "서울특별시 강남구 테헤란로 1 101동 202호",
      receiverPostCode: "06236",
      deliveryMemo: "문 앞에 놓아주세요",
      claimType: "RETURN",
      claimTypeLabel: "반품",
      claimStatus: "RETURN_HOLDBACK",
      claimStatusLabel: "반품 보류",
      claimReason: "단순변심",
      claimDetailReason: "색상이 예상과 다름",
    });
  });
});
