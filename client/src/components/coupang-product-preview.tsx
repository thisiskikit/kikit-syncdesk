import { useEffect, useState, type ReactNode } from "react";
import type {
  CoupangProductDetail,
  CoupangProductEditableItem,
  CoupangProductExplorerRow,
  CoupangQuickEditOptionRow,
} from "@shared/coupang";
import {
  buildCoupangExposureBadges,
  buildCoupangOperationSummary,
  resolveCoupangExposureInput,
} from "@/lib/coupang-product-operations";
import { getCoupangStatusClassName } from "@/lib/coupang-status";
import { formatDate, formatNumber } from "@/lib/utils";

function formatWon(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return `${formatNumber(value)}원`;
}

function formatCountWithUnit(value: number | null | undefined, unit = "개") {
  if (value === null || value === undefined) {
    return "-";
  }

  return `${formatNumber(value)}${unit}`;
}

function buildImageList(
  detail: CoupangProductDetail | null | undefined,
  summary: CoupangProductExplorerRow | null | undefined,
  draftImages?: string[] | null,
) {
  const images = new Set<string>();

  for (const image of draftImages ?? []) {
    if (image) {
      images.add(image);
    }
  }

  for (const image of detail?.previewImages ?? []) {
    if (image) {
      images.add(image);
    }
  }

  for (const image of detail?.images ?? []) {
    if (image.url) {
      images.add(image.url);
    } else if (image.cdnPath) {
      images.add(image.cdnPath);
    } else if (image.vendorPath) {
      images.add(image.vendorPath);
    }
  }

  for (const item of detail?.items ?? []) {
    for (const image of item.images) {
      if (image.url) {
        images.add(image.url);
      } else if (image.cdnPath) {
        images.add(image.cdnPath);
      } else if (image.vendorPath) {
        images.add(image.vendorPath);
      }
    }
  }

  if (summary?.thumbnailUrl) {
    images.add(summary.thumbnailUrl);
  }

  return Array.from(images).slice(0, 12);
}

function buildOptionAttributeText(item: CoupangProductEditableItem) {
  const labels = item.attributes
    .map((attribute) => {
      const typeName = attribute.attributeTypeName?.trim();
      const valueName = attribute.attributeValueName?.trim();
      if (typeName && valueName) {
        return `${typeName}: ${valueName}`;
      }
      return valueName || typeName || "";
    })
    .filter(Boolean);

  return labels.length ? labels.join(" / ") : "-";
}

function isEditableOptionRow(
  item: CoupangProductEditableItem | CoupangQuickEditOptionRow,
): item is CoupangProductEditableItem {
  return "images" in item;
}

function buildJoinedIdText(
  values: Array<{ label: string; value: string | null | undefined }>,
) {
  const parts = values
    .filter((entry) => entry.value)
    .map((entry) => `${entry.label} ${entry.value}`);

  return parts.length ? parts.join(" / ") : "-";
}

function buildProductIdText(
  detail: CoupangProductDetail | null | undefined,
  summary: CoupangProductExplorerRow | null | undefined,
) {
  return buildJoinedIdText([
    { label: "sellerProductId", value: detail?.sellerProductId ?? summary?.sellerProductId },
    { label: "productId", value: detail?.productId ?? summary?.productId },
  ]);
}

function buildOptionIdText(item: {
  vendorItemId?: string | null;
  sellerProductItemId?: string | null;
  itemId?: string | null;
}) {
  return buildJoinedIdText([
    { label: "vendorItemId", value: item.vendorItemId },
    { label: "sellerProductItemId", value: item.sellerProductItemId },
    { label: "itemId", value: item.itemId },
  ]);
}

function buildPreviewHtml(
  detail: CoupangProductDetail | null | undefined,
  draftHtml?: string | null,
) {
  if (draftHtml && draftHtml.trim()) {
    return draftHtml;
  }

  if (detail?.previewHtml && detail.previewHtml.trim()) {
    return detail.previewHtml;
  }

  const htmlBlocks = (detail?.contents ?? [])
    .flatMap((group) => group.contentDetails)
    .map((detailItem) => detailItem.content?.trim() ?? "")
    .filter(Boolean);

  if (!htmlBlocks.length) {
    return null;
  }

  return htmlBlocks.join("\n");
}

function formatCommission(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${formatNumber(Number(normalized.toFixed(2)))}%`;
}

function buildOptionPriceMeta(item: {
  originalPrice?: number | null;
  supplyPrice?: number | null;
}) {
  const parts = [
    item.originalPrice !== null && item.originalPrice !== undefined
      ? `정가 ${formatWon(item.originalPrice)}`
      : null,
    item.supplyPrice !== null && item.supplyPrice !== undefined
      ? `공급가 ${formatWon(item.supplyPrice)}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length ? parts.join(" / ") : "-";
}

function buildOptionOperationMeta(item: {
  saleAgentCommission?: number | null;
  bestPriceGuaranteed3P?: boolean | null;
  maximumBuyCount?: number | null;
}) {
  const parts = [
    item.saleAgentCommission !== null && item.saleAgentCommission !== undefined
      ? `수수료 ${formatCommission(item.saleAgentCommission)}`
      : null,
    item.bestPriceGuaranteed3P === true
      ? "최저가보장"
      : item.bestPriceGuaranteed3P === false
        ? "최저가보장 미적용"
        : null,
    item.maximumBuyCount !== null && item.maximumBuyCount !== undefined
      ? `최대구매 ${formatCountWithUnit(item.maximumBuyCount, "")}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length ? parts.join(" / ") : "-";
}

function formatPriceRange(
  summary: CoupangProductExplorerRow | null | undefined,
  detail: CoupangProductDetail | null | undefined,
) {
  if (summary?.minSalePrice !== null && summary?.minSalePrice !== undefined) {
    if (summary.minSalePrice === summary.maxSalePrice) {
      return formatWon(summary.minSalePrice);
    }

    return `${formatWon(summary.minSalePrice)} ~ ${formatWon(summary.maxSalePrice)}`;
  }

  const salePrices = (detail?.items ?? [])
    .map((item) => item.salePrice)
    .filter((value): value is number => value !== null && value !== undefined);

  if (!salePrices.length) {
    return "-";
  }

  const minPrice = Math.min(...salePrices);
  const maxPrice = Math.max(...salePrices);
  return minPrice === maxPrice ? formatWon(minPrice) : `${formatWon(minPrice)} ~ ${formatWon(maxPrice)}`;
}

function formatDeliveryCharge(
  summary: CoupangProductExplorerRow | null | undefined,
  detail: CoupangProductDetail | null | undefined,
) {
  const value = detail?.deliveryInfo.deliveryCharge ?? summary?.deliveryCharge ?? null;

  if (value === null || value === undefined) {
    return "-";
  }

  if (value <= 0) {
    return "무료";
  }

  return formatWon(value);
}

function formatInventory(
  summary: CoupangProductExplorerRow | null | undefined,
  detail: CoupangProductDetail | null | undefined,
) {
  if (summary?.totalInventory !== null && summary?.totalInventory !== undefined) {
    return formatCountWithUnit(summary.totalInventory);
  }

  const itemRows = detail?.items ?? [];
  if (!itemRows.length) {
    return "-";
  }

  const total = itemRows.reduce((sum, item) => sum + (item.inventoryCount ?? 0), 0);
  return formatCountWithUnit(total);
}

function formatOptionCount(
  summary: CoupangProductExplorerRow | null | undefined,
  detail: CoupangProductDetail | null | undefined,
) {
  if (typeof summary?.optionCount === "number") {
    return formatCountWithUnit(summary.optionCount);
  }

  return detail?.items?.length ? formatCountWithUnit(detail.items.length) : "-";
}

function PreviewFrame(props: { html: string | null }) {
  if (!props.html) {
    return <div className="preview-empty-box">상세 HTML 미리보기를 표시할 데이터가 없습니다.</div>;
  }

  return <iframe className="preview-frame" srcDoc={props.html} sandbox="" title="쿠팡 상세 미리보기" />;
}

function OptionTable(props: {
  rows: Array<CoupangProductEditableItem | CoupangQuickEditOptionRow>;
  showAttributes?: boolean;
}) {
  const { rows, showAttributes = false } = props;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>옵션명</th>
            {showAttributes ? <th>속성</th> : null}
            <th>판매가</th>
            <th>재고</th>
            <th>판매상태</th>
            <th>운영</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr
              key={
                item.vendorItemId ??
                item.sellerProductItemId ??
                item.itemId ??
                `${item.itemName}:${item.externalVendorSku ?? "option"}`
              }
            >
              <td>
                <div>
                  <strong>{item.itemName}</strong>
                </div>
                <div className="muted">{item.externalVendorSku ?? item.vendorItemId ?? "-"}</div>
                <div className="muted">{buildOptionIdText(item)}</div>
              </td>
              {showAttributes ? (
                <td>{isEditableOptionRow(item) ? buildOptionAttributeText(item) : "-"}</td>
              ) : null}
              <td>
                <div>
                  <strong>{formatWon(item.salePrice)}</strong>
                </div>
                <div className="muted">{buildOptionPriceMeta(item)}</div>
              </td>
              <td>{formatCountWithUnit(item.inventoryCount)}</td>
              <td>
                <span className={`status-pill ${getCoupangStatusClassName(item.saleStatus)}`}>
                  {item.saleStatus}
                </span>
              </td>
              <td>
                <div className="muted">{buildOptionOperationMeta(item)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CoupangProductPreview(props: {
  detail?: CoupangProductDetail | null;
  summary?: CoupangProductExplorerRow | null;
  isLoading?: boolean;
  emptyMessage?: string;
  headerActions?: ReactNode;
  draftHtml?: string | null;
  draftImages?: string[] | null;
}) {
  const detail = props.detail ?? null;
  const summary = props.summary ?? null;
  const previewHtml = buildPreviewHtml(detail, props.draftHtml);
  const imageUrls = buildImageList(detail, summary, props.draftImages);
  const [showOptionAttributes, setShowOptionAttributes] = useState(false);
  const optionRows = detail?.items ?? [];
  const summaryRows = summary?.vendorItems ?? [];
  const hasOptionAttributes = optionRows.some((item) => buildOptionAttributeText(item) !== "-");
  const notices = detail?.notices ?? [];
  const tags = detail?.searchTags ?? [];
  const hasData = Boolean(detail || summary);
  const exposureInput = resolveCoupangExposureInput(detail, summary);
  const exposureBadges = buildCoupangExposureBadges(exposureInput);
  const onSaleOptionCount =
    summary?.onSaleOptionCount ?? optionRows.filter((item) => item.saleStatus === "ONSALE").length;
  const suspendedOptionCount =
    summary?.suspendedOptionCount ?? optionRows.filter((item) => item.saleStatus === "SUSPENDED").length;
  const zeroInventoryOptionCount =
    summary?.zeroInventoryOptionCount ??
    optionRows.filter(
      (item) => typeof item.inventoryCount === "number" && item.inventoryCount <= 0,
    ).length;
  const bestPriceGuaranteedOptionCount =
    summary?.bestPriceGuaranteedOptionCount ??
    optionRows.filter((item) => item.bestPriceGuaranteed3P === true).length;
  const operationSummary =
    buildCoupangOperationSummary({
      onSaleOptionCount,
      suspendedOptionCount,
      zeroInventoryOptionCount,
      bestPriceGuaranteedOptionCount,
    }) ?? "-";

  useEffect(() => {
    setShowOptionAttributes(false);
  }, [detail?.sellerProductId, summary?.sellerProductId]);

  if (props.isLoading && !hasData) {
    return <div className="empty">상품 상세와 미리보기를 불러오는 중입니다.</div>;
  }

  if (!hasData) {
    return <div className="empty">{props.emptyMessage ?? "미리보기할 상품을 선택해 주세요."}</div>;
  }

  return (
    <div className="stack preview-stack">
      <div className="card preview-card">
        <div className="card-header">
          <div className="stack" style={{ gap: "0.35rem" }}>
            <div className="toolbar">
              <span className={`status-pill ${getCoupangStatusClassName(detail?.statusName ?? summary?.statusName)}`}>
                {detail?.statusName ?? summary?.statusName ?? "상태 미확인"}
              </span>
              {exposureBadges.map((badge) => (
                <span key={badge.key} className={`status-pill ${badge.className}`}>
                  {badge.label}
                </span>
              ))}
              {detail && !detail.canEdit ? <span className="status-pill locked">수정 잠금</span> : null}
            </div>
            <h3 style={{ margin: 0 }}>
              {detail?.sellerProductName ?? summary?.sellerProductName ?? "상품명 없음"}
            </h3>
            <div className="muted">상품번호 {detail?.sellerProductId ?? summary?.sellerProductId ?? "-"}</div>
            <div className="muted">{buildProductIdText(detail, summary)}</div>
          </div>
          {props.headerActions}
        </div>

        {detail && !detail.canEdit && detail.editLocks.length ? (
          <div className="feedback warning">
            <strong>수정 잠금</strong>
            <div className="muted">{detail.editLocks.join(" / ")}</div>
          </div>
        ) : null}

        <div className="preview-gallery">
          {imageUrls.length ? (
            imageUrls.map((imageUrl, index) => (
              <div key={`${imageUrl}:${index}`} className="preview-thumb-shell">
                <img className="preview-thumb" src={imageUrl} alt={`상품 이미지 ${index + 1}`} />
              </div>
            ))
          ) : (
            <div className="preview-empty-box">등록된 이미지가 없습니다.</div>
          )}
        </div>
      </div>

      <div className="preview-metrics">
        <div className="metric">
          <div className="metric-label">가격 범위</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatPriceRange(summary, detail)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">배송비</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatDeliveryCharge(summary, detail)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">옵션 수</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatOptionCount(summary, detail)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">재고 합계</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatInventory(summary, detail)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">노출 상태</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {exposureBadges.map((badge) => badge.label).join(" / ")}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">판매중지 옵션</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatNumber(suspendedOptionCount)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">재고 0 옵션</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatNumber(zeroInventoryOptionCount)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">최저가보장 옵션</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {formatNumber(bestPriceGuaranteedOptionCount)}
          </div>
        </div>
      </div>

      <div className="card preview-card">
        <div className="preview-section-header">
          <h3 style={{ margin: 0 }}>배송 / 반품 정보</h3>
        </div>
        <div className="detail-grid">
          <div className="detail-card">
            <strong>카테고리</strong>
            <p>{detail?.displayCategoryName ?? summary?.displayCategoryName ?? "-"}</p>
          </div>
          <div className="detail-card">
            <strong>브랜드</strong>
            <p>{detail?.brand ?? summary?.brand ?? "-"}</p>
          </div>
          <div className="detail-card">
            <strong>운영 요약</strong>
            <p>{operationSummary}</p>
          </div>
          <div className="detail-card">
            <strong>배송 방식</strong>
            <p>{detail?.deliveryInfo.deliveryMethod ?? "-"}</p>
          </div>
          <div className="detail-card">
            <strong>반품지</strong>
            <p>{detail?.deliveryInfo.returnAddress ?? "-"}</p>
          </div>
          <div className="detail-card">
            <strong>최종 수정</strong>
            <p>{formatDate(summary?.lastModifiedAt ?? detail?.createdAt)}</p>
          </div>
          <div className="detail-card">
            <strong>생성일</strong>
            <p>{formatDate(summary?.createdAt ?? detail?.createdAt)}</p>
          </div>
        </div>
      </div>

      <div className="card preview-card">
        <div className="preview-section-header">
          <h3 style={{ margin: 0 }}>옵션 요약</h3>
          {hasOptionAttributes ? (
            <button
              type="button"
              className="button ghost"
              onClick={() => setShowOptionAttributes((current) => !current)}
            >
              {showOptionAttributes ? "속성 숨기기" : "속성 보기"}
            </button>
          ) : null}
        </div>
        {optionRows.length ? (
          <OptionTable rows={optionRows} showAttributes={showOptionAttributes} />
        ) : summaryRows.length ? (
          <OptionTable rows={summaryRows} />
        ) : (
          <div className="preview-empty-box">옵션 데이터가 없습니다.</div>
        )}
      </div>

      <div className="detail-columns">
        <div className="card preview-card">
          <div className="preview-section-header">
            <h3 style={{ margin: 0 }}>검색 태그</h3>
          </div>
          {tags.length ? (
            <div className="chip-row">
              {tags.map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <div className="preview-empty-box">등록된 검색 태그가 없습니다.</div>
          )}
        </div>

        <div className="card preview-card">
          <div className="preview-section-header">
            <h3 style={{ margin: 0 }}>고시정보</h3>
          </div>
          {notices.length ? (
            <div className="stack" style={{ gap: "0.6rem" }}>
              {notices.map((notice, index) => (
                <div key={`${notice.noticeCategoryName ?? "notice"}:${index}`} className="detail-box">
                  <strong>{notice.noticeCategoryName ?? "고시 항목"}</strong>
                  <p>
                    {notice.noticeCategoryDetailName ?? "-"}
                    {"\n"}
                    {notice.content ?? "-"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="preview-empty-box">등록된 고시정보가 없습니다.</div>
          )}
        </div>
      </div>

      <div className="card preview-card">
        <div className="preview-section-header">
          <h3 style={{ margin: 0 }}>상세 HTML 미리보기</h3>
        </div>
        <PreviewFrame html={previewHtml} />
      </div>
    </div>
  );
}
