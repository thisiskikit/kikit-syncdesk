import type { RequestHandler } from "express";
import type {
  CoupangProductFullEditPayload,
  CoupangProductMutationResponse,
  CoupangProductPartialEditPayload,
  CoupangVendorItemActionResponse,
} from "@shared/coupang";
import {
  getProductDetail,
  listProductExplorer,
  listProducts,
  updateFullProduct,
  updateOptionPrice,
  updateOptionPricesBulk,
  updateOptionQuantitiesBulk,
  updateOptionQuantity,
  updateOptionSaleStatusesBulk,
  updatePartialProduct,
  updateSaleStatus,
} from "../../../services/coupang/product-service";
import {
  registerOperationRetryHandler,
  runTrackedOperation,
  summarizeResult,
} from "../../../services/operations/service";
import { scheduleAutoPlatformFieldSyncRuns } from "../../../services/platform-field-sync-service";
import { sendData, sendError } from "../../../services/shared/api-response";
import {
  COUPANG_PRODUCTS_MENU_KEY,
} from "../../coupang/constants";
import {
  buildProductBatchPayload,
  buildVendorItemPayload,
} from "../../coupang/payloads";
import {
  asNumber,
  asOptionalString,
  asString,
  parsePositiveInteger,
  parseProductPriceTargets,
  parseProductQuantityTargets,
  parseProductSaleStatusTargets,
} from "../../coupang/parsers";
import {
  ensureStoreId,
  handleTrackedBatchAction,
  summarizeProductAction,
  summarizeVendorItemAction,
} from "../../coupang/tracked-actions";

let retryHandlersRegistered = false;

export function registerCoupangProductRetryHandlers() {
  if (retryHandlersRegistered) {
    return;
  }

  retryHandlersRegistered = true;

  registerOperationRetryHandler(
    {
      channel: "coupang",
      menuKey: COUPANG_PRODUCTS_MENU_KEY,
      actionKey: "update-price",
    },
    async ({ operation, requestPayload }) => {
      const request = (requestPayload ?? {}) as Record<string, unknown>;
      const storeId = asString(request.storeId);
      const sellerProductId = asOptionalString(request.sellerProductId);
      const vendorItemId = asString(request.vendorItemId);
      const price = asNumber(request.price);

      return runTrackedOperation({
        channel: "coupang",
        menuKey: COUPANG_PRODUCTS_MENU_KEY,
        actionKey: "update-price",
        mode: "retry",
        targetType: "vendorItem",
        targetCount: 1,
        targetIds: [vendorItemId],
        requestPayload: buildVendorItemPayload({
          storeId,
          sellerProductId,
          vendorItemId,
          valueKey: "price",
          value: price,
        }),
        normalizedPayload: buildVendorItemPayload({
          storeId,
          sellerProductId,
          vendorItemId,
          valueKey: "price",
          value: price,
        }),
        retryable: true,
        retryOfOperationId: operation.id,
        execute: async () => {
          const item = await updateOptionPrice({
            storeId,
            sellerProductId,
            vendorItemId,
            price,
          });

          return {
            data: { item } satisfies CoupangVendorItemActionResponse,
            status: item.status === "succeeded" ? "success" : "warning",
            resultSummary: summarizeResult({
              headline: summarizeVendorItemAction("가격 변경", item),
              stats: { vendorItemId: item.vendorItemId },
              preview: item.message,
            }),
          };
        },
      });
    },
  );

  registerOperationRetryHandler(
    {
      channel: "coupang",
      menuKey: COUPANG_PRODUCTS_MENU_KEY,
      actionKey: "update-quantity",
    },
    async ({ operation, requestPayload }) => {
      const request = (requestPayload ?? {}) as Record<string, unknown>;
      const storeId = asString(request.storeId);
      const sellerProductId = asOptionalString(request.sellerProductId);
      const vendorItemId = asString(request.vendorItemId);
      const quantity = asNumber(request.quantity);

      return runTrackedOperation({
        channel: "coupang",
        menuKey: COUPANG_PRODUCTS_MENU_KEY,
        actionKey: "update-quantity",
        mode: "retry",
        targetType: "vendorItem",
        targetCount: 1,
        targetIds: [vendorItemId],
        requestPayload: buildVendorItemPayload({
          storeId,
          sellerProductId,
          vendorItemId,
          valueKey: "quantity",
          value: quantity,
        }),
        normalizedPayload: buildVendorItemPayload({
          storeId,
          sellerProductId,
          vendorItemId,
          valueKey: "quantity",
          value: quantity,
        }),
        retryable: true,
        retryOfOperationId: operation.id,
        execute: async () => {
          const item = await updateOptionQuantity({
            storeId,
            sellerProductId,
            vendorItemId,
            quantity,
          });

          return {
            data: { item } satisfies CoupangVendorItemActionResponse,
            status: item.status === "succeeded" ? "success" : "warning",
            resultSummary: summarizeResult({
              headline: summarizeVendorItemAction("재고 변경", item),
              stats: { vendorItemId: item.vendorItemId },
              preview: item.message,
            }),
          };
        },
      });
    },
  );

  registerOperationRetryHandler(
    {
      channel: "coupang",
      menuKey: COUPANG_PRODUCTS_MENU_KEY,
      actionKey: "update-sale-status",
    },
    async ({ operation, requestPayload }) => {
      const request = (requestPayload ?? {}) as Record<string, unknown>;
      const storeId = asString(request.storeId);
      const sellerProductId = asOptionalString(request.sellerProductId);
      const vendorItemId = asString(request.vendorItemId);
      const saleStatus = request.saleStatus === "SUSPENDED" ? "SUSPENDED" : "ONSALE";

      return runTrackedOperation({
        channel: "coupang",
        menuKey: COUPANG_PRODUCTS_MENU_KEY,
        actionKey: "update-sale-status",
        mode: "retry",
        targetType: "vendorItem",
        targetCount: 1,
        targetIds: [vendorItemId],
        requestPayload: buildVendorItemPayload({
          storeId,
          sellerProductId,
          vendorItemId,
          valueKey: "saleStatus",
          value: saleStatus,
        }),
        normalizedPayload: buildVendorItemPayload({
          storeId,
          sellerProductId,
          vendorItemId,
          valueKey: "saleStatus",
          value: saleStatus,
        }),
        retryable: true,
        retryOfOperationId: operation.id,
        execute: async () => {
          const item = await updateSaleStatus({
            storeId,
            sellerProductId,
            vendorItemId,
            saleStatus,
          });

          return {
            data: { item } satisfies CoupangVendorItemActionResponse,
            status: item.status === "succeeded" ? "success" : "warning",
            resultSummary: summarizeResult({
              headline: summarizeVendorItemAction("판매상태 변경", item),
              stats: { vendorItemId: item.vendorItemId },
              preview: item.message,
            }),
          };
        },
      });
    },
  );
}

export const listProductsHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const result = await listProducts({
      storeId,
      maxPerPage: parsePositiveInteger(req.query.maxPerPage, 10),
      nextToken: typeof req.query.nextToken === "string" ? req.query.nextToken : null,
      sellerProductName:
        typeof req.query.sellerProductName === "string" ? req.query.sellerProductName : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      detailLevel: req.query.detailLevel === "summary" ? "summary" : "full",
    });

    sendData(res, result);
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_PRODUCTS_READ_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang products.",
    });
  }
};

export const listProductExplorerHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const searchField =
      req.query.searchField === "sellerProductName" ||
      req.query.searchField === "sellerProductId" ||
      req.query.searchField === "displayCategoryName" ||
      req.query.searchField === "brand" ||
      req.query.searchField === "statusName" ||
      req.query.searchField === "vendorItemName" ||
      req.query.searchField === "externalVendorSku"
        ? req.query.searchField
        : "all";
    const sortField =
      req.query.sortField === "sellerProductName" ||
      req.query.sortField === "sellerProductId" ||
      req.query.sortField === "displayCategoryName" ||
      req.query.sortField === "brand" ||
      req.query.sortField === "statusName" ||
      req.query.sortField === "optionCount" ||
      req.query.sortField === "minSalePrice" ||
      req.query.sortField === "deliveryCharge" ||
      req.query.sortField === "totalInventory" ||
      req.query.sortField === "saleStartedAt" ||
      req.query.sortField === "createdAt"
        ? req.query.sortField
        : "lastModifiedAt";
    const sortDirection = req.query.sortDirection === "asc" ? "asc" : "desc";
    const refresh = req.query.refresh === "1";

    const result = await listProductExplorer({
      storeId,
      searchField,
      searchQuery: typeof req.query.searchQuery === "string" ? req.query.searchQuery : "",
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      exposureCard:
        req.query.exposureCard === "restricted" ||
        req.query.exposureCard === "low" ||
        req.query.exposureCard === "normal" ||
        req.query.exposureCard === "unknown"
          ? req.query.exposureCard
          : "all",
      operationCard:
        req.query.operationCard === "suspended" ||
        req.query.operationCard === "zeroInventory" ||
        req.query.operationCard === "bestPriceGuaranteed"
          ? req.query.operationCard
          : "all",
      createdAtFrom:
        typeof req.query.createdAtFrom === "string" ? req.query.createdAtFrom : undefined,
      salePeriodFrom:
        typeof req.query.salePeriodFrom === "string" ? req.query.salePeriodFrom : undefined,
      salePeriodTo:
        typeof req.query.salePeriodTo === "string" ? req.query.salePeriodTo : undefined,
      sortField,
      sortDirection,
      page: parsePositiveInteger(req.query.page, 1),
      pageSize: parsePositiveInteger(req.query.pageSize, 20),
      refresh,
    });

    sendData(res, result);
    if (refresh) {
      void scheduleAutoPlatformFieldSyncRuns({
        channel: "coupang",
        storeId,
        refreshSource: true,
      });
    }
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_PRODUCT_EXPLORER_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang product explorer.",
    });
  }
};

export const getProductDetailHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "";
    const sellerProductId =
      typeof req.query.sellerProductId === "string" ? req.query.sellerProductId : "";

    if (!ensureStoreId(res, storeId)) {
      return;
    }

    if (!sellerProductId) {
      sendError(res, 400, {
        code: "MISSING_SELLER_PRODUCT_ID",
        message: "sellerProductId is required.",
      });
      return;
    }

    sendData(
      res,
      await getProductDetail({
        storeId,
        sellerProductId,
        refresh: req.query.refresh === "1",
      }),
    );
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_PRODUCT_DETAIL_FAILED",
      message: error instanceof Error ? error.message : "Failed to load Coupang product detail.",
    });
  }
};

export const updatePricesBulkHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseProductPriceTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_PRODUCTS_MENU_KEY,
      actionKey: "update-prices-bulk",
      targetType: "selection",
      targetIds: items.map((item) => item.vendorItemId),
      requestPayload: buildProductBatchPayload(storeId, items),
      detailLabel: "상품 옵션 가격 변경",
      validateItem: (item) => {
        if (!item.vendorItemId) return "vendorItemId is required.";
        if (!Number.isFinite(item.price) || item.price <= 0) return "price must be a positive number.";
        return null;
      },
      execute: ({ storeId: targetStoreId, items: targetItems }) =>
        updateOptionPricesBulk({
          storeId: targetStoreId,
          items: targetItems,
        }),
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_PRICE_BULK_UPDATE_FAILED",
      message: error instanceof Error ? error.message : "Failed to change Coupang prices.",
    });
  }
};

export const updateQuantitiesBulkHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseProductQuantityTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_PRODUCTS_MENU_KEY,
      actionKey: "update-quantities-bulk",
      targetType: "selection",
      targetIds: items.map((item) => item.vendorItemId),
      requestPayload: buildProductBatchPayload(storeId, items),
      detailLabel: "상품 옵션 재고 변경",
      validateItem: (item) => {
        if (!item.vendorItemId) return "vendorItemId is required.";
        if (!Number.isFinite(item.quantity) || item.quantity < 0) return "quantity must be zero or positive.";
        return null;
      },
      execute: ({ storeId: targetStoreId, items: targetItems }) =>
        updateOptionQuantitiesBulk({
          storeId: targetStoreId,
          items: targetItems,
        }),
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_QUANTITY_BULK_UPDATE_FAILED",
      message: error instanceof Error ? error.message : "Failed to change Coupang quantities.",
    });
  }
};

export const updateSaleStatusesBulkHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const items = parseProductSaleStatusTargets(req.body);

    await handleTrackedBatchAction({
      res,
      storeId,
      items,
      menuKey: COUPANG_PRODUCTS_MENU_KEY,
      actionKey: "update-sale-status-bulk",
      targetType: "selection",
      targetIds: items.map((item) => item.vendorItemId),
      requestPayload: buildProductBatchPayload(storeId, items),
      detailLabel: "상품 옵션 판매상태 변경",
      validateItem: (item) => {
        if (!item.vendorItemId) return "vendorItemId is required.";
        if (!item.saleStatus) return "saleStatus is required.";
        return null;
      },
      execute: ({ storeId: targetStoreId, items: targetItems }) =>
        updateOptionSaleStatusesBulk({
          storeId: targetStoreId,
          items: targetItems,
        }),
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_SALE_STATUS_BULK_UPDATE_FAILED",
      message: error instanceof Error ? error.message : "Failed to change Coupang sale statuses.",
    });
  }
};

export const updatePartialProductHandler: RequestHandler = async (req, res) => {
  try {
    const payload = req.body as CoupangProductPartialEditPayload;
    const storeId = asString(payload?.storeId);
    const sellerProductId = asString(payload?.sellerProductId);

    if (!ensureStoreId(res, storeId)) {
      return;
    }

    if (!sellerProductId) {
      sendError(res, 400, {
        code: "MISSING_SELLER_PRODUCT_ID",
        message: "sellerProductId is required.",
      });
      return;
    }

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_PRODUCTS_MENU_KEY,
      actionKey: "update-partial-product",
      mode: "foreground",
      targetType: "product",
      targetCount: 1,
      targetIds: [sellerProductId],
      requestPayload: payload as unknown as Record<string, unknown>,
      normalizedPayload: payload as unknown as Record<string, unknown>,
      retryable: true,
      execute: async () => {
        const item = await updatePartialProduct(payload);
        return {
          data: { item } satisfies CoupangProductMutationResponse,
          status: item.status === "succeeded" ? "success" : "warning",
          resultSummary: summarizeResult({
            headline: summarizeProductAction("배송/반품 수정", item),
            stats: { sellerProductId },
            preview: item.message,
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_PARTIAL_PRODUCT_UPDATE_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Failed to update Coupang product delivery info.",
    });
  }
};

export const updateFullProductHandler: RequestHandler = async (req, res) => {
  try {
    const payload = req.body as CoupangProductFullEditPayload;
    const storeId = asString(payload?.storeId);
    const sellerProductId = asString(payload?.sellerProductId);

    if (!ensureStoreId(res, storeId)) {
      return;
    }

    if (!sellerProductId) {
      sendError(res, 400, {
        code: "MISSING_SELLER_PRODUCT_ID",
        message: "sellerProductId is required.",
      });
      return;
    }

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_PRODUCTS_MENU_KEY,
      actionKey: "update-full-product",
      mode: "foreground",
      targetType: "product",
      targetCount: 1,
      targetIds: [sellerProductId],
      requestPayload: payload as unknown as Record<string, unknown>,
      normalizedPayload: payload as unknown as Record<string, unknown>,
      retryable: true,
      execute: async () => {
        const item = await updateFullProduct(payload);
        return {
          data: { item } satisfies CoupangProductMutationResponse,
          status: item.status === "succeeded" ? "success" : "warning",
          resultSummary: summarizeResult({
            headline: summarizeProductAction("상품 전체 수정", item),
            stats: { sellerProductId },
            preview: item.message,
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_FULL_PRODUCT_UPDATE_FAILED",
      message: error instanceof Error ? error.message : "Failed to update Coupang product.",
    });
  }
};

export const updatePriceHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const sellerProductId =
      typeof req.body?.sellerProductId === "string" ? req.body.sellerProductId : null;
    const vendorItemId = asString(req.body?.vendorItemId);
    const price = asNumber(req.body?.price);

    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_PRODUCTS_MENU_KEY,
      actionKey: "update-price",
      mode: "foreground",
      targetType: "vendorItem",
      targetCount: 1,
      targetIds: [vendorItemId],
      requestPayload: buildVendorItemPayload({
        storeId,
        sellerProductId,
        vendorItemId,
        valueKey: "price",
        value: price,
      }),
      normalizedPayload: buildVendorItemPayload({
        storeId,
        sellerProductId,
        vendorItemId,
        valueKey: "price",
        value: price,
      }),
      retryable: true,
      execute: async () => {
        const item = await updateOptionPrice({
          storeId,
          sellerProductId,
          vendorItemId,
          price,
        });

        return {
          data: { item } satisfies CoupangVendorItemActionResponse,
          status: item.status === "succeeded" ? "success" : "warning",
          resultSummary: summarizeResult({
            headline: summarizeVendorItemAction("가격 변경", item),
            stats: { vendorItemId: item.vendorItemId },
            preview: item.message,
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_PRICE_UPDATE_FAILED",
      message: error instanceof Error ? error.message : "Failed to change Coupang price.",
    });
  }
};

export const updateQuantityHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const sellerProductId =
      typeof req.body?.sellerProductId === "string" ? req.body.sellerProductId : null;
    const vendorItemId = asString(req.body?.vendorItemId);
    const quantity = asNumber(req.body?.quantity);

    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_PRODUCTS_MENU_KEY,
      actionKey: "update-quantity",
      mode: "foreground",
      targetType: "vendorItem",
      targetCount: 1,
      targetIds: [vendorItemId],
      requestPayload: buildVendorItemPayload({
        storeId,
        sellerProductId,
        vendorItemId,
        valueKey: "quantity",
        value: quantity,
      }),
      normalizedPayload: buildVendorItemPayload({
        storeId,
        sellerProductId,
        vendorItemId,
        valueKey: "quantity",
        value: quantity,
      }),
      retryable: true,
      execute: async () => {
        const item = await updateOptionQuantity({
          storeId,
          sellerProductId,
          vendorItemId,
          quantity,
        });

        return {
          data: { item } satisfies CoupangVendorItemActionResponse,
          status: item.status === "succeeded" ? "success" : "warning",
          resultSummary: summarizeResult({
            headline: summarizeVendorItemAction("재고 변경", item),
            stats: { vendorItemId: item.vendorItemId },
            preview: item.message,
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_QUANTITY_UPDATE_FAILED",
      message: error instanceof Error ? error.message : "Failed to change Coupang quantity.",
    });
  }
};

export const updateSaleStatusHandler: RequestHandler = async (req, res) => {
  try {
    const storeId = asString(req.body?.storeId);
    const sellerProductId =
      typeof req.body?.sellerProductId === "string" ? req.body.sellerProductId : null;
    const vendorItemId = asString(req.body?.vendorItemId);
    const saleStatus = req.body?.saleStatus === "SUSPENDED" ? "SUSPENDED" : "ONSALE";

    if (!ensureStoreId(res, storeId)) {
      return;
    }

    const tracked = await runTrackedOperation({
      channel: "coupang",
      menuKey: COUPANG_PRODUCTS_MENU_KEY,
      actionKey: "update-sale-status",
      mode: "foreground",
      targetType: "vendorItem",
      targetCount: 1,
      targetIds: [vendorItemId],
      requestPayload: buildVendorItemPayload({
        storeId,
        sellerProductId,
        vendorItemId,
        valueKey: "saleStatus",
        value: saleStatus,
      }),
      normalizedPayload: buildVendorItemPayload({
        storeId,
        sellerProductId,
        vendorItemId,
        valueKey: "saleStatus",
        value: saleStatus,
      }),
      retryable: true,
      execute: async () => {
        const item = await updateSaleStatus({
          storeId,
          sellerProductId,
          vendorItemId,
          saleStatus,
        });

        return {
          data: { item } satisfies CoupangVendorItemActionResponse,
          status: item.status === "succeeded" ? "success" : "warning",
          resultSummary: summarizeResult({
            headline: summarizeVendorItemAction("판매상태 변경", item),
            stats: { vendorItemId: item.vendorItemId },
            preview: item.message,
          }),
        };
      },
    });

    sendData(res, {
      ...tracked.data,
      operation: tracked.operation,
    });
  } catch (error) {
    sendError(res, 400, {
      code: "COUPANG_SALE_STATUS_UPDATE_FAILED",
      message: error instanceof Error ? error.message : "Failed to change Coupang sale status.",
    });
  }
};
