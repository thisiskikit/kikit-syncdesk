# Change Log

이 문서는 구현이 실제 코드와 문서에 함께 반영된 변경만 기록합니다.

## 2026-04-12 / 작업센터 상세 티켓 샘플 로그

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/operations.ts`
  - `shared/operations.test.ts`
  - `server/http/coupang/tracked-actions.ts`
  - `server/http/coupang/tracked-actions.test.ts`
  - `server/http/handlers/coupang/orders.ts`
  - `server/http/handlers/coupang/shipments.ts`
  - `server/http/handlers/coupang/shipments.test.ts`
  - `client/src/pages/operation-center.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 쿠팡 배치 작업 결과에 주문 단위 티켓 샘플을 최대 5건까지 기록하도록 확장했습니다.
  - 우선순위는 `실패 -> 경고 -> 건너뜀 -> 성공`입니다.
  - 메인 작업 목록은 여전히 요약만 유지하고, 상세 패널에서만 티켓 샘플을 노출합니다.
  - 수집, 상품준비중 처리, 송장 업로드/수정 결과에 주문 식별자와 짧은 상태 메시지를 남깁니다.
- 이유:
  - 운영자가 원본 payload를 열지 않고도 어떤 주문이 실제로 처리됐는지 확인할 수 있어야 했습니다.
- 남은 점:
  - 최대 5건만 저장하는 capped sample이며, 전체 감사 로그는 아닙니다.
  - 브라우저에서 실제 클릭 기반 수동 검증은 아직 남아 있습니다.
- 검증:
  - `npm run check`
  - `npx vitest run --root . shared/operations.test.ts server/http/coupang/tracked-actions.test.ts server/http/handlers/coupang/shipments.test.ts`
  - `npm run build`

## 2026-04-12 / 출고 컬럼 보기 프리셋

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-panel.tsx`
  - `client/src/features/coupang/shipments/shipment-column-settings-panel.tsx`
  - `client/src/features/coupang/shipments/shipment-column-presets.ts`
  - `client/src/features/coupang/shipments/shipment-column-presets.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 워크시트에 `작업 보기`, `송장 입력 보기`, `전체 열 보기` 프리셋을 추가했습니다.
  - 기존 persisted 컬럼 설정은 자동으로 덮어쓰지 않고, 사용자가 프리셋을 명시적으로 적용할 때만 바뀝니다.
  - `송장 입력 보기` 프리셋을 적용하면 워크시트 모드도 `invoice`로 함께 전환합니다.
- 이유:
  - 기본 워크시트가 너무 넓어서 일반 데스크톱 폭에서 가로 스크롤 부담이 컸습니다.
- 남은 점:
  - 합성 컬럼 기반의 2차 압축은 아직 남아 있습니다.
  - 브라우저에서 실제 프리셋 전환 체감 검증은 아직 남아 있습니다.
- 검증:
  - `npm run check`
  - `npx vitest run client/src/features/coupang/shipments/shipment-column-presets.test.ts client/src/features/coupang/shipments/quick-collect-focus.test.ts client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts client/src/features/coupang/shipments/fulfillment-decision.test.ts`

## 2026-04-12 / 빠른 수집 직후 신규 주문 우선 보기

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `shared/coupang.ts`
  - `server/services/coupang/shipment-worksheet-service.ts`
  - `server/stores/work-data-coupang-shipment-worksheet-store.ts`
  - `server/services/coupang/shipment-worksheet-collection.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/quick-collect-focus.ts`
  - `client/src/features/coupang/shipments/quick-collect-focus.test.ts`
  - `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - `new_only` 빠른 수집 응답에 `insertedSourceKeys`를 포함시켰습니다.
  - 빠른 수집 후 실제로 추가된 주문이 있으면 워크시트가 그 주문만 임시로 먼저 보여줍니다.
  - 이 집중 보기는 필터 변경, 새로고침, 탭 이동 시 자동으로 해제됩니다.
- 이유:
  - 빠른 수집 후 신규 주문이 기존 목록에 섞여 보이면 운영자가 바로 확인하기 어려웠습니다.
- 남은 점:
  - 브라우저에서 실제 집중 보기 배너와 복귀 흐름 수동 검증이 남아 있습니다.
- 검증:
  - `npm run check`
  - `npm run build`
  - `npx vitest run --root . server/services/coupang/shipment-worksheet-collection.test.ts client/src/features/coupang/shipments/quick-collect-focus.test.ts client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts client/src/features/coupang/shipments/fulfillment-decision.test.ts`

## 2026-04-12 / 출고 상단 구조 및 선택 흐름 정리

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.ts`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts`
  - `client/src/features/coupang/shipments/shipment-selection-summary.ts`
  - `client/src/features/coupang/shipments/shipment-selection-summary.test.ts`
  - `client/src/features/coupang/shipments/shipment-selection-action-bar.tsx`
  - `client/src/features/coupang/shipments/shipment-base-filters.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-panel.tsx`
  - `client/src/features/coupang/shipments/shipment-archive-panel.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 메인 필터 축을 `출고 판단`으로 고정하고, `작업 대상 / 배송 이후 / 예외·클레임 / 전체`는 보조 범위로 내렸습니다.
  - `송장 상태 / 출력 상태 / 주문 상태`는 접힌 세부 필터로 이동했습니다.
  - 상단 영역을 `기본 필터`, `출고 판단 요약`, `선택 일괄 작업`, `워크시트/보관함 패널` 컴포넌트로 나눴습니다.
  - 혼합 선택 상태에서도 실행 가능한 행만 자동 제외 후 진행하도록 선택 바 흐름을 바꿨습니다.
- 이유:
  - 기존 화면은 서로 다른 필터 축이 같은 레벨에 놓여 있어 운영자가 무엇을 먼저 봐야 하는지 이해하기 어려웠습니다.
- 남은 점:
  - `page.tsx`는 여전히 큰 coordinator 파일입니다.
  - 그리드 wiring과 Drawer 상세 조립 분리는 다음 단계입니다.
- 검증:
  - `npm run check`
  - `npm run build`
  - `npx vitest run client/src/features/coupang/shipments/shipment-selection-summary.test.ts client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts client/src/features/coupang/shipments/fulfillment-decision.test.ts`

## 2026-04-12 / 운영 데스크 IA 1차

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/App.tsx`
  - `client/src/lib/workspace-tabs.ts`
  - `client/src/lib/coupang-navigation.ts`
  - `client/src/pages/dashboard.tsx`
  - `client/src/pages/fulfillment.tsx`
  - `client/src/pages/cs-hub.tsx`
  - `client/src/pages/channels-hub.tsx`
  - `client/src/pages/operation-center.tsx`
  - `client/src/pages/settings-hub.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
  - `docs/decisions/2026-04-12-syncdesk-operation-desk-ia.md`
- 변경 내용:
  - 상단 주요 메뉴를 `대시보드`, `출고`, `CS`, `채널`, `작업센터`, `설정`으로 재구성했습니다.
  - 대시보드를 채널 런처가 아니라 오늘의 운영 시작점으로 재배치했습니다.
  - 작업센터를 로그 화면이 아니라 실패 작업 복구 공간으로 재정의했습니다.
  - 채널/설정 아래로 레거시 도구와 direct route 진입점을 내렸습니다.
- 이유:
  - 제품 인상을 채널별 관리자 콘솔이 아니라 `출고 / CS / 복구` 중심 운영 데스크로 바꾸기 위해서입니다.
- 남은 점:
  - CS는 아직 허브 + deep-link 구조이며, 통합 실행 화면은 아닙니다.
  - 브라우저 클릭 기반 end-to-end 수동 검증은 아직 남아 있습니다.
- 검증:
  - `npm run check`
  - `npm run build`
  - `npx vitest run client/src/lib/workspace-tabs.test.ts client/src/lib/coupang-navigation.test.ts client/src/features/coupang/shipments/fulfillment-decision.test.ts`

## 2026-04-12 / 작업센터 및 작업 상태 패널 한국어 정리

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/components/operation-toaster.tsx`
  - `client/src/pages/operation-center.tsx`
  - `client/index.html`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.ts`
  - `client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 작업 상태 패널의 상태 라벨, 버튼, 빈 상태 문구를 한국어로 정리했습니다.
  - 작업센터의 메트릭, 필터, 목록, 상세 패널, 티켓 상세 레이블을 한국어로 정리했습니다.
  - 출고 범위 라벨과 현재 적용 조건 토큰도 한국어 레이블로 다시 맞췄습니다.
  - 문서와 브라우저 스크린샷 기준으로 `KIKIT SyncDesk`, `출고`, `작업센터`, `작업 상태` 패널이 현재 한국어로 렌더되는 것을 확인했습니다.
- 이유:
  - 운영 데스크 개편 이후에도 일부 사용자 노출 문자열이 깨진 인코딩 또는 혼합 언어 상태로 남아 있어 읽기 흐름을 방해했습니다.
- 남은 점:
  - 완전한 클릭 기반 수동 검증은 아직 남아 있습니다.
- 검증:
  - `npm run check`
  - `npm run build`
  - `npx vitest run client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts`
  - Chrome headless fresh profile 스크린샷으로 `출고`, `작업센터`, `작업 상태` 패널 렌더 확인
