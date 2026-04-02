import type { CoupangStoreRef } from "@shared/coupang";
import type {
  CoupangCallCenterInquiryRow,
  CoupangCategoryListResponse,
  CoupangCategoryRow,
  CoupangInquiryListResponse,
  CoupangLogisticsCenterListResponse,
  CoupangOutboundCenterRow,
  CoupangProductInquiryRow,
  CoupangReturnCenterRow,
  CoupangRocketGrowthInventoryListResponse,
  CoupangRocketGrowthInventoryRow,
  CoupangRocketGrowthOrderListResponse,
  CoupangRocketGrowthOrderRow,
  CoupangRocketGrowthProductListResponse,
  CoupangRocketGrowthProductRow,
} from "@shared/coupang-support";

const store: CoupangStoreRef = {
  id: "fallback-coupang",
  name: "COUPANG Sample Store",
  vendorId: "A00000000",
};

function nowIso() {
  return new Date().toISOString();
}

function makeCategoryItems(): CoupangCategoryRow[] {
  return [
    {
      id: "194176",
      code: "194176",
      name: "텀블러",
      status: "ACTIVE",
      depth: 3,
      path: "주방용품 > 보틀/텀블러 > 텀블러",
      parentCode: "194100",
      leaf: true,
      childCount: 0,
    },
    {
      id: "194992",
      code: "194992",
      name: "정리 바구니",
      status: "ACTIVE",
      depth: 3,
      path: "생활용품 > 정리/수납 > 정리 바구니",
      parentCode: "194900",
      leaf: true,
      childCount: 0,
    },
    {
      id: "216210",
      code: "216210",
      name: "반려동물 급수기",
      status: "ACTIVE",
      depth: 3,
      path: "반려동물용품 > 급식기/급수기 > 급수기",
      parentCode: "216100",
      leaf: true,
      childCount: 0,
    },
  ];
}

export function getSampleCoupangCategories(
  registrationType: "ALL" | "RFM",
): CoupangCategoryListResponse {
  const items = makeCategoryItems();

  return {
    store,
    items,
    registrationType,
    fetchedAt: nowIso(),
    servedFromFallback: true,
    message: "실시간 카테고리 조회에 실패해 샘플 카테고리 목록을 표시합니다.",
    source: "fallback",
  };
}

export function getSampleCoupangOutboundCenters(): CoupangLogisticsCenterListResponse<CoupangOutboundCenterRow> {
  return {
    store,
    items: [
      {
        id: "OUT-001",
        vendorId: store.vendorId,
        outboundShippingPlaceCode: "SP100001",
        shippingPlaceName: "KIKIT 본사 출고지",
        createDate: "2026/03/10",
        global: false,
        usable: true,
        addressType: "DOMESTIC",
        countryCode: "KR",
        companyContactNumber: "02-1234-5678",
        phoneNumber2: "010-5555-0101",
        zipCode: "05836",
        address: "서울 송파구 올림픽로 100",
        addressDetail: "3층 물류팀",
        note: "실연동 출고지 조회 전까지 readonly 샘플 구조를 유지합니다.",
        placeAddresses: [
          {
            addressType: "JIBUN",
            countryCode: "KR",
            companyContactNumber: "02-1234-5678",
            phoneNumber2: "010-5555-0101",
            returnZipCode: "05836",
            returnAddress: "서울 송파구 올림픽로 100",
            returnAddressDetail: "3층 물류팀",
          },
        ],
        remoteInfos: [
          {
            remoteInfoId: "1001",
            deliveryCode: "CJGLS",
            jeju: 3000,
            notJeju: 2000,
            usable: true,
          },
        ],
      },
    ],
    fetchedAt: nowIso(),
    servedFromFallback: true,
    message: "출고지 목록은 현재 샘플 구조로 제공됩니다. 반품지는 실연동 조회를 우선 지원합니다.",
    source: "fallback",
  };
}

export function getSampleCoupangReturnCenters(): CoupangLogisticsCenterListResponse<CoupangReturnCenterRow> {
  return {
    store,
    items: [
      {
        id: "RET-001",
        vendorId: store.vendorId,
        returnCenterCode: "RC100001",
        shippingPlaceName: "KIKIT 회수센터",
        deliverCode: "CJGLS",
        deliverName: "CJ대한통운",
        goodsflowStatus: "NORMAL",
        errorMessage: null,
        createdAt: "2026-03-10T09:00:00+09:00",
        usable: true,
        companyContactNumber: "02-7777-1111",
        phoneNumber2: "010-7777-1111",
        zipCode: "05836",
        address: "서울 송파구 올림픽로 100",
        addressDetail: "회수센터 1층",
        addressType: "JIBUN",
        countryCode: "KR",
        vendorCreditFee02kg: 3000,
        vendorCreditFee05kg: 3000,
        vendorCreditFee10kg: 4000,
        vendorCreditFee20kg: 5000,
        vendorCashFee02kg: 3000,
        vendorCashFee05kg: 3000,
        vendorCashFee10kg: 4000,
        vendorCashFee20kg: 5000,
        consumerCashFee02kg: 3000,
        consumerCashFee05kg: 3000,
        consumerCashFee10kg: 4000,
        consumerCashFee20kg: 5000,
        returnFee02kg: 3000,
        returnFee05kg: 3000,
        returnFee10kg: 5000,
        returnFee20kg: 6000,
        placeAddresses: [
          {
            addressType: "JIBUN",
            countryCode: "KR",
            companyContactNumber: "02-7777-1111",
            phoneNumber2: "010-7777-1111",
            returnZipCode: "05836",
            returnAddress: "서울 송파구 올림픽로 100",
            returnAddressDetail: "회수센터 1층",
          },
        ],
      },
    ],
    fetchedAt: nowIso(),
    servedFromFallback: true,
    message: "반품지 조회에 실패해 샘플 반품지 정보를 표시합니다.",
    source: "fallback",
  };
}

export function getSampleCoupangProductInquiries(): CoupangInquiryListResponse<CoupangProductInquiryRow> {
  return {
    store,
    items: [
      {
        id: "product-inquiry-1001",
        inquiryId: "1001",
        inquiryType: "product",
        sellerProductId: "30100201234",
        vendorItemId: "7039748123",
        productId: "88011223344",
        productName: "KIKIT 텀블러 500ml / 레드",
        content: "식기세척기 사용 가능한가요?",
        inquiryAt: "2026-03-24T11:10:00+09:00",
        orderIds: [],
        answered: false,
        needsAnswer: true,
        lastAnsweredAt: null,
        replies: [],
      },
      {
        id: "product-inquiry-1002",
        inquiryId: "1002",
        inquiryType: "product",
        sellerProductId: "30100209991",
        vendorItemId: "7039750001",
        productId: "88099887766",
        productName: "프리미엄 수납 바구니 / M",
        content: "손잡이 부분 내구성은 어떤가요?",
        inquiryAt: "2026-03-23T16:40:00+09:00",
        orderIds: ["19000009511538"],
        answered: true,
        needsAnswer: false,
        lastAnsweredAt: "2026-03-23T17:10:00+09:00",
        replies: [
          {
            replyId: "reply-1002-1",
            answerId: "reply-1002-1",
            parentAnswerId: null,
            authorType: "vendor",
            receptionistName: "KIKIT 운영팀",
            receptionistCode: "VENDOR",
            content: "하중 5kg까지 테스트 완료된 제품입니다.",
            repliedAt: "2026-03-23T17:10:00+09:00",
            needAnswer: false,
            partnerTransferStatus: null,
            partnerTransferCompleteReason: null,
          },
        ],
      },
    ],
    pagination: {
      currentPage: 1,
      totalPages: 1,
      totalElements: 2,
      countPerPage: 30,
    },
    fetchedAt: nowIso(),
    servedFromFallback: true,
    message: "상품 문의 조회에 실패해 샘플 문의 목록을 표시합니다.",
    source: "fallback",
  };
}

export function getSampleCoupangCallCenterInquiries(): CoupangInquiryListResponse<CoupangCallCenterInquiryRow> {
  return {
    store,
    items: [
      {
        id: "call-center-2001",
        inquiryId: "2001",
        inquiryType: "callCenter",
        inquiryStatus: "OPEN",
        counselingStatus: "WAITING_VENDOR_REPLY",
        needsAnswer: true,
        productName: "KIKIT 텀블러 500ml / 레드",
        vendorItemIds: ["7039748123"],
        orderId: "19000009511537",
        buyerPhone: "010-4444-2222",
        receiptCategory: "DELIVERY",
        content: "배송 예정일을 확인하고 싶습니다.",
        inquiryAt: "2026-03-24T14:15:00+09:00",
        answeredAt: null,
        replies: [],
      },
      {
        id: "call-center-2002",
        inquiryId: "2002",
        inquiryType: "callCenter",
        inquiryStatus: "CLOSED",
        counselingStatus: "DONE",
        needsAnswer: false,
        productName: "프리미엄 수납 바구니 / L",
        vendorItemIds: ["7039750002"],
        orderId: "19000009511539",
        buyerPhone: "010-1212-3434",
        receiptCategory: "RETURN",
        content: "반품 회수 일정 문의",
        inquiryAt: "2026-03-22T10:00:00+09:00",
        answeredAt: "2026-03-22T12:10:00+09:00",
        replies: [
          {
            replyId: "call-reply-2002-1",
            answerId: "call-reply-2002-1",
            parentAnswerId: null,
            authorType: "csAgent",
            receptionistName: "쿠팡 상담사",
            receptionistCode: "CS",
            content: "회수기사 방문 예정일은 3월 23일입니다.",
            repliedAt: "2026-03-22T12:10:00+09:00",
            needAnswer: false,
            partnerTransferStatus: null,
            partnerTransferCompleteReason: null,
          },
        ],
      },
    ],
    pagination: {
      currentPage: 1,
      totalPages: 1,
      totalElements: 2,
      countPerPage: 30,
    },
    fetchedAt: nowIso(),
    servedFromFallback: true,
    message: "쿠팡 상담 문의 조회에 실패해 샘플 문의 목록을 표시합니다.",
    source: "fallback",
  };
}

export function getSampleCoupangRocketGrowthProducts(): CoupangRocketGrowthProductListResponse {
  const items: CoupangRocketGrowthProductRow[] = [
    {
      sellerProductId: "30100201234",
      sellerProductName: "KIKIT 텀블러 500ml",
      displayCategoryCode: "194176",
      displayCategoryName: "주방용품 > 보틀/텀블러 > 텀블러",
      statusName: "승인완료",
      vendorId: store.vendorId,
      productType: "RFM",
      vendorItemIds: ["7039748123", "7039748124"],
      lastModifiedAt: "2026-03-24T09:30:00+09:00",
    },
    {
      sellerProductId: "30100218888",
      sellerProductName: "KIKIT 수납 트레이 세트",
      displayCategoryCode: "194992",
      displayCategoryName: "생활용품 > 정리/수납 > 정리 바구니",
      statusName: "판매중",
      vendorId: store.vendorId,
      productType: "CGF",
      vendorItemIds: ["7039760101"],
      lastModifiedAt: "2026-03-23T17:05:00+09:00",
    },
  ];

  return {
    store,
    items,
    nextToken: null,
    fetchedAt: nowIso(),
    servedFromFallback: true,
    message: "로켓그로스 상품 조회에 실패해 샘플 상품 목록을 표시합니다.",
    source: "fallback",
  };
}

export function getSampleCoupangRocketGrowthInventory(): CoupangRocketGrowthInventoryListResponse {
  const items: CoupangRocketGrowthInventoryRow[] = [
    {
      id: "rg-inventory-1",
      vendorItemId: "7039748123",
      externalSkuId: "OPT-1001-RED",
      totalOrderableQuantity: 148,
      salesCountLastThirtyDays: 42,
      nextToken: null,
    },
    {
      id: "rg-inventory-2",
      vendorItemId: "7039760101",
      externalSkuId: "TRAY-SET-01",
      totalOrderableQuantity: 63,
      salesCountLastThirtyDays: 18,
      nextToken: null,
    },
  ];

  return {
    store,
    items,
    nextToken: null,
    fetchedAt: nowIso(),
    servedFromFallback: true,
    message: "로켓그로스 재고 조회에 실패해 샘플 재고를 표시합니다.",
    source: "fallback",
  };
}

export function getSampleCoupangRocketGrowthOrders(): CoupangRocketGrowthOrderListResponse {
  const items: CoupangRocketGrowthOrderRow[] = [
    {
      id: "rg-order-70000000000",
      orderId: "70000000000",
      vendorId: store.vendorId,
      paidAt: "2026-03-25T09:30:00+09:00",
      totalSalesQuantity: 3,
      totalSalesAmount: 80500,
      currency: "KRW",
      orderItems: [
        {
          id: "rg-order-70000000000:7039748123",
          vendorItemId: "7039748123",
          productName: "KIKIT 텀블러 500ml / 레드",
          salesQuantity: 1,
          unitSalesPrice: 27800,
          currency: "KRW",
        },
        {
          id: "rg-order-70000000000:7039748124",
          vendorItemId: "7039748124",
          productName: "KIKIT 텀블러 500ml / 블루",
          salesQuantity: 2,
          unitSalesPrice: 26350,
          currency: "KRW",
        },
      ],
    },
    {
      id: "rg-order-70000000001",
      orderId: "70000000001",
      vendorId: store.vendorId,
      paidAt: "2026-03-24T14:15:00+09:00",
      totalSalesQuantity: 2,
      totalSalesAmount: 49800,
      currency: "KRW",
      orderItems: [
        {
          id: "rg-order-70000000001:7039760101",
          vendorItemId: "7039760101",
          productName: "KIKIT 수납 트레이 세트",
          salesQuantity: 2,
          unitSalesPrice: 24900,
          currency: "KRW",
        },
      ],
    },
  ];

  return {
    store,
    items,
    nextToken: null,
    fetchedAt: nowIso(),
    servedFromFallback: true,
    message: "로켓그로스 주문 조회에 실패해 샘플 주문을 표시합니다.",
    source: "fallback",
  };
}
