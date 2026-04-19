import {
  createBuiltinShipmentColumnSource,
  createShipmentColumnConfig,
  DEFAULT_SHIPMENT_COLUMN_ORDER,
  getShipmentColumnSourceStorageKey,
  isBuiltinShipmentColumnSource,
  SHIPMENT_COLUMN_DEFAULT_WIDTHS,
} from "./worksheet-config";
import type { ShipmentColumnConfig, ShipmentColumnSourceKey } from "./types";

export type ShipmentColumnPresetKey = "operations" | "invoice_input" | "full";

type ShipmentColumnPresetDefinition = {
  key: ShipmentColumnPresetKey;
  label: string;
  description: string;
  sourceKeys: ShipmentColumnSourceKey[];
  widthOverrides?: Partial<Record<ShipmentColumnSourceKey, number>>;
};

export const SHIPMENT_COLUMN_PRESETS: readonly ShipmentColumnPresetDefinition[] = [
  {
    key: "operations",
    label: "작업 보기",
    description: "가로 스크롤을 줄이고 출고 판단과 기본 식별 정보만 빠르게 확인합니다.",
    sourceKeys: ["productName", "optionName", "receiverName", "selpickOrderNumber", "quantity"],
    widthOverrides: {
      productName: 176,
      optionName: 104,
      receiverName: 120,
      selpickOrderNumber: 138,
      quantity: 72,
    },
  },
  {
    key: "invoice_input",
    label: "송장 입력 보기",
    description: "셀픽주문번호, 수령인, 택배사, 송장번호 중심으로 송장 작업에 맞춥니다.",
    sourceKeys: [
      "selpickOrderNumber",
      "productName",
      "receiverName",
      "deliveryCompanyCode",
      "invoiceNumber",
    ],
    widthOverrides: {
      selpickOrderNumber: 138,
      productName: 176,
      receiverName: 120,
      deliveryCompanyCode: 92,
      invoiceNumber: 128,
    },
  },
  {
    key: "full",
    label: "전체 보기",
    description: "기본 전체 컬럼 구성을 그대로 사용합니다.",
    sourceKeys: [...DEFAULT_SHIPMENT_COLUMN_ORDER],
  },
] as const;

function getShipmentColumnPresetDefinition(key: ShipmentColumnPresetKey) {
  return SHIPMENT_COLUMN_PRESETS.find((preset) => preset.key === key) ?? SHIPMENT_COLUMN_PRESETS[0];
}

export function buildShipmentColumnPresetConfigs(key: ShipmentColumnPresetKey): ShipmentColumnConfig[] {
  const preset = getShipmentColumnPresetDefinition(key);
  return preset.sourceKeys.map((sourceKey) => createShipmentColumnConfig(sourceKey));
}

export function buildShipmentColumnPresetWidths(
  configs: ShipmentColumnConfig[],
  key: ShipmentColumnPresetKey,
): Record<string, number> {
  const preset = getShipmentColumnPresetDefinition(key);

  return Object.fromEntries(
    configs.map((config) => {
      const builtinKey =
        isBuiltinShipmentColumnSource(config.source) ? config.source.key : "blank";

      return [
        config.id,
        preset.widthOverrides?.[builtinKey] ?? SHIPMENT_COLUMN_DEFAULT_WIDTHS[builtinKey],
      ];
    }),
  );
}

export function detectShipmentColumnPresetKey(
  configs: readonly ShipmentColumnConfig[],
): ShipmentColumnPresetKey | "custom" {
  const storageKeys = configs.map((config) => getShipmentColumnSourceStorageKey(config.source));

  for (const preset of SHIPMENT_COLUMN_PRESETS) {
    const presetStorageKeys = preset.sourceKeys.map((sourceKey) =>
      getShipmentColumnSourceStorageKey(createBuiltinShipmentColumnSource(sourceKey)),
    );
    if (
      presetStorageKeys.length === storageKeys.length &&
      presetStorageKeys.every((sourceKey, index) => storageKeys[index] === sourceKey)
    ) {
      return preset.key;
    }
  }

  return "custom";
}
