import {
  applyPatchToSnapshot,
  type CatalogPage,
  type ChannelAdapter,
  type ChannelOptionSnapshot,
  type ChannelOptionTarget,
  type NormalizedChannelProduct,
} from "@shared/channel-control";

const initialCoupangState: NormalizedChannelProduct[] = [
  {
    channel: "coupang",
    channelProductId: "CP-PROD-2001",
    sellerProductCode: "CP-BASKET-2001",
    productName: "프리미엄 수납 바구니",
    productStatus: "sale",
    rawJson: { sellerProductId: "CP-PROD-2001" },
    options: [
      {
        channelOptionId: "CP-OPT-2001-L",
        optionName: "Large",
        price: 18900,
        stockQuantity: 11,
        saleStatus: "on_sale",
        soldOutStatus: "in_stock",
        masterSku: "MSK-2001",
        optionSku: "OPT-2001-L",
        rawJson: { size: "L" },
      },
      {
        channelOptionId: "CP-OPT-2001-M",
        optionName: "Medium",
        price: 16900,
        stockQuantity: 0,
        saleStatus: "on_sale",
        soldOutStatus: "sold_out",
        masterSku: "MSK-2001",
        optionSku: "OPT-2001-M",
        rawJson: { size: "M" },
      },
    ],
  },
  {
    channel: "coupang",
    channelProductId: "CP-PROD-1001",
    sellerProductCode: "CP-TUMBLER-500",
    productName: "KIKIT 텀블러 500ml",
    productStatus: "sale",
    rawJson: { sellerProductId: "CP-PROD-1001" },
    options: [
      {
        channelOptionId: "CP-OPT-1001-RED",
        optionName: "레드",
        price: 15400,
        stockQuantity: 21,
        saleStatus: "on_sale",
        soldOutStatus: "in_stock",
        masterSku: "MSK-1001",
        optionSku: "OPT-1001-RED",
        rawJson: { color: "red" },
      },
      {
        channelOptionId: "CP-OPT-1001-BLUE",
        optionName: "블루",
        price: 15400,
        stockQuantity: 9,
        saleStatus: "sale_stopped",
        soldOutStatus: "in_stock",
        masterSku: "MSK-1001",
        optionSku: "OPT-1001-BLUE",
        rawJson: { color: "blue" },
      },
    ],
  },
];

let coupangState: NormalizedChannelProduct[] = structuredClone(initialCoupangState);

export function resetCoupangAdapterState() {
  coupangState = structuredClone(initialCoupangState);
}

function cloneSnapshot(
  product: NormalizedChannelProduct,
  option: NormalizedChannelProduct["options"][number],
): ChannelOptionSnapshot {
  return {
    channel: "coupang",
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
  const product = coupangState.find((item) => item.channelProductId === target.channelProductId);
  const option = product?.options.find((item) => item.channelOptionId === target.channelOptionId);

  if (!product || !option) {
    throw new Error("쿠팡 옵션을 찾지 못했습니다.");
  }

  return { product, option };
}

export const coupangAdapter: ChannelAdapter = {
  channel: "coupang",
  async listCatalog(input): Promise<CatalogPage> {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
    const offset = Number(input.cursor ?? "0");
    return {
      items: coupangState.slice(offset, offset + limit).map((item) => structuredClone(item)),
      nextCursor: offset + limit < coupangState.length ? String(offset + limit) : null,
    };
  },
  async getOptionSnapshot(target) {
    const { product, option } = findTarget(target);
    return cloneSnapshot(product, option);
  },
  async applyControlPatch({ target, patch }) {
    const { product, option } = findTarget(target);
    const before = cloneSnapshot(product, option);
    const next = applyPatchToSnapshot(before, patch);
    option.price = next.price;
    option.stockQuantity = next.stockQuantity;
    option.saleStatus = next.saleStatus;
    option.soldOutStatus = next.soldOutStatus;

    return {
      before,
      after: cloneSnapshot(product, option),
      adapterResponse: { channel: "coupang", accepted: true, updatedAt: new Date().toISOString() },
    };
  },
};
