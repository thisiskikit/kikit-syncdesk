import { useEffect } from "react";

type SampleColumn = {
  name: string;
};

type SampleValue = string | number | boolean | null;

type SampleRow = {
  index: number;
  values: Record<string, SampleValue>;
};

function formatSampleValue(value: SampleValue) {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  const normalized = String(value);
  return normalized.length > 0 ? normalized : "-";
}

export function SampleRowsDialog(props: {
  open: boolean;
  title: string;
  subtitle?: string | null;
  columns: SampleColumn[];
  sampleRows: SampleRow[];
  emptyMessage: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!props.open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.open, props.onClose]);

  if (!props.open) {
    return null;
  }

  return (
    <div className="csv-overlay" onMouseDown={props.onClose}>
      <div
        className="csv-dialog detail-dialog sample-rows-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="detail-box-header">
          <div className="stack" style={{ gap: "0.35rem" }}>
            <h3 style={{ margin: 0 }}>{props.title}</h3>
            <div className="muted">
              샘플 행 {props.sampleRows.length}개 / 열 {props.columns.length}개
            </div>
            {props.subtitle ? <div className="muted">{props.subtitle}</div> : null}
          </div>

          <button className="button ghost" type="button" onClick={props.onClose}>
            닫기
          </button>
        </div>

        {props.sampleRows.length ? (
          <div className="sample-rows-dialog-list">
            {props.sampleRows.map((row) => (
              <section key={row.index} className="detail-card sample-row-card">
                <div className="sample-row-card-header">
                  <strong>행 {row.index + 1}</strong>
                </div>

                <div className="sample-row-field-grid">
                  {props.columns.map((column) => (
                    <div key={`${row.index}:${column.name}`} className="sample-row-field">
                      <div className="sample-row-field-name">{column.name}</div>
                      <div className="sample-row-field-value">
                        {formatSampleValue(row.values[column.name] ?? null)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="empty">{props.emptyMessage}</div>
        )}
      </div>
    </div>
  );
}
