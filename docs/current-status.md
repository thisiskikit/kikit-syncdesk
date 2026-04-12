# Current Status

- 스냅샷 날짜: 2026-04-12
- 목적: 현재 구현된 KIKIT SyncDesk 운영 데스크 구조와 출고/작업센터 동작을 기준으로 실제 상태를 기록합니다.

## 확인한 범위

- 코드 경로 확인
- 타입체크
- 대상 단위 테스트
- 로컬 프로덕션 빌드
- 로컬 프로덕션 서버 기준 Chrome headless 스크린샷 확인

## 현재 상태

### 앱 셸 / 주요 메뉴
- 상단 주요 메뉴는 `대시보드`, `출고`, `CS`, `채널`, `작업센터`, `설정` 6축입니다.
- 브랜드 텍스트는 `KIKIT SyncDesk`입니다.
- `/operations`는 `/work-center`로, `/coupang/shipments`는 `/fulfillment`로 연결됩니다.
- `NAVER`, `COUPANG`, `Draft / Runs`는 더 이상 메인 상단 메뉴에 직접 노출하지 않습니다.

### 대시보드
- 대시보드는 채널 런처가 아니라 오늘의 운영 시작점입니다.
- 핵심 액션 카드, 지금 먼저 볼 것, 최근 이슈, 빠른 작업 패널, 얇은 채널 상태 스트립을 중심으로 구성됩니다.
- 카드 클릭 시 `출고`, `CS`, `작업센터`, `채널`로 바로 이동합니다.

### 출고
- `출고`는 쿠팡 배송/송장 워크시트를 운영 화면으로 재배치한 top-level 화면입니다.
- 필터 위계는 아래와 같습니다.
  - 메인 축: `출고 판단`
  - 보조 축: `작업 대상 / 배송 이후 / 예외·클레임 / 전체`
  - 세부 축: `송장 상태 / 출력 상태 / 주문 상태`
- 상단은 `기본 필터`, `출고 판단 요약`, `현재 적용 조건`, `세부 필터`, `선택 일괄 작업 바` 순서로 읽히도록 정리돼 있습니다.
- 기본 `출고 판단` 상태는 `출고 가능`, `송장 대기`, `보류`, `차단`, `재확인 필요`입니다.
- 상세는 메인 표가 아니라 우측 Drawer에서 먼저 확인합니다.

### 출고 컬럼 보기 프리셋
- 워크시트 카드와 화면 설정 패널 모두에서 아래 보기 프리셋을 적용할 수 있습니다.
  - `작업 보기`
  - `송장 입력 보기`
  - `전체 열 보기`
- 기존 사용자 컬럼 설정은 자동으로 덮어쓰지 않습니다.
- 사용자가 프리셋을 직접 적용할 때만 컬럼 집합과 폭이 바뀝니다.
- `송장 입력 보기` 프리셋을 적용하면 워크시트 모드는 `invoice`로 함께 전환됩니다.

### 빠른 수집 직후 신규 주문 우선 보기
- `빠른 수집(new_only)` 응답은 `insertedSourceKeys`를 반환합니다.
- 신규 주문이 실제로 추가되면 워크시트는 방금 추가된 주문만 임시로 먼저 보여줍니다.
- 이 임시 집중 보기는 아래 동작에서 자동 해제됩니다.
  - 스토어 변경
  - 기간 변경
  - 검색어 변경
  - 보기 범위 변경
  - 출고 판단 탭 변경
  - 세부 필터 변경
  - 수동 새로고침
  - `작업 화면` 외 탭 이동
- 페이지 크기 정책 자체는 그대로 유지합니다.

### 선택 일괄 작업
- 선택 행에 `차단`, `보류`, `재확인 필요`가 섞여 있어도 실행 가능한 행은 자동으로 진행합니다.
- 제외된 행은 상태/사유 요약으로 다시 보여줍니다.
- 선택 바는 `즉시 실행`과 `제외 또는 확인 필요`를 분리해서 안내합니다.

### 보관함
- `보관함`은 읽기 전용 archive 조회 화면입니다.
- 현재 작업용 워크시트와 분리되어 있고, 메인 작업 흐름은 `작업 화면`에 남아 있습니다.

### CS / 채널 / 설정
- `CS`는 통합 실행 화면이 아니라 허브입니다.
- 기존 NAVER / COUPANG 문의/클레임 화면으로 deep-link 합니다.
- `채널`은 연결/원본 화면 허브입니다.
- `설정`은 연결 설정과 고급/레거시 도구 진입점입니다.

### 작업센터
- 작업센터는 로그 뷰어가 아니라 실패 작업 복구 중심 화면입니다.
- 메인 목록은 여전히 얇게 유지하고, 재시도 가능 여부를 우선 노출합니다.
- 상세 패널에서만 주문 단위 티켓 샘플을 확인할 수 있습니다.
- 티켓 상세는 최대 5건까지만 기록합니다.
- 우선순위는 `실패 -> 경고 -> 건너뜀 -> 성공`입니다.
- 현재 적용 대상은 다음 작업들입니다.
  - 배송/송장 수집
  - 결제완료 -> 상품준비중
  - 송장 업로드
  - 송장 수정
- 작업 상태 패널과 작업센터 주요 레이블은 현재 한국어로 정리돼 있습니다.

## 라우트 요약

- `/dashboard`
- `/fulfillment`
- `/cs`
- `/channels`
- `/work-center`
- `/settings`

보조 연결 규칙:
- `/operations` -> `/work-center`
- `/coupang/shipments` -> `/fulfillment`
- `/naver` -> `/channels`
- `/coupang` -> `/channels`
- `/runs` -> `/engine/runs`
- `/drafts/:id` -> `/engine/drafts/:id`

## 이번 스냅샷에서 확인한 파일

- `client/src/App.tsx`
- `client/src/components/operation-toaster.tsx`
- `client/src/lib/workspace-tabs.ts`
- `client/src/lib/coupang-navigation.ts`
- `client/src/pages/dashboard.tsx`
- `client/src/pages/fulfillment.tsx`
- `client/src/pages/cs-hub.tsx`
- `client/src/pages/channels-hub.tsx`
- `client/src/pages/operation-center.tsx`
- `client/src/pages/settings-hub.tsx`
- `client/src/features/coupang/shipments/page.tsx`
- `client/src/features/coupang/shipments/fulfillment-decision.ts`
- `client/src/features/coupang/shipments/fulfillment-filter-summary.ts`
- `client/src/features/coupang/shipments/quick-collect-focus.ts`
- `client/src/features/coupang/shipments/shipment-column-presets.ts`
- `client/src/features/coupang/shipments/shipment-base-filters.tsx`
- `client/src/features/coupang/shipments/shipment-worksheet-overview.tsx`
- `client/src/features/coupang/shipments/shipment-selection-action-bar.tsx`
- `client/src/features/coupang/shipments/shipment-worksheet-panel.tsx`
- `client/src/features/coupang/shipments/shipment-archive-panel.tsx`
- `client/src/features/coupang/shipments/shipment-decision-drawer.tsx`
- `server/services/coupang/shipment-worksheet-service.ts`
- `server/stores/work-data-coupang-shipment-worksheet-store.ts`
- `server/http/coupang/tracked-actions.ts`
- `server/http/handlers/coupang/orders.ts`
- `server/http/handlers/coupang/shipments.ts`
- `shared/coupang.ts`
- `shared/operations.ts`

## 검증

### 통과
- `npm run check`
- `npm run build`
- `npx vitest run client/src/features/coupang/shipments/fulfillment-filter-summary.test.ts client/src/features/coupang/shipments/shipment-column-presets.test.ts client/src/features/coupang/shipments/quick-collect-focus.test.ts`
- `npx vitest run --root . shared/operations.test.ts server/http/coupang/tracked-actions.test.ts server/http/handlers/coupang/shipments.test.ts server/services/coupang/shipment-worksheet-collection.test.ts`
- 로컬 프로덕션 서버 기준 `http://127.0.0.1:5001/fulfillment`, `http://127.0.0.1:5001/work-center` HTTP 200 확인
- Chrome headless fresh profile 스크린샷으로 `출고`, `작업센터`, `작업 상태` 패널의 주요 한국어 레이블 렌더 확인

### 아직 직접 검증하지 못한 것
- 브라우저에서 실제 클릭 기반의 완전한 수동 검증
  - 빠른 수집 후 신규 주문 집중 보기 상호작용
  - 혼합 선택 후 자동 제외 실행
  - 작업센터 상세 패널의 티켓 상세 상호작용

## 남은 이슈

- `client/src/features/coupang/shipments/page.tsx`는 여전히 큰 coordinator 파일입니다.
- 기본 작업 보기의 가로 폭은 프리셋으로 1차 완화했지만, 합성 컬럼 기반 압축은 아직 남아 있습니다.
- 작업센터는 복구 중심 구조로 정리됐지만, 상세 섹션 helper 분리는 아직 하지 않았습니다.
- 빌드 경고는 2건이 남아 있습니다.
  - CSS minify `sourceMappingURL` 경고
  - 메인 청크 크기 경고
