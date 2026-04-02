import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Unhandled frontend error.", error, errorInfo);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="app-error-boundary">
        <div className="app-error-card">
          <div className="hero-badges">
            <span className="module-badge coming">UI 보호 모드</span>
          </div>
          <h1>화면 오류가 발생했습니다.</h1>
          <p>
            일부 응답이 비어 있거나 예기치 않은 형식이라 화면 렌더링을 계속할 수 없습니다.
            새로고침으로 복구를 시도하거나, 같은 화면을 다시 열어 주세요.
          </p>
          <div className="feedback error">
            <strong>오류 요약</strong>
            <div className="muted">{this.state.error.message || "Unknown frontend error."}</div>
          </div>
          <div className="detail-actions">
            <button className="button secondary" onClick={this.reset}>
              다시 시도
            </button>
            <button className="button" onClick={this.reload}>
              새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }
}
