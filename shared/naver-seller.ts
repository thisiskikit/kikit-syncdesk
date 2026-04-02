import type { ApiCacheState } from "./api";
import type { ConnectionTestStatus } from "./channel-settings";

export interface NaverSellerStoreRef {
  id: string;
  name: string;
}

export interface NaverSellerConnectionTest {
  status: ConnectionTestStatus;
  testedAt: string | null;
  message: string | null;
}

export interface NaverSellerSectionStatus {
  status: "available" | "restricted" | "error";
  message: string | null;
}

export interface NaverSellerAccountInfo {
  accountId: string | null;
  accountUid: string | null;
  grade: string | null;
}

export interface NaverSellerChannelInfo {
  channelNo: string;
  channelType: string | null;
  name: string | null;
  url: string | null;
  representativeImageUrl: string | null;
  talkTalkAccountId: string | null;
}

export interface NaverSellerLogisticsCompanyInfo {
  logisticsCompanyId: string;
  logisticsCompanyName: string | null;
  deliveryTypes: string[];
}

export interface NaverSellerOutboundLocationMapping {
  allianceId: string | null;
  allianceName: string | null;
  deliveryType: string | null;
}

export interface NaverSellerOutboundLocationInfo {
  outboundLocationId: string;
  outboundLocationName: string | null;
  mappings: NaverSellerOutboundLocationMapping[];
}

export interface NaverSellerTodayDispatchInfo {
  sellerId: string | null;
  basisHour: number | null;
  basisMinute: number | null;
  holidayOfTheWeek: string | null;
  sellerHolidays: string[];
  reason: string | null;
}

export interface NaverSellerInfoResponse {
  store: NaverSellerStoreRef;
  connectionTest: NaverSellerConnectionTest | null;
  account: NaverSellerAccountInfo | null;
  channels: NaverSellerChannelInfo[];
  logisticsCompanies: NaverSellerLogisticsCompanyInfo[];
  outboundLocations: NaverSellerOutboundLocationInfo[];
  todayDispatch: NaverSellerTodayDispatchInfo | null;
  sections: {
    account: NaverSellerSectionStatus;
    channels: NaverSellerSectionStatus;
    logisticsCompanies: NaverSellerSectionStatus;
    outboundLocations: NaverSellerSectionStatus;
    todayDispatch: NaverSellerSectionStatus;
  };
  lastSyncStatus: "success" | "warning" | "error";
  fetchedAt: string;
  servedFromCache?: boolean;
  cacheState?: ApiCacheState;
  notes: string[];
}
