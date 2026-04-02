import type { ReactNode } from "react";
import { useServerMenuState } from "@/lib/use-server-menu-state";

type OperationPageSettingsState = {
  isOpen: boolean;
};

export function OperationPageSettings(props: {
  menuKey: string;
  title?: string;
  description?: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { state, setState } = useServerMenuState<OperationPageSettingsState>(
    `${props.menuKey}.settings-menu`,
    {
      isOpen: props.defaultOpen ?? false,
    },
  );

  const isOpen = state.isOpen === true;

  return (
    <div className="card operation-settings-card">
      <div className="card-header">
        <div className="stack" style={{ gap: "0.35rem" }}>
          <h3 style={{ margin: 0 }}>{props.title ?? "설정"}</h3>
          {props.description ? <div className="muted">{props.description}</div> : null}
          {props.summary ? <div className="operation-settings-summary">{props.summary}</div> : null}
        </div>
        <button
          className="button ghost"
          onClick={() =>
            setState((current) => ({
              ...current,
              isOpen: !isOpen,
            }))
          }
          type="button"
        >
          {isOpen ? "설정 닫기" : "설정"}
        </button>
      </div>

      {isOpen ? <div className="operation-settings-body">{props.children}</div> : null}
    </div>
  );
}
