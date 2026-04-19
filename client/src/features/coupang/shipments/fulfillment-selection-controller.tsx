import ShipmentSelectionActionBar from "./shipment-selection-action-bar";

type FulfillmentActiveTab = "worksheet" | "confirmed" | "archive" | "settings";

type FulfillmentSelectionControllerProps = {
  activeTab: FulfillmentActiveTab;
  selectedRowsCount: number;
  selectedReadyRowsCount: number;
  selectedDecisionBlockedRowsCount: number;
  blockedDecisionSummary: string | null;
  transmitDisabled: boolean;
  downloadDisabled: boolean;
  onTransmit: () => void;
  onDownload: () => void;
  onClear: () => void;
};

export default function FulfillmentSelectionController({
  activeTab,
  selectedRowsCount,
  selectedReadyRowsCount,
  selectedDecisionBlockedRowsCount,
  blockedDecisionSummary,
  transmitDisabled,
  downloadDisabled,
  onTransmit,
  onDownload,
  onClear,
}: FulfillmentSelectionControllerProps) {
  if (activeTab !== "worksheet" || selectedRowsCount === 0) {
    return null;
  }

  return (
    <ShipmentSelectionActionBar
      selectedRowsCount={selectedRowsCount}
      selectedReadyRowsCount={selectedReadyRowsCount}
      selectedDecisionBlockedRowsCount={selectedDecisionBlockedRowsCount}
      blockedDecisionSummary={blockedDecisionSummary}
      transmitDisabled={transmitDisabled}
      downloadDisabled={downloadDisabled}
      onTransmit={onTransmit}
      onDownload={onDownload}
      onClear={onClear}
    />
  );
}
