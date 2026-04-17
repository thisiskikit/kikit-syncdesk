import type { ComponentProps } from "react";
import { StatusBadge } from "@/components/status-badge";
import ShipmentBaseFilters from "./shipment-base-filters";

type FulfillmentActiveTab = "worksheet" | "archive" | "settings";

type FulfillmentToolbarProps = {
  activeTab: FulfillmentActiveTab;
  activeSheetSource: "live" | "fallback" | null;
  busyAction: string | null;
  collectActionDisabled: boolean;
  prepareActionDisabled: boolean;
  transmitActionDisabled: boolean;
  openInvoiceInputDisabled: boolean;
  openExcelExportDisabled: boolean;
  openNotExportedExcelExportDisabled: boolean;
  transmitActionBusyLabel: string;
  dirtyCount: number;
  isFallback: boolean;
  selectedRowsCount: number;
  selectedExportBlockedRowsCount: number;
  selectedInvoiceBlockedRowsCount: number;
  notExportedCount: number;
  claimScopeCount: number;
  filtersProps: ComponentProps<typeof ShipmentBaseFilters>;
  onChangeTab: (tab: FulfillmentActiveTab) => void;
  onQuickCollect: () => void;
  onPrepareAcceptedOrders: () => void;
  onTransmit: () => void;
  onOpenInvoiceInput: () => void;
  onOpenSelectedExcelExport: () => void;
  onOpenNotExportedExcelExport: () => void;
  onSaveChanges: () => void;
  onAuditMissing: () => void;
  onCollectIncremental: () => void;
  onCollectFull: () => void;
};

export default function FulfillmentToolbar({
  activeTab,
  activeSheetSource,
  busyAction,
  collectActionDisabled,
  prepareActionDisabled,
  transmitActionDisabled,
  openInvoiceInputDisabled,
  openExcelExportDisabled,
  openNotExportedExcelExportDisabled,
  transmitActionBusyLabel,
  dirtyCount,
  isFallback,
  selectedRowsCount,
  selectedExportBlockedRowsCount,
  selectedInvoiceBlockedRowsCount,
  notExportedCount,
  claimScopeCount,
  filtersProps,
  onChangeTab,
  onQuickCollect,
  onPrepareAcceptedOrders,
  onTransmit,
  onOpenInvoiceInput,
  onOpenSelectedExcelExport,
  onOpenNotExportedExcelExport,
  onSaveChanges,
  onAuditMissing,
  onCollectIncremental,
  onCollectFull,
}: FulfillmentToolbarProps) {
  return (
    <>
      <div className="card shipment-page-header">
        <div className="shipment-page-header-main">
          <div className="hero">
            <div className="hero-badges">
              <StatusBadge
                tone={activeSheetSource === "live" ? "live" : "draft"}
                label={activeSheetSource === "live" ? "실시간 동기" : "대체 데이터"}
              />
              <StatusBadge
                tone="shared"
                label={
                  activeTab === "archive"
                    ? "보관함"
                    : activeTab === "settings"
                      ? "화면 설정"
                      : "출고 운영"
                }
              />
            </div>
            <h1>
              {activeTab === "archive"
                ? "출고 보관함"
                : activeTab === "settings"
                  ? "출고 화면 설정"
                  : "출고"}
            </h1>
            <p>
              오늘 처리할 출고 판단, 송장 입력과 전송, 누락 검수, 예외 확인을 한 화면에서 이어서
              처리합니다.
            </p>
            <div className="segmented-control" style={{ marginTop: "0.75rem", width: "fit-content" }}>
              <button
                className={`segmented-button${activeTab === "worksheet" ? " active" : ""}`}
                onClick={() => onChangeTab("worksheet")}
              >
                작업 화면
              </button>
              <button
                className={`segmented-button${activeTab === "archive" ? " active" : ""}`}
                onClick={() => onChangeTab("archive")}
              >
                보관함
              </button>
              <button
                className={`segmented-button${activeTab === "settings" ? " active" : ""}`}
                onClick={() => onChangeTab("settings")}
              >
                화면 설정
              </button>
            </div>
          </div>

          <div className="shipment-page-actions">
            {activeTab !== "archive" ? (
              <div className="shipment-primary-actions">
                <button className="button" onClick={onQuickCollect} disabled={collectActionDisabled}>
                  {busyAction === "collect-new" ? "빠른 수집 중..." : "빠른 수집"}
                </button>
                <button
                  className="button secondary"
                  onClick={onPrepareAcceptedOrders}
                  disabled={prepareActionDisabled}
                >
                  {busyAction === "prepare-orders"
                    ? "상품준비중 처리 중..."
                    : "결제완료 -> 상품준비중"}
                </button>
                <button
                  className="button secondary"
                  onClick={onTransmit}
                  disabled={transmitActionDisabled}
                >
                  {transmitActionBusyLabel}
                </button>
                <button
                  className="button ghost"
                  onClick={onOpenInvoiceInput}
                  disabled={openInvoiceInputDisabled}
                >
                  송장 입력
                </button>
                <button
                  className="button ghost"
                  onClick={onOpenSelectedExcelExport}
                  disabled={openExcelExportDisabled}
                >
                  선택 행 엑셀 다운로드
                </button>
                <button
                  className="button ghost"
                  onClick={onOpenNotExportedExcelExport}
                  disabled={openNotExportedExcelExportDisabled}
                >
                  미출력건 엑셀 다운로드
                </button>
                {selectedRowsCount > 0 && selectedExportBlockedRowsCount > 0 ? (
                  <div className="muted action-disabled-reason">
                    선택한 클레임 {selectedExportBlockedRowsCount}건은 엑셀 다운로드에서 제외됩니다.
                  </div>
                ) : null}
                {notExportedCount > 0 && claimScopeCount > 0 ? (
                  <div className="muted action-disabled-reason">
                    클레임 주문은 미출력건 전체 다운로드에서도 자동 제외됩니다.
                  </div>
                ) : null}
                {dirtyCount ? (
                  <button className="button secondary" onClick={onSaveChanges} disabled={busyAction !== null}>
                    {busyAction === "save" ? "저장 중..." : "변경 저장"}
                  </button>
                ) : null}
                <details className="shipment-manage-actions">
                  <summary className="shipment-manage-actions-trigger">관리 작업</summary>
                  <div className="shipment-manage-actions-menu">
                    <button
                      className="button ghost"
                      onClick={onAuditMissing}
                      disabled={collectActionDisabled}
                    >
                      {busyAction === "audit-missing" ? "누락 검수 중..." : "누락 검수"}
                    </button>
                    <button
                      className="button ghost"
                      onClick={onCollectIncremental}
                      disabled={collectActionDisabled}
                    >
                      {busyAction === "collect-incremental" ? "재수집 중..." : "전체 재수집"}
                    </button>
                    <button
                      className="button ghost"
                      onClick={onCollectFull}
                      disabled={collectActionDisabled}
                    >
                      {busyAction === "collect-full" ? "재동기화 중..." : "전체 재동기화"}
                    </button>
                  </div>
                </details>
              </div>
            ) : (
              <div className="shipment-primary-actions">
                <div className="muted">
                  보관함은 읽기 전용입니다. 상세 확인만 가능하고 수정, 송장 처리, 상품준비중 처리 등은
                  비활성화됩니다.
                </div>
              </div>
            )}
            {activeTab !== "archive" && isFallback ? (
              <div className="muted action-disabled-reason">
                대체 데이터에서는 송장 전송을 실행할 수 없습니다.
              </div>
            ) : activeTab !== "archive" && selectedInvoiceBlockedRowsCount ? (
              <div className="muted action-disabled-reason">
                선택 송장 전송에서는 클레임 {selectedInvoiceBlockedRowsCount}건이 제외됩니다.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ShipmentBaseFilters {...filtersProps} />
    </>
  );
}
