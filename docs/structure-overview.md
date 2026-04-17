# Structure Overview

- 스냅샷 날짜: 2026-04-17
- 목적: 현재 KIKIT SyncDesk가 어떤 top-level 구조와 화면 책임을 가지는지 설명합니다.

## 1. 최상위 구조

```text
client/
  src/
    App.tsx
    pages/
    features/
    components/
    lib/

server/
  index.ts
  routes.ts
  routes/
  application/
  services/
  adapters/

shared/
  coupang.ts
  operations.ts
  schema.ts
  ...공유 계약

docs/
  current-status.md
  change-log.md
  structure-overview.md
  decisions/
  handoffs/
```

## 2. 앱 셸

- 진입점: `client/src/App.tsx`
- 주요 책임:
  - 브랜드 및 상단 주요 메뉴
  - 멀티탭 workspace strip
  - top-level route 전환
  - 작업 상태 패널

### 현재 상단 주요 메뉴
- `대시보드`
- `출고`
- `CS`
- `채널`
- `작업센터`
- `설정`

핵심 원칙:
- NAVER / COUPANG 같은 채널명은 더 이상 top-level 주인공이 아닙니다.
- top-level은 운영 목적 중심입니다.

## 3. 라우트 소유권

| Route | 역할 | 주 구현 파일 |
| --- | --- | --- |
| `/dashboard` | 오늘의 운영 시작점 | `client/src/pages/dashboard.tsx` |
| `/fulfillment` | 출고 판단 + 송장 작업 + 예외 확인 | `client/src/pages/fulfillment.tsx` -> `client/src/features/coupang/shipments/page.tsx` |
| `/cs` | CS 허브 / deep-link 진입 | `client/src/pages/cs-hub.tsx` |
| `/channels` | 채널 연결 및 원본 화면 허브 | `client/src/pages/channels-hub.tsx` |
| `/work-center` | 실패 작업 복구 중심 로그 화면 | `client/src/pages/operation-center.tsx` |
| `/settings` | 설정 및 고급/레거시 도구 허브 | `client/src/pages/settings-hub.tsx` |

### 연결 규칙
- `/operations` -> `/work-center`
- `/coupang/shipments` -> `/fulfillment`
- `/naver` -> `/channels`
- `/coupang` -> `/channels`
- `/runs` -> `/engine/runs`
- `/drafts/:id` -> `/engine/drafts/:id`

## 4. 출고 화면 구조

출고 화면의 구현 중심은 여전히 쿠팡 배송/송장 feature이지만, 화면 위계는 운영 데스크 기준으로 다시 짰고 render/controller 책임도 2차 분리했습니다.

### 출고 실행 파이프라인
- `POST /api/coupang/shipments/collect`
  - 1차 수집만 담당합니다.
  - 범위: 주문 목록 조회, 클레임 병합, worksheet 반영, sync summary 기록
  - `new_only` 빠른 수집은 일부 상태 조회 실패를 `syncSummary.degraded / failedStatuses / autoAuditRecommended`로 남기고, 화면은 후속 누락 audit로 이어집니다.
- `POST /api/coupang/shipments/worksheet/refresh`
  - 후속 보강만 담당합니다.
  - scope:
    - `pending_after_collect`
    - `shipment_boxes`
    - `customer_service`
- `POST /api/coupang/shipments/invoices/upload|update`
  - 서버가 worksheet 전송 상태를 먼저 `pending`으로 기록한 뒤 쿠팡 API를 호출합니다.
  - batch 응답에서 일부 결과가 빠지면 누락된 `shipmentBoxId`만 개별 재시도해 worksheet 최종 상태를 보정합니다.
- `invoice_ready` resolve는 전송 직전 후보 `shipmentBoxId`를 한 번 더 `shipment_boxes` refresh로 재수화해 stale worksheet 상태를 바로잡습니다.
- 같은 bulk resolve는 CS 상태도 전체 worksheet가 아니라 실제 후보 행만 다시 확인하고, `shipment_boxes` refresh 직후 같은 후보를 다시 CS 조회하지 않아 대량 worksheet에서도 `resolve` 단계가 과하게 늘어나지 않도록 줄였습니다.
- resolve 직전의 `shipment_boxes` refresh 결과는 메모리에서만 합쳐 판정하고, resolve 때문에 전체 worksheet를 다시 저장하지 않습니다. 같은 경로에서 상품 상세 재조회도 생략해 전송 후보 판정만 빠르게 끝내도록 했습니다.
- 상단 `송장 전송하기` 버튼은 기본 화면/송장 입력 모드 모두 현재 필터 범위의 전송 가능 행을 기준으로 동작하고, 선택 건만 보내는 경로는 선택 action bar로 분리합니다.
  - 같은 버튼은 stale `availableActions`만으로 시작을 막지 않고, 위 refresh 이후 실제 전송 가능 여부를 다시 확정합니다.
  - `ACCEPT` 상태지만 송장 payload가 이미 들어간 행은 먼저 `markPreparing`으로 자동 처리한 뒤 이어서 송장을 전송합니다.
  - 성공 건은 worksheet patch 단계에서 `DEPARTURE` / `updateInvoice`로 먼저 낙관 반영해 직후 화면이 오래 옛 상태로 남지 않게 합니다.
  - `CS이관` placeholder, 스토어명 오입력 같은 비정상 payload는 클라이언트 후보 계산과 서버 전송 단계에서 모두 제외합니다.
  - `updateInvoice` 경고가 와도 live 상세에 같은 송장번호가 이미 반영돼 있으면 서버가 이를 성공으로 승격해 ambiguous warning을 worksheet 실패로 남기지 않습니다.
- `결제완료 -> 상품준비중`
  - 선행 `수집 누락 audit`와 `prepare_ready resolve`는 유지합니다.
  - 단, audit live 조회가 일시 실패해도 현재 worksheet에서 이미 확인 가능한 prepare 대상은 계속 처리하고, audit 실패는 경고로만 남깁니다.
  - `prepare_ready` resolve도 후보 `shipmentBoxId`를 먼저 `shipment_boxes` refresh로 맞춰 이미 `INSTRUCT`로 바뀐 건을 prepare 대상에서 제외합니다.
  - 성공 후 전체 `incremental collect`를 다시 기다리지 않고, 성공 행을 먼저 낙관 반영한 뒤 `shipment_boxes` scope refresh를 비동기로 붙입니다.

### 현재 출고 화면 계층
1. `page.tsx`
  - 상태, query, action coordinator
  - worksheet query는 짧은 stale window를 두고 mount/focus 자동 refetch를 매번 강제하지 않습니다.
2. `fulfillment-shell.tsx`
   - 페이지 slot 조립
3. `fulfillment-toolbar.tsx`
   - 헤더, 1차 액션, 관리 작업, 기본 필터
4. `fulfillment-summary-bar.tsx`
   - 출고 판단 요약 또는 보관함 메트릭
5. `fulfillment-selection-controller.tsx`
   - 선택 일괄 작업 bar
6. `fulfillment-grid-controller.tsx`
   - 작업 화면 / 보관함 / 화면 설정 전환
   - grid wiring, archive panel, column settings panel lazy mount
7. `fulfillment-drawer-controller.tsx`
   - audit dialog, decision drawer, full detail dialog, excel sort dialog, invoice input dialog lazy mount
8. `quick-collect-focus-controller.ts`
   - 빠른 수집 집중 보기 active sheet / visible rows 재구성

### 출고 필터 위계
- 메인 축:
  - `출고 판단`
- 보조 범위:
  - `작업 대상`
  - `배송 이후`
  - `예외·클레임`
  - `전체`
- 세부 축:
  - `송장 상태`
  - `출력 상태`
  - `주문 상태`

의도:
- 운영자는 먼저 `지금 무엇을 처리해야 하는가`를 본 뒤,
- 그 다음에 `어느 업무 구역인가`,
- 마지막으로 `세부 상태`를 좁히게 합니다.

### 출고 판단 모델
`client/src/features/coupang/shipments/fulfillment-decision.ts`

- `출고 가능`
- `송장 대기`
- `보류`
- `차단`
- `재확인 필요`

대표 사유는 테이블, 요약, Drawer에서 같은 언어로 보여줍니다.

### 빠른 수집 직후 신규 주문 집중 보기
`client/src/features/coupang/shipments/quick-collect-focus.ts`
`client/src/features/coupang/shipments/quick-collect-focus-controller.ts`

- `new_only` 빠른 수집 후 실제로 추가된 주문이 있으면 그 주문만 임시로 먼저 보여줍니다.
- 현재 스토어와 출고 판단 탭은 유지합니다.
- 검색, 범위, 세부 필터는 집중 보기 중에는 우선 적용하지 않습니다.
- 필터 변경, 새로고침, 탭 이동 시 자동 해제됩니다.
- 집중 보기의 active/inactive 전환과 fallback sheet 구성은 controller 단위 테스트로 고정했습니다.

### 컬럼 보기 프리셋
`client/src/features/coupang/shipments/shipment-column-presets.ts`

- `작업 보기`
- `송장 입력 보기`
- `전체 열 보기`

의도:
- 기본 작업 흐름의 가로 스크롤을 줄입니다.
- 기존 persisted 사용자 컬럼 설정은 강제로 바꾸지 않습니다.
- 사용자가 프리셋을 직접 적용할 때만 컬럼 집합/폭이 바뀝니다.

### 출고 supporting modules
- `fulfillment-shell.tsx`
  - 출고 화면 slot 조립
- `fulfillment-toolbar.tsx`
  - 페이지 헤더, 상단 action, 기본 필터
- `fulfillment-summary-bar.tsx`
  - 출고 요약 / 보관함 메트릭 전환
- `fulfillment-selection-controller.tsx`
  - 선택 bar 노출 조건과 action 위임
- `fulfillment-grid-controller.tsx`
  - worksheet/archive/settings branch와 grid wiring
- `fulfillment-drawer-controller.tsx`
  - drawer/dialog lazy mounting
- `shipment-base-filters.tsx`
  - 스토어 / 기간 / 검색 / 보기 범위
- `shipment-worksheet-overview.tsx`
  - 출고 판단 탭, 요약, 현재 적용 조건, 세부 필터
- `shipment-selection-action-bar.tsx`
  - 혼합 선택 요약과 실행 CTA
- `shipment-prepare-flow.ts`
  - prepare 대상 계산, 결과 피드백, 낙관 반영 helper
- `shipment-worksheet-panel.tsx`
  - 작업 화면 카드 shell, 빈 상태, 페이지네이션
- `shipment-archive-panel.tsx`
  - 보관함 카드 shell, 빈 상태, 페이지네이션
- `shipment-decision-drawer.tsx`
  - 출고 판단 우선의 얇은 상세 패널
- `client/src/lib/ops-handoff-links.ts`
  - 출고 / CS / 작업센터 사이의 deep-link build/parse와 operation payload 기반 handoff 문맥 추출
- `server/services/coupang/shipment-worksheet-service.ts`
  - collect 1차 반영과 refresh 후속 보강 분리
  - worksheet 읽기 경로는 CS summary cache를 우선 사용하고, 조회 응답 때문에 worksheet 전체를 다시 저장하지 않습니다.
- `server/stores/work-data-coupang-shipment-worksheet-store.ts`
  - DB 모드 worksheet 저장과 부분 row patch를 트랜잭션으로 처리
- `server/http/handlers/coupang/shipments.ts`
  - collect / worksheet refresh tracked operation 핸들러

## 5. 작업센터 구조

- 구현 파일: `client/src/pages/operation-center.tsx`
- recovery helper: `client/src/pages/operation-center-recovery.ts`
- 상세 section 분리: `client/src/pages/operation-center-operation-detail-sections.tsx`
- 역할:
  - 실패 작업 복구 우선의 작업 로그 화면

### 현재 동작
- `즉시 재시도 / 원인 확인 / 진행 관찰 / 완료` lane을 기준으로 우선 정렬합니다.
- 상단 `복구 묶음`에서 같은 성격 실패를 묶어 보여줍니다.
- 메인 목록은 복구 판단, 영향 범위, 원인 요약을 먼저 읽게 정리합니다.
- 재시도는 목록과 상세 모두에서 접근할 수 있습니다.
- 쿠팡 operation 상세는 payload에서 추출한 storeId / 주문 식별자를 기준으로 `출고`, `CS 허브`로 바로 이어집니다.
- 원본 요청 payload, 정규화 payload, 에러 JSON은 상세 패널의 접힘 섹션에 둡니다.

### 작업 티켓 상세
- 메인 목록에는 보이지 않습니다.
- 상세 패널에서만 `작업 티켓 상세` 섹션을 보여줍니다.
- 상세 패널의 foldout 렌더는 별도 section component로 분리했습니다.
- 최대 5건까지만 기록합니다.
- 우선순위는 `실패 -> 경고 -> 건너뜀 -> 성공`입니다.
- 현재 적용 대상:
  - 배송/송장 수집
  - 상품준비중 처리
  - 송장 업로드
  - 송장 수정

## 6. CS / 채널 / 설정 구조

### CS
- 구현 파일: `client/src/pages/cs-hub.tsx`
- 역할:
  - 채널별 문의/클레임 화면으로 보내는 허브
  - 출고 판단에 영향을 주는 이슈로 이어지는 진입점
- 현재 `/cs?focus=...&source=...` deep-link를 읽어 이번 진입 문맥과 복귀 버튼을 함께 보여줍니다.

### 채널
- 구현 파일: `client/src/pages/channels-hub.tsx`
- section descriptor: `client/src/pages/hub-navigation.ts`
- 역할:
  - 채널 연결 화면
  - 원본 채널 작업 화면 진입
  - 고급/레거시 도구 노출
- 현재 `연결 상태 / 점검`, `원본 화면 진입`, `채널별 주요 도구`, `고급 / 레거시 화면` 순서로 읽히게 정리했습니다.

### 설정
- 구현 파일: `client/src/pages/settings-hub.tsx`
- section descriptor: `client/src/pages/hub-navigation.ts`
- 역할:
  - 연결 설정
  - 초안 / 실행 이력 / 고급 도구 진입
- 현재 `연결 설정`, `운영 고급 도구`, `레거시 / 직접 진입` 순서로 읽히게 정리했습니다.

## 7. 레거시 노출 정책

메인 동선에서 아래 항목은 숨기거나 낮췄습니다.
- `bulk-price`
- `product-edit`
- `grouped products`
- `Draft / Runs` 상위 노출

정책:
- direct URL은 즉시 삭제하지 않습니다.
- 필요 시 `채널` 또는 `설정` 아래에서 접근합니다.
- 메인 top-level 동선에서는 운영 목적 화면이 우선입니다.

## 8. 백엔드 관계

이번 개편은 주로 화면 구조와 operator-facing 정보 위계 변경입니다.

- 대시보드 전용 신규 백엔드는 만들지 않았습니다.
- 기존 API를 재사용합니다.
  - `/api/settings/stores`
  - `/api/coupang/stores`
  - `/api/ui-state`
  - `/api/coupang/shipments/worksheet/view`
  - `/api/logs`
- 빠른 수집 집중 보기와 작업센터 티켓 상세처럼, 기존 계약에 필요한 필드만 최소 확장했습니다.
  - `shared/coupang.ts`
  - `shared/operations.ts`

### 현재 저장 경로
- 실행 프로세스는 Cloud Run에서 뜹니다.
- 운영 상태 저장은 로컬 디스크가 아니라 `DATABASE_URL`이 가리키는 Cloud SQL(Postgres)을 기본 경로로 봅니다.
- `server/storage.ts`는 아래 데이터를 Postgres에 직접 저장합니다.
  - channel catalog sync 결과
  - control draft / draft item
  - execution run / execution item
- `server/stores/work-data-*` 계열은 이미 worksheet, 로그, UI state, 채널 설정 등을 DB 우선으로 저장하고, 일부 레거시 JSON/파일은 1회 import 또는 fallback 용도로만 남아 있습니다.
- 따라서 현재 운영 기준의 권장 구조는 `Cloud Run = 실행`, `Cloud SQL = 상태 저장`, `로컬/attached disk = 레거시 호환 또는 임시 파일`입니다.
- catalog / draft / execution 관련 테이블과 핵심 조회 인덱스는 첫 접근 시 런타임에서 자동 생성되므로, 새 Cloud SQL 인스턴스에서도 앱 부팅 후 저장소 사용 시 자체적으로 기본 구조를 맞춥니다.
- 테스트는 `Vitest` 또는 `FORCE_MEMORY_STORAGE=true`일 때만 in-memory storage를 유지해 실DB 오염을 피합니다.

## 9. 빌드 / 배포 하드닝

- 프론트 build 설정은 `vite.config.ts`에 있습니다.
- 현재 chunk 정책:
  - `vendor-react`
  - `vendor-grid`
  - `vendor-sheet`
  - `route-coupang`
  - `route-naver`
  - `route-engine`
- 목적:
  - 메인 entry chunk를 가볍게 유지
  - 무거운 채널/도구 영역을 별도 chunk로 분리
  - `xlsx`, `react-data-grid` 같은 무거운 의존성을 분리
- Cloud Run 배포 규칙과 smoke check:
  - `docs/deployment/cloud-run-branch-deployments.md`
  - `docs/deployment/cloud-run-smoke-check.md`

## 10. 현재 구조에서 아직 남아 있는 일

- `client/src/features/coupang/shipments/page.tsx`는 여전히 상태/query/action handler가 많은 coordinator 파일입니다.
- render tree와 quick collect view state는 분리됐지만, network action orchestration은 아직 `page.tsx`에 남아 있습니다.
- 출고 그리드는 프리셋으로 1차 완화했지만, 합성 컬럼 기반의 2차 압축은 아직 남아 있습니다.
- 작업센터는 helper와 detail section을 분리했지만, 브라우저 클릭 기반 체감 검증은 아직 하지 않았습니다.
