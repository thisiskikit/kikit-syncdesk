import "../server/load-env";
import { fetchNaverProducts } from "../server/services/naver-product-service";
import { channelSettingsStore } from "../server/services/channel-settings-store";
import { issueNaverAccessToken } from "../server/services/naver-auth";
import { naverProductSellerBarcodeCacheStore } from "../server/services/naver-product-seller-barcode-cache-store";

const NAVER_API_BASE_URL =
  process.env.NAVER_COMMERCE_API_BASE_URL || "https://api.commerce.naver.com/external";
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_DELAY_MS = 500;
const DEFAULT_RETRY_LIMIT = 6;
const DEFAULT_RETRY_DELAY_MS = 2_000;
const DEFAULT_FLUSH_BATCH_SIZE = 25;

type CliOptions = {
  storeId: string | null;
  refreshList: boolean;
  delayMs: number;
  retryLimit: number;
  retryDelayMs: number;
  maxItems: number | null;
};

type SellerBarcodeRequestResult =
  | {
      status: "resolved";
      sellerBarcode: string;
    }
  | {
      status: "missing";
      message: string;
    }
  | {
      status: "failed";
      message: string;
    };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseIntegerOption(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function parseOptionalIntegerOption(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function parseCliOptions(argv: string[]): CliOptions {
  let storeId: string | null = null;
  let refreshList = false;
  let delayMs = DEFAULT_DELAY_MS;
  let retryLimit = DEFAULT_RETRY_LIMIT;
  let retryDelayMs = DEFAULT_RETRY_DELAY_MS;
  let maxItems: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === "--storeId" && nextValue) {
      storeId = nextValue.trim() || null;
      index += 1;
      continue;
    }

    if (argument === "--refresh-list") {
      refreshList = true;
      continue;
    }

    if (argument === "--delayMs") {
      delayMs = parseIntegerOption(nextValue, DEFAULT_DELAY_MS);
      index += 1;
      continue;
    }

    if (argument === "--retryLimit") {
      retryLimit = parseIntegerOption(nextValue, DEFAULT_RETRY_LIMIT);
      index += 1;
      continue;
    }

    if (argument === "--retryDelayMs") {
      retryDelayMs = parseIntegerOption(nextValue, DEFAULT_RETRY_DELAY_MS);
      index += 1;
      continue;
    }

    if (argument === "--max") {
      maxItems = parseOptionalIntegerOption(nextValue);
      index += 1;
    }
  }

  return {
    storeId,
    refreshList,
    delayMs,
    retryLimit,
    retryDelayMs,
    maxItems,
  };
}

function extractSellerBarcode(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const originProduct =
    root.originProduct && typeof root.originProduct === "object" && !Array.isArray(root.originProduct)
      ? (root.originProduct as Record<string, unknown>)
      : root;
  const detailAttribute =
    originProduct.detailAttribute &&
    typeof originProduct.detailAttribute === "object" &&
    !Array.isArray(originProduct.detailAttribute)
      ? (originProduct.detailAttribute as Record<string, unknown>)
      : null;
  const sellerCodeInfo =
    detailAttribute?.sellerCodeInfo &&
    typeof detailAttribute.sellerCodeInfo === "object" &&
    !Array.isArray(detailAttribute.sellerCodeInfo)
      ? (detailAttribute.sellerCodeInfo as Record<string, unknown>)
      : originProduct.sellerCodeInfo &&
          typeof originProduct.sellerCodeInfo === "object" &&
          !Array.isArray(originProduct.sellerCodeInfo)
        ? (originProduct.sellerCodeInfo as Record<string, unknown>)
        : null;

  const sellerBarcode =
    sellerCodeInfo && typeof sellerCodeInfo.sellerBarcode === "string"
      ? sellerCodeInfo.sellerBarcode.trim()
      : "";

  return sellerBarcode || null;
}

function extractErrorMessage(payload: unknown, fallbackStatus: number) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return `NAVER request failed (${fallbackStatus})`;
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.message,
    record.error_description,
    record.error,
    record.code,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return `NAVER request failed (${fallbackStatus})`;
}

function isRetryableError(status: number, message: string) {
  const normalized = message.toLowerCase();

  return (
    status === 401 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    normalized.includes("temporar") ||
    normalized.includes("too many") ||
    normalized.includes("timeout") ||
    normalized.includes("요청") ||
    normalized.includes("잠시")
  );
}

async function resolveStoreId(preferredStoreId: string | null) {
  if (preferredStoreId) {
    return preferredStoreId;
  }

  const stores = await channelSettingsStore.listStoreSummaries();
  const naverStore = stores.find((store) => store.channel === "naver");
  return naverStore?.id ?? null;
}

async function buildAuthorization(storeId: string) {
  const store = await channelSettingsStore.getStore(storeId);
  if (!store) {
    throw new Error(`Store not found: ${storeId}`);
  }

  if (store.channel !== "naver") {
    throw new Error(`Store is not a NAVER store: ${storeId}`);
  }

  const token = await issueNaverAccessToken({
    clientId: store.credentials.clientId,
    clientSecret: store.credentials.clientSecret,
  });

  return `${token.tokenType} ${token.accessToken}`;
}

async function requestSellerBarcode(input: {
  storeId: string;
  authorization: string;
  originProductNo: string;
  retryLimit: number;
  retryDelayMs: number;
  refreshAuthorization: () => Promise<string>;
}) {
  let authorization = input.authorization;

  for (let attempt = 0; attempt <= input.retryLimit; attempt += 1) {
    let response: Response;
    let payload: unknown = null;

    try {
      response = await fetch(
        `${NAVER_API_BASE_URL}/v2/products/origin-products/${encodeURIComponent(
          input.originProductNo,
        )}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: authorization,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      const text = await response.text();
      if (text) {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          payload = { message: text };
        }
      }

      if (response.ok) {
        const sellerBarcode = extractSellerBarcode(payload);
        if (sellerBarcode) {
          return {
            authorization,
            result: {
              status: "resolved",
              sellerBarcode,
            } satisfies SellerBarcodeRequestResult,
          };
        }

        return {
          authorization,
          result: {
            status: "missing",
            message: "sellerBarcode not found in origin product payload.",
          } satisfies SellerBarcodeRequestResult,
        };
      }

      const message = extractErrorMessage(payload, response.status);
      if (response.status === 401 && attempt < input.retryLimit) {
        authorization = await input.refreshAuthorization();
        continue;
      }

      if (attempt < input.retryLimit && isRetryableError(response.status, message)) {
        const waitMs = input.retryDelayMs * (attempt + 1);
        console.log(
          `[retry] originProductNo=${input.originProductNo} status=${response.status} wait=${waitMs}ms message=${message}`,
        );
        await sleep(waitMs);
        continue;
      }

      return {
        authorization,
        result: {
          status: "failed",
          message: `${response.status} ${message}`,
        } satisfies SellerBarcodeRequestResult,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < input.retryLimit) {
        const waitMs = input.retryDelayMs * (attempt + 1);
        console.log(
          `[retry] originProductNo=${input.originProductNo} error=${message} wait=${waitMs}ms`,
        );
        await sleep(waitMs);
        continue;
      }

      return {
        authorization,
        result: {
          status: "failed",
          message,
        } satisfies SellerBarcodeRequestResult,
      };
    }
  }

  return {
    authorization,
    result: {
      status: "failed",
      message: "Unexpected retry exhaustion.",
    } satisfies SellerBarcodeRequestResult,
  };
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const storeId = await resolveStoreId(options.storeId);

  if (!storeId) {
    throw new Error("No NAVER store is configured.");
  }

  console.log(
    `[start] storeId=${storeId} refreshList=${options.refreshList} delayMs=${options.delayMs} retryLimit=${options.retryLimit} retryDelayMs=${options.retryDelayMs} max=${options.maxItems ?? "all"}`,
  );

  const listResponse = await fetchNaverProducts({
    storeId,
    all: true,
    refresh: options.refreshList,
    includeSellerBarcodes: false,
  });

  const seededSellerBarcodes = listResponse.items.flatMap((item) => {
    const originProductNo = item.originProductNo?.trim() ?? "";
    const sellerBarcode = item.sellerBarcode?.trim() ?? "";

    if (!originProductNo || !sellerBarcode) {
      return [];
    }

    return [
      {
        originProductNo,
        sellerBarcode,
      },
    ];
  });

  if (seededSellerBarcodes.length > 0) {
    await naverProductSellerBarcodeCacheStore.setMany(storeId, seededSellerBarcodes);
  }

  const originProductNos = Array.from(
    new Set(
      listResponse.items
        .map((item) => item.originProductNo?.trim() ?? "")
        .filter((originProductNo) => originProductNo.length > 0),
    ),
  );
  const cachedSellerBarcodes = await naverProductSellerBarcodeCacheStore.getMany(
    storeId,
    originProductNos,
  );
  const uncachedOriginProductNos = originProductNos.filter(
    (originProductNo) => !cachedSellerBarcodes.has(originProductNo),
  );
  const targetOriginProductNos =
    options.maxItems === null
      ? uncachedOriginProductNos
      : uncachedOriginProductNos.slice(0, options.maxItems);

  console.log(
    `[targets] total=${originProductNos.length} cached=${cachedSellerBarcodes.size} remaining=${uncachedOriginProductNos.length} processing=${targetOriginProductNos.length}`,
  );

  if (!targetOriginProductNos.length) {
    console.log("[done] no uncached origin products remain.");
    return;
  }

  let authorization = await buildAuthorization(storeId);
  const resolvedBuffer: Array<{ originProductNo: string; sellerBarcode: string }> = [];
  let resolvedCount = 0;
  let missingCount = 0;
  let failedCount = 0;

  const flushResolvedBuffer = async () => {
    if (!resolvedBuffer.length) {
      return;
    }

    const entries = resolvedBuffer.splice(0, resolvedBuffer.length);
    await naverProductSellerBarcodeCacheStore.setMany(storeId, entries);
    console.log(`[flush] persisted=${entries.length}`);
  };

  for (let index = 0; index < targetOriginProductNos.length; index += 1) {
    const originProductNo = targetOriginProductNos[index]!;
    const { authorization: nextAuthorization, result } = await requestSellerBarcode({
      storeId,
      authorization,
      originProductNo,
      retryLimit: options.retryLimit,
      retryDelayMs: options.retryDelayMs,
      refreshAuthorization: async () => buildAuthorization(storeId),
    });
    authorization = nextAuthorization;

    if (result.status === "resolved") {
      resolvedBuffer.push({
        originProductNo,
        sellerBarcode: result.sellerBarcode,
      });
      resolvedCount += 1;
    } else if (result.status === "missing") {
      missingCount += 1;
    } else {
      failedCount += 1;
      console.log(`[failed] originProductNo=${originProductNo} message=${result.message}`);
    }

    if (resolvedBuffer.length >= DEFAULT_FLUSH_BATCH_SIZE) {
      await flushResolvedBuffer();
    }

    const processedCount = index + 1;
    if (processedCount % 25 === 0 || processedCount === targetOriginProductNos.length) {
      console.log(
        `[progress] processed=${processedCount}/${targetOriginProductNos.length} resolved=${resolvedCount} missing=${missingCount} failed=${failedCount}`,
      );
    }

    if (options.delayMs > 0 && processedCount < targetOriginProductNos.length) {
      await sleep(options.delayMs);
    }
  }

  await flushResolvedBuffer();

  const finalCachedSellerBarcodes = await naverProductSellerBarcodeCacheStore.getMany(
    storeId,
    originProductNos,
  );

  console.log(
    `[done] total=${originProductNos.length} cached=${finalCachedSellerBarcodes.size} newlyResolved=${resolvedCount} missing=${missingCount} failed=${failedCount}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
