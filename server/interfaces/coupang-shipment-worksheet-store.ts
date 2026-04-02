import type {
  CoupangDataSource,
  CoupangShipmentWorksheetRow,
  CoupangShipmentWorksheetSyncSummary,
  PatchCoupangShipmentWorksheetItemInput,
} from "@shared/coupang";

export type CoupangShipmentWorksheetSyncState = {
  lastIncrementalCollectedAt: string | null;
  lastFullCollectedAt: string | null;
  coveredCreatedAtFrom: string | null;
  coveredCreatedAtTo: string | null;
  lastStatusFilter: string | null;
};

export type CoupangShipmentWorksheetStoreSheet = {
  items: CoupangShipmentWorksheetRow[];
  collectedAt: string | null;
  source: CoupangDataSource;
  message: string | null;
  syncState: CoupangShipmentWorksheetSyncState;
  syncSummary: CoupangShipmentWorksheetSyncSummary | null;
  updatedAt: string;
};

export type SetCoupangShipmentWorksheetStoreSheetInput = {
  storeId: string;
  items: CoupangShipmentWorksheetRow[];
  collectedAt: string | null;
  source: CoupangDataSource;
  message: string | null;
  syncState: CoupangShipmentWorksheetSyncState;
  syncSummary: CoupangShipmentWorksheetSyncSummary | null;
};

export type PatchCoupangShipmentWorksheetRowsInput = {
  storeId: string;
  items: PatchCoupangShipmentWorksheetItemInput[];
};

export type PatchCoupangShipmentWorksheetRowsResult = {
  sheet: CoupangShipmentWorksheetStoreSheet;
  missingKeys: string[];
  touchedSourceKeys: string[];
};

export interface CoupangShipmentWorksheetStorePort {
  getStoreSheet(storeId: string): Promise<CoupangShipmentWorksheetStoreSheet>;
  setStoreSheet(
    input: SetCoupangShipmentWorksheetStoreSheetInput,
  ): Promise<CoupangShipmentWorksheetStoreSheet>;
  patchRows(input: PatchCoupangShipmentWorksheetRowsInput): Promise<PatchCoupangShipmentWorksheetRowsResult>;
}
