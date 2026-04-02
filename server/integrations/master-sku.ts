export interface MasterSkuReference {
  masterSku: string;
  optionSku: string;
  productName: string;
  optionName: string;
}

const fallbackMasterSkuCatalog: MasterSkuReference[] = [
  { masterSku: "MSK-1001", optionSku: "OPT-1001-RED", productName: "KIKIT 텀블러 500ml", optionName: "레드" },
  { masterSku: "MSK-1001", optionSku: "OPT-1001-BLUE", productName: "KIKIT 텀블러 500ml", optionName: "블루" },
  { masterSku: "MSK-2001", optionSku: "OPT-2001-L", productName: "프리미엄 수납 바구니", optionName: "Large" },
  { masterSku: "MSK-2001", optionSku: "OPT-2001-M", productName: "프리미엄 수납 바구니", optionName: "Medium" },
  { masterSku: "MSK-3001", optionSku: "OPT-3001-WHITE", productName: "휴대용 LED 무드등", optionName: "화이트" },
  { masterSku: "MSK-3001", optionSku: "OPT-3001-BLACK", productName: "휴대용 LED 무드등", optionName: "블랙" },
];

export async function searchMasterSkuReferences(q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return fallbackMasterSkuCatalog.filter((row) =>
    [row.masterSku, row.optionSku, row.productName, row.optionName]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export async function validateMasterSkuReference(input: {
  masterSku?: string | null;
  optionSku?: string | null;
}) {
  const { masterSku, optionSku } = input;
  if (!masterSku && !optionSku) {
    return { valid: false, message: "masterSku 또는 optionSku가 필요합니다." };
  }

  const match = fallbackMasterSkuCatalog.find((row) => {
    if (optionSku && row.optionSku !== optionSku) return false;
    if (masterSku && row.masterSku !== masterSku) return false;
    return true;
  });

  if (!match) {
    return { valid: false, message: "외부 Master SKU 기준에서 SKU를 찾지 못했습니다." };
  }

  return { valid: true, match };
}

