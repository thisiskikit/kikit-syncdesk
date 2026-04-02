import { useState } from "react";
import Papa, { type ParseResult } from "papaparse";
import type { DraftItemInput } from "@shared/channel-control";

function getValue(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function toNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeRows(rows: Record<string, string>[]): DraftItemInput[] {
  return rows.map((row) => ({
    channel: (getValue(row, "channel") || "naver") as DraftItemInput["channel"],
    masterSku: getValue(row, "masterSku", "master_sku") ?? null,
    optionSku: getValue(row, "optionSku", "option_sku") ?? null,
    channelProductId: getValue(row, "channelProductId", "channel_product_id") ?? null,
    channelOptionId: getValue(row, "channelOptionId", "channel_option_id") ?? null,
    requestedPatch: {
      price: toNumber(getValue(row, "price")),
      stockQuantity: toNumber(getValue(row, "stockQuantity", "stock_quantity")),
      saleStatus: getValue(row, "saleStatus", "sale_status") as DraftItemInput["requestedPatch"]["saleStatus"],
      soldOutStatus: getValue(row, "soldOutStatus", "sold_out_status") as DraftItemInput["requestedPatch"]["soldOutStatus"],
    },
  }));
}

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: DraftItemInput[], fileName: string | null) => Promise<void>;
}

export function CsvImportDialog(props: CsvImportDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!props.open) return null;

  return (
    <div className="csv-overlay">
      <div className="csv-dialog">
        <div>
          <h3 style={{ margin: 0 }}>CSV 업로드</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            `channel`, `optionSku`, `price`, `stockQuantity`, `saleStatus`, `soldOutStatus` 컬럼을 권장합니다.
          </p>
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError(null);
            Papa.parse<Record<string, string>>(file, {
              header: true,
              skipEmptyLines: true,
              complete: async (result: ParseResult<Record<string, string>>) => {
                try {
                  await props.onImport(normalizeRows(result.data), file.name);
                  props.onClose();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "CSV import failed");
                } finally {
                  setBusy(false);
                }
              },
              error: (err: Error) => {
                setError(err.message);
                setBusy(false);
              },
            });
          }}
        />
        {error ? <div className="status-pill failed">{error}</div> : null}
        <div className="toolbar" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="button secondary" onClick={props.onClose} disabled={busy}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
