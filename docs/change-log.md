# Change Log

이 문서는 구현이 실제 코드와 문서에 함께 반영된 변경만 기록합니다.

## 2026-04-13 / 빌드-배포 하드닝

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `vite.config.ts`
  - `.github/workflows/deploy-kikit-price-change.yml`
  - `.github/workflows/deploy-kikit-price-change-dev.yml`
  - `docs/deployment/cloud-run-branch-deployments.md`
  - `docs/deployment/cloud-run-smoke-check.md`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - Vite build에 vendor / route chunk 분리를 추가해 500k 초과 chunk warning을 제거했습니다.
  - GitHub Actions workflow 이름을 `Cloud Run Prod Deploy`, `Cloud Run Dev Deploy`로 정리했습니다.
  - Cloud Run 브랜치 배포 문서에 workflow 표시 이름을 추가하고, 별도 smoke check / rollback 문서를 만들었습니다.
  - 남은 CSS minify warning의 원인이 `react-data-grid/lib/styles.css`임을 확인하고 운영 문서에 기록했습니다.
- 이유:
  - 운영 배포 전에 빌드 경고, workflow 이름 혼선, smoke check 부재를 줄여야 개편 구조를 더 안전하게 올릴 수 있었습니다.
- 남은 점:
  - CSS minify warning은 현재 upstream dependency 이슈로 남아 있으며, 빌드를 막지는 않습니다.
  - 실제 Cloud Run console에서 smoke check와 rollback을 직접 실행한 것은 아닙니다.
- 검증:
  - `npm run check`
  - `npm run build`
  - `npm exec vitest run --root . client/src/pages/hub-navigation.test.ts client/src/lib/ops-handoff-links.test.ts client/src/pages/operation-center-recovery.test.ts`

## 2026-04-13 / 채널-설정 허브 구조 정리

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/pages/channels-hub.tsx`
  - `client/src/pages/settings-hub.tsx`
  - `client/src/pages/hub-navigation.ts`
  - `client/src/pages/hub-navigation.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 채널 허브를 `연결 상태 / 점검`, `원본 화면 진입`, `채널별 주요 도구`, `고급 / 레거시 화면` 순서로 재구성했습니다.
  - 설정 허브를 `연결 설정`, `운영 고급 도구`, `레거시 / 직접 진입` 순서로 재구성했습니다.
  - 허브 카드 설명과 empty state 문구를 operator 관점의 운영 문장으로 다시 맞췄습니다.
  - 섹션 구성은 `hub-navigation.ts` descriptor로 분리하고 테스트로 고정했습니다.
- 이유:
  - 기존 허브는 “어디로 들어가야 하는지”보다 “무엇이 있는지”가 먼저 보여 operator가 진입 위치를 다시 해석해야 했습니다.
- 남은 점:
  - 브라우저에서 실제 허브 카드 체감과 모바일 폭 확인은 아직 직접 검증하지 못했습니다.
  - 레거시 직접 진입은 유지하지만, 어떤 링크가 실제로 자주 쓰이는지는 추가 관찰이 필요합니다.
- 검증:
  - `npm run check`
  - `npm exec vitest run --root . client/src/pages/hub-navigation.test.ts client/src/lib/ops-handoff-links.test.ts client/src/pages/operation-center-recovery.test.ts`

## 2026-04-13 / 출고-CS-작업센터 연결 흐름 강화

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/lib/ops-handoff-links.ts`
  - `client/src/lib/ops-handoff-links.test.ts`
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
  - `client/src/features/coupang/shipments/shipment-decision-drawer.tsx`
  - `client/src/features/coupang/shipments/fulfillment-drawer-controller.tsx`
  - `client/src/pages/operation-center.tsx`
  - `client/src/pages/cs-hub.tsx`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 출고와 작업센터가 `tab / storeId / scope / decisionStatus / query / status / level / q / slowOnly / logId` 기준 deep-link를 읽고 다시 URL에 반영하도록 정리했습니다.
  - 출고 요약과 Drawer에서 `보류 / 차단 / 재확인 필요` 상태에 맞는 다음 이동 경로를 `CS 허브` 또는 `작업센터` 기준으로 안내합니다.
  - 작업센터 쿠팡 operation 상세에서 payload 기반 주문 식별자를 추출해 `관련 출고 보기`, `CS 허브 열기`로 이어지게 했습니다.
  - CS 허브는 허브 역할을 유지하면서 `focus / source` 문맥 안내와 복귀 링크를 함께 보여주도록 보강했습니다.
- 이유:
  - 운영자가 예외 주문, CS 영향, 복구 로그를 따로 기억해서 오가던 비용을 줄이고 현재 상태에 맞는 다음 화면을 더 빨리 판단하게 하려는 목적입니다.
- 남은 점:
  - 브라우저에서 실제 deep-link 이동과 workspace tab 체감은 아직 직접 검증하지 못했습니다.
  - `관련 출고 보기`는 주문 식별자 기반 필터 진입이며 특정 행을 자동으로 여는 수준까지는 확장하지 않았습니다.
- 검증:
  - `npm run check`
  - `npm exec vitest run --root . client/src/lib/ops-handoff-links.test.ts client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts client/src/pages/operation-center-recovery.test.ts`

## 2026-04-13 / 운영 manual regression 문서화

- 변경 유형:
  - 문서
- 관련 파일:
  - `docs/qa/manual-fulfillment-regression.md`
  - `docs/qa/work-center-recovery-scenarios.md`
  - `docs/current-status.md`
  - `docs/change-log.md`
- 변경 내용:
  - dashboard -> fulfillment 진입, 빠른 수집 집중 보기, 혼합 선택 자동 제외, fulfillment drawer 흐름을 manual regression 시나리오로 정리했습니다.
  - work-center recovery 흐름을 `복구 묶음 -> 리스트 -> 상세 -> 재시도` 기준으로 문서화했습니다.
  - 각 시나리오별 기대 결과, 위험도(high / medium / low), 자동화 테스트 후보를 분리했습니다.
- 이유:
  - 이번 차수에서 고정한 운영 구조를 사람이 반복 검증 가능한 자산으로 남길 필요가 있었습니다.
- 남은 점:
  - 문서 안의 `추정` 표기는 아직 브라우저에서 직접 밟지 못한 기대 결과입니다.
- 검증:
  - 문서 내용은 2026-04-13 기준 `codex/dev` 구현과 이번 차수의 타입체크/단위 테스트 결과를 기준으로 작성했습니다.

## 2026-04-13 / 작업센터 recovery-first 강화

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/pages/operation-center.tsx`
  - `client/src/pages/operation-center-recovery.ts`
  - `client/src/pages/operation-center-operation-detail-sections.tsx`
  - `client/src/pages/operation-center-recovery.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 작업센터 목록을 `즉시 재시도 / 원인 확인 / 진행 관찰 / 완료` lane 기준으로 읽히게 바꿨습니다.
  - 같은 성격 실패를 상단 `복구 묶음`으로 그룹핑해 operator가 먼저 볼 복구 단위를 요약합니다.
  - 상세 패널은 `지금 할 일`, `영향 범위`, foldout detail section 순서로 조치 중심 흐름을 갖도록 정리했습니다.
  - 작업센터 상세 foldout 렌더를 `operation-center-operation-detail-sections.tsx`로 분리했습니다.
- 이유:
  - 기존 작업센터는 로그 정보는 많았지만 operator가 무엇을 먼저 복구해야 하는지 판단하는 비용이 높았습니다.
- 남은 점:
  - 브라우저 클릭 기반의 실제 체감 검증은 아직 남아 있습니다.
  - failure grouping은 현재 프론트 계산 기준이며, 백엔드 집계 확장은 이번 차수 범위에 포함하지 않았습니다.
- 검증:
  - `npm run check`
  - `npm exec vitest run --root . client/src/features/coupang/shipments/quick-collect-focus.test.ts client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts client/src/pages/operation-center-recovery.test.ts`

## 2026-04-13 / 출고 coordinator render 분해

- 변경 유형:
  - 코드 + 문서
- 관련 파일:
  - `client/src/features/coupang/shipments/page.tsx`
  - `client/src/features/coupang/shipments/fulfillment-shell.tsx`
  - `client/src/features/coupang/shipments/fulfillment-toolbar.tsx`
  - `client/src/features/coupang/shipments/fulfillment-summary-bar.tsx`
  - `client/src/features/coupang/shipments/fulfillment-selection-controller.tsx`
  - `client/src/features/coupang/shipments/fulfillment-grid-controller.tsx`
  - `client/src/features/coupang/shipments/fulfillment-drawer-controller.tsx`
  - `client/src/features/coupang/shipments/quick-collect-focus-controller.ts`
  - `client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts`
  - `docs/current-status.md`
  - `docs/change-log.md`
  - `docs/structure-overview.md`
- 변경 내용:
  - 출고 화면의 render tree를 shell, toolbar, summary, selection, grid, drawer controller로 분리했습니다.
  - 빠른 수집 집중 보기의 active sheet / visible rows 계산을 `quick-collect-focus-controller.ts`로 분리했습니다.
  - `page.tsx`는 상태, query, action coordinator 역할을 유지하고, 화면 조립 책임은 새 controller들로 이동했습니다.
- 이유:
  - 운영 구조를 고정하려면 `page.tsx` 안에 섞여 있던 render 조립과 view state 계산을 먼저 분리해 책임 경계를 안정화할 필요가 있었습니다.
- 남은 점:
  - `page.tsx`에는 여전히 network action orchestration과 많은 handler가 남아 있습니다.
  - 브라우저 클릭 기반 수동 검증은 아직 남아 있습니다.
- 검증:
  - `npm run check`
  - `npm exec vitest run --root . client/src/features/coupang/shipments/quick-collect-focus.test.ts client/src/features/coupang/shipments/quick-collect-focus-controller.test.ts`

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
