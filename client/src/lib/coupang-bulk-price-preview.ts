type SamePriceSkipInput = {
  currentPrice: number | null;
  nextPrice: number | null;
  needsInventoryUpdate: boolean;
  needsSaleStatusUpdate: boolean;
};

export function shouldSkipCoupangSamePriceRow(input: SamePriceSkipInput) {
  const { currentPrice, nextPrice, needsInventoryUpdate, needsSaleStatusUpdate } = input;

  return (
    currentPrice !== null &&
    nextPrice !== null &&
    currentPrice === nextPrice &&
    !needsInventoryUpdate &&
    !needsSaleStatusUpdate
  );
}
