import { StatusBadge } from "./status-badge";

type PlaceholderAction = {
  label: string;
  tone?: "button" | "secondary" | "ghost";
  disabled?: boolean;
};

type PlaceholderColumn = {
  key: string;
  label: string;
};

type PlaceholderRow = Record<string, string>;

export function ModulePlaceholderPage(props: {
  title: string;
  description: string;
  badge: "live" | "draft" | "coming" | "shared";
  actions?: PlaceholderAction[];
  columns?: PlaceholderColumn[];
  rows?: PlaceholderRow[];
  note?: string;
}) {
  const columns = props.columns ?? [
    { key: "id", label: "번호" },
    { key: "subject", label: "항목" },
    { key: "status", label: "상태" },
    { key: "updatedAt", label: "최근 갱신" },
  ];

  const rows = props.rows ?? [
    {
      id: "001",
      subject: "준비 중인 메뉴 스캐폴드",
      status: "준비중",
      updatedAt: "연동 전",
    },
    {
      id: "002",
      subject: "실제 API 연결 후 표/필터/액션 확장 예정",
      status: "초안",
      updatedAt: "차기 단계",
    },
  ];

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone={props.badge} />
        </div>
        <h1>{props.title}</h1>
        <p>{props.description}</p>
      </div>

      <div className="card">
        <div className="toolbar">
          <input placeholder="검색어" disabled />
          <select disabled>
            <option>상태 필터</option>
          </select>
          {(props.actions ?? [
            { label: "조회", tone: "secondary", disabled: true },
            { label: "일괄 작업", tone: "button", disabled: true },
          ]).map((action) => (
            <button
              key={action.label}
              className={`button${action.tone === "secondary" ? " secondary" : action.tone === "ghost" ? " ghost" : ""}`}
              disabled={action.disabled ?? true}
            >
              {action.label}
            </button>
          ))}
        </div>
        {props.note ? <div className="muted" style={{ marginTop: "0.9rem" }}>{props.note}</div> : null}
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row[columns[0]?.key ?? "id"] ?? index}`}>
                {columns.map((column) => (
                  <td key={column.key}>{row[column.key] ?? "-"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
