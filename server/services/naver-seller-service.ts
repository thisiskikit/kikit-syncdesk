import type {
  NaverSellerAccountInfo,
  NaverSellerChannelInfo,
  NaverSellerInfoResponse,
  NaverSellerLogisticsCompanyInfo,
  NaverSellerOutboundLocationInfo,
  NaverSellerSectionStatus,
  NaverSellerTodayDispatchInfo,
} from "@shared/naver-seller";
import { channelSettingsStore } from "./channel-settings-store";
import { asArray, asNumber, asObject, asString, requestNaverJson } from "./naver-api-client";

function isRestrictedMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("403") ||
    normalized.includes("forbidden") ||
    normalized.includes("not authorized") ||
    normalized.includes("권한") ||
    normalized.includes("인증")
  );
}

function buildSectionStatus(message: string | null, hasData: boolean): NaverSellerSectionStatus {
  if (hasData) {
    return {
      status: "available",
      message,
    };
  }

  if (message && isRestrictedMessage(message)) {
    return {
      status: "restricted",
      message,
    };
  }

  return {
    status: "error",
    message,
  };
}

function normalizeAccount(payload: unknown): NaverSellerAccountInfo | null {
  const root = asObject(payload);
  const data = asObject(root?.data) ?? root;

  if (!data) {
    return null;
  }

  return {
    accountId: asString(data.accountId),
    accountUid: asString(data.accountUid),
    grade: asString(data.grade),
  };
}

function normalizeChannels(payload: unknown) {
  const root = asObject(payload);
  const rawItems = Array.isArray(root?.data)
    ? root.data
    : Array.isArray(payload)
      ? payload
      : [];

  return rawItems
    .map((rawItem) => {
      const item = asObject(rawItem);
      const channelNo = asString(item?.channelNo);
      if (!channelNo) {
        return null;
      }

      return {
        channelNo,
        channelType: asString(item?.channelType),
        name: asString(item?.name),
        url: asString(item?.url),
        representativeImageUrl: asString(item?.representativeImageUrl),
        talkTalkAccountId: asString(item?.talkTalkAccountId),
      } satisfies NaverSellerChannelInfo;
    })
    .filter((item): item is NaverSellerChannelInfo => Boolean(item));
}

function normalizeLogisticsCompanies(payload: unknown) {
  const root = asObject(payload);
  const data = asObject(root?.data) ?? root;
  const rawItems = asArray(data?.logisticsCompanies);

  return rawItems
    .map((rawItem) => {
      const item = asObject(rawItem);
      const logisticsCompanyId = asString(item?.logisticsCompanyId);
      if (!logisticsCompanyId) {
        return null;
      }

      const deliveryTypes = asArray(item?.deliveryTypes)
        .map((value) => asString(value))
        .filter((value): value is string => Boolean(value));

      return {
        logisticsCompanyId,
        logisticsCompanyName: asString(item?.logisticsCompanyName),
        deliveryTypes,
      } satisfies NaverSellerLogisticsCompanyInfo;
    })
    .filter((item): item is NaverSellerLogisticsCompanyInfo => Boolean(item));
}

function normalizeOutboundLocations(payload: unknown) {
  const root = asObject(payload);
  const rawItems = Array.isArray(root?.data)
    ? root.data
    : Array.isArray(payload)
      ? payload
      : [];

  return rawItems
    .map((rawItem) => {
      const item = asObject(rawItem);
      const outboundLocationId = asString(item?.outboundLocationId);
      if (!outboundLocationId) {
        return null;
      }

      return {
        outboundLocationId,
        outboundLocationName: asString(item?.outboundLocationName),
        mappings: asArray(item?.mappings)
          .map((rawMapping) => {
            const mapping = asObject(rawMapping);
            return {
              allianceId: asString(mapping?.allianceId),
              allianceName: asString(mapping?.allianceName),
              deliveryType: asString(mapping?.deliveryType),
            };
          })
          .filter((mapping) => mapping.allianceId || mapping.allianceName || mapping.deliveryType),
      } satisfies NaverSellerOutboundLocationInfo;
    })
    .filter((item): item is NaverSellerOutboundLocationInfo => Boolean(item));
}

function normalizeTodayDispatch(payload: unknown): NaverSellerTodayDispatchInfo | null {
  const root = asObject(payload);
  const data = asObject(root?.data) ?? root;

  if (!data) {
    return null;
  }

  return {
    sellerId: asString(data.sellerId),
    basisHour: asNumber(data.basisHour),
    basisMinute: asNumber(data.basisMinute),
    holidayOfTheWeek: asString(data.holidayOfTheWeek),
    sellerHolidays: asArray(data.sellerHolidays)
      .map((value) => asString(value))
      .filter((value): value is string => Boolean(value)),
    reason: asString(data.reason),
  };
}

async function safeFetch<T>(input: {
  request: () => Promise<T>;
  normalize: (payload: T) => unknown;
}) {
  try {
    const payload = await input.request();
    return {
      ok: true as const,
      data: input.normalize(payload),
      message: null,
    };
  } catch (error) {
    return {
      ok: false as const,
      data: null,
      message: error instanceof Error ? error.message : "Failed to load NAVER seller information.",
    };
  }
}

export async function getSellerInfo(input: { storeId: string }) {
  const store = await channelSettingsStore.getStore(input.storeId);

  if (!store || store.channel !== "naver") {
    throw new Error("NAVER store settings not found.");
  }

  const [accountResult, channelsResult, logisticsResult, outboundResult, todayDispatchResult] =
    await Promise.all([
      safeFetch({
        request: () =>
          requestNaverJson<unknown>({
            storeId: input.storeId,
            method: "GET",
            path: "/v1/seller/account",
          }),
        normalize: (result) => normalizeAccount(result.payload),
      }),
      safeFetch({
        request: () =>
          requestNaverJson<unknown>({
            storeId: input.storeId,
            method: "GET",
            path: "/v1/seller/channels",
          }),
        normalize: (result) => normalizeChannels(result.payload),
      }),
      safeFetch({
        request: () =>
          requestNaverJson<unknown>({
            storeId: input.storeId,
            method: "GET",
            path: "/v1/logistics/logistics-companies",
          }),
        normalize: (result) => normalizeLogisticsCompanies(result.payload),
      }),
      safeFetch({
        request: () =>
          requestNaverJson<unknown>({
            storeId: input.storeId,
            method: "GET",
            path: "/v1/logistics/outbound-locations",
          }),
        normalize: (result) => normalizeOutboundLocations(result.payload),
      }),
      safeFetch({
        request: () =>
          requestNaverJson<unknown>({
            storeId: input.storeId,
            method: "GET",
            path: "/v1/seller/this-day-dispatch",
          }),
        normalize: (result) => normalizeTodayDispatch(result.payload),
      }),
    ]);

  const notes = [
    accountResult.message,
    channelsResult.message,
    logisticsResult.message,
    outboundResult.message,
    todayDispatchResult.message,
  ].filter((value): value is string => Boolean(value));

  const loadedCount = [
    accountResult.ok && accountResult.data,
    channelsResult.ok,
    logisticsResult.ok,
    outboundResult.ok,
    todayDispatchResult.ok && todayDispatchResult.data,
  ].filter(Boolean).length;

  return {
    store: {
      id: store.id,
      name: store.storeName,
    },
    connectionTest: {
      status: store.connectionTest.status,
      testedAt: store.connectionTest.testedAt,
      message: store.connectionTest.message,
    },
    account: (accountResult.data as NaverSellerAccountInfo | null) ?? null,
    channels: (channelsResult.data as NaverSellerChannelInfo[] | null) ?? [],
    logisticsCompanies:
      (logisticsResult.data as NaverSellerLogisticsCompanyInfo[] | null) ?? [],
    outboundLocations:
      (outboundResult.data as NaverSellerOutboundLocationInfo[] | null) ?? [],
    todayDispatch: (todayDispatchResult.data as NaverSellerTodayDispatchInfo | null) ?? null,
    sections: {
      account: buildSectionStatus(accountResult.message, Boolean(accountResult.data)),
      channels: buildSectionStatus(
        channelsResult.message,
        Array.isArray(channelsResult.data) && channelsResult.data.length >= 0,
      ),
      logisticsCompanies: buildSectionStatus(
        logisticsResult.message,
        Array.isArray(logisticsResult.data) && logisticsResult.data.length >= 0,
      ),
      outboundLocations: buildSectionStatus(
        outboundResult.message,
        Array.isArray(outboundResult.data) && outboundResult.data.length >= 0,
      ),
      todayDispatch: buildSectionStatus(todayDispatchResult.message, Boolean(todayDispatchResult.data)),
    },
    lastSyncStatus:
      loadedCount === 0 ? "error" : notes.length > 0 ? "warning" : "success",
    fetchedAt: new Date().toISOString(),
    notes,
  } satisfies NaverSellerInfoResponse;
}
