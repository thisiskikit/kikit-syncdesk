import { useState, type MouseEvent as ReactMouseEvent } from "react";
import type { CoupangProductDetail, CoupangProductExplorerRow } from "@shared/coupang";
import { getCoupangStatusClassName } from "@/lib/coupang-status";
import { formatNumber } from "@/lib/utils";

export type QuickActionKind = "price" | "quantity" | "saleStatus";

export type QuickOptionRow = {
  key: string;
  vendorItemId: string | null;
  sellerProductItemId: string | null;
  itemId: string | null;
  itemName: string;
  externalVendorSku: string | null;
  barcode: string | null;
  salePrice: number | null;
  inventoryCount: number | null;
  saleStatus: string;
};

export type QuickActionState = {
  kind: QuickActionKind;
  selectedIds: string[];
  priceDrafts: Record<string, string>;
  quantityDrafts: Record<string, string>;
  nextSaleStatus: "ONSALE" | "SUSPENDED";
  deliveryChargeDraft: string;
  bulkDraft: string;
  error: string | null;
};

export function buildQuickOptions(detail: CoupangProductDetail | null | undefined): QuickOptionRow[] {
  if (!detail) {
    return [];
  }

  return detail.items.map((option) => ({
    key: option.vendorItemId ?? option.sellerProductItemId ?? option.itemId ?? option.itemName,
    vendorItemId: option.vendorItemId ?? null,
    sellerProductItemId: option.sellerProductItemId ?? null,
    itemId: option.itemId ?? null,
    itemName: option.itemName,
    externalVendorSku: option.externalVendorSku ?? null,
    barcode: option.barcode ?? null,
    salePrice: option.salePrice ?? null,
    inventoryCount: option.inventoryCount ?? null,
    saleStatus: option.saleStatus,
  }));
}

function buildLabeledText(
  label: string,
  value: string | null | undefined,
  options: { preserveWhitespace?: boolean } = {},
) {
  if (!value || value.trim() === "") {
    return `${label}: -`;
  }

  return options.preserveWhitespace ? `${label}: ${value}` : `${label}: ${value.trim()}`;
}

export function buildOptionIdText(option: {
  vendorItemId?: string | null;
  sellerProductItemId?: string | null;
  itemId?: string | null;
}) {
  return [
    buildLabeledText("Vendor Item", option.vendorItemId),
    buildLabeledText("Seller Product Item", option.sellerProductItemId),
    buildLabeledText("Item", option.itemId),
  ].join(" / ");
}

export function buildProductIdText(row: {
  sellerProductId?: string | null;
  sellerProductItemId?: string | null;
}) {
  return [
    buildLabeledText("Seller Product", row.sellerProductId),
    buildLabeledText("Seller Product Item", row.sellerProductItemId),
  ].join(" / ");
}

function stopTableCellEvent(event: ReactMouseEvent<HTMLElement>) {
  event.stopPropagation();
}

export function ExpandableTableText(props: {
  value: string | null | undefined;
  maxLength?: number;
  muted?: boolean;
  monospace?: boolean;
  strong?: boolean;
  preserveWhitespace?: boolean;
}) {
  const value = props.value?.trim() ?? "";
  const maxLength = props.maxLength ?? 32;
  const [expanded, setExpanded] = useState(false);

  if (!value) {
    return <span className={props.muted ? "muted" : undefined}>-</span>;
  }

  const shouldTruncate = value.length > maxLength;
  const displayValue = shouldTruncate && !expanded ? `${value.slice(0, maxLength)}...` : value;
  const className = [props.muted ? "muted" : "", props.monospace ? "mono-text" : ""]
    .filter(Boolean)
    .join(" ");
  const content = props.strong ? <strong>{displayValue}</strong> : displayValue;

  return (
    <div className="table-text-stack">
      <span
        className={className || undefined}
        style={props.preserveWhitespace ? { whiteSpace: "pre-wrap" } : undefined}
      >
        {content}
      </span>
      {shouldTruncate ? (
        <button
          className="button ghost inline-button"
          type="button"
          onClick={(event) => {
            stopTableCellEvent(event);
            setExpanded((current) => !current);
          }}
        >
          {expanded ? "접기" : "더보기"}
        </button>
      ) : null}
    </div>
  );
}

function buildQuickDialogOptionPrimaryText(option: QuickOptionRow) {
  return option.externalVendorSku ?? option.vendorItemId ?? "vendorItemId 없음";
}

function buildQuickDialogBarcodeText(option: QuickOptionRow) {
  return option.barcode ? `바코드 ${option.barcode}` : "바코드 -";
}

function buildQuickDialogStatusChangeText(nextSaleStatus: "ONSALE" | "SUSPENDED") {
  return nextSaleStatus === "ONSALE" ? "판매중으로 변경" : "판매중지로 변경";
}

function buildQuickDialogTitle(kind: QuickActionKind) {
  if (kind === "price") {
    return "가격 / 배송비 빠른 수정";
  }

  if (kind === "quantity") {
    return "재고 빠른 수정";
  }

  return "판매상태 빠른 수정";
}

function buildQuickDialogBulkPlaceholder(kind: QuickActionKind) {
  if (kind === "price") {
    return "선택 옵션에 같은 판매가 적용";
  }

  return "선택 옵션에 같은 재고 적용";
}

export function buildExplorerOptionCountLabel(
  parent: CoupangProductExplorerRow,
  optionIndex: number,
) {
  return `${optionIndex + 1} / ${Math.max(parent.optionCount, 1)} 옵션`;
}

export function buildProductKindLabel(row: CoupangProductExplorerRow) {
  return row.vendorItems.length ? "상품 + 옵션" : "상품";
}

export function buildProductOptionHint(
  row: CoupangProductExplorerRow,
  isExpanded: boolean,
  optionIndividualView: boolean,
) {
  if (!row.vendorItems.length) {
    return null;
  }

  if (optionIndividualView) {
    return `${row.vendorItems.length}개 옵션 표시 중`;
  }

  return isExpanded ? "클릭하면 옵션 행을 접습니다." : "클릭하면 옵션 행이 펼쳐집니다.";
}

function buildSingleProductLabel() {
  return "단일 상품";
}

export function buildProductOptionCountText(row: CoupangProductExplorerRow) {
  if (!row.vendorItems.length) {
    return buildSingleProductLabel();
  }

  return `옵션 ${formatNumber(Math.max(row.optionCount, row.vendorItems.length))}개`;
}

export function buildParentProductLabel(name: string) {
  return `상위 상품: ${name}`;
}

function buildFreeDeliveryText() {
  return "무료";
}

export function formatDeliveryCharge(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return value <= 0 ? buildFreeDeliveryText() : `${formatNumber(value)}원`;
}

export function formatSalePriceRange(
  minSalePrice: number | null,
  maxSalePrice: number | null,
) {
  if (minSalePrice === null || maxSalePrice === null) {
    return "-";
  }

  if (minSalePrice === maxSalePrice) {
    return `${formatNumber(minSalePrice)}원`;
  }

  return `${formatNumber(minSalePrice)}원 ~ ${formatNumber(maxSalePrice)}원`;
}

function buildProductsCloseLabel() {
  return "닫기";
}

function buildProductsQuickDialogValidationLabel() {
  return "검증 필요";
}

function buildProductsQuickDialogSelectionSummary(count: number) {
  return `선택된 옵션 ${formatNumber(count)}개`;
}

function buildProductsQuickDialogSelectAllLabel(allSelected: boolean) {
  return allSelected ? "옵션 전체 해제" : "옵션 전체 선택";
}

function buildProductsQuickDialogNoEditTitle() {
  return "수정 불가";
}

function buildProductsQuickDialogNoEditMessage() {
  return "Fallback 데이터에서는 빠른 수정이 잠겨 있습니다.";
}

function buildProductsQuickDialogDescription() {
  return "여러 옵션 상품은 먼저 옵션을 선택한 뒤 한 번에 수정할 수 있습니다.";
}

function buildProductsQuickDialogCurrentValueLabel(kind: QuickActionKind) {
  if (kind === "price") {
    return "현재 판매가";
  }

  if (kind === "quantity") {
    return "현재 재고";
  }

  return "현재 상태";
}

function buildProductsQuickDialogNextValueLabel(kind: QuickActionKind) {
  if (kind === "price") {
    return "다음 판매가";
  }

  if (kind === "quantity") {
    return "다음 재고";
  }

  return "적용 상태";
}

function buildProductsQuickDialogCurrentValue(kind: QuickActionKind, option: QuickOptionRow) {
  if (kind === "price") {
    return option.salePrice === null ? "-" : `${formatNumber(option.salePrice)}원`;
  }

  if (kind === "quantity") {
    return option.inventoryCount === null ? "-" : `${formatNumber(option.inventoryCount)}개`;
  }

  return option.saleStatus;
}

export function buildVendorItemValueSummary(
  vendorItems: CoupangProductExplorerRow["vendorItems"],
  field: "externalVendorSku" | "barcode",
) {
  const values = Array.from(
    new Set(
      vendorItems
        .map((item) => item[field]?.trim() ?? "")
        .filter(Boolean),
    ),
  );

  if (!values.length) {
    return "-";
  }

  if (values.length === 1) {
    return values[0]!;
  }

  return `${values[0]} 외 ${formatNumber(values.length - 1)}건`;
}

export function buildPageTokens(currentPage: number, totalPages: number) {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.max(1, Math.min(currentPage, safeTotalPages));

  if (safeTotalPages <= 7) {
    return Array.from({ length: safeTotalPages }, (_, index) => index + 1) as Array<
      number | "ellipsis"
    >;
  }

  let start = Math.max(2, safeCurrentPage - 2);
  let end = Math.min(safeTotalPages - 1, safeCurrentPage + 2);

  while (end - start + 1 < 5 && start > 2) {
    start -= 1;
  }

  while (end - start + 1 < 5 && end < safeTotalPages - 1) {
    end += 1;
  }

  const tokens: Array<number | "ellipsis"> = [1];

  if (start > 2) {
    tokens.push("ellipsis");
  }

  for (let page = start; page <= end; page += 1) {
    tokens.push(page);
  }

  if (end < safeTotalPages - 1) {
    tokens.push("ellipsis");
  }

  tokens.push(safeTotalPages);
  return tokens;
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const [datePart] = value.split("T");
    return datePart || value;
  }

  return date.toLocaleDateString("ko-KR");
}

export function SalePeriodCell(props: {
  saleStartedAt: string | null;
  saleEndedAt: string | null;
}) {
  if (!props.saleStartedAt && !props.saleEndedAt) {
    return <span>-</span>;
  }

  return (
    <div style={{ display: "grid", gap: "0.15rem" }}>
      <div>{props.saleStartedAt ? formatDateOnly(props.saleStartedAt) : "시작 미지정"}</div>
      <div className="muted">
        {props.saleEndedAt ? `~ ${formatDateOnly(props.saleEndedAt)}` : "~ 종료 없음"}
      </div>
    </div>
  );
}

export function buildQuickActionState(
  kind: QuickActionKind,
  detail: CoupangProductDetail,
): QuickActionState {
  const options = buildQuickOptions(detail);
  const selectableIds = options.filter((option) => option.vendorItemId).map((option) => option.key);

  return {
    kind,
    selectedIds: selectableIds,
    priceDrafts: Object.fromEntries(
      options.map((option) => [option.key, option.salePrice !== null ? String(option.salePrice) : ""]),
    ),
    quantityDrafts: Object.fromEntries(
      options.map((option) => [
        option.key,
        option.inventoryCount !== null ? String(option.inventoryCount) : "",
      ]),
    ),
    nextSaleStatus:
      options.every((option) => option.saleStatus === "SUSPENDED") ? "ONSALE" : "SUSPENDED",
    deliveryChargeDraft:
      detail?.deliveryInfo.deliveryCharge !== null &&
      detail?.deliveryInfo.deliveryCharge !== undefined
        ? String(detail.deliveryInfo.deliveryCharge)
        : "",
    bulkDraft: "",
    error: null,
  };
}

export function QuickActionDialog(props: {
  productName: string;
  options: QuickOptionRow[];
  state: QuickActionState | null;
  isBusy: boolean;
  canEdit: boolean;
  onClose: () => void;
  onToggleOption: (optionKey: string) => void;
  onToggleAll: () => void;
  onBulkDraftChange: (value: string) => void;
  onApplyBulk: () => void;
  onPriceChange: (optionKey: string, value: string) => void;
  onQuantityChange: (optionKey: string, value: string) => void;
  onSaleStatusChange: (value: "ONSALE" | "SUSPENDED") => void;
  onSubmit: () => void;
}) {
  const state = props.state;

  if (!state) {
    return null;
  }

  const selectedIdSet = new Set(state.selectedIds);
  const selectableOptions = props.options.filter((option) => option.vendorItemId);
  const allSelected =
    selectableOptions.length > 0 &&
    selectableOptions.every((option) => selectedIdSet.has(option.key));

  return (
    <div className="csv-overlay" onMouseDown={props.onClose}>
      <div className="csv-dialog detail-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="stack" style={{ gap: "0.4rem" }}>
          <h3 style={{ margin: 0 }}>{buildQuickDialogTitle(state.kind)}</h3>
          <div>
            <strong>{props.productName}</strong>
          </div>
          <div className="muted">{buildProductsQuickDialogDescription()}</div>
        </div>

        {!props.canEdit ? (
          <div className="feedback warning">
            <strong>{buildProductsQuickDialogNoEditTitle()}</strong>
            <div className="muted">{buildProductsQuickDialogNoEditMessage()}</div>
          </div>
        ) : null}

        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <div className="selection-summary">
            {buildProductsQuickDialogSelectionSummary(state.selectedIds.length)}
          </div>
          <button
            className="button ghost"
            onClick={props.onToggleAll}
            disabled={!selectableOptions.length}
          >
            {buildProductsQuickDialogSelectAllLabel(allSelected)}
          </button>
        </div>

        {state.kind === "saleStatus" ? (
          <div className="segmented-control">
            <button
              className={`segmented-button ${state.nextSaleStatus === "ONSALE" ? "active" : ""}`}
              onClick={() => props.onSaleStatusChange("ONSALE")}
              type="button"
            >
              판매중
            </button>
            <button
              className={`segmented-button ${state.nextSaleStatus === "SUSPENDED" ? "active" : ""}`}
              onClick={() => props.onSaleStatusChange("SUSPENDED")}
              type="button"
            >
              판매중지
            </button>
          </div>
        ) : (
          <div className="toolbar">
            <input
              value={state.bulkDraft}
              onChange={(event) => props.onBulkDraftChange(event.target.value)}
              placeholder={buildQuickDialogBulkPlaceholder(state.kind)}
              inputMode="numeric"
              style={{ minWidth: 220 }}
            />
            <button className="button secondary" onClick={props.onApplyBulk}>
              선택 옵션 일괄 적용
            </button>
          </div>
        )}

        {state.error ? (
          <div className="feedback error">
            <strong>{buildProductsQuickDialogValidationLabel()}</strong>
            <div className="muted">{state.error}</div>
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>선택</th>
                <th>옵션명</th>
                <th>{buildProductsQuickDialogCurrentValueLabel(state.kind)}</th>
                <th>{buildProductsQuickDialogNextValueLabel(state.kind)}</th>
              </tr>
            </thead>
            <tbody>
              {props.options.map((option) => (
                <tr key={option.key}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIdSet.has(option.key)}
                      onChange={() => props.onToggleOption(option.key)}
                      disabled={!option.vendorItemId}
                    />
                  </td>
                  <td>
                    <div>
                      <ExpandableTableText value={option.itemName} maxLength={42} strong />
                    </div>
                    <ExpandableTableText
                      value={buildQuickDialogOptionPrimaryText(option)}
                      maxLength={34}
                      muted
                    />
                    <ExpandableTableText
                      value={buildQuickDialogBarcodeText(option)}
                      maxLength={34}
                      muted
                    />
                    <ExpandableTableText
                      value={buildOptionIdText(option)}
                      maxLength={48}
                      muted
                      monospace
                      preserveWhitespace
                    />
                  </td>
                  <td>
                    {state.kind === "saleStatus" ? (
                      <span className={`status-pill ${getCoupangStatusClassName(option.saleStatus)}`}>
                        {buildProductsQuickDialogCurrentValue(state.kind, option)}
                      </span>
                    ) : (
                      <div>{buildProductsQuickDialogCurrentValue(state.kind, option)}</div>
                    )}
                  </td>
                  <td>
                    {state.kind === "price" ? (
                      <input
                        value={state.priceDrafts[option.key] ?? ""}
                        onChange={(event) => props.onPriceChange(option.key, event.target.value)}
                        inputMode="numeric"
                        disabled={!selectedIdSet.has(option.key)}
                        style={{ width: 160 }}
                      />
                    ) : state.kind === "quantity" ? (
                      <input
                        value={state.quantityDrafts[option.key] ?? ""}
                        onChange={(event) => props.onQuantityChange(option.key, event.target.value)}
                        inputMode="numeric"
                        disabled={!selectedIdSet.has(option.key)}
                        style={{ width: 160 }}
                      />
                    ) : (
                      <span className={`status-pill ${getCoupangStatusClassName(state.nextSaleStatus)}`}>
                        {buildQuickDialogStatusChangeText(state.nextSaleStatus)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="detail-actions">
          <button className="button ghost" onClick={props.onClose} disabled={props.isBusy}>
            {buildProductsCloseLabel()}
          </button>
          <button
            className="button"
            onClick={props.onSubmit}
            disabled={props.isBusy || !props.canEdit}
          >
            {props.isBusy ? "처리 중..." : "선택 옵션 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
