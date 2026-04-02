import {
  applyPatchToSnapshot,
  type CatalogPage,
  type ChannelAdapter,
  type ChannelOptionSnapshot,
  type ChannelOptionTarget,
  type NormalizedChannelProduct,
} from "@shared/channel-control";

const initialNaverState: NormalizedChannelProduct[] = [
  {
    channel: "naver",
    channelProductId: "NAV-PROD-1001",
    sellerProductCode: "NV-TUMBLER-500",
    productName: "KIKIT 텀블러 500ml",
    productStatus: "sale",
    rawJson: { mallProductNo: "NAV-PROD-1001" },
    options: [
      {
        channelOptionId: "NAV-OPT-1001-RED",
        optionName: "레드",
        price: 15900,
        stockQuantity: 32,
        saleStatus: "on_sale",
        soldOutStatus: "in_stock",
        masterSku: "MSK-1001",
        optionSku: "OPT-1001-RED",
        rawJson: { color: "red" },
      },
      {
        channelOptionId: "NAV-OPT-1001-BLUE",
        optionName: "블루",
        price: 15900,
        stockQuantity: 18,
        saleStatus: "on_sale",
        soldOutStatus: "in_stock",
        masterSku: "MSK-1001",
        optionSku: "OPT-1001-BLUE",
        rawJson: { color: "blue" },
      },
    ],
  },
  {
    channel: "naver",
    channelProductId: "NAV-PROD-3001",
    sellerProductCode: "NV-LIGHT-3001",
    productName: "휴대용 LED 무드등",
    productStatus: "sale",
    rawJson: { mallProductNo: "NAV-PROD-3001" },
    options: [
      {
        channelOptionId: "NAV-OPT-3001-WHITE",
        optionName: "화이트",
        price: 23900,
        stockQuantity: 7,
        saleStatus: "on_sale",
        soldOutStatus: "in_stock",
        masterSku: "MSK-3001",
        optionSku: "OPT-3001-WHITE",
        rawJson: { color: "white" },
      },
      {
        channelOptionId: "NAV-OPT-FAIL-3001",
        optionName: "블랙",
        price: 23900,
        stockQuantity: 4,
        saleStatus: "on_sale",
        soldOutStatus: "in_stock",
        masterSku: "MSK-3001",
        optionSku: "OPT-3001-BLACK",
        rawJson: { color: "black" },
      },
    ],
  },
];

let naverState: NormalizedChannelProduct[] = structuredClone(initialNaverState);

export function resetNaverAdapterState() {
  naverState = structuredClone(initialNaverState);
}

function cloneSnapshot(
  product: NormalizedChannelProduct,
  option: NormalizedChannelProduct["options"][number],
): ChannelOptionSnapshot {
  return {
    channel: "naver",
    channelProductId: product.channelProductId,
    channelOptionId: option.channelOptionId,
    masterSku: option.masterSku ?? null,
    optionSku: option.optionSku ?? null,
    sellerProductCode: product.sellerProductCode,
    productName: product.productName,
    optionName: option.optionName,
    price: option.price,
    stockQuantity: option.stockQuantity,
    saleStatus: option.saleStatus,
    soldOutStatus: option.soldOutStatus,
    rawJson: { ...product.rawJson, ...option.rawJson },
  };
}

function findTarget(target: ChannelOptionTarget) {
  const product = naverState.find((item) => item.channelProductId === target.channelProductId);
  const option = product?.options.find((item) => item.channelOptionId === target.channelOptionId);

  if (!product || !option) {
    throw new Error("네이버 옵션을 찾지 못했습니다.");
  }

  return { product, option };
}

export const naverAdapter: ChannelAdapter = {
  channel: "naver",
  async listCatalog(input): Promise<CatalogPage> {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
    const offset = Number(input.cursor ?? "0");
    return {
      items: naverState.slice(offset, offset + limit).map((item) => structuredClone(item)),
      nextCursor: offset + limit < naverState.length ? String(offset + limit) : null,
    };
  },
  async getOptionSnapshot(target) {
    const { product, option } = findTarget(target);
    return cloneSnapshot(product, option);
  },
  async applyControlPatch({ target, patch }) {
    const { product, option } = findTarget(target);
    const before = cloneSnapshot(product, option);

    if (option.channelOptionId.includes("FAIL")) {
      throw new Error("네이버 채널이 해당 옵션 업데이트를 거부했습니다.");
    }

    const next = applyPatchToSnapshot(before, patch);
    option.price = next.price;
    option.stockQuantity = next.stockQuantity;
    option.saleStatus = next.saleStatus;
    option.soldOutStatus = next.soldOutStatus;

    return {
      before,
      after: cloneSnapshot(product, option),
      adapterResponse: { channel: "naver", accepted: true, updatedAt: new Date().toISOString() },
    };
  },
};
