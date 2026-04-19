import type { ComponentProps } from "react";
import { formatNumber } from "@/lib/utils";
import ShipmentWorksheetOverview from "./shipment-worksheet-overview";

type FulfillmentActiveTab = "worksheet" | "confirmed" | "archive" | "settings";

type FulfillmentSummaryBarProps = {
  activeTab: FulfillmentActiveTab;
  worksheetSummaryProps: ComponentProps<typeof ShipmentWorksheetOverview>;
  archiveSummary: {
    totalRowCount: number;
    filteredRowCount: number;
    archivePage: number;
    archiveTotalPages: number;
    worksheetPageSize: number;
  };
};

export default function FulfillmentSummaryBar({
  activeTab,
  worksheetSummaryProps,
  archiveSummary,
}: FulfillmentSummaryBarProps) {
  if (activeTab === "worksheet" || activeTab === "confirmed") {
    return <ShipmentWorksheetOverview {...worksheetSummaryProps} />;
  }

  return (
    <div className="metric-grid">
      <div className="metric">
        <div className="metric-label">보관함 전체</div>
        <div className="metric-value">{formatNumber(archiveSummary.totalRowCount)}</div>
      </div>
      <div className="metric">
        <div className="metric-label">검색 결과</div>
        <div className="metric-value">{formatNumber(archiveSummary.filteredRowCount)}</div>
      </div>
      <div className="metric">
        <div className="metric-label">현재 페이지</div>
        <div className="metric-value">
          {archiveSummary.archivePage} / {archiveSummary.archiveTotalPages}
        </div>
      </div>
      <div className="metric">
        <div className="metric-label">페이지 크기</div>
        <div className="metric-value">{archiveSummary.worksheetPageSize}</div>
      </div>
    </div>
  );
}
