import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import type {
  CoupangBatchActionResponse,
  CoupangProductAttributeInput,
  CoupangProductContentGroupInput,
  CoupangProductDetail,
  CoupangProductDetailResponse,
  CoupangProductEditItemInput,
  CoupangProductFullEditPayload,
  CoupangProductImageInput,
  CoupangProductMutationResponse,
  CoupangProductNoticeInput,
  CoupangProductPartialEditPayload,
  CoupangProductPriceUpdateTarget,
  CoupangProductQuantityUpdateTarget,
  CoupangProductSaleStatusUpdateTarget,
  CoupangStoreSummary,
} from "@shared/coupang";
import { CoupangProductPreview } from "@/components/coupang-product-preview";
import {
  AttributeListEditor,
  ContentGroupEditor,
  ImageListEditor,
  NoticeListEditor,
} from "@/components/coupang-product-form-editors";
import { CollapsibleSection } from "@/components/collapsible-section";
import { OperationPageSettings } from "@/components/operation-page-settings";
import { useOperations } from "@/components/operation-provider";
import { getCoupangStatusClassName } from "@/lib/coupang-status";
import { apiRequestJson, getJson, queryClient } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate, formatNumber } from "@/lib/utils";

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

type FeedbackState =
  | {
      type: "success" | "error" | "warning";
      title: string;
      message: string;
    }
  | null;

type EditorItemState = {
  sellerProductItemId: string;
  vendorItemId: string;
  itemId: string;
  itemName: string;
  offerCondition: string;
  offerDescription: string;
  originalPrice: string;
  salePrice: string;
  maximumBuyCount: string;
  maximumBuyForPerson: string;
  maximumBuyForPersonPeriod: string;
  outboundShippingTimeDay: string;
  unitCount: string;
  adultOnly: string;
  taxType: string;
  parallelImported: string;
  overseasPurchased: string;
  externalVendorSku: string;
  barcode: string;
  emptyBarcode: boolean;
  emptyBarcodeReason: string;
  modelNo: string;
  saleAgentCommission: string;
  pccNeeded: boolean;
  saleStatus: "ONSALE" | "SUSPENDED";
  inventoryCount: string;
  images: CoupangProductImageInput[];
  notices: CoupangProductNoticeInput[];
  attributes: CoupangProductAttributeInput[];
  contents: CoupangProductContentGroupInput[];
  rawData: Record<string, unknown> | null;
};

type EditorState = {
  requestApproval: boolean;
  sellerProductName: string;
  displayCategoryCode: string;
  displayProductName: string;
  brand: string;
  generalProductName: string;
  productGroup: string;
  manufacture: string;
  saleStartedAt: string;
  saleEndedAt: string;
  deliveryMethod: string;
  deliveryCompanyCode: string;
  deliveryChargeType: string;
  deliveryCharge: string;
  freeShipOverAmount: string;
  deliveryChargeOnReturn: string;
  deliverySurcharge: string;
  outboundShippingTimeDay: string;
  remoteAreaDeliverable: string;
  unionDeliveryType: string;
  returnCenterCode: string;
  returnChargeName: string;
  companyContactNumber: string;
  returnZipCode: string;
  returnAddress: string;
  returnAddressDetail: string;
  returnCharge: string;
  outboundShippingPlaceCode: string;
  vendorUserId: string;
  extraInfoMessage: string;
  searchTagsText: string;
  images: CoupangProductImageInput[];
  notices: CoupangProductNoticeInput[];
  contents: CoupangProductContentGroupInput[];
  items: EditorItemState[];
  rawData: Record<string, unknown> | null;
};

type FeaturedFieldKey =
  | "requestApproval"
  | "sellerProductName"
  | "displayCategoryCode"
  | "displayProductName"
  | "brand"
  | "generalProductName"
  | "productGroup"
  | "manufacture"
  | "saleStartedAt"
  | "saleEndedAt"
  | "deliveryMethod"
  | "deliveryCompanyCode"
  | "deliveryChargeType"
  | "deliveryCharge"
  | "freeShipOverAmount"
  | "deliveryChargeOnReturn"
  | "deliverySurcharge"
  | "outboundShippingTimeDay"
  | "remoteAreaDeliverable"
  | "unionDeliveryType"
  | "returnCenterCode"
  | "returnChargeName"
  | "companyContactNumber"
  | "returnZipCode"
  | "returnAddress"
  | "returnAddressDetail"
  | "returnCharge"
  | "outboundShippingPlaceCode"
  | "vendorUserId"
  | "extraInfoMessage"
  | "searchTagsText";

type FeaturedEditableStringKey = Exclude<FeaturedFieldKey, "requestApproval">;

type ProductEditViewState = {
  featuredFieldKeys: FeaturedFieldKey[];
};

type ProductEditSectionState = {
  featuredOpen: boolean;
  basicInfoOpen: boolean;
  deliveryOpen: boolean;
  optionsOpen: boolean;
};

type FeaturedFieldDefinition = {
  key: FeaturedFieldKey;
  label: string;
  section: "기본정보" | "배송/반품" | "부가정보";
  description: string;
  control?: "text" | "number" | "textarea" | "boolean";
  fullWidth?: boolean;
  rows?: number;
  placeholder?: string;
};

const FEATURED_FIELD_DEFINITIONS: FeaturedFieldDefinition[] = [
  {
    key: "requestApproval",
    label: "승인 요청",
    section: "기본정보",
    description: "전체 수정 저장 시 승인 요청 여부",
    control: "boolean",
  },
  {
    key: "sellerProductName",
    label: "상품명",
    section: "기본정보",
    description: "판매자 상품명",
  },
  {
    key: "displayProductName",
    label: "대표 상품명",
    section: "기본정보",
    description: "노출되는 대표 상품명",
  },
  {
    key: "generalProductName",
    label: "일반 상품명",
    section: "기본정보",
    description: "일반 상품명 텍스트",
  },
  {
    key: "brand",
    label: "브랜드",
    section: "기본정보",
    description: "브랜드명",
  },
  {
    key: "manufacture",
    label: "제조사",
    section: "기본정보",
    description: "제조사 정보",
  },
  {
    key: "displayCategoryCode",
    label: "카테고리 코드",
    section: "기본정보",
    description: "전시 카테고리 코드",
  },
  {
    key: "productGroup",
    label: "상품 그룹",
    section: "기본정보",
    description: "상품 그룹 값",
  },
  {
    key: "vendorUserId",
    label: "vendorUserId",
    section: "기본정보",
    description: "쿠팡 벤더 사용자 ID",
  },
  {
    key: "saleStartedAt",
    label: "판매 시작일",
    section: "기본정보",
    description: "판매 시작 시각",
    placeholder: "2026-03-25T09:00:00+09:00",
  },
  {
    key: "saleEndedAt",
    label: "판매 종료일",
    section: "기본정보",
    description: "판매 종료 시각",
    placeholder: "2026-03-31T23:59:59+09:00",
  },
  {
    key: "deliveryMethod",
    label: "배송방식",
    section: "배송/반품",
    description: "배송 방식 코드",
  },
  {
    key: "deliveryCompanyCode",
    label: "택배사 코드",
    section: "배송/반품",
    description: "택배사 코드 값",
  },
  {
    key: "deliveryChargeType",
    label: "배송비 타입",
    section: "배송/반품",
    description: "배송비 정책 타입",
  },
  {
    key: "deliveryCharge",
    label: "배송비",
    section: "배송/반품",
    description: "기본 배송비",
    control: "number",
  },
  {
    key: "freeShipOverAmount",
    label: "무료배송 기준금액",
    section: "배송/반품",
    description: "무료배송 전환 금액",
    control: "number",
  },
  {
    key: "deliveryChargeOnReturn",
    label: "반품 배송비",
    section: "배송/반품",
    description: "반품 시 배송비",
    control: "number",
  },
  {
    key: "deliverySurcharge",
    label: "추가 배송비",
    section: "배송/반품",
    description: "도서산간 등 추가 배송비",
    control: "number",
  },
  {
    key: "outboundShippingTimeDay",
    label: "출고 소요일",
    section: "배송/반품",
    description: "출고까지 걸리는 일수",
    control: "number",
  },
  {
    key: "outboundShippingPlaceCode",
    label: "출고지 코드",
    section: "배송/반품",
    description: "출고지 코드 값",
  },
  {
    key: "remoteAreaDeliverable",
    label: "원거리 배송 가능",
    section: "배송/반품",
    description: "원거리 배송 가능 여부",
  },
  {
    key: "unionDeliveryType",
    label: "묶음배송 타입",
    section: "배송/반품",
    description: "묶음배송 타입",
  },
  {
    key: "returnCenterCode",
    label: "반품센터 코드",
    section: "배송/반품",
    description: "반품센터 코드",
  },
  {
    key: "returnChargeName",
    label: "반품비 명칭",
    section: "배송/반품",
    description: "반품비 표시 명칭",
  },
  {
    key: "companyContactNumber",
    label: "고객 연락처",
    section: "배송/반품",
    description: "고객센터 연락처",
  },
  {
    key: "returnZipCode",
    label: "우편번호",
    section: "배송/반품",
    description: "반품지 우편번호",
  },
  {
    key: "returnCharge",
    label: "반품비",
    section: "배송/반품",
    description: "반품비 금액",
    control: "number",
  },
  {
    key: "returnAddress",
    label: "반품 주소",
    section: "배송/반품",
    description: "반품지 주소",
    fullWidth: true,
  },
  {
    key: "returnAddressDetail",
    label: "반품 상세 주소",
    section: "배송/반품",
    description: "반품지 상세 주소",
    fullWidth: true,
  },
  {
    key: "searchTagsText",
    label: "검색 태그",
    section: "부가정보",
    description: "쉼표로 구분한 검색 태그",
    fullWidth: true,
    placeholder: "태그1, 태그2",
  },
  {
    key: "extraInfoMessage",
    label: "추가 안내",
    section: "부가정보",
    description: "배송/반품 추가 안내 문구",
    control: "textarea",
    rows: 4,
    fullWidth: true,
  },
];

const FEATURED_FIELD_SECTIONS = ["기본정보", "배송/반품", "부가정보"] as const;
const FEATURED_FIELD_DEFINITION_MAP = new Map(
  FEATURED_FIELD_DEFINITIONS.map((definition) => [definition.key, definition]),
);
const FEATURED_FIELD_KEY_SET = new Set<FeaturedFieldKey>(
  FEATURED_FIELD_DEFINITIONS.map((definition) => definition.key),
);
const DEFAULT_FEATURED_FIELD_KEYS: FeaturedFieldKey[] = [
  "sellerProductName",
  "displayProductName",
  "brand",
  "displayCategoryCode",
  "deliveryCharge",
  "saleStartedAt",
  "saleEndedAt",
];
const DEFAULT_PRODUCT_EDIT_VIEW_STATE: ProductEditViewState = {
  featuredFieldKeys: [...DEFAULT_FEATURED_FIELD_KEYS],
};

const DEFAULT_PRODUCT_EDIT_SECTION_STATE: ProductEditSectionState = {
  featuredOpen: true,
  basicInfoOpen: true,
  deliveryOpen: false,
  optionsOpen: true,
};

function textValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function parseNumberOrNull(value: string, fieldName: string, allowNegative = false) {
  const normalized = value.replaceAll(",", "").trim();
  if (!normalized) {
    return null;
  }
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`${fieldName}은 숫자로 입력해 주세요.`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName}은 숫자로 입력해 주세요.`);
  }
  if (!allowNegative && parsed < 0) {
    throw new Error(`${fieldName}은 0 이상이어야 합니다.`);
  }
  return parsed;
}

function toImageInputs(
  items: Array<{ imageOrder: number; imageType: string | null; cdnPath?: string | null; vendorPath?: string | null }>,
): CoupangProductImageInput[] {
  return items.map((item) => ({
    imageOrder: item.imageOrder,
    imageType: item.imageType,
    cdnPath: item.cdnPath ?? "",
    vendorPath: item.vendorPath ?? "",
  }));
}

function toNoticeInputs(
  items: Array<{
    noticeCategoryName?: string | null;
    noticeCategoryDetailName?: string | null;
    content?: string | null;
  }>,
): CoupangProductNoticeInput[] {
  return items.map((item) => ({
    noticeCategoryName: item.noticeCategoryName ?? "",
    noticeCategoryDetailName: item.noticeCategoryDetailName ?? "",
    content: item.content ?? "",
  }));
}

function toAttributeInputs(
  items: Array<{
    attributeTypeName?: string | null;
    attributeValueName?: string | null;
    exposed?: string | null;
    editable?: boolean | null;
  }>,
): CoupangProductAttributeInput[] {
  return items.map((item) => ({
    attributeTypeName: item.attributeTypeName ?? "",
    attributeValueName: item.attributeValueName ?? "",
    exposed: item.exposed ?? "EXPOSED",
    editable: item.editable ?? true,
  }));
}

function toContentInputs(
  items: Array<{
    contentsType?: string | null;
    contentDetails: Array<{ detailType?: string | null; content?: string | null }>;
  }>,
): CoupangProductContentGroupInput[] {
  return items.map((item) => ({
    contentsType: item.contentsType ?? "HTML",
    contentDetails: item.contentDetails.map((detail) => ({
      detailType: detail.detailType ?? "TEXT",
      content: detail.content ?? "",
    })),
  }));
}

function buildEditorState(detail: CoupangProductDetail): EditorState {
  return {
    requestApproval: true,
    sellerProductName: detail.sellerProductName,
    displayCategoryCode: textValue(detail.displayCategoryCode),
    displayProductName: textValue(detail.displayProductName),
    brand: textValue(detail.brand),
    generalProductName: textValue(detail.generalProductName),
    productGroup: textValue(detail.productGroup),
    manufacture: textValue(detail.manufacture),
    saleStartedAt: textValue(detail.saleStartedAt),
    saleEndedAt: textValue(detail.saleEndedAt),
    deliveryMethod: textValue(detail.deliveryInfo.deliveryMethod),
    deliveryCompanyCode: textValue(detail.deliveryInfo.deliveryCompanyCode),
    deliveryChargeType: textValue(detail.deliveryInfo.deliveryChargeType),
    deliveryCharge: textValue(detail.deliveryInfo.deliveryCharge),
    freeShipOverAmount: textValue(detail.deliveryInfo.freeShipOverAmount),
    deliveryChargeOnReturn: textValue(detail.deliveryInfo.deliveryChargeOnReturn),
    deliverySurcharge: textValue(detail.deliveryInfo.deliverySurcharge),
    outboundShippingTimeDay: textValue(detail.deliveryInfo.outboundShippingTimeDay),
    remoteAreaDeliverable: textValue(detail.deliveryInfo.remoteAreaDeliverable),
    unionDeliveryType: textValue(detail.deliveryInfo.unionDeliveryType),
    returnCenterCode: textValue(detail.deliveryInfo.returnCenterCode),
    returnChargeName: textValue(detail.deliveryInfo.returnChargeName),
    companyContactNumber: textValue(detail.deliveryInfo.companyContactNumber),
    returnZipCode: textValue(detail.deliveryInfo.returnZipCode),
    returnAddress: textValue(detail.deliveryInfo.returnAddress),
    returnAddressDetail: textValue(detail.deliveryInfo.returnAddressDetail),
    returnCharge: textValue(detail.deliveryInfo.returnCharge),
    outboundShippingPlaceCode: textValue(detail.deliveryInfo.outboundShippingPlaceCode),
    vendorUserId: textValue(detail.vendorUserId),
    extraInfoMessage: textValue(detail.deliveryInfo.extraInfoMessage),
    searchTagsText: detail.searchTags.join(", "),
    images: toImageInputs(detail.images),
    notices: toNoticeInputs(detail.notices),
    contents: toContentInputs(detail.contents),
    items: detail.items.map((item) => ({
      sellerProductItemId: textValue(item.sellerProductItemId),
      vendorItemId: textValue(item.vendorItemId),
      itemId: textValue(item.itemId),
      itemName: item.itemName,
      offerCondition: textValue(item.offerCondition),
      offerDescription: textValue(item.offerDescription),
      originalPrice: textValue(item.originalPrice),
      salePrice: textValue(item.salePrice),
      maximumBuyCount: textValue(item.maximumBuyCount),
      maximumBuyForPerson: textValue(item.maximumBuyForPerson),
      maximumBuyForPersonPeriod: textValue(item.maximumBuyForPersonPeriod),
      outboundShippingTimeDay: textValue(item.outboundShippingTimeDay),
      unitCount: textValue(item.unitCount),
      adultOnly: textValue(item.adultOnly),
      taxType: textValue(item.taxType),
      parallelImported: textValue(item.parallelImported),
      overseasPurchased: textValue(item.overseasPurchased),
      externalVendorSku: textValue(item.externalVendorSku),
      barcode: textValue(item.barcode),
      emptyBarcode: item.emptyBarcode ?? false,
      emptyBarcodeReason: textValue(item.emptyBarcodeReason),
      modelNo: textValue(item.modelNo),
      saleAgentCommission: textValue(item.saleAgentCommission),
      pccNeeded: item.pccNeeded ?? false,
      saleStatus: item.saleStatus === "SUSPENDED" ? "SUSPENDED" : "ONSALE",
      inventoryCount: textValue(item.inventoryCount),
      images: toImageInputs(item.images),
      notices: toNoticeInputs(item.notices),
      attributes: toAttributeInputs(item.attributes),
      contents: toContentInputs(item.contents),
      rawData: item.rawData,
    })),
    rawData: detail.rawData,
  };
}

function buildDraftPreviewHtml(contents: CoupangProductContentGroupInput[]) {
  const htmlBlocks = contents
    .flatMap((group) => group.contentDetails)
    .map((detail) => detail.content?.trim() ?? "")
    .filter(Boolean);

  return htmlBlocks.length ? htmlBlocks.join("\n") : null;
}

function collectDraftImages(images: CoupangProductImageInput[]) {
  return images
    .flatMap((image) => [image.cdnPath, image.vendorPath])
    .filter((value): value is string => Boolean(value));
}

function buildPartialPayload(
  storeId: string,
  sellerProductId: string,
  form: EditorState,
): CoupangProductPartialEditPayload {
  return {
    storeId,
    sellerProductId,
    companyContactNumber: form.companyContactNumber || null,
    deliveryCharge: parseNumberOrNull(form.deliveryCharge, "배송비"),
    deliveryChargeOnReturn: parseNumberOrNull(form.deliveryChargeOnReturn, "반품 배송비"),
    deliveryChargeType: form.deliveryChargeType || null,
    deliveryCompanyCode: form.deliveryCompanyCode || null,
    deliveryMethod: form.deliveryMethod || null,
    extraInfoMessage: form.extraInfoMessage || null,
    freeShipOverAmount: parseNumberOrNull(form.freeShipOverAmount, "무료배송 기준금액"),
    outboundShippingPlaceCode: form.outboundShippingPlaceCode || null,
    outboundShippingTimeDay: parseNumberOrNull(form.outboundShippingTimeDay, "출고 소요일", false),
    pccNeeded: false,
    remoteAreaDeliverable: form.remoteAreaDeliverable || null,
    returnAddress: form.returnAddress || null,
    returnAddressDetail: form.returnAddressDetail || null,
    returnCenterCode: form.returnCenterCode || null,
    returnCharge: parseNumberOrNull(form.returnCharge, "반품비"),
    returnChargeName: form.returnChargeName || null,
    returnZipCode: form.returnZipCode || null,
    unionDeliveryType: form.unionDeliveryType || null,
  };
}

function buildFullPayload(
  storeId: string,
  sellerProductId: string,
  form: EditorState,
): CoupangProductFullEditPayload {
  const items: CoupangProductEditItemInput[] = form.items.map((item) => ({
    sellerProductItemId: item.sellerProductItemId || null,
    vendorItemId: item.vendorItemId || null,
    itemId: item.itemId || null,
    itemName: item.itemName,
    offerCondition: item.offerCondition || null,
    offerDescription: item.offerDescription || null,
    originalPrice: parseNumberOrNull(item.originalPrice, `${item.itemName} 정상가`),
    salePrice: parseNumberOrNull(item.salePrice, `${item.itemName} 판매가`),
    maximumBuyCount: parseNumberOrNull(item.maximumBuyCount, `${item.itemName} 최대구매수량`),
    maximumBuyForPerson: parseNumberOrNull(item.maximumBuyForPerson, `${item.itemName} 인당 최대구매수량`),
    maximumBuyForPersonPeriod: parseNumberOrNull(
      item.maximumBuyForPersonPeriod,
      `${item.itemName} 인당 최대구매 기간`,
    ),
    outboundShippingTimeDay: parseNumberOrNull(item.outboundShippingTimeDay, `${item.itemName} 출고 소요일`),
    unitCount: parseNumberOrNull(item.unitCount, `${item.itemName} 단위 수량`),
    adultOnly: item.adultOnly || null,
    taxType: item.taxType || null,
    parallelImported: item.parallelImported || null,
    overseasPurchased: item.overseasPurchased || null,
    externalVendorSku: item.externalVendorSku || null,
    barcode: item.barcode || null,
    emptyBarcode: item.emptyBarcode,
    emptyBarcodeReason: item.emptyBarcodeReason || null,
    modelNo: item.modelNo || null,
    saleAgentCommission: parseNumberOrNull(item.saleAgentCommission, `${item.itemName} 수수료`),
    pccNeeded: item.pccNeeded,
    images: item.images,
    notices: item.notices,
    attributes: item.attributes,
    contents: item.contents,
    rawData: item.rawData,
  }));

  return {
    storeId,
    sellerProductId,
    requestApproval: form.requestApproval,
    sellerProductName: form.sellerProductName || null,
    displayCategoryCode: form.displayCategoryCode || null,
    displayProductName: form.displayProductName || null,
    brand: form.brand || null,
    generalProductName: form.generalProductName || null,
    productGroup: form.productGroup || null,
    manufacture: form.manufacture || null,
    saleStartedAt: form.saleStartedAt || null,
    saleEndedAt: form.saleEndedAt || null,
    deliveryMethod: form.deliveryMethod || null,
    deliveryCompanyCode: form.deliveryCompanyCode || null,
    deliveryChargeType: form.deliveryChargeType || null,
    deliveryCharge: parseNumberOrNull(form.deliveryCharge, "배송비"),
    freeShipOverAmount: parseNumberOrNull(form.freeShipOverAmount, "무료배송 기준금액"),
    deliveryChargeOnReturn: parseNumberOrNull(form.deliveryChargeOnReturn, "반품 배송비"),
    deliverySurcharge: parseNumberOrNull(form.deliverySurcharge, "도서산간 추가배송비"),
    remoteAreaDeliverable: form.remoteAreaDeliverable || null,
    unionDeliveryType: form.unionDeliveryType || null,
    returnCenterCode: form.returnCenterCode || null,
    returnChargeName: form.returnChargeName || null,
    companyContactNumber: form.companyContactNumber || null,
    returnZipCode: form.returnZipCode || null,
    returnAddress: form.returnAddress || null,
    returnAddressDetail: form.returnAddressDetail || null,
    returnCharge: parseNumberOrNull(form.returnCharge, "반품비"),
    outboundShippingPlaceCode: form.outboundShippingPlaceCode || null,
    vendorUserId: form.vendorUserId || null,
    extraInfoMessage: form.extraInfoMessage || null,
    searchTags: form.searchTagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    images: form.images,
    notices: form.notices,
    contents: form.contents,
    items,
    rawData: form.rawData,
  };
}

function buildPriceTargets(sellerProductId: string, items: EditorItemState[]): CoupangProductPriceUpdateTarget[] {
  return items
    .filter((item) => item.vendorItemId)
    .map((item) => {
      const price = parseNumberOrNull(item.salePrice, `${item.itemName} 판매가`);
      if (price === null || price <= 0) {
        throw new Error(`${item.itemName} 판매가는 0보다 커야 합니다.`);
      }
      return {
        sellerProductId,
        vendorItemId: item.vendorItemId,
        price,
        itemName: item.itemName,
      };
    });
}

function buildQuantityTargets(
  sellerProductId: string,
  items: EditorItemState[],
): CoupangProductQuantityUpdateTarget[] {
  return items
    .filter((item) => item.vendorItemId)
    .map((item) => {
      const quantity = parseNumberOrNull(item.inventoryCount, `${item.itemName} 재고`);
      if (quantity === null || quantity < 0) {
        throw new Error(`${item.itemName} 재고는 0 이상이어야 합니다.`);
      }
      return {
        sellerProductId,
        vendorItemId: item.vendorItemId,
        quantity,
        itemName: item.itemName,
      };
    });
}

function buildSaleStatusTargets(
  sellerProductId: string,
  items: EditorItemState[],
): CoupangProductSaleStatusUpdateTarget[] {
  return items
    .filter((item) => item.vendorItemId)
    .map((item) => ({
      sellerProductId,
      vendorItemId: item.vendorItemId,
      saleStatus: item.saleStatus,
      itemName: item.itemName,
    }));
}

function buildJoinedIdText(
  values: Array<{ label: string; value: string | null | undefined }>,
) {
  const parts = values
    .filter((entry) => entry.value)
    .map((entry) => `${entry.label} ${entry.value}`);

  return parts.length ? parts.join(" / ") : "-";
}

function sanitizeFeaturedFieldKeys(value: unknown) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_FEATURED_FIELD_KEYS];
  }

  const nextKeys: FeaturedFieldKey[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const key = entry as FeaturedFieldKey;
    if (!FEATURED_FIELD_KEY_SET.has(key) || nextKeys.includes(key)) {
      continue;
    }

    nextKeys.push(key);
  }

  return nextKeys;
}

function FeaturedEditorField(props: {
  definition: FeaturedFieldDefinition;
  form: EditorState;
  onChange: (updater: (current: EditorState) => EditorState) => void;
}) {
  const { definition, form, onChange } = props;
  const style = definition.fullWidth ? { gridColumn: "1 / -1" } : undefined;

  if (definition.key === "requestApproval") {
    return (
      <label className="field" style={style}>
        <span>{definition.label}</span>
        <select
          value={form.requestApproval ? "true" : "false"}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              requestApproval: event.target.value === "true",
            }))
          }
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
    );
  }

  const key = definition.key as FeaturedEditableStringKey;
  const value = form[key];

  if (definition.control === "textarea") {
    return (
      <label className="field" style={style}>
        <span>{definition.label}</span>
        <textarea
          rows={definition.rows ?? 4}
          value={value}
          placeholder={definition.placeholder}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              [key]: event.target.value,
            }))
          }
        />
      </label>
    );
  }

  return (
    <label className="field" style={style}>
      <span>{definition.label}</span>
      <input
        inputMode={definition.control === "number" ? "numeric" : undefined}
        value={value}
        placeholder={definition.placeholder}
        onChange={(event) =>
          onChange((current) => ({
            ...current,
            [key]: event.target.value,
          }))
        }
      />
    </label>
  );
}

function EditorItemCard(props: {
  item: EditorItemState;
  index: number;
  onChange: (nextItem: EditorItemState) => void;
}) {
  const item = props.item;

  return (
    <div className="editor-option-card">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <div className="stack" style={{ gap: "0.2rem" }}>
          <strong>{item.itemName || `옵션 ${props.index + 1}`}</strong>
          <div className="muted">
            {buildJoinedIdText([
              { label: "vendorItemId", value: item.vendorItemId },
              { label: "sellerProductItemId", value: item.sellerProductItemId },
              { label: "itemId", value: item.itemId },
            ])}
          </div>
        </div>
        <span className={`status-pill ${getCoupangStatusClassName(item.saleStatus)}`}>
          {item.saleStatus}
        </span>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>vendorItemId</span>
          <input value={item.vendorItemId} readOnly />
        </label>
        <label className="field">
          <span>sellerProductItemId</span>
          <input value={item.sellerProductItemId} readOnly />
        </label>
        <label className="field">
          <span>itemId</span>
          <input value={item.itemId} readOnly />
        </label>
        <label className="field">
          <span>옵션명</span>
          <input value={item.itemName} onChange={(event) => props.onChange({ ...item, itemName: event.target.value })} />
        </label>
        <label className="field">
          <span>외부 SKU</span>
          <input
            value={item.externalVendorSku}
            onChange={(event) => props.onChange({ ...item, externalVendorSku: event.target.value })}
          />
        </label>
        <label className="field">
          <span>정상가</span>
          <input
            inputMode="numeric"
            value={item.originalPrice}
            onChange={(event) => props.onChange({ ...item, originalPrice: event.target.value })}
          />
        </label>
        <label className="field">
          <span>판매가</span>
          <input
            inputMode="numeric"
            value={item.salePrice}
            onChange={(event) => props.onChange({ ...item, salePrice: event.target.value })}
          />
        </label>
        <label className="field">
          <span>재고</span>
          <input
            inputMode="numeric"
            value={item.inventoryCount}
            onChange={(event) => props.onChange({ ...item, inventoryCount: event.target.value })}
          />
        </label>
        <label className="field">
          <span>판매상태</span>
          <select
            value={item.saleStatus}
            onChange={(event) =>
              props.onChange({
                ...item,
                saleStatus: event.target.value === "SUSPENDED" ? "SUSPENDED" : "ONSALE",
              })
            }
          >
            <option value="ONSALE">ONSALE</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </label>
        <label className="field">
          <span>모델번호</span>
          <input value={item.modelNo} onChange={(event) => props.onChange({ ...item, modelNo: event.target.value })} />
        </label>
        <label className="field">
          <span>바코드</span>
          <input value={item.barcode} onChange={(event) => props.onChange({ ...item, barcode: event.target.value })} />
        </label>
        <label className="field">
          <span>세금 타입</span>
          <input value={item.taxType} onChange={(event) => props.onChange({ ...item, taxType: event.target.value })} />
        </label>
        <label className="field">
          <span>성인용 여부</span>
          <input value={item.adultOnly} onChange={(event) => props.onChange({ ...item, adultOnly: event.target.value })} />
        </label>
        <label className="field">
          <span>단위 수량</span>
          <input
            inputMode="numeric"
            value={item.unitCount}
            onChange={(event) => props.onChange({ ...item, unitCount: event.target.value })}
          />
        </label>
        <label className="field">
          <span>판매 수수료</span>
          <input
            inputMode="numeric"
            value={item.saleAgentCommission}
            onChange={(event) => props.onChange({ ...item, saleAgentCommission: event.target.value })}
          />
        </label>
      </div>

      <label className="field">
        <span>옵션 설명</span>
        <textarea
          rows={3}
          value={item.offerDescription}
          onChange={(event) => props.onChange({ ...item, offerDescription: event.target.value })}
        />
      </label>

      <div className="form-grid">
        <label className="field">
          <span>상품 상태</span>
          <input
            value={item.offerCondition}
            onChange={(event) => props.onChange({ ...item, offerCondition: event.target.value })}
          />
        </label>
        <label className="field">
          <span>수입구분</span>
          <input
            value={item.parallelImported}
            onChange={(event) => props.onChange({ ...item, parallelImported: event.target.value })}
          />
        </label>
        <label className="field">
          <span>해외구매 여부</span>
          <input
            value={item.overseasPurchased}
            onChange={(event) => props.onChange({ ...item, overseasPurchased: event.target.value })}
          />
        </label>
        <label className="field">
          <span>개인통관고유부호</span>
          <select
            value={item.pccNeeded ? "true" : "false"}
            onChange={(event) => props.onChange({ ...item, pccNeeded: event.target.value === "true" })}
          >
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        </label>
      </div>

      <ImageListEditor title="옵션 이미지" items={item.images} onChange={(images) => props.onChange({ ...item, images })} />
      <AttributeListEditor title="옵션 속성" items={item.attributes} onChange={(attributes) => props.onChange({ ...item, attributes })} />
      <NoticeListEditor title="옵션 고시정보" items={item.notices} onChange={(notices) => props.onChange({ ...item, notices })} />
      <ContentGroupEditor title="옵션 상세설명" items={item.contents} onChange={(contents) => props.onChange({ ...item, contents })} />
    </div>
  );
}

export default function CoupangProductEditPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { startLocalOperation, finishLocalOperation, removeLocalOperation, publishOperation } =
    useOperations();
  const { state: viewState, setState: setViewState } = useServerMenuState<ProductEditViewState>(
    "coupang.product-edit",
    DEFAULT_PRODUCT_EDIT_VIEW_STATE,
  );
  const { state: sectionState, setState: setSectionState } =
    useServerMenuState<ProductEditSectionState>(
      "coupang.product-edit.sections",
      DEFAULT_PRODUCT_EDIT_SECTION_STATE,
    );
  const routeParams = useMemo(() => new URLSearchParams(search), [search]);
  const routeStoreId = routeParams.get("storeId") ?? "";
  const routeSellerProductId = routeParams.get("sellerProductId") ?? "";
  const [targetStoreId, setTargetStoreId] = useState(routeStoreId);
  const [sellerProductId, setSellerProductId] = useState(routeSellerProductId);
  const [storeInput, setStoreInput] = useState(routeStoreId);
  const [sellerProductInput, setSellerProductInput] = useState(routeSellerProductId);
  const [form, setForm] = useState<EditorState | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    setTargetStoreId(routeStoreId);
    setSellerProductId(routeSellerProductId);
    setStoreInput(routeStoreId);
    setSellerProductInput(routeSellerProductId);
  }, [routeSellerProductId, routeStoreId]);

  const storesQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
  });

  const stores = storesQuery.data?.items ?? [];

  useEffect(() => {
    if (targetStoreId || !stores[0]) {
      return;
    }
    setTargetStoreId(stores[0].id);
    setStoreInput(stores[0].id);
  }, [stores, targetStoreId]);

  const detailQuery = useQuery({
    queryKey: ["/api/coupang/products/detail", targetStoreId, sellerProductId, "editor"],
    queryFn: () =>
      getJson<CoupangProductDetailResponse>(
        `/api/coupang/products/detail?storeId=${encodeURIComponent(targetStoreId)}&sellerProductId=${encodeURIComponent(sellerProductId)}`,
      ),
    enabled: Boolean(targetStoreId && sellerProductId),
    staleTime: 5_000,
  });

  const detail = detailQuery.data?.item ?? null;

  useEffect(() => {
    if (!detail) {
      setForm(null);
      return;
    }

    setForm(buildEditorState(detail));
  }, [detail]);

  const previewHtml = useMemo(() => (form ? buildDraftPreviewHtml(form.contents) : null), [form]);
  const previewImages = useMemo(() => (form ? collectDraftImages(form.images) : []), [form]);
  const featuredFieldKeys = useMemo(
    () => sanitizeFeaturedFieldKeys(viewState.featuredFieldKeys),
    [viewState.featuredFieldKeys],
  );
  const featuredFields = useMemo(
    () =>
      featuredFieldKeys
        .map((key) => FEATURED_FIELD_DEFINITION_MAP.get(key))
        .filter((definition): definition is FeaturedFieldDefinition => Boolean(definition)),
    [featuredFieldKeys],
  );
  const featuredFieldGroups = useMemo(
    () =>
      FEATURED_FIELD_SECTIONS.map((section) => ({
        section,
        items: FEATURED_FIELD_DEFINITIONS.filter((definition) => definition.section === section),
      })),
    [],
  );

  const updateForm = (updater: (current: EditorState) => EditorState) => {
    setForm((current) => (current ? updater(current) : current));
  };

  const toggleFeaturedField = (key: FeaturedFieldKey) => {
    setViewState((current) => {
      const currentKeys = sanitizeFeaturedFieldKeys(current.featuredFieldKeys);
      return currentKeys.includes(key)
        ? {
            ...current,
            featuredFieldKeys: currentKeys.filter((entry) => entry !== key),
          }
        : {
            ...current,
            featuredFieldKeys: [...currentKeys, key],
          };
    });
  };

  const moveFeaturedField = (key: FeaturedFieldKey, direction: -1 | 1) => {
    setViewState((current) => {
      const currentKeys = sanitizeFeaturedFieldKeys(current.featuredFieldKeys);
      const index = currentKeys.indexOf(key);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= currentKeys.length) {
        return current;
      }

      const nextKeys = [...currentKeys];
      const [target] = nextKeys.splice(index, 1);
      if (!target) {
        return current;
      }
      nextKeys.splice(nextIndex, 0, target);

      return {
        ...current,
        featuredFieldKeys: nextKeys,
      };
    });
  };

  const resetFeaturedFields = () => {
    setViewState((current) => ({
      ...current,
      featuredFieldKeys: [...DEFAULT_FEATURED_FIELD_KEYS],
    }));
  };

  const toggleSection = (key: keyof ProductEditSectionState) => {
    setSectionState((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const updateItem = (itemIndex: number, nextItem: EditorItemState) => {
    updateForm((current) => ({
      ...current,
      items: current.items.map((item, index) => (index === itemIndex ? nextItem : item)),
    }));
  };

  const applyTarget = () => {
    setFeedback(null);
    setTargetStoreId(storeInput);
    setSellerProductId(sellerProductInput);
    navigate(
      `/coupang/product-edit?storeId=${encodeURIComponent(storeInput)}&sellerProductId=${encodeURIComponent(sellerProductInput)}`,
    );
  };

  const runAction = async <T extends { operation?: unknown }>(input: {
    key: string;
    title: string;
    targetCount: number;
    request: () => Promise<T>;
    onSuccess: (result: T) => Promise<void> | void;
    summary: (result: T) => string;
  }) => {
    const localToastId = startLocalOperation({
      channel: "coupang",
      actionName: input.title,
      targetCount: input.targetCount,
    });

    setBusyAction(input.key);
    setFeedback(null);

    try {
      const result = await input.request();
      if (
        result &&
        typeof result === "object" &&
        "operation" in result &&
        result.operation &&
        typeof result.operation === "object"
      ) {
        publishOperation(result.operation as never);
      }
      await input.onSuccess(result);
      finishLocalOperation(localToastId, {
        status: "success",
        summary: input.summary(result),
      });
      window.setTimeout(() => removeLocalOperation(localToastId), 800);
    } catch (error) {
      const message = error instanceof Error ? error.message : "쿠팡 상품 수정에 실패했습니다.";
      finishLocalOperation(localToastId, {
        status: "error",
        errorMessage: message,
      });
      setFeedback({
        type: "error",
        title: "저장에 실패했습니다.",
        message,
      });
    } finally {
      setBusyAction(null);
    }
  };

  const refreshDetail = async () => {
    if (!targetStoreId || !sellerProductId) {
      return;
    }

    const result = await getJson<CoupangProductDetailResponse>(
      `/api/coupang/products/detail?storeId=${encodeURIComponent(targetStoreId)}&sellerProductId=${encodeURIComponent(sellerProductId)}&refresh=1`,
    );
    queryClient.setQueryData(
      ["/api/coupang/products/detail", targetStoreId, sellerProductId, "editor"],
      result,
    );
  };

  const savePartial = async () => {
    if (!form || !targetStoreId || !sellerProductId) {
      return;
    }

    await runAction<CoupangProductMutationResponse>({
      key: "partial",
      title: "쿠팡 배송 / 반품 저장",
      targetCount: 1,
      request: () =>
        apiRequestJson<CoupangProductMutationResponse>(
          "PUT",
          "/api/coupang/products/partial",
          buildPartialPayload(targetStoreId, sellerProductId, form),
        ),
      onSuccess: async () => {
        await refreshDetail();
        setFeedback({
          type: "success",
          title: "배송 / 반품 정보를 저장했습니다.",
          message: "부분 수정 API로 배송 / 반품 항목을 최신 상태로 다시 불러왔습니다.",
        });
      },
      summary: (result) => result.item.message,
    });
  };

  const saveOptionPrices = async () => {
    if (!form || !targetStoreId || !sellerProductId) {
      return;
    }

    await runAction<CoupangBatchActionResponse>({
      key: "option-prices",
      title: "쿠팡 옵션 가격 저장",
      targetCount: form.items.length,
      request: () =>
        apiRequestJson<CoupangBatchActionResponse>("POST", "/api/coupang/products/prices/bulk", {
          storeId: targetStoreId,
          items: buildPriceTargets(sellerProductId, form.items),
        }),
      onSuccess: async () => {
        await refreshDetail();
        setFeedback({
          type: "success",
          title: "옵션 가격을 저장했습니다.",
          message: "옵션 판매가를 배치 API로 반영한 뒤 상세 데이터를 새로 불러왔습니다.",
        });
      },
      summary: (result) => `성공 ${result.summary.succeededCount}건`,
    });
  };

  const saveOptionQuantities = async () => {
    if (!form || !targetStoreId || !sellerProductId) {
      return;
    }

    await runAction<CoupangBatchActionResponse>({
      key: "option-quantities",
      title: "쿠팡 옵션 재고 저장",
      targetCount: form.items.length,
      request: () =>
        apiRequestJson<CoupangBatchActionResponse>(
          "POST",
          "/api/coupang/products/quantities/bulk",
          {
            storeId: targetStoreId,
            items: buildQuantityTargets(sellerProductId, form.items),
          },
        ),
      onSuccess: async () => {
        await refreshDetail();
        setFeedback({
          type: "success",
          title: "옵션 재고를 저장했습니다.",
          message: "옵션 재고를 배치 API로 반영한 뒤 상세 데이터를 새로 불러왔습니다.",
        });
      },
      summary: (result) => `성공 ${result.summary.succeededCount}건`,
    });
  };

  const saveOptionStatuses = async () => {
    if (!form || !targetStoreId || !sellerProductId) {
      return;
    }

    await runAction<CoupangBatchActionResponse>({
      key: "option-statuses",
      title: "쿠팡 옵션 판매상태 저장",
      targetCount: form.items.length,
      request: () =>
        apiRequestJson<CoupangBatchActionResponse>(
          "POST",
          "/api/coupang/products/sale-status/bulk",
          {
            storeId: targetStoreId,
            items: buildSaleStatusTargets(sellerProductId, form.items),
          },
        ),
      onSuccess: async () => {
        await refreshDetail();
        setFeedback({
          type: "success",
          title: "옵션 판매상태를 저장했습니다.",
          message: "옵션 판매상태를 배치 API로 반영한 뒤 상세 데이터를 새로 불러왔습니다.",
        });
      },
      summary: (result) => `성공 ${result.summary.succeededCount}건`,
    });
  };

  const saveFull = async () => {
    if (!form || !targetStoreId || !sellerProductId) {
      return;
    }

    await runAction<CoupangProductMutationResponse>({
      key: "full",
      title: "쿠팡 전체 상품 저장",
      targetCount: 1,
      request: () =>
        apiRequestJson<CoupangProductMutationResponse>(
          "PUT",
          "/api/coupang/products/full",
          buildFullPayload(targetStoreId, sellerProductId, form),
        ),
      onSuccess: async () => {
        await refreshDetail();
        setFeedback({
          type: "success",
          title: "전체 상품 저장을 완료했습니다.",
          message: form.requestApproval
            ? "전체 수정과 승인 요청을 전송한 뒤 최신 상품 데이터를 다시 불러왔습니다."
            : "전체 수정 저장 후 최신 상품 데이터를 다시 불러왔습니다.",
        });
      },
      summary: (result) => result.item.message,
    });
  };

  return (
    <div className="page">
      <div className="hero">
        <h1>쿠팡 전체 상품 수정</h1>
        <p>썸네일, 상세 HTML, 옵션, 배송 / 반품, 고시 / 태그까지 한 화면에서 수정하고 섹션별로 저장합니다.</p>
      </div>

      <div className="card">
        <div className="toolbar">
          <select value={storeInput} onChange={(event) => setStoreInput(event.target.value)}>
            <option value="">스토어 선택</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.storeName}
              </option>
            ))}
          </select>
          <input
            value={sellerProductInput}
            onChange={(event) => setSellerProductInput(event.target.value)}
            placeholder="sellerProductId"
            style={{ minWidth: 240 }}
          />
          <button className="button secondary" onClick={applyTarget} disabled={!storeInput || !sellerProductInput}>
            열기
          </button>
          <button
            className="button ghost"
            onClick={() =>
              navigate(
                `/coupang/products?storeId=${encodeURIComponent(targetStoreId)}&sellerProductId=${encodeURIComponent(sellerProductId)}`,
              )
            }
          >
            목록으로
          </button>
        </div>
      </div>

      {feedback ? (
        <div className={`feedback${feedback.type === "error" ? " error" : feedback.type === "warning" ? " warning" : ""}`}>
          <strong>{feedback.title}</strong>
          <div className="muted">{feedback.message}</div>
        </div>
      ) : null}

      {!targetStoreId || !sellerProductId ? (
        <div className="empty">스토어와 sellerProductId를 입력하면 전체 수정 화면이 열립니다.</div>
      ) : detailQuery.isLoading ? (
        <div className="empty">쿠팡 상품 상세를 불러오는 중입니다.</div>
      ) : detailQuery.error ? (
        <div className="empty">{(detailQuery.error as Error).message}</div>
      ) : !detail || !form ? (
        <div className="empty">상품 상세 데이터를 찾지 못했습니다.</div>
      ) : (
        <>
          <OperationPageSettings
            menuKey="coupang.product-edit"
            description="상단 주요 수정에 고정할 필드를 선택하고 순서를 저장합니다."
            summary={
              <>
                <span className="chip">주요 필드 {formatNumber(featuredFields.length)}개</span>
                <span className="chip">다음에도 그대로 유지</span>
              </>
            }
          >
            <div className="featured-settings">
              <div className="card-header">
                <div>
                  <strong>상단 고정 필드 설정</strong>
                  <div className="muted">
                    체크한 항목만 주요 수정에 보이고, 순서는 위아래 버튼으로 바꿀 수 있습니다.
                  </div>
                </div>
                <button className="button ghost" onClick={resetFeaturedFields} type="button">
                  기본 추천으로 복원
                </button>
              </div>

              <div className="featured-settings-grid">
                {featuredFieldGroups.map((group) => (
                  <div key={group.section} className="featured-settings-group">
                    <strong>{group.section}</strong>
                    <div className="featured-settings-list">
                      {group.items.map((definition) => {
                        const index = featuredFieldKeys.indexOf(definition.key);
                        const isSelected = index >= 0;

                        return (
                          <div
                            key={definition.key}
                            className={`featured-settings-item${isSelected ? " selected" : ""}`}
                          >
                            <div className="featured-settings-main">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleFeaturedField(definition.key)}
                              />
                              <div className="stack" style={{ gap: "0.25rem" }}>
                                <strong>{definition.label}</strong>
                                <div className="muted">{definition.description}</div>
                              </div>
                            </div>

                            <div className="featured-settings-actions">
                              <button
                                type="button"
                                onClick={() => moveFeaturedField(definition.key, -1)}
                                disabled={!isSelected || index === 0}
                              >
                                위로
                              </button>
                              <button
                                type="button"
                                onClick={() => moveFeaturedField(definition.key, 1)}
                                disabled={!isSelected || index === featuredFieldKeys.length - 1}
                              >
                                아래로
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </OperationPageSettings>

          <div className="editor-layout">
            <div className="stack">
              <CollapsibleSection
                className="card editor-section"
                title="주요 수정"
                description="설정에서 고른 필드를 상단에 고정해서 빠르게 수정합니다."
                summary={<div className="muted">설정한 필드 {formatNumber(featuredFields.length)}개</div>}
                isOpen={sectionState.featuredOpen}
                onToggle={() => toggleSection("featuredOpen")}
              >
                {featuredFields.length ? (
                  <>
                    <div className="chip-row">
                      {featuredFields.map((definition) => (
                        <span key={definition.key} className="chip">
                          {definition.label}
                        </span>
                      ))}
                    </div>

                    <div className="form-grid">
                      {featuredFields.map((definition) => (
                        <FeaturedEditorField
                          key={definition.key}
                          definition={definition}
                          form={form}
                          onChange={updateForm}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="featured-editor-empty">
                    <div>아직 상단에 고정한 필드가 없습니다.</div>
                    <div className="muted">설정에서 필요한 항목을 체크하면 여기서 바로 수정할 수 있습니다.</div>
                  </div>
                )}
              </CollapsibleSection>

            <CollapsibleSection
              className="card editor-section"
              title="기본정보"
              description="상품명, 대표명, 브랜드, 승인 여부 등을 수정합니다."
              actions={
                <div className="toolbar">
                  <label className="field" style={{ minWidth: 160 }}>
                    <span>승인 요청</span>
                    <select
                      value={form.requestApproval ? "true" : "false"}
                      onChange={(event) =>
                        updateForm((current) => ({
                          ...current,
                          requestApproval: event.target.value === "true",
                        }))
                      }
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </label>
                  <button className="button" onClick={saveFull} disabled={!detail.canEdit || busyAction !== null}>
                    {busyAction === "full" ? "저장 중.." : "전체 저장"}
                  </button>
                </div>
              }
              isOpen={sectionState.basicInfoOpen}
              onToggle={() => toggleSection("basicInfoOpen")}
            >
              <div className="form-grid">
                <label className="field">
                  <span>sellerProductId</span>
                  <input value={sellerProductId} readOnly />
                </label>
                <label className="field">
                  <span>productId</span>
                  <input value={detail.productId ?? ""} readOnly />
                </label>
                <label className="field">
                  <span>상품명</span>
                  <input value={form.sellerProductName} onChange={(event) => updateForm((current) => ({ ...current, sellerProductName: event.target.value }))} />
                </label>
                <label className="field">
                  <span>대표 상품명</span>
                  <input value={form.displayProductName} onChange={(event) => updateForm((current) => ({ ...current, displayProductName: event.target.value }))} />
                </label>
                <label className="field">
                  <span>일반 상품명</span>
                  <input value={form.generalProductName} onChange={(event) => updateForm((current) => ({ ...current, generalProductName: event.target.value }))} />
                </label>
                <label className="field">
                  <span>브랜드</span>
                  <input value={form.brand} onChange={(event) => updateForm((current) => ({ ...current, brand: event.target.value }))} />
                </label>
                <label className="field">
                  <span>제조사</span>
                  <input value={form.manufacture} onChange={(event) => updateForm((current) => ({ ...current, manufacture: event.target.value }))} />
                </label>
                <label className="field">
                  <span>카테고리 코드</span>
                  <input value={form.displayCategoryCode} onChange={(event) => updateForm((current) => ({ ...current, displayCategoryCode: event.target.value }))} />
                </label>
                <label className="field">
                  <span>상품 그룹</span>
                  <input value={form.productGroup} onChange={(event) => updateForm((current) => ({ ...current, productGroup: event.target.value }))} />
                </label>
                <label className="field">
                  <span>vendorUserId</span>
                  <input value={form.vendorUserId} onChange={(event) => updateForm((current) => ({ ...current, vendorUserId: event.target.value }))} />
                </label>
                <label className="field">
                  <span>판매 시작일</span>
                  <input value={form.saleStartedAt} onChange={(event) => updateForm((current) => ({ ...current, saleStartedAt: event.target.value }))} />
                </label>
                <label className="field">
                  <span>판매 종료일</span>
                  <input value={form.saleEndedAt} onChange={(event) => updateForm((current) => ({ ...current, saleEndedAt: event.target.value }))} />
                </label>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              className="card editor-section"
              title="배송 / 반품"
              description="부분 수정 API로 저장되는 영역입니다."
              actions={
                <button className="button secondary" onClick={savePartial} disabled={!detail.canEdit || busyAction !== null}>
                  {busyAction === "partial" ? "저장 중.." : "배송 / 반품 저장"}
                </button>
              }
              isOpen={sectionState.deliveryOpen}
              onToggle={() => toggleSection("deliveryOpen")}
            >
              <div className="form-grid">
                <label className="field"><span>배송방식</span><input value={form.deliveryMethod} onChange={(event) => updateForm((current) => ({ ...current, deliveryMethod: event.target.value }))} /></label>
                <label className="field"><span>택배사 코드</span><input value={form.deliveryCompanyCode} onChange={(event) => updateForm((current) => ({ ...current, deliveryCompanyCode: event.target.value }))} /></label>
                <label className="field"><span>배송비 타입</span><input value={form.deliveryChargeType} onChange={(event) => updateForm((current) => ({ ...current, deliveryChargeType: event.target.value }))} /></label>
                <label className="field"><span>배송비</span><input inputMode="numeric" value={form.deliveryCharge} onChange={(event) => updateForm((current) => ({ ...current, deliveryCharge: event.target.value }))} /></label>
                <label className="field"><span>무료배송 기준금액</span><input inputMode="numeric" value={form.freeShipOverAmount} onChange={(event) => updateForm((current) => ({ ...current, freeShipOverAmount: event.target.value }))} /></label>
                <label className="field"><span>반품 배송비</span><input inputMode="numeric" value={form.deliveryChargeOnReturn} onChange={(event) => updateForm((current) => ({ ...current, deliveryChargeOnReturn: event.target.value }))} /></label>
                <label className="field"><span>추가 배송비</span><input inputMode="numeric" value={form.deliverySurcharge} onChange={(event) => updateForm((current) => ({ ...current, deliverySurcharge: event.target.value }))} /></label>
                <label className="field"><span>출고 소요일</span><input inputMode="numeric" value={form.outboundShippingTimeDay} onChange={(event) => updateForm((current) => ({ ...current, outboundShippingTimeDay: event.target.value }))} /></label>
                <label className="field"><span>출고지 코드</span><input value={form.outboundShippingPlaceCode} onChange={(event) => updateForm((current) => ({ ...current, outboundShippingPlaceCode: event.target.value }))} /></label>
                <label className="field"><span>원거리 배송 가능</span><input value={form.remoteAreaDeliverable} onChange={(event) => updateForm((current) => ({ ...current, remoteAreaDeliverable: event.target.value }))} /></label>
                <label className="field"><span>묶음배송 타입</span><input value={form.unionDeliveryType} onChange={(event) => updateForm((current) => ({ ...current, unionDeliveryType: event.target.value }))} /></label>
                <label className="field"><span>반품센터 코드</span><input value={form.returnCenterCode} onChange={(event) => updateForm((current) => ({ ...current, returnCenterCode: event.target.value }))} /></label>
                <label className="field"><span>반품비 명칭</span><input value={form.returnChargeName} onChange={(event) => updateForm((current) => ({ ...current, returnChargeName: event.target.value }))} /></label>
                <label className="field"><span>고객 연락처</span><input value={form.companyContactNumber} onChange={(event) => updateForm((current) => ({ ...current, companyContactNumber: event.target.value }))} /></label>
                <label className="field"><span>우편번호</span><input value={form.returnZipCode} onChange={(event) => updateForm((current) => ({ ...current, returnZipCode: event.target.value }))} /></label>
                <label className="field"><span>반품비</span><input inputMode="numeric" value={form.returnCharge} onChange={(event) => updateForm((current) => ({ ...current, returnCharge: event.target.value }))} /></label>
              </div>
              <label className="field"><span>반품 주소</span><input value={form.returnAddress} onChange={(event) => updateForm((current) => ({ ...current, returnAddress: event.target.value }))} /></label>
              <label className="field"><span>반품 상세 주소</span><input value={form.returnAddressDetail} onChange={(event) => updateForm((current) => ({ ...current, returnAddressDetail: event.target.value }))} /></label>
              <label className="field"><span>추가 안내</span><textarea rows={4} value={form.extraInfoMessage} onChange={(event) => updateForm((current) => ({ ...current, extraInfoMessage: event.target.value }))} /></label>
            </CollapsibleSection>

            <div className="card editor-section">
              <ImageListEditor title="대표 이미지 / 썸네일" items={form.images} onChange={(images) => updateForm((current) => ({ ...current, images }))} />
            </div>

            <div className="card editor-section">
              <ContentGroupEditor title="상세설명" items={form.contents} onChange={(contents) => updateForm((current) => ({ ...current, contents }))} />
            </div>

            <div className="card editor-section">
              <div className="stack">
                <label className="field">
                  <span>검색 태그</span>
                  <input value={form.searchTagsText} onChange={(event) => updateForm((current) => ({ ...current, searchTagsText: event.target.value }))} placeholder="쉼표로 구분" />
                </label>
                <NoticeListEditor title="고시정보" items={form.notices} onChange={(notices) => updateForm((current) => ({ ...current, notices }))} />
              </div>
            </div>

            <CollapsibleSection
              className="card editor-section"
              title="옵션"
              description="가격 / 재고 / 판매상태는 옵션 배치 API로 저장하고, 기타 필드는 전체 저장에 포함됩니다."
              actions={
                <div className="toolbar">
                  <button className="button ghost" onClick={saveOptionPrices} disabled={!detail.canEdit || busyAction !== null}>
                    {busyAction === "option-prices" ? "저장 중.." : "옵션 가격 저장"}
                  </button>
                  <button className="button ghost" onClick={saveOptionQuantities} disabled={!detail.canEdit || busyAction !== null}>
                    {busyAction === "option-quantities" ? "저장 중.." : "옵션 재고 저장"}
                  </button>
                  <button className="button ghost" onClick={saveOptionStatuses} disabled={!detail.canEdit || busyAction !== null}>
                    {busyAction === "option-statuses" ? "저장 중.." : "옵션 상태 저장"}
                  </button>
                </div>
              }
              summary={<div className="muted">옵션 {formatNumber(form.items.length)}개</div>}
              isOpen={sectionState.optionsOpen}
              onToggle={() => toggleSection("optionsOpen")}
            >
              <div className="stack">
                {form.items.map((item, index) => (
                  <EditorItemCard key={item.vendorItemId || item.sellerProductItemId || item.itemId || index} item={item} index={index} onChange={(nextItem) => updateItem(index, nextItem)} />
                ))}
              </div>
            </CollapsibleSection>
          </div>

          <div className="preview-panel">
            <CoupangProductPreview
              detail={detail}
              draftHtml={previewHtml}
              draftImages={previewImages}
              headerActions={
                <div className="stack" style={{ gap: "0.5rem", minWidth: 160 }}>
                  <div className={`status-pill ${detail.canEdit ? "live" : "locked"}`}>
                    {detail.canEdit ? "수정 가능" : "수정 잠김"}
                  </div>
                  <div className="muted">최근 수정 {formatDate(detail.createdAt)}</div>
                  <div className="muted">옵션 {formatNumber(detail.items.length)}개</div>
                </div>
              }
            />
          </div>
        </div>
        </>
      )}
    </div>
  );
}
