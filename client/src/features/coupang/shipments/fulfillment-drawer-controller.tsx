import { lazy, Suspense, type ReactNode } from "react";
import type {
  CoupangShipmentWorksheetAuditMissingResponse,
  CoupangShipmentWorksheetRow,
} from "@shared/coupang";
import type {
  ShipmentDetailClaimCardView,
  ShipmentDetailInfoRow,
  ShipmentDetailTable,
} from "./shipment-detail-dialog";
import type { FulfillmentDecisionPresentation, ShipmentExcelExportScope } from "./types";

const LazyShipmentAuditMissingDialog = lazy(() => import("./shipment-audit-missing-dialog"));
const LazyShipmentDecisionDrawer = lazy(() => import("./shipment-decision-drawer"));
const LazyShipmentDetailDialog = lazy(() => import("./shipment-detail-dialog"));
const LazyShipmentExcelSortDialog = lazy(() => import("./shipment-excel-sort-dialog"));
const LazyShipmentInvoiceInputDialog = lazy(() => import("./shipment-invoice-input-dialog"));

type FulfillmentDrawerControllerProps = {
  audit: {
    isOpen: boolean;
    result: CoupangShipmentWorksheetAuditMissingResponse | null;
    onClose: () => void;
  };
  decisionDrawer: {
    isOpen: boolean;
    rowTitle: string;
    heroMeta: string;
    decision: FulfillmentDecisionPresentation | null;
    worksheetStatusValue: ReactNode;
    invoiceStatusValue: ReactNode;
    claimStatusValue: ReactNode;
    worksheetRows: ShipmentDetailInfoRow[];
    deliveryRows: ShipmentDetailInfoRow[];
    statusRows: ShipmentDetailInfoRow[];
    activityRows: ShipmentDetailInfoRow[];
    handoffGuide: {
      title: string;
      description: string;
      links: ReadonlyArray<{
        href: string;
        label: string;
        variant?: "secondary" | "ghost";
      }>;
    } | null;
    isLoading: boolean;
    errorMessage: string | null;
    onClose: () => void;
    onOpenFullDetail: () => void;
  };
  detailDialog: {
    isOpen: boolean;
    rowTitle: string;
    heroMeta: string;
    worksheetStatusValue: ReactNode;
    invoiceStatusValue: ReactNode;
    claimStatusValue: ReactNode;
    worksheetRows: ShipmentDetailInfoRow[];
    deliveryRows: ShipmentDetailInfoRow[];
    statusRows: ShipmentDetailInfoRow[];
    isLoading: boolean;
    errorMessage: string | null;
    warningTitle: string | null;
    warningMessage: string | null;
    realtimeOrderRows: ShipmentDetailInfoRow[];
    orderItemsTable: ShipmentDetailTable | null;
    returnSummaryText: string;
    returnClaims: ShipmentDetailClaimCardView[];
    exchangeSummaryText: string;
    exchangeClaims: ShipmentDetailClaimCardView[];
    detailRow: CoupangShipmentWorksheetRow | null;
    onClose: () => void;
  };
  excelSortDialog: {
    isOpen: boolean;
    exportScope: ShipmentExcelExportScope;
    targetRowCount: number;
    blockedClaimCount: number;
    onClose: () => void;
    onApply: (sortKey: "productName" | "date") => void;
    getScopeLabel: (scope: ShipmentExcelExportScope) => string;
  };
  invoiceInputDialog: {
    isOpen: boolean;
    value: string;
    isBusy: boolean;
    onChange: (value: string) => void;
    onClose: () => void;
    onApply: () => void;
  };
};

export default function FulfillmentDrawerController({
  audit,
  decisionDrawer,
  detailDialog,
  excelSortDialog,
  invoiceInputDialog,
}: FulfillmentDrawerControllerProps) {
  return (
    <>
      <Suspense fallback={null}>
        <LazyShipmentAuditMissingDialog
          isOpen={audit.isOpen}
          result={audit.result}
          onClose={audit.onClose}
        />
      </Suspense>

      <Suspense fallback={null}>
        <LazyShipmentDecisionDrawer
          isOpen={decisionDrawer.isOpen}
          rowTitle={decisionDrawer.rowTitle}
          heroMeta={decisionDrawer.heroMeta}
          decision={decisionDrawer.decision}
          worksheetStatusValue={decisionDrawer.worksheetStatusValue}
          invoiceStatusValue={decisionDrawer.invoiceStatusValue}
          claimStatusValue={decisionDrawer.claimStatusValue}
          worksheetRows={decisionDrawer.worksheetRows}
          deliveryRows={decisionDrawer.deliveryRows}
          statusRows={decisionDrawer.statusRows}
          activityRows={decisionDrawer.activityRows}
          handoffGuide={decisionDrawer.handoffGuide}
          isLoading={decisionDrawer.isLoading}
          errorMessage={decisionDrawer.errorMessage}
          onClose={decisionDrawer.onClose}
          onOpenFullDetail={decisionDrawer.onOpenFullDetail}
        />
      </Suspense>

      <Suspense
        fallback={
          detailDialog.detailRow && detailDialog.isOpen ? (
            <div className="csv-overlay">
              <div className="csv-dialog detail-dialog shipment-detail-dialog">
                <div className="empty">상세 화면을 불러오는 중입니다...</div>
              </div>
            </div>
          ) : null
        }
      >
        <LazyShipmentDetailDialog
          isOpen={detailDialog.isOpen}
          rowTitle={detailDialog.rowTitle}
          heroMeta={detailDialog.heroMeta}
          worksheetStatusValue={detailDialog.worksheetStatusValue}
          invoiceStatusValue={detailDialog.invoiceStatusValue}
          claimStatusValue={detailDialog.claimStatusValue}
          worksheetRows={detailDialog.worksheetRows}
          deliveryRows={detailDialog.deliveryRows}
          statusRows={detailDialog.statusRows}
          isLoading={detailDialog.isLoading}
          errorMessage={detailDialog.errorMessage}
          warningTitle={detailDialog.warningTitle}
          warningMessage={detailDialog.warningMessage}
          realtimeOrderRows={detailDialog.realtimeOrderRows}
          orderItemsTable={detailDialog.orderItemsTable}
          returnSummaryText={detailDialog.returnSummaryText}
          returnClaims={detailDialog.returnClaims}
          exchangeSummaryText={detailDialog.exchangeSummaryText}
          exchangeClaims={detailDialog.exchangeClaims}
          onClose={detailDialog.onClose}
        />
      </Suspense>

      <Suspense fallback={null}>
        <LazyShipmentExcelSortDialog
          isOpen={excelSortDialog.isOpen}
          exportScope={excelSortDialog.exportScope}
          targetRowCount={excelSortDialog.targetRowCount}
          blockedClaimCount={excelSortDialog.blockedClaimCount}
          onClose={excelSortDialog.onClose}
          onApply={excelSortDialog.onApply}
          getScopeLabel={excelSortDialog.getScopeLabel}
        />
      </Suspense>

      <Suspense fallback={null}>
        <LazyShipmentInvoiceInputDialog
          isOpen={invoiceInputDialog.isOpen}
          value={invoiceInputDialog.value}
          isBusy={invoiceInputDialog.isBusy}
          onChange={invoiceInputDialog.onChange}
          onClose={invoiceInputDialog.onClose}
          onApply={invoiceInputDialog.onApply}
        />
      </Suspense>
    </>
  );
}
