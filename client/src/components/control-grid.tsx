import { useMemo } from "react";
import { DataGrid, SelectColumn, type Column } from "react-data-grid";
import type { CatalogOptionRow } from "@shared/channel-control";
import { usePersistentState } from "@/lib/use-persistent-state";
import { formatDate, formatNumber } from "@/lib/utils";

interface ControlGridProps {
  rows: CatalogOptionRow[];
  selectedRows: ReadonlySet<string>;
  onSelectedRowsChange: (rows: Set<string>) => void;
}

const baseColumns: Column<CatalogOptionRow>[] = [
  SelectColumn,
  { key: "channel", name: "채널", width: 90 },
  { key: "productName", name: "상품명", minWidth: 220, resizable: true },
  { key: "optionName", name: "옵션", minWidth: 140, resizable: true },
  { key: "masterSku", name: "master_sku", minWidth: 120, resizable: true },
  { key: "optionSku", name: "option_sku", minWidth: 140, resizable: true },
  {
    key: "price",
    name: "가격",
    width: 100,
    resizable: true,
    renderCell: ({ row }) => formatNumber(row.price),
  },
  {
    key: "stockQuantity",
    name: "재고",
    width: 90,
    resizable: true,
    renderCell: ({ row }) => formatNumber(row.stockQuantity),
  },
  { key: "saleStatus", name: "판매상태", width: 110, resizable: true },
  { key: "soldOutStatus", name: "품절상태", width: 110, resizable: true },
  { key: "sellerProductCode", name: "판매자상품코드", minWidth: 150, resizable: true },
  { key: "channelProductId", name: "채널상품번호", minWidth: 160, resizable: true },
  {
    key: "syncedAt",
    name: "동기화 시각",
    minWidth: 170,
    resizable: true,
    renderCell: ({ row }) => formatDate(row.syncedAt),
  },
];

export function ControlGrid(props: ControlGridProps) {
  const [columnWidths, setColumnWidths] = usePersistentState<Record<string, number>>(
    "kikit:layout:rdg:catalog",
    {},
  );

  const columns = useMemo(
    () =>
      baseColumns.map((column) => {
        if (!("key" in column)) {
          return column;
        }

        const persistedWidth = columnWidths[String(column.key)];
        return {
          ...column,
          width: persistedWidth ?? column.width,
          resizable: column.key !== SelectColumn.key,
        };
      }),
    [columnWidths],
  );

  return (
    <div className="grid-shell">
      <DataGrid
        className="rdg-light"
        columns={columns}
        defaultColumnOptions={{ resizable: true }}
        rows={props.rows}
        rowKeyGetter={(row: CatalogOptionRow) => row.id}
        selectedRows={props.selectedRows}
        onSelectedRowsChange={props.onSelectedRowsChange}
        onColumnResize={(column, width) =>
          setColumnWidths((current) => ({
            ...current,
            [String(column.key)]: width,
          }))
        }
        style={{ height: 520 }}
      />
    </div>
  );
}
