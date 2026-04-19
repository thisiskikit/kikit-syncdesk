import type {
  CoupangShipmentArchiveRow,
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

export type UpsertCoupangShipmentWorksheetRowsInput = {
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

export type ArchiveCoupangShipmentWorksheetRowsInput = {
  storeId: string;
  items: Array<CoupangShipmentWorksheetRow | CoupangShipmentArchiveRow>;
  archivedAt: string;
  dryRun?: boolean;
};

export type ArchiveCoupangShipmentWorksheetRowsResult = {
  archivedCount: number;
  skippedCount: number;
  archivedSourceKeys: string[];
  dryRun: boolean;
};

export interface CoupangShipmentWorksheetStorePort {
  getStoreSheet(storeId: string): Promise<CoupangShipmentWorksheetStoreSheet>;
  setStoreSheet(
    input: SetCoupangShipmentWorksheetStoreSheetInput,
  ): Promise<CoupangShipmentWorksheetStoreSheet>;
  upsertStoreRows(
    input: UpsertCoupangShipmentWorksheetRowsInput,
  ): Promise<CoupangShipmentWorksheetStoreSheet>;
  patchRows(input: PatchCoupangShipmentWorksheetRowsInput): Promise<PatchCoupangShipmentWorksheetRowsResult>;
  getArchivedRows(storeId: string): Promise<CoupangShipmentArchiveRow[]>;
  getArchivedSourceKeys(storeId: string): Promise<string[]>;
  archiveRows(
    input: ArchiveCoupangShipmentWorksheetRowsInput,
  ): Promise<ArchiveCoupangShipmentWorksheetRowsResult>;
}
